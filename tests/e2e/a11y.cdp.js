'use strict';
/* Real-browser accessibility QA (Customer incl. Guest, Provider, Admin). Dependency-free (tests/e2e/lib/cdp.js).
   Structural + contrast audit (tests/e2e/lib/a11y-audit.js) on critical screens at 1280 and 390 px, plus keyboard
   checks: sheet focus trap, Escape + focus restoration, tablist arrows, visible focus, live regions, reduced motion.
   Not a screen-reader test: no assistive technology is available in this environment (see docs).
   Usage: python -m http.server 8099 --bind 127.0.0.1 ; node tests/e2e/a11y.cdp.js http://127.0.0.1:8099 */
const { connect, driver, setupPage, withBrowser, reporter, sleep } = require('./lib/cdp.js');
const { AUDIT } = require('./lib/a11y-audit.js');

const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, '');
const C = BASE + '/apps/customer/index.html', P = BASE + '/apps/provider/index.html', A = BASE + '/apps/admin/index.html';
const { ok, failures } = reporter();

async function run({ exe, wsUrl }) {
  console.log('Browser:', exe);
  const cdp = await connect(wsUrl);
  const { errors, evaluate, waitFor, TAB, ENTER, ESC, key } = driver(cdp, BASE);
  await setupPage(cdp);
  const fresh = async url => { await cdp.send('Page.navigate', { url: 'about:blank' }); await sleep(100); await cdp.send('Page.navigate', { url }); await waitFor('document.readyState==="complete"', 6000); await sleep(250); };
  const audit = async label => { const v = await evaluate(AUDIT); ok(v.length === 0, `${label}: no accessibility violations${v.length ? ' — ' + v.slice(0, 4).join(' | ') : ''}`); };
  const step = async (code, wait = 200) => { await evaluate(`(()=>{${code};return true;})()`); await sleep(wait); };
  const focusVisible = sel => evaluate(`(()=>{const e=document.activeElement;if(!e||e===document.body)return false;const cs=getComputedStyle(e);return (cs.outlineStyle!=='none'&&parseFloat(cs.outlineWidth)>0)||cs.boxShadow!=='none';})()`);

  for (const [w, h] of [[1280, 800], [390, 844]]) {
    const tag = `${w}px`;
    errors.length = 0;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });

    /* ── Customer (guest first, then a signed-in customer with a quoted request) ── */
    await fresh(C);
    await step(`localStorage.clear();sessionStorage.clear();sessionStorage.setItem('hs_intro_v1','1');localStorage.setItem('hs_onboard_v1','1');MP.reset();MP.db().settings.autoAssign=false`);
    await fresh(C + '#/account');
    await audit(`${tag} guest account / sign-in form`);
    await step(`HSCustomerSession.signIn('سارة','01011112222');const r=MP.createRequest({name:'سارة',phone:'01011112222',cat:'electric',serviceName:'كهرباء',desc:'عطل',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1'});MP.assign(r.id,'p_demo1');MP.respond(r.id,true);MP.confirmTime(r.id,'provider');['enroute','arrived','started'].forEach(s=>MP.advance(r.id,s));MP.createQuote(r.id,{labor:200});window.__rid=r.id;MP.addAddress(MP.db().customers[0].id,{label:'البيت',gov:'القاهرة',area:'المعادي',addr:'ش 9'})`);
    for (const s of ['home', 'sections', 'search', 'orders', 'account']) { await step(`go('${s}')`, 150); await audit(`${tag} customer ${s}`); }
    await step(`state.accountTab='settings';show('account')`); await audit(`${tag} customer account settings`);
    const sheets = {
      'tracking (pending quote)': `show('tracking', window.__rid)`,
      'addresses': `show('addresses')`,
      'support': `show('support')`,
      'support complaint sheet': `show('support');Support.openComplaint()`,
      'support report sheet': `show('support');Support.openReport()`,
      'rate sheet': `openRateSheet(window.__rid)`,
      'complaint sheet': `openComplainSheet(window.__rid)`,
      'cancel confirmation sheet': `askSheet({id:window.__rid,kind:'cancel',title:'إلغاء الطلب',text:'تأكيد',reasonLabel:'سبب الإلغاء (اختياري)',confirmLabel:'تأكيد الإلغاء'})`,
      'wizard start': `startRequest()`
    };
    for (const [name, code] of Object.entries(sheets)) { await step(`closeSheet(true);${code}`, 300); await audit(`${tag} customer ${name}`); }
    await step(`closeSheet(true);show('addresses')`);
    await step(`document.querySelector('[data-addr-new]').click()`, 300); await audit(`${tag} customer address form sheet`);
    await step(`closeSheet(true);show('account');document.querySelector('[data-account-profile-edit]')&&document.querySelector('[data-account-profile-edit]').click()`, 300); await audit(`${tag} customer profile form sheet`);
    await step(`closeSheet(true)`);

    // Keyboard: sheet traps Tab, Escape closes, focus returns to the opener.
    await step(`show('addresses')`);
    await evaluate(`document.querySelector('[data-addr-new]').focus(); true`); await ENTER(); await sleep(350);
    ok(await evaluate('!!document.activeElement && !!document.activeElement.closest("#sheet")'), `${tag} opening the address sheet with Enter moves focus into it`);
    let inside = true;
    for (let i = 0; i < 25; i++) { await TAB(); if (!await evaluate('!!document.activeElement && !!document.activeElement.closest("#sheet")')) { inside = false; break; } }
    ok(inside, `${tag} Tab cycles inside the open sheet (focus trap)`);
    ok(await focusVisible(), `${tag} focused control inside the sheet has a visible focus indicator`);
    await ESC(); await sleep(350);
    ok(await evaluate('!document.querySelector("#app.open") && document.activeElement && document.activeElement.matches("[data-addr-new]")'), `${tag} Escape closes the sheet and returns focus to its opener`);
    ok(await evaluate('(()=>{const t=document.querySelector("#toast");return !!t&&(t.getAttribute("role")==="status"||/polite|assertive/.test(t.getAttribute("aria-live")||""));})()'), `${tag} Customer toast is a live region (status changes announced)`);
    // Reduced motion: transitions/animations are disabled.
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    ok(await evaluate(`(()=>{const els=[document.querySelector('#sheet'),document.querySelector('#tabbar .tab'),document.querySelector('.cta')].filter(Boolean);return els.length>0&&els.every(e=>{const cs=getComputedStyle(e);return cs.transitionDuration.split(',').every(d=>parseFloat(d)<0.01)   /* design-system uses .01ms */&&cs.animationName.split(',').every(n=>n.trim()==='none');});})()`), `${tag} prefers-reduced-motion disables Customer transitions/animations`);
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });

    /* ── Provider ── */
    await fresh(P);
    await step(`sessionStorage.clear()`); await fresh(P); await audit(`${tag} provider account picker`);
    await step(`document.querySelector('[data-pv-action="register"]').click()`, 300); await audit(`${tag} provider registration form`);
    await step(`localStorage.clear();sessionStorage.setItem('hs_provider_demo_session','p_demo1');MP.reset();MP.db().settings.autoAssign=false;const r=MP.createRequest({name:'سارة',phone:'01011112222',cat:'electric',serviceName:'كهرباء',desc:'عطل',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1'});MP.assign(r.id,'p_demo1');MP.respond(r.id,true);MP.confirmTime(r.id,'provider');['enroute','arrived','started'].forEach(s=>MP.advance(r.id,s));sessionStorage.setItem('__rid',r.id)`);
    await fresh(P + '#/home');
    for (const r of ['home', 'new', 'progress', 'profile', 'earnings', 'transactions', 'reviews', 'notifications', 'schedule', 'services']) { await step(`location.hash='#/${r}'`, 250); await audit(`${tag} provider ${r}`); }
    for (const form of ['quote', 'complete', 'free']) {
      await step(`location.hash='#/progress'`, 250);
      await step(`(document.querySelector('[data-pv-action="${form}"]')||{click(){}}).click()`, 250);
      await audit(`${tag} provider ${form} form`);
    }
    await step(`location.hash='#/profile'`, 250); await step(`document.querySelector('[data-pv-action="edit-profile"]').click()`, 250); await audit(`${tag} provider profile form`);
    ok(await evaluate('(()=>{const t=document.querySelector("#provider-toast");return !!t&&(t.getAttribute("role")==="status"||/polite/.test(t.getAttribute("aria-live")||""));})()'), `${tag} Provider toast is a live region`);

    /* ── Admin ── */
    await fresh(A); await step('sessionStorage.clear();location.reload()', 900); await audit(`${tag} admin account picker`);
    await step(`document.querySelector('[data-adm-login]').click()`, 600);
    await step(`location.hash='#/marketplace'`, 600); await audit(`${tag} admin marketplace (providers)`);
    for (const t of ['orders', 'customers', 'complaints', 'commissions']) { await step(`document.querySelector('[data-mk-tab="${t}"]').click()`, 250); await audit(`${tag} admin marketplace ${t}`); }
    await evaluate(`document.querySelector('[data-mk-tab="providers"]').click(); document.querySelector('[data-mk-tab="providers"]').focus(); true`); await sleep(200);
    await key('ArrowLeft', 'ArrowLeft', 37); await sleep(150);
    ok(await evaluate('document.activeElement && document.activeElement.getAttribute("role")==="tab" && document.activeElement.getAttribute("aria-selected")==="true" && document.activeElement.dataset.mkTab!=="providers"'), `${tag} admin marketplace tablist: arrow key moves to and selects the next tab`);
    ok(await focusVisible(), `${tag} admin focused tab has a visible focus indicator`);
    ok(await evaluate('(()=>{const l=document.querySelector("#mk-live");return !!l&&/polite/.test(l.getAttribute("aria-live")||"")||(l&&l.getAttribute("role")==="status");})()'), `${tag} admin marketplace announcements use a live region`);
    for (const r of ['dashboard', 'orders', 'providers', 'workforce', 'roles']) { await step(`location.hash='#/${r}'`, 600); await audit(`${tag} admin ${r}`); }
    ok(errors.length === 0, `${tag} no JS errors or failed local requests${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
  }
  await cdp.send('Browser.close').catch(() => {});
  cdp.ws.close();
  console.log(failures() ? `\n${failures()} check(s) failed` : '\nAll checks passed');
  process.exitCode = failures() ? 1 : 0;
}

withBrowser(run, { watchdogMs: 420000 }).catch(e => { console.error(e); process.exitCode = 2; });
