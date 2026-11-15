'use strict';
/* Firebase backend (functions/src) — end-to-end workflows over an in-memory Firestore/RTDB stand-in.
   Exercises the real server code path: callable input validation → verified-token identity → domain rules from
   functions/domain → Firestore diff commit → audit → RTDB signals. (The Firestore emulator needs Java; see
   docs/FIREBASE_BACKEND.md for the emulator run.) */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const FN = path.resolve(__dirname, '../../functions/src');
const service = require(path.join(FN, 'service.js'));

function memBackend(bootstrapEmails = ['owner@example.com']) {
  const docs = new Map();
  const signals = [];
  let auto = 0;
  const clone = v => JSON.parse(JSON.stringify(v));
  const stats = { reads: 0, queries: [] };
  const rows = col => [...docs].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2).map(([p, d]) => ({ id: p.split('/')[1], data: clone(d) }));
  const match = (r, [f, op, v]) => { const x = f === 'id' ? r.id : r.data[f]; return op === '==' ? x === v : op === 'in' ? v.includes(x) : op === 'array-contains' ? Array.isArray(x) && x.includes(v) : false; };
  const adapter = {
    async get(tx, p) { stats.reads++; return docs.has(p) ? clone(docs.get(p)) : null; },
    async query(tx, col, q) {
      stats.queries.push({ col, where: q.where || [], limit: q.limit || null });
      let out = rows(col).filter(r => (q.where || []).every(w => match(r, w)));
      if (q.orderBy) {
        const [f, dir] = q.orderBy, s = dir === 'desc' ? -1 : 1;
        out = out.filter(r => r.data[f] !== undefined).sort((a, b) => (a.data[f] < b.data[f] ? -s : a.data[f] > b.data[f] ? s : (a.id < b.id ? -s : s)));
        if (q.startAfter) { const [v, id] = q.startAfter; const i = out.findIndex(r => r.data[f] === v && r.id === id); out = out.slice(i + 1); }
      }
      if (q.limit) out = out.slice(0, q.limit);
      stats.reads += Math.max(1, out.length);
      return out;
    },
    async count(col, where) { stats.reads++; return rows(col).filter(r => (where || []).every(w => match(r, w))).length; },
    set(tx, p, d) { docs.set(p, clone(d)); },
    del(tx, p) { docs.delete(p); }
  };
  return {
    docs, signals, adapter, stats,
    runTransaction: fn => fn({}),
    async getDoc(p) { return adapter.get(null, p); },
    async setDoc(p, d, merge) { docs.set(p, merge && docs.has(p) ? { ...docs.get(p), ...clone(d) } : clone(d)); },
    async addDoc(col, d) { docs.set(`${col}/auto${++auto}`, clone(d)); },
    async queryDocs(col, field, op, value) { return rows(col).filter(x => (op === 'in' ? value.includes(x.data[field]) : x.data[field] === value)); },
    async signal(uids) { signals.push(...uids); },
    env: { bootstrapEmails },
    col: name => [...docs].filter(([p]) => p.startsWith(name + '/') && p.split('/').length === 2).map(([, d]) => d)
  };
}
const phoneUser = (uid, phone) => ({ uid, token: { phone_number: phone } });
const emailUser = (uid, email) => ({ uid, token: { email, email_verified: true } });
const call = (b, auth, app, method, p, body) => service.api(b, { auth, data: { app, method, path: p, body } });

const SARA = phoneUser('u_sara', '+201011112222');
const KARIM = phoneUser('u_karim', '+201099998888');
const OWNER = emailUser('u_owner', 'owner@example.com');
const REQ = { cat: 'electric', serviceName: 'إصلاح انقطاع كهرباء', desc: 'الكهرباء مقطوعة في المطبخ', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع 1' };
const PROVIDER_FORM = { name: 'كريم فتحي', phone: '01000000000', type: 'individual', cats: ['electric'], govs: ['القاهرة'], areas: ['مدينة نصر'], years: 5, bio: 'كهربائي منازل بخبرة خمس سنوات.' };

async function setup() {
  const b = memBackend();
  await service.session(b, { auth: OWNER, data: { op: 'claimOwner', name: 'المالك' } });
  return b;
}

test('fresh backend: collections are created by real writes only — no demo providers, no placeholder documents', async () => {
  const b = memBackend();
  const s = await service.session(b, { auth: null, data: { op: 'sync', app: 'customer' } });
  assert.equal(s.actor, null);
  assert.deepEqual(s.db.providers, [], 'production never starts with mock providers');
  assert.equal(b.docs.size, 0, 'a read creates nothing');
  const r = await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  assert.equal(r.actor.role, 'customer');
  assert.equal(b.col('customers').length, 1);
  assert.equal(b.col('customers')[0].phone, '01011112222', 'phone comes from the verified token, normalized to the app format');
  assert.ok(b.docs.has('system/meta') && b.docs.has('system/settings'), 'idempotent system bootstrap on first write');
  assert.equal(b.col('providers').length, 0);
  assert.equal(b.docs.get('users/u_sara').tag, 'customer:' + r.actor.id, 'identity link for change signals');
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة أحمد' } });
  assert.equal(b.col('customers').length, 1, 'registering twice is idempotent');
});

test('full paid lifecycle through the backend: customer → admin → provider → quote → completion → review', async () => {
  const b = await setup();
  const { actor: sara } = await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  const created = await call(b, SARA, 'customer', 'POST', '/requests', REQ);
  assert.equal(created.status, 201, JSON.stringify(created.error));
  const id = created.data.id;
  assert.equal(b.col('requests').length, 1, 'serviceRequests persist as requests/{id}');

  const reg = await call(b, KARIM, 'provider', 'POST', '/providers/register', PROVIDER_FORM);
  assert.equal(reg.status, 201, JSON.stringify(reg.error));
  const pid = reg.data.id;
  assert.equal(b.col('providers').find(p => p.id === pid).phone, '01099998888', 'registration bound to the verified phone, not the form');
  assert.equal((await call(b, KARIM, 'provider', 'GET', '/providers/me')).status, 401, 'a pending registration has no provider role');

  assert.equal((await call(b, OWNER, 'admin', 'POST', `/admin/providers/${pid}/status`, { status: 'approved' })).ok, true);
  assert.equal((await call(b, OWNER, 'admin', 'POST', `/admin/requests/${id}/assign`, { providerId: pid })).ok, true);
  assert.equal((await call(b, KARIM, 'provider', 'POST', `/requests/${id}/respond`, { accept: true })).ok, true);
  assert.equal((await call(b, KARIM, 'provider', 'POST', `/requests/${id}/schedule`, { at: '2026-11-20T10:00' })).ok, true);
  assert.equal((await call(b, SARA, 'customer', 'POST', `/requests/${id}/schedule`, {})).ok, true);
  for (const to of ['enroute', 'arrived', 'started']) assert.equal((await call(b, KARIM, 'provider', 'POST', `/requests/${id}/advance`, { to })).ok, true, to);
  assert.equal((await call(b, KARIM, 'provider', 'POST', `/requests/${id}/quotes`, { labor: 0, parts: 0 })).status, 422, 'zero quote refused server-side');
  assert.equal((await call(b, KARIM, 'provider', 'POST', `/requests/${id}/quotes`, { labor: 300, parts: 50 })).ok, true);
  assert.equal((await call(b, SARA, 'customer', 'POST', `/requests/${id}/quote/approve`)).ok, true);
  assert.equal(b.col('requests')[0].status, 'started', 'approving a quote does not complete the job');
  assert.equal((await call(b, KARIM, 'provider', 'POST', `/requests/${id}/complete`, {})).ok, true);
  assert.equal(b.col('transactions').length, 1, 'exactly one transaction at completion');
  assert.equal((await call(b, SARA, 'customer', 'POST', `/requests/${id}/close`)).ok, true);
  assert.equal((await call(b, SARA, 'customer', 'POST', `/requests/${id}/review`, { stars: 5, comment: 'ممتاز' })).status, 201);
  assert.equal((await call(b, SARA, 'customer', 'POST', `/requests/${id}/review`, { stars: 4 })).status, 409, 'one review per request');

  assert.ok(b.col('audit').length >= 10, 'every mutation is audited');
  assert.ok(b.signals.includes('u_sara') && b.signals.includes('u_karim') && b.signals.includes('u_owner'), 'RTDB change signals reach the affected users and admins');
  assert.ok(b.col('notifications').some(n => n.to === 'customer:' + sara.id), 'notifications persisted for the customer');
});

test('authorization is server-side: no role from the client, ownership enforced, scoped read model', async () => {
  const b = await setup();
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  const id = (await call(b, SARA, 'customer', 'POST', '/requests', REQ)).data.id;
  const OMAR = phoneUser('u_omar', '+201022223333');
  await service.session(b, { auth: OMAR, data: { op: 'registerCustomer', name: 'عمر' } });

  assert.equal((await call(b, OMAR, 'customer', 'GET', `/requests/${id}`)).status, 404, 'another customer cannot see the request (no existence leak)');
  assert.equal((await call(b, SARA, 'admin', 'GET', '/admin/summary')).status, 401, 'a customer token is not an admin, whatever app it claims');
  assert.equal((await service.api(b, { auth: SARA, data: { app: 'admin', method: 'GET', path: '/admin/summary', body: {}, actor: { role: 'admin' } } })).status, 401, 'a client-supplied actor is ignored');
  assert.equal((await call(b, null, 'customer', 'POST', '/requests', REQ)).status, 401, 'guests cannot create requests');

  const omar = await service.session(b, { auth: OMAR, data: { op: 'sync', app: 'customer' } });
  assert.equal(omar.db.serviceRequests.length, 0, 'scoped sync: no other customers’ requests');
  assert.equal(omar.db.customers.length, 1, 'scoped sync: only the own customer record');
  const guest = await service.session(b, { auth: null, data: { op: 'sync', app: 'customer' } });
  assert.equal(guest.db.customers.length, 0);
  assert.equal(guest.db.settings.defaultRate, 0, 'commission settings are not exposed to customers');

  const reg = await call(b, KARIM, 'provider', 'POST', '/providers/register', PROVIDER_FORM);
  await call(b, OWNER, 'admin', 'POST', `/admin/providers/${reg.data.id}/status`, { status: 'approved' });
  const pub = await service.session(b, { auth: SARA, data: { op: 'sync', app: 'customer' } });
  const p = pub.db.providers.find(x => x.id === reg.data.id);
  assert.ok(p && p.phone === undefined && p.docs === undefined && p.specialRate === undefined, 'provider private fields never reach customers');

  await assert.rejects(service.api(b, { auth: SARA, data: { app: 'customer', method: 'PUT', path: '/requests' } }), /unsupported method/);
  await assert.rejects(service.api(b, { auth: SARA, data: { app: 'customer', method: 'GET', path: '/../x' } }), /invalid path/);
});

test('admin bootstrap: only an allow-listed verified email can claim the first owner, once', async () => {
  const b = memBackend();
  await assert.rejects(service.session(b, { auth: emailUser('u_x', 'intruder@example.com'), data: { op: 'claimOwner' } }), /ADMIN_BOOTSTRAP_EMAILS/);
  await assert.rejects(service.session(b, { auth: { uid: 'u_y', token: { email: 'owner@example.com', email_verified: false } }, data: { op: 'claimOwner' } }), /verified email/);
  await service.session(b, { auth: OWNER, data: { op: 'claimOwner' } });
  assert.equal(b.docs.get('admins/u_owner').role, 'owner');
  const b2 = memBackend(['owner@example.com', 'second@example.com']);
  await service.session(b2, { auth: OWNER, data: { op: 'claimOwner' } });
  await assert.rejects(service.session(b2, { auth: emailUser('u_2', 'second@example.com'), data: { op: 'claimOwner' } }), /owner already exists/);
});

test('rate limiting caps writes per user per minute', async () => {
  const b = memBackend();
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  let limited = null;
  for (let i = 0; i < service.WRITE_LIMIT_PER_MIN + 2 && !limited; i++) {
    try { await call(b, SARA, 'customer', 'POST', '/customers/me/favorites/toggle', { kind: 'service', refId: 's' + i }); }
    catch (e) { limited = e; }
  }
  assert.ok(limited && limited.code === 'resource-exhausted', 'the limit is enforced');
});

test('migration of a browser database is owner-only, additive, idempotent and skips demo data', async () => {
  const b = await setup();
  const local = { v: 2, meta: { lastReqNo: 1042 }, customers: [{ id: 'c_old', name: 'قديم', phone: '01055556666', status: 'active' }],
    providers: [{ id: 'p_demo1', name: 'تجريبي', demo: true, status: 'approved', cats: [], govs: [] }],
    serviceRequests: [{ id: 'r_old', no: 'HS-2026-1042', customerId: 'c_old', status: 'closed', history: [] }], favorites: [{ customerId: 'c_old', kind: 'service', refId: 'x' }] };
  await assert.rejects(service.session(b, { auth: SARA, data: { op: 'importLocal', db: local } }), /owner only/);
  const dry = await service.session(b, { auth: OWNER, data: { op: 'importLocal', db: local, dryRun: true } });
  assert.equal(dry.report.added.customers, 1);
  assert.equal(b.col('customers').length, 0, 'a dry run writes nothing');
  const first = await service.session(b, { auth: OWNER, data: { op: 'importLocal', db: local } });
  assert.equal(first.report.skippedDemo.providers, 1, 'demo providers are not imported');
  assert.deepEqual(first.report.addedIds.requests, ['r_old'], 'the report lists imported document ids per Firestore collection (rollback list)');
  assert.deepEqual(first.report.addedIds.customers, ['c_old']);
  assert.ok(!JSON.stringify(first.report).includes('01055556666'), 'no personal data in the report');
  const stored = b.col('migrations').pop();
  assert.deepEqual(stored.addedIds.requests, ['r_old'], 'the stored migration record keeps the rollback ids');
  assert.equal(b.col('requests').length, 1);
  assert.equal(b.docs.get('system/meta').lastReqNo, 1042, 'request numbering continues after imported numbers');
  const again = await service.session(b, { auth: OWNER, data: { op: 'importLocal', db: local } });
  assert.equal(again.report.skippedExisting.customers, 1, 'a second import adds nothing');
  assert.equal(b.col('customers').length, 1);
  assert.equal(b.col('migrations').length, 2, 'each real import is reported');
});

test('reads are operation-scoped: no unbounded collection scans; summary uses aggregation counts', async () => {
  const b = await setup();
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  b.stats.queries.length = 0;
  const id = (await call(b, SARA, 'customer', 'POST', '/requests', REQ)).data.id;
  await call(b, SARA, 'customer', 'GET', `/requests/${id}`);
  await call(b, SARA, 'customer', 'GET', '/requests');
  await call(b, SARA, 'customer', 'GET', '/notifications');
  await service.session(b, { auth: SARA, data: { op: 'sync', app: 'customer' } });
  const unbounded = b.stats.queries.filter(q => !q.where.length && !q.limit && !['serviceAreas', 'rateLimits'].includes(q.col));
  assert.deepEqual(unbounded, [], 'every query is filtered or limited');
  b.stats.queries.length = 0;
  const s = await call(b, OWNER, 'admin', 'GET', '/admin/summary');
  assert.equal(s.ok, true);
  assert.equal(s.data.requests, 1);
  assert.equal(s.data.unassigned, 1);
  assert.equal(b.stats.queries.length, 0, 'summary loads no documents (count aggregations only)');
});

test('cursor pagination, idempotent retries and duplicate-phone protection', async () => {
  const b = await setup();
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  for (let i = 0; i < 3; i++) { await call(b, SARA, 'customer', 'POST', '/requests', { ...REQ, desc: 'طلب ' + i }); await new Promise(r => setTimeout(r, 3)); }
  const p1 = await service.api(b, { auth: SARA, data: { app: 'customer', method: 'GET', path: '/requests', query: { limit: '2' } } });
  const items1 = Array.isArray(p1.data) ? p1.data : p1.data.items;
  assert.equal(items1.length, 2);
  assert.ok(p1.page && p1.page.nextCursor, 'a full page returns a cursor');
  const p2 = await service.api(b, { auth: SARA, data: { app: 'customer', method: 'GET', path: '/requests', query: { limit: '2', cursor: p1.page.nextCursor } } });
  const items2 = Array.isArray(p2.data) ? p2.data : p2.data.items;
  assert.equal(items2.length, 1, 'the next page continues after the cursor');
  assert.ok(!items2.some(x => items1.some(y => y.id === x.id)), 'pages do not overlap');

  const before = b.col('requests').length;
  const once = { app: 'customer', method: 'POST', path: '/requests', body: REQ, idempotencyKey: 'retry-key-0001' };
  const r1 = await service.api(b, { auth: SARA, data: once });
  const r2 = await service.api(b, { auth: SARA, data: once });
  assert.equal(r1.data.id, r2.data.id, 'a retried mutation replays the first result');
  assert.equal(b.col('requests').length, before + 1, 'and creates nothing new');

  assert.equal((await call(b, KARIM, 'provider', 'POST', '/providers/register', PROVIDER_FORM)).status, 201);
  assert.equal((await call(b, KARIM, 'provider', 'POST', '/providers/register', PROVIDER_FORM)).status, 409, 'duplicate phone is still detected with partial reads');
});

test('a provider gets the customer contact details only after accepting', async () => {
  const b = await setup();
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  const reg = await call(b, KARIM, 'provider', 'POST', '/providers/register', PROVIDER_FORM);
  await call(b, OWNER, 'admin', 'POST', `/admin/providers/${reg.data.id}/status`, { status: 'approved' });
  const id = (await call(b, SARA, 'customer', 'POST', '/requests', REQ)).data.id;
  assert.equal(b.col('assignments').length, 1, 'auto-assignment matched the approved provider (candidate query)');
  const offered = await call(b, KARIM, 'provider', 'GET', `/requests/${id}`);
  assert.equal(offered.ok, true);
  assert.equal(offered.data.phone, '', 'no customer phone before acceptance');
  const syncOffered = await service.session(b, { auth: KARIM, data: { op: 'sync', app: 'provider' } });
  assert.equal(syncOffered.db.serviceRequests[0].addr, '', 'nor in the provider read model');
  await call(b, KARIM, 'provider', 'POST', `/requests/${id}/respond`, { accept: true });
  const acc = await call(b, KARIM, 'provider', 'GET', `/requests/${id}`);
  assert.equal(acc.data.phone, '01011112222', 'visible once accepted');
  const synced = await service.session(b, { auth: KARIM, data: { op: 'sync', app: 'provider' } });
  assert.equal(synced.db.serviceRequests[0].phone, '01011112222');
  assert.equal(synced.db.customers[0].phone, '01011112222');
});
test('customer sign-up without SMS: email or quick (anonymous) account bound by uid, contact phone unique, phone OTP still works', async () => {
  const b = await setup();
  const MONA = { uid: 'u_mona', token: { email: 'mona@example.com', email_verified: false, firebase: { sign_in_provider: 'password' } } };
  const QUICK = { uid: 'u_quick', token: { firebase: { sign_in_provider: 'anonymous' } } };
  const reg = (auth, body) => service.session(b, { auth, data: { op: 'registerCustomer', ...body } });

  await assert.rejects(reg(MONA, { name: 'منى' }), /رقم موبايل/, 'email accounts must give a contact phone');
  await assert.rejects(reg(MONA, { name: 'منى', phone: '12345' }), /رقم موبايل/);
  const mona = await reg(MONA, { name: 'منى', phone: '01055556666' });
  assert.equal(mona.actor.role, 'customer');
  const rec = b.col('customers').find(c => c.id === mona.actor.id);
  assert.equal(rec.uid, 'u_mona'); assert.equal(rec.phoneVerified, false); assert.equal(rec.authMethod, 'password'); assert.equal(rec.email, 'mona@example.com');
  assert.equal((await reg(MONA, { name: 'منى', phone: '01055556666' })).actor.id, mona.actor.id, 'registering again is idempotent');

  const s1 = await service.session(b, { auth: MONA, data: { op: 'sync', app: 'customer' } });
  assert.equal(s1.actor && s1.actor.id, mona.actor.id, 'an email account resolves to its customer by uid');
  const created = await call(b, MONA, 'customer', 'POST', '/requests', REQ);
  assert.equal(created.status, 201, 'and can place requests');

  await assert.rejects(reg(QUICK, { name: 'زائر', phone: '01055556666' }), /مسجّل/, 'a contact phone cannot be claimed by a second account');
  const quick = await reg(QUICK, { name: 'زائر سريع', phone: '01077778888' });
  assert.equal(b.col('customers').find(c => c.id === quick.actor.id).authMethod, 'anonymous');
  assert.equal((await service.session(b, { auth: QUICK, data: { op: 'sync', app: 'customer' } })).actor.id, quick.actor.id);
  assert.equal((await call(b, QUICK, 'customer', 'GET', `/requests/${created.data.id}`)).status, 404, 'accounts stay isolated');

  const STRANGER = { uid: 'u_x', token: { firebase: { sign_in_provider: 'anonymous' } } };
  assert.equal((await service.session(b, { auth: STRANGER, data: { op: 'sync', app: 'customer' } })).actor, null, 'no link, no customer');
  assert.equal((await service.session(b, { auth: MONA, data: { op: 'sync', app: 'provider' } })).actor, null, 'email customers never become providers');

  assert.equal((await call(b, MONA, 'customer', 'PATCH', '/customers/me', { phone: '01099990000' })).status, 409, 'contact phone is fixed for email accounts');
  const same = await call(b, MONA, 'customer', 'PATCH', '/customers/me', { name: 'منى أحمد', phone: '01055556666' });
  assert.equal(same.ok, true, 'other profile fields still edit (unchanged phone is accepted)');

  const viaOtp = await reg(SARA, { name: 'سارة' });
  assert.equal(b.col('customers').find(c => c.id === viaOtp.actor.id).phoneVerified, true, 'phone OTP sign-up is unchanged and marked verified');
});
test('web push: devices register per uid; a new notification is pushed only to its owner; dead tokens are cleaned', async () => {
  const b = await setup();
  const sent = [];
  b.deleteDoc = async p => { b.docs.delete(p); };
  b.sendPush = async (tokens, msg) => { sent.push({ tokens, msg }); return tokens.filter(t => t.startsWith('dead')); };
  const T = c => c.repeat(120);
  const reg = (auth, app, token) => service.session(b, { auth, data: { op: 'registerPush', app, token } });

  await assert.rejects(reg(null, 'customer', T('a')), /سجّل الدخول/, 'anonymous callers cannot register devices');
  await assert.rejects(reg(SARA, 'customer', 'short'), /غير صالح/);
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  await reg(SARA, 'customer', T('a'));
  await reg(SARA, 'customer', 'dead' + T('b'));
  assert.equal(b.col('pushTokens').length, 2);
  assert.ok(b.col('pushTokens').every(x => x.uid === 'u_sara'), 'tokens are bound to the caller uid');

  const regP = await call(b, KARIM, 'provider', 'POST', '/providers/register', PROVIDER_FORM);
  await call(b, OWNER, 'admin', 'POST', `/admin/providers/${regP.data.id}/status`, { status: 'approved' });
  await reg(KARIM, 'provider', T('k'));
  await service.session(b, { auth: KARIM, data: { op: 'sync', app: 'provider' } });   // links users/u_karim → provider tag

  sent.length = 0;
  const id = (await call(b, SARA, 'customer', 'POST', '/requests', REQ)).data.id;
  const toProvider = sent.find(s => s.tokens.includes(T('k')));
  assert.ok(toProvider, 'the matched provider is pushed about the new request');
  assert.match(toProvider.msg.link, /^apps\/provider\/index\.html#\/request\//);
  assert.ok(!sent.some(s => s.tokens.includes(T('a'))) || sent.find(s => s.tokens.includes(T('a'))).msg.link.startsWith('apps/customer/'), 'customer pushes deep-link to the customer app');

  sent.length = 0;
  await call(b, KARIM, 'provider', 'POST', `/requests/${id}/respond`, { accept: true });
  const toSara = sent.find(s => s.tokens.includes(T('a')));
  assert.ok(toSara && /^apps\/customer\/index\.html#\/track\//.test(toSara.msg.link), 'the customer is pushed when the provider accepts');
  assert.ok(!sent.some(s => s.tokens.includes(T('k')) && s === toSara), 'no cross-user delivery');
  assert.equal(b.col('pushTokens').some(x => x.token.startsWith('dead')), false, 'tokens FCM reports as dead are removed');

  await service.session(b, { auth: KARIM, data: { op: 'unregisterPush', token: T('a') } });
  assert.ok(b.col('pushTokens').some(x => x.token === T('a')), 'another user cannot unregister my device');
  await service.session(b, { auth: SARA, data: { op: 'unregisterPush', token: T('a') } });
  assert.equal(b.col('pushTokens').some(x => x.token === T('a')), false, 'the owner can unregister on sign-out');
});
test('customer map pin: validated server-side, stored clean, released to the provider only after acceptance', async () => {
  const b = await setup();
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  for (const geo of [{ lat: 'x', lng: 31 }, { lat: 95, lng: 31 }, { lat: 30, lng: 190 }, '30,31']) {
    const bad = await call(b, SARA, 'customer', 'POST', '/requests', { ...REQ, geo });
    assert.equal(bad.status, 422, 'invalid pin refused: ' + JSON.stringify(geo));
    assert.ok(bad.error.details && bad.error.details.geo);
  }
  assert.equal(b.col('requests').length, 0, 'nothing stored for an invalid pin');
  const reg = await call(b, KARIM, 'provider', 'POST', '/providers/register', PROVIDER_FORM);
  await call(b, OWNER, 'admin', 'POST', `/admin/providers/${reg.data.id}/status`, { status: 'approved' });
  const id = (await call(b, SARA, 'customer', 'POST', '/requests', { ...REQ, geo: { lat: 30.04441234, lng: 31.23571234, note: '<x>' } })).data.id;
  assert.equal(JSON.stringify(b.col('requests')[0].geo), '{"lat":30.04441,"lng":31.23571}', 'only rounded lat/lng persist');
  const before = await service.session(b, { auth: KARIM, data: { op: 'sync', app: 'provider' } });
  assert.equal(before.db.serviceRequests[0].geo, null, 'pin hidden while the job is only offered');
  await call(b, KARIM, 'provider', 'POST', `/requests/${id}/respond`, { accept: true });
  const after = await service.session(b, { auth: KARIM, data: { op: 'sync', app: 'provider' } });
  assert.equal(after.db.serviceRequests[0].geo.lat, 30.04441, 'released to the assigned provider after acceptance');
});
test('a decline re-matches the request to the next candidate (candidate history loaded in the same transaction)', async () => {
  const b = await setup();
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  const HANY = phoneUser('u_hany', '+201077776666');
  const p1 = (await call(b, KARIM, 'provider', 'POST', '/providers/register', PROVIDER_FORM)).data.id;
  const p2 = (await call(b, HANY, 'provider', 'POST', '/providers/register', { ...PROVIDER_FORM, name: 'هاني' })).data.id;
  for (const pid of [p1, p2]) await call(b, OWNER, 'admin', 'POST', `/admin/providers/${pid}/status`, { status: 'approved' });
  const id = (await call(b, SARA, 'customer', 'POST', '/requests', REQ)).data.id;
  const first = b.col('assignments').find(a => a.reqId === id && a.status === 'offered');
  const firstAuth = first.providerId === p1 ? KARIM : HANY;
  assert.equal((await call(b, firstAuth, 'provider', 'POST', `/requests/${id}/respond`, { accept: false, reason: 'مشغول' })).ok, true);
  const next = b.col('assignments').find(a => a.reqId === id && a.status === 'offered');
  assert.ok(next, 'a new offer was created');
  assert.notEqual(next.providerId, first.providerId, 'the declining provider is not offered again');
});
test('admin workforce on the server: invite → accept by verified email → role/status changes drive authorization', async () => {
  const b = await setup();
  const list = await call(b, OWNER, 'admin', 'GET', '/admin/employees');
  assert.equal(list.ok, true);
  assert.equal(list.data.items.length, 1, 'the first owner is an employee record');
  assert.equal(list.data.items[0].role, 'owner');
  const created = await call(b, OWNER, 'admin', 'POST', '/admin/employees', { name: 'منى سعيد', email: 'Mona@Example.com', department: 'support', role: 'support' });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  assert.equal(created.data.status, 'invited');
  assert.equal(created.data.email, 'mona@example.com', 'emails are normalized by the app rules');
  assert.equal((await call(b, OWNER, 'admin', 'POST', '/admin/employees', { name: 'تكرار', email: 'mona@example.com', department: 'ops', role: 'admin' })).status, 422, 'duplicate email refused (app validation)');

  const MONA_UNVERIFIED = { uid: 'u_mona', token: { email: 'mona@example.com', email_verified: false } };
  const s0 = await service.session(b, { auth: MONA_UNVERIFIED, data: { op: 'sync', app: 'admin' } });
  assert.equal(s0.actor, null, 'an unverified email never activates an invitation');
  const MONA = emailUser('u_mona', 'mona@example.com');
  const s1 = await service.session(b, { auth: MONA, data: { op: 'sync', app: 'admin' } });
  assert.equal(s1.actor && s1.actor.adminRole, 'support', 'invitation accepted with the verified email');
  assert.equal(b.docs.get('admins/u_mona').employeeId, created.data.id);
  assert.ok(Array.isArray(s1.admin.employees), 'admin sync carries the workforce');

  assert.equal((await call(b, MONA, 'admin', 'POST', '/admin/employees', { name: 'س', email: 'x@example.com', department: 'ops', role: 'admin' })).status, 403, 'support role cannot create employees (RBAC)');
  assert.equal((await call(b, MONA, 'admin', 'GET', '/admin/summary')).ok, true, 'support can use the admin API it is allowed');

  assert.equal((await call(b, OWNER, 'admin', 'PATCH', `/admin/employees/${created.data.id}`, { role: 'admin' })).ok, true);
  assert.equal(b.docs.get('admins/u_mona').role, 'admin', 'role change propagates to the authorization record');
  assert.equal((await call(b, OWNER, 'admin', 'POST', `/admin/employees/${created.data.id}/status`, { status: 'disabled' })).ok, true);
  assert.equal((await call(b, MONA, 'admin', 'GET', '/admin/summary')).status, 401, 'a disabled employee loses admin access immediately');

  const ownerId = list.data.items[0].id;
  assert.equal((await call(b, OWNER, 'admin', 'POST', `/admin/employees/${ownerId}/status`, { status: 'disabled' })).status, 409, 'nobody disables their own account');
  assert.equal((await call(b, OWNER, 'admin', 'PATCH', `/admin/employees/${ownerId}`, { role: 'admin' })).status, 422, 'the last active owner keeps the owner role (app rule)');
  assert.ok(b.col('audit').some(a => a.path === '/admin/employees'), 'workforce mutations are audited');
});

test('RBAC catalogue on the server: role edits and overrides respect grant limits and are enforced on admin routes', async () => {
  const b = await setup();
  const rb = await call(b, OWNER, 'admin', 'GET', '/admin/rbac');
  assert.equal(rb.ok, true);
  assert.ok(rb.data.roles.some(r => r.id === 'owner'));
  const emp = (await call(b, OWNER, 'admin', 'POST', '/admin/employees', { name: 'هاني', email: 'hany@example.com', department: 'ops', role: 'moderator' })).data;
  const HANY = emailUser('u_hany', 'hany@example.com');
  await service.session(b, { auth: HANY, data: { op: 'sync', app: 'admin' } });
  const pid = (await call(b, KARIM, 'provider', 'POST', '/providers/register', PROVIDER_FORM)).data.id;
  assert.equal((await call(b, HANY, 'admin', 'POST', `/admin/providers/${pid}/status`, { status: 'approved' })).status, 403, 'moderator (inherits support) has no providers.decide');
  const o = await call(b, OWNER, 'admin', 'POST', `/admin/rbac/overrides/${emp.id}`, { keys: ['providers.decide'] });
  assert.equal(o.ok, true, JSON.stringify(o.error));
  assert.deepEqual(b.docs.get('system/rbac').overrides[emp.id], ['providers.decide']);
  assert.equal((await call(b, HANY, 'admin', 'POST', `/admin/providers/${pid}/status`, { status: 'approved' })).ok, true, 'a stored per-employee override is enforced by the domain guard');
  assert.equal((await call(b, HANY, 'admin', 'POST', `/admin/rbac/overrides/${emp.id}`, { keys: ['workforce.edit'] })).status, 403, 'no permissions.edit → cannot grant');
  const role = await call(b, OWNER, 'admin', 'POST', '/admin/rbac/roles', { fields: { name: 'مراجع مالي', description: 'مراجعة المعاملات', inherits: null, permissions: ['orders.view'] } });
  assert.equal(role.status, 201, JSON.stringify(role.error));
  assert.ok(b.docs.get('system/rbac').roles.some(r => r.name === 'مراجع مالي'), 'custom role persisted');
});
test('customer self-service on the server: profile/prefs, verified-phone guard, repeat, attachment ids, account deletion', async () => {
  const b = await setup();
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  const upd = await call(b, SARA, 'customer', 'PATCH', '/customers/me', { name: 'سارة أحمد', email: 'sara@example.com', prefs: { notifyQuotes: false, preferredContact: 'whatsapp' } });
  assert.equal(upd.ok, true, JSON.stringify(upd.error));
  const c = b.col('customers')[0];
  assert.equal(c.name, 'سارة أحمد'); assert.equal(c.prefs.notifyQuotes, false); assert.equal(c.prefs.preferredContact, 'whatsapp');
  assert.equal((await call(b, SARA, 'customer', 'PATCH', '/customers/me', { phone: '01099990000' })).status, 409, 'the phone must stay the verified one');
  assert.equal((await call(b, SARA, 'customer', 'PATCH', '/customers/me', { email: 'not-an-email' })).status, 422);

  const id = (await call(b, SARA, 'customer', 'POST', '/requests', REQ)).data.id;
  const att = await call(b, SARA, 'customer', 'POST', `/requests/${id}/attachments`, { ids: ['at_1', 'at_2'] });
  assert.equal(att.ok, true);
  assert.deepEqual(b.col('requests').find(r => r.id === id).attachments, ['at_1', 'at_2']);
  const rep = await call(b, SARA, 'customer', 'POST', `/requests/${id}/repeat`, {});
  assert.equal(rep.status, 201);
  assert.notEqual(rep.data.no, b.col('requests').find(r => r.id === id).no, 'a repeated request gets a new number');
  const OMAR = phoneUser('u_omar', '+201022223333');
  await service.session(b, { auth: OMAR, data: { op: 'registerCustomer', name: 'عمر' } });
  assert.equal((await call(b, OMAR, 'customer', 'POST', `/requests/${id}/repeat`, {})).status, 404, 'cannot repeat someone else’s request');

  await call(b, SARA, 'customer', 'POST', '/customers/me/addresses', { label: 'البيت', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع 1' });
  const del = await call(b, SARA, 'customer', 'DELETE', '/customers/me');
  assert.equal(del.ok, true);
  assert.equal(b.col('customers').filter(x => x.phone === '01011112222').length, 0, 'profile deleted');
  assert.equal(b.col('addresses').length, 0, 'addresses deleted');
  assert.equal(b.col('requests').length, 2, 'past requests are kept for the record');
});
test('read-path rate limiting: per uid, per infrastructure IP (not spoofable via X-Forwarded-For), per-instance anonymous ceiling, no DB writes', () => {
  const { createLimiter, clientIp, isReadCall } = require(path.join(FN, 'limits.js'));
  let t = 0;
  const L = createLimiter({ userReadsPerMin: 3, ipReadsPerMin: 2, anonymousReadsPerMinPerInstance: 5 }, () => t);
  assert.deepEqual([1, 2, 3, 4].map(() => L.allowRead({ uid: 'u1' })), [true, true, true, false], 'per-user read limit');
  assert.equal(L.allowRead({ uid: 'u2' }), true, 'users are limited independently');
  assert.deepEqual([1, 2, 3].map(() => L.allowRead({ ip: '1.1.1.1' })), [true, true, false], 'per-IP anonymous limit');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '9.9.9.9, 203.0.113.7' } }), '203.0.113.7', 'rightmost hop (appended by Google front end) is used');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': 'spoof-1, 203.0.113.7' } }), clientIp({ headers: { 'x-forwarded-for': 'spoof-2, 203.0.113.7' } }), 'a client-supplied prefix cannot rotate the key');
  assert.equal(L.allowRead({ ip: '2.2.2.2' }), true); assert.equal(L.allowRead({ ip: '3.3.3.3' }), true);
  assert.equal(L.allowRead({ ip: '4.4.4.4' }), false, 'per-instance anonymous ceiling stops IP rotation');
  t += 60000;
  assert.equal(L.allowRead({ uid: 'u1' }), true, 'a new window resets the counters');
  assert.equal(isReadCall('session', { op: 'sync' }), true); assert.equal(isReadCall('api', { method: 'get' }), true);
  assert.equal(isReadCall('api', { method: 'POST' }), false); assert.equal(isReadCall('session', { op: 'registerCustomer' }), false);
});
test('upfront pricing through the backend: the customer sees only their price; provider/admin see the split', async () => {
  const b = await setup();
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  assert.equal((await call(b, OWNER, 'admin', 'POST', '/admin/pricing', { key: 'electric/dist-board', base: 200 })).ok, true);
  assert.equal((await call(b, OWNER, 'admin', 'POST', '/admin/pricing', { markupRate: 10 })).ok, true);
  assert.equal(b.docs.get('system/settings').prices['electric/dist-board'], 200, 'prices persist in system/settings');
  const pub = await call(b, null, 'customer', 'GET', '/pricing');
  assert.equal(pub.data.prices['electric/dist-board'], 220);
  const created = await call(b, SARA, 'customer', 'POST', '/requests', { ...REQ, itemId: 'electric/dist-board' });
  assert.equal(created.status, 201);
  assert.deepEqual(created.data.pricing, { customerPrice: 220, rate: 10 }, 'the customer response hides the provider amount and platform fee');
  const stored = b.col('requests').find(r => r.id === created.data.id);
  assert.equal(stored.pricing.providerAmount, 200, 'the server keeps the full split');
  const synced = await service.session(b, { auth: SARA, data: { op: 'sync', app: 'customer' } });
  assert.ok(!JSON.stringify(synced.db.serviceRequests).includes('providerAmount'), 'nor in the customer read model');
  assert.equal((await call(b, SARA, 'customer', 'POST', '/admin/pricing', { key: 'x', base: 1 })).status, 403, 'pricing administration is admin-only');
});
test('admin extras on the server: audit read, operational settings, departments, security, in-app broadcast', async () => {
  const b = await setup();
  const revoked = [];
  b.authUsers = async uids => Object.fromEntries(uids.map(u => [u, { lastSignIn: '2026-11-15T10:00:00Z', created: '2026-11-15T09:00:00Z' }]));
  b.revokeSessions = async uid => { revoked.push(uid); };
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });

  const audit = await call(b, OWNER, 'admin', 'GET', '/admin/audit');
  assert.equal(audit.ok, true); assert.ok(audit.data.items.some(x => x.action === 'claimOwner'), 'the audit log is readable by the owner');
  assert.equal((await call(b, SARA, 'admin', 'GET', '/admin/audit')).status, 401, 'not for non-admins');

  const set = await call(b, OWNER, 'admin', 'POST', '/admin/settings', { autoAssign: false, customerFee: true });
  assert.equal(set.ok, true); assert.equal(set.data.autoAssign, false); assert.equal(b.docs.get('system/settings').customerFee, true);
  assert.equal((await call(b, OWNER, 'admin', 'POST', '/admin/settings', { autoAssign: 'yes' })).status, 422);

  const d1 = await call(b, OWNER, 'admin', 'POST', '/admin/departments', { name: 'العمليات' });
  assert.equal(d1.status, 201);
  const d2 = await call(b, OWNER, 'admin', 'POST', '/admin/departments', { name: 'الميدان', parentId: d1.data.id });
  assert.equal(d2.status, 201);
  assert.equal((await call(b, OWNER, 'admin', 'POST', '/admin/departments', { name: 'العمليات' })).status, 422, 'duplicate name at the same level');
  assert.equal((await call(b, OWNER, 'admin', 'PATCH', `/admin/departments/${d1.data.id}`, { parentId: d2.data.id })).status, 422, 'no cycles');
  const emp = b.col('employees')[0].id;
  assert.equal((await call(b, OWNER, 'admin', 'PATCH', `/admin/departments/${d1.data.id}`, { headId: emp, status: 'inactive' })).data.headId, emp);
  assert.equal((await call(b, OWNER, 'admin', 'GET', '/admin/departments')).data.items.length, 2);

  const sec = await call(b, OWNER, 'admin', 'GET', '/admin/security/admins');
  assert.equal(sec.data.items[0].lastSignIn, '2026-11-15T10:00:00Z');
  assert.equal((await call(b, OWNER, 'admin', 'POST', '/admin/security/revoke/u_owner')).status, 409, 'nobody revokes their own sessions here');
  assert.equal((await call(b, OWNER, 'admin', 'POST', '/admin/security/revoke/u_other')).ok, true); assert.deepEqual(revoked, ['u_other']);

  const bc = await call(b, OWNER, 'admin', 'POST', '/admin/notifications/broadcast', { audience: 'customers', text: 'عرض خاص هذا الأسبوع' });
  assert.equal(bc.status, 201); assert.equal(bc.data.recipients, 1);
  assert.ok(b.col('notifications').some(n => n.to.startsWith('customer:') && n.broadcast === bc.data.id), 'the customer inbox receives the broadcast');
  assert.equal((await call(b, OWNER, 'admin', 'POST', '/admin/notifications/broadcast', { audience: 'all', text: 'x' })).status, 422);
  assert.equal((await call(b, OWNER, 'admin', 'GET', '/admin/notifications/broadcasts')).data.items.length, 1);
  assert.ok(b.col('audit').some(a => a.path === '/admin/notifications/broadcast'), 'admin mutations are audited');
});