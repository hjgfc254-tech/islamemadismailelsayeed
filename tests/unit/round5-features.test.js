'use strict';
/* Round 5 (Uber/DiDi/Talabat-style features) on the real domain through the API adapters:
   in-request chat, provider rates the customer, arrival estimate, promo codes / invite-a-friend / credit (paid from the
   platform fee, provider net unchanged), maintenance packages, «same provider again», today's demand counts. */
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
    if (app === 'customer') ctx.localStorage.setItem('hs_user', JSON.stringify(v));
    if (app === 'provider') ctx.sessionStorage.setItem('hs_provider_demo_session', v);
    if (app === 'admin') ctx.sessionStorage.setItem('hs_admin_demo_session', v);
  };
  return { g: ctx, run, as, O: ctx.HSOrdersApi };
}
const REQ = { cat: 'electric', serviceName: 'إصلاح انقطاع كهرباء', desc: 'وصف', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع 1' };
const SARA = { name: 'سارة', phone: '01011112222' }, OMAR = { name: 'عمر', phone: '01033334444' };

async function create(t, who, extra = {}) {
  t.run(`MP.customerFor(${JSON.stringify(who.name)},${JSON.stringify(who.phone)})`);
  t.as('customer', who);
  return t.O.create({ ...REQ, ...extra });
}
async function toStarted(t, id, eta) {
  t.as('admin', 'e_owner'); assert.equal((await t.g.HSAdminApi.assign(id, 'p_demo1')).ok, true);
  t.as('provider', 'p_demo1');
  assert.equal((await t.O.respond(id, true)).ok, true);
  assert.equal((await t.O.schedule(id)).ok, true);
  assert.equal((await t.O.advance(id, 'enroute', eta)).ok, true);
  for (const to of ['arrived', 'started']) assert.equal((await t.O.advance(id, to)).ok, true, to);
}
async function marketing(t, patch) { t.as('admin', 'e_owner'); return t.g.HSAdminApi.saveMarketing(patch); }

test('chat opens only after a provider accepted; each provider sees only their own thread; length is bounded', async () => {
  const t = boot();
  const id = (await create(t, SARA)).data.id;
  assert.equal((await t.O.message(id, 'فيه حد جاي؟')).status, 409, 'no accepted provider yet');
  t.as('admin', 'e_owner'); await t.g.HSAdminApi.assign(id, 'p_demo1');
  t.as('provider', 'p_demo1'); await t.O.respond(id, true);
  assert.equal((await t.O.message(id, 'هكون عندك الساعة 5')).status, 201);
  t.as('customer', SARA);
  const res = await t.O.message(id, 'تمام  مستنيك');
  assert.equal(res.status, 201); assert.equal(res.data.chat.length, 2);
  assert.deepEqual(res.data.chat.map(m => m.by), ['provider', 'customer']); assert.equal(res.data.chat[1].text, 'تمام مستنيك', 'whitespace collapsed');
  assert.equal((await t.O.message(id, 'x'.repeat(501))).status, 422);
  assert.ok(t.run(`MP.notesFor('provider:p_demo1').some(n => /رسالة من العميل/.test(n.text))`), 'the other side is notified');
  t.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).chat.push({ id:'mx', by:'provider', pid:'p_other', text:'قديم', at:new Date().toISOString() })`);
  t.as('provider', 'p_demo1');
  const pv = await t.O.get(id);
  assert.ok(pv.data.chat.every(m => m.pid === 'p_demo1'), 'a reassigned provider never sees an earlier provider\'s messages');
});

test('arrival estimate: optional minutes when leaving, stored as a time; invalid values are ignored', async () => {
  const t = boot();
  const id = (await create(t, SARA)).data.id;
  const before = Date.now();
  await toStarted(t, id, 20);
  const r = t.run(`MP.get('serviceRequests', ${JSON.stringify(id)})`);
  assert.equal(r.etaMin, 20);
  const at = new Date(r.etaAt).getTime(); assert.ok(at >= before + 19.5 * 60000 && at <= Date.now() + 20.5 * 60000);
  const t2 = boot(); const id2 = (await create(t2, SARA)).data.id; await toStarted(t2, id2, 999);
  assert.equal(t2.run(`MP.get('serviceRequests', ${JSON.stringify(id2)}).etaAt`), undefined);
});

test('the provider rates the customer once after the job; the customer keeps an average and never sees the detail', async () => {
  const t = boot();
  const id = (await create(t, SARA)).data.id;
  await toStarted(t, id);
  assert.equal((await t.O.rateCustomer(id, 5, 'محترم')).status, 409, 'only after completion');
  assert.equal((await t.O.complete(id, 400)).ok, true);
  assert.equal((await t.O.rateCustomer(id, 0)).status, 422);
  assert.equal((await t.O.rateCustomer(id, 4, 'محترم جدًا')).status, 201);
  assert.equal((await t.O.rateCustomer(id, 5)).status, 409, 'once');
  const c = t.run(`MP.db().customers.find(c => c.phone === '${SARA.phone}')`);
  assert.deepEqual([c.rating, c.ratingCount], [4, 1]);
  t.as('customer', SARA);
  assert.equal((await t.O.get(id)).data.customerReview, undefined);
});

test('promo code: validated at request time, applied once at completion from the platform fee (provider net unchanged)', async () => {
  const t = boot();
  assert.equal((await marketing(t, { promos: [{ code: 'HSBAD', kind: 'percent', value: 10 }] })).status, 422, 'HS… is reserved for invite codes');
  assert.equal((await marketing(t, { promos: [{ code: 'BIG', kind: 'percent', value: 150 }] })).status, 422);
  assert.equal((await marketing(t, { promos: [{ code: 'save20', kind: 'percent', value: 20, firstOnly: true }, { code: 'OLD', kind: 'amount', value: 50, until: '2001-01-01' }] })).ok, true);
  assert.equal((await create(t, SARA, { promo: 'NOPE' })).status, 422);
  assert.equal((await create(t, SARA, { promo: 'OLD' })).status, 422, 'expired');
  const res = await create(t, SARA, { promo: 'save20' });
  assert.equal(res.status, 201); assert.deepEqual([res.data.promo.code, res.data.promo.kind], ['SAVE20', 'percent']);
  assert.equal((await create(t, SARA, { promo: 'SAVE20' })).status, 422, 'first order only / once per customer');
  const plain = (await create(t, OMAR)).data.id;
  await toStarted(t, res.data.id); await t.O.complete(res.data.id, 500);
  await toStarted(t, plain); await t.O.complete(plain, 500);
  const tx = id => t.run(`MP.db().transactions.find(x => x.reqId === ${JSON.stringify(id)})`);
  const a = tx(res.data.id), b = tx(plain);
  assert.equal(a.net, b.net, 'provider amount is the same with or without a promo');
  assert.ok(a.discount > 0 && a.discount <= b.commission, 'discount never exceeds the platform fee');
  assert.equal(Math.round((a.value + a.discount) * 100) / 100, b.value); assert.ok(a.commission >= 0);
  assert.equal(t.run(`MP.db().settings.promos.find(p => p.code === 'SAVE20').used`), 1);
});

test('invite a friend: friend gets the reward off the first request; the inviter gets credit, used automatically next time', async () => {
  const t = boot();
  await create(t, SARA);
  t.as('customer', SARA);
  assert.equal((await t.g.HSCustomerApi.refCode()).status, 409, 'off until the admin enables it');
  assert.equal((await marketing(t, { referral: { on: true, reward: 30 } })).ok, true);
  t.as('customer', SARA);
  const code = (await t.g.HSCustomerApi.refCode()).data.code;
  assert.match(code, /^HS[A-Z2-9]{6}$/);
  t.as('customer', SARA); assert.equal((await t.O.create({ ...REQ, promo: code })).status, 422, 'not your own code');
  const fr = await create(t, OMAR, { promo: code });
  assert.equal(fr.status, 201); assert.equal(fr.data.promo.ref, t.run(`MP.db().customers.find(c => c.phone === '${SARA.phone}').id`));
  await toStarted(t, fr.data.id); await t.O.complete(fr.data.id, 600);
  assert.equal(t.run(`MP.db().transactions.find(x => x.reqId === ${JSON.stringify(fr.data.id)}).discount`), 30);
  assert.equal(t.run(`MP.db().customers.find(c => c.phone === '${SARA.phone}').credit`), 30, 'inviter credited on completion');
  const next = await create(t, SARA);
  assert.equal(next.data.promo.kind, 'credit');
  await toStarted(t, next.data.id); await t.O.complete(next.data.id, 600);
  assert.equal(t.run(`MP.db().customers.find(c => c.phone === '${SARA.phone}').credit`), 0, 'credit consumed');
});

test('packages are public settings, requested like any request; unknown packages are refused', async () => {
  const t = boot();
  assert.equal((await marketing(t, { packages: [{ id: 'ac-year', name: 'صيانة تكييف سنوية', cat: 'appliances', visits: 2, price: 900 }] })).ok, true);
  assert.equal((await create(t, SARA, { packageId: 'nope' })).status, 422);
  const r = await create(t, SARA, { packageId: 'ac-year' });
  assert.equal(r.status, 201); assert.equal(r.data.packageName, 'صيانة تكييف سنوية');
});

test('«same provider again» assigns the previous provider directly; another provider id is refused', async () => {
  const t = boot();
  const id = (await create(t, SARA)).data.id;
  await toStarted(t, id); await t.O.complete(id, 300);
  t.as('customer', SARA); await t.O.close(id);
  assert.equal((await t.O.repeat(id, 'p_someone')).status, 422);
  const again = await t.O.repeat(id, 'p_demo1');
  assert.equal(again.status, 201);
  assert.equal(t.run(`MP.activeAssignment(${JSON.stringify(again.data.id)}).providerId`), 'p_demo1');
});

test("today's demand: per-category and per-area counts only (no people), reset each day", async () => {
  const t = boot();
  await create(t, SARA); await create(t, OMAR);
  const tr = t.run('MP.db().settings.trend');
  assert.equal(tr.day, t.run('MP.cairoDay()'));
  assert.equal(tr.cats.electric, 2); assert.equal(tr.areas['القاهرة|مدينة نصر'], 2);
  assert.deepEqual(Object.keys(tr).sort(), ['areas', 'cats', 'day']);
});

test('server scope: promo codes stay admin-only; providers see only their own chat; customers never see the rating of them', () => {
  const { scopeFor } = require('../../functions/src/scope.js');
  const db = { settings: { promos: [{ code: 'X' }], trend: { day: 'd', cats: {}, areas: {} }, packages: [], referral: { on: true, reward: 10 } },
    customers: [{ id: 'c1', name: 'سارة', rating: 4.5, ratingCount: 2 }], providers: [{ id: 'p1', status: 'approved' }, { id: 'p2', status: 'approved' }],
    serviceRequests: [{ id: 'r1', no: 'HS-1', customerId: 'c1', status: 'started', customerReview: { stars: 2 }, chat: [{ pid: 'p1', text: 'a' }, { pid: 'p2', text: 'b' }] }],
    assignments: [{ id: 'a1', reqId: 'r1', providerId: 'p2', status: 'accepted' }], transactions: [], reviews: [], quotes: [], notifications: [], complaints: [], addresses: [], favorites: [] };
  const cust = scopeFor(db, { role: 'customer', id: 'c1' });
  assert.equal(cust.settings.promos, undefined); assert.ok(cust.settings.trend && cust.settings.referral);
  assert.equal(cust.serviceRequests[0].customerReview, undefined);
  const pv = scopeFor(db, { role: 'provider', id: 'p2' });
  assert.deepEqual(pv.serviceRequests[0].chat.map(m => m.text), ['b']);
  assert.equal(pv.customers[0].rating, 4.5);
});

test('round 5 screens: tracking shows chat + share, closed orders offer receipt / same provider / reorder; provider dashboard shows level and week', () => {
  const { boot: bootCustomer } = require('../helpers/customer-app-harness.js');
  const app = bootCustomer({});
  app.signIn(); const id = app.newRequest();
  app.run(`(() => { const id = ${JSON.stringify(id)}; MP.db().settings.autoAssign = false; if (!MP.activeAssignment(id)) MP.assign(id, 'p_demo1'); MP.respond(id, true); MP.confirmTime(id, 'provider'); MP.advance(id, 'enroute'); MP.setEta(id, 15); })()`);
  app.run(`show('tracking', ${JSON.stringify(id)})`);
  let html = app.html();
  assert.match(html, /<form class="chat-form" id="chatForm"/); assert.match(html, /data-act="shareReq"/);
  assert.match(html, /class="eta-card" role="status"/); assert.match(html, /تقدير الفني/);
  app.run(`(() => { const id = ${JSON.stringify(id)}; MP.advance(id, 'arrived'); MP.advance(id, 'started'); MP.complete(id, 300); MP.close(id); })()`);
  app.run(`show('tracking', ${JSON.stringify(id)})`);
  html = app.html();
  assert.match(html, /data-act="receipt"/); assert.match(html, /data-act="sameProvider"/); assert.match(html, /data-repeat="/);
  assert.doesNotMatch(html, /id="chatForm"/, 'chat closes with the request');
  const P = require('../helpers/provider-app-harness.js');
  const pv = P.boot({ session: 'p_demo1' }).html();
  assert.match(pv, /class="pv-level"/); assert.match(pv, /class="pv-week"/);
});