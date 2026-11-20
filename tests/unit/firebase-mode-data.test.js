'use strict';
/* Real-data enforcement in Firebase mode (the production default): no demo/mock data and no demo notices reach the
   UI, local-mode data is kept only as a migration backup, demo account pickers are replaced by real sign-in, and
   Admin pages still built on local fixtures never render those fixtures. Local mode (dev/tests) is unchanged. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const customer = require('../helpers/customer-app-harness.js');
const provider = require('../helpers/provider-app-harness.js');
const ROOT = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('customer, firebase mode: the store starts empty (no demo providers), local-mode data becomes a migration backup, no demo notices', async () => {
  const localModeDb = JSON.stringify({ v: 2, meta: { lastReqNo: 1003 }, customers: [{ id: 'c_x', name: 'محلي', phone: '01011112222', status: 'active' }], providers: [{ id: 'p_demo1', name: 'تجريبي', demo: true, status: 'approved', cats: ['electric'], govs: ['القاهرة'] }], serviceRequests: [], assignments: [], transactions: [], reviews: [], complaints: [], notifications: [], addresses: [], quotes: [], favorites: [], drafts: [], searchHistory: [], serviceAreas: [{ gov: 'القاهرة', areas: [], demo: true }], settings: { defaultRate: 15, rates: {} } });
  const app = customer.boot({ hash: '#/home', local: { hs_backend: 'firebase', hs_mp_db: localModeDb } });
  await app.settle();
  const db = app.run('MP.db()');
  assert.equal(db.providers.length, 0, 'no demo providers in firebase mode');
  assert.equal(db.customers.length, 0, 'local-mode records are not presented as server data');
  assert.equal(db._source, 'firebase');
  assert.equal(app.local.getItem('hs_mp_db_backup_before_firebase'), localModeDb, 'local-mode data is preserved for the owner migration');
  assert.doesNotMatch(app.html(), /بيانات تجريبية — المناطق الفعلية/, 'no demo service-area notice');
  assert.doesNotMatch(app.html(), /وضع العرض التجريبي/, 'no demo-mode banner');
  assert.equal(app.run("HSFirebaseConfig.mode"), 'firebase');
});

test('customer, local mode (dev/tests) keeps the offline demo intact', async () => {
  const app = customer.boot({ hash: '#/home' });
  await app.settle();
  assert.ok(app.run('MP.db().providers.length') > 0, 'demo providers still seed the offline demo');
  assert.equal(app.run('HSFirebaseConfig.mode'), 'local');
});

test('customer, firebase mode: sign-in cannot fall back to a local demo identity', async () => {
  const app = customer.boot({ hash: '#/home', local: { hs_backend: 'firebase' } });
  await app.settle();
  const res = app.run("HSCustomerSession.signIn('سارة', '01011112222')");
  assert.equal(res.ok, false, 'no backend bridge → no local sign-in');
  assert.equal(app.local.getItem('hs_user'), null);
  assert.equal(app.run("MP.db().customers.length"), 0, 'no local customer record is created');
});

test('provider, firebase mode: the demo account picker is replaced by phone sign-in; no demo badge; no demo providers', () => {
  const app = provider.boot({ backend: 'firebase' });
  assert.match(app.html(), /data-pv-signin-screen/);
  assert.match(app.html(), /data-pv-fb-signin/);
  assert.doesNotMatch(app.html(), /pv-account-list|data-pv-action="select"/, 'no demo account list');
  assert.equal(app.MP.db().providers.length, 0);
  assert.doesNotMatch(read('apps/provider/provider-shell.js').match(/pv-top-actions">([^<]*)</)[1] || '', /بيئة تجريبية/);
  const local = provider.boot({});
  assert.match(local.html(), /pv-account-list/, 'local mode keeps the demo picker');
});

test('admin, firebase mode: identity from the server only; fixture pages gated; live summary from the server', () => {
  const app = read('apps/admin/app.js');
  assert.match(app, /if \(root\.HSFirebaseConfig && root\.HSFirebaseConfig\.mode === 'firebase'\) return startFirebase\(host, d\);/, 'no demo roster picker in firebase mode');
  assert.match(app, /d\.session\.select\(a\.employeeId\)/, 'the shell opens for the server-resolved employee');
  const shell = read('apps/admin/admin-shell.js');
  assert.match(shell, /const LIVE_PAGES = new Set\(\['marketplace', 'workforce', 'employee-details', 'roles', 'permissions',\s*'orders', 'customers', 'providers', 'complaints', 'reviews', 'categories', 'quotes', 'finance', 'dashboard', 'settlements'\]\);/);
  assert.match(shell, /else if \(firebaseMode\(\) && !LIVE_PAGES\.has\(id\)\) \{/, 'fixture-backed pages never render fixtures in firebase mode');
  assert.match(shell, /C\.request\('GET', '\/admin\/summary'\)/, 'the dashboard shows live server counts instead of fixture KPIs');
  assert.match(shell, /\$\{firebaseMode\(\) \? '' : '<span class="adm-chip" role="note">واجهة تجريبية<\/span>'\}/);
  for (const page of ['admin-dashboard', 'orders-management', 'customers-management', 'finance-dashboard', 'reports']) {
    assert.ok(fs.existsSync(path.join(ROOT, `apps/admin/pages/${page}.page.js`)), page + ' fixtures are kept for local mode/tests');
  }
});

test('the demo-mode banner and hardcoded service areas are disabled in firebase mode at the source', () => {
  assert.match(read('apps/customer/pages/market-ui.page.js'), /const demoBanner = \(\) => \(typeof HSFirebaseConfig !== 'undefined' && HSFirebaseConfig\.mode === 'firebase'\) \? '' :/);
  assert.match(read('apps/customer/app.js'), /service areas are server data — no hardcoded fallback/);
});

test('HSAdminLive: Admin pages read the server read model and act only through real routes', async () => {
  const vm = require('node:vm');
  const calls = [];
  const mem = new Map(Object.entries({ hs_backend: 'firebase' }));
  const ctx = { console, Date, Math, JSON, Promise, localStorage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) }, location: { search: '' } };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['services/firebase-config.js', 'shared/config/legacy-data.js', 'services/local-catalog.js', 'services/local-market-store.js', 'apps/admin/modules/admin-live.js']) vm.runInContext(read(f), ctx, { filename: f });
  ctx.HSApiClient = { request: (method, p, o) => { calls.push([method, p, o && o.body]); return Promise.resolve({ ok: true, status: 200, data: {} }); } };
  vm.runInContext(`(() => { const d = MP.db();
    d.customers.push({ id: 'c1', name: 'سارة', phone: '01011112222', status: 'active', createdAt: '2026-11-01T10:00:00Z' });
    d.providers.push({ id: 'p1', name: 'كريم', phone: '01099998888', status: 'approved', cats: ['electric'], govs: ['القاهرة'], areas: ['مدينة نصر'], docs: 'بطاقة', jobs: 3, createdAt: '2026-11-01T09:00:00Z' },
                     { id: 'p2', name: 'هاني', phone: '01077776666', status: 'pending', cats: ['electric'], govs: ['القاهرة'], docs: '' });
    d.serviceRequests.push({ id: 'r1', no: 'HS-2026-1001', customerId: 'c1', serviceName: 'إصلاح', cat: 'electric', gov: 'القاهرة', area: 'مدينة نصر', status: 'closed', createdAt: '2026-11-02T10:00:00Z', history: [{ s: 'received', at: '2026-11-02T10:00:00Z', note: '' }] });
    d.assignments.push({ id: 'a1', reqId: 'r1', providerId: 'p1', status: 'accepted' });
    d.transactions.push({ id: 't1', reqId: 'r1', providerId: 'p1', customerId: 'c1', cat: 'electric', value: 350, commission: 52.5, net: 297.5, collection: 'pending', at: new Date().toISOString() },
      { id: 't2', reqId: 'rX', providerId: 'p1', customerId: 'c1', cat: 'cleaning', value: 200, commission: 30, net: 170, collection: 'collected', at: new Date().toISOString() },
      { id: 't3', reqId: 'rY', providerId: 'p1', customerId: 'c1', cat: 'electric', value: 0, commission: 0, net: 0, free: true, collection: 'none', at: new Date().toISOString() });
    d.reviews.push({ id: 'v1', reqId: 'r1', providerId: 'p1', customerId: 'c1', stars: 5, comment: 'ممتاز', at: '2026-11-03T10:00:00Z' });
    d.quotes.push({ id: 'q1', reqId: 'r1', providerId: 'p1', total: 350, status: 'approved', at: '2026-11-02T12:00:00Z' }, { id: 'q0', reqId: 'r1', providerId: 'p1', total: 500, status: 'superseded', at: '2026-11-02T11:00:00Z' });
    d.complaints.push({ id: 'k1', reqId: 'r1', by: 'customer:c1', text: 'تأخير في الموعد', status: 'open', at: '2026-11-03T11:00:00Z' }); })()`, ctx);
  const L = ctx.HSAdminLive;
  assert.equal(L.enabled(), true);
  const o = L.rows('orders')[0];
  assert.equal(o.customer, 'سارة'); assert.equal(o.provider, 'كريم'); assert.equal(o.amount, 350, 'amount from the real transaction'); assert.equal(o.status, 'closed');
  const c = L.rows('customers')[0];
  assert.equal(c.orders, 1); assert.equal(c.spent, 550); assert.equal(c.recent[0].no, 'HS-2026-1001');
  const ps = L.rows('providers');
  assert.equal(ps.find(p => p.id === 'p1').docs.id, true); assert.equal(ps.find(p => p.id === 'p2').docs.id, false, 'no invented document state');
  assert.equal(ps.find(p => p.id === 'p1').rating, 5, 'rating computed from real reviews');
  assert.equal(L.rows('complaints', { TYPES: ['أخرى'] })[0].status, 'review', 'open complaints await admin review');
  assert.equal(L.rows('reviews')[0].rating, 5);
  assert.equal(L.rows('demo-only-entity').length, 0);
  const fin = L.financeRows(30, ['electric', 'plumbing', 'carpentry', 'other'], {});
  assert.deepEqual(JSON.parse(JSON.stringify(fin.find(r => r.id === 'electric'))), { id: 'electric', label: 'electric', gmv: 350, commission: 52.5, collected: 0, uncollected: 52.5, providerNet: 297.5, settled: 0, pendingDues: 0 }, 'finance from real transaction fields; free services excluded');
  assert.equal(fin.find(r => r.id === 'other').collected, 30, 'categories outside the page buckets fall under other');
  const k = L.dashboardKpis(30);
  assert.equal(k.revenue[0], 83, 'revenue = commission of paid transactions in the period (52.5 + 30, rounded)');
  assert.equal(k.providers[0], 1, 'approved providers'); assert.equal(k.complaints[0], 1, 'open complaints'); assert.equal(k.rating[0], 5, 'average stars of reviews in the period');
  const stl = L.rows('settlements', { CATS: [{ id: 'electric', label: 'كهرباء' }, { id: 'other', label: 'أخرى' }] });
  const pendRow = stl.find(x => x.id === 'stl:pending:p1'), doneRow = stl.find(x => x.id === 'stl:done:p1');
  assert.equal(pendRow.amount, 52.5, 'uncollected platform share (cash model)'); assert.equal(pendRow.status, 'approved', 'system-computed balance, ready to collect');
  assert.equal(doneRow.amount, 30); assert.equal(doneRow.status, 'completed');
  const n0 = calls.length;
  await L.status('settlements', 'stl:pending:p1', 'completed');
  assert.deepEqual(calls.slice(n0).map(x => x[0] + ' ' + x[1] + ' ' + x[2].status), ['POST /admin/transactions/t1/collection collected'], 'collecting marks each pending transaction collected (existing route)');
  assert.equal((await L.status('settlements', 'stl:pending:p1', 'on_hold')).status, 501, 'no hold rule on the server');
  calls.length = 0;
  const qs = L.rows('quotes');
  assert.equal(qs.find(q => q.id === 'q1').status, 'approved'); assert.equal(qs.find(q => q.id === 'q1').amount, 350); assert.equal(qs.find(q => q.id === 'q1').provider, 'كريم');
  assert.equal(qs.find(q => q.id === 'q0').status, 'returned', 'a superseded quote is shown as returned for a new offer');
  assert.equal(qs.find(q => q.id === 'q1').validUntil, null, 'no invented expiry');
  const cats = L.rows('categories');
  assert.ok(cats.length > 7 && cats.filter(c => c.parentId === null).length === vm.runInContext('CAT.db().categories.length', ctx), 'the real catalogue: every category as a root, its devices/work types as children');
  assert.ok(cats.every(c => c.parentId === null || cats.some(p => p.id === c.parentId)), 'consistent tree');
  assert.equal((await L.status('categories', cats[0].id, 'inactive')).status, 501, 'catalogue editing is refused until a server route exists');

  await L.status('orders', 'r1', 'cancelled');
  await L.status('customers', 'c1', 'suspended');
  await L.status('providers', 'p2', 'approved');
  await L.status('complaints', 'k1', 'resolved');
  assert.deepEqual(calls.map(x => x[0] + ' ' + x[1]), ['POST /requests/r1/cancel', 'POST /admin/customers/c1/status', 'POST /admin/providers/p2/status', 'POST /complaints/k1/resolve']);
  const before = calls.length;
  const un = await L.status('orders', 'r1', 'enroute');
  assert.equal(un.ok, false); assert.equal(un.status, 501, 'admin cannot fake a provider transition');
  assert.equal((await L.status('complaints', 'k1', 'dismissed')).status, 501);
  assert.equal((await L.status('reviews', 'v1', 'flagged')).status, 501, 'only hide / publish are real review actions');
  assert.equal(L.supports('reviews', 'hidden'), true); assert.equal(L.supports('quotes', 'approved'), false, 'quotes stay read-only for the admin');
  assert.equal(calls.length, before, 'unsupported actions never reach the network or the local store');
});
test('HSAdminLivePanels: every remaining Admin page renders server data from real routes (no fixtures)', async () => {
  const vm = require('node:vm');
  const calls = [];
  const replies = {
    'GET /admin/audit': { items: [{ id: 'a1', at: '2026-11-15T11:00:00Z', action: 'claimOwner', uid: 'u1' }] },
    'GET /admin/settings': { autoAssign: true, customerFee: false, collectionModel: 'platform', markupRate: 15, defaultRate: 15 },
    'GET /admin/departments': { items: [{ id: 'd1', name: 'العمليات', parentId: null, status: 'active', headId: null }] },
    'GET /admin/security/admins': { items: [{ uid: 'u1', name: 'المالك', email: 'owner@example.test', role: 'owner', lastSignIn: '2026-11-15T10:00:00Z' }] },
    'GET /admin/notifications/broadcasts': { items: [{ id: 'b1', audience: 'customers', text: 'عرض خاص', recipients: 3, at: '2026-11-15T10:00:00Z' }] },
    'GET /admin/commission': { defaultRate: 15, rates: { electric: 12 } },
    'GET /admin/pricing': { markupRate: 10, prices: {} },
    'GET /admin/summary': { requests: 4, unassigned: 1, providers: 2, pending: 1, openComplaints: 0, uncollected: 1 }
  };
  const ctx = { console, Date, Math, JSON, Promise, Intl };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read('apps/admin/modules/admin-live-panels.js'), ctx);
  ctx.HSApiClient = { request: (m, p) => { calls.push(m + ' ' + p); const d = replies[m + ' ' + p]; return Promise.resolve(d ? { ok: true, status: 200, data: d } : { ok: false, status: 404, error: { message: 'x' } }); } };
  ctx.MP = { db: () => ({ serviceRequests: [{ status: 'closed' }], transactions: [{ value: 220, commission: 20, collection: 'pending', at: new Date().toISOString() }] }), catName: k => k };
  const P = ctx.HSAdminLivePanels;
  assert.deepEqual([...P.ids].sort(), ['audit', 'commissions', 'departments', 'notifications', 'reports', 'security', 'services', 'settings', 'super-dashboard']);
  const host = () => ({ innerHTML: '', querySelector: () => ({ addEventListener() {} }), querySelectorAll: () => [] });
  const out = {};
  for (const id of P.ids) { const h = host(); await P.mount(id, h); out[id] = h.innerHTML; }
  assert.match(out.audit, /تسجيل المالك لأول مرة/);   // «سجل الإداريين» shows actions in Arabic
  assert.match(out.settings, /name="markupRate"[^>]*value="15"/);
  assert.match(out.departments, /العمليات/);
  assert.match(out.security, /data-revoke="u1"/);
  assert.match(out.notifications, /عرض خاص/);
  assert.match(out.commissions, /12٪/);
  assert.match(out['super-dashboard'], /بيانات حية من الخادم/);
  assert.match(out.reports, /حصة المنصة/);
  for (const id of P.ids) assert.doesNotMatch(out[id], /تجريبي|DEMO/i, id + ': no demo data');
  assert.ok(['GET /admin/audit', 'GET /admin/settings', 'GET /admin/departments', 'GET /admin/security/admins', 'GET /admin/notifications/broadcasts', 'GET /admin/commission', 'GET /admin/summary'].every(c => calls.includes(c)), 'each panel reads its real route');
});