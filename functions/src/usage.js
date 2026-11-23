/**
 * Cheap usage counters for the Tech Center — NO personal data, only numbers.
 * Counted in memory per Cloud Functions instance and flushed at most once every 5 minutes to ONE document per instance and
 * day: usage/{YYYY-MM-DD}_{instanceId} (server-only collection, 45-day TTL on expiresAt). The status route sums the
 * month's documents (cached for a minute), so there is no cross-instance contention and no per-request write.
 * Counted: api / session calls, 5xx errors, rejected (4xx) calls, rate-limit hits, Firestore reads / writes /
 * deletes (through the counted adapter in index.js), push sends, and a latency histogram per route group.
 */
'use strict';
const crypto = require('crypto');

/* upper bounds in ms; the last bucket is «more than the last bound» */
const BUCKETS = [50, 100, 200, 400, 800, 1600, 3200];
const GROUPS = ['sync', 'requests', 'customer', 'provider', 'admin', 'other'];
const GROUP_LABEL = { sync: 'المزامنة', requests: 'الطلبات', customer: 'العميل', provider: 'مقدم الخدمة', admin: 'الإدارة', other: 'أخرى' };
const FLUSH_MS = 5 * 60000, TTL_DAYS = 45;
const INSTANCE = ((h) => 'i' + h.slice(0, 4) + 'x' + h.slice(4))(crypto.randomBytes(4).toString('hex'));   // letters break digit runs (never looks like a phone number)

const dayOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const fresh = (day) => ({ day, month: day.slice(0, 7), instance: INSTANCE, api: 0, session: 0, reads: 0, writes: 0, deletes: 0, pushes: 0,
  rateLimited: 0, errors: 0, rejected: 0, hist: {}, n: {}, lastFlush: 0, dirty: false });
let state = fresh(dayOf());

/** route group of a call: the session sync, or the first segment of the api path */
function groupOf(kind, path) {
  if (kind === 'session') return 'sync';
  const seg = String(path || '').split('/').filter(Boolean)[0];
  if (seg === 'requests') return 'requests';
  if (seg === 'customers') return 'customer';
  if (seg === 'providers') return 'provider';
  if (seg === 'admin') return 'admin';
  return 'other';
}
const bucketOf = (ms) => { for (let i = 0; i < BUCKETS.length; i++) if (ms <= BUCKETS[i]) return i; return BUCKETS.length; };

function roll(now) { const d = dayOf(now); if (d !== state.day) { const old = state; state = fresh(d); return old; } return null; }

/** one finished call: kind 'api' | 'session', path (api only), ms, status (HTTP-like), rateLimited */
function record({ kind, path, ms, status, rateLimited }, now = Date.now()) {
  roll(now);
  const g = groupOf(kind, path);
  state[kind === 'session' ? 'session' : 'api']++;
  const h = state.hist[g] || (state.hist[g] = new Array(BUCKETS.length + 1).fill(0));
  h[bucketOf(+ms || 0)]++; state.n[g] = (state.n[g] || 0) + 1;
  if (rateLimited) state.rateLimited++;
  else if (status >= 500) state.errors++;
  else if (status >= 400) state.rejected++;
  state.dirty = true;
}
const add = (k, n) => { state[k] += n; state.dirty = true; };
const addReads = (n = 1) => add('reads', Math.max(0, +n || 0));
const addWrites = (n = 1) => add('writes', Math.max(0, +n || 0));
const addDeletes = (n = 1) => add('deletes', Math.max(0, +n || 0));
const addPushes = (n = 1) => add('pushes', Math.max(0, +n || 0));
const addRateLimited = () => add('rateLimited', 1);

function serialize(s, now = Date.now()) {
  const { dirty, lastFlush, ...data } = s;
  return { ...data, updatedAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL_DAYS * 86400000) };
}
/** write this instance's day totals (at most once a minute unless forced). Returns true when it wrote. */
async function maybeFlush(backend, now = Date.now(), force = false) {
  const old = roll(now);
  const targets = [];
  if (old && old.dirty) targets.push(old);
  if (state.dirty && (force || now - state.lastFlush >= FLUSH_MS)) targets.push(state);
  if (!targets.length) return false;
  for (const s of targets) {
    try { await backend.setDoc(`usage/${s.day}_${s.instance}`, serialize(s, now), false); s.dirty = false; s.lastFlush = now; }
    catch (e) { if (backend.log) backend.log('usage flush failed', e && e.message); }
  }
  return true;
}

/** counted Firestore adapter: same interface as partial.js firestoreAdapter, plus read / write counters */
function countAdapter(a) {
  return {
    ...a,
    async get(tx, p) { addReads(1); return a.get(tx, p); },
    async query(tx, col, q) { const rows = await a.query(tx, col, q); addReads(Math.max(1, rows.length)); return rows; },
    async count(col, where) { addReads(1); return a.count(col, where); },
    set(tx, p, d) { addWrites(1); return a.set(tx, p, d); },
    del(tx, p) { addDeletes(1); return a.del(tx, p); }
  };
}

/* ───── aggregation / statistics (pure) ───── */
function merge(docs) {
  const out = { api: 0, session: 0, reads: 0, writes: 0, deletes: 0, pushes: 0, rateLimited: 0, errors: 0, rejected: 0, hist: {}, n: {}, days: new Set() };
  for (const d of docs || []) {
    for (const k of ['api', 'session', 'reads', 'writes', 'deletes', 'pushes', 'rateLimited', 'errors', 'rejected']) out[k] += +d[k] || 0;
    if (d.day) out.days.add(d.day);
    for (const [g, arr] of Object.entries(d.hist || {})) { const h = out.hist[g] || (out.hist[g] = new Array(BUCKETS.length + 1).fill(0)); arr.forEach((c, i) => { h[i] += +c || 0; }); }
    for (const [g, c] of Object.entries(d.n || {})) out.n[g] = (out.n[g] || 0) + (+c || 0);
  }
  return { ...out, days: out.days.size };
}
/** p-th percentile from a bucket histogram: the upper bound of the bucket holding it (null = no data) */
function percentile(hist, p) {
  const total = (hist || []).reduce((s, c) => s + c, 0);
  if (!total) return null;
  const need = Math.ceil(total * p); let run = 0;
  for (let i = 0; i < hist.length; i++) { run += hist[i]; if (run >= need) return i < BUCKETS.length ? BUCKETS[i] : BUCKETS[BUCKETS.length - 1] * 2; }
  return BUCKETS[BUCKETS.length - 1] * 2;
}
function performance(m) {
  const groups = GROUPS.filter((g) => m.n[g]).map((g) => ({ group: g, label: GROUP_LABEL[g], count: m.n[g], p50: percentile(m.hist[g], 0.5), p95: percentile(m.hist[g], 0.95), slow: percentile(m.hist[g], 0.95) > 1600 }));
  const calls = m.api + m.session;
  return { calls, errors: m.errors, rejected: m.rejected, errorRate: calls ? +(m.errors / calls).toFixed(4) : 0, groups, cappedAt: BUCKETS[BUCKETS.length - 1] * 2 };
}

/* ───── cost estimate (USD list prices, approximate; free tiers ignored → a conservative upper estimate) ───── */
const PRICES = { readPer100k: 0.06, writePer100k: 0.18, deletePer100k: 0.02, invocationPerMillion: 0.4 };
function cost(m) {
  const usd = (m.reads / 1e5) * PRICES.readPer100k + (m.writes / 1e5) * PRICES.writePer100k + (m.deletes / 1e5) * PRICES.deletePer100k + ((m.api + m.session) / 1e6) * PRICES.invocationPerMillion;
  return +usd.toFixed(4);
}
/** month-to-date + projection to the end of the month vs the budget */
function estimate(monthMerged, now, cfg) {
  const d = new Date(now), dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(), elapsed = Math.max(1, d.getUTCDate());
  const rate = +cfg.usdToEgp > 0 ? +cfg.usdToEgp : 50, budgetEGP = +cfg.budgetEGP > 0 ? +cfg.budgetEGP : 0;
  const mtdUSD = cost(monthMerged), projUSD = +(mtdUSD / elapsed * dim).toFixed(4);
  const mtdEGP = Math.round(mtdUSD * rate), projEGP = Math.round(projUSD * rate);
  const ratio = budgetEGP ? projEGP / budgetEGP : 0;
  const level = !budgetEGP ? 'unknown' : ratio >= 1.3 ? 'critical' : ratio >= 1 ? 'warn' : ratio >= 0.8 ? 'watch' : 'ok';
  return { monthToDateEGP: mtdEGP, projectedEGP: projEGP, budgetEGP, usdToEgp: rate, ratio: +ratio.toFixed(3), level, daysElapsed: elapsed, daysInMonth: dim, prices: PRICES, note: 'تقدير تقريبي بأسعار القائمة، من غير الحد المجاني' };
}

const _reset = () => { state = fresh(dayOf()); };
module.exports = { BUCKETS, GROUPS, GROUP_LABEL, FLUSH_MS, INSTANCE, groupOf, bucketOf, record, addReads, addWrites, addDeletes, addPushes, addRateLimited,
  maybeFlush, countAdapter, merge, percentile, performance, cost, estimate, serialize, _reset, _state: () => state };
