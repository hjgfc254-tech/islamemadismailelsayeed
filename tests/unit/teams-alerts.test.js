'use strict';
/* Teams release: alert / ticket rules (ops-core), the server engine (functions/src/alerts.js through service.api over an
   in-memory backend), escalation, and per-role data separation (functions/src/scope.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const C = require(path.resolve(__dirname, '../../apps/admin/modules/ops-core.js'));
const alerts = require(path.resolve(__dirname, '../../functions/src/alerts.js'));
const service = require(path.resolve(__dirname, '../../functions/src/service.js'));
const scope = require(path.resolve(__dirname, '../../functions/src/scope.js'));
const { memoryBackend } = require('../helpers/memory-backend.js');

const UNLOCK = { codeHash: 'x', unlockedUntil: 9e15 };
function world() {
  const b = memoryBackend({
    'admins/u_owner': { status: 'active', role: 'owner', name: 'المالك', ...UNLOCK },
    'admins/u_ops': { status: 'active', role: 'ops', name: 'عمليات', ...UNLOCK },
    'admins/u_ops2': { status: 'active', role: 'ops', name: 'عمليات ٢', ...UNLOCK },
    'admins/u_tech': { status: 'active', role: 'tech', name: 'تقنية', ...UNLOCK },
    'admins/u_fin': { status: 'active', role: 'finance', name: 'مالية', ...UNLOCK },
    'admins/u_locked': { status: 'active', role: 'ops', name: 'مقفول', codeHash: 'x', unlockedUntil: 0 },
    'pushTokens/t1': { uid: 'u_owner', token: 'tok-owner' }, 'pushTokens/t2': { uid: 'u_ops', token: 'tok-ops' }, 'pushTokens/t3': { uid: 'u_tech', token: 'tok-tech' }
  });
  const pushes = [];
  b.sendPush = async (tokens, msg) => { pushes.push({ tokens, msg }); };
  return { b, pushes };
}
const call = (b, uid, method, p, body, query) => service.api(b, { auth: { uid, token: { email: uid + '@example.com', email_verified: true } }, data: { app: 'admin', method, path: p, query: query || {}, body: body || {} } });

test('ops-core: de-duplication, claim conflicts, escalation timing and ticket transitions', () => {
  const t0 = Date.UTC(2026, 10, 22, 8, 0);
  const a = C.upsertAlert(null, { team: 'ops', severity: 'normal', title: 'شكوى جديدة', dedupeKey: 'k1' }, t0);
  assert.equal(a.isNew, true); assert.equal(a.alert.count, 1);
  const b = C.upsertAlert(a.alert, { team: 'ops', severity: 'critical', title: 'شكوى جديدة', dedupeKey: 'k1' }, t0 + 1000);
  assert.equal(b.isNew, false); assert.equal(b.upgraded, true); assert.equal(b.alert.count, 2); assert.equal(b.alert.id, a.alert.id);
  const c1 = C.claim(b.alert, { id: 'x', name: 'س' }, t0); assert.equal(c1.ok, true);
  assert.equal(C.claim(c1.alert, { id: 'y', name: 'ص' }, t0).code, 'CONFLICT');
  assert.equal(C.escalationDue(b.alert, t0 + 14 * 60000, 15), false);
  assert.equal(C.escalationDue(b.alert, t0 + 15 * 60000, 15), true);
  assert.equal(C.escalationDue(c1.alert, t0 + 60 * 60000, 15), false, 'a claimed alert is not escalated');
  const tk = C.createTicket({ title: 'مشكلة دفع', team: 'finance' }, { id: 'x', name: 'س' }, t0, 'tk1');
  assert.equal(tk.ok, true); assert.equal(tk.ticket.status, 'new');
  assert.equal(C.patchTicket(tk.ticket, { status: 'done' }, { id: 'x' }, t0).ticket.status, 'done');
  assert.equal(C.createTicket({ title: 'x' }, null, t0, 'tk2').ok, false);
  assert.deepEqual(C.teamsFor([], 'tech'), ['tech']);
});

test('server: alerts reach only their team; claim / resolve / ticket are audited; a second claimer gets a conflict', async () => {
  const { b, pushes } = world();
  await alerts.notifyTeam(b, 'ops', 'critical', { title: 'خلاف على الدفع', text: 'الطلب ١٠٢٣', key: 'cash:1', link: '#/complaints' });
  assert.ok(pushes.some((p) => p.tokens.includes('tok-ops')), 'ops team pushed');
  assert.ok(pushes.some((p) => p.tokens.includes('tok-owner')), 'critical also reaches the owner');
  assert.ok(!pushes.some((p) => p.tokens.includes('tok-tech')), 'tech never gets ops alerts');

  const opsList = await call(b, 'u_ops', 'GET', '/admin/alerts');
  assert.equal(opsList.ok, true, JSON.stringify(opsList)); assert.equal(opsList.data.items.length, 1); assert.equal(opsList.data.unread, 1);
  const techList = await call(b, 'u_tech', 'GET', '/admin/alerts');
  assert.equal(techList.ok, true); assert.equal(techList.data.items.length, 0);
  const id = opsList.data.items[0].id;

  const claimed = await call(b, 'u_ops', 'POST', `/admin/alerts/${id}/claim`);
  assert.equal(claimed.ok, true); assert.equal(claimed.data.claimedBy.id, 'u_ops');
  const clash = await call(b, 'u_ops2', 'POST', `/admin/alerts/${id}/claim`);
  assert.equal(clash.status, 409);
  const ticket = await call(b, 'u_ops', 'POST', `/admin/alerts/${id}/ticket`);
  assert.equal(ticket.status, 201); assert.equal(ticket.data.priority, 'urgent'); assert.equal(ticket.data.team, 'ops');
  const resolved = await call(b, 'u_ops', 'POST', `/admin/alerts/${id}/resolve`);
  assert.equal(resolved.data.status, 'resolved');
  const audit = [...b.docs].filter(([p]) => p.startsWith('audit/')).map(([, d]) => d.action);
  assert.ok(audit.includes('alert.claim') && audit.includes('alert.resolve') && audit.includes('ticket.create'), audit.join(','));

  const seen = await call(b, 'u_ops', 'POST', '/admin/alerts/seen');
  assert.equal(seen.ok, true);
  assert.equal((await call(b, 'u_ops', 'GET', '/admin/alerts')).data.unread, 0);

  assert.equal((await call(b, 'u_locked', 'GET', '/admin/alerts')).status, 403, 'access code still required');
  assert.equal((await call(b, 'u_tech', 'POST', '/admin/tickets', { title: 'تذكرة للعمليات', team: 'ops' })).status, 403, 'no tickets for another team');
  const own = await call(b, 'u_tech', 'POST', '/admin/tickets', { title: 'السيرفر بطيء', team: 'tech' });
  assert.equal(own.status, 201);
  const finTickets = await call(b, 'u_fin', 'GET', '/admin/tickets');
  assert.equal(finTickets.data.items.length, 0, 'finance does not see tech / ops tickets');
});

test('escalation: an unclaimed critical alert goes to the owner once after the configured minutes', async () => {
  const { b, pushes } = world();
  await alerts.notifyTeam(b, 'ops', 'critical', { title: 'طلب من غير مقدم خدمة', key: 'req:1' });
  const [row] = (await b.queryDocs('opsAlerts', 'status', '==', 'open'));
  await b.setDoc(`opsAlerts/${row.id}`, { ...row.data, createdAt: new Date(Date.now() - 20 * 60000).toISOString() });
  pushes.length = 0;
  assert.equal(await alerts.escalate(b, Date.now()), 1);
  assert.ok(pushes[0].tokens.includes('tok-owner')); assert.match(pushes[0].msg.title, /محدش استلم/);
  assert.equal(await alerts.escalate(b, Date.now()), 0, 'only once');
  const r = await alerts.tick(b, async () => [{ team: 'finance', severity: 'normal', title: 'عمولات متأخرة', dedupeKey: 'collection-overdue' }]);
  assert.equal(r.raised, 1);
});

/* recursive scan: no phone / email / address / location / chat values anywhere */
function personalLeaks(v, trail = '$', out = []) {
  if (v == null || typeof v !== 'object') {
    if (typeof v === 'string' && (/01\d{9}/.test(v) || /@[a-z0-9-]+\.[a-z]/i.test(v))) out.push(trail + '=' + v);
    return out;
  }
  for (const [k, x] of Object.entries(v)) {
    if (['phone', 'email', 'addr', 'address', 'geo', 'liveGeo'].includes(k) && x && x !== '•••' && !String(x).includes('•')) out.push(trail + '.' + k);
    if (k === 'chat' && Array.isArray(x) && x.length) out.push(trail + '.chat');
    personalLeaks(x, trail + '.' + k, out);
  }
  return out;
}
const DB = {
  v: 2, settings: { defaultRate: 10, adminDataPolicy: 'off' }, serviceAreas: [],
  customers: [{ id: 'c1', name: 'أحمد علي', phone: '01012345678', email: 'ahmed@example.com' }],
  providers: [{ id: 'p1', name: 'فني', phone: '01198765432', status: 'approved', cats: ['plumbing'] }],
  serviceRequests: [{ id: 'r1', no: 1023, customerId: 'c1', name: 'أحمد علي', phone: '01012345678', addr: 'شارع ٩ المعادي', geo: { lat: 30, lng: 31 }, chat: [{ t: 'أهلا' }], cat: 'plumbing', status: 'received', pricing: { customerPrice: 300 } }],
  assignments: [], transactions: [{ id: 't1', reqId: 'r1', customerId: 'c1', value: 300 }], reviews: [{ id: 'v1', text: 'كويس' }],
  complaints: [{ id: 'k1', by: 'customer:c1', text: 'اتصل بيا على 01012345678' }], notifications: [{ id: 'n1', to: 'admin', text: 'شكوى جديدة' }],
  addresses: [{ id: 'a1', customerId: 'c1', addr: 'شارع ٩' }], quotes: [], favorites: []
};

test('data separation: tech receives zero personal data, content none either, finance only masked', () => {
  const tech = scope.scopeFor(DB, { role: 'admin', id: 'u', adminRole: 'tech' });
  for (const k of ['customers', 'providers', 'serviceRequests', 'assignments', 'transactions', 'complaints', 'addresses', 'reviews']) assert.deepEqual(tech[k], [], k);
  assert.deepEqual(personalLeaks(tech), []);
  const content = scope.scopeFor(DB, { role: 'admin', id: 'u', adminRole: 'content' });
  assert.deepEqual(personalLeaks(content), []); assert.equal(content.customers.length, 0); assert.equal(content.serviceRequests[0].no, 1023);
  const fin = scope.scopeFor(DB, { role: 'admin', id: 'u', adminRole: 'finance' });
  assert.equal(fin.transactions.length, 1); assert.deepEqual(fin.addresses, []);
  assert.deepEqual(personalLeaks({ c: fin.customers, r: fin.serviceRequests, p: fin.providers }), []);
  const owner = scope.scopeFor(DB, { role: 'admin', id: 'u', adminRole: 'owner' });
  assert.equal(owner.customers[0].phone, '01012345678', 'the owner keeps full access');
  const scrubbed = scope.scrubForRole({ items: [{ phone: '01012345678', email: 'a@b.co', addr: 'x', chat: [1], nested: { geo: { lat: 1 } } }] }, 'tech');
  assert.deepEqual(personalLeaks(scrubbed), []);
  assert.deepEqual(scope.scrubForRole({ phone: '01012345678' }, 'ops'), { phone: '01012345678' }, 'unrestricted roles unchanged');
});

test('API gate: the tech role answers only its allow-list (no customer / provider / request / money route)', () => {
  require(path.resolve(__dirname, '../../apps/admin/rbac-store.js'));
  const G = require(path.resolve(__dirname, '../../apps/admin/permission-guard.js'));
  const tech = { role: 'admin', id: 'u_tech', adminRole: 'tech' };
  for (const [m, p] of [['GET', '/requests'], ['GET', '/requests/:id'], ['GET', '/complaints'], ['GET', '/admin/providers'], ['GET', '/admin/transactions'], ['GET', '/providers/:id'], ['POST', '/admin/customers/:id/status']]) {
    assert.ok(G.apiDenied(tech, m, p), m + ' ' + p);
  }
  assert.equal(G.apiDenied(tech, 'GET', '/admin/summary'), '');
  assert.equal(G.apiDenied({ role: 'admin', id: 'o', adminRole: 'owner' }, 'GET', '/requests'), '');
});
