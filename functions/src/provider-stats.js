/**
 * Provider ranking stats kept ON the provider document (cost): matching used to read every candidate's whole history
 * (all assignments + reviews of up to 100 providers — ~5,000 reads per new request at 1,000 users, growing every day).
 * Now each provider carries
 *     stats = { n, sum, dec, ok }     n / sum: visible reviews and their stars · dec / ok: decided offers / not rejected
 * and the domain (MP.rating / MP.acceptRate) reads it. The numbers are maintained exactly at commit time from the
 * difference between the loaded and the next documents (applyStatsDelta); a provider without stats is backfilled ONCE
 * from its full history (plan.candidates loads that history only for such providers; backfillStats computes it).
 */
'use strict';
const ZERO = () => ({ n: 0, sum: 0, dec: 0, ok: 0 });
const decided = (s) => s !== 'offered' && s !== 'withdrawn';
function contribAssignment(a) {
  if (!a || !a.providerId) return null;
  const dec = decided(a.status);
  return { pid: String(a.providerId), dec: dec ? 1 : 0, ok: dec && a.status !== 'rejected' ? 1 : 0, n: 0, sum: 0 };
}
function contribReview(r) {
  if (!r || !r.providerId) return null;
  const on = !r.hidden && Number.isFinite(+r.stars) && r.stars !== '' && r.stars != null;
  return { pid: String(r.providerId), n: on ? 1 : 0, sum: on ? +r.stars : 0, dec: 0, ok: 0 };
}
/** stats from a full history (backfill) */
function compute(pid, assignments, reviews) {
  const s = ZERO();
  for (const a of assignments || []) { const c = a && String(a.providerId) === String(pid) ? contribAssignment(a) : null; if (c) { s.dec += c.dec; s.ok += c.ok; } }
  for (const r of reviews || []) { const c = r && String(r.providerId) === String(pid) ? contribReview(r) : null; if (c) { s.n += c.n; s.sum += c.sum; } }
  return s;
}
/** per-provider change between the loaded documents (Map id → doc) and the next arrays */
function deltas(prevA, nextA, prevR, nextR, keyOf) {
  const out = new Map();
  const add = (c, sign) => { if (!c) return; const d = out.get(c.pid) || ZERO(); d.n += sign * c.n; d.sum += sign * c.sum; d.dec += sign * c.dec; d.ok += sign * c.ok; out.set(c.pid, d); };
  const walk = (prev, next, key, fn) => {
    const seen = new Set();
    for (const it of next || []) { const id = keyOf(key, it); seen.add(id); const old = prev.get(id); add(fn(old), -1); add(fn(it), +1); }
    for (const [id, old] of prev) if (!seen.has(id)) add(fn(old), -1);
  };
  walk(prevA, nextA, 'assignments', contribAssignment);
  walk(prevR, nextR, 'reviews', contribReview);
  for (const [pid, d] of out) if (!d.n && !d.sum && !d.dec && !d.ok) out.delete(pid);
  return out;
}

/**
 * Before PartialDb.commit(next): updates `stats` of every provider whose assignments / reviews changed, and backfills
 * providers listed in ld.statsBackfill (their full history was loaded by plan.candidates). Reads happen here, before any
 * write of the transaction. Mutates next.providers.
 */
async function applyStatsDelta(ld, next, keyOf) {
  if (!next || !Array.isArray(next.providers)) return;
  const backfill = ld.statsBackfill || new Set();
  const d = deltas(ld.maps.assignments, next.assignments, ld.maps.reviews, next.reviews, keyOf);
  const byId = new Map(next.providers.map((p) => [String(p.id), p]));
  for (const pid of backfill) { const p = byId.get(pid); if (p && !p.stats) p.stats = compute(pid, next.assignments, next.reviews); }
  for (const [pid, x] of d) {
    if (backfill.has(pid)) continue;                       // computed from the full history above
    let p = byId.get(pid);
    if (!p) {                                              // provider not loaded by this operation: load it, keep it in next
      const doc = await ld.doc('providers', pid);
      if (!doc) continue;
      p = { ...doc }; next.providers.push(p); byId.set(pid, p);
    }
    if (!p.stats) continue;                                // never initialised: the next candidates() backfills it exactly
    p.stats = { n: Math.max(0, p.stats.n + x.n), sum: Math.max(0, p.stats.sum + x.sum), dec: Math.max(0, p.stats.dec + x.dec), ok: Math.max(0, p.stats.ok + x.ok) };
  }
}

module.exports = { applyStatsDelta, compute, deltas, contribAssignment, contribReview };
