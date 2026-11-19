'use strict';
/* Routes and store operations that no other test exercised (found with the V8 coverage map): customer self-service
   (profile, addresses, favorites, devices, invite code), admin marketing read / candidates / customer status, provider
   choice by the customer, photos and attachment ids, commission collection and per-category rates, failure path,
   drafts and recent searches. Real domain through the API adapters, role and ownership checks included. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const FILES = ['shared/config/legacy-data.js', 'services/local-catalog.js', 'services/local-market-store.js',
  ...['api-client', 'auth-api', 'orders-api', 'quotes-api', 'catalog-api', 'provider-api', 'customer-api', 'notifications-api', 'support-api', 'finance-api', 'admin-api', 'uploads-api', 'realtime-client'].map(n => `services/${n}.js`)];
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() }; };
function boot() {
  const ctx = { console, setTimeout, clearTimeout, Promise, JSON, Date, Math, Intl, localStorage: mem(), sessionStorage: mem(), addEventListener() {}, removeEventListener() {},
    location: { pathname: '/apps/customer/index.html' }, HSAdminRbac: { state: { roster: [{ id: 'e_owner', name: 'مالك', role: 'owner', status: 'active' }] } } };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const run = code => vm.runInContext(code, ctx);
  run('MP.db().settings.autoAssign = false');
  const as = (app, v) => {
    ctx.HSAuthApi.useApp(app);
    if (app === 'customer') { ctx.localStorage.setItem('hs_user', JSON.stringify(v)); run(`MP.customerFor(${JSON.stringify(v.name)}, ${JSON.stringify(v.phone)})`); }
    if (app === 'provider') ctx.sessionStorage.setItem('hs_provider_demo_session', v);
    if (app === 'admin') ctx.sessionStorage.setItem('hs_admin_demo_session', v);
  };
  return { g: ctx, run, as, O: ctx.HSOrdersApi, C: ctx.HSCustomerApi, A: ctx.HSAdminApi, F: ctx.HSFinanceApi };
}
const plain = x => JSON.parse(JSON.stringify(x));
const SARA = { name: 'سارة', phone: '01011112222' }, OMAR = { name: 'عمر', phone: '01033334444' };
const REQ = { cat: 'electric', serviceName: 'إصلاح انقطاع كهرباء', desc: 'وصف', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع 1' };

test('customer self-service: profile, addresses (default, update, remove), favorites, devices, invite code — own data only', async () => {
  const t = boot();
  t.as('customer', SARA);
  const me = await t.C.me();
  assert.equal(me.ok, true); assert.equal(me.data.name, 'سارة');
  assert.equal((await t.C.updateMe({ name: 'سارة أحمد' })).ok, true);
  assert.equal((await t.C.me()).data.name, 'سارة أحمد');
  assert.equal((await t.C.updateMe({ name: '' })).ok, false, 'an empty name is refused');
  /* addresses */
  const a1 = await t.C.addAddress({ label: 'البيت', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1', default: true });
  assert.equal(a1.ok, true, JSON.stringify(a1.error));
  const a2 = (await t.C.addAddress({ label: 'الشغل', gov: 'الجيزة', area: 'الدقي', addr: 'ش 2' })).data;
  assert.equal((await t.C.addresses()).data.length, 2);
  assert.equal((await t.C.updateAddress(a2.id, { label: 'المكتب' })).ok, true);
  assert.equal((await t.C.addresses()).data.find(a => a.id === a2.id).label, 'المكتب');
  assert.equal(t.run(`MP.defaultAddress(MP.db().customers.find(c => c.phone === '01011112222').id).id`), a1.data.id);
  /* another customer cannot touch Sara's address */
  t.as('customer', OMAR);
  assert.notEqual((await t.C.removeAddress(a2.id)).ok, true, 'not your address');
  assert.equal((await t.C.addresses()).data.length, 0);
  t.as('customer', SARA);
  assert.equal((await t.C.removeAddress(a2.id)).ok, true);
  assert.equal((await t.C.addresses()).data.length, 1);
  /* favorites toggle on and off */
  const pid = t.run(`MP.db().providers.find(p => p.status === 'approved').id`);
  assert.equal((await t.C.toggleFavorite('provider', pid)).ok, true);
  assert.ok(plain((await t.C.favorites()).data).some(f => f.refId === pid));
  await t.C.toggleFavorite('provider', pid);
  assert.ok(!plain((await t.C.favorites()).data).some(f => f.refId === pid), 'toggled off');
  /* «بيتي» devices */
    assert.equal((await t.C.addDevice({ brand: 'x' })).ok, false, 'the appliance is required');
  const d = await t.C.addDevice({ item: 'تكييف الصالة', brand: 'شارب', year: 2022 });
  assert.equal(d.ok, true, JSON.stringify(d.error));
  const devs = plain((await t.C.devices()).data);
  assert.equal(devs.length, 1);
  assert.equal((await t.C.removeDevice(devs[0].id)).ok, true);
  assert.equal(plain((await t.C.devices()).data).length, 0);
  /* invite code: refused while the program is off, then stable */
  assert.equal((await t.C.refCode()).ok, false, 'referral program off by default');
  t.run(`MP.db().settings.referral = { on: true, reward: 30 }`);
  const c1 = (await t.C.refCode()).data, c2 = (await t.C.refCode()).data;
  assert.ok(c1); assert.deepEqual(plain(c1), plain(c2));
  /* account deletion */
  assert.equal((await t.C.deleteMe()).ok, true);
});

test('admin: marketing settings read back what was saved; matching candidates; suspend a customer', async () => {
  const t = boot();
  t.as('admin', 'e_owner');
  const m0 = (await t.A.marketing()).data;
  assert.equal(m0.bidding, false); assert.equal(m0.cancelFee, 50); assert.equal(m0.inspectionCap.default, 0, 'no built-in cap');
  assert.equal(m0.warranty.default, 30, 'a month by default');
  assert.equal((await t.A.saveMarketing({ bidding: true, cancelFee: 70, inspection: { cats: { plumbing: true } }, priceCaps: { cats: { electric: 900 } } })).ok, true);
  const m1 = (await t.A.marketing()).data;
  assert.equal(m1.bidding, true); assert.equal(m1.cancelFee, 70); assert.equal(m1.inspection.cats.plumbing, true); assert.equal(m1.priceCaps.cats.electric, 900);
  assert.equal((await t.A.saveMarketing({ cancelFee: -5 })).ok, false, 'validated');
  assert.equal((await t.A.saveMarketing({ inspection: { cats: { 'BAD KEY!': true } } })).ok, false, 'keys validated');
  /* candidates for a request */
  t.as('customer', SARA); const id = (await t.O.create(REQ)).data.id;
  t.as('admin', 'e_owner');
  const cands = (await t.A.candidates(id)).data;
  assert.ok(Array.isArray(plain(cands)) || Array.isArray(plain(cands).list), 'candidates listed');
  /* non-admins are refused */
  t.as('customer', SARA); assert.equal((await t.A.marketing()).ok, false);
  /* suspend a customer → they can no longer act */
  t.as('admin', 'e_owner');
  const cid = t.run(`MP.db().customers.find(c => c.phone === '01011112222').id`);
  assert.equal((await t.A.setCustomerStatus(cid, 'suspended')).ok, true);
  assert.equal(t.run(`MP.get('customers', ${JSON.stringify(cid)}).status`), 'suspended');
  assert.equal((await t.A.setCustomerStatus(cid, 'nope')).ok, false);
});

test('orders: the customer picks a provider; photos on demand; attachment ids; failure path notifies the customer', async () => {
  const t = boot();
  t.as('customer', SARA);
  const id = (await t.O.create(REQ)).data.id;
  const pid = t.run(`MP.candidates(MP.get('serviceRequests', ${JSON.stringify(id)}))[0].id`);
  assert.equal((await t.O.chooseProvider(id, pid)).ok, true);
  assert.equal(t.run(`MP.activeAssignment(${JSON.stringify(id)}).providerId`), pid);
  assert.equal((await t.O.chooseProvider(id, pid)).ok, false, 'only while unassigned');
  t.as('customer', OMAR); assert.equal((await t.O.chooseProvider(id, pid)).ok, false, 'not your request');
  t.as('customer', SARA);
  const ph = await t.O.photos(id);
  assert.equal(ph.ok, true); assert.equal(plain(ph.data).before || null, null, 'no photos yet');
  const att = await t.O.attachments(id, ['att_1', 'att_2']);
  assert.equal(att.ok, true, JSON.stringify(att.error));
  assert.deepEqual(plain(t.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).attachments`)).map(a => a.id || a), ['att_1', 'att_2']);
  /* failure path */
  assert.equal(t.run(`MP.fail(${JSON.stringify(id)}, 'الجهاز محتاج قطعة مش متاحة')`), true);
  assert.equal(t.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).status`), 'failed');
  assert.equal(t.run(`MP.fail(${JSON.stringify(id)}, 'x')`), false, 'final status');
  assert.ok(t.run(`MP.db().notifications.some(n => n.reqId === ${JSON.stringify(id)} && /تعذر/.test(n.text))`));
  t.run(`MP.notifyAdmin('رسالة للإدارة', ${JSON.stringify(id)})`);
  assert.ok(t.run(`MP.db().notifications.some(n => n.to === 'admin' && n.text === 'رسالة للإدارة')`));
  assert.ok(t.run(`MP.byStatus(r => r.status === 'failed').some(r => r.id === ${JSON.stringify(id)})`));
});

test('finance: commission collection status and per-category rates through the admin API', async () => {
  const t = boot();
  t.run(`MP.db().transactions.push({ id: 't_q1', reqId: 'r_x', providerId: 'p_demo1', customerId: 'c', cat: 'electric', value: 500, rate: 10, commission: 50, deductions: 0, net: 450, collection: 'pending', at: new Date().toISOString() })`);
  t.as('admin', 'e_owner');
  assert.equal((await t.F.setCollection('t_q1', 'collected')).ok, true);
  assert.equal(t.run(`MP.get('transactions', 't_q1').collection`), 'collected');
  assert.equal((await t.F.setCollection('t_q1', 'whatever')).ok, false, 'validated');
  assert.equal((await t.F.setCommission({ cat: 'electric', rate: 12 })).ok, true);
  assert.equal(t.run(`MP.rateFor('electric')`), 12);
  assert.equal((await t.F.setCommission({ cat: 'electric', rate: null })).ok, true, 'clear back to the default');
  assert.equal(t.run(`MP.db().settings.rates.electric`), undefined);
  assert.equal((await t.F.setCommission({ cat: 'electric', rate: 150 })).ok, false, '0–100 %');
  t.as('provider', 'p_demo1'); assert.equal((await t.F.setCollection('t_q1', 'pending')).ok, false, 'admin only');
});

test('wizard draft and recent searches are per customer and bounded', () => {
  const t = boot();
  t.run(`MP.saveDraft('c1', { step: 3, cat: 'electric' })`);
  assert.equal(t.run(`MP.db().drafts.find(d => d.customerId === 'c1').data?.step ?? MP.db().drafts.find(d => d.customerId === 'c1').step`), 3);
  t.run(`MP.clearDraft('c1')`);
  assert.equal(t.run(`MP.db().drafts.some(d => d.customerId === 'c1')`), false);
  for (let i = 0; i < 30; i++) t.run(`MP.addSearch('c1', 'بحث ${i}')`);
  t.run(`MP.addSearch('c1', 'بحث 29')`);
  t.run(`MP.addSearch('c2', 'غسالة'); MP.addSearch('c1', '')`);
  const mine = plain(t.run(`MP.recentSearches('c1', 50)`));
  assert.equal(mine.length, 29, 'bounded to 30 entries overall (c2 took one)');
  assert.equal(mine[0].q, 'بحث 29', 'a repeated search moves to the top');
  assert.ok(!mine.some(s => s.q === 'غسالة'), 'per customer');
  assert.equal(new Set(mine.map(s => s.q)).size, mine.length, 'no duplicates');
});
