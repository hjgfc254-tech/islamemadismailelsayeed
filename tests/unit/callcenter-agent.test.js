'use strict';
/* Call-centre gateway (functions/src/agent-gateway.js): the `callcenter` role and its data separation, requests created on
   behalf of a caller through the domain, ownership by phone, the cancel travel-fee confirmation, API keys for AI agents
   (401 / 403 scopes), rate limit, audit, hand-off ticket + alert, call logs and the 30-day transcript retention. Runs the
   server code over the in-memory backend (tests/helpers/memory-backend.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const service = require(path.resolve(__dirname, '../../functions/src/service.js'));
const gateway = require(path.resolve(__dirname, '../../functions/src/agent-gateway.js'));
const scope = require(path.resolve(__dirname, '../../functions/src/scope.js'));
const R = require(path.resolve(__dirname, '../../apps/admin/rbac-store.js'));
const G = require(path.resolve(__dirname, '../../apps/admin/permission-guard.js'));
const { createLimiter } = require(path.resolve(__dirname, '../../functions/src/limits.js'));
const { memoryBackend } = require('../helpers/memory-backend.js');

const UNLOCK = { codeHash: 'x', unlockedUntil: 9e15 };
const SECRET = 'test-secret-abcdefghijklmnopqrstuvwxyz';
const LIMITED = 'limited-secret-abcdefghijklmnopqrstuvwxyz';
const KEYS = gateway.parseKeys(`bot1:${SECRET}:*, bot2:${LIMITED}:lookup|catalog`);

function world() {
  const b = memoryBackend({
    'admins/u_owner': { status: 'active', role: 'owner', name: 'المالك', ...UNLOCK },
    'admins/u_cc': { status: 'active', role: 'callcenter', name: 'سارة', employeeId: 'e_cc', ...UNLOCK },
    'admins/u_ops': { status: 'active', role: 'ops', name: 'عمليات', ...UNLOCK },
    'admins/u_fin': { status: 'active', role: 'finance', name: 'مالية', ...UNLOCK },
    'system/meta': { v: 2, lastReqNo: 1000 },
    'system/settings': { autoAssign: false, bidding: false, cancelFee: 60, prices: { 'appliances/fridge': 200 }, markupRate: 10 },
    'customers/c1': { id: 'c1', name: 'أحمد علي', phone: '01012345678', status: 'active', createdAt: '2026-11-01T10:00:00.000Z' },
    'customers/c2': { id: 'c2', name: 'منى سمير', phone: '01198765432', status: 'active', createdAt: '2026-11-02T10:00:00.000Z' },
    'requests/r2': { id: 'r2', no: 'HS-2026-0999', customerId: 'c2', phone: '01198765432', status: 'searching', cat: 'plumbing', serviceName: 'حنفيات', gov: 'الجيزة', area: 'الدقي', addr: 'شارع سري ١', createdAt: '2026-11-20T10:00:00.000Z', history: [] },
    'transactions/t1': { id: 't1', reqId: 'r2', customerId: 'c2', value: 500, at: '2026-11-20T10:00:00.000Z' }
  });
  return b;
}
const adminCall = (b, uid, method, p, body, query) => service.api(b, { auth: { uid, token: { email: uid + '@example.com', email_verified: true } }, data: { app: 'admin', method, path: p, query: query || {}, body: body || {} } });
const aiCall = (b, method, p, body, opts) => service.agentHttp(b, { method, path: p, headers: { authorization: 'Bearer ' + ((opts && opts.key) || SECRET) }, body: body || {}, query: (opts && opts.query) || {} }, { keys: KEYS, limiter: (opts && opts.limiter) || createLimiter() });
const NEW_REQ = { phone: '01055555555', name: 'كريم حسن', cat: 'appliances', item: 'appliances/fridge', problem: 'appliances/fridge/no-cooling', desc: 'الثلاجة مش بتبرد', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع مكرم عبيد عمارة ٥', when: '2026-11-27', period: 'morning', callId: 'call-1' };

test('rbac: the callcenter preset — callcenter.* + alerts/tickets only; admin gains callcenter once (catalogue v3); the API gate is an allow-list', () => {
  const roles = R.buildRoles(), cc = R.roleById(roles, 'callcenter');
  assert.ok(cc, 'preset exists');
  assert.deepEqual(cc.permissions.filter((k) => !/^(alerts|tickets)\./.test(k)), ['callcenter.view', 'callcenter.create', 'callcenter.edit']);
  assert.ok(!cc.permissions.some((k) => /^(finance|customers|orders|pii|workforce|roles|permissions)\./.test(k)), 'no finance / customer lists / settings');
  /* a stored v2 catalogue (production) gets the new preset and admin gains callcenter.* exactly once */
  const stored = R.buildRoles().filter((r) => r.id !== 'callcenter').map((r) => ({ ...r, catalogV: 2, permissions: r.permissions.filter((k) => !k.startsWith('callcenter.')) }));
  const merged = R.mergePresets(stored);
  assert.ok(R.roleById(merged, 'callcenter'));
  assert.ok(R.roleById(merged, 'admin').permissions.includes('callcenter.create'));
  assert.ok(!R.roleById(merged, 'ops').permissions.includes('callcenter.view'), 'ops is not given the call centre');
  const actor = { role: 'admin', id: 'u_cc', adminRole: 'callcenter' };
  assert.ok(G.apiDenied(actor, 'GET', '/requests'), 'no request list');
  assert.ok(G.apiDenied(actor, 'GET', '/admin/transactions'), 'no finance');
  assert.ok(G.apiDenied(actor, 'PATCH', '/admin/settings'), 'no settings');
  assert.equal(G.apiDenied(actor, 'GET', '/notifications'), '');
  assert.equal(G.ROUTE_MODULE.callcenter, 'callcenter');
});

test('data separation: the callcenter sync carries no customers / requests / money; generic admin routes are refused', async () => {
  const b = world();
  const db = { customers: [{ id: 'c1', phone: '01012345678' }], serviceRequests: [{ id: 'r', phone: '01012345678', addr: 'x' }], transactions: [{ id: 't' }], settings: {} };
  const view = scope.scopeFor(db, { role: 'admin', id: 'u_cc', adminRole: 'callcenter' });
  assert.equal(view.customers.length, 0); assert.equal(view.serviceRequests.length, 0); assert.equal(view.transactions.length, 0);
  const sync = await service.session(b, { auth: { uid: 'u_cc', token: { email: 'u_cc@example.com', email_verified: true } }, data: { op: 'sync', app: 'admin' } });
  assert.equal(sync.actor.adminRole, 'callcenter');
  assert.equal(sync.db.customers.length, 0, 'no customer list'); assert.equal(sync.db.serviceRequests.length, 0); assert.equal(sync.db.transactions.length, 0);
  for (const [m, p] of [['GET', '/requests'], ['GET', '/admin/transactions'], ['GET', '/admin/summary'], ['GET', '/complaints'], ['GET', '/admin/providers']]) {
    const r = await adminCall(b, 'u_cc', m, p);
    assert.equal(r.ok, false, m + ' ' + p); assert.equal(r.status, 403, m + ' ' + p + ' → ' + JSON.stringify(r));
  }
  /* finance cannot use the call-centre gateway (no callcenter.view) */
  const fin = await adminCall(b, 'u_fin', 'POST', '/agent/lookup', { phone: '01012345678' });
  assert.equal(fin.status, 403);
});

test('lookup: one caller by phone — own requests only (area, no address); the AI gets a masked phone, the employee the real one', async () => {
  const b = world();
  const none = await adminCall(b, 'u_cc', 'POST', '/agent/lookup', { phone: '01000000000' });
  assert.equal(none.ok, true); assert.equal(none.data.found, false);
  const bad = await adminCall(b, 'u_cc', 'POST', '/agent/lookup', { phone: '123' });
  assert.equal(bad.status, 400);
  const hit = await adminCall(b, 'u_cc', 'POST', '/agent/lookup', { phone: '+201198765432' });
  assert.equal(hit.ok, true, JSON.stringify(hit)); assert.equal(hit.data.customer.name, 'منى سمير'); assert.equal(hit.data.customer.phone, '01198765432');
  assert.equal(hit.data.requests.length, 1); assert.equal(hit.data.requests[0].area, 'الدقي'); assert.equal(hit.data.requests[0].addr, undefined, 'no address');
  const ai = await aiCall(b, 'POST', '/agent/lookup', { phone: '01198765432' });
  assert.equal(ai.status, 200); assert.notEqual(ai.body.data.customer.phone, '01198765432'); assert.match(ai.body.data.customer.phone, /^011•+432$/);
});

test('catalog: categories → items → problems with public prices only (customer price, no provider amount)', async () => {
  const b = world();
  const r = await aiCall(b, 'GET', '/catalog');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const app = r.body.data.categories.find((c) => c.id === 'appliances');
  const fridge = app.items.find((i) => i.id === 'appliances/fridge');
  assert.equal(fridge.price, 220, '200 + 10% markup = what the customer pays');
  assert.ok(fridge.problems.some((p) => p.id === 'appliances/fridge/no-cooling'));
  assert.equal(r.body.data.fees.cancelFee, 60);
  assert.ok(!JSON.stringify(r.body.data).includes('providerAmount'));
});

test('create on behalf of a caller: app validation, new customer by phone, source callcenter, audited with the agent id', async () => {
  const b = world();
  const invalid = await aiCall(b, 'POST', '/agent/requests', { ...NEW_REQ, cat: 'nope', addr: '', phone: '0101' });
  assert.equal(invalid.status, 400); assert.ok(invalid.body.error.details.cat && invalid.body.error.details.addr && invalid.body.error.details.phone);
  const made = await aiCall(b, 'POST', '/agent/requests', NEW_REQ);
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.data.id;
  const r = b.docs.get('requests/' + id);
  assert.equal(r.source, 'callcenter'); assert.deepEqual(r.createdBy, { channel: 'ai', id: 'bot1' }); assert.equal(r.callId, 'call-1');
  assert.equal(r.serviceName, 'ثلاجة — الثلاجة لا تبرد'); assert.equal(r.when, '2026-11-27 09:00'); assert.equal(r.status, 'searching');
  assert.equal(made.body.data.price, 220);
  const c = [...b.docs].find(([p, d]) => p.startsWith('customers/') && d.phone === '01055555555');
  assert.ok(c, 'customer created for the caller'); assert.equal(c[1].source, 'callcenter');
  const audit = [...b.docs].filter(([p]) => p.startsWith('audit/')).map(([, d]) => d).filter((d) => d.app === 'agent');
  assert.ok(audit.some((a) => a.action === 'agent.requests.create' && a.actor.id === 'bot1' && a.actor.channel === 'ai' && a.subject === id && a.status === 201));
  assert.ok(!JSON.stringify(audit).includes('01055555555'), 'no phone numbers in the audit log');
  /* an existing caller keeps one customer record; the human employee path works the same */
  const again = await adminCall(b, 'u_cc', 'POST', '/agent/requests', { ...NEW_REQ, problem: '' });
  assert.equal(again.status, 201, JSON.stringify(again));
  assert.equal([...b.docs].filter(([p, d]) => p.startsWith('customers/') && d.phone === '01055555555').length, 1);
  assert.deepEqual(b.docs.get('requests/' + again.data.id).createdBy, { channel: 'human', id: 'u_cc' });
  /* owner switch «إيقاف الطلبات الجديدة» applies to the call centre too (the caller's own route) */
  b.docs.set('system/settings', { ...b.docs.get('system/settings'), controls: { pauseOrders: { on: true } } });
  const paused = await aiCall(b, 'POST', '/agent/requests', NEW_REQ);
  assert.equal(paused.body.ok, false); assert.equal(paused.status, 503);
});

test('status: only the owner of the phone sees a request (others get 404); next step + provider first name', async () => {
  const b = world();
  b.docs.set('requests/r2', { ...b.docs.get('requests/r2'), status: 'enroute', etaAt: '2026-11-25T12:30:00.000Z', etaMin: 25 });
  b.docs.set('assignments/a1', { id: 'a1', reqId: 'r2', providerId: 'p1', status: 'accepted', at: '2026-11-20T11:00:00.000Z' });
  b.docs.set('providers/p1', { id: 'p1', name: 'محمود عبد الله', phone: '01222222222', status: 'approved', cats: ['plumbing'] });
  const other = await aiCall(b, 'GET', '/agent/requests/r2', null, { query: { phone: '01012345678' } });
  assert.equal(other.status, 404, 'another caller');
  const noPhone = await aiCall(b, 'GET', '/agent/requests/r2');
  assert.equal(noPhone.status, 400);
  const own = await aiCall(b, 'GET', '/agent/requests/r2', null, { query: { phone: '01198765432' } });
  assert.equal(own.status, 200, JSON.stringify(own.body));
  assert.equal(own.body.data.provider, 'محمود'); assert.equal(own.body.data.eta.minutes, 25); assert.equal(own.body.data.cancelFee, 60);
  assert.ok(own.body.data.nextStep); assert.ok(!JSON.stringify(own.body.data).includes('01222222222'), 'no provider phone');
});

test('cancel: a travel fee needs confirmFee:true (read to the caller first); before that nothing changes', async () => {
  const b = world();
  b.docs.set('requests/r2', { ...b.docs.get('requests/r2'), status: 'enroute' });
  b.docs.set('assignments/a1', { id: 'a1', reqId: 'r2', providerId: 'p1', status: 'accepted', at: '2026-11-20T11:00:00.000Z' });
  b.docs.set('providers/p1', { id: 'p1', name: 'محمود', status: 'approved', cats: ['plumbing'] });
  const wrongOwner = await aiCall(b, 'POST', '/agent/requests/r2/cancel', { phone: '01012345678', reason: 'مش محتاجه' });
  assert.equal(wrongOwner.status, 404);
  const ask = await aiCall(b, 'POST', '/agent/requests/r2/cancel', { phone: '01198765432', reason: 'مش محتاجه' });
  assert.equal(ask.status, 409); assert.equal(ask.body.error.code, 'FEE_CONFIRMATION_REQUIRED'); assert.equal(ask.body.error.details.fee, 60);
  assert.equal(b.docs.get('requests/r2').status, 'enroute', 'not cancelled yet');
  const done = await aiCall(b, 'POST', '/agent/requests/r2/cancel', { phone: '01198765432', reason: 'مش محتاجه', confirmFee: true });
  assert.equal(done.status, 200, JSON.stringify(done.body)); assert.equal(done.body.data.cancelFee, 60);
  assert.equal(b.docs.get('requests/r2').status, 'cancelled');
  assert.ok([...b.docs].some(([p, d]) => p.startsWith('transactions/') && d.kind === 'cancel-fee' && d.value === 60), 'the fee is charged like an app cancellation');
  const twice = await aiCall(b, 'POST', '/agent/requests/r2/cancel', { phone: '01198765432', reason: 'تاني' });
  assert.equal(twice.status, 409);
});

test('complaint on behalf of the caller (own request only)', async () => {
  const b = world();
  const foreign = await aiCall(b, 'POST', '/agent/complaints', { phone: '01012345678', requestId: 'r2', kind: 'late', text: 'الفني اتأخر جدًا' });
  assert.equal(foreign.status, 404);
  const ok = await aiCall(b, 'POST', '/agent/complaints', { phone: '01198765432', requestId: 'r2', kind: 'late', text: 'الفني اتأخر جدًا' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const k = [...b.docs].find(([p]) => p.startsWith('complaints/'))[1];
  assert.equal(k.by, 'customer:c2'); assert.equal(k.source, 'callcenter'); assert.equal(k.reqId, 'r2');
});

test('AI keys: missing / wrong key → 401, scope missing → 403, rate limit → 429; the key digest is compared, never the secret', async () => {
  const b = world();
  const none = await service.agentHttp(b, { method: 'POST', path: '/agent/lookup', headers: {}, body: { phone: '01012345678' } }, { keys: KEYS, limiter: createLimiter() });
  assert.equal(none.status, 401);
  const wrong = await aiCall(b, 'POST', '/agent/lookup', { phone: '01012345678' }, { key: 'x'.repeat(40) });
  assert.equal(wrong.status, 401);
  const scoped = await aiCall(b, 'POST', '/agent/requests', NEW_REQ, { key: LIMITED });
  assert.equal(scoped.status, 403);
  const allowed = await aiCall(b, 'POST', '/lookup', { phone: '01012345678' }, { key: LIMITED });
  assert.equal(allowed.status, 200, 'path without the /agent prefix works too');
  const lim = createLimiter({ userReadsPerMin: 2, ipReadsPerMin: 2, anonymousReadsPerMinPerInstance: 100 });
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await aiCall(b, 'GET', '/agent/catalog', null, { limiter: lim })).status);
  assert.deepEqual(codes, [200, 200, 429]);
  assert.equal(gateway.parseKeys('short:abc:*').length, 0, 'secrets under 24 characters are refused');
  assert.equal(gateway.parseKeys('xx:' + SECRET + ':nonsense')[0].scopes.size, 0);
  assert.equal(KEYS[0].secret, undefined, 'only the digest is kept');
});

test('hand-off: an ops ticket + an «محتاج موظف» alert to the ops team; listed for the call-centre page', async () => {
  const b = world();
  const pushes = []; b.sendPush = async (tokens, msg) => { pushes.push({ tokens, msg }); };
  b.docs.set('pushTokens/t1', { uid: 'u_ops', token: 'tok-ops' }); b.docs.set('pushTokens/t2', { uid: 'u_fin', token: 'tok-fin' });
  const bad = await aiCall(b, 'POST', '/agent/handoff', { callId: '', summary: '' });
  assert.equal(bad.status, 400);
  const h = await aiCall(b, 'POST', '/agent/handoff', { callId: 'call-9', phone: '01198765432', requestId: 'r2', summary: 'العميل زعلان ومحتاج حد يكلمه', reason: 'شكوى معقدة' });
  assert.equal(h.status, 201, JSON.stringify(h.body));
  const t = b.docs.get('opsTickets/' + h.body.data.ticketId);
  assert.equal(t.team, 'ops'); assert.equal(t.source, 'callcenter'); assert.equal(t.priority, 'high'); assert.match(t.title, /محتاج موظف/);
  const alert = [...b.docs].find(([p]) => p.startsWith('opsAlerts/'))[1];
  assert.equal(alert.team, 'ops'); assert.equal(alert.kind, 'handoff');
  assert.ok(pushes.some((p) => p.tokens.includes('tok-ops'))); assert.ok(!pushes.some((p) => p.tokens.includes('tok-fin')));
  const list = await adminCall(b, 'u_cc', 'GET', '/agent/handoffs');
  assert.equal(list.ok, true, JSON.stringify(list)); assert.equal(list.data.items[0].id, h.body.data.ticketId); assert.match(list.data.items[0].phone, /•/);
  const alerts = await adminCall(b, 'u_cc', 'GET', '/admin/alerts');
  assert.equal(alerts.ok, true); assert.equal(alerts.data.items.length, 1, 'the call centre follows the ops alerts');
});

test('call logs: stored per agent + call (idempotent), listed without transcripts; the clock deletes transcripts after 30 days', async () => {
  const b = world();
  const body = { callId: 'call-7', from: '+201012345678', startedAt: '2026-11-25T09:00:00.000Z', endedAt: '2026-11-25T09:04:00.000Z', channel: 'ai', summary: 'سأل عن حالة الطلب', outcome: 'status_given', transcript: 'العميل: ... المساعد: ...' };
  const bad = await aiCall(b, 'POST', '/agent/calls', { ...body, outcome: 'whatever', channel: 'robot' });
  assert.equal(bad.status, 400);
  const a = await aiCall(b, 'POST', '/agent/calls', body);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  await aiCall(b, 'POST', '/agent/calls', { ...body, summary: 'تحديث' });
  const logs = [...b.docs].filter(([p]) => p.startsWith('callLogs/'));
  assert.equal(logs.length, 1, 'same agent + callId → one log');
  assert.equal(logs[0][1].from, '01012345678'); assert.equal(logs[0][1].summary, 'تحديث');
  const list = await adminCall(b, 'u_cc', 'GET', '/agent/calls');
  assert.equal(list.ok, true); assert.equal(list.data.items[0].hasTranscript, true); assert.equal(list.data.items[0].transcript, undefined);
  const early = await gateway.retentionTick(b, Date.now() + 29 * 86400000);
  assert.equal(early.deleted, 0);
  const late = await gateway.retentionTick(b, Date.now() + gateway.TRANSCRIPT_KEEP_MS + 60000);
  assert.equal(late.deleted, 1);
  const after = b.docs.get(logs[0][0]);
  assert.equal(after.transcript, null); assert.equal(after.summary, 'تحديث', 'the summary stays'); assert.ok(after.transcriptDeletedAt);
});
