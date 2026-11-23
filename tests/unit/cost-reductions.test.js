'use strict';
/* Firestore cost guards (2026-11-23 audit): idle clocks read almost nothing, system/clocks is not rewritten every run,
   escalation skips the settings read when there is nothing critical. In-memory backend with read / write counters. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const service = require(path.resolve(__dirname, '../../functions/src/service.js'));
const tech = require(path.resolve(__dirname, '../../functions/src/tech-status.js'));
const alerts = require(path.resolve(__dirname, '../../functions/src/alerts.js'));
const { memoryBackend } = require('../helpers/memory-backend.js');

function counted(seed) {
  const b = memoryBackend(seed), n = { reads: 0, writes: 0 };
  const a = b.adapter, get = a.get, query = a.query, set = a.set;
  a.get = async (tx, p) => { n.reads++; return get(tx, p); };
  a.query = async (tx, col, q) => { const r = await query(tx, col, q); n.reads += Math.max(1, r.length); return r; };
  a.set = (tx, p, d) => { n.writes++; return set(tx, p, d); };
  const gd = b.getDoc, sd = b.setDoc, qd = b.queryDocs;
  b.getDoc = async (p) => { n.reads++; return gd.call(b, p); };
  b.setDoc = async (p, d, m) => { n.writes++; return sd.call(b, p, d, m); };
  b.queryDocs = async (...x) => { const r = await qd.apply(b, x); n.reads += Math.max(1, r.length); return r; };
  return { b, n };
}

test('idle clocks: the offers round and the ops scan cost one query each when nothing is open', async () => {
  const { b, n } = counted({ 'system/meta': { lastReqNo: 0 }, 'system/settings': {} });
  await service.tickOffers(b);
  assert.equal(n.reads, 1, 'offers clock: only the open-requests query'); assert.equal(n.writes, 0);
  n.reads = 0;
  const events = await service.scanOps(b);
  assert.deepEqual(events, []);
  assert.ok(n.reads <= (new Date().getUTCMinutes() < 5 ? 6 : 1), 'ops scan outside the hourly slot: one query, got ' + n.reads);
});

test('system/clocks is written when the result changes or every 15 minutes, not on every run', async () => {
  const { b, n } = counted({});
  const t = Date.UTC(2026, 10, 23, 10, 0);
  assert.equal(await tech.recordClock(b, 'costtest', { ok: true }, t), true);
  assert.equal(await tech.recordClock(b, 'costtest', { ok: true }, t + 5 * 60000), false);
  assert.equal(await tech.recordClock(b, 'costtest', { ok: false }, t + 6 * 60000), true, 'a failure is written at once');
  assert.equal(await tech.recordClock(b, 'costtest', { ok: false }, t + 7 * 60000), false);
  assert.equal(await tech.recordClock(b, 'costtest', { ok: false }, t + 22 * 60000), true, 'heartbeat after 15 min');
  assert.equal(n.writes, 3);
});

test('escalation reads the settings only when an unescalated critical alert is open', async () => {
  const { b, n } = counted({});
  assert.equal(await alerts.escalate(b, Date.now()), 0);
  assert.equal(n.reads, 1, 'one empty query, no settings read');
});
