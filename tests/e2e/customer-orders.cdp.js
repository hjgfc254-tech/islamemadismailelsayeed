'use strict';
/* Phase 5 item 4 — real-browser keyboard/focus QA for Customer Orders → Order Details/Tracking → Back. No dependencies.
   Usage (project root):
     python -m http.server 8099 --bind 127.0.0.1
     node tests/e2e/customer-orders.cdp.js http://127.0.0.1:8099
   Env: BROWSER=<path>, QA_SHOTS=<dir outside the repo>. Not part of `npm test`. */
const fs = require('node:fs');
const path = require('node:path');
const { connect, driver, setupPage, withBrowser, reporter, sleep } = require('./lib/cdp.js');

const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, '');
const ENTRY = BASE + '/apps/customer/index.html';
const VIEWPORTS = [[1280, 800], [768, 1024], [390, 844], [320, 640]];
const { ok, failures } = reporter();

async function run({ exe, wsUrl }) {
  console.log('Browser:', exe);
  const cdp = await connect(wsUrl);
  const { errors, evaluate, waitFor, ENTER, noOverflow } = driver(cdp, BASE);
  await setupPage(cdp);
  const activeIs = sel => evaluate(`!!document.activeElement && document.activeElement.matches(${JSON.stringify(sel)})`);
  const focusEl = async (sel, label) => {
    const found = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e)e.focus();return !!e;})()`);
    if (!found) ok(false, `${label}: ${sel} not rendered — view: ${(await evaluate('document.querySelector("#view")?.innerText||""')).replace(/\s+/g, ' ').slice(0, 140)}`);
    return found;
  };

  for (const [w, h] of VIEWPORTS) {
    const tag = `${w}px`;
    errors.length = 0;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
    // Fresh state each viewport: signed-in demo customer with one request; skip the intro. Reload so the app boots from it.
    await cdp.send('Page.navigate', { url: ENTRY });
    await waitFor('document.readyState==="complete" && typeof MP!=="undefined"');
    const rid = await evaluate(`(()=>{localStorage.clear();sessionStorage.clear();sessionStorage.setItem('hs_intro_v1','1');
      localStorage.setItem('hs_user',JSON.stringify({name:'سارة QA',phone:'01011112222'}));MP.reset();MP.customerFor('سارة QA','01011112222');
      MP.db().settings.autoAssign=false;const r=MP.createRequest({name:'سارة QA',phone:'01011112222',cat:'electric',serviceId:'s1',serviceName:'فحص كهرباء',desc:'وصف',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1'});return r.id;})()`);
    await cdp.send('Page.reload', { ignoreCache: true });
    ok(await waitFor('document.readyState==="complete" && !!document.querySelector("#view .hero")', 6000), `${tag} customer home renders`);
    await sleep(200);

    // Orders via the tab bar with the keyboard; focus stays on the tab (it is outside #view and still connected).
    if (!await focusEl('#tabbar [data-go="orders"]', `${tag} orders tab`)) continue;
    await ENTER();
    ok(await waitFor('!!document.querySelector("#view .order-filter")'), `${tag} Enter on the Orders tab opens Orders`);
    ok(await activeIs('#tabbar [data-go="orders"]'), `${tag} focus stays on the (re-rendered) Orders tab`);
    ok(await noOverflow(), `${tag} orders: no horizontal overflow`);

    // Filter with Enter: the screen re-renders, focus must return to the pressed filter.
    if (await focusEl('[data-order-filter="all"]', `${tag} filter`)) {
      await ENTER();
      ok(await waitFor('document.querySelector(\'[data-order-filter="all"]\')?.getAttribute("aria-pressed")==="true"'), `${tag} filter "all" becomes pressed`);
      ok(await activeIs('[data-order-filter="all"]'), `${tag} focus returns to the pressed filter after re-render`);
    }

    // Open the request with Enter: focus lands on the tracking heading.
    if (!await focusEl(`[data-track="${rid}"]`, `${tag} order card`)) continue;
    await ENTER();
    ok(await waitFor('/متابعة الطلب/.test(document.querySelector("#view .dhead h2")?.textContent||"")'), `${tag} Enter on an order opens tracking`);
    ok(await activeIs('#view .dhead h2'), `${tag} focus moves to the tracking heading`);
    ok(await evaluate('document.querySelectorAll("#view ol.tl [aria-current=\\"step\\"]").length===1'), `${tag} timeline exposes exactly one current step`);
    ok(await noOverflow(), `${tag} tracking: no horizontal overflow`);
    if (process.env.QA_SHOTS) { fs.mkdirSync(process.env.QA_SHOTS, { recursive: true }); const s = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(process.env.QA_SHOTS, `customer-tracking-${w}.png`), Buffer.from(s.data, 'base64')); }

    // A tracking action re-renders the screen: focus must not fall to <body>.
    if (await focusEl(`[data-act="simAdvance"][data-id="${rid}"]`, `${tag} simAdvance`)) {
      const before = await evaluate(`MP.get('serviceRequests','${rid}').status`);
      await ENTER(); await sleep(150);
      ok(await evaluate(`MP.get('serviceRequests','${rid}').status`) !== before, `${tag} Enter on "next status" advances the demo request`);
      ok(await evaluate('document.activeElement && document.activeElement !== document.body'), `${tag} focus is kept on the screen after the action (not <body>)`);
    }

    // Back with Enter: leaves tracking and focus is not lost.
    if (await focusEl('#view [data-back]', `${tag} back`)) {
      await ENTER();
      ok(await waitFor('!/متابعة الطلب/.test(document.querySelector("#view .dhead h2")?.textContent||"")'), `${tag} Enter on Back leaves tracking`);
      ok(await waitFor('document.activeElement && document.activeElement !== document.body'), `${tag} focus is not lost after going back`);
    }
    ok(errors.length === 0, `${tag} no JS errors or failed local requests${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
  }
  await cdp.send('Browser.close').catch(() => {});
  cdp.ws.close();
  console.log(failures() ? `\n${failures()} check(s) failed` : '\nAll checks passed');
  process.exitCode = failures() ? 1 : 0;
}

withBrowser(run).catch(e => { console.error(e); process.exitCode = 2; });
