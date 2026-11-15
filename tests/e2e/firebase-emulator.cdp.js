'use strict';
/* Real-browser integration against the Firebase Emulator Suite: the Customer app in `firebase` mode signs in with a
   phone OTP through the app's own dialog, registers, creates a request through the existing API adapter (callable
   Function), and receives it back in its local read model from the server.
   Run: npm run test:emulators:e2e   (starts the emulators + a static server; needs JAVA_HOME → JDK 21+) */
const { spawn } = require('node:child_process');
const path = require('node:path');
const { connect, driver, setupPage, withBrowser, sleep } = require('./lib/cdp.js');

const ROOT = path.resolve(__dirname, '../..');
const BASE = 'http://127.0.0.1:8099';
const AUTH = 'http://127.0.0.1:9099';
let pass = 0, failed = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('✓ ' + name); } else { failed++; console.log('✗ ' + name); } };

const FN = 'http://127.0.0.1:5001/hansalahlak/me-central1';
const KEY = 'fake-api-key';
const OWNER_EMAIL = (() => { try { const m = /^ADMIN_BOOTSTRAP_EMAILS=([^,\r\n]+)/m.exec(require('fs').readFileSync(require('path').resolve(__dirname, '../../functions/.env'), 'utf8')); if (m) return m[1].trim(); } catch (e) {} return 'owner@example.test'; })();   /* bootstrap email from the git-ignored functions/.env (emulator accounts only); never hardcoded */
async function rest(url, body, headers) {
  const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
async function latestCode(phone) {
  for (let i = 0; i < 30; i++) {
    const r = await rest(`${AUTH}/emulator/v1/projects/hansalahlak/verificationCodes`);
    const c = (r.verificationCodes || []).filter(x => x.phoneNumber === phone).pop();
    if (c) return c.code;
    await sleep(300);
  }
  return null;
}
/** Emulator-only account helpers (Auth emulator REST); return an ID token. */
async function emailAccount(email, password, verify) {
  let r = await rest(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, { email, password, returnSecureToken: true });
  if (!r.idToken) r = await rest(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, { email, password, returnSecureToken: true });
  if (verify) await rest(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/hansalahlak/accounts:update`, { localId: r.localId, emailVerified: true }, { authorization: 'Bearer owner' });
  return (await rest(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, { email, password, returnSecureToken: true })).idToken;
}
async function phoneAccount(phone) {
  const s = await rest(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${KEY}`, { phoneNumber: phone, recaptchaToken: 'emulator' });
  const code = await latestCode(phone);
  return (await rest(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${KEY}`, { sessionInfo: s.sessionInfo, code })).idToken;
}
async function callable(name, data, token) {
  const r = await rest(`${FN}/${name}`, { data }, { authorization: 'Bearer ' + token });
  return r.result || r.error;
}

const server = spawn('python', ['-m', 'http.server', '8099', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });

withBrowser(async ({ wsUrl }) => {
  await sleep(1200);
  const cdp = await connect(wsUrl); const d = driver(cdp, BASE); await setupPage(cdp);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const url = BASE + '/apps/customer/index.html?backend=firebase&emulators=1#/home';
  await cdp.send('Page.navigate', { url: BASE + '/apps/customer/index.html' });
  await d.waitFor('document.readyState==="complete"', 8000);
  await d.evaluate(`sessionStorage.setItem('hs_intro_v1','1'); localStorage.clear(); true`);
  await cdp.send('Page.navigate', { url });
  ok(await d.waitFor('document.readyState==="complete" && typeof HSBackend==="object" && !!HSBackend.lastSync', 20000), 'firebase mode: bridge connected and the first server sync completed');
  ok(await d.evaluate('HSApiClient.mode()==="remote" && HSFirebaseConfig.mode==="firebase"'), 'requests use the remote transport (no silent local fallback)');
  ok(await d.evaluate('MP.db().providers.every(p => !p.demo)'), 'the local read model now comes from the server (no demo providers)');

  await d.evaluate(`window.__auth = HSBackend.verifyCustomer('سارة','01011112222').then(a => (window.__actor = a), e => (window.__err = String(e && e.message))); true`);
  ok(await d.waitFor('!!document.querySelector("dialog input[name=code]")', 15000), 'the OTP dialog opens after the code is sent');
  let code = null;
  for (let i = 0; i < 20 && !code; i++) {
    const r = await (await fetch(`${AUTH}/emulator/v1/projects/hansalahlak/verificationCodes`)).json();
    const c = (r.verificationCodes || []).filter(x => x.phoneNumber === '+201011112222').pop();
    code = c && c.code; if (!code) await sleep(300);
  }
  ok(!!code, 'the Auth emulator issued an SMS code');
  await d.evaluate(`(() => { const i = document.querySelector('dialog input[name=code]'); i.value = '${code}'; document.querySelector('dialog button[value=ok]').click(); return true; })()`);
  ok(await d.waitFor('!!window.__actor || !!window.__err', 15000) && await d.evaluate('window.__actor && window.__actor.role === "customer"'), 'phone verified and customer registered server-side: ' + await d.evaluate('JSON.stringify(window.__actor || window.__err)'));
  ok(await d.evaluate(`JSON.parse(localStorage.getItem('hs_user')||'{}').phone === '01011112222'`), 'the app session reflects the verified identity');
  ok(await d.evaluate('HSCustomerSession.signIn("سارة","01011112222").ok === true'), 'the existing sign-in call now succeeds for the verified phone');

  const created = await d.evaluate(`HSOrdersApi.create({ cat:'electric', serviceName:'إصلاح انقطاع كهرباء', desc:'الكهرباء مقطوعة', gov:'القاهرة', area:'مدينة نصر', addr:'شارع 1' }).then(r => ({ status: r.status, id: r.data && r.data.id }))`);
  ok(created && created.status === 201, 'request created through the existing adapter → callable Function: ' + JSON.stringify(created));
  ok(await d.waitFor(`MP.db().serviceRequests.some(r => r.id === ${JSON.stringify(created && created.id)})`, 15000), 'the server sync delivered the new request into the local read model');
  const list = await d.evaluate(`HSOrdersApi.list().then(r => r.status)`);
  ok(list === 200, 'listing own requests through the backend works');
  const denied = await d.evaluate(`HSApiClient.request('GET','/admin/summary').then(r => r.status)`);
  ok(denied === 403 || denied === 401, 'admin route denied for a customer by the server: ' + denied);
  /* ── Admin app (browser): email sign-in in the app dialog → first owner → workforce through the real page ── */
  await emailAccount(OWNER_EMAIL, 'emulator-only-1', true);                     // owner verified their email (emulator)
  const ADMIN = BASE + '/apps/admin/index.html?backend=firebase&emulators=1';
  await cdp.send('Page.navigate', { url: ADMIN });
  ok(await d.waitFor('typeof HSBackend==="object" && !!HSBackend.lastSync && !!document.getElementById("hs-backend-signin")', 20000), 'admin app: no backend identity → sign-in offered');
  await d.evaluate(`document.getElementById('hs-backend-signin').click(); true`);
  ok(await d.waitFor('!!document.querySelector("dialog input[name=email]")', 8000), 'admin sign-in dialog opens');
  await d.evaluate(`(() => { document.querySelector('dialog input[name=email]').value = ${JSON.stringify(OWNER_EMAIL)}; document.querySelector('dialog input[name=password]').value = 'emulator-only-1'; document.querySelector('dialog button[value=ok]').click(); return true; })()`);
  ok(await d.waitFor('typeof HSBackend==="object" && HSBackend.actor && HSBackend.actor.role==="admin"', 25000), 'verified allow-listed email became the first owner (after reload): ' + await d.evaluate('JSON.stringify(typeof HSBackend==="object" && HSBackend.actor)'));
  ok(await d.evaluate('HSAdminRbac.state.roster.some(e => e.role==="owner" && e.uid)'), 'the Admin roster now comes from the server');
  await d.evaluate(`location.hash = '#/workforce'; true`);
  ok(await d.waitFor('!!document.querySelector("[data-act=details], .hs-grid-search input")', 10000), 'workforce page renders');
  const addBtn = await d.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => /إضافة موظف|دعوة/.test(x.textContent)); if (b) { b.click(); return true; } return false; })()`);
  ok(addBtn && await d.waitFor('!!document.querySelector("#wf-name")', 8000), 'add-employee dialog opens from the page');
  await d.evaluate(`(() => { const s = (q, v) => { const el = document.querySelector(q); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }; s('#wf-name', 'منى سعيد'); s('#wf-email', 'mona@example.com'); s('#wf-dep', 'support'); s('#wf-role', 'support'); document.querySelector('#wf-name').form.requestSubmit(); return true; })()`);
  ok(await d.waitFor('HSAdminRbac.state.roster.some(e => e.email==="mona@example.com" && e.status==="invited")', 15000), 'employee created on the server and reflected in the roster');
  ok(await d.waitFor('document.body.textContent.includes("mona@example.com")', 8000), 'the workforce grid shows the new employee');
  const listed = await d.evaluate(`HSApiClient.request('GET','/admin/employees').then(r => r.ok && r.data.items.some(e => e.email === 'mona@example.com'))`);
  ok(listed === true, 'GET /admin/employees (server) includes the new employee');

  /* ── Provider app (browser): phone OTP in the app dialog → offered request without contact → accept → contact ── */
  const ownerTok = await emailAccount(OWNER_EMAIL, 'emulator-only-1', false);
  const karim = await phoneAccount('+201099998888');
  const reg = await callable('api', { app: 'provider', method: 'POST', path: '/providers/register', body: { name: 'كريم فتحي', phone: '01000000000', type: 'individual', cats: ['electric'], govs: ['القاهرة'], areas: ['مدينة نصر'], years: 5, bio: 'كهربائي منازل بخبرة خمس سنوات.' } }, karim);
  ok(reg && reg.status === 201, 'provider registration (bound to the verified phone)');
  const appr = await callable('api', { app: 'admin', method: 'POST', path: `/admin/providers/${reg.data.id}/status`, body: { status: 'approved' } }, ownerTok);
  const asg = await callable('api', { app: 'admin', method: 'POST', path: `/admin/requests/${created.id}/assign`, body: { providerId: reg.data.id } }, ownerTok);
  ok(appr.ok && asg.ok, 'admin approved the provider and assigned the request');
  await cdp.send('Page.navigate', { url: BASE + '/apps/provider/index.html?backend=firebase&emulators=1' });
  ok(await d.waitFor('typeof HSBackend==="object" && !!HSBackend.lastSync && !!document.getElementById("hs-backend-signin")', 20000), 'provider app: sign-in offered');
  await d.evaluate(`document.getElementById('hs-backend-signin').click(); true`);
  ok(await d.waitFor('!!document.querySelector("dialog input[name=phone]")', 8000), 'provider phone dialog opens');
  await d.evaluate(`(() => { document.querySelector('dialog input[name=phone]').value = '01099998888'; document.querySelector('dialog button[value=ok]').click(); return true; })()`);
  ok(await d.waitFor('!!document.querySelector("dialog input[name=code]")', 15000), 'provider OTP dialog opens');
  const pcode = await latestCode('+201099998888');
  await d.evaluate(`(() => { document.querySelector('dialog input[name=code]').value = '${pcode}'; document.querySelector('dialog button[value=ok]').click(); return true; })()`);
  ok(await d.waitFor('typeof HSBackend==="object" && HSBackend.actor && HSBackend.actor.role==="provider"', 25000), 'provider signed in with the provider role (after reload)');
  ok(await d.waitFor(`MP.db().serviceRequests.some(r => r.id === ${JSON.stringify(created.id)})`, 10000), 'the offered request arrived in the provider read model');
  ok(await d.evaluate(`MP.db().serviceRequests.find(r => r.id === ${JSON.stringify(created.id)}).phone === ''`), 'no customer phone before acceptance');
  ok(await d.waitFor(`document.body.textContent.includes(MP.db().serviceRequests.find(r => r.id === ${JSON.stringify(created.id)}).no)`, 10000), 'the provider workspace shows the request');
  const acc = await d.evaluate(`HSOrdersApi.respond(${JSON.stringify(created.id)}, true).then(r => r.status)`);
  ok(acc === 200, 'accept through the provider adapter → callable');
  ok(await d.waitFor(`(MP.db().serviceRequests.find(r => r.id === ${JSON.stringify(created.id)}) || {}).phone === '01011112222'`, 15000), 'after acceptance the customer contact arrives via the server sync');

  /* ── Admin pages on server data (browser): providers / orders / customers read the real records; actions use real routes ── */
  /* one Firebase Auth session per origin: the provider signs out, then the owner signs in to the Admin app again */
  await d.evaluate('HSBackend.signOut().then(() => true)');
  await cdp.send('Page.navigate', { url: ADMIN + '#/providers' });
  ok(await d.waitFor('!!document.getElementById("hs-backend-signin")', 20000), 'admin app after the provider signed out: sign-in offered');
  await d.evaluate(`document.getElementById('hs-backend-signin').click(); true`);
  await d.waitFor('!!document.querySelector("dialog input[name=email]")', 8000);
  await d.evaluate(`(() => { document.querySelector('dialog input[name=email]').value = ${JSON.stringify(OWNER_EMAIL)}; document.querySelector('dialog input[name=password]').value = 'emulator-only-1'; document.querySelector('dialog button[value=ok]').click(); return true; })()`);
  ok(await d.waitFor('typeof HSBackend==="object" && HSBackend.actor && HSBackend.actor.role==="admin" && !document.querySelector("[data-adm-fb-wait]")', 25000), 'admin shell reopens for the server identity');
  ok(await d.waitFor('document.body.textContent.includes("كريم فتحي") && !document.querySelector("[data-adm-not-connected]")', 12000), 'providers page lists the real registered provider (no fixtures, not gated)');
  await d.evaluate(`location.hash = '#/orders'; true`);
  ok(await d.waitFor(`document.body.textContent.includes(${JSON.stringify(await d.evaluate(`(MP.db().serviceRequests.find(r => r.id === ${JSON.stringify(created.id)}) || {}).no`))})`, 12000), 'orders page lists the real request number');
  const cancelLive = await d.evaluate(`HSAdminLive.status('orders', ${JSON.stringify(created.id)}, 'enroute').then(r => r.status)`);
  ok(cancelLive === 501, 'a transition without a server route is refused, not simulated');
  /* Uber-style pricing through the deployed-shape backend: admin base price → public customer price (default markup 15%) */
  const priced = await d.evaluate(`HSBackend.admin('POST', '/admin/pricing', { key: 'electric/dist-board', base: 200 }).then(r => r.ok && r.data.prices['electric/dist-board'])`);
  ok(priced === 200, 'admin sets a base price on the server');
  const pub = await d.evaluate(`HSApiClient.request('GET', '/pricing').then(r => r.ok && r.data.prices['electric/dist-board'])`);
  ok(pub === 230, 'the public price list shows the customer price (base + default 15% platform share): ' + pub);
  await d.evaluate(`location.hash = '#/customers'; true`);
  ok(await d.waitFor('document.body.textContent.includes("سارة")', 12000), 'customers page lists the real customer');
  await d.evaluate(`location.hash = '#/finance'; true`);
  ok(await d.waitFor('!document.querySelector("[data-adm-not-connected]") && document.body.textContent.length > 200', 8000), 'finance dashboard renders from real transactions (not gated)');
  await d.evaluate(`location.hash = '#/settlements'; true`);
  ok(await d.waitFor('!document.querySelector("[data-adm-not-connected]")', 8000), 'settlements show real provider balances (not gated)');
  await d.evaluate(`location.hash = '#/notifications'; true`);
  ok(await d.waitFor('!!document.querySelector("[data-live-bc]")', 10000), 'notifications page is a live server panel');
  await d.evaluate(`(() => { const f = document.querySelector('[data-live-bc]'); f.audience.value = 'customers'; f.text.value = 'تحديث مهم لعملائنا'; f.requestSubmit(); return true; })()`);
  ok(await d.waitFor('document.body.textContent.includes("تحديث مهم لعملائنا")', 12000), 'an in-app broadcast is sent and listed from the server');
  await d.evaluate(`location.hash = '#/audit'; true`);
  ok(await d.waitFor('document.body.textContent.includes("claimOwner")', 12000), 'the audit log panel shows real server audit entries');
  ok(await d.evaluate('!document.querySelector("[data-adm-not-connected]")'), 'no Admin page is left gated');

  const errs = d.errors.filter(e => !/favicon|ERR_FAILED/.test(e));
  ok(errs.length === 0, 'no console errors: ' + (errs.slice(0, 3).join(' | ') || 'none'));
  await cdp.send('Browser.close').catch(() => {}); cdp.ws.close();
}, { watchdogMs: 180000 }).then(() => {
  server.kill();
  console.log(`\n${pass} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}).catch(e => { server.kill(); console.error(e); process.exit(1); });
