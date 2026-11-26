'use strict';
/* Path coverage for the domain routes (services/*-api.js) that no other unit test names by path: one happy call and one
   forbidden-role call each, through HSApiClient on the real local store in node:vm (tests/helpers/domain-harness.js).
   Public routes have no forbidden role (they answer without an actor); routes open to every role are checked for 401
   without an actor instead. The last test pins that every registered route is now named by some test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot, plain, ROOT } = require('../helpers/domain-harness.js');

const REQ = { cat: 'electric', serviceName: 'إصلاح انقطاع كهرباء', desc: 'الكهرباء مقطوعة في المطبخ', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع 1' };
const SARA = { name: 'سارة', phone: '01011112222' };
const PHOTO = 'data:image/webp;base64,UklGRgAAAAA=';

function world() {
  const t = boot();
  const api = async (method, p, body) => plain(await t.g.HSApiClient.request(method, p, { body }));
  const ok = (r, status) => { assert.equal(r.ok, true, JSON.stringify(r.error)); if (status) assert.equal(r.status, status); return r.data; };
  const denied = r => assert.deepEqual([r.status, r.error && r.error.code], [403, 'FORBIDDEN']);
  const R = id => t.run(`MP.get('serviceRequests', ${JSON.stringify(id)})`);
  const customer = () => t.as('customer', SARA);
  const create = async (extra = {}) => { customer(); return ok(await api('POST', '/requests', { ...REQ, ...extra }), 201).id; };
  /** admin assigns p_demo1, who accepts, confirms the time and starts */
  const started = async id => {
    t.as('admin', 'e_owner'); ok(await api('POST', `/admin/requests/${id}/assign`, { providerId: 'p_demo1' }));
    t.as('provider', 'p_demo1');
    ok(await api('POST', `/requests/${id}/respond`, { accept: true }));
    ok(await api('POST', `/requests/${id}/schedule`, {}));
    for (const to of ['enroute', 'arrived', 'started']) ok(await api('POST', `/requests/${id}/advance`, { to }));
  };
  const completed = async () => { const id = await create(); await started(id); ok(await api('POST', `/requests/${id}/complete`, { value: 300 })); return id; };
  const bidding = () => { t.as('admin', 'e_owner'); return api('PATCH', '/admin/marketing', { bidding: true }); };
  const invited = id => t.run(`MP.db().assignments.filter(a => a.reqId === ${JSON.stringify(id)} && a.bidding).map(a => a.providerId)`);
  const anon = () => { t.g.HSAuthApi.useApp('customer'); t.g.localStorage.removeItem('hs_user'); t.g.sessionStorage.clear(); assert.equal(t.g.HSAuthApi.currentActor(), null); };
  return { t, anon, api, ok, denied, R, customer, create, started, completed, bidding, invited };
}

/* ── orders ── */
test('POST /requests/:id/cancel and /requests/:id/provider', async () => {
  const w = world();
  const a = await w.create();
  w.t.as('provider', 'p_demo1'); w.denied(await w.api('POST', `/requests/${a}/cancel`, {}));
  w.customer(); assert.equal(w.ok(await w.api('POST', `/requests/${a}/cancel`, { reason: 'غيرت رأيي' })).status, 'cancelled');
  assert.equal((await w.api('POST', `/requests/${a}/cancel`, {})).status, 409, 'no second cancel');

  const b = await w.create();
  w.t.as('admin', 'e_owner'); w.denied(await w.api('POST', `/requests/${b}/provider`, { providerId: 'p_demo1' }));
  w.customer();
  assert.equal((await w.api('POST', `/requests/${b}/provider`, { providerId: 'nope' })).status, 422);
  const r = w.ok(await w.api('POST', `/requests/${b}/provider`, { providerId: 'p_demo1' }));
  assert.ok(r.providerName);
  assert.equal(w.t.run(`MP.db().assignments.some(a => a.reqId === ${JSON.stringify(b)} && a.providerId === 'p_demo1')`), true, 'assigned');
  assert.equal((await w.api('POST', `/requests/${b}/provider`, { providerId: 'p_demo1' })).status, 409, 'already assigned');
});

test('POST /requests/:id/widen and /requests/:id/inspection-only (offers round)', async () => {
  const w = world();
  w.ok(await w.bidding());
  const quotable = w.t.run(`(() => { for (const it of CAT.items('electric')) for (const p of CAT.problems(it.id)) if (!p.id.includes('/other')) return [it.id, p.id]; return null; })()`);
  const a = await w.create({ itemId: quotable[0], serviceId: quotable[0], problemId: quotable[1] });
  for (const pid of w.invited(a)) { w.t.as('provider', pid); w.ok(await w.api('POST', `/requests/${a}/respond`, { accept: false, reason: 'مشغول' })); }
  w.t.run(`MP.get('serviceRequests', ${JSON.stringify(a)}).bidding.until = new Date(Date.now() - 1000).toISOString()`);
  w.t.as('provider', 'p_demo1'); w.denied(await w.api('POST', `/requests/${a}/widen`, {}));
  w.customer(); w.ok(await w.api('POST', `/requests/${a}/widen`, {}));
  assert.equal(w.R(a).bidding.widened, true);
  assert.equal((await w.api('POST', `/requests/${a}/widen`, {})).status, 409, 'only once');

  const b = await w.create();                                   // no problem picked → an inspection visit
  const pid = w.invited(b)[0];
  w.t.as('provider', pid); w.ok(await w.api('POST', `/requests/${b}/bid`, { kind: 'inspection', fee: 120 }), 201);
  w.customer(); w.ok(await w.api('POST', `/requests/${b}/choose`, { providerId: pid }));
  w.t.as('provider', pid);
  w.ok(await w.api('POST', `/requests/${b}/schedule`, {}));
  for (const to of ['enroute', 'arrived', 'started']) w.ok(await w.api('POST', `/requests/${b}/advance`, { to }));
  w.customer(); w.denied(await w.api('POST', `/requests/${b}/inspection-only`, {}));
  w.t.as('provider', pid);
  const done = w.ok(await w.api('POST', `/requests/${b}/inspection-only`, {}));
  assert.equal(done.status, 'completed');
  assert.equal(w.t.run(`MP.db().transactions.find(x => x.reqId === ${JSON.stringify(b)}).net`), 120, 'the visit fee is the job');
});

test('POST /requests/:id/cash, /tip and /chat-seen after a completed job', async () => {
  const w = world();
  const id = await w.completed();
  w.t.as('admin', 'e_owner'); w.denied(await w.api('POST', `/requests/${id}/cash`, { paid: true }));
  w.customer();
  assert.equal((await w.api('POST', `/requests/${id}/cash`, { paid: 'yes' })).status, 422);
  w.ok(await w.api('POST', `/requests/${id}/cash`, { paid: true }));
  w.t.as('provider', 'p_demo1'); w.ok(await w.api('POST', `/requests/${id}/cash`, { paid: true }));
  assert.equal(w.t.run(`MP.db().transactions.find(x => x.reqId === ${JSON.stringify(id)}).collection`), 'collected', 'both sides agree → collected');
  w.t.as('provider', 'p_demo2'); assert.equal((await w.api('POST', `/requests/${id}/cash`, { paid: true })).status, 404, 'another provider cannot see it');

  w.t.as('provider', 'p_demo1'); w.denied(await w.api('POST', `/requests/${id}/tip`, { amount: 20 }));
  w.customer();
  assert.equal((await w.api('POST', `/requests/${id}/tip`, { amount: 2 })).status, 422);
  w.ok(await w.api('POST', `/requests/${id}/tip`, { amount: 20 }), 201);
  assert.equal(w.R(id).tip.amount, 20);
  assert.equal((await w.api('POST', `/requests/${id}/tip`, { amount: 20 })).status, 409, 'once');

  w.t.as('admin', 'e_owner'); w.denied(await w.api('POST', `/requests/${id}/chat-seen`, {}));
  w.customer(); w.ok(await w.api('POST', `/requests/${id}/chat-seen`, {}));
  w.t.as('provider', 'p_demo1'); w.ok(await w.api('POST', `/requests/${id}/chat-seen`, {}));
  assert.ok(w.R(id).chatSeen.customer && w.R(id).chatSeen.provider);
});

test('POST /requests/:id/photos/share and GET /providers/:id/portfolio', async () => {
  const w = world();
  const id = await w.create(); await w.started(id);
  w.customer(); assert.equal((await w.api('POST', `/requests/${id}/photos/share`, { share: true })).status, 404, 'no photos yet');
  w.t.as('provider', 'p_demo1');
  for (const kind of ['before', 'after']) w.ok(await w.api('POST', `/requests/${id}/photos`, { kind, data: PHOTO }), 201);
  w.denied(await w.api('POST', `/requests/${id}/photos/share`, { share: true }));
  assert.deepEqual(w.ok(await w.api('GET', '/providers/p_demo1/portfolio')).items, [], 'not shown before the customer allows it');
  w.customer(); assert.deepEqual(w.ok(await w.api('POST', `/requests/${id}/photos/share`, { share: true })), { share: true });
  w.anon();
  const items = w.ok(await w.api('GET', '/providers/p_demo1/portfolio')).items;
  assert.deepEqual(items.map(x => [x.before, x.after]), [[PHOTO, PHOTO]]);
  assert.ok(items.every(x => !('customerId' in x) && !('reqId' in x)), 'no private fields');
  assert.equal((await w.api('GET', '/providers/nope/portfolio')).status, 404);
});

/* ── quotes / free service ── */
test('POST /requests/:id/quote/reject', async () => {
  const w = world();
  const id = await w.create(); await w.started(id);
  w.ok(await w.api('POST', `/requests/${id}/quotes`, { labor: 300, parts: 0 }), 201);
  w.denied(await w.api('POST', `/requests/${id}/quote/reject`, { reason: 'غالي' }));
  w.customer();
  assert.equal(w.ok(await w.api('POST', `/requests/${id}/quote/reject`, { reason: 'غالي' })).status, 'rejected');
  assert.equal((await w.api('POST', `/requests/${id}/quote/reject`, {})).status, 409, 'nothing pending any more');
});

test('GET /free-reasons and POST /requests/:id/free, /free/respond, /free/complete', async () => {
  const w = world();
  w.anon();
  assert.ok(w.ok(await w.api('GET', '/free-reasons')).some(r => r.id === 'warranty' && r.label), 'public, no actor needed');
  const id = await w.create(); await w.started(id);
  w.customer(); w.denied(await w.api('POST', `/requests/${id}/free`, { reason: 'warranty' }));
  w.t.as('provider', 'p_demo1');
  assert.equal((await w.api('POST', `/requests/${id}/free`, { reason: 'because' })).status, 422);
  assert.equal(w.ok(await w.api('POST', `/requests/${id}/free`, { reason: 'warranty' }), 201).status, 'proposed');
  w.denied(await w.api('POST', `/requests/${id}/free/respond`, { accept: true }));
  w.customer(); assert.equal(w.ok(await w.api('POST', `/requests/${id}/free/respond`, { accept: true })).status, 'accepted');
  w.denied(await w.api('POST', `/requests/${id}/free/complete`, {}));
  w.t.as('provider', 'p_demo1');
  const done = w.ok(await w.api('POST', `/requests/${id}/free/complete`, {}));
  assert.deepEqual([done.status, done.finalValue], ['completed', 0]);
  assert.equal((await w.api('POST', `/requests/${id}/free/complete`, {})).status, 409);
});

/* ── catalogue (public) ── */
test('GET /services and GET /providers (public directory, no private fields)', async () => {
  const w = world();
  w.anon();
  const all = w.ok(await w.api('GET', '/services'));
  const el = w.ok(await w.api('GET', '/services?cat=electric'));
  assert.ok(el.length > 0 && el.length < all.length && el.every(s => s.cat === 'electric'));
  const dir = w.ok(await w.api('GET', '/providers?cat=electric'));
  assert.equal(dir.total, dir.items.length);
  assert.ok(dir.items.length > 0 && dir.items.every(p => p.cats.includes('electric')));
  for (const p of dir.items) for (const k of ['phone', 'docs', 'specialRate', 'status']) assert.ok(!(k in p), k);
  w.t.run(`MP.get('providers','p_demo1').status = 'suspended'`);
  assert.ok(!w.ok(await w.api('GET', '/providers')).items.some(p => p.id === 'p_demo1'), 'suspended providers are not listed');
});

/* ── customer self-service ── */
test('PATCH / DELETE /customers/me/addresses/:id and GET /customers/me/favorites', async () => {
  const w = world();
  w.customer(); w.t.run(`MP.customerFor('${SARA.name}','${SARA.phone}')`);
  const a = w.ok(await w.api('POST', '/customers/me/addresses', { label: 'البيت', gov: 'القاهرة', area: 'المعادي', addr: 'شارع 9' }), 201);
  w.t.as('provider', 'p_demo1');
  w.denied(await w.api('PATCH', `/customers/me/addresses/${a.id}`, { addr: 'x' }));
  w.denied(await w.api('DELETE', `/customers/me/addresses/${a.id}`));
  w.denied(await w.api('GET', '/customers/me/favorites'));
  w.customer();
  assert.equal((await w.api('PATCH', `/customers/me/addresses/${a.id}`, { addr: '' })).status, 422);
  assert.equal(w.ok(await w.api('PATCH', `/customers/me/addresses/${a.id}`, { addr: 'شارع 10' })).addr, 'شارع 10');
  assert.deepEqual(w.ok(await w.api('DELETE', `/customers/me/addresses/${a.id}`)), { id: a.id, removed: true });
  assert.equal((await w.api('DELETE', `/customers/me/addresses/${a.id}`)).status, 404);
  assert.deepEqual(w.ok(await w.api('GET', '/customers/me/favorites')), []);
  w.ok(await w.api('POST', '/customers/me/favorites/toggle', { kind: 'provider', refId: 'p_demo1' }));
  assert.ok(w.ok(await w.api('GET', '/customers/me/favorites')).some(f => f.refId === 'p_demo1'));
});

test('GET / POST /customers/me/devices and DELETE /customers/me/devices/:id', async () => {
  const w = world();
  w.customer(); w.t.run(`MP.customerFor('${SARA.name}','${SARA.phone}')`);
  const item = w.t.run(`CAT.items('electric')[0].id`);
  assert.equal((await w.api('POST', '/customers/me/devices', { brand: 'x' })).status, 422);
  const d = w.ok(await w.api('POST', '/customers/me/devices', { item, brand: 'شارب', year: '2020' }), 201);
  assert.deepEqual([d.item, d.brand, d.year], [item, 'شارب', '2020']);
  assert.deepEqual(w.ok(await w.api('GET', '/customers/me/devices')).map(x => x.id), [d.id]);
  w.t.as('provider', 'p_demo1');
  w.denied(await w.api('GET', '/customers/me/devices'));
  w.denied(await w.api('POST', '/customers/me/devices', { item }));
  w.denied(await w.api('DELETE', `/customers/me/devices/${d.id}`));
  w.customer();
  assert.deepEqual(w.ok(await w.api('DELETE', `/customers/me/devices/${d.id}`)), { removed: true });
  assert.equal((await w.api('DELETE', `/customers/me/devices/${d.id}`)).status, 404);
});

/* ── notifications / complaints ── */
test('POST /notifications/read (every role; 401 without an actor) and POST /complaints/:id/resolve', async () => {
  const w = world();
  const id = await w.create();
  w.anon();
  assert.equal((await w.api('POST', '/notifications/read', {})).status, 401);
  w.t.as('admin', 'e_owner');
  assert.ok(w.ok(await w.api('GET', '/notifications')).unread > 0);
  assert.equal(w.ok(await w.api('POST', '/notifications/read', {})).unread, 0);

  w.customer(); w.ok(await w.api('POST', '/complaints', { text: 'الفني تأخر عن الموعد كثيرًا', reqId: id }), 201);
  w.t.as('admin', 'e_owner');
  const k = w.ok(await w.api('GET', '/complaints?status=open')).items[0];
  w.customer(); w.denied(await w.api('POST', `/complaints/${k.id}/resolve`, { resolution: 'تم' }));
  w.t.as('admin', 'e_owner');
  assert.equal(w.ok(await w.api('POST', `/complaints/${k.id}/resolve`, { resolution: 'تم التواصل مع الفني' })).status, 'resolved');
});

/* ── finance ── */
test('GET /providers/me/earnings, POST /admin/transactions/:id/collection, GET / POST /admin/commission', async () => {
  const w = world();
  const id = await w.completed();
  w.customer(); w.denied(await w.api('GET', '/providers/me/earnings'));
  w.t.as('provider', 'p_demo1');
  const e = w.ok(await w.api('GET', '/providers/me/earnings'));
  assert.ok(e.items.some(x => x.reqId === id) && e.items.every(x => x.providerId === 'p_demo1'));
  assert.equal(e.totals.jobs, e.items.length);
  const tx = e.items.find(x => x.reqId === id);
  w.denied(await w.api('POST', `/admin/transactions/${tx.id}/collection`, { status: 'collected' }));
  w.t.as('admin', 'e_owner');
  assert.equal((await w.api('POST', `/admin/transactions/${tx.id}/collection`, { status: 'paid' })).status, 422);
  assert.equal(w.ok(await w.api('POST', `/admin/transactions/${tx.id}/collection`, { status: 'collected' })).collection, 'collected');

  w.customer();
  w.denied(await w.api('GET', '/admin/commission'));
  w.denied(await w.api('POST', '/admin/commission', { defaultRate: 5 }));
  w.t.as('admin', 'e_owner');
  assert.ok('defaultRate' in w.ok(await w.api('GET', '/admin/commission')));
  assert.equal((await w.api('POST', '/admin/commission', { defaultRate: 101 })).status, 422);
  const c = w.ok(await w.api('POST', '/admin/commission', { defaultRate: 12, cat: 'electric', rate: 8 }));
  assert.deepEqual([c.defaultRate, +c.rates.electric], [12, 8]);
  assert.equal(w.ok(await w.api('GET', '/admin/commission')).defaultRate, 12);
});

/* ── admin ── */
test('POST /admin/providers/:id/warn, /admin/providers/:id/rate, GET /admin/requests/:id/candidates', async () => {
  const w = world();
  const id = await w.create();
  w.t.as('provider', 'p_demo1');
  w.denied(await w.api('POST', '/admin/providers/p_demo2/warn', { reason: 'بره المنصة' }));
  w.denied(await w.api('POST', '/admin/providers/p_demo2/rate', { specialRate: 5 }));
  w.customer(); w.denied(await w.api('GET', `/admin/requests/${id}/candidates`));
  w.t.as('admin', 'e_owner');
  assert.equal(w.ok(await w.api('POST', '/admin/providers/p_demo2/warn', { reason: 'بره المنصة' })).warnings, 1);
  assert.equal(w.ok(await w.api('POST', '/admin/providers/p_demo2/warn', {})).status, 'suspended', 'the second warning suspends');
  assert.equal((await w.api('POST', '/admin/providers/nope/warn', {})).status, 404);
  assert.equal((await w.api('POST', '/admin/providers/p_demo2/rate', { specialRate: 150 })).status, 422);
  assert.equal(w.ok(await w.api('POST', '/admin/providers/p_demo2/rate', { specialRate: 7 })).specialRate, 7);
  assert.equal(w.ok(await w.api('POST', '/admin/providers/p_demo2/rate', { specialRate: null })).specialRate, null);
  const cands = w.ok(await w.api('GET', `/admin/requests/${id}/candidates`));
  assert.ok(cands.length > 0 && cands.every(p => p.id && p.name && !('phone' in p)));
  assert.equal((await w.api('GET', '/admin/requests/nope/candidates')).status, 404);
});

test('PATCH /admin/tickets/:id and POST /admin/tickets/:id/notes', async () => {
  const w = world();
  w.t.as('admin', 'e_owner');
  const tk = w.ok(await w.api('POST', '/admin/tickets', { title: 'العميل مش لاقي الفني', team: 'ops' }), 201);
  w.customer();
  w.denied(await w.api('PATCH', `/admin/tickets/${tk.id}`, { status: 'done' }));
  w.denied(await w.api('POST', `/admin/tickets/${tk.id}/notes`, { text: 'x' }));
  w.t.as('admin', 'e_owner');
  const n = w.ok(await w.api('POST', `/admin/tickets/${tk.id}/notes`, { text: 'كلمت العميل' }));
  assert.ok(JSON.stringify(n).includes('كلمت العميل'));
  assert.equal(w.ok(await w.api('PATCH', `/admin/tickets/${tk.id}`, { status: 'done' })).status, 'done');
  assert.equal((await w.api('PATCH', '/admin/tickets/nope', { status: 'done' })).status, 404);
});

/* ── completeness ── */
test('every registered domain route is named by a path literal in some unit test', () => {
  const w = world();
  const dir = path.join(ROOT, 'tests');
  const all = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.c?js$/.test(f)) all.push(fs.readFileSync(p, 'utf8')); } })(dir);
  const text = all.join('\n');
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const missing = Array.from(w.t.g.HSApiClient.routes()).filter(r => {
    const re = new RegExp("['\"`]" + esc(r.path).replace(/:[a-zA-Z]+/g, "(?:[^/'\"`\\s]+|['\"`]\\s*\\+[^+]+\\+\\s*['\"`])") + "(?:\\?[^'\"`]*)?['\"`]");
    return !re.test(text);
  }).map(r => r.method + ' ' + r.path);
  assert.deepEqual(missing, []);
});
