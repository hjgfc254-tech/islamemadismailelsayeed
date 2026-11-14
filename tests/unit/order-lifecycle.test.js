'use strict';
/* Paid order lifecycle (2026-11-14). Approving a quote agrees the price and returns the job to in-progress; the provider
   records completion at the agreed price; the customer confirms (closes). Free service stays a separate path. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boot: bootCustomer } = require('../helpers/customer-app-harness.js');

const ROOT = path.resolve(__dirname, '../..');
function store() {
  const m = new Map();
  const ctx = { console, localStorage: { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['shared/config/legacy-data.js', 'services/local-catalog.js', 'services/local-market-store.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const M = vm.runInContext('MP', ctx);
  M.db().settings.autoAssign = false;
  return M;
}
function started(M) {
  const r = M.createRequest({ name: 'سارة', phone: '01011112222', cat: 'electric', serviceName: 'كهرباء', desc: 'عطل', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' });
  M.assign(r.id, 'p_demo1'); M.respond(r.id, true); M.confirmTime(r.id, 'provider');
  for (const s of ['enroute', 'arrived', 'started']) assert.equal(M.advance(r.id, s), true, s);
  return r.id;
}
const statuses = (M, id) => Array.from(M.get('serviceRequests', id).history, h => h.s);   // copy out of the vm realm
const txCount = (M, id) => M.db().transactions.filter(t => t.reqId === id).length;

test('happy path: quote → approve (in progress, agreed price) → provider completes → customer closes', async () => {
  const M = store(), id = started(M);
  assert.equal(M.createQuote(id, { labor: 200, parts: 50 }).ok, true);
  assert.equal(M.get('serviceRequests', id).status, 'quote');
  assert.equal(M.approveQuote(id), true);
  const r = M.get('serviceRequests', id);
  assert.deepEqual([r.status, r.agreedValue, r.finalValue, M.currentQuote(id).status], ['started', 250, null, 'approved']);
  assert.equal(txCount(M, id), 0, 'no money record before completion');
  assert.equal(M.complete(id), true, 'completion with no amount uses the agreed price');
  assert.deepEqual([r.status, r.finalValue, txCount(M, id)], ['completed', 250, 1]);
  assert.equal(M.close(id), true);
  assert.equal(r.status, 'closed');
  assert.deepEqual(statuses(M, id).slice(-4), ['quote', 'started', 'completed', 'closed']);
});

test('invalid transitions are rejected', async () => {
  const M = store(), id = started(M);
  assert.equal(M.approveQuote(id), false, 'nothing to approve');
  assert.equal(M.rejectQuote(id), false, 'nothing to reject');
  assert.equal(M.close(id), false, 'cannot close an in-progress job');
  M.createQuote(id, { labor: 100 });
  assert.equal(M.complete(id, 100), false, 'cannot complete while the customer has not decided');
  assert.equal(M.advance(id, 'completed'), false, 'cannot skip to completed via advance');
  assert.equal(M.advance(id, 'closed'), false, 'cannot close via advance');
  assert.equal(M.approveQuote(id), true);
  assert.equal(M.approveQuote(id), false, 'no second approval');
  assert.equal(M.rejectQuote(id, 'x'), false, 'approved quote cannot be rejected');
  assert.equal(M.createQuote(id, { labor: 999 }).ok, false, 'approved quote cannot be replaced');
  assert.equal(M.complete(id, 400), false, 'amount different from the agreed price');
  assert.equal(M.cancel(id, 'x'), false, 'cannot cancel once work started');
  assert.equal(M.complete(id, 100), true, 'same amount as agreed is fine');
  assert.equal(M.complete(id), false, 'no double completion');
  assert.equal(txCount(M, id), 1, 'no duplicate transaction');
});

test('reject → renegotiate; updating a pending quote supersedes it (one live quote, no duplicates)', async () => {
  const M = store(), id = started(M);
  const q1 = M.createQuote(id, { labor: 300 }).quote;
  const q2 = M.createQuote(id, { labor: 280 }).quote;
  assert.equal(M.db().quotes.find(q => q.id === q1.id).status, 'superseded');
  assert.equal(M.db().quotes.filter(q => q.reqId === id && q.status === 'pending').length, 1);
  assert.equal(M.currentQuote(id).id, q2.id);
  assert.equal(M.rejectQuote(id, 'غالي'), true);
  assert.equal(M.get('serviceRequests', id).status, 'started');
  assert.equal(M.approveQuote(id), false, 'a rejected quote cannot be approved later');
  M.createQuote(id, { labor: 250 });
  assert.equal(M.approveQuote(id), true);
  assert.equal(M.get('serviceRequests', id).agreedValue, 250);
});

test('zero quotes stay forbidden; quotes are refused before the job is scheduled', async () => {
  const M = store();
  const r = M.createRequest({ name: 'سارة', phone: '01011112222', cat: 'electric', serviceName: 'كهرباء', desc: 'عطل', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' });
  M.assign(r.id, 'p_demo1'); M.respond(r.id, true);
  assert.equal(M.createQuote(r.id, { labor: 100 }).ok, false, 'accepted but not yet scheduled');
  const id = started(M);
  assert.equal(M.createQuote(id, { labor: 0 }).ok, false);
});

test('direct-price path (no quote) still completes with a positive value; free path stays separate', async () => {
  const M = store(), id = started(M);
  assert.equal(M.complete(id, 0), false);
  assert.equal(M.complete(id, 180, 10), true);
  assert.equal(M.get('serviceRequests', id).finalValue, 180);
  const f = started(M);
  assert.equal(M.proposeFree(f, 'warranty').ok, true);
  assert.equal(M.createQuote(f, { labor: 100 }).ok, false);
  assert.equal(M.complete(f, 100), false);
  M.respondFree(f, true);
  assert.equal(M.completeFree(f), true);
  const t = M.db().transactions.find(x => x.reqId === f);
  assert.deepEqual([t.free, t.value, t.commission], [true, 0, 0]);
});

test('customer UI: approving a quote shows the agreed price and keeps the job in progress; confirm appears only after completion', async () => {
  const app = bootCustomer();
  app.signIn();
  const id = app.newRequest();
  const q = JSON.stringify(id);
  app.run(`(()=>{const id=${q};MP.db().settings.autoAssign=false;if(!MP.activeAssignment(id))MP.assign(id,'p_demo1');MP.respond(id,true);MP.confirmTime(id,'provider');['enroute','arrived','started'].forEach(s=>MP.advance(id,s));MP.createQuote(id,{labor:220});})()`);
  app.run(`show('tracking', ${q})`);
  assert.match(app.html(), /data-act="approveQuote"/);
  assert.doesNotMatch(app.html(), /data-act="custClose"/);
  await app.clickDoc({ act: 'approveQuote', id });
  assert.equal(app.run(`MP.get('serviceRequests', ${q}).status`), 'started');
  assert.match(app.html(), /السعر المتفق عليه/);
  assert.doesNotMatch(app.html(), /data-act="custClose"/, 'customer cannot confirm before the provider completes');
  app.run(`MP.complete(${q}); show('tracking', ${q})`);
  assert.match(app.html(), /القيمة النهائية/);
  await app.clickDoc({ act: 'custClose', id });
  assert.equal(app.run(`MP.get('serviceRequests', ${q}).status`), 'closed');
});
