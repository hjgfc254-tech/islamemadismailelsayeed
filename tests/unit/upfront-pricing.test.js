'use strict';
/* Upfront pricing (Uber model) in the shared domain: admin base price per service = provider amount; the customer
   price adds the platform markup and is fixed at booking; a price adjustment (quote) keeps the same markup; completion
   records customer price / provider amount / platform fee exactly; without a configured price the previous flow stays. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');
const FILES = ['shared/config/legacy-data.js', 'services/local-catalog.js', 'services/local-market-store.js', 'services/api-client.js', 'services/auth-api.js',
  'services/orders-api.js', 'services/quotes-api.js', 'services/catalog-api.js', 'services/provider-api.js', 'services/customer-api.js', 'services/finance-api.js', 'services/admin-api.js'];

function boot() {
  const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  const ctx = { console, setTimeout, clearTimeout, Promise, JSON, Date, Math, localStorage: mem(), sessionStorage: mem(), addEventListener() {}, removeEventListener() {}, location: { pathname: '/x' } };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const run = c => vm.runInContext(c, ctx);
  run('MP.db().settings.autoAssign = false');
  const C = ctx.HSApiClient;
  const as = role => ({ admin: { role: 'admin', id: 'e1', adminRole: 'owner' }, customer: { role: 'customer', id: run("MP.customerFor('سارة','01011112222').id") }, provider: { role: 'provider', id: 'p_demo1' } }[role]);
  const call = (role, method, p, body) => C.request(method, p, { body, actor: as(role) });
  return { run, call, C };
}
const ITEM = () => 'electric/dist-board';
const REQ = { cat: 'electric', itemId: ITEM(), serviceName: 'لوحة كهرباء', desc: 'فصل متكرر', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع 1' };

async function toStarted(t, id) {
  assert.equal((await t.call('admin', 'POST', `/admin/requests/${id}/assign`, { providerId: 'p_demo1' })).ok, true);
  assert.equal((await t.call('provider', 'POST', `/requests/${id}/respond`, { accept: true })).ok, true);
  assert.equal((await t.call('provider', 'POST', `/requests/${id}/schedule`, { at: '2026-11-20T10:00' })).ok, true);
  assert.equal((await t.call('customer', 'POST', `/requests/${id}/schedule`, {})).ok, true);
  for (const to of ['enroute', 'arrived', 'started']) assert.equal((await t.call('provider', 'POST', `/requests/${id}/advance`, { to })).ok, true, to);
}

test('admin sets base prices and the markup; the public price list shows customer prices only', async () => {
  const t = boot();
  assert.equal((await t.call('admin', 'POST', '/admin/pricing', { key: ITEM(), base: 200 })).ok, true);
  assert.equal((await t.call('admin', 'POST', '/admin/pricing', { markupRate: 10 })).ok, true);
  assert.equal((await t.call('admin', 'POST', '/admin/pricing', { key: ITEM(), base: 0 })).status, 422, 'a base price must be > 0');
  assert.equal((await t.call('admin', 'POST', '/admin/pricing', { markupRate: 150 })).status, 422);
  assert.equal((await t.call('customer', 'POST', '/admin/pricing', { key: ITEM(), base: 1 })).status, 403, 'customers cannot set prices');
  const pub = await t.call('customer', 'GET', '/pricing');
  assert.equal(pub.data.prices[ITEM()], 220, 'customer price = base × (1 + 10%)');
  assert.ok(!JSON.stringify(pub.data).includes('200'), 'the provider amount is not in the public list');
  const adm = await t.call('admin', 'GET', '/admin/pricing');
  assert.equal(adm.data.prices[ITEM()], 200);
});

test('booking fixes the upfront price; completion splits it exactly (customer pays, provider receives base, platform keeps the difference)', async () => {
  const t = boot();
  await t.call('admin', 'POST', '/admin/pricing', { key: ITEM(), base: 200 });
  await t.call('admin', 'POST', '/admin/pricing', { markupRate: 10 });
  const created = await t.call('customer', 'POST', '/requests', REQ);
  assert.equal(created.status, 201);
  assert.deepEqual(JSON.parse(JSON.stringify(created.data.pricing)), { base: 200, rate: 10, customerPrice: 220, providerAmount: 200, platformFee: 20 });
  await t.call('admin', 'POST', '/admin/pricing', { key: ITEM(), base: 999 });
  assert.equal(t.run(`MP.get('serviceRequests','${created.data.id}').pricing.customerPrice`), 220, 'a later price change never alters a booked request');
  await toStarted(t, created.data.id);
  assert.equal((await t.call('provider', 'POST', `/requests/${created.data.id}/complete`, { value: 150 })).ok, false, 'the booked price is final');
  assert.equal((await t.call('provider', 'POST', `/requests/${created.data.id}/complete`, {})).ok, true);
  const tx = JSON.parse(t.run(`JSON.stringify(MP.db().transactions.find(x => x.reqId === '${created.data.id}'))`));
  assert.equal(tx.value, 220); assert.equal(tx.net, 200); assert.equal(tx.commission, 20); assert.equal(tx.pricing, 'upfront');
  assert.equal(tx.collection, 'pending', 'cash to the provider: the platform share is collected from the provider (settlement)');
});

test('a price adjustment after inspection keeps the same markup and needs the customer approval', async () => {
  const t = boot();
  await t.call('admin', 'POST', '/admin/pricing', { key: ITEM(), base: 200 });
  await t.call('admin', 'POST', '/admin/pricing', { markupRate: 10 });
  const id = (await t.call('customer', 'POST', '/requests', REQ)).data.id;
  await toStarted(t, id);
  assert.equal((await t.call('provider', 'POST', `/requests/${id}/quotes`, { labor: 300, parts: 100, note: 'تغيير القاطع الرئيسي' })).ok, true);
  const q = JSON.parse(t.run(`JSON.stringify(MP.currentQuote('${id}'))`));
  assert.equal(q.providerAmount, 400); assert.equal(q.customerTotal, 440); assert.equal(q.platformFee, 40);
  assert.equal((await t.call('provider', 'POST', `/requests/${id}/complete`, {})).ok, false, 'no completion while the adjustment awaits the customer');
  assert.equal((await t.call('customer', 'POST', `/requests/${id}/quote/approve`)).ok, true);
  assert.equal(t.run(`MP.get('serviceRequests','${id}').pricing.customerPrice`), 440);
  assert.equal((await t.call('provider', 'POST', `/requests/${id}/complete`, {})).ok, true);
  const tx = JSON.parse(t.run(`JSON.stringify(MP.db().transactions.find(x => x.reqId === '${id}'))`));
  assert.deepEqual([tx.value, tx.net, tx.commission], [440, 400, 40]);
});

test('without a configured price the previous flow is unchanged (value at completion, commission rate)', async () => {
  const t = boot();
  const created = await t.call('customer', 'POST', '/requests', { ...REQ, itemId: 'no-price-item' });
  assert.equal(created.data.pricing, undefined);
  await toStarted(t, created.data.id);
  assert.equal((await t.call('provider', 'POST', `/requests/${created.data.id}/complete`, { value: 300 })).ok, true);
  const tx = JSON.parse(t.run(`JSON.stringify(MP.db().transactions.find(x => x.reqId === '${created.data.id}'))`));
  assert.equal(tx.value, 300); assert.equal(tx.pricing, undefined);
});
