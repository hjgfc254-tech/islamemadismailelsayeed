'use strict';
/* Full profiles (apps/admin/modules/profile-360.js): pure view models, links, registration and permissions. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const P = require(path.join(ROOT, 'apps/admin/modules/profile-360.js'));

const DB = {
  customers: [{ id: 'c1', name: 'منى', phone: '01000000001', status: 'active', createdAt: '2026-11-01T10:00:00Z' }, { id: 'c2', name: 'كريم', phone: '01000000002' }],
  providers: [{ id: 'p1', name: 'أحمد', phone: '01100000001', status: 'approved', cats: ['electric'], govs: ['القاهرة'], available: true, warnings: 1, specialRate: 8 }],
  serviceRequests: [
    { id: 'r1', no: 'HS-1', customerId: 'c1', serviceName: 'تركيب نجفة', cat: 'electric', status: 'closed', createdAt: '2026-11-10T10:00:00Z', agreedValue: 300,
      payment: { method: 'online', status: 'held', paid: 300 }, history: [{ s: 'received', at: '2026-11-10T10:00:00Z' }, { s: 'closed', at: '2026-11-11T10:00:00Z' }] },
    { id: 'r2', no: 'HS-2', customerId: 'c1', serviceName: 'مفتاح', cat: 'electric', status: 'searching', createdAt: '2026-11-12T10:00:00Z' },
    { id: 'r3', no: 'HS-3', customerId: 'c2', serviceName: 'فيشة', cat: 'electric', status: 'cancelled', createdAt: '2026-11-09T10:00:00Z' }
  ],
  assignments: [{ reqId: 'r1', providerId: 'p1', status: 'accepted' }, { reqId: 'r3', providerId: 'p1', status: 'declined' }],
  transactions: [{ id: 't1', reqId: 'r1', providerId: 'p1', customerId: 'c1', value: 300, commission: 30, collection: 'pending', at: '2026-11-11T10:00:00Z' }],
  complaints: [{ id: 'k1', reqId: 'r1', by: 'customer:c1', providerId: 'p1', text: 'اتأخر', status: 'open', at: '2026-11-11T12:00:00Z' }],
  reviews: [{ id: 'v1', reqId: 'r1', customerId: 'c1', providerId: 'p1', stars: 4, comment: 'كويس', at: '2026-11-11T13:00:00Z' }],
  quotes: []
};

test('customer profile: orders (newest first), complaints, reviews and totals', () => {
  const m = P.customerModel(DB, 'c1');
  assert.deepEqual(m.reqs.map((x) => x.r.no), ['HS-2', 'HS-1']);
  assert.equal(m.reqs[1].provider.id, 'p1');
  assert.deepEqual({ ...m.stats }, { total: 2, active: 1, done: 1, cancelled: 0, spent: 300 });
  assert.equal(m.complaints.length, 1);
  assert.equal(m.reviews.length, 1);
  assert.equal(P.customerModel(DB, 'nope'), null);
});

test('provider profile: accepted work only, money owed, held online money, rating from visible reviews', () => {
  const m = P.providerModel(DB, 'p1');
  assert.deepEqual(m.reqs.map((x) => x.r.id), ['r1']);
  assert.equal(m.stats.offers, 2);
  assert.equal(m.stats.declined, 1);
  assert.equal(m.money.pending, 30);
  assert.equal(m.money.held, 300);
  assert.equal(m.stats.rating, 4);
  assert.equal(m.complaints.length, 1);
});

test('order profile: parties, offers, payment, complaint, review and what an admin may do', () => {
  const m = P.orderModel(DB, 'r1');
  assert.equal(m.customer.id, 'c1');
  assert.equal(m.provider.id, 'p1');
  assert.equal(m.amount, 300);
  assert.equal(m.tx.id, 't1');
  assert.equal(m.complaints.length, 1);
  assert.equal(m.review.id, 'v1');
  assert.equal(m.assignable, false);
  assert.equal(m.cancellable, false);
  const open = P.orderModel(DB, 'r2');
  assert.equal(open.assignable, true);
  assert.equal(open.cancellable, true);
  assert.equal(open.provider, null);
});

test('links: one route per record, ids encoded and read back', () => {
  assert.equal(P.href('order', 'r/1 x'), '#/order/r%2F1%20x');
  assert.equal(P.idFromHash('#/order/r%2F1%20x'), 'r/1 x');
  assert.equal(P.idFromHash('#/customer/c1?x=1'), 'c1');
});

test('wiring: hidden routes under their list, live page, permissions, loaded script, palette and list links', () => {
  const shell = require(path.join(ROOT, 'apps/admin/admin-shell.js'));
  const H = shell._internals.HIDDEN_PAGES;
  assert.deepEqual([H.customer.parent, H.provider.parent, H.order.parent], ['customers', 'providers', 'orders']);
  const G = require(path.join(ROOT, 'apps/admin/permission-guard.js'));
  assert.deepEqual([G.ROUTE_MODULE.customer, G.ROUTE_MODULE.provider, G.ROUTE_MODULE.order], ['customers', 'providers', 'orders']);
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert.match(read('apps/admin/admin-shell.js'), /'customer', 'provider', 'order'\]\)/);   // LIVE_PAGES: real data in production
  assert.match(read('apps/admin/index.html'), /<script src="modules\/profile-360\.js"><\/script><script src="pages\/profiles\.page\.js"><\/script>/);
  assert.match(read('apps/admin/pages/profiles.page.js'), /registerPage\('customer'[\s\S]*registerPage\('provider'[\s\S]*registerPage\('order'/);
  assert.match(read('service-worker.js'), /'apps\/admin\/modules\/profile-360\.js'/);
  assert.match(read('apps/admin/modules/command-palette.js'), /P\.href\(kind, id\)/);
  for (const f of ['orders-management', 'customers-management', 'providers-management']) assert.match(read(`apps/admin/pages/${f}.page.js`), /HSAdminProfile\.href\(/);
  assert.match(read('apps/admin/pages/marketplace.page.js'), /pf\('order', r\.id, r\.no\)/);
});

test('views escape record data', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const db = JSON.parse(JSON.stringify(DB)); db.customers[0].name = evil; db.serviceRequests[0].serviceName = evil;
  const vm = require('node:vm');
  const ctx = { console, Intl, Date, Math, JSON, String, Number, Array, Object, Set, Promise, encodeURIComponent, decodeURIComponent };
  ctx.globalThis = ctx; vm.createContext(ctx);
  ctx.MP = { db: () => db, catName: (c) => c, candidates: () => [] };
  ctx.document = { createElement: () => { const el = { className: '', innerHTML: '', addEventListener() {}, querySelector: () => null }; return el; } };
  ctx.location = { hash: '#/customer/c1' };
  vm.runInContext(read2('apps/admin/modules/profile-360.js'), ctx);
  for (const [kind, id] of [['customer', 'c1'], ['order', 'r1'], ['provider', 'p1']]) {
    ctx.location.hash = '#/' + kind + '/' + id;
    const html = ctx.HSAdminProfile.render(kind, {}).innerHTML;
    assert.ok(html.length > 200, kind + ' renders');
    assert.doesNotMatch(html, /<img src=x/, kind + ' escapes data');
  }
  ctx.location.hash = '#/order/missing';
  assert.match(ctx.HSAdminProfile.render('order', {}).innerHTML, /مش موجود/);
});
function read2(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
