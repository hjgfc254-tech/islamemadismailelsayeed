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
  assert.match(html, /class="arrive-card"/); assert.match(html, /تقدير الفني/);
  app.run(`(() => { const id = ${JSON.stringify(id)}; MP.advance(id, 'arrived'); MP.advance(id, 'started'); MP.complete(id, 300); MP.close(id); })()`);
  app.run(`show('tracking', ${JSON.stringify(id)})`);
  html = app.html();
  assert.match(html, /data-act="receipt"/); assert.match(html, /data-act="sameProvider"/); assert.match(html, /data-repeat="/);
  assert.doesNotMatch(html, /id="chatForm"/, 'chat closes with the request');
  const P = require('../helpers/provider-app-harness.js');
  const pvApp = P.boot({ session: 'p_demo1' }); pvApp.go('#/earnings'); const pv = pvApp.html();   // level and week moved to «فلوسي» (2026-11-20)
  assert.match(pv, /class="pv-level"/); assert.match(pv, /class="pv-week"/);
});
test('round 6: home footer links, «امتى محتاج الفني؟» pre-fills the next request, tab tap to top, pull to refresh', () => {
  const { boot: bootCustomer } = require('../helpers/customer-app-harness.js');
  const app = bootCustomer({});
  const html = app.html();
  assert.match(html, /data-support="policy-privacy">الخصوصية/); assert.match(html, /data-support="policy-cancel">الإلغاء والاسترداد/); assert.match(html, /data-support="policy-terms"/);
  assert.match(html, /data-go="support">المساعدة/); assert.match(html, /class="when-pick"/);
  app.run("sessionStorage.setItem('hs_when_pref','tomorrow'); startRequest('electric')");
  assert.equal(app.run('WZ.schedule.flexible'), false);
  assert.match(app.run('WZ.schedule.date'), /^\d{4}-\d{2}-\d{2}$/);
  app.run("sessionStorage.setItem('hs_when_pref','flex'); startRequest('electric')");
  assert.equal(app.run('WZ.schedule.flexible'), true);
  const src = fs.readFileSync(path.join(ROOT, 'apps/customer/app.js'), 'utf8');
  assert.match(src, /function mountPullRefresh\(\)/); assert.match(src, /tapping the tab you are on scrolls back to the top/);
  const css = fs.readFileSync(path.join(ROOT, 'apps/customer/styles/customer.css'), 'utf8');
  assert.doesNotMatch(css, /#view \.hero \.art\{height:clamp/, 'the hero image is not shrunk');
  assert.doesNotMatch(css, /#view \.hero \.art\{position:absolute/, 'nothing is drawn over the hero picture');
  assert.match(css, /#view \.hero \.txt>p:not\(\.hero-eyebrow\)\{display:none\}/, 'the text block is compacted instead');
});
test('round 7: request in 5 screens, price bar, contact shown only when missing; active card quick actions; category peek', () => {
  const { boot: bootCustomer } = require('../helpers/customer-app-harness.js');
  const app = bootCustomer({});
  app.signIn();
  app.run("startRequest('appliances','appliances/ac'); WZ.problem='appliances/ac/no-cooling'; WZ.step=3; show('wizard')");
  let html = app.html();
  assert.match(html, /الخطوة 2 من 4/); assert.match(html, /class="wz-part-h">تفاصيل زيادة \(اختياري\)/); assert.match(html, /class="wz-part-h">صور أو فيديو/);
  app.run("WZ.step=7; WZ.contact.name='سارة'; WZ.contact.phone='01011112222'; show('wizard')");
  html = app.html();
  assert.match(html, /الخطوة 3 من 4/); assert.match(html, /class="wz-contact-mini"/); assert.doesNotMatch(html, /id="wz-phone"/, 'valid contact is folded into one line');
  app.run("WZ.contact.phone=''; show('wizard')");
  assert.match(app.html(), /id="wz-phone"/, 'missing contact is asked on the same screen');
  assert.equal(app.run('wzNextStep(0)'), 1); assert.equal(app.run('wzNextStep(1)'), 2); assert.equal(app.run('wzNextStep(2)'), 6); assert.equal(app.run('wzNextStep(4)'), 6); assert.equal(app.run('wzNextStep(6)'), 9); assert.equal(app.run('wzNextStep(8)'), 9);
  const id = app.newRequest();
  app.run(`(() => { const id = ${JSON.stringify(id)}; MP.db().settings.autoAssign = false; if (!MP.activeAssignment(id)) MP.assign(id, 'p_demo1'); MP.respond(id, true); MP.confirmTime(id, 'provider'); MP.advance(id, 'enroute'); MP.setEta(id, 20); show('home'); })()`);
  html = app.html();
  assert.match(html, /class="ac-quick"/); assert.match(html, /data-act="openChat"/); assert.match(html, /هيوصل خلال \d+ د/);
  app.run("globalThis.HTMLElement = globalThis.HTMLElement || function(){}; openCatPeek('electric')");   /* the vm harness has no DOM classes */
  assert.match(app.run("document.getElementById('sheet').innerHTML"), /كل خدمات/);
  assert.match(fs.readFileSync(path.join(ROOT, 'apps/customer/app.js'), 'utf8'), /function mountTilePeek\(\)/);
});
test('admin on the real server: review moderation, complaint resolution notifies, only real actions offered, live copy', async () => {
  const t = boot();
  const id = (await create(t, SARA)).data.id;
  await toStarted(t, id); await t.O.complete(id, 400);
  t.as('customer', SARA); await t.O.close(id); await t.O.review(id, 1, 'كلام مسيء');
  const rv = t.run(`MP.db().reviews.find(v => v.reqId === ${JSON.stringify(id)})`);
  const before = t.run(`MP.rating('p_demo1')`);
  t.as('admin', 'e_owner');
  assert.equal((await t.g.HSAdminApi.setReviewHidden(rv.id, true, '')).status, 422, 'a reason is required to hide');
  assert.equal((await t.g.HSAdminApi.setReviewHidden(rv.id, true, 'محتوى مسيء')).ok, true);
  assert.equal(t.run(`MP.db().reviews.find(v => v.id === ${JSON.stringify(rv.id)}).hidden`), true);
  const after = t.run(`MP.rating('p_demo1')`);
  assert.ok(after === null || after >= before, 'a hidden 1-star review no longer lowers the provider rating');
  assert.equal((await t.g.HSAdminApi.setReviewHidden(rv.id, false)).ok, true, 're-publish needs no reason');
  t.run(`MP.complain(${JSON.stringify(id)}, 'customer:' + MP.db().customers.find(c => c.phone === '${SARA.phone}').id, 'الفني اتأخر')`);
  const k = t.run('MP.db().complaints[0]');
  t.run(`MP.resolveComplaint(${JSON.stringify(k.id)}, 'اتكلمنا مع الفني واعتذر')`);
  assert.ok(t.run(`MP.notesFor(${JSON.stringify(k.by)}).some(n => /تم الرد على شكوتك: اتكلمنا/.test(n.text))`), 'the complainant is notified');
  const { scopeFor } = require('../../functions/src/scope.js');
  const scoped = scopeFor({ reviews: [{ id: 'a', stars: 5 }, { id: 'b', stars: 1, hidden: true }], settings: {}, providers: [] }, null);
  assert.deepEqual(scoped.reviews.map(r => r.id), ['a'], 'hidden reviews never leave the server for customers / guests');
  const live = fs.readFileSync(path.join(ROOT, 'apps/admin/modules/admin-live.js'), 'utf8');
  assert.match(live, /reviews: \['hidden', 'published'\]/); assert.match(live, /quotes: \[\]/);
  assert.match(live, /function cleanCopy\(rootEl, entity\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'apps/admin/admin-shell.js'), 'utf8'), /id === 'super-dashboard' && firebaseMode\(\)\) id = 'dashboard'/);
});
test('round 8: arrival code (when enabled), warranty set by the admin, warranty claim, tip, read receipt, «بيتي», before/after photos', async () => {
  const t = boot();
  /* admin: warranty per item > per category > default, and the arrival code switch */
  assert.equal((await marketing(t, { warranty: { default: 7, cats: { electric: 30 }, items: { 'appliances/ac': 90 } }, arrivalPin: true })).ok, true);
  assert.equal((await marketing(t, { warranty: { default: 999 } })).status, 422, 'days 0–365');
  assert.equal(t.run(`MP.warrantyDays({ cat: 'electric', itemId: 'x' })`), 30);
  assert.equal(t.run(`MP.warrantyDays({ cat: 'appliances', itemId: 'appliances/ac' })`), 90);
  assert.equal(t.run(`MP.warrantyDays({ cat: 'painting', itemId: 'y' })`), 7);
  const id = (await create(t, SARA)).data.id;
  t.as('admin', 'e_owner'); await t.g.HSAdminApi.assign(id, 'p_demo1');
  t.as('provider', 'p_demo1'); await t.O.respond(id, true); await t.O.schedule(id); await t.O.advance(id, 'enroute');
  assert.equal((await t.O.get(id)).data.pin, undefined, 'the provider never receives the code');
  t.as('customer', SARA); const pin = (await t.O.get(id)).data.pin; assert.match(pin, /^\d{4}$/, 'the customer sees it');
  t.as('provider', 'p_demo1');
  assert.equal((await t.O.advance(id, 'arrived', undefined, '0000' === pin ? '1111' : '0000')).status, 422, 'wrong code refused');
  assert.equal((await t.O.advance(id, 'arrived', undefined, pin)).ok, true, 'right code → arrived');
  /* photos */
  const img = 'data:image/webp;base64,' + 'A'.repeat(200);
  assert.equal((await t.O.uploadPhoto(id, 'before', img)).status, 201);
  assert.equal((await t.O.uploadPhoto(id, 'after', 'data:text/html;base64,AAAA')).status, 422);
  await t.O.advance(id, 'started'); assert.equal((await t.O.uploadPhoto(id, 'after', img)).status, 201);
  assert.deepEqual(Object.keys(t.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).hasPhotos`)).sort(), ['after', 'at', 'before']);
  /* chat + read receipt */
  await t.O.message(id, 'وصلت تحت البيت');
  t.as('customer', SARA); assert.equal((await t.O.chatSeen(id)).ok, true);
  assert.ok(t.run(`MP.get('serviceRequests', ${JSON.stringify(id)}).chatSeen.customer`));
  /* completion → warranty end + «بيتي» device for an item with periodic maintenance */
  t.as('provider', 'p_demo1'); await t.O.complete(id, 500);
  const r = t.run(`MP.get('serviceRequests', ${JSON.stringify(id)})`);
  const days = Math.round((Date.parse(r.warrantyUntil) - Date.now()) / 864e5); assert.ok(days >= 29 && days <= 30, 'electric → 30 days');
  /* tip, once */
  t.as('customer', SARA);
  assert.equal((await t.O.tip(id, 2)).status, 422); assert.equal((await t.O.tip(id, 20)).status, 201); assert.equal((await t.O.tip(id, 20)).status, 409);
  assert.equal(t.run(`MP.db().transactions.find(x => x.reqId === ${JSON.stringify(id)}).tip`), 20);
  /* photos in the portfolio only with the customer's consent */
  assert.equal(t.run(`MP.portfolio('p_demo1').length`), 0);
  assert.equal((await t.O.sharePhotos(id, true)).ok, true); assert.equal(t.run(`MP.portfolio('p_demo1').length`), 1);
  assert.equal((await t.g.HSCatalogApi.portfolio('p_demo1')).data.items.length, 1);
  /* warranty claim → linked request to the same provider */
  await t.O.close(id);
  const claim = await t.O.warranty(id, 'رجعت تفصل تاني');
  assert.equal(claim.status, 201); assert.equal(claim.data.warrantyOf, id); assert.match(claim.data.serviceName, /^ضمان: /);
  assert.equal(t.run(`MP.activeAssignment(${JSON.stringify(claim.data.id)}).providerId`), 'p_demo1');
  assert.equal((await t.O.warranty(id, 'تاني')).status, 409, 'one open claim at a time');
  /* «بيتي» */
  const dv = await t.g.HSCustomerApi.addDevice({ item: 'appliances/ac', brand: 'شارب', year: '2021' });
  assert.equal(dv.status, 201); assert.equal((await t.g.HSCustomerApi.devices()).data.length >= 1, true);
  assert.equal((await t.g.HSCustomerApi.removeDevice(dv.data.id)).ok, true);
});

test('round 8: an air-conditioner job adds the device to «بيتي» with a maintenance reminder date', async () => {
  const t = boot();
  const id = (await create(t, SARA, { cat: 'appliances', itemId: 'appliances/ac', serviceId: 'appliances/ac', serviceName: 'صيانة تكييف' })).data.id;
  await toStarted(t, id); await t.O.complete(id, 300);
  const c = t.run(`MP.db().customers.find(c => c.phone === '${SARA.phone}')`);
  const d = (c.devices || []).find(x => x.item === 'appliances/ac');
  assert.ok(d && d.lastAt && d.nextAt, 'device recorded with last / next service');
  const days = Math.round((Date.parse(d.nextAt) - Date.now()) / 864e5); assert.ok(days >= 119 && days <= 120);
});
test('first-visit onboarding: three photos, once per device, skipped for returning customers and deep links; new hero photo', () => {
  const src = fs.readFileSync(path.join(ROOT, 'apps/customer/pages/onboarding.js'), 'utf8');
  assert.match(src, /const KEY = 'hs_onboard_v1'/);
  /* 2026 identity: slide 1 is the new technician photo, slides 2–3 are brand-icon art (no old-uniform photos) */
  assert.match(src, /img: 'hero-tech-v3\.jpg'/); assert.equal((src.match(/art: \[/g) || []).length, 2);
  assert.match(src, /track\|provider\|orders/); assert.match(src, /u && u\.phone\) return false/);
  for (const f of ['hero-tech-v3.jpg', 'hsl-mark.svg', 'hsl-lockup.png']) assert.ok(fs.statSync(path.join(ROOT, 'assets/brand', f)).size < 150000, f + ' is light');
  assert.match(fs.readFileSync(path.join(ROOT, 'apps/customer/index.html'), 'utf8'), /pages\/onboarding\.js/);
  assert.match(fs.readFileSync(path.join(ROOT, 'apps/customer/app.js'), 'utf8'), /hero-tech-v3\.jpg/);
});
test('AI assist UI: hidden unless the admin enabled it on the real server; admin editors send their data as the request body', () => {
  const src = fs.readFileSync(path.join(ROOT, 'apps/customer/pages/ai-assist.js'), 'utf8');
  assert.match(src, /HSFirebaseConfig\.mode === 'firebase' && root\.HSBackend && typeof root\.HSBackend\.ai === 'function'/, 'local demo never shows it');
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /ذكاء|AI\b/, 'no «AI» wording in the customer UI');
  assert.match(src, /WZ\.step = r\.problem \? 3 : 2/, 'accepting opens the request at the details screen');
  const app = fs.readFileSync(path.join(ROOT, 'apps/customer/app.js'), 'utf8');
  assert.match(app, /HSAiAssist\.flags\(\)\.photo\) \{ HSAiAssist\.routePhoto\(file\)/);
  assert.doesNotMatch(app, /في V7 تُضاف الصور/, 'developer note no longer shown to customers');
  /* regression: the admin editors must wrap their payload as { body } (HSApiClient.request(method, path, { body })) */
  assert.match(fs.readFileSync(path.join(ROOT, 'apps/admin/modules/marketing-editor.js'), 'utf8'), /request\('PATCH', '\/admin\/marketing', \{ body: \{/);
  const aiAdmin = fs.readFileSync(path.join(ROOT, 'apps/admin/modules/ai-settings.js'), 'utf8');
  assert.match(aiAdmin, /request\('PATCH', '\/admin\/ai', \{ body: \{/); assert.match(aiAdmin, /type="password" data-ai-p="apiKey"/);
});
test('offers round: up to 3 providers, caps, customer chooses; inspection fee deducted when the repair is approved, or charged alone', async () => {
  const t = boot();
  assert.equal((await marketing(t, { bidding: true, bidWindowMin: 15, inspectionCap: { default: 200 }, priceCaps: { cats: { electric: 1000 } } })).ok, true);
  const quotable = t.run(`(() => { for (const it of CAT.items('electric')) for (const p of CAT.problems(it.id)) if (!p.id.includes('/other')) return [it.id, p.id]; return null; })()`);
  assert.ok(quotable, 'catalogue has a fixed-price problem');
  /* ── quote mode ── */
  const r = (await create(t, SARA, { itemId: quotable[0], serviceId: quotable[0], problemId: quotable[1] })).data;
  assert.equal(r.bidding.mode, 'quote');
  const invited = t.run(`MP.db().assignments.filter(a => a.reqId === ${JSON.stringify(r.id)} && a.bidding).map(a => a.providerId)`);
  assert.ok(invited.length >= 1 && invited.length <= 3, 'up to 3 providers invited');
  const [pA, pB] = invited;
  t.as('provider', pA);
  assert.equal((await t.O.respond(r.id, true)).status, 409, 'no blind accept — send an offer');
  assert.equal((await t.O.bid(r.id, { kind: 'quote', labor: 2000, parts: 0 })).status, 422, 'above the admin cap');
  assert.equal((await t.O.bid(r.id, { kind: 'quote', labor: 300, parts: 100, note: 'هغيّر المفتاح' })).status, 201);
  if (pB) { t.as('provider', pB); await t.O.bid(r.id, { kind: 'quote', labor: 350, parts: 100 }); assert.equal((await t.O.get(r.id)).data.offers, undefined, 'a provider never sees the other offers'); }
  t.as('customer', SARA);
  const seen = (await t.O.get(r.id)).data.offers;
  const mine = seen.find(o => o.providerId === pA);
  assert.ok(mine.offer.total > 400, 'platform share added'); assert.equal(mine.offer.base, undefined); assert.equal(mine.offer.labor + mine.offer.parts, mine.offer.total);
  assert.equal((await t.O.choose(r.id, pA)).ok, true);
  const after = t.run(`MP.get('serviceRequests', ${JSON.stringify(r.id)})`);
  assert.equal(after.status, 'accepted'); assert.equal(after.pricing.customerPrice, mine.offer.total);
  if (pB) assert.equal(t.run(`MP.db().assignments.find(a => a.reqId === ${JSON.stringify(r.id)} && a.providerId === ${JSON.stringify(pB)}).status`), 'withdrawn');
  t.as('provider', pA);
  await t.O.schedule(r.id); for (const to of ['enroute', 'arrived', 'started']) assert.equal((await t.O.advance(r.id, to)).ok, true, to);
  assert.equal((await t.O.complete(r.id)).ok, true);
  const tx = t.run(`MP.db().transactions.find(x => x.reqId === ${JSON.stringify(r.id)})`);
  assert.equal(tx.value, mine.offer.total); assert.equal(tx.net, 400, 'the provider gets exactly their offer');
  const wDays = Math.round((Date.parse(t.run(`MP.get('serviceRequests', ${JSON.stringify(r.id)}).warrantyUntil`)) - Date.now()) / 864e5);
  assert.ok(wDays >= 29 && wDays <= 30, 'a month of warranty by default');
  /* ── inspection mode (the customer doesn't know the problem) ── */
  const s2 = (await create(t, SARA)).data;
  assert.equal(s2.bidding.mode, 'inspection');
  const inv2 = t.run(`MP.db().assignments.filter(a => a.reqId === ${JSON.stringify(s2.id)} && a.bidding).map(a => a.providerId)`);
  t.as('provider', inv2[0]);
  assert.equal((await t.O.bid(s2.id, { kind: 'inspection', fee: 250 })).status, 422, 'inspection fee cap');
  assert.equal((await t.O.bid(s2.id, { kind: 'inspection', fee: 150 })).status, 201);
  t.as('customer', SARA); await t.O.choose(s2.id, inv2[0]);
  const insp = t.run(`MP.get('serviceRequests', ${JSON.stringify(s2.id)}).inspection`);
  assert.equal(insp.fee, 150); assert.equal(insp.customerFee, 150, 'no platform share on a visit unless the admin sets inspectionRate');
  t.as('provider', inv2[0]);
  await t.O.schedule(s2.id); for (const to of ['enroute', 'arrived', 'started']) await t.O.advance(s2.id, to);
  /* customer declines the repair → the visit alone is charged, no warranty */
  assert.equal((await t.g.HSQuotesApi.submit(s2.id, { labor: 600, parts: 0 })).ok, true);
  t.as('customer', SARA); assert.equal((await t.g.HSQuotesApi.reject(s2.id, 'غالي')).ok, true);
  t.as('provider', inv2[0]); assert.equal((await t.O.inspectionOnly(s2.id)).ok, true);
  const tx2 = t.run(`MP.db().transactions.find(x => x.reqId === ${JSON.stringify(s2.id)})`);
  assert.equal(tx2.value, insp.customerFee); assert.equal(tx2.net, 150);
  assert.equal(t.run(`MP.get('serviceRequests', ${JSON.stringify(s2.id)}).warrantyUntil`), undefined, 'no warranty for a visit without repair');
  /* approved repair after an inspection → the fee is deducted (not charged on top) */
  const s3 = (await create(t, SARA)).data;
  const inv3 = t.run(`MP.db().assignments.filter(a => a.reqId === ${JSON.stringify(s3.id)} && a.bidding).map(a => a.providerId)`);
  t.as('provider', inv3[0]); await t.O.bid(s3.id, { kind: 'inspection', fee: 100 });
  t.as('customer', SARA); await t.O.choose(s3.id, inv3[0]);
  t.as('provider', inv3[0]); await t.O.schedule(s3.id); for (const to of ['enroute', 'arrived', 'started']) await t.O.advance(s3.id, to);
  await t.g.HSQuotesApi.submit(s3.id, { labor: 500, parts: 200 });
  t.as('customer', SARA); assert.equal((await t.g.HSQuotesApi.approve(s3.id)).ok, true);
  t.as('provider', inv3[0]); assert.equal((await t.O.complete(s3.id)).ok, true);
  const tx3 = t.run(`MP.db().transactions.find(x => x.reqId === ${JSON.stringify(s3.id)})`);
  assert.equal(tx3.net, 700, 'repair only — the inspection fee is inside it, not added');
});
test('owner rules: wider search, revised price flag + visit fee, travel fee on late cancel, warranty free + payer, cash confirmation, warnings', async () => {
  const t = boot();
  assert.equal((await marketing(t, { bidding: true, cancelFee: 60, visitFee: 80, inspectionRate: 0 })).ok, true);
  const quotable = t.run(`(() => { for (const it of CAT.items('electric')) for (const p of CAT.problems(it.id)) if (!p.id.includes('/other')) return [it.id, p.id]; return null; })()`);
  const pick = id => t.run(`MP.db().assignments.filter(a => a.reqId === ${JSON.stringify(id)} && a.bidding).map(a => a.providerId)`);
  const R = id => t.run(`MP.get('serviceRequests', ${JSON.stringify(id)})`);
  /* 1) nobody answered in time → one wider search, admin told */
  const w = (await create(t, SARA, { itemId: quotable[0], serviceId: quotable[0], problemId: quotable[1] })).data;
  for (const pid of pick(w.id)) { t.as('provider', pid); await t.O.respond(w.id, false, 'مشغول'); }
  t.run(`MP.get('serviceRequests', ${JSON.stringify(w.id)}).bidding.until = new Date(Date.now() - 1000).toISOString()`);
  t.as('customer', SARA);
  const wid = await t.O.widen(w.id);
  assert.equal(wid.ok, true); assert.equal(R(w.id).bidding.widened, true);
  assert.equal((await t.O.widen(w.id)).status, 409, 'only once');
  /* 2) revised price far above the agreed one is flagged; refused → visit fee only, no warranty */
  const r = (await create(t, SARA, { itemId: quotable[0], serviceId: quotable[0], problemId: quotable[1] })).data;
  const pA = pick(r.id)[0];
  t.as('provider', pA); await t.O.bid(r.id, { kind: 'quote', labor: 200 });
  t.as('customer', SARA); await t.O.choose(r.id, pA);
  t.as('provider', pA); await t.O.schedule(r.id); for (const to of ['enroute', 'arrived', 'started']) await t.O.advance(r.id, to);
  assert.equal((await t.g.HSQuotesApi.submit(r.id, { labor: 400 })).ok, true);
  assert.equal(t.run(`MP.currentQuote(${JSON.stringify(r.id)}).flagged`), true);
  t.as('customer', SARA); await t.g.HSQuotesApi.reject(r.id, 'غالي');
  t.as('provider', pA); assert.equal((await t.O.inspectionOnly(r.id)).ok, true);
  const tx = t.run(`MP.db().transactions.find(x => x.reqId === ${JSON.stringify(r.id)})`);
  assert.equal(tx.net, 80); assert.equal(R(r.id).warrantyUntil, undefined);
  /* 5) cash: both confirm → collected; mismatch → complaint */
  t.as('customer', SARA); assert.equal((await t.O.cash(r.id, true)).ok, true);
  t.as('provider', pA); await t.O.cash(r.id, false);
  assert.equal(R(r.id).cash.disputed, true);
  assert.ok(t.run(`MP.db().complaints.some(k => k.reqId === ${JSON.stringify(r.id)} && k.kind === 'payment')`));
  /* 3) cancel: free before the provider moves, travel fee after */
  const c = (await create(t, SARA, { itemId: quotable[0], serviceId: quotable[0], problemId: quotable[1] })).data;
  const pC = pick(c.id)[0];
  t.as('provider', pC); await t.O.bid(c.id, { kind: 'quote', labor: 300 });
  t.as('customer', SARA); await t.O.choose(c.id, pC);
  t.as('provider', pC); await t.O.schedule(c.id); await t.O.advance(c.id, 'enroute');
  t.as('customer', SARA); assert.equal((await t.O.cancel(c.id, 'غيرت رأيي')).ok, true);
  const cf = t.run(`MP.db().transactions.find(x => x.reqId === ${JSON.stringify(c.id)})`);
  assert.equal(cf.kind, 'cancel-fee'); assert.equal(cf.net, 60); assert.equal(cf.providerId, pC);
  /* 4) warranty: free for the customer; original declines → substitute paid, original charged */
  const g = (await create(t, SARA, { itemId: quotable[0], serviceId: quotable[0], problemId: quotable[1] })).data;
  const pG = pick(g.id)[0];
  t.as('provider', pG); await t.O.bid(g.id, { kind: 'quote', labor: 250, parts: 50 });
  t.as('customer', SARA); await t.O.choose(g.id, pG);
  t.as('provider', pG); await t.O.schedule(g.id); for (const to of ['enroute', 'arrived', 'started']) await t.O.advance(g.id, to);
  await t.O.complete(g.id);
  t.as('customer', SARA);
  const claim = await t.O.warranty(g.id, 'رجعت تاني');
  assert.equal(claim.status, 201, JSON.stringify(claim.error));
  const cid = claim.data.id;
  assert.equal(R(cid).freeService.status, 'accepted', 'nothing to pay');
  t.run(`MP.db().providers.push({ ...MP.get('providers', ${JSON.stringify(pG)}), id: 'p_sub', name: 'فني بديل' })`);   /* a second provider in the same area */
  t.as('provider', pG); assert.equal((await t.O.respond(cid, false, 'مش فاضي')).ok, true);
  assert.equal(R(cid).warrantyPayer, pG);
  const sub = t.run(`(MP.db().assignments.find(a => a.reqId === ${JSON.stringify(cid)} && a.status === 'offered') || {}).providerId`);
  assert.ok(sub, 'a substitute was offered the warranty job');
  {
    t.as('provider', sub); await t.O.respond(cid, true); await t.O.schedule(cid); for (const to of ['enroute', 'arrived', 'started']) await t.O.advance(cid, to);
    assert.equal((await t.g.HSQuotesApi.completeFree(cid)).ok, true);
    const ts = t.run(`MP.db().transactions.filter(x => x.reqId === ${JSON.stringify(cid)})`);
    assert.equal(ts.find(x => x.kind === 'warranty-payout').net, 250); assert.equal(ts.find(x => x.kind === 'warranty-charge').net, -250);
  }
  /* 5b) warnings: the second suspends */
  t.as('admin', 'e_owner');
  assert.equal((await t.g.HSAdminApi.warnProvider(pA, 'اتفاق بره المنصة')).ok, true);
  await t.g.HSAdminApi.warnProvider(pA, '');
  assert.equal(t.run(`MP.get('providers', ${JSON.stringify(pA)}).status`), 'suspended');
});