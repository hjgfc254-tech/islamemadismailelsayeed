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
  // Deep links (customer-router + guest-policy/guest-entry + customer-session), real browser at 390px.
  {
    const tag = 'deep-link';
    errors.length = 0;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Page.navigate', { url: ENTRY });
    await waitFor('document.readyState==="complete" && typeof MP!=="undefined"');
    const rid = await evaluate(`(()=>{localStorage.clear();sessionStorage.clear();sessionStorage.setItem('hs_intro_v1','1');MP.reset();
      MP.customerFor('سارة QA','01011112222');MP.db().settings.autoAssign=false;
      return MP.createRequest({name:'سارة QA',phone:'01011112222',cat:'electric',serviceId:'s1',serviceName:'فحص كهرباء',desc:'وصف',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1'}).id;})()`);
    // Guest opens a tracking link → sign-in screen, then types credentials and is returned to the request.
    await cdp.send('Page.navigate', { url: `${ENTRY}#/track/${rid}` });
    await sleep(100); await cdp.send('Page.reload', { ignoreCache: true });
    ok(await waitFor('!!document.querySelector("#loginFormAcc")', 6000), `${tag} guest tracking link shows the sign-in form`);
    ok(await evaluate(`sessionStorage.getItem('hs_return_to') === '#/track/${rid}'`), `${tag} the requested link is remembered`);
    await evaluate(`document.querySelector('#loginFormAcc [name="name"]').focus()`); await cdp.send('Input.insertText', { text: 'سارة QA' });
    await evaluate(`document.querySelector('#loginFormAcc [name="phone"]').focus()`); await cdp.send('Input.insertText', { text: '01011112222' });
    await ENTER();
    ok(await waitFor('/متابعة الطلب/.test(document.querySelector("#view .dhead h2")?.textContent||"")'), `${tag} after sign-in the user lands on the requested tracking page`);
    ok(await evaluate(`location.hash === '#/track/${rid}'`), `${tag} URL shows #/track/<id>`);
    // Address-bar edit → hashchange navigation; URL follows in-app navigation.
    await evaluate(`location.hash = '#/orders'`);
    ok(await waitFor('!!document.querySelector("#view .order-filter")'), `${tag} editing the hash to #/orders opens Orders`);
    await evaluate(`document.querySelector('#tabbar [data-go="account"]').click(); true`);
    ok(await waitFor(`location.hash === '#/account'`), `${tag} URL follows in-app tab navigation`);
    // Signed-in deep link on a fresh load.
    await cdp.send('Page.navigate', { url: `${ENTRY}#/orders` }); await sleep(100); await cdp.send('Page.reload', { ignoreCache: true });
    ok(await waitFor('!!document.querySelector("#view .order-filter")', 6000), `${tag} signed-in reload of #/orders opens Orders`);
    // request-create route: opens the existing wizard preselected at the problem step; provider deep link uses providers.page.js.
    // Fresh document loads (via about:blank): Page.navigate to a fragment-only change is same-document and the router rewrites the URL.
    const freshLoad = async url => { await cdp.send('Page.navigate', { url: 'about:blank' }); await sleep(150); await cdp.send('Page.navigate', { url }); await waitFor('document.readyState==="complete"', 6000); };
    await freshLoad(`${ENTRY}#/request/${encodeURIComponent('appliances/ac/no-cooling')}`);
    ok(await waitFor('typeof WZ!=="undefined" && WZ && WZ.step===3 && WZ.problem==="appliances/ac/no-cooling"', 6000), `${tag} #/request/<problem> opens the wizard at the problem step`);
    ok(await waitFor('!!document.querySelector("#view [data-wz-heading]")'), `${tag} wizard screen is rendered`);
    ok(await evaluate(`location.hash === '#/request'`), `${tag} URL mirrors the wizard route`);
    ok(await noOverflow(), `${tag} wizard: no horizontal overflow`);
    // Same-document address-bar edit while the wizard is open: Chromium fires popstate before hashchange (regression check).
    await evaluate(`location.hash='#/provider/p_demo1'; true`);
    ok(await waitFor('/تفاصيل مقدم الخدمة/.test(document.querySelector("#view .dhead h2")?.textContent||"")'), `${tag} editing the hash from the open wizard opens the typed provider link`);
    await freshLoad(`${ENTRY}#/provider/p_demo1`);
    ok(await waitFor('/تفاصيل مقدم الخدمة/.test(document.querySelector("#view .dhead h2")?.textContent||"") && !!document.querySelector("#view .provider-hero")', 6000), `${tag} #/provider/<id> renders provider details`);
    ok(await noOverflow(), `${tag} provider details: no horizontal overflow`);
    ok(errors.length === 0, `${tag} no JS errors or failed local requests${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
  }

  await cdp.send('Browser.close').catch(() => {});
  cdp.ws.close();
  console.log(failures() ? `\n${failures()} check(s) failed` : '\nAll checks passed');
  process.exitCode = failures() ? 1 : 0;
}

withBrowser(run).catch(e => { console.error(e); process.exitCode = 2; });
