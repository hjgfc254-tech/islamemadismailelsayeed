'use strict';
/* Real-browser QA for Guest — the restricted mode of the Customer app (apps/guest/guest-policy.js + guest-entry.js
   loaded by apps/customer/index.html). Not a separate application. Dependency-free (tests/e2e/lib/cdp.js).
   Usage: python -m http.server 8099 --bind 127.0.0.1 ; node tests/e2e/guest.cdp.js http://127.0.0.1:8099 */
const { connect, driver, setupPage, withBrowser, reporter, sleep } = require('./lib/cdp.js');

const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, '');
const ENTRY = BASE + '/apps/customer/index.html';
const VIEWPORTS = [[1280, 800], [768, 1024], [430, 932], [390, 844], [320, 640]];
const ADMIN_TRACE = /لوحة الإدارة|مركز الإدارة|apps\/admin|تشغيل السوق|تبديل الدور/;
const { ok, failures } = reporter();

async function run({ exe, wsUrl }) {
  console.log('Browser:', exe);
  const cdp = await connect(wsUrl);
  const { errors, evaluate, waitFor, ENTER, noOverflow } = driver(cdp, BASE);
  await setupPage(cdp);
  const fresh = async url => { await cdp.send('Page.navigate', { url: 'about:blank' }); await sleep(120); await cdp.send('Page.navigate', { url }); await waitFor('document.readyState==="complete" && typeof MP!=="undefined"', 6000); await sleep(200); };
  const viewText = () => evaluate('(document.querySelector("#view")||{}).innerText||""');
  const toastText = () => evaluate('(document.querySelector("#toast")||{}).textContent||""');
  const focusEl = async (sel, label) => {
    const found = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e)e.focus();return !!e;})()`);
    if (!found) ok(false, `${label}: ${sel} not rendered — ${(await viewText()).replace(/\s+/g, ' ').slice(0, 120)}`);
    return found;
  };
  const api = (expr) => evaluate(`(async()=>{const r=await ${expr};return {ok:r.ok,status:r.status,code:r.error&&r.error.code};})()`);

  for (const [w, h] of VIEWPORTS) {
    const tag = `${w}px`;
    errors.length = 0;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
    // A brand-new visitor: no demo identity, intro skipped, seeded marketplace with one request of ANOTHER customer.
    await fresh(ENTRY);
    const foreign = await evaluate(`(()=>{localStorage.clear();sessionStorage.clear();sessionStorage.setItem('hs_intro_v1','1');MP.reset();MP.db().settings.autoAssign=false;
      return MP.createRequest({name:'عميل آخر',phone:'01055550000',cat:'electric',serviceName:'كهرباء',desc:'x',gov:'القاهرة',area:'مدينة نصر',addr:'ش 1'}).id;})()`);
    await fresh(ENTRY + '#/home');

    // 1. Entry + public navigation
    ok(await evaluate('HSCustomerSession.current()===null && !localStorage.getItem("hs_user")'), `${tag} visitor has no demo identity (guest)`);
    ok(await waitFor('!!document.querySelector("#view .screen")'), `${tag} guest lands on the Customer home`);
    ok(!ADMIN_TRACE.test(await evaluate('document.body.innerText')), `${tag} no Admin text or role switching anywhere on the page`);
    ok(await evaluate('!!document.querySelector(\'a[href="../provider/index.html#/join"]\') && !document.querySelector(\'a[href*="admin"]\')'), `${tag} only the provider onboarding invitation is offered (no Admin/Provider management link)`);
    ok(await noOverflow(), `${tag} home: no horizontal overflow`);
    for (const tab of ['sections', 'search', 'account']) {
      if (await focusEl(`#tabbar [data-go="${tab}"]`, `${tag} tab ${tab}`)) {
        await ENTER(); await sleep(150);
        ok(await evaluate(`!!document.querySelector('#tabbar [data-go="${tab}"][aria-current="page"]')`), `${tag} Enter on the «${tab}» tab opens it (aria-current)`);
        ok(await noOverflow(), `${tag} ${tab}: no horizontal overflow`);
      }
    }
    ok(/سجّل|الاسم/.test(await viewText()) && await evaluate('!!document.querySelector("#loginFormAcc label[for=account-login-name]")'), `${tag} account tab shows the labelled demo sign-in form to a guest`);
    const pid = await evaluate('MP.db().providers.find(p=>p.status==="approved").id');
    await fresh(ENTRY + '#/provider/' + pid);
    ok(await waitFor('/التقييمات/.test((document.querySelector("#view")||{}).innerText||"")'), `${tag} public provider profile opens by deep link`);
    ok(await noOverflow(), `${tag} provider profile: no horizontal overflow`);

    // 2. Restricted Customer routes
    await fresh(ENTRY + '#/orders');
    ok(await waitFor('!!document.querySelector("#loginFormAcc")') && /سجّل الدخول/.test(await toastText()), `${tag} #/orders sends the guest to sign-in (no orders list)`);
    ok(await evaluate('sessionStorage.getItem("hs_return_to")==="#/orders"'), `${tag} the requested link is remembered for after sign-in`);
    await fresh(ENTRY + '#/track/' + foreign);
    ok(await waitFor('!!document.querySelector("#loginFormAcc")') && !/كهرباء — ش 1/.test(await viewText()), `${tag} a guest cannot open another customer's tracking link`);

    // 3. Blocked protected operations at the API boundary (no actor → 401) and in the UI
    ok((await api('HSOrdersApi.list()')).status === 401, `${tag} guest: GET /requests → 401`);
    ok((await api(`HSOrdersApi.create({cat:'electric',serviceName:'x',gov:'القاهرة',addr:'ش'})`)).status === 401, `${tag} guest: creating a request without identity → 401`);
    ok((await api(`HSQuotesApi.approve('${foreign}')`)).status === 401, `${tag} guest: approving a quote → 401`);
    // Admin code is not even shipped to the Customer app: no Admin adapter, and /admin/* routes do not exist here (404).
    ok(await evaluate('typeof HSAdminApi==="undefined" && typeof HSFinanceApi==="undefined"') && (await api("HSApiClient.get('/admin/summary')")).status === 404, `${tag} guest: no Admin adapter or route exists in the Customer bundle`);
    ok((await api(`HSOrdersApi.advance('${foreign}','enroute')`)).status === 401, `${tag} guest: Provider-only transitions → 401`);
    await fresh(ENTRY + '#/provider/' + pid);
    if (await evaluate('!!document.querySelector("[data-fav-provider]")')) {
      await evaluate('document.querySelector("[data-fav-provider]").focus(); true'); await ENTER(); await sleep(150);
      ok(/سجّل/.test(await toastText()) && await evaluate('MP.db().favorites.length===0'), `${tag} favourite as guest is refused with a sign-in prompt (nothing stored)`);
    }

    // 4. Guest → Customer transition via the sign-in form, returning to the remembered link
    await fresh(ENTRY + '#/orders');
    await waitFor('!!document.querySelector("#loginFormAcc")');
    await evaluate(`(()=>{document.querySelector('#account-login-name').value='زائر جديد';document.querySelector('#account-login-phone').value='01033334444';document.querySelector('#loginFormAcc [type=submit],#loginFormAcc button:not([type=button])').focus();return true;})()`);
    await ENTER();
    ok(await waitFor('!!HSCustomerSession.current() && /طلباتي|طلبات/.test((document.querySelector("#view")||{}).innerText||"")'), `${tag} signing in turns the guest into a customer and returns to #/orders`);
    ok(await waitFor('!!document.querySelector("#view .empty, #view [class*=empty]")'), `${tag} a new customer sees the orders empty state`);
    ok((await api('HSOrdersApi.list()')).status === 200, `${tag} after sign-in the customer actor is accepted (GET /requests → 200)`);
    ok((await api(`HSOrdersApi.get('${foreign}')`)).status === 404, `${tag} still cannot read another customer's request (404)`);
    ok(await noOverflow(), `${tag} orders (empty): no horizontal overflow`);

    // 5. Failure state: a failing transport surfaces an error message instead of a fake success
    await evaluate(`HSApiClient.setTransport(async()=>{throw new Error('الخدمة غير متاحة (اختبار)');}); true`);
    await fresh(ENTRY + '#/provider/' + pid);
    await evaluate(`HSApiClient.setTransport(async()=>{throw new Error('الخدمة غير متاحة (اختبار)');}); true`);
    if (await evaluate('!!document.querySelector("[data-fav-provider]")')) {
      await evaluate('document.querySelector("[data-fav-provider]").focus(); true'); await ENTER(); await sleep(200);
      ok(/غير متاحة/.test(await toastText()) && await evaluate('MP.db().favorites.length===0'), `${tag} a failed request shows the error and changes nothing`);
    }
    await evaluate('HSApiClient.setTransport(null); true');

    // 6. Sign out → back to guest restrictions
    await fresh(ENTRY + '#/account');
    if (await focusEl('[data-account-tab="settings"]', `${tag} settings tab`)) { await ENTER(); await sleep(150); }
    if (await focusEl('[data-account-logout]', `${tag} logout`)) {
      await ENTER(); await sleep(150);
      ok(await waitFor('!!document.querySelector("#askForm") && document.activeElement && document.activeElement.closest("#sheet")'), `${tag} logout asks for confirmation in the focus-managed sheet`);
      await evaluate('document.querySelector("#askForm [type=submit]").focus(); true'); await ENTER(); await sleep(150);
      ok(await evaluate('HSCustomerSession.current()===null'), `${tag} sign-out returns to guest mode`);
      ok((await api('HSOrdersApi.list()')).status === 401, `${tag} after sign-out the API refuses customer routes again`);
    }
    ok(errors.length === 0, `${tag} no JS errors or failed local requests${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
  }
  await cdp.send('Browser.close').catch(() => {});
  cdp.ws.close();
  console.log(failures() ? `\n${failures()} check(s) failed` : '\nAll checks passed');
  process.exitCode = failures() ? 1 : 0;
}

withBrowser(run).catch(e => { console.error(e); process.exitCode = 2; });
