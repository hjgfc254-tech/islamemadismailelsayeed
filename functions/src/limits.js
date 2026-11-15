/**
 * Read-path rate limiting (GET api calls and session.sync) — in memory, per Functions instance, NO database writes.
 *   signed-in user  → key uid (from the verified token; never from client data)
 *   anonymous       → key = client IP taken from the RIGHTMOST X-Forwarded-For entry (appended by Google's front end,
 *                     so a client cannot rotate it by sending its own header), else the socket address
 *   plus a per-instance ceiling for all anonymous reads together.
 * With maxInstances = 10 the worst case is bounded at 10 × the per-instance ceiling. Mutations keep the
 * Firestore-backed per-user limiter in service.js.
 */
'use strict';
const LIMITS = Object.freeze({ userReadsPerMin: 240, ipReadsPerMin: 60, anonymousReadsPerMinPerInstance: 600 });
const WINDOW_MS = 60000;
const MAX_KEYS = 20000;

function createLimiter(limits = LIMITS, now = () => Date.now()) {
  const buckets = new Map();
  let anonWindow = 0, anonCount = 0;
  function hit(key, max) {
    const t = now(), w = Math.floor(t / WINDOW_MS);
    let b = buckets.get(key);
    if (!b || b.w !== w) {
      if (buckets.size > MAX_KEYS) for (const [k, v] of buckets) if (v.w !== w) buckets.delete(k);   // prune old windows
      b = { w, n: 0 }; buckets.set(key, b);
    }
    b.n++;
    return b.n <= max;
  }
  return {
    /** true when the read may proceed */
    allowRead({ uid, ip }) {
      if (uid) return hit('u:' + uid, limits.userReadsPerMin);
      const w = Math.floor(now() / WINDOW_MS);
      if (w !== anonWindow) { anonWindow = w; anonCount = 0; }
      if (++anonCount > limits.anonymousReadsPerMinPerInstance) return false;
      return hit('ip:' + (ip || 'unknown'), limits.ipReadsPerMin);
    },
    _size: () => buckets.size
  };
}

/** Client IP for rate limiting: rightmost X-Forwarded-For hop (infrastructure-appended), else the socket address. */
function clientIp(rawRequest) {
  if (!rawRequest) return null;
  const xff = String((rawRequest.headers && rawRequest.headers['x-forwarded-for']) || '');
  const hops = xff.split(',').map(s => s.trim()).filter(Boolean);
  return hops.length ? hops[hops.length - 1] : (rawRequest.ip || (rawRequest.socket && rawRequest.socket.remoteAddress) || null);
}

/** Is this callable invocation a read (GET api / session.sync)? */
function isReadCall(name, data) {
  if (name === 'session') return !!data && data.op === 'sync';
  if (name === 'api') return !!data && String(data.method || '').toUpperCase() === 'GET';
  return false;
}

module.exports = { createLimiter, clientIp, isReadCall, LIMITS };
