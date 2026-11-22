/**
 * HANSALEHLAK Cloud Functions — the application's server-side backend.
 *   api      (callable)  every application request {app, method, path, query, body}; identity from Firebase Auth only
 *   session  (callable)  sync | registerCustomer | claimOwner | importLocal
 * Business rules run from functions/domain/ (a hash-verified copy of the app's own domain layer).
 * Firestore holds the data; Realtime Database carries low-latency change signals (signals/{uid}).
 * Storage is intentionally not used in this phase.
 */
'use strict';
const { setGlobalOptions } = require('firebase-functions/v2');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
/* firebase-admin 14: modular entry points only (the namespaced admin.firestore() / admin.auth() API was removed) */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const { createLimiter, createTelemetryLimiter, isTelemetryCall, clientIp, isReadCall } = require('./src/limits');
const service = require('./src/service');
const { firestoreAdapter } = require('./src/partial');

initializeApp();
const fs = getFirestore();
fs.settings({ ignoreUndefinedProperties: true });

setGlobalOptions({ region: 'me-central1', maxInstances: 10 });

const backend = {
  adapter: firestoreAdapter(fs, FieldPath),
  runTransaction: fn => fs.runTransaction(fn),
  async getDoc(p) { const s = await fs.doc(p).get(); return s.exists ? s.data() : null; },
  async setDoc(p, data, merge) { await fs.doc(p).set(data, { merge: !!merge }); },
  async addDoc(col, data) { await fs.collection(col).add(data); },
  async queryDocs(col, field, op, value) { const s = await fs.collection(col).where(field, op, value).get(); return s.docs.map(d => ({ id: d.id, data: d.data() })); },
  async signal(uids) {
    const at = Date.now();
    await getDatabase().ref('signals').update(Object.fromEntries(uids.map(u => [u, { at }])));
  },
  async authUsers(uids) {
    const out = {}; if (!uids.length) return out;
    const res = await getAuth().getUsers(uids.slice(0, 100).map(uid => ({ uid })));
    for (const u of res.users) out[u.uid] = { lastSignIn: u.metadata.lastSignInTime || null, created: u.metadata.creationTime || null };
    return out;
  },
  async revokeSessions(uid) { await getAuth().revokeRefreshTokens(uid); },
  async deleteDoc(p) { await fs.doc(p).delete(); },
  /** Public RTDB value (rules: read-only to clients), e.g. public/content {v, at} for live site-content updates. */
  async setPublic(p, value) { await getDatabase().ref(p).set(value); },
  log: (msg, detail) => logger.warn(msg, { detail }),
  /** FCM web push, data-only (the service worker renders it). Returns tokens FCM reports as dead, for cleanup. */
  async sendPush(tokens, msg) {
    if (!tokens.length) return [];
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
      if (!telemetryLimiter.allow({ uid: request.auth && request.auth.uid, ip: clientIp(request.rawRequest) })) return { ok: true, status: 202, data: { stored: 0, dropped: true } };
    }
    if (isReadCall(name, request.data) && !readLimiter.allowRead({ uid: request.auth && request.auth.uid, ip: clientIp(request.rawRequest) })) {
      throw new HttpsError('resource-exhausted', 'طلبات كثيرة — حاول بعد دقيقة');
    }
    try { return await fn(backend, { auth: request.auth, data: request.data, ip: clientIp(request.rawRequest) }); }
    catch (e) {
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
  try { const r = await service.tickOffers(backend); if (r.changed) logger.info('offersClock', r); }
  catch (e) { logger.error('offersClock failed', { error: e && e.message }); }
});

/* e-mail digests: every hour at :05 (Cairo time); digest-admin.tick sends the daily / weekly digest once per Cairo day
   when the configured hour is reached (idempotent across instances). Mail credentials: functions/.env or Firebase
   secrets (docs/DEPLOY_CHECKLIST.md); without them digests are generated and stored but not sent. */
const digestAdmin = require('./src/digest-admin');
exports.digestClock = onSchedule({ schedule: '5 * * * *', timeZone: 'Africa/Cairo', region: 'me-central1', timeoutSeconds: 300 }, async () => {
  try { const r = await digestAdmin.tick(backend); if (Object.keys(r).length) logger.info('digestClock', r); }
  catch (e) { logger.error('digestClock failed', { error: e && e.message }); }
});
