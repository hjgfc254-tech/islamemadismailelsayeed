'use strict';
/* Backend-readiness contract: services/api-client.js + services/*-api.js + realtime-client.js run as MOCK adapters over
   the real local store (MP) inside a vm context — the same classic-script globals the browser uses. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const STORE = ['shared/config/legacy-data.js', 'services/local-catalog.js', 'services/local-market-store.js'];
const ADAPTERS = ['api-client', 'auth-api', 'orders-api', 'quotes-api', 'catalog-api', 'provider-api', 'customer-api',
  'notifications-api', 'support-api', 'finance-api', 'admin-api', 'uploads-api', 'realtime-client'].map(n => `services/${n}.js`);

function memStorage() {
  const m = new Map();
  return { _map: m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() };
}
function boot({ withStore = true } = {}) {
  const listeners = {};
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Date, Math,
    localStorage: memStorage(), sessionStorage: memStorage(),
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter(f => f !== fn); },
    location: { pathname: '/apps/customer/index.html' },
    HSAdminRbac: { state: { roster: [{ id: 'e_owner', name: 'مالك', role: 'owner', status: 'active' }, { id: 'e_sup', name: 'دعم', role: 'support', status: 'active' }] } }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of (withStore ? STORE : []).concat(ADAPTERS)) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const run = code => vm.runInContext(code, ctx);
  const g = ctx;
  if (withStore) run('MP.db().settings.autoAssign = false');
  const as = (app, sessionValue) => {
    g.HSAuthApi.useApp(app);
    if (app === 'customer') g.localStorage.setItem('hs_user', JSON.stringify(sessionValue));
    if (app === 'provider') g.sessionStorage.setItem('hs_provider_demo_session', sessionValue);
    if (app === 'admin') g.sessionStorage.setItem('hs_admin_demo_session', sessionValue);
  };
  const fire = (type, evt) => (listeners[type] || []).forEach(fn => fn(evt));
  return { g, run, as, fire, C: g.HSApiClient };
}
const REQ = { cat: 'electric', serviceName: 'إصلاح انقطاع كهرباء', desc: 'الكهرباء مقطوعة في المطبخ', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع 1' };
const sara = { name: 'سارة', phone: '01011112222' };

async function customerWithRequest(t) {
  t.run(`MP.customerFor('${sara.name}','${sara.phone}')`);
  t.as('customer', sara);
  const res = await t.g.HSOrdersApi.create(REQ);
  assert.equal(res.status, 201, JSON.stringify(res.error));
  return res.data.id;
}
/** Drives a request to `started` with p_demo1 through the API (admin assigns, provider accepts, schedules, advances). */
async function toStarted(t, id) {
  t.as('admin', 'e_owner');
  assert.equal((await t.g.HSAdminApi.assign(id, 'p_demo1')).ok, true);
  t.as('provider', 'p_demo1');
  const O = t.g.HSOrdersApi;
  assert.equal((await O.respond(id, true)).ok, true);
  assert.equal((await O.schedule(id)).ok, true, 'provider confirms the requested time');
  for (const to of ['enroute', 'arrived', 'started']) assert.equal((await O.advance(id, to)).ok, true, to);
}

test('envelope + permission boundary: 404 route, public, 401 without actor, 403 wrong role, 503 without store', async () => {
  const t = boot();
  const C = t.C;
  assert.equal(C.mode(), 'mock');
  const nf = await C.get('/nope');
  assert.deepEqual([nf.ok, nf.status, nf.error.code], [false, 404, 'NOT_FOUND']);
  t.g.HSAuthApi.useApp('customer');
  assert.equal((await C.get('/categories')).ok, true, 'public route needs no actor');
  const anon = await C.get('/requests');
  assert.deepEqual([anon.status, anon.error.code], [401, 'UNAUTHENTICATED']);
  t.run(`MP.customerFor('${sara.name}','${sara.phone}')`); t.as('customer', sara);
  const wrong = await C.get('/admin/summary');
  assert.deepEqual([wrong.status, wrong.error.code], [403, 'FORBIDDEN']);
  assert.equal(C.viewState(wrong), 'denied');
  assert.equal(C.viewState(await C.get('/requests')), 'empty');
  assert.equal(C.viewState(null), 'loading');
  const bare = boot({ withStore: false });
  const un = await bare.C.get('/categories');
  assert.deepEqual([un.status, un.error.code], [503, 'UNAVAILABLE']);
  assert.equal(bare.C.viewState(un), 'error');
});

test('every route declares roles and is documented in docs/API_CONTRACTS.md', () => {
  const t = boot();
  const routes = t.C.routes();
  assert.ok(routes.length >= 40, 'route count ' + routes.length);
  const doc = fs.readFileSync(path.join(ROOT, 'docs/API_CONTRACTS.md'), 'utf8');
  for (const r of routes) {
    assert.ok(r.roles.length > 0);
    assert.ok(doc.includes('`' + r.method + ' ' + r.path + '`'), 'undocumented: ' + r.method + ' ' + r.path);
  }
  assert.throws(() => t.C.define('GET', '/x', { roles: [] }, () => 1), /needs roles/);
  assert.throws(() => t.C.define('GET', '/requests', { roles: ['admin'] }, () => 1), /duplicate/);
});

test('ownership: customers see only their own requests; unassigned providers get 404 (no existence leak)', async () => {
  const t = boot();
  const id = await customerWithRequest(t);
  const bad = await t.g.HSOrdersApi.create({ ...REQ, desc: '' });
  assert.deepEqual([bad.status, bad.error.code, bad.error.details.desc], [422, 'VALIDATION', 'مطلوب']);
  t.run("MP.customerFor('علي','01099998888')"); t.as('customer', { name: 'علي', phone: '01099998888' });
  assert.equal((await t.g.HSOrdersApi.list()).data.total, 0);
  assert.equal((await t.g.HSOrdersApi.get(id)).status, 404);
  t.as('provider', 'p_demo2');
  assert.equal((await t.g.HSOrdersApi.get(id)).status, 404);
  t.as('admin', 'e_owner');
  assert.equal((await t.g.HSOrdersApi.get(id)).data.id, id);
  const res = await t.g.HSOrdersApi.get(id);
  res.data.status = 'hacked';
  assert.notEqual(t.run(`MP.get('serviceRequests','${id}').status`), 'hacked', 'responses are copies');
});

test('paid flow through the API: zero quote refused (422), valid quote → approve → complete → close → review', async () => {
  const t = boot();
  const id = await customerWithRequest(t);
  await toStarted(t, id);
  const Q = t.g.HSQuotesApi, O = t.g.HSOrdersApi;
  const zero = await Q.submit(id, { labor: 0, parts: 0 });
  assert.deepEqual([zero.status, zero.error.code], [422, 'VALIDATION']);
  assert.match(zero.error.message, /صفر/);
  assert.equal((await Q.submit(id, { labor: -5, parts: 10 })).status, 422, 'negative amounts refused');
  const q = await Q.submit(id, { labor: 300, parts: 50, note: 'تغيير مفتاح' });
  assert.deepEqual([q.status, q.data.total], [201, 350]);
  assert.equal((await Q.approve(id)).status, 403, 'a provider cannot approve its own quote');
  t.as('customer', sara);
  const ap = await Q.approve(id); assert.equal(ap.ok, true, JSON.stringify(ap.error));
  assert.equal(ap.data.status, 'approved');
  // Store semantics: approving a quote in the `quote` state completes the job with the quote total as final value.
  const after = (await O.get(id)).data;
  assert.deepEqual([after.status, after.finalValue], ['completed', 350]);
  t.as('provider', 'p_demo1');
  assert.equal((await O.complete(id, 0)).status, 422, 'zero final value refused');
  assert.equal((await O.complete(id, 400)).status, 409, 'already completed');
  t.as('customer', sara);
  assert.equal((await O.review(id, 6)).status, 422);
  assert.equal((await O.close(id)).data.status, 'closed');
  assert.equal((await O.review(id, 5, 'ممتاز')).status, 201);
  assert.equal((await O.review(id, 4)).status, 409, 'one review per request');
  const prof = await t.g.HSCatalogApi.provider('p_demo1');
  assert.ok(prof.data.reviews.some(v => v.comment === 'ممتاز' && v.stars === 5));
});

test('zero-value quote cannot be accepted even if one reaches the store', async () => {
  const t = boot();
  const id = await customerWithRequest(t);
  await toStarted(t, id);
  await t.g.HSQuotesApi.submit(id, { labor: 100 });
  t.run(`MP.currentQuote('${id}').total = 0`);
  t.as('customer', sara);
  const r = await t.g.HSQuotesApi.approve(id);
  assert.deepEqual([r.status, r.error.code], [409, 'CONFLICT']);
});

test('free-service workflow through the API is distinct: no quote, customer consent, value 0, no commission', async () => {
  const t = boot();
  const id = await customerWithRequest(t);
  await toStarted(t, id);
  const Q = t.g.HSQuotesApi, O = t.g.HSOrdersApi;
  assert.ok((await Q.freeReasons()).data.some(r => r.id === 'warranty'));
  assert.equal((await Q.proposeFree(id, 'because')).status, 422);
  assert.equal((await Q.proposeFree(id, 'warranty')).data.status, 'proposed');
  assert.equal((await Q.submit(id, { labor: 100 })).status, 409, 'no quote while a free service is proposed');
  assert.equal((await Q.completeFree(id)).status, 409, 'needs customer consent first');
  t.as('customer', sara);
  assert.equal((await Q.respondFree(id, true)).data.status, 'accepted');
  t.as('provider', 'p_demo1');
  assert.equal((await O.complete(id, 200)).status, 409, 'paid completion blocked on the free path');
  const done = await Q.completeFree(id);
  assert.deepEqual([done.data.status, done.data.finalValue, done.data.freeService.status], ['completed', 0, 'completed']);
  const earn = await t.g.HSFinanceApi.earnings();
  assert.deepEqual([earn.data.totals.freeJobs, earn.data.totals.commission, earn.data.totals.value], [1, 0, 0]);
  t.as('admin', 'e_owner');
  const tx = (await t.g.HSFinanceApi.transactions()).data.items.find(x => x.reqId === id);
  assert.equal((await t.g.HSFinanceApi.setCollection(tx.id, 'collected')).status, 409, 'nothing to collect on a free job');
});

test('onboarding grants no provider role until Admin approves; provider cannot edit status/commission', async () => {
  const t = boot();
  const P = t.g.HSProviderApi;
  t.g.HSAuthApi.useApp('provider');
  const bad = await P.register({ name: '', phone: '12', cats: [], govs: [] });
  assert.equal(bad.status, 422);
  assert.deepEqual(Object.keys(bad.error.details).sort(), ['cats', 'govs', 'name', 'phone']);
  const reg = await P.register({ name: 'فني جديد', phone: '01055554444', type: 'individual', cats: ['plumbing'], govs: ['الجيزة'], years: 3 });
  assert.deepEqual([reg.status, reg.data.status], [201, 'pending']);
  assert.equal((await P.register({ name: 'مكرر', phone: '01055554444', cats: ['plumbing'], govs: ['الجيزة'] })).status, 409);
  t.as('provider', reg.data.id);
  assert.equal(t.g.HSAuthApi.currentActor(), null, 'pending registration has no provider actor');
  assert.equal((await P.me()).status, 401);
  assert.equal(t.g.HSAuthApi.providerBlockReason(t.g.HSApiClient.store(), reg.data.id), 'pending');
  assert.ok(!(await t.g.HSCatalogApi.providers()).data.items.some(p => p.id === reg.data.id), 'not listed publicly while pending');
  t.as('admin', 'e_owner');
  assert.equal((await t.g.HSAdminApi.setProviderStatus(reg.data.id, 'approved')).data.status, 'approved');
  t.as('provider', reg.data.id);
  assert.equal((await P.me()).data.status, 'approved');
  const esc = await P.update({ status: 'approved', specialRate: 0 });
  assert.deepEqual([esc.status, esc.error.details.fields.sort().join()], [403, 'specialRate,status']);
  assert.equal((await P.update({ bio: 'نبذة محدثة', years: 4 })).data.bio, 'نبذة محدثة');
  assert.equal((await P.update({ phone: 'x' })).status, 422);
  assert.equal((await P.setAvailability(false)).data.available, false);
});

test('actor follows the running app: an Admin session never acts inside the Customer app', async () => {
  const t = boot();
  t.g.sessionStorage.setItem('hs_admin_demo_session', 'e_owner');
  t.g.HSAuthApi.useApp(null);
  assert.equal(t.g.HSAuthApi.currentApp(), 'customer');
  assert.equal(t.g.HSAuthApi.currentActor(), null);
  assert.equal((await t.C.get('/admin/summary')).status, 401);
  t.g.location.pathname = '/apps/admin/index.html';
  assert.equal(t.g.HSAuthApi.currentActor().role, 'admin');
  assert.equal((await t.C.get('/auth/me')).data.adminRole, 'owner');
  t.run(`MP.customerFor('${sara.name}','${sara.phone}')`);
  t.as('customer', sara);
  t.run(`MP.db().customers.find(c=>c.phone==='${sara.phone}').status='suspended'`);
  assert.equal(t.g.HSAuthApi.currentActor(), null, 'suspended customers lose their actor');
});

test('public catalogue never exposes private provider fields; admin RBAC is honoured when loaded', async () => {
  const t = boot();
  const list = (await t.g.HSCatalogApi.providers({ cat: 'electric' })).data.items;
  assert.ok(list.length > 0 && list.every(p => p.cats.includes('electric')));
  for (const p of list) for (const k of ['phone', 'docs', 'specialRate', 'status']) assert.ok(!(k in p), k);
  assert.ok((await t.g.HSCatalogApi.categories()).data.length > 0);
  assert.ok((await t.g.HSCatalogApi.services('electric')).data.every(s => s.cat === 'electric'));
  assert.equal((await t.g.HSCatalogApi.provider('nope')).status, 404);
  t.g.HSAdminPermissionGuard = { can: (emp, module, action) => emp.role === 'owner' || action === 'view' };
  t.as('admin', 'e_sup');
  assert.equal((await t.g.HSAdminApi.setProviderStatus('p_demo1', 'suspended')).status, 403, 'support cannot decide');
  assert.equal((await t.g.HSAdminApi.providers()).ok, true, 'support can view');
  t.as('admin', 'e_owner');
  assert.equal((await t.g.HSAdminApi.setProviderStatus('p_demo1', 'rejected')).status, 409, 'reject only pending');
  assert.equal((await t.g.HSAdminApi.setSpecialRate('p_demo1', 80)).status, 422);
  assert.equal((await t.g.HSAdminApi.setSpecialRate('p_demo1', 10)).data.specialRate, 10);
  assert.equal((await t.g.HSFinanceApi.setCommission({ defaultRate: 12 })).data.defaultRate, 12);
  assert.equal((await t.g.HSAdminApi.summary()).data.providers, t.run('MP.db().providers.length'));
});

test('customer self-service, notifications and complaints stay scoped to the caller', async () => {
  const t = boot();
  const id = await customerWithRequest(t);
  const Cu = t.g.HSCustomerApi;
  assert.equal((await Cu.addAddress({ label: 'البيت' })).status, 422);
  const a = await Cu.addAddress({ label: 'البيت', gov: 'القاهرة', area: 'المعادي', addr: 'شارع 9' });
  assert.equal(a.status, 201);
  assert.equal((await Cu.updateAddress(a.data.id, { addr: 'شارع 10' })).data.addr, 'شارع 10');
  assert.equal((await Cu.toggleFavorite('provider', 'p_demo1')).data.favorite, true);
  assert.equal((await Cu.toggleFavorite('bogus', 'x')).status, 422);
  const S = t.g.HSSupportApi;
  assert.equal((await S.file('قصير')).status, 422);
  assert.equal((await S.file('الفني تأخر عن الموعد كثيرًا', id)).status, 201);
  t.run("MP.customerFor('علي','01099998888')"); t.as('customer', { name: 'علي', phone: '01099998888' });
  assert.equal((await Cu.updateAddress(a.data.id, { addr: 'x' })).status, 404, 'another customer cannot touch it');
  assert.equal((await S.file('شكوى على طلب ليس لي', id)).status, 404);
  assert.equal((await S.list()).data.total, 0);
  assert.equal((await t.g.HSNotificationsApi.list()).data.unread, 0);
  t.as('admin', 'e_owner');
  const k = (await S.list('open')).data.items[0];
  assert.equal((await S.resolve(k.id, '')).status, 422);
  assert.equal((await S.resolve(k.id, 'تم التواصل مع الفني')).data.status, 'resolved');
  assert.equal((await S.resolve(k.id, 'مرة أخرى')).status, 409);
  const inbox = await t.g.HSNotificationsApi.list();
  assert.ok(inbox.data.items.length > 0, 'admin inbox has the new-request notice');
  assert.equal((await t.g.HSNotificationsApi.markAllRead()).data.unread, 0);
});

test('realtime-client publishes market:changed on API mutations and cross-tab storage events', async () => {
  const t = boot();
  const seen = [];
  const off = t.g.HSRealtimeClient.subscribe('market:changed', e => seen.push(e.source + ':' + (e.detail && e.detail.path || '')));
  await customerWithRequest(t);
  await t.g.HSOrdersApi.list();
  assert.deepEqual(seen, ['local:/requests'], 'GETs do not publish; the POST does');
  t.fire('storage', { key: 'hs_mp_db' });
  t.fire('storage', { key: 'other' });
  assert.equal(seen[1], 'storage:');
  assert.equal(seen.length, 2);
  off();
  t.fire('storage', { key: 'hs_mp_db' });
  assert.equal(seen.length, 2);
  assert.throws(() => t.g.HSRealtimeClient.subscribe('nope', () => {}), /unknown topic/);
});

test('transport seam: a plugged transport receives requests (with actor) and failures map to UNAVAILABLE', async () => {
  const t = boot();
  const calls = [];
  t.C.setTransport(async req => { calls.push(req); return { ok: true, status: 200, data: { remote: true } }; });
  assert.equal(t.C.mode(), 'remote');
  t.run(`MP.customerFor('${sara.name}','${sara.phone}')`); t.as('customer', sara);
  const r = await t.g.HSOrdersApi.list('completed');
  assert.deepEqual(r.data, { remote: true });
  assert.deepEqual([calls[0].method, calls[0].path, calls[0].query.status, calls[0].actor.role], ['GET', '/requests', 'completed', 'customer']);
  t.C.setTransport(async () => { throw new Error('offline'); });
  const down = await t.C.get('/categories');
  assert.deepEqual([down.status, down.error.code, down.error.message], [503, 'UNAVAILABLE', 'offline']);
  t.C.setTransport(null);
  assert.equal(t.C.mode(), 'mock');
});

test('uploads-api delegates to the local attachment store and keeps the contract envelope', async () => {
  const t = boot();
  const U = t.g.HSUploadsApi;
  assert.equal(U.limits().status, 503, 'no local attachment store loaded');
  const stored = [];
  U._useStore({
    limits: () => ({ maxFiles: 6 }),
    validateFiles: (files) => ({ valid: files.filter(f => f.ok), errors: files.filter(f => !f.ok).map(f => f.name + ': نوع غير مدعوم') }),
    listForReq: async () => stored,
    addFiles: async (reqId, files) => { const added = files.map((f, i) => ({ id: 'att' + i, name: f.name, reqId })); stored.push(...added); return { ok: true, added, errors: [] }; },
    toSummary: rec => ({ id: rec.id, name: rec.name })
  });
  assert.equal(U.limits().data.maxFiles, 6);
  const bad = U.validate([{ name: 'a.exe', ok: false }]);
  assert.deepEqual([bad.status, bad.error.code], [422, 'VALIDATION']);
  assert.equal((await U.upload('', [{ name: 'a.jpg', ok: true }])).status, 422);
  const up = await U.upload('r1', [{ name: 'a.jpg', ok: true }, { name: 'b.exe', ok: false }]);
  assert.deepEqual([up.status, up.data.items.length, up.data.errors.length], [201, 1, 1]);
});

test('no adapter performs network I/O or claims to be live', () => {
  for (const f of ADAPTERS) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /\bfetch\(|XMLHttpRequest|WebSocket\(|EventSource\(|navigator\.sendBeacon|https?:\/\//, f);
    assert.match(src, /STATUS: IMPLEMENTED \(MOCK ADAPTER/, f);
  }
});
