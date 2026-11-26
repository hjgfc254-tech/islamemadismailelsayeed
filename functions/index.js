/**
 * HANSALEHLAK Cloud Functions — the application's server-side backend.
 *   api      (callable)  every application request {app, method, path, query, body}; identity from Firebase Auth only
 *   session  (callable)  sync | registerCustomer | claimOwner | importLocal
 *   agentApi (https)     call-centre gateway for AI voice agents (Bearer key from AGENT_API_KEYS) — src/agent-gateway.js
 * Business rules run from functions/domain/ (a hash-verified copy of the app's own domain layer).
 * Firestore holds the data; Realtime Database carries low-latency change signals (signals/{uid}).
 * Storage is intentionally not used in this phase.
 */
'use strict';
const { setGlobalOptions } = require('firebase-functions/v2');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
/* firebase-admin 14: modular entry points only (the namespaced admin.firestore() / admin.auth() API was removed) */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const { createLimiter, createTelemetryLimiter, isTelemetryCall, clientIp, isReadCall } = require('./src/limits');
const service = require('./src/service');
const usage = require('./src/usage');
const techStatus = require('./src/tech-status');
const { firestoreAdapter } = require('./src/partial');

initializeApp();
const fs = getFirestore();
fs.settings({ ignoreUndefinedProperties: true });

setGlobalOptions({ region: 'me-central1', maxInstances: 10 });

const backend = {
  adapter: usage.countAdapter(firestoreAdapter(fs, FieldPath)),   /* counted reads / writes feed the Tech Center usage & cost estimate */
  runTransaction: fn => fs.runTransaction(fn),
  async getDoc(p) { usage.addReads(1); const s = await fs.doc(p).get(); return s.exists ? s.data() : null; },
  async setDoc(p, data, merge) { usage.addWrites(1); await fs.doc(p).set(data, { merge: !!merge }); },
  async addDoc(col, data) { usage.addWrites(1); await fs.collection(col).add(data); },
  async queryDocs(col, field, op, value) { const s = await fs.collection(col).where(field, op, value).get(); usage.addReads(Math.max(1, s.docs.length)); return s.docs.map(d => ({ id: d.id, data: d.data() })); },
  /** health probes for the Tech Center: one tiny read per service (throws when unreachable) */
  async ping(kind) {
    if (kind === 'rtdb') { await getDatabase().ref('public/content').once('value'); return; }
    if (kind === 'auth') { try { await getAuth().getUser('__health_probe__'); } catch (e) { if (e && e.code === 'auth/user-not-found') return; throw e; } return; }
    throw new Error('unknown probe');
  },
  async signal(uids, opts) {
    const at = Date.now(), v = opts && opts.full ? { at, full: true } : { at };   // full: the client must not use a delta sync
    await getDatabase().ref('signals').update(Object.fromEntries(uids.map(u => [u, v])));
  },
  async authUsers(uids) {
    const out = {}; if (!uids.length) return out;
    const res = await getAuth().getUsers(uids.slice(0, 100).map(uid => ({ uid })));
    for (const u of res.users) out[u.uid] = { lastSignIn: u.metadata.lastSignInTime || null, created: u.metadata.creationTime || null };
    return out;
  },
  async revokeSessions(uid) { await getAuth().revokeRefreshTokens(uid); },
  async deleteDoc(p) { usage.addDeletes(1); await fs.doc(p).delete(); },
  /** Public RTDB value (rules: read-only to clients), e.g. public/content {v, at} for live site-content updates. */
  async setPublic(p, value) { await getDatabase().ref(p).set(value); },
  log: (msg, detail) => logger.warn(msg, { detail }),
  /** FCM web push, data-only (the service worker renders it). Returns tokens FCM reports as dead, for cleanup. */
  async sendPush(tokens, msg) {
    if (!tokens.length) return [];
    usage.addPushes(Math.min(tokens.length, 500));
    const res = await getMessaging().sendEachForMulticast({
      tokens: tokens.slice(0, 500),
      data: { title: msg.title, body: msg.body, link: msg.link, tag: msg.tag || 'hs' },
      webpush: { headers: { Urgency: 'high', TTL: '86400' } }
    });
    const dead = [];
    res.responses.forEach((r, i) => {
      const code = r.error && r.error.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token' || code === 'messaging/invalid-argument') dead.push(tokens[i]);
    });
    return dead;
  },
  deleteAuthUser: uid => getAuth().deleteUser(uid),
  ensureInviteUser: async (email, name) => { try { return (await getAuth().getUserByEmail(email)).uid; } catch (e) { if (e && e.code !== 'auth/user-not-found') throw e; } const u = await getAuth().createUser({ email, emailVerified: true, displayName: name || undefined, password: require('crypto').randomBytes(24).toString('base64url') }); return u.uid; },
  env: { bootstrapEmails: String(process.env.ADMIN_BOOTSTRAP_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean) }
};

const OPTS = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', cors: true };

const readLimiter = createLimiter();
const telemetryLimiter = createTelemetryLimiter();

function wrap(name, fn) {
  return onCall(OPTS, async request => {
    if (isTelemetryCall(name, request.data)) {
      /* error reports are best-effort: over the limit they are dropped quietly (the client never retries) */
      if (!telemetryLimiter.allow({ uid: request.auth && request.auth.uid, ip: clientIp(request.rawRequest) })) { usage.addRateLimited(); return { ok: true, status: 202, data: { stored: 0, dropped: true } }; }
    }
    if (isReadCall(name, request.data) && !readLimiter.allowRead({ uid: request.auth && request.auth.uid, ip: clientIp(request.rawRequest) })) {
      usage.record({ kind: name, path: request.data && request.data.path, ms: 0, status: 429, rateLimited: true });
      throw new HttpsError('resource-exhausted', 'طلبات كثيرة — حاول بعد دقيقة');
    }
    const t0 = Date.now(), path = request.data && request.data.path;
    try {
      const out = await fn(backend, { auth: request.auth, data: request.data, ip: clientIp(request.rawRequest) });
      usage.record({ kind: name, path, ms: Date.now() - t0, status: (out && typeof out.status === 'number') ? out.status : 200 });
      await usage.maybeFlush(backend);   /* at most one tiny write a minute per instance */
      return out;
    }
    catch (e) {
      usage.record({ kind: name, path, ms: Date.now() - t0, status: 500, rateLimited: e instanceof service.ServiceError && e.code === 'resource-exhausted' });
      if (e instanceof service.ServiceError) throw new HttpsError(e.code, e.message);
      logger.error(name + ' failed', { error: e && e.message, stack: e && e.stack });
      /* unexpected server errors join «أخطاء عند المستخدمين» as app «server» (scrubbed and grouped like client reports) */
      try { await require('./src/telemetry').report(backend, 'server', { reports: [{ msg: String((e && e.message) || 'internal error'), src: name + (request.data && request.data.path ? ' ' + request.data.path : ''), stack: e && e.stack }] }, null); } catch (x) { /* never mask the original error */ }
      throw new HttpsError('internal', 'حدث خطأ غير متوقع');
    }
  });
}

exports.api = wrap('api', service.api);
exports.session = wrap('session', service.session);

/* offers-round clock: every 5 minutes (Cloud Scheduler); see service.tickOffers */
const { onSchedule } = require('firebase-functions/v2/scheduler');
exports.offersClock = onSchedule({ schedule: 'every 5 minutes', region: OPTS.region || 'me-central1', timeoutSeconds: 120 }, async () => {
  try { const r = await service.tickOffers(backend); await techStatus.recordClock(backend, 'offers', { ok: true, changed: r.changed }); if (r.changed) logger.info('offersClock', r); }
  catch (e) { await techStatus.recordClock(backend, 'offers', { ok: false }); logger.error('offersClock failed', { error: e && e.message }); }
});

/* Tech Center health probe: every 10 minutes — stores system/health, tracks the deployed revision, evaluates thresholds and
   alerts the tech team (functions/src/tech-status.js healthTick; alerts via alerts-adapter.js). */
exports.healthClock = onSchedule({ schedule: 'every 10 minutes', region: OPTS.region || 'me-central1', timeoutSeconds: 120 }, async () => {
  try { const r = await techStatus.healthTick(backend); if (r.alerts) logger.warn('healthClock', r); }
  catch (e) { logger.error('healthClock failed', { error: e && e.message }); }
});

/* e-mail digests: every hour at :05 (Cairo time); digest-admin.tick sends the daily / weekly digest once per Cairo day
   when the configured hour is reached (idempotent across instances). Mail credentials: functions/.env or Firebase
   secrets (docs/DEPLOY_CHECKLIST.md); without them digests are generated and stored but not sent. */
const digestAdmin = require('./src/digest-admin');
exports.digestClock = onSchedule({ schedule: '5 * * * *', timeZone: 'Africa/Cairo', region: 'me-central1', timeoutSeconds: 300 }, async () => {
  try { const r = await digestAdmin.tick(backend); if (Object.keys(r).length) logger.info('digestClock', r); }
  catch (e) { logger.error('digestClock failed', { error: e && e.message }); }
});

/* team alerts clock: every 5 minutes — time-based alerts (MP.opsScan: requests without a provider, pending providers,
   overdue collections) and escalation of unclaimed critical alerts to the owner (functions/src/alerts.js). */
const alertsEngine = require('./src/alerts');
exports.alertsClock = onSchedule({ schedule: 'every 5 minutes', region: OPTS.region || 'me-central1', timeoutSeconds: 120 }, async () => {
  try { const r = await alertsEngine.tick(backend, () => service.scanOps(backend)); if (r.raised || r.escalated) logger.info('alertsClock', r); }
  catch (e) { logger.error('alertsClock failed', { error: e && e.message }); }
});

/* Call centre — AI voice agents (any telephony / AI vendor), server-to-server: https POST/GET <agentApi URL>/agent/…
   with `Authorization: Bearer <secret>`; keys come from AGENT_API_KEYS (functions env / secret, `id:secret:scopes`,
   see functions/.env.example and docs/AI_CALLCENTER.md) and never from client code. Rules, rate limit and audit:
   functions/src/agent-gateway.js (the same routes the Admin call-centre page uses through `api`). */
const agentGateway = require('./src/agent-gateway');
exports.agentApi = onRequest({ region: 'me-central1', cors: false, maxInstances: 5, timeoutSeconds: 30 }, async (req, res) => {
  const t0 = Date.now();
  try {
    if (!['GET', 'POST'].includes(req.method)) { res.status(405).json({ ok: false, status: 405, error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or POST' } }); return; }
    if (req.method === 'POST' && JSON.stringify(req.body || {}).length > 200000) { res.status(413).json({ ok: false, status: 413, error: { code: 'TOO_LARGE', message: 'request body too large' } }); return; }
    const out = await service.agentHttp(backend, req);
    usage.record({ kind: 'agentApi', path: req.path, ms: Date.now() - t0, status: out.status, rateLimited: out.status === 429 });
    res.set('Cache-Control', 'no-store').status(out.status).json(out.body);
  } catch (e) {
    logger.error('agentApi failed', { error: e && e.message, stack: e && e.stack });
    res.status(500).json({ ok: false, status: 500, error: { code: 'INTERNAL', message: 'حدث خطأ غير متوقع' } });
  }
});

/* Published service catalogue for the apps: GET https://<site>/catalog-feed (firebase.json Hosting rewrite). Public, read
   only; the CDN caches it (s-maxage) so customers never read Firestore for the catalogue — src/catalog-admin.js feed. */
const catalogAdmin = require('./src/catalog-admin');
exports.catalogFeed = onRequest({ region: 'me-central1', cors: true, maxInstances: 3, timeoutSeconds: 15, memory: '256MiB' }, async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.status(405).send(''); return; }
    const out = await catalogAdmin.feed(backend);
    res.set(out.headers).status(out.status).send(out.body);
  } catch (e) {
    logger.error('catalogFeed failed', { error: e && e.message });
    res.set('Cache-Control', 'no-store').status(503).json({ ok: false });
  }
});

/* call transcripts are kept 30 days, then removed (the call summary stays) — docs/AI_CALLCENTER.md «Retention» */
exports.callLogsClock = onSchedule({ schedule: 'every 24 hours', region: 'me-central1', timeoutSeconds: 120 }, async () => {
  try { const r = await agentGateway.retentionTick(backend); if (r.deleted) logger.info('callLogsClock', r); }
  catch (e) { logger.error('callLogsClock failed', { error: e && e.message }); }
  try { const r = await require('./src/support-chat').retentionTick(backend); if (r.deleted) logger.info('callLogsClock chats', r); }
  catch (e) { logger.error('callLogsClock failed', { error: e && e.message }); }
});