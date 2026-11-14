'use strict';
/* Responsive sweep — real browser via tests/e2e/lib/cdp.js (formerly a Playwright script; Playwright is not a project
   dependency, so it was ported to the existing CDP infrastructure on 2026-11-14 with its original checks kept).
   Covers Customer, Guest, Provider and Admin at 1280/768/430/390/320. On every screen it checks: horizontal overflow,
   clipped text, off-screen controls, covered (unusable) controls, touch targets < 24px on phone widths (WCAG 2.5.8),
   tables wider than their container without a scroll wrapper, and open dialogs/sheets that do not fit the viewport.
   Usage: python -m http.server 8099 --bind 127.0.0.1 ; node tests/e2e/responsive-sweep.cdp.js http://127.0.0.1:8099 */
const { connect, driver, setupPage, withBrowser, reporter, sleep } = require('./lib/cdp.js');

const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, '');
const C = BASE + '/apps/customer/index.html', P = BASE + '/apps/provider/index.html', A = BASE + '/apps/admin/index.html';
const VIEWPORTS = [[1280, 800], [768, 1024], [430, 932], [390, 844], [320, 640]];
const { ok, failures } = reporter();

const LAYOUT = String.raw`(() => {
  const out = [], W = innerWidth, H = innerHeight, phone = W < 768;
  const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden],[inert],[aria-hidden="true"]'); };
  const d = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '') + ' "' + (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24) + '"';
  const scroller = el => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll') return n; } return null; };
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) out.push('horizontal overflow ' + document.documentElement.scrollWidth + '>' + document.documentElement.clientWidth);
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    // clipped text: a text container cuts its content without an ellipsis
    const rr = el.getBoundingClientRect(); if (rr.width <= 1 || rr.height <= 1) continue;   // visually-hidden (sr-only) text is clipped by design
    if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) out.push('clipped text: ' + d(el));
    if (el.tagName === 'TABLE') { const p = el.parentElement; if (el.getBoundingClientRect().width > p.clientWidth + 2 && !scroller(el)) out.push('table wider than container without scroll wrapper: ' + d(el)); }
  }
  for (const el of document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,[role=tab],[role=button]')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    const sc = scroller(el);
    if (!sc && (r.left < -1 || r.right > W + 1)) out.push('off-screen control: ' + d(el));
    if (r.top >= 0 && r.bottom <= H && r.left >= 0 && r.right <= W && !sc) {
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !(el.labels && [...el.labels].some(l => l.contains(hit)))) {
        const hcs = getComputedStyle(hit);
        const chrome = n => { for (; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
        let covered = !(hit.closest('#sheet') && !el.closest('#sheet')) && hcs.pointerEvents !== 'none';
        // Content scrolling under fixed/sticky chrome (top bar, bottom nav) is normal: it only fails if it cannot be
        // scrolled clear of that chrome. Scroll it to the centre, re-test, then restore the scroll position.
        if (covered && chrome(hit) && !chrome(el)) {
          const sx = scrollX, sy = scrollY, inner = [...document.querySelectorAll('*')].filter(n => n.scrollTop).map(n => [n, n.scrollTop]);
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          const r2 = el.getBoundingClientRect(), hit2 = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
          covered = !!hit2 && hit2 !== el && !el.contains(hit2) && !hit2.contains(el) && !(el.labels && [...el.labels].some(l => l.contains(hit2)));
          scrollTo(sx, sy); inner.forEach(([n, t]) => { n.scrollTop = t; });
        }
        if (covered) out.push('covered control: ' + d(el) + ' under ' + d(hit));
      }
    }
    // effective target: an absolutely positioned ::before with negative insets enlarges the clickable area
    const pb = getComputedStyle(el, '::before'); let tw = r.width, th = r.height;
    if (pb.content !== 'none' && pb.position === 'absolute') { const n = v => Math.max(0, -parseFloat(v) || 0); tw += n(pb.left) + n(pb.right); th += n(pb.top) + n(pb.bottom); }
    const inline = el.tagName === 'A' && el.closest('p,li small,small') && !el.matches('.cta,.btn,[class*=btn]');
    if (phone && !inline && el.type !== 'checkbox' && el.type !== 'radio' && (tw < 24 || th < 24)) out.push('touch target < 24px (' + Math.round(tw) + 'x' + Math.round(th) + '): ' + d(el));
  }
  for (const dlg of document.querySelectorAll('#sheet,[role=dialog],dialog[open],.uik-dlg-box,.ord-dlg-box')) {
    if (!vis(dlg)) continue;
    const r = dlg.getBoundingClientRect(), cs = getComputedStyle(dlg);
    if (r.left < -1 || r.right > W + 1) out.push('dialog wider than viewport: ' + d(dlg));
    if (r.height > H + 1 && !['auto', 'scroll'].includes(cs.overflowY)) out.push('dialog taller than viewport without internal scroll: ' + d(dlg));
  }
  return [...new Set(out)];
})()`;

async function run({ exe, wsUrl }) {
  console.log('Browser:', exe);
  const cdp = await connect(wsUrl);
  const { errors, evaluate, waitFor, TAB } = driver(cdp, BASE);
  await setupPage(cdp);
  const fresh = async url => { await cdp.send('Page.navigate', { url: 'about:blank' }); await sleep(100); await cdp.send('Page.navigate', { url }); await waitFor('document.readyState==="complete"', 6000); await sleep(250); };
  const step = async (code, wait = 250) => { await evaluate(`(()=>{${code};return true;})()`); await sleep(wait); };
  const check = async label => { const v = await evaluate(LAYOUT); ok(v.length === 0, `${label}${v.length ? ' — ' + v.slice(0, 4).join(' | ') + (v.length > 4 ? ` (+${v.length - 4})` : '') : ''}`); };

  for (const [w, h] of VIEWPORTS) {
    const tag = `${w}px`;
    errors.length = 0;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });

    /* Guest */
    await fresh(C);
    await step(`localStorage.clear();sessionStorage.clear();sessionStorage.setItem('hs_intro_v1','1');MP.reset();MP.db().settings.autoAssign=false`);
    await fresh(C + '#/home'); await check(`${tag} guest home`);
    await fresh(C + '#/account'); await check(`${tag} guest sign-in form`);
    await fresh(C + '#/orders'); await check(`${tag} guest blocked route → sign-in`);
    // original sweep checks: #app is clipped (not a scroll container) and Tab never enters a closed sheet
    ok(await evaluate('(()=>{const a=document.getElementById("app");return a.scrollWidth<=a.clientWidth||getComputedStyle(a).overflowX==="clip";})()'), `${tag} #app is clipped, not horizontally scrollable`);
    let inSheet = 0; for (let i = 0; i < 40; i++) { await TAB(); if (await evaluate('!!document.activeElement.closest("#sheet")')) inSheet++; }
    ok(inSheet === 0, `${tag} Tab never enters the closed sheet`);

    /* Customer */
    await step(`HSCustomerSession.signIn('سارة','01011112222');const r=MP.createRequest({name:'سارة',phone:'01011112222',cat:'electric',serviceName:'خدمة تجريبية طويلة الاسم لاختبار الالتفاف داخل البطاقة',desc:'عطل',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1',flexible:true});MP.assign(r.id,'p_demo1');MP.respond(r.id,true);MP.confirmTime(r.id,'provider');['enroute','arrived','started'].forEach(s=>MP.advance(r.id,s));MP.createQuote(r.id,{labor:200,note:'ملاحظة'});sessionStorage.setItem('__rid',r.id);MP.addAddress(MP.db().customers[0].id,{label:'البيت',gov:'القاهرة',area:'المعادي',addr:'شارع طويل جدًا لاختبار الالتفاف في بطاقة العنوان'})`);
    await fresh(C + '#/home');
    for (const s of ['home', 'sections', 'search', 'orders', 'account']) { await step(`go('${s}')`); await check(`${tag} customer ${s}`); }
    const screens = {
      'tracking (quote)': `show('tracking', sessionStorage.getItem('__rid'))`,
      'provider profile': `show('providerDetails','p_demo1')`,
      'addresses': `show('addresses')`,
      'address form sheet': `show('addresses');document.querySelector('[data-addr-new]').click()`,
      'support': `show('support')`,
      'support complaint sheet': `show('support');Support.openComplaint()`,
      'rate sheet': `openRateSheet(sessionStorage.getItem('__rid'))`,
      'confirmation sheet': `askSheet({id:'x',kind:'cancel',title:'إلغاء الطلب',text:'تأكيد',reasonLabel:'سبب الإلغاء (اختياري)',confirmLabel:'تأكيد الإلغاء'})`,
      'request wizard': `startRequest()`
    };
    for (const [name, code] of Object.entries(screens)) { await step(`closeSheet(true);${code}`, 350); await check(`${tag} customer ${name}`); }
    await step('closeSheet(true)');

    /* Provider */
    await fresh(P); await step('sessionStorage.removeItem("hs_provider_demo_session")'); await fresh(P + '#/home'); await check(`${tag} provider account picker`);
    await step(`document.querySelector('[data-pv-action="register"]').click()`, 400);
    ok(await evaluate('(()=>{const f=document.querySelector("#pv-register-form [name=name]");const r=f.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()'), `${tag} provider registration form is on screen when opened`);
    await check(`${tag} provider registration form`);
    await step(`sessionStorage.setItem('hs_provider_demo_session','p_demo1')`); await fresh(P + '#/home');
    for (const r of ['home', 'new', 'progress', 'quote', 'schedule', 'done', 'earnings', 'transactions', 'reviews', 'notifications', 'services', 'profile']) { await step(`location.hash='#/${r}'`); await check(`${tag} provider ${r}`); }
    ok(!/Invalid Date/.test(await evaluate('document.body.innerText')), `${tag} provider cards show no «Invalid Date» (flexible request)`);
    await step(`location.hash='#/profile'`); await step(`document.querySelector('[data-pv-action="edit-profile"]').click()`, 400); await check(`${tag} provider profile form`);

    /* Admin */
    await fresh(A); await step('sessionStorage.clear();location.reload()', 900); await check(`${tag} admin account picker`);
    await step(`document.querySelector('[data-adm-login]').click()`, 600);
    await step(`location.hash='#/marketplace'`, 600); await check(`${tag} admin marketplace providers`);
    for (const t of ['orders', 'customers', 'complaints', 'commissions']) { await step(`document.querySelector('[data-mk-tab="${t}"]').click()`); await check(`${tag} admin marketplace ${t}`); }
    for (const r of ['dashboard', 'orders', 'providers', 'customers', 'quotes', 'finance', 'complaints', 'workforce', 'roles', 'permissions', 'audit', 'settings']) {
      await step(`location.hash='#/${r}'`, 600); await check(`${tag} admin ${r}`);
    }
    // original sweep check: status badges in admin tables stay single-word wide
    await step(`location.hash='#/audit'`, 600);
    ok(await evaluate('[...document.querySelectorAll(".hs-badge-t")].every(e=>{const r=e.getBoundingClientRect();return r.height<r.width*1.8||r.width>40;})'), `${tag} admin table badges are not squeezed`);
    ok(errors.length === 0, `${tag} no JS errors or failed local requests${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
  }
  await cdp.send('Browser.close').catch(() => {});
  cdp.ws.close();
  console.log(failures() ? `\n${failures()} check(s) failed` : '\nAll checks passed');
  process.exitCode = failures() ? 1 : 0;
}

withBrowser(run, { watchdogMs: 600000 }).catch(e => { console.error(e); process.exitCode = 2; });
