'use strict';
/* «صندوق الشغل» item by item (apps/admin/modules/work-inbox.js): items from the read model, ownership through tickets. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');
const W = require(path.join(ROOT, 'apps/admin/modules/work-inbox.js'));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const NOW = Date.now();   /* the mounted inbox reads the real clock */
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const DB = {
  providers: [{ id: 'p1', name: 'حسن', status: 'pending', cats: ['plumbing'], createdAt: ago(60 * 30) }, { id: 'p2', name: 'علي', status: 'approved' }],
  serviceRequests: [
    { id: 'r1', no: 'HS-1', status: 'searching', serviceName: 'حنفية', gov: 'الجيزة', createdAt: ago(150) },
    { id: 'r2', no: 'HS-2', status: 'received', createdAt: ago(5) },
    { id: 'r3', no: 'HS-3', status: 'closed', createdAt: ago(900), payment: { method: 'online', status: 'held', refund: { amount: 50, status: 'pending', at: ago(60) } } }
  ],
  complaints: [{ id: 'k1', reqId: 'r3', text: 'الفني ما جاش', status: 'open', at: ago(30) }, { id: 'k2', reqId: 'r3', status: 'resolved', at: ago(30) }],
  transactions: [{ id: 't1', providerId: 'p2', commission: 20, collection: 'pending', at: ago(60 * 24 * 9) }, { id: 't2', providerId: 'p2', commission: 5, collection: 'pending', at: ago(60) }]
};

test('items: one per thing to do, linked to its profile, most urgent first', () => {
  const l = W.items(DB, NOW);
  const keys = l.map((i) => i.key);
  assert.equal(keys[0], '#/order/r1', 'an order with no provider for 150 min is critical');
  assert.deepEqual(new Set(keys), new Set(['#/order/r1', '#/order/r2', '#/provider/p1', '#/order/r3?complaint=k1', '#/provider/p2?collect=1', '#/order/r3?refund=1']));
  const by = Object.fromEntries(l.map((i) => [i.key, i]));
  assert.equal(by['#/order/r2'].level, 'info');
  assert.equal(by['#/order/r2'].late, false);
  assert.equal(by['#/provider/p1'].late, true);
  assert.equal(by['#/provider/p2?collect=1'].team, 'finance');
  assert.match(by['#/provider/p2?collect=1'].sub, /^20 ج\.م من 1 /, 'only shares older than 7 days are overdue');
  assert.equal(by['#/order/r3?complaint=k1'].module, 'complaints');
  assert.ok(W.COVERED.includes('request.unassigned') && W.COVERED.includes('complaint.new'));
});

test('join: holder per item, mine flag, and my tickets whose item is finished', () => {
  const l = W.items(DB, NOW);
  const tickets = [{ id: 'tk1', link: '#/order/r1', status: 'doing', owner: { id: 'u1', name: 'منى' } }, { id: 'tk2', link: '#/provider/p1', status: 'doing', owner: { id: 'u2', name: 'سامي' } },
    { id: 'tk3', link: '#/order/zz', status: 'doing', owner: { id: 'u1', name: 'منى' } }, { id: 'tk4', link: '#/order/r2', status: 'new', owner: null }];
  const { rows, finished } = W.join(l, tickets, ['tk1', 'tk3']);
  const r = Object.fromEntries(rows.map((x) => [x.key, x]));
  assert.equal(r['#/order/r1'].mine, true);
  assert.equal(r['#/provider/p1'].holder.name, 'سامي');
  assert.equal(r['#/order/r2'].holder, null, 'handed to a team, nobody holds it');
  assert.deepEqual(finished.map((k) => k.id), ['tk3']);
});

function boot(db, { role = 'owner' } = {}) {
  const calls = [];
  let tickets = [];
  const ctx = { console, Intl, Date, Math, JSON, String, Number, Array, Object, Set, Promise, encodeURIComponent, decodeURIComponent, setTimeout };
  ctx.globalThis = ctx; vm.createContext(ctx);
  ctx.MP = { db: () => db };
  ctx.HSAdminSession = { current: () => ({ id: 'e1', role }) };
  ctx.HSAdminPermissionGuard = { can: () => true };
  ctx.HSAdminRbac = { state: { roster: [{ id: 'e1', name: 'أنا', status: 'active' }, { id: 'e2', name: 'زميل', status: 'active' }] } };
  ctx.HSApiClient = { request: (m, p, o) => {
    calls.push([m, p, (o && o.body) || (o && o.query) || null]);
    if (m === 'GET' && p === '/admin/tickets') return Promise.resolve({ ok: true, data: { items: o.query.mine ? tickets.filter((k) => k.owner && k.owner.id === 'e1') : tickets } });
    if (m === 'GET' && p === '/admin/alerts') return Promise.resolve({ ok: true, data: { items: [] } });
    if (m === 'POST' && p === '/admin/tickets') { const k = { id: 'tk' + (tickets.length + 1), ...o.body, status: 'new', owner: null, notes: [] }; tickets.push(k); return Promise.resolve({ ok: true, data: k }); }
    const pm = /^\/admin\/tickets\/([^/]+)$/.exec(p);
    if (m === 'PATCH' && pm) { const k = tickets.find((x) => x.id === pm[1]); Object.assign(k, o.body); if (o.body.status === 'doing' && !k.owner) k.owner = { id: 'e1', name: 'أنا' }; return Promise.resolve({ ok: true, data: k }); }
    const nm = /^\/admin\/tickets\/([^/]+)\/notes$/.exec(p);
    if (m === 'POST' && nm) { const k = tickets.find((x) => x.id === nm[1]); k.notes.push({ text: o.body.text, by: { name: 'أنا' } }); return Promise.resolve({ ok: true, data: k }); }
    return Promise.resolve({ ok: false, error: { message: 'x' } });
  } };
  vm.runInContext(read('apps/admin/modules/work-inbox.js'), ctx);
  const listeners = {};
  const host = { className: '', innerHTML: '', querySelector: () => null, addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); } };
  ctx.HSWorkInbox.mount(host);
  const fire = (type, target) => Promise.all((listeners[type] || []).map((f) => f({ target, preventDefault() {} })));
  const button = (data) => ({ dataset: data, disabled: false, isConnected: true, hasAttribute: (k) => k === 'data-wi-refresh' && !!data.wiRefresh, closest() { return this; } });
  return { ctx, host, calls, fire, button, tickets: () => tickets };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('flow: take an item, add a note, hand it to a colleague / a team, close it', async () => {
  const b = boot(JSON.parse(JSON.stringify(DB)));
  await tick(); await tick();
  assert.match(b.host.innerHTML, /صندوق الشغل/);
  assert.match(b.host.innerHTML, /data-wi-take="#\/order\/r1"/);
  assert.match(b.host.innerHTML, /data-wi-tab="team"/, 'owner sees the team tab');
  await b.fire('click', b.button({ wiTake: '#/order/r1' })); await tick();
  const created = b.calls.find((c) => c[0] === 'POST' && c[1] === '/admin/tickets');
  assert.equal(created[2].link, '#/order/r1');
  assert.equal(created[2].priority, 'urgent');
  assert.ok(b.calls.some((c) => c[0] === 'PATCH' && c[2] && c[2].status === 'doing'), 'taken = ticket in progress on me');
  assert.match(b.host.innerHTML, /معاك/);
  await b.fire('submit', { dataset: { wiNote: 'tk1' }, text: { value: 'كلمت العميل' } }); await tick();
  assert.equal(b.tickets()[0].notes[0].text, 'كلمت العميل');
  await b.fire('submit', { dataset: { wiMove: 'tk1' }, to: { value: 'p:e2|زميل' } }); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(b.tickets()[0].owner)), { id: 'e2', name: 'زميل' });
  await b.fire('submit', { dataset: { wiMove: 'tk1' }, to: { value: 't:finance' } }); await tick();
  assert.equal(b.tickets()[0].team, 'finance');
  assert.equal(b.tickets()[0].owner, null);
  await b.fire('click', b.button({ wiDone: 'tk1' })); await tick();
  assert.equal(b.tickets()[0].status, 'done');
});

test('a support employee does not get the team tab; record data is escaped', async () => {
  const db = JSON.parse(JSON.stringify(DB)); db.providers[0].name = '<img src=x onerror=alert(1)>';
  const b = boot(db, { role: 'support' });
  await tick(); await tick();
  assert.doesNotMatch(b.host.innerHTML, /data-wi-tab="team"/);
  assert.doesNotMatch(b.host.innerHTML, /<img src=x/);
});

test('wiring: loaded, cached, on the home page; entity alerts link to the profile', () => {
  assert.match(read('apps/admin/index.html'), /<script src="modules\/work-inbox\.js"><\/script>/);
  assert.match(read('service-worker.js'), /'apps\/admin\/modules\/work-inbox\.js'/);
  assert.match(read('apps/admin/pages/admin-dashboard.page.js'), /root\.HSWorkInbox\.mount\(box\)/);
  const store = read('services/local-market-store.js');
  assert.match(store, /link:'#\/order\/' \+ encodeURIComponent\(r\.id\), dedupeKey:'req-unassigned:'/);
  assert.match(store, /link: reqId \? '#\/order\/' \+ encodeURIComponent\(reqId\) : '#\/complaints'/);
});
