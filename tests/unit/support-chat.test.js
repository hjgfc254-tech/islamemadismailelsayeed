'use strict';
/* AI support chat (functions/src/support-chat.js) over the in-memory backend with a scripted fake model:
   identity binding, owner switch, tools run AS the signed-in customer, ownership (another customer's request is 404),
   writes only after the customer's confirm button (single-use, server-built card), input masking, output cleaning,
   failure roll-back, quotas, busy lock, operator notes as system messages, retention, admin config for Claude. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const service = require(path.resolve(__dirname, '../../functions/src/service.js'));
const chat = require(path.resolve(__dirname, '../../functions/src/support-chat.js'));
const ai = require(path.resolve(__dirname, '../../functions/src/ai.js'));
const { memoryBackend } = require('../helpers/memory-backend.js');

const AI_ON = { features: { chat: true }, providers: [{ id: 'p1', label: 'Claude', kind: 'anthropic', model: 'claude-opus-5-5', apiKey: 'sk-ant-test-0000000000', roles: ['chat'], enabled: true }] };
function world(aiDoc) {
  return memoryBackend({
    'system/meta': { v: 2, lastReqNo: 1000 },
    'system/settings': { autoAssign: false, bidding: false, cancelFee: 60, prices: { 'appliances/fridge': 200 }, markupRate: 10 },
    'system/ai': aiDoc === undefined ? AI_ON : aiDoc,
    'users/u1': { role: 'customer', refId: 'c1' },
    'customers/c1': { id: 'c1', uid: 'u1', name: 'أحمد علي', phone: '01012345678', status: 'active', createdAt: '2026-11-01T10:00:00.000Z' },
    'customers/c2': { id: 'c2', uid: 'u2', name: 'منى سمير', phone: '01198765432', status: 'active', createdAt: '2026-11-02T10:00:00.000Z' },
    'requests/r1': { id: 'r1', no: 'HS-2026-0998', customerId: 'c1', phone: '01012345678', status: 'searching', cat: 'appliances', serviceName: 'ثلاجة', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع ١', createdAt: '2026-11-20T09:00:00.000Z', history: [] },
    'requests/r2': { id: 'r2', no: 'HS-2026-0999', customerId: 'c2', phone: '01198765432', status: 'searching', cat: 'plumbing', serviceName: 'حنفيات', gov: 'الجيزة', area: 'الدقي', addr: 'شارع سري ١', createdAt: '2026-11-20T10:00:00.000Z', history: [] }
  });
}
const send = (b, uid, data, ip) => service.session(b, { auth: uid ? { uid, token: { uid } } : null, data: { op: 'chat', ...data }, ip: ip || '10.0.0.1' });

/* scripted model: each step returns {stop_reason, content}; every request is recorded */
function fakeModel(steps) {
  const calls = [];
  const client = { beta: { messages: { create: async (req) => { calls.push(JSON.parse(JSON.stringify(req))); const s = steps.shift(); if (!s) throw new Error('no more steps'); return typeof s === 'function' ? s(req) : s; } } } };
  chat.setClient(client);
  return calls;
}
const tool = (id, name, input) => ({ type: 'tool_use', id, name, input });
const text = (t) => ({ type: 'text', text: t });
const lastToolResults = (req) => req.messages[req.messages.length - 1].content;
const reqCount = async (b) => (await b.adapter.query(null, 'requests', {})).length;

test.afterEach(() => { chat.setClient(null); chat._resetLimits(); });

test('switch off / no provider / not a customer / no token: nothing reaches the model', async () => {
  const calls = fakeModel([]);
  await assert.rejects(send(world({ features: { chat: false }, providers: AI_ON.providers }), 'u1', { action: 'send', text: 'ازيك' }), (e) => /مش متاح/.test(e.message));
  const h = await send(world({ features: { chat: true }, providers: [] }), 'u1', { action: 'history' });
  assert.equal(h.enabled, false, 'no Claude key → disabled');
  await assert.rejects(send(world(), 'u9', { action: 'send', text: 'ازيك' }), (e) => /تسجيل بياناتك/.test(e.message));
  await assert.rejects(send(world(), null, { action: 'send', text: 'ازيك' }), (e) => /سجّل الدخول/.test(e.message));
  assert.equal(calls.length, 0);
});

test('a full request: tools run as the signed-in customer; nothing is written until the customer confirms; single-use card', async () => {
  const b = world();
  const calls = fakeModel([
    { stop_reason: 'tool_use', content: [tool('t1', 'search_services', { query: 'ثلاجة مش بتبرد' }), tool('t2', 'get_my_requests', {})] },
    { stop_reason: 'tool_use', content: [tool('t3', 'prepare_new_request', { cat: 'appliances', item: 'appliances/fridge', problem: 'appliances/fridge/no-cooling', desc: 'الثلاجة مش بتبرد', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع مكرم عبيد عمارة 5 الدور 3', when: '', period: 'morning' })] },
    { stop_reason: 'end_turn', content: [text('جهزتلك الطلب، راجعه واضغط تأكيد الطلب.')] }
  ]);
  const before = await reqCount(b);
  const v = await send(b, 'u1', { action: 'send', text: 'الثلاجة مش بتبرد عايز فني' });
  /* request shape sent to the model */
  const r0 = calls[0];
  assert.equal(r0.model, 'claude-opus-5-5');
  assert.deepEqual(r0.output_config, { effort: 'low' });
  assert.equal(r0.fallbacks, 'default');
  assert.ok(r0.tools.every((t) => t.strict === true && t.input_schema.additionalProperties === false));
  assert.equal(r0.messages[0].role, 'user');
  assert.equal(r0.messages[1].role, 'system', 'platform context travels as a system message after the user message');
  assert.ok(!JSON.stringify(r0).includes('01012345678'), 'the customer phone never reaches the model');
  /* get_my_requests only sees the caller's own request */
  const res2 = JSON.parse(lastToolResults(calls[1])[1].content);
  assert.deepEqual(res2.requests.map((r) => r.id), ['r1']);
  /* the card exists, nothing written */
  assert.equal(await reqCount(b), before);
  assert.equal(v.cards.length, 1);
  const card = v.cards[0];
  assert.equal(card.type, 'create');
  assert.ok(card.lines.some((l) => l.k === 'السعر' && /ج\.م/.test(l.v)), 'price comes from the catalogue, not the model');
  assert.ok(/^ac_[a-f0-9]{16}$/.test(card.id));
  assert.equal(v.messages.at(-1).text, 'جهزتلك الطلب، راجعه واضغط تأكيد الطلب.');
  /* another account cannot confirm it */
  await assert.rejects(send(b, 'u2', { action: 'confirm', id: card.id, yes: true }), () => true);
  assert.equal(await reqCount(b), before);
  /* confirm → created as the customer, marked as chat */
  const c = await send(b, 'u1', { action: 'confirm', id: card.id, yes: true });
  assert.equal(c.done, true);
  assert.equal(await reqCount(b), before + 1);
  const rows = (await b.adapter.query(null, 'requests', {})).map((r) => r.data || r);
  const made = rows.find((r) => r.source === 'callcenter');
  assert.equal(made.customerId, 'c1');
  assert.equal(made.createdBy.channel, 'chat');
  assert.equal(c.cards.length, 0);
  /* single use */
  await assert.rejects(send(b, 'u1', { action: 'confirm', id: card.id, yes: true }), (e) => /انتهى/.test(e.message));
  assert.equal(await reqCount(b), before + 1);
  /* the next turn tells the model what happened, as a system message after the new user message */
  const calls2 = fakeModel([{ stop_reason: 'end_turn', content: [text('تمام!')] }]);
  await send(b, 'u1', { action: 'send', text: 'شكرا' });
  const m = calls2[0].messages, n = m.length;
  assert.equal(m[n - 2].role, 'user');
  assert.equal(m[n - 1].role, 'system');
  assert.match(m[n - 1].content, /pressed confirm/);
  const audit = (await b.adapter.query(null, 'audit', {})).map((r) => r.data || r);
  assert.ok(audit.some((a) => a.action === 'agent.requests.create' && a.actor.channel === 'chat'), 'audited');
});

test('ownership: another customer\'s request is 404 to the model; cancel needs the button and shows the fee', async () => {
  const b = world();
  const calls = fakeModel([
    { stop_reason: 'tool_use', content: [tool('t1', 'get_request_status', { request_id: 'r2' }), tool('t2', 'prepare_cancel', { request_id: 'r1', reason: 'مش محتاجه خلاص' })] },
    { stop_reason: 'end_turn', content: [text('راجع الإلغاء')] }
  ]);
  const v = await send(b, 'u1', { action: 'send', text: 'الغي طلبي وقولي حالة الطلب r2' });
  const [a, c] = lastToolResults(calls[1]);
  assert.equal(a.is_error, true);
  assert.match(JSON.parse(a.content).error, /مفيش طلب/);
  assert.ok(!a.content.includes('الدقي'), 'nothing about the other request leaks');
  assert.equal(JSON.parse(c.content).status, 'awaiting_customer_confirmation');
  const card = v.cards.find((x) => x.type === 'cancel');
  assert.ok(card.lines.some((l) => l.k === 'رسوم الإلغاء' && l.v === 'مجاني'));
  const r1 = await b.getDoc('requests/r1'); assert.equal(r1.status, 'searching', 'not cancelled yet');
  const d = await send(b, 'u1', { action: 'confirm', id: card.id, yes: false });
  assert.equal(d.cards.length, 0);
  assert.equal((await b.getDoc('requests/r1')).status, 'searching', '«لأ» does nothing');
});

test('input masking and output cleaning', async () => {
  assert.equal(chat.cleanInput('كارت 4111 1111 1111 1111 ورقمي 01098765432 وايميلي a@b.com'), 'كارت [رقم كارت محذوف] ورقمي [رقم موبايل محذوف] وايميلي [إيميل محذوف]');
  assert.equal(chat.cleanInput('الرقم القومي ٢٩٠٠١٠١٠١٢٣٤٥٦'), 'الرقم القومي [رقم قومي محذوف]');
  assert.equal(chat.cleanInput('a‮b​c'), 'abc');
  assert.equal(chat.cleanInput('x'.repeat(2000)).length, chat.LIMITS.textMax);
  const out = chat.cleanOutput('كلمنا على 01011112222 أو ادخل https://evil.example/x و https://hansalahlak.web.app/legal **مهم** <b>x</b> والطوارئ 123');
  assert.ok(!/01011112222|evil\.example|\*\*|<b>/.test(out));
  assert.match(out, /hansalahlak\.web\.app/); assert.match(out, /123/);
  const b = world();
  const calls = fakeModel([{ stop_reason: 'end_turn', content: [text('تمام')] }]);
  await send(b, 'u1', { action: 'send', text: 'ده رقم الكارت 4111111111111111' });
  assert.ok(!JSON.stringify(calls[0]).includes('4111111111111111'));
});

test('failure: model error / refusal → fixed answer, history rolled back, nothing half-done', async () => {
  const b = world();
  fakeModel([{ stop_reason: 'end_turn', content: [text('أهلا')] }]);
  await send(b, 'u1', { action: 'send', text: 'اهلا' });
  const api1 = JSON.parse((await b.getDoc('supportChats/u1')).api);
  fakeModel([() => { throw new Error('overloaded'); }]);
  const v = await send(b, 'u1', { action: 'send', text: 'ممكن مساعدة' });
  assert.equal(v.messages.at(-1).fail, true);
  assert.equal(JSON.parse((await b.getDoc('supportChats/u1')).api).length, api1.length, 'history unchanged');
  fakeModel([{ stop_reason: 'refusal', content: [] }]);
  const r = await send(b, 'u1', { action: 'send', text: 'تاني' });
  assert.equal(r.messages.at(-1).fail, true);
  assert.equal((await b.getDoc('supportChats/u1')).busyUntil, 0, 'lock released');
  /* runaway tools: the last round is forced to answer without tools */
  const steps = Array.from({ length: 7 }, (_, i) => (i < 6 ? { stop_reason: 'tool_use', content: [tool('x' + i, 'get_policy', { topic: 'payment' })] } : { stop_reason: 'end_turn', content: [text('الدفع كاش')] }));
  const calls = fakeModel(steps);
  const z = await send(b, 'u1', { action: 'send', text: 'الدفع ازاي' });
  assert.equal(calls.at(-1).tool_choice.type, 'none');
  assert.equal(z.messages.at(-1).text, 'الدفع كاش');
});

test('quotas, busy lock and hand-off', async () => {
  const b = world({ ...AI_ON, chatDailyLimit: 2 });
  fakeModel([{ stop_reason: 'end_turn', content: [text('1')] }, { stop_reason: 'end_turn', content: [text('2')] }]);
  await send(b, 'u1', { action: 'send', text: 'a' });
  await send(b, 'u1', { action: 'send', text: 'b' });
  await assert.rejects(send(b, 'u1', { action: 'send', text: 'c' }), (e) => /حد الرسايل/.test(e.message));
  const b2 = world();
  fakeModel([{ stop_reason: 'end_turn', content: [text('اهلا')] }]);
  await send(b2, 'u1', { action: 'send', text: 'a' });
  const d2 = await b2.getDoc('supportChats/u1');
  await b2.setDoc('supportChats/u1', { ...d2, busyUntil: Date.now() + 30000 });
  await assert.rejects(send(b2, 'u1', { action: 'send', text: 'b' }), (e) => /لسه برد/.test(e.message));
  await b2.setDoc('supportChats/u1', { ...d2, busyUntil: 0 });
  fakeModel([{ stop_reason: 'tool_use', content: [tool('h1', 'handoff_to_human', { summary: 'العميل زعلان من التأخير', reason: 'شكوى تأخير' })] }, { stop_reason: 'end_turn', content: [text('موظف هيكلمك')] }]);
  const v = await send(b2, 'u1', { action: 'send', text: 'عايز اكلم موظف' });
  assert.equal(v.messages.at(-1).handoff, true);
  const tickets = (await b2.adapter.query(null, 'opsTickets', {})).map((r) => r.data || r);
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].channel, 'chat');
  assert.equal(tickets[0].phone, '01012345678', 'the employee gets the real phone from the account, not from the model');
});

test('retention + admin config: Claude provider with the chat role, public flag', async () => {
  const b = world();
  await b.setDoc('supportChats/u1', { uid: 'u1', expiresAt: '2026-01-01T00:00:00.000Z' });
  await b.setDoc('supportChats/u2', { uid: 'u2', expiresAt: '2999-01-01T00:00:00.000Z' });
  const r = await chat.retentionTick(b, Date.parse('2026-11-25T00:00:00Z'));
  assert.equal(r.deleted, 1);
  assert.equal(await b.getDoc('supportChats/u1'), null);
  assert.ok(await b.getDoc('supportChats/u2'));
  assert.ok(ai.KINDS.includes('anthropic'));
  assert.equal(ai.DEFAULT_MODEL.anthropic, 'claude-opus-5-5');
  const cfg = await ai.loadConfig(b.adapter);
  assert.equal(ai.publicFlags(cfg).chat, true);
  assert.equal(ai.publicFlags({ ...cfg, providers: [{ ...cfg.providers[0], roles: ['text'] }] }).chat, !!process.env.ANTHROPIC_API_KEY);
  assert.equal(chat.chatProvider(cfg).model, 'claude-opus-5-5');
});
