'use strict';
/* Provider P2 — real-browser QA for the standalone Provider app, with NO dependencies.
   Drives Chromium/Edge over the DevTools Protocol using Node's built-in WebSocket (Node >= 22).
   Not part of `npm test`.

   Usage (project root):
     python -m http.server 8099 --bind 127.0.0.1        # in another terminal / background
     node tests/e2e/provider-standalone.cdp.js http://127.0.0.1:8099
   Env:
     BROWSER=<path to msedge/chrome/chromium>  (default: Edge on Windows, else chromium/chrome on PATH locations)
     QA_SHOTS=<dir>                            (optional: write PNG screenshots per viewport; keep outside the repo)
   Google Fonts are blocked for determinism; a fresh profile is used so the cache-first Service Worker cannot serve stale JS. */
const fs = require('node:fs');
const path = require('node:path');
const { connect, driver, setupPage, withBrowser, reporter, sleep } = require('./lib/cdp.js');

const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, '');
const ENTRY = BASE + '/apps/provider/index.html';
const VIEWPORTS = [[1280, 800], [768, 1024], [430, 932], [390, 844], [320, 640]];
const ROUTES = ['home', 'new', 'accepted', 'progress', 'quote', 'schedule', 'done', 'cancelled', 'reviews', 'transactions', 'earnings', 'services', 'notifications', 'profile'];
const { ok, failures: failureCount } = reporter();

/* Guaranteed teardown + watchdog live in lib/cdp.js withBrowser(). */
const main = () => withBrowser(run);

async function run({ exe, wsUrl }) {
  console.log('Browser:', exe);
  const cdp = await connect(wsUrl);
  const { errors, evaluate, waitFor, TAB, ENTER, ESC, noOverflow } = driver(cdp, BASE);
  await setupPage(cdp);
  const goto = async url => { await cdp.send('Page.navigate', { url }); await waitFor('document.readyState==="complete" && !!document.querySelector("#provider-view")'); await sleep(150); };
  const clipped = () => evaluate(`[...document.querySelectorAll('#provider-view *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<-1)&&!e.closest('[style*="overflow"]');}).slice(0,3).map(e=>e.tagName+'.'+e.className).join(', ')`);
  /* Icons from ic() must be glyph-sized and unfilled; an unstyled SVG renders at container size with a black fill. */
  const badIcons = () => evaluate(`[...document.querySelectorAll('#provider-app svg.i')].filter(s=>{const r=s.getBoundingClientRect();return r.width>48||r.height>48||getComputedStyle(s).fill!=='none';}).length`);
  /* Focus a control; when it is missing, report what is on screen instead of throwing. */
  const focusEl = async (sel, label) => {
    const found = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e)e.focus();return !!e;})()`);
    if (!found) ok(false, `${label}: control ${sel} not rendered — hash ${await evaluate('location.hash')}, view: ${(await evaluate('document.querySelector("#provider-view")?.innerText||""')).replace(/\s+/g, ' ').slice(0, 160)}`);
    return found;
  };

  // G4: the login route hands off to the standalone demo picker.
  await cdp.send('Page.navigate', { url: BASE + '/apps/provider/login.html' });
  ok(await waitFor('/\\/apps\\/provider\\/index\\.html/.test(location.pathname) && !!document.querySelector("#provider-view")', 5000), 'login.html hands off to the standalone Provider entry');

  for (const [w, h] of VIEWPORTS) {
    const tag = `${w}px`;
    errors.length = 0;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
    // Isolate viewports: fresh demo store and no session. Page.navigate to a URL differing only by #fragment is a
    // same-document navigation (no reload), so clear storage and then force a real reload.
    await goto(ENTRY + '#/home');
    await evaluate('localStorage.clear(); sessionStorage.clear(); history.replaceState(null, "", "#/home"); true');
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor('document.readyState==="complete" && !!document.querySelector("#provider-view .pv-account-list")');
    ok(await waitFor('!!document.querySelector(".pv-account-list")'), `${tag} account picker renders`);
    ok(await noOverflow(), `${tag} picker: no horizontal overflow`);
    ok(await badIcons() === 0, `${tag} picker: icons glyph-sized`);
    const navShown = () => evaluate(`getComputedStyle(document.querySelector('#provider-nav')).display !== 'none'`);
    ok(!await navShown(), `${tag} picker: workspace nav is not displayed`);

    // Keyboard: Tab reaches an account button with a visible focus indicator; Enter opens the workspace.
    let reached = false;
    for (let i = 0; i < 15 && !reached; i++) { await TAB(); reached = await evaluate('document.activeElement?.matches(".pv-account")'); }
    ok(reached, `${tag} Tab reaches a demo account button`);
    ok(await evaluate('getComputedStyle(document.activeElement).outlineStyle !== "none"'), `${tag} keyboard focus is visible`);
    await ENTER();
    ok(await waitFor('!document.querySelector("#provider-nav").hidden && !!document.querySelector(".pv-hero")'), `${tag} Enter opens the workspace`);
    ok(await evaluate('document.title.startsWith("الرئيسية |")'), `${tag} title reflects the route`);
    ok(await evaluate('document.activeElement?.id === "provider-view"'), `${tag} focus moves to the main view after sign-in`);

    // Seed one request offered to the selected provider (local demo store only).
    const rid = await evaluate(`(()=>{const id=sessionStorage.getItem('hs_provider_demo_session');MP.db().settings.autoAssign=false;
      const r=MP.createRequest({name:'عميل QA',phone:'01000000009',cat:'electric',serviceId:'s1',serviceName:'فحص لوحة كهرباء — اسم طويل لاختبار الالتفاف داخل البطاقة على الشاشات الصغيرة',desc:'وصف',gov:'القاهرة',area:'مدينة نصر',addr:'شارع 1'});
      MP.assign(r.id,id);return r.id;})()`);

    for (const route of ROUTES) {
      await evaluate(`location.hash='#/${route}'`); await sleep(80);
      const over = await noOverflow(); const clip = await clipped(); const icons = await badIcons();
      ok(over && !clip && icons === 0, `${tag} #/${route}: no overflow/clipping, icons glyph-sized${clip ? ' — ' + clip : ''}${icons ? ` — ${icons} oversized/filled icon(s)` : ''}`);
    }
    await evaluate(`location.hash='#/request/${rid}'`); await sleep(80);
    ok(await evaluate('document.activeElement?.id === "provider-view"'), `${tag} route change focuses the main view`);
    ok(await noOverflow(), `${tag} request details: no horizontal overflow`);

    // Keyboard: reject form opens with focus inside; Escape closes it and returns focus to the opener.
    await evaluate(`location.hash='#/new'`); await sleep(80);
    if (!await focusEl(`[data-pv-action="reject"][data-id="${rid}"]`, `${tag} reject`)) continue;
    await ENTER();
    ok(await waitFor('!!document.querySelector("#pv-reject-form") && !!document.activeElement.closest("#pv-reject-form")'), `${tag} Enter opens reject form with focus inside`);
    ok(await noOverflow(), `${tag} inline form: no horizontal overflow`);
    await ESC();
    ok(await waitFor(`!document.querySelector("#pv-reject-form") && document.activeElement?.matches('[data-pv-action="reject"][data-id="${rid}"]')`), `${tag} Escape closes the form and restores focus`);

    // Keyboard: accept moves to the accepted group and focuses the view.
    if (!await focusEl(`[data-pv-action="accept"][data-id="${rid}"]`, `${tag} accept`)) continue;
    await ENTER();
    ok(await waitFor('location.hash === "#/accepted" && document.activeElement?.id === "provider-view"'), `${tag} Enter on accept routes to accepted and focuses the view`);
    ok(await evaluate(`/تم قبول الطلب/.test(document.querySelector('#provider-toast').textContent)`), `${tag} success is announced in the live region`);
    ok(await evaluate(`(()=>{const t=document.querySelector('#provider-toast'),s=getComputedStyle(t),r=t.getBoundingClientRect();return s.position==='fixed'&&+s.opacity>0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})()`), `${tag} toast is visible, fixed and inside the viewport`);
    ok(await waitFor(`getComputedStyle(document.querySelector('#provider-toast')).opacity==='0'`, 4000), `${tag} toast hides again after its timeout`);
    await evaluate(`location.hash='#/home'`); await sleep(80);
    const avail = `document.querySelector('[data-pv-action="availability"]')`;
    const before = await evaluate(`[${avail}.getAttribute('aria-pressed'),getComputedStyle(${avail}).color]`);
    if (!await focusEl('[data-pv-action="availability"]', `${tag} availability`)) continue;
    await ENTER(); await sleep(80);
    const after = await evaluate(`[${avail}.getAttribute('aria-pressed'),getComputedStyle(${avail}).color,document.activeElement===${avail}]`);
    ok(before[0] !== after[0] && before[1] !== after[1] && after[2], `${tag} availability toggle: aria-pressed and colour change, focus kept`);
    await evaluate(`${avail}.click()`); await sleep(50);

    // G3: typing into the completion form updates the commission/net preview live.
    await evaluate(`MP.confirmTime('${rid}','provider');['enroute','arrived','started'].forEach(s=>MP.advance('${rid}',s));location.hash='#/progress';true`); await sleep(120);
    if (await focusEl(`[data-pv-action="complete"][data-id="${rid}"]`, `${tag} complete`)) {
      await ENTER();
      ok(await waitFor('document.activeElement?.name === "value"'), `${tag} completion form focuses the value field`);
      await cdp.send('Input.insertText', { text: '500' });
      ok(await waitFor(`/صافي مستحقك التجريبي/.test(document.querySelector('#pv-complete-preview')?.textContent||'')`), `${tag} typing a value updates the commission/net preview`);
      ok(await noOverflow(), `${tag} completion form with preview: no horizontal overflow`);
      await ESC();
    }

    // Deep link + reload keeps the demo session and shows the request.
    await evaluate(`location.hash='#/request/${rid}'`); await sleep(80);
    await cdp.send('Page.reload'); await waitFor('document.readyState==="complete"'); await sleep(300);
    ok(await waitFor('/تفاصيل الطلب/.test(document.querySelector("#provider-view")?.textContent||"")'), `${tag} deep link survives reload`);

    if (process.env.QA_SHOTS) {
      fs.mkdirSync(process.env.QA_SHOTS, { recursive: true });
      for (const route of ['home', 'new']) {
        await evaluate(`location.hash='#/${route}'`); await sleep(150);
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(process.env.QA_SHOTS, `provider-${route}-${w}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
    // Free-service flow entry (distinct from quotes) and profile editing.
    await evaluate(`location.hash='#/progress'; true`); await sleep(120);
    if (await focusEl(`[data-pv-action="free"][data-id="${rid}"]`, `${tag} free`)) {
      await ENTER();
      ok(await waitFor('!!document.querySelector("#pv-free-form select[name=reason][required]") && document.activeElement?.name === "reason"'), `${tag} «تنفيذ كخدمة مجانية» opens its own form (reason required, focused)`);
      ok(await noOverflow(), `${tag} free-service form: no horizontal overflow`);
      await ESC();
    }
    await evaluate(`location.hash='#/profile'; true`); await sleep(120);
    if (await focusEl('[data-pv-action="edit-profile"]', `${tag} edit profile`)) {
      await ENTER();
      ok(await waitFor('!!document.querySelector("#pv-profile-form") && document.querySelector("#pv-profile-form [name=name]").value.length > 0'), `${tag} profile editing opens a prefilled form`);
      // The seeded demo provider has no phone; the required field must block saving until a valid one is entered.
      ok(await evaluate(`(()=>{const f=document.querySelector('#pv-profile-form'),p=f.querySelector('[name=phone]');return p.value!=='' || !f.checkValidity();})()`), `${tag} profile form enforces a phone number`);
      await evaluate(`(()=>{const p=document.querySelector('#pv-profile-form [name=phone]');if(!p.value)p.value='01012345678';return true;})()`);
      await evaluate(`(()=>{const n=document.querySelector('#pv-profile-form [name=bio]');n.value='نبذة من اختبار المتصفح';document.querySelector('#pv-profile-form .pv-btn-primary').focus();return true;})()`); await ENTER();
      ok(await waitFor(`/نبذة من اختبار المتصفح/.test(document.querySelector('#provider-view').textContent) && /تم حفظ ملفك/.test(document.querySelector('#provider-toast').textContent)`), `${tag} saving the profile updates it in place`);
      ok(await noOverflow(), `${tag} profile: no horizontal overflow`);
    }

    // G1: demo self-registration from the picker, typed for real, ends on the pending-review gate.
    await evaluate(`document.querySelector('.pv-topbar [data-pv-action="logout"]').click(); true`);
    ok(await waitFor('!!document.querySelector(".pv-account-list")'), `${tag} logout returns to the picker`);
    if (await focusEl('[data-pv-action="register"]', `${tag} register`)) {
      await ENTER();
      ok(await waitFor('!!document.querySelector("#pv-register-form") && document.activeElement?.name === "name"'), `${tag} register form opens with focus on the name field`);
      // Not just inside the viewport: the field must not be covered by the sticky top bar / nav (topmost element at its top edge).
      ok(await waitFor(`(()=>{const f=document.querySelector('#pv-register-form [name="name"]'),r=f.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.left+r.width/2,r.top+3)===f;})()`, 2500), `${tag} register form scrolls the focused field into view, clear of sticky chrome`);
      ok(await noOverflow() && await clipped() === '', `${tag} register form (27 governorates): no overflow/clipping`);
      if (process.env.QA_SHOTS) { const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(process.env.QA_SHOTS, `provider-register-${w}.png`), Buffer.from(shot.data, 'base64')); }
      await cdp.send('Input.insertText', { text: 'مقدم QA' });
      await evaluate(`document.querySelector('#pv-register-form [name="phone"]').focus()`); await cdp.send('Input.insertText', { text: '01012345678' });
      await evaluate(`document.querySelector('#pv-register-form [name="cats"][value="electric"]').click(); document.querySelector('#pv-register-form [name="govs"]').click(); document.querySelector('#pv-register-form .pv-btn-primary').focus(); true`);
      await ENTER();
      ok(await waitFor('/قيد المراجعة/.test(document.querySelector(".pv-gate")?.textContent||"") && document.title.startsWith("حالة الحساب |") && document.activeElement?.id === "provider-view"'), `${tag} registration submits to the pending gate (title + focus)`);
      ok(await evaluate(`MP.db().providers.some(p=>p.name==='مقدم QA'&&p.status==='pending'&&p.phone==='01012345678')`), `${tag} pending provider stored locally`);
      ok(await noOverflow(), `${tag} pending gate: no horizontal overflow`);
      ok(!await navShown(), `${tag} pending gate: workspace nav is not displayed`);
    }

    ok(errors.length === 0, `${tag} no JS errors or failed local requests${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
  }

  await cdp.send('Browser.close').catch(() => {});
  cdp.ws.close();
  const failed = failureCount();
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exitCode = failed ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 2; });
