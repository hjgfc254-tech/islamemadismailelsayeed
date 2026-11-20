'use strict';
/* Firebase Emulator Suite integration (real Auth tokens, deployed-shape callable Functions, Firestore + RTDB emulators
   with the project's security rules). Run with:  npm run test:emulators
   (wraps: firebase emulators:exec --only auth,functions,firestore,database "node --test tests/emulator/") */
const test = require('node:test');
const assert = require('node:assert/strict');

const P = 'hansalahlak';
const AUTH = 'http://127.0.0.1:9099', FN = `http://127.0.0.1:5001/${P}/me-central1`, FS = 'http://127.0.0.1:8080', DB = 'http://127.0.0.1:9000';
const RTDB_NS = `${P}-default-rtdb`;
const KEY = 'fake-api-key';
const OWNER_EMAIL = (() => { try { const m = /^ADMIN_BOOTSTRAP_EMAILS=([^,\r\n]+)/m.exec(require('fs').readFileSync(require('path').resolve(__dirname, '../../functions/.env'), 'utf8')); if (m) return m[1].trim(); } catch (e) {} return 'owner@example.test'; })();   /* bootstrap email from the git-ignored functions/.env (emulator accounts only); never hardcoded */

async function j(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}
async function phoneToken(phone) {
  const send = await j(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${KEY}`, { method: 'POST', body: JSON.stringify({ phoneNumber: phone, recaptchaToken: 'emulator' }) });
  assert.equal(send.status, 200, JSON.stringify(send.body));
  const codes = await j(`${AUTH}/emulator/v1/projects/${P}/verificationCodes`);
  const code = codes.body.verificationCodes.filter(c => c.phoneNumber === phone).pop().code;
  const s = await j(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${KEY}`, { method: 'POST', body: JSON.stringify({ sessionInfo: send.body.sessionInfo, code }) });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  return { token: s.body.idToken, uid: s.body.localId };
}
async function emailToken(email, password, verify) {
  let r = await j(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, { method: 'POST', body: JSON.stringify({ email, password, returnSecureToken: true }) });
  if (r.status !== 200) r = await j(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, { method: 'POST', body: JSON.stringify({ email, password, returnSecureToken: true }) });
  if (verify) {
    await j(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${P}/accounts:update`, { method: 'POST', headers: { authorization: 'Bearer owner' }, body: JSON.stringify({ localId: r.body.localId, emailVerified: true }) });
    r = await j(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, { method: 'POST', body: JSON.stringify({ email, password, returnSecureToken: true }) });
  }
  return { token: r.body.idToken, uid: r.body.localId };
}
async function callable(name, data, token) {
  const r = await j(`${FN}/${name}`, { method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {}, body: JSON.stringify({ data }) });
  if (r.body && r.body.error) { const e = new Error(r.body.error.message); e.status = r.body.error.status; throw e; }
  return r.body.result;
}
const api = (u, app, method, path, body, query) => callable('api', { app, method, path, body, query }, u && u.token);
const REQ = { cat: 'electric', serviceName: 'إصلاح انقطاع كهرباء', desc: 'الكهرباء مقطوعة في المطبخ', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع 1' };
const FORM = { name: 'كريم فتحي', phone: '01000000000', type: 'individual', cats: ['electric'], govs: ['القاهرة'], areas: ['مدينة نصر'], years: 5, bio: 'كهربائي منازل بخبرة خمس سنوات.' };

test('emulator: real Auth → callable Functions → Firestore → RTDB signals, with the project rules', async () => {
  const sara = await phoneToken('+201011112222');
  const karim = await phoneToken('+201099998888');

  /* first owner: unverified email refused, verified allow-listed email accepted, idempotent */
  const unverified = await emailToken('someone@example.com', 'secret123', false);
  await assert.rejects(callable('session', { op: 'claimOwner' }, unverified.token), /verified email/);
  const owner = await emailToken(OWNER_EMAIL, 'emulator-only-1', true);
  assert.equal((await callable('session', { op: 'claimOwner', name: 'Owner' }, owner.token)).ok, true);
  assert.equal((await callable('session', { op: 'claimOwner', name: 'Owner' }, owner.token)).replay, true, 'claiming twice is idempotent');
  /* third factor: the owner sets the 8-digit access code before any admin call (functions/src/admin-code.js) */
  const gate = await callable('session', { op: 'sync', app: 'admin' }, owner.token);
  assert.equal(gate.actor, null); assert.equal(gate.adminGate.needsCode, true);
  assert.equal((await callable('session', { op: 'adminCode', action: 'set', code: '24681357' }, owner.token)).ok, true);

  /* registration creates the customer document on first write */
  const reg = await callable('session', { op: 'registerCustomer', name: 'سارة' }, sara.token);
  assert.equal(reg.actor.role, 'customer');
  const created = await api(sara, 'customer', 'POST', '/requests', REQ);
  assert.equal(created.status, 201, JSON.stringify(created.error));
  const id = created.data.id;

  /* provider onboarding → approval → full lifecycle */
  const pr = await api(karim, 'provider', 'POST', '/providers/register', FORM);
  assert.equal(pr.status, 201, JSON.stringify(pr.error));
  assert.equal((await api(karim, 'provider', 'GET', '/providers/me')).status, 401, 'pending registration has no provider role');
  assert.equal((await api(owner, 'admin', 'POST', `/admin/providers/${pr.data.id}/status`, { status: 'approved' })).ok, true);
  assert.equal((await api(owner, 'admin', 'POST', `/admin/requests/${id}/assign`, { providerId: pr.data.id })).ok, true);
  const offered = await api(karim, 'provider', 'GET', `/requests/${id}`);
  assert.equal(offered.data.phone, '', 'no customer phone before acceptance');
  for (const [u, app, p, b] of [[karim, 'provider', 'respond', { accept: true }], [karim, 'provider', 'schedule', { at: '2026-11-20T10:00' }], [sara, 'customer', 'schedule', {}],
    [karim, 'provider', 'advance', { to: 'enroute' }], [karim, 'provider', 'advance', { to: 'arrived' }], [karim, 'provider', 'advance', { to: 'started' }],
    [karim, 'provider', 'quotes', { labor: 300, parts: 50 }], [sara, 'customer', 'quote/approve', {}], [karim, 'provider', 'complete', {}], [sara, 'customer', 'close', {}]]) {
    const r = await api(u, app, 'POST', `/requests/${id}/${p}`, b);
    assert.equal(r.ok, true, `${p}: ${JSON.stringify(r.error)}`);
  }
  assert.equal((await api(sara, 'customer', 'POST', `/requests/${id}/review`, { stars: 5 })).status, 201);
  const summary = await api(owner, 'admin', 'GET', '/admin/summary');
  assert.equal(summary.data.requests, 1, 'aggregation count from the Firestore emulator');

  /* authorization failures */
  const omar = await phoneToken('+201022223333');
  await callable('session', { op: 'registerCustomer', name: 'عمر' }, omar.token);
  assert.equal((await api(omar, 'customer', 'GET', `/requests/${id}`)).status, 404, 'no cross-customer access');
  assert.equal((await api(sara, 'admin', 'GET', '/admin/summary')).status, 401, 'customer token is not admin');

  /* security rules: no direct client Firestore access; RTDB signal readable only by its owner */
  const direct = await j(`${FS}/v1/projects/${P}/databases/(default)/documents/requests/${id}`, { headers: { authorization: 'Bearer ' + sara.token } });
  assert.equal(direct.status, 403, 'Firestore rules deny direct client reads');
  const own = await j(`${DB}/signals/${sara.uid}.json?ns=${RTDB_NS}&auth=${sara.token}`);
  assert.equal(own.status, 200, 'own change signal readable');
  assert.ok(own.body && own.body.at, 'Functions wrote a change signal for the customer');
  const other = await j(`${DB}/signals/${karim.uid}.json?ns=${RTDB_NS}&auth=${sara.token}`);
  assert.equal(other.status, 401, 'another user’s signal is denied');
  const write = await j(`${DB}/signals/${sara.uid}.json?ns=${RTDB_NS}&auth=${sara.token}`, { method: 'PUT', body: JSON.stringify({ at: 1 }) });
  assert.equal(write.status, 401, 'clients cannot write signals');
  const pub = await j(`${DB}/public/content.json?ns=${RTDB_NS}`);
  assert.equal(pub.status, 200, 'the public content version is readable without sign-in');
  const pubWrite = await j(`${DB}/public/content.json?ns=${RTDB_NS}&auth=${sara.token}`, { method: 'PUT', body: JSON.stringify({ v: 999 }) });
  assert.equal(pubWrite.status, 401, 'clients cannot write the public content version');
  const pubOther = await j(`${DB}/public.json?ns=${RTDB_NS}`);
  assert.equal(pubOther.status, 401, 'nothing else under /public is readable');
});

test('emulator: concurrent creates keep unique request numbers (transactional counter)', async () => {
  const u = await phoneToken('+201055554444');
  await callable('session', { op: 'registerCustomer', name: 'منى' }, u.token);
  const results = await Promise.all([1, 2, 3, 4, 5].map(i => api(u, 'customer', 'POST', '/requests', { ...REQ, desc: 'متزامن ' + i })));
  for (const r of results) assert.equal(r.status, 201, JSON.stringify(r.error));
  const nos = results.map(r => r.data.no);
  assert.equal(new Set(nos).size, nos.length, 'no duplicate HS numbers under concurrency: ' + nos.join(','));
});

test('emulator: browser-data migration — owner only, dry run writes nothing, re-import adds nothing, demo data skipped', async () => {
  const owner = await emailToken(OWNER_EMAIL, 'emulator-only-1', true);
  await callable('session', { op: 'claimOwner', name: 'Owner' }, owner.token);
  /* the owner may already have a code from an earlier test in this emulator run: unlock, else set it */
  const g3 = await callable('session', { op: 'sync', app: 'admin' }, owner.token);
  if (g3.adminGate) await callable('session', { op: 'adminCode', action: g3.adminGate.hasCode ? 'unlock' : 'set', code: '24681357' }, owner.token);
  const local = { v: 2, meta: { lastReqNo: 1500 },
    customers: [{ id: 'c_legacy1', name: 'عميل قديم', phone: '01066667777', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }],
    providers: [{ id: 'p_demo1', name: 'تجريبي', demo: true, status: 'approved', cats: ['electric'], govs: ['القاهرة'] }],
    serviceRequests: [{ id: 'r_legacy1', no: 'HS-2026-1500', customerId: 'c_legacy1', status: 'closed', history: [], createdAt: '2026-01-02T00:00:00.000Z' }],
    favorites: [{ customerId: 'c_legacy1', kind: 'service', refId: 'electric:0' }] };
  const outsider = await phoneToken('+201088887777');
  await assert.rejects(callable('session', { op: 'importLocal', db: local }, outsider.token), /owner only/);
  const dry = await callable('session', { op: 'importLocal', db: local, dryRun: true }, owner.token);
  assert.equal(dry.report.added.customers, 1);
  assert.equal(dry.report.skippedDemo.providers, 1);
  const before = await j(`${FS}/v1/projects/${P}/databases/(default)/documents/customers/c_legacy1`, { headers: { authorization: 'Bearer owner' } });
  assert.equal(before.status, 404, 'dry run wrote nothing');
  const real = await callable('session', { op: 'importLocal', db: local }, owner.token);
  assert.equal(real.report.added.serviceRequests, 1);
  const after = await j(`${FS}/v1/projects/${P}/databases/(default)/documents/requests/r_legacy1`, { headers: { authorization: 'Bearer owner' } });
  assert.equal(after.status, 200, 'imported request exists with its original id');
  const again = await callable('session', { op: 'importLocal', db: local }, owner.token);
  assert.equal(again.report.skippedExisting.customers, 1);
  assert.equal(Object.keys(again.report.added).length, 0, 're-import adds nothing');
  const demo = await j(`${FS}/v1/projects/${P}/databases/(default)/documents/providers/p_demo1`, { headers: { authorization: 'Bearer owner' } });
  assert.equal(demo.status, 404, 'demo providers are never imported');
});