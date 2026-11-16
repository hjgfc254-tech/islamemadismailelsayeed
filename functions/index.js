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
const admin = require('firebase-admin');
const { FieldPath } = require('firebase-admin/firestore');
const { createLimiter, clientIp, isReadCall } = require('./src/limits');
const service = require('./src/service');
const { firestoreAdapter } = require('./src/partial');

admin.initializeApp();
const fs = admin.firestore();
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
    await admin.database().ref('signals').update(Object.fromEntries(uids.map(u => [u, { at }])));
  },
  async authUsers(uids) {
    const out = {}; if (!uids.length) return out;
    const res = await admin.auth().getUsers(uids.slice(0, 100).map(uid => ({ uid })));
    for (const u of res.users) out[u.uid] = { lastSignIn: u.metadata.lastSignInTime || null, created: u.metadata.creationTime || null };
    return out;
  },
  async revokeSessions(uid) { await admin.auth().revokeRefreshTokens(uid); },
  async deleteDoc(p) { await fs.doc(p).delete(); },
  /** Public RTDB value (rules: read-only to clients), e.g. public/content {v, at} for live site-content updates. */
  async setPublic(p, value) { await admin.database().ref(p).set(value); },
  log: (msg, detail) => logger.warn(msg, { detail }),
  /** FCM web push, data-only (the service worker renders it). Returns tokens FCM reports as dead, for cleanup. */
  async sendPush(tokens, msg) {
    if (!tokens.length) return [];
    const res = await admin.messaging().sendEachForMulticast({
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
  env: { bootstrapEmails: String(process.env.ADMIN_BOOTSTRAP_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean) }
};

const OPTS = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', cors: true };

const readLimiter = createLimiter();

function wrap(name, fn) {
  return onCall(OPTS, async request => {
    if (isReadCall(name, request.data) && !readLimiter.allowRead({ uid: request.auth && request.auth.uid, ip: clientIp(request.rawRequest) })) {
      throw new HttpsError('resource-exhausted', 'طلبات كثيرة — حاول بعد دقيقة');
    }
    try { return await fn(backend, { auth: request.auth, data: request.data }); }
    catch (e) {
      if (e instanceof service.ServiceError) throw new HttpsError(e.code, e.message);
      logger.error(name + ' failed', { error: e && e.message, stack: e && e.stack });
      throw new HttpsError('internal', 'حدث خطأ غير متوقع');
    }
  });
}

exports.api = wrap('api', service.api);
exports.session = wrap('session', service.session);
