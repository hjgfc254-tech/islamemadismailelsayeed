'use strict';
/* Real-browser QA for the Admin Center runtime (app.js bootstrap, demo auth/session, router, navigation builder,
   permission guard). Dependency-free (tests/e2e/lib/cdp.js). Not part of `npm test`.
   Usage: python -m http.server 8099 --bind 127.0.0.1 ; node tests/e2e/admin-app.cdp.js http://127.0.0.1:8099 */
const { connect, driver, setupPage, withBrowser, reporter, sleep } = require('./lib/cdp.js');

const BASE = (process.argv[2] || 'http://127.0.0.1:8099').replace(/\/$/, '');
const ENTRY = BASE + '/apps/admin/index.html';
const VIEWPORTS = [[1280, 800], [768, 1024], [430, 932], [390, 844], [320, 640]];
const { ok, failures } = reporter();

async function run({ exe, wsUrl }) {
  console.log('Browser:', exe);
  const cdp = await connect(wsUrl);
  const { errors, evaluate, waitFor, TAB, ENTER, noOverflow } = driver(cdp, BASE);
  await setupPage(cdp);
  const fresh = async url => { await cdp.send('Page.navigate', { url: 'about:blank' }); await sleep(120); await cdp.send('Page.navigate', { url }); await waitFor('document.readyState==="complete"', 6000); await sleep(150); };
  const navIds = () => evaluate('[...document.querySelectorAll("#adm-nav a[data-nav]")].map(a=>a.getAttribute("data-nav"))');

  for (const [w, h] of VIEWPORTS) {
    const tag = `${w}px`;
    errors.length = 0;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
    await fresh(ENTRY);
    await evaluate('sessionStorage.clear(); true');
    await fresh(ENTRY + '#/dashboard');
    ok(await waitFor('!!document.querySelector("#adm-login") && !document.querySelector(".adm-head")'), `${tag} without a demo session the account picker is shown (no shell)`);
    ok(await evaluate('document.title.startsWith("اختيار حساب العرض")'), `${tag} picker title`);
    ok(await evaluate('document.querySelectorAll("[data-adm-login]").length === HSAdminAuth.listDemoAccounts().length && HSAdminAuth.listDemoAccounts().length > 0'), `${tag} picker lists every active demo employee`);
    ok(await noOverflow(), `${tag} picker: no horizontal overflow`);

    // Keyboard sign-in as the owner.
    let reached = false;
    for (let i = 0; i < 12 && !reached; i++) { await TAB(); reached = await evaluate('document.activeElement?.matches("[data-adm-login]")'); }
    ok(reached, `${tag} Tab reaches a demo account`);
    ok(await evaluate('getComputedStyle(document.activeElement).outlineStyle !== "none"'), `${tag} account button focus is visible`);
    const ownerId = await evaluate('HSAdminRbac.state.roster.find(e=>e.role==="owner"&&e.status==="active").id');
    await evaluate(`document.querySelector('[data-adm-login="${ownerId}"]').focus(); true`);
    await ENTER();
    ok(await waitFor('!!document.querySelector(".adm-head") && !!document.querySelector("#adm-content")'), `${tag} Enter signs in and mounts the shell`);
    ok(await waitFor('!document.querySelector("#adm-account").hidden && /تبديل الحساب/.test(document.querySelector("#adm-account").textContent)'), `${tag} header shows the demo account and a switch control`);
    ok(await evaluate('HSAdminRbac.state.actor === "owner"'), `${tag} RBAC actor follows the signed-in employee`);
    const ownerNav = await navIds();
    ok(ownerNav.includes('roles') && ownerNav.includes('permissions') && ownerNav.includes('orders'), `${tag} owner nav includes team & operations pages`);
    ok(await noOverflow(), `${tag} shell: no horizontal overflow`);

    // Extracted modules/* working inside their pages (owner, desktop).
    if (w === 1280) {
      await evaluate('location.hash = "#/roles"; true');
      ok(await waitFor('!!document.querySelector("#adm-content tr[data-row] [data-act=\\"details\\"]")', 5000), `${tag} roles page renders its grid`);
      const customId = await evaluate('HSAdminRbac.state.roles.find(r=>!r.system).id');
      await evaluate(`document.querySelector('#adm-content tr[data-row="${customId}"] [data-act="details"]').click(); true`);
      ok(await waitFor('!!document.querySelector("#rl-preset")'), `${tag} role editor (modules/access-control/role-editor.js) shows the preset picker`);
      await evaluate(`(()=>{const s=document.querySelector('#rl-preset');s.value='view-all';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
      ok(await waitFor('/طُبّق القالب/.test(document.querySelector("#ord-dlg [role=status]")?.textContent||"")'), `${tag} applying a preset announces the change`);
      ok(await evaluate(`Object.keys(HSAdminRbac.MODULES).every(m=>{const c=document.querySelector('#rl-p-'+m+'-view');return c&&c.checked;})`), `${tag} the view-all preset checks every module's view permission`);
      await evaluate('document.querySelector("#ord-dlg [data-ord-close]").click(); true');
      await evaluate('location.hash = "#/permissions"; true');
      ok(await waitFor('!!document.querySelector("#adm-content table.rl-table")'), `${tag} permissions page renders the matrix (permission-matrix.js)`);
      await evaluate('location.hash = "#/audit"; true');
      ok(await waitFor('!!document.querySelector("#adm-content [data-act=\\"open\\"]")', 5000), `${tag} audit page renders with its filters (audit-filters.js)`);
      await evaluate('document.querySelector("#adm-content [data-act=\\"open\\"]").click(); true');
      ok(await waitFor('/تفاصيل الحدث/.test(document.querySelector("#aud-dlg")?.textContent||"")'), `${tag} audit details dialog (audit-details.js) opens`);
      await evaluate('document.querySelector("#aud-dlg [data-ord-close]").click(); true');
      await evaluate('location.hash = "#/workforce"; true');
      ok(await waitFor('document.querySelectorAll("#adm-content tr[data-row]").length > 0', 5000), `${tag} workforce page renders employees (employee-* modules)`);
      ok(await noOverflow(), `${tag} module pages: no horizontal overflow`);
    }

    // Live marketplace operations (shared MP store): approve a provider registered through onboarding.
    const pend = await evaluate(`MP.registerProvider({name:'فني QA ${w}',phone:'0105555${String(w).padStart(4,'0')}',type:'individual',cats:['plumbing'],govs:['الجيزة'],areas:[],years:2,bio:'',docs:''}).id`);
    await evaluate('location.hash = "#/marketplace"; true');
    ok(await waitFor(`!!document.querySelector('#adm-content [data-mk="padmit"][data-id="${pend}"]')`, 5000), `${tag} «تشغيل السوق» lists the pending registration from the shared store`);
    await evaluate(`document.querySelector('#adm-content [data-mk="padmit"][data-id="${pend}"]').focus(); true`); await ENTER();
    ok(await waitFor(`MP.get('providers','${pend}').status==='approved' && /تم قبول مقدم الخدمة/.test(document.querySelector('#mk-live').textContent)`), `${tag} Enter on «قبول التسجيل» approves the provider (announced)`);
    ok(await noOverflow(), `${tag} marketplace page: no horizontal overflow`);

    // Switch account → picker; sign in as a support employee: guarded pages leave the nav and deep links are denied.
    await evaluate('document.querySelector("[data-adm-switch]").click(); true');
    ok(await waitFor('!!document.querySelector("#adm-login")', 6000), `${tag} switch account returns to the picker`);
    const support = await evaluate('(()=>{const e=HSAdminRbac.state.roster.find(x=>x.role==="support"&&x.status==="active");return {id:e.id, roles:HSAdminPermissionGuard.canView("roles",e)};})()');
    await evaluate(`document.querySelector('[data-adm-login="${support.id}"]').click(); true`);
    ok(await waitFor('!!document.querySelector(".adm-head")'), `${tag} support employee signs in`);
    const supportNav = await navIds();
    ok(!support.roles && !supportNav.includes('roles') && !supportNav.includes('permissions'), `${tag} support nav hides pages outside its role (roles/permissions)`);
    ok(supportNav.includes('dashboard'), `${tag} support nav keeps uncatalogued pages (dashboard)`);
    await evaluate('location.hash = "#/roles"; true');
    ok(await waitFor('!!document.querySelector("#adm-content .adm-state.is-denied")'), `${tag} deep link to a guarded page shows the denied state`);
    ok(await evaluate('!document.querySelector("#adm-content [data-role-id], #adm-content table")'), `${tag} denied page renders no page content`);

    // Session survives a fresh load of a deep link in the same tab.
    await fresh(ENTRY + '#/orders');
    ok(await waitFor('!!document.querySelector(".adm-head") && /الطلبات/.test(document.querySelector("#adm-title").textContent)', 6000), `${tag} with a session, a fresh deep link opens the page directly`);

    // Login route hand-off.
    await evaluate('sessionStorage.clear(); true');
    await fresh(BASE + '/apps/admin/login.html');
    ok(await waitFor('/\\/apps\\/admin\\/index\\.html/.test(location.pathname) && !!document.querySelector("#adm-login")', 6000), `${tag} login.html hands off to the account picker`);
    ok(errors.length === 0, `${tag} no JS errors or failed local requests${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
  }
  await cdp.send('Browser.close').catch(() => {});
  cdp.ws.close();
  console.log(failures() ? `\n${failures()} check(s) failed` : '\nAll checks passed');
  process.exitCode = failures() ? 1 : 0;
}

withBrowser(run).catch(e => { console.error(e); process.exitCode = 2; });
