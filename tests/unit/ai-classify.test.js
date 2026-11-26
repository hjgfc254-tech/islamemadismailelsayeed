'use strict';
/* AI routing (functions/src/ai.js `classify`, session op `ai`) over the in-memory backend with a fake provider network
   (ai.setFetch): the answer is always checked against the real catalogue, garbage / unknown ids fail safe, the owner
   switch and the daily quotas hold, oversized or non-image photos are refused, and a failing provider is skipped. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const service = require(path.resolve(__dirname, '../../functions/src/service.js'));
const ai = require(path.resolve(__dirname, '../../functions/src/ai.js'));
const { memoryBackend } = require('../helpers/memory-backend.js');

const DS = { id: 'pa', label: 'DeepSeek', kind: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-ds-test-0000000000', roles: ['text', 'vision'], enabled: true };
const GM = { id: 'pb', label: 'Gemini', kind: 'gemini', model: 'gemini-2.5-flash', apiKey: 'gm-test-0000000000', roles: ['text', 'vision'], enabled: true };
const ON = { features: { text: true, photo: true }, providers: [DS] };

const cat = ai.catalog();
const ITEM = cat.items.find(i => cat.problems[i.id].length);
const PROBLEM = cat.problems[ITEM.id][0];

function world(aiDoc = ON) {
  return memoryBackend({ 'system/meta': { v: 2, lastReqNo: 1000 }, 'system/settings': { autoAssign: false }, 'system/ai': aiDoc });
}
let ipN = 0;
const ask = (b, uid, data) => service.session(b, { auth: uid ? { uid, token: { uid } } : null, data: { op: 'ai', ...data }, ip: '10.9.' + (ipN++) + '.1' });
const refused = (p, code) => assert.rejects(p, e => (assert.equal(e.code, code, e.message), true));

/* fake network: `answer(stage, url, body)` → {status} | {json} | string (the model text); stage = 'item' | 'problem' */
function fakeNet(answer) {
  const calls = [];
  ai.setFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    const sys = url.includes('googleapis') ? body.systemInstruction.parts[0].text : body.messages[0].content;
    const stage = /^You route/.test(sys) ? 'item' : 'problem';
    calls.push({ url, body, stage });
    const a = await answer(stage, url, body);
    if (a && a.status) return { ok: false, status: a.status, json: async () => ({ error: 'down' }) };
    const text = typeof a === 'string' ? a : JSON.stringify(a);
    const json = url.includes('googleapis') ? { candidates: [{ content: { parts: [{ text }] } }] } : { choices: [{ message: { content: text } }] };
    return { ok: true, status: 200, json: async () => json };
  });
  return calls;
}
const good = stage => (stage === 'item' ? { item: ITEM.id, confidence: 0.9, summary: 'التكييف بينقط', brand: 'شارب', model: '', code: 'E1' } : { problem: PROBLEM.id, confidence: 0.8 });

test.afterEach(() => { ai.setFetch((...a) => globalThis.fetch(...a)); ai.resetHealth(); });

test('text: the item and problem chosen by the provider are returned with their catalogue names', async () => {
  const b = world();
  const calls = fakeNet(good);
  const r = await ask(b, 'u1', { kind: 'text', text: 'التكييف بينقط مية من جوه' });
  assert.deepEqual([r.item, r.itemName, r.cat, r.catName], [ITEM.id, ITEM.name, ITEM.cat, ITEM.catName]);
  assert.deepEqual([r.problem, r.problemName, r.confidence, r.brand, r.code, r.provider], [PROBLEM.id, PROBLEM.name, 0.9, 'شارب', 'E1', 'DeepSeek']);
  assert.deepEqual(calls.map(c => c.stage), ['item', 'problem']);
  assert.match(calls[0].url, /api\.deepseek\.com\/chat\/completions$/);
  assert.equal(calls[0].body.messages[1].content, 'التكييف بينقط مية من جوه', 'only the problem text is sent');
  assert.deepEqual((await b.getDoc('aiUsage/u1')).n, 1, 'one use counted');
});

test('garbage or unknown ids from the provider fail safe (no invented item / problem)', async () => {
  const b = world();
  fakeNet(() => 'sorry, I cannot help with that');
  await refused(ask(b, 'u1', { kind: 'text', text: 'الحنفية بتنقط' }), 'unavailable');

  const calls = fakeNet(stage => (stage === 'item' ? { item: 'made/up-item', confidence: 7 } : { problem: 'x' }));
  const r = await ask(b, 'u1', { kind: 'text', text: 'الحنفية بتنقط' });
  assert.deepEqual([r.item, r.cat, r.problem], ['', '', ''], 'unknown item dropped');
  assert.equal(r.confidence, 1, 'confidence clamped to 0..1');
  assert.deepEqual(calls.map(c => c.stage), ['item'], 'no problem question without a real item');

  fakeNet(stage => (stage === 'item' ? { item: ITEM.id, confidence: 0.5 } : { problem: 'not-a-problem' }));
  const r2 = await ask(b, 'u1', { kind: 'text', text: 'الحنفية بتنقط' });
  assert.deepEqual([r2.item, r2.problem, r2.problemName], [ITEM.id, '', ''], 'unknown problem dropped, the item is kept');

  fakeNet(stage => (stage === 'item' ? { item: ITEM.id, confidence: 0.5 } : { status: 500 }));
  const r3 = await ask(b, 'u1', { kind: 'text', text: 'الحنفية بتنقط' });
  assert.deepEqual([r3.item, r3.problem], [ITEM.id, ''], 'a failed problem step still returns the item');
});

test('owner switch off → refused; signed-out and too-short text are refused before any provider call', async () => {
  const calls = fakeNet(good);
  await refused(ask(world({ ...ON, features: { text: false, photo: true } }), 'u1', { kind: 'text', text: 'التكييف بينقط' }), 'failed-precondition');
  await refused(ask(world({ ...ON, features: { text: true, photo: false } }), 'u1', { kind: 'photo', image: 'data:image/jpeg;base64,AAAA' }), 'failed-precondition');
  await refused(ask(world({}), 'u1', { kind: 'text', text: 'التكييف بينقط' }), 'failed-precondition');
  await refused(ask(world(), null, { kind: 'text', text: 'التكييف بينقط' }), 'unauthenticated');
  await refused(ask(world(), 'u1', { kind: 'text', text: 'اه' }), 'invalid-argument');
  assert.equal(calls.length, 0);
});

test('daily quota per user and for the whole platform', async () => {
  fakeNet(good);
  const b = world({ ...ON, dailyLimit: 2 });
  for (let i = 0; i < 2; i++) assert.equal((await ask(b, 'u1', { kind: 'text', text: 'التكييف بينقط' })).item, ITEM.id);
  await refused(ask(b, 'u1', { kind: 'text', text: 'التكييف بينقط' }), 'resource-exhausted');
  assert.equal((await ask(b, 'u2', { kind: 'text', text: 'التكييف بينقط' })).item, ITEM.id, 'another user still has quota');

  const g = world({ ...ON, dailyLimit: 10, globalDailyLimit: 2 });
  await ask(g, 'u1', { kind: 'text', text: 'التكييف بينقط' }); await ask(g, 'u2', { kind: 'text', text: 'التكييف بينقط' });
  await refused(ask(g, 'u3', { kind: 'text', text: 'التكييف بينقط' }), 'resource-exhausted');

  const y = world({ ...ON, dailyLimit: 1 });
  await y.setDoc('aiUsage/u1', { day: '2000-01-01', n: 99 });
  assert.equal((await ask(y, 'u1', { kind: 'text', text: 'التكييف بينقط' })).item, ITEM.id, 'yesterday’s count does not block today');
});

test('photo: a valid small image goes to the vision provider; too large or not an image is refused', async () => {
  const calls = fakeNet(good);
  const b = world();
  const r = await ask(b, 'u1', { kind: 'photo', image: 'data:image/jpeg;base64,QUJDRA==' });
  assert.equal(r.item, ITEM.id);
  const parts = calls[0].body.messages[1].content;
  assert.equal(parts[1].image_url.url, 'data:image/jpeg;base64,QUJDRA==');
  const n = calls.length;
  await refused(ask(b, 'u1', { kind: 'photo', image: 'data:image/jpeg;base64,' + 'A'.repeat(450001) }), 'invalid-argument');
  await refused(ask(b, 'u1', { kind: 'photo', image: 'data:image/gif;base64,QUJDRA==' }), 'invalid-argument');
  await refused(ask(b, 'u1', { kind: 'photo', image: 'https://example.com/x.jpg' }), 'invalid-argument');
  assert.equal(calls.length, n, 'refused photos never reach a provider');
  assert.equal((await b.getDoc('aiUsage/u1')).n, 1, 'refused photos are not counted');
});

test('provider failover: a failing first provider is skipped (and stays skipped for a while); all down → unavailable', async () => {
  const b = world({ ...ON, providers: [DS, GM] });
  const calls = fakeNet((stage, url) => (url.includes('deepseek') ? { status: 500 } : good(stage)));
  const r = await ask(b, 'u1', { kind: 'text', text: 'التكييف بينقط' });
  assert.deepEqual([r.item, r.problem, r.provider], [ITEM.id, PROBLEM.id, 'Gemini']);
  assert.deepEqual(calls.map(c => (c.url.includes('deepseek') ? 'ds' : 'gm') + ':' + c.stage), ['ds:item', 'gm:item', 'gm:problem'], 'the failed one is skipped for the problem step too');
  assert.equal(calls[1].body.contents[0].parts[0].text, 'التكييف بينقط');

  calls.length = 0;
  await ask(b, 'u1', { kind: 'text', text: 'التكييف بينقط' });
  assert.ok(calls.every(c => c.url.includes('googleapis')), 'still skipped on the next call');

  ai.resetHealth();
  fakeNet(() => ({ status: 503 }));
  await refused(ask(b, 'u1', { kind: 'text', text: 'التكييف بينقط' }), 'unavailable');

  const disabled = world({ ...ON, providers: [{ ...DS, enabled: false }, { ...GM, apiKey: '' }] });
  await refused(ask(disabled, 'u1', { kind: 'text', text: 'التكييف بينقط' }), 'unavailable');
});
