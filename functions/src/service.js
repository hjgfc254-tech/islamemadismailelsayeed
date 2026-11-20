/**
 * Backend service core (framework-free so it is testable without the Firebase runtime).
 * backend: {
 *   adapter          partial-read adapter (functions/src/partial.js)
 *   runTransaction(fn(tx))
 *   getDoc(path), setDoc(path, data, merge?), addDoc(col, data), queryDocs(col, field, op, value) → [{id,data}]
 *   signal(uids[])   Realtime Database change signals
 *   env: { bootstrapEmails: [] }
 * }
 * Reads are operation-scoped (plan.js): a GET runs without a transaction; a mutation runs in ONE transaction that reads
 * only the documents its rules need and writes only what changed.
 */
'use strict';
const runtime = require('./runtime');
const { keyOf, colName, KNOWN_ARRAYS } = require('./store');
const crypto = require('crypto');
const { PartialDb } = require('./partial');
const { plan, syncPlan } = require('./plan');
const { normalizePhone, APPS } = require('./identity');
const { scopeFor, customerRequestView, customerQuote } = require('./scope');
const workforce = require('./workforce');
const adminExtra = require('./admin-extra');
const telemetry = require('./telemetry');
const adminCode = require('./admin-code');
/* admin-code errors carry a callable error code: rethrow them as ServiceError (index.js maps those to HttpsError) */
const viaCode = async (p) => { try { return await p; } catch (e) { if (e && e.isServiceError) fail(e.code, e.message); throw e; } };
const content = require('./content');
const ai = require('./ai');
const { invalidateShared } = require('./partial');

const METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];
const WRITE_LIMIT_PER_MIN = 60;
const IMPORT_LIMIT = 5000;
const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;

class ServiceError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, message) => { throw new ServiceError(code, message); };

function tokenOf(auth) { return auth && auth.uid ? { ...(auth.token || {}), uid: auth.uid } : null; }
function str(v, max) { return typeof v === 'string' && v.length <= max ? v : null; }

function validateApi(data) {
  const d = data || {};
  const app = APPS.includes(d.app) ? d.app : fail('invalid-argument', 'app must be customer, provider or admin');
  const method = METHODS.includes(String(d.method || '').toUpperCase()) ? String(d.method).toUpperCase() : fail('invalid-argument', 'unsupported method');
  const p = str(d.path, 300);
  if (!p || !p.startsWith('/') || p.includes('..')) fail('invalid-argument', 'invalid path');
  const query = d.query && typeof d.query === 'object' ? d.query : {};
  const body = d.body && typeof d.body === 'object' ? d.body : {};
  /* image uploads (Admin site content) carry one compressed image; everything else stays small */
  const maxBody = app === 'admin' && method === 'POST' && p === '/admin/media' ? 410000 : (app === 'provider' && method === 'POST' && /^\/requests\/[^/]+\/photos$/.test(p) ? 200000 : 100000);   // one compressed job photo
  if (JSON.stringify(body).length > maxBody) fail('invalid-argument', 'request body too large');
  const idem = d.idempotencyKey == null ? null : (/^[\w-]{8,80}$/.test(String(d.idempotencyKey)) ? String(d.idempotencyKey) : fail('invalid-argument', 'invalid idempotencyKey'));
  return { app, method, path: p, query, body, idem };
}

async function rateLimit(backend, key) {
  const minute = Math.floor(Date.now() / 60000);
  await backend.runTransaction(async tx => {
    const cur = await backend.adapter.get(tx, `rateLimits/${key}`);
    const count = cur && cur.minute === minute ? cur.count + 1 : 1;
    if (count > WRITE_LIMIT_PER_MIN) fail('resource-exhausted', 'طلبات كثيرة — حاول بعد دقيقة');
    backend.adapter.set(tx, `rateLimits/${key}`, { minute, count, expiresAt: new Date(Date.now() + 2 * 60000) });   // Firestore TTL policy on expiresAt
  });
}

/** Resolves the actor from the verified token with indexed lookups (no collection scans). */
async function loadActor(ld, token, app, admin) {
  if (!token || !APPS.includes(app)) return null;
  if (app === 'admin') return admin && admin.status === 'active' ? { role: 'admin', id: token.uid, name: admin.name || '', adminRole: admin.role, employeeId: admin.employeeId || null } : null;
  const phone = normalizePhone(token.phone_number);
  if (!phone) return app === 'customer' ? accountCustomer(ld, token) : null;   // email / quick (anonymous) customer accounts
  if (app === 'provider') {
    const [p] = await ld.where('providers', [['phone', '==', phone]], { limit: 1 });
    return p && p.status === 'approved' ? { role: 'provider', id: p.id, name: p.name } : null;
  }
  const [c] = await ld.where('customers', [['phone', '==', phone]], { limit: 1 });
  return c && c.status !== 'suspended' && (!c.uid || c.phoneVerified !== false || c.uid === token.uid) ? { role: 'customer', id: c.id, name: c.name } : null;
}
/** Customer signed in WITHOUT a verified phone (email/password or quick anonymous account): bound by uid through the
    server-only users/{uid} link written at registration, and the customer document must carry the same uid. */
async function accountCustomer(ld, token) {
  const link = await ld.adapter.get(ld.tx, `users/${token.uid}`); ld.reads++;
  if (!link || link.role !== 'customer' || !link.refId) return null;
  const c = await ld.doc('customers', link.refId);
  return c && c.uid === token.uid && c.status !== 'suspended' ? { role: 'customer', id: c.id, name: c.name } : null;
}
const authMethodOf = token => (token && token.firebase && token.firebase.sign_in_provider) || (token && token.phone_number ? 'phone' : token && token.email ? 'password' : 'anonymous');
async function providerStatusOf(ld, token) {
  const phone = normalizePhone(token && token.phone_number);
  if (!phone) return { id: null, status: 'not-registered' };
  const [p] = await ld.where('providers', [['phone', '==', phone]], { limit: 1 });
  return p ? { id: p.id, status: p.status } : { id: null, status: 'not-registered' };
}

const tagOf = a => (a ? a.role + ':' + a.id : null);
function affectedTags(changes, db) {
  const tags = new Set();
  const find = (key, id) => (Array.isArray(db[key]) ? db[key] : []).find(x => keyOf(key, x) === id);
  for (const [key, c] of Object.entries(changes)) {
    if (!Array.isArray(db[key])) continue;                    // system docs (meta/settings) carry no owner
    for (const id of c.set) {
      const it = find(key, id); if (!it) continue;
      if (it.customerId) tags.add('customer:' + it.customerId);
      if (it.providerId) tags.add('provider:' + it.providerId);
      if (typeof it.to === 'string') tags.add(it.to);
      if (typeof it.by === 'string') tags.add(it.by);
      if (key === 'customers') tags.add('customer:' + it.id);
      if (key === 'providers') tags.add('provider:' + it.id);
    }
  }
  return [...tags];
}

async function notifyChanges(backend, changes, db, actorUid) {
  if (!Object.keys(changes).length) return;
  const tags = affectedTags(changes, db);
  const uids = new Set(actorUid ? [actorUid] : []);
  const uidsByTag = new Map();
  for (let i = 0; i < tags.length; i += 30) {
    for (const d of await backend.queryDocs('users', 'tag', 'in', tags.slice(i, i + 30))) {
      uids.add(d.id);
      const t = d.data && d.data.tag; if (t) uidsByTag.set(t, (uidsByTag.get(t) || []).concat(d.id));
    }
  }
  for (const d of await backend.queryDocs('admins', 'status', '==', 'active')) uids.add(d.id);
  if (uids.size) await backend.signal([...uids]);
  try { await pushFresh(backend, changes, db, uidsByTag); }
  catch (e) { if (backend.log) backend.log('push failed', e && e.message); }   // a push failure never fails the request
}

/* ── Web push (FCM): every NEW in-app notification for a customer/provider also goes to that user's registered
   devices. Data-only messages; the service worker renders them (title, body, deep link). ── */
const PUSH_FRESH_MS = 2 * 60 * 1000;
const pushLink = n => {
  const [role] = String(n.to).split(':');
  if (role === 'provider') return 'apps/provider/index.html#/' + (n.reqId ? 'request/' + encodeURIComponent(n.reqId) : 'notifications');
  return 'apps/customer/index.html#/' + (n.reqId ? 'track/' + encodeURIComponent(n.reqId) : 'home');
};
async function pushFresh(backend, changes, db, uidsByTag) {
  if (!backend.sendPush || !changes.notifications) return;
  const now = Date.now();
  const fresh = (changes.notifications.set || [])
    .map(id => (db.notifications || []).find(n => keyOf('notifications', n) === id))
    .filter(n => n && !n.read && typeof n.to === 'string' && /^(customer|provider):/.test(n.to) && now - Date.parse(n.at) < PUSH_FRESH_MS);
  if (!fresh.length) return;
  const uids = [...new Set(fresh.flatMap(n => uidsByTag.get(n.to) || []))];
  if (!uids.length) return;
  const tokensByUid = new Map();
  for (let i = 0; i < uids.length; i += 30) {
    for (const d of await backend.queryDocs('pushTokens', 'uid', 'in', uids.slice(i, i + 30))) {
      tokensByUid.set(d.data.uid, (tokensByUid.get(d.data.uid) || []).concat({ id: d.id, token: d.data.token }));
    }
  }
  for (const n of fresh) {
    const devices = (uidsByTag.get(n.to) || []).flatMap(u => tokensByUid.get(u) || []);
    if (!devices.length) continue;
    const dead = await backend.sendPush(devices.map(x => x.token), { title: 'هنصلحلك', body: String(n.text || '').slice(0, 180), link: pushLink(n), tag: n.reqId ? 'req-' + n.reqId : 'hs' });
    for (const token of dead || []) { const dv = devices.find(x => x.token === token); if (dv) await backend.deleteDoc(`pushTokens/${dv.id}`); }
  }
}

async function linkUser(backend, uid, actor, app) {
  if (!uid || !actor) return;
  await backend.setDoc(`users/${uid}`, { tag: tagOf(actor), role: actor.role, refId: actor.id, app, updatedAt: new Date().toISOString() }, true);
}

/** A provider sees a request's contact details (phone, address, location) only after accepting it — API responses
    follow the same rule as the scoped sync. */
function redactForProvider(data, actor, db) {
  if (!actor || actor.role !== 'provider' || data == null) return data;
  const accepted = new Set((db.assignments || []).filter(a => a.providerId === actor.id && a.status === 'accepted').map(a => a.reqId));
  const fix = r => (r && typeof r === 'object' && r.no && r.customerId && !accepted.has(r.id) ? { ...r, phone: '', addr: '', geo: null, chat: [], pin: undefined } : (r && r.pin ? { ...r, pin: undefined } : r));
  if (Array.isArray(data)) return data.map(fix);
  if (data && Array.isArray(data.items)) return { ...data, items: data.items.map(fix) };
  return fix(data);
}

/** Customer responses never carry the provider amount / platform fee of priced requests (Uber model). */
function redactForCustomer(data) {
  if (data == null) return data;
  const fix = v => (v && typeof v === 'object' && v.customerId && v.no ? customerRequestView(v) : (v && v.customerTotal != null ? customerQuote(v) : v));
  if (Array.isArray(data)) return data.map(fix);
  if (data && Array.isArray(data.items)) return { ...data, items: data.items.map(fix) };
  return fix(data);
}

/** GET /admin/summary from aggregation counts (6 count queries) instead of loading collections. */
async function adminSummary(ld) {
  const [pending, providers, requests, unassigned, openComplaints, uncollected] = await Promise.all([
    ld.count('providers', [['status', '==', 'pending']]), ld.count('providers', []), ld.count('serviceRequests', []),
    ld.count('serviceRequests', [['status', 'in', ['received', 'searching']]]), ld.count('complaints', [['status', '==', 'open']]),
    ld.count('transactions', [['collection', '==', 'pending']])
  ]);
  return { pending, providers, requests, unassigned, openComplaints, uncollected };
}

/** Callable `api`: every application request — identity resolved server-side, data loaded per operation. */
async function api(backend, { auth, data }) {
  const req = validateApi(data);
  const token = tokenOf(auth);
  const isRead = req.method === 'GET';
  if (telemetry.PATH_RE.test(req.path)) {        // client error reports: rate limited in memory (limits.js), never audited
    const adm = token && req.app === 'admin' ? await backend.getDoc(`admins/${token.uid}`) : null;
    const actor = adm && adm.status === 'active' && adminCode.isUnlocked(adm) ? { role: 'admin', id: token.uid, adminRole: adm.role } : null;
    return telemetry.handle({ backend, method: req.method, path: req.path, query: req.query, body: req.body, app: req.app, actor, token });
  }
  if (!isRead) await rateLimit(backend, token ? token.uid : 'anonymous');
  /* the admin's access code must be unlocked (admin-code.js); until then the token resolves to no admin actor */
  const adminDoc = token && req.app === 'admin' ? await backend.getDoc(`admins/${token.uid}`) : null;
  const admin = adminDoc && adminCode.isUnlocked(adminDoc) ? adminDoc : null;
  if (req.method === 'POST' && req.path === '/providers/register' && token && token.phone_number) {
    req.body.phone = normalizePhone(token.phone_number);        // a registration is bound to the verified phone
  }
  if (req.method === 'PATCH' && req.path === '/customers/me' && req.body.phone !== undefined && token && !token.phone_number) {
    /* email / quick accounts: the contact number is fixed at registration (it keys request matching); other fields edit freely */
    const link = await backend.getDoc(`users/${token.uid}`);
    const mine = link && link.role === 'customer' && link.refId ? await backend.getDoc(`customers/${link.refId}`) : null;
    if (mine && normalizePhone(req.body.phone) === normalizePhone(mine.phone)) delete req.body.phone;
    else return { ok: false, status: 409, error: { code: 'CONFLICT', message: 'تغيير رقم التواصل غير متاح من هنا حاليًا — تواصل مع الدعم', details: { phone: 'ثابت لهذا الحساب' } } };
  }
  if (req.method === 'PATCH' && req.path === '/customers/me' && req.body.phone !== undefined && token && token.phone_number && normalizePhone(req.body.phone) !== normalizePhone(token.phone_number)) {
    return { ok: false, status: 409, error: { code: 'CONFLICT', message: 'تغيير رقم الهاتف يتطلب التحقق من الرقم الجديد — سجّل الدخول به', details: { phone: 'يجب أن يطابق الرقم المُتحقَّق منه' } } };
  }
  const idemPath = req.idem && token ? `idempotency/${token.uid}__${req.idem}` : null;

  const execute = async tx => {
    if (idemPath) {
      const prior = await backend.adapter.get(tx, idemPath);
      if (prior && Date.now() - prior.atMs < IDEMPOTENCY_TTL_MS) return { envelope: prior.envelope, changes: {}, replay: true };
    }
    const ld = new PartialDb(backend.adapter, tx);
    const actor = await loadActor(ld, token, req.app, admin);
    if (ai.PATH_RE.test(req.path)) {          // AI providers / keys (server-only document system/ai)
      if (!actor || actor.role !== 'admin') return { envelope: { ok: false, status: actor ? 403 : 401, error: { code: actor ? 'FORBIDDEN' : 'UNAUTHENTICATED', message: 'admin only' } }, changes: {}, actor };
      const envelope = await ai.handle({ backend, tx, method: req.method, path: req.path, body: req.body, admin });
      return { envelope, changes: envelope.ok && !isRead ? { admin: { set: [req.path], del: [] } } : {}, actor, db: {}, quiet: true };
    }
    if (content.PATH_RE.test(req.path)) {
      if (!actor || actor.role !== 'admin') return { envelope: { ok: false, status: actor ? 403 : 401, error: { code: actor ? 'FORBIDDEN' : 'UNAUTHENTICATED', message: 'admin only' } }, changes: {}, actor };
      const envelope = await content.handle({ backend, tx, method: req.method, path: req.path, body: req.body, admin });
      if (idemPath && !isRead) backend.adapter.set(tx, idemPath, { envelope, atMs: Date.now(), path: req.path, expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS) });
      return { envelope, changes: envelope.ok && !isRead ? { admin: { set: [req.path], del: [] } } : {}, actor, db: {}, quiet: true, contentV: envelope.ok && envelope.data && envelope.data.v };   // audited; clients learn via public/content, no admin re-sync
    }
    if (adminExtra.PATH_RE.test(req.path)) {
      if (!actor || actor.role !== 'admin') return { envelope: { ok: false, status: actor ? 403 : 401, error: { code: actor ? 'FORBIDDEN' : 'UNAUTHENTICATED', message: 'admin only' } }, changes: {}, actor };
      const envelope = await adminExtra.handle({ backend, tx, method: req.method, path: req.path, query: req.query, body: req.body, admin, token });
      if (idemPath && !isRead) backend.adapter.set(tx, idemPath, { envelope, atMs: Date.now(), path: req.path, expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS) });
      return { envelope, changes: envelope.ok && !isRead ? { admin: { set: [req.path], del: [] } } : {}, actor, db: {}, workforce: true };
    }
    if (/^\/admin\/(employees|rbac)(\/|$)/.test(req.path)) {
      if (!actor || actor.role !== 'admin') return { envelope: { ok: false, status: actor ? 403 : 401, error: { code: actor ? 'FORBIDDEN' : 'UNAUTHENTICATED', message: 'admin only' } }, changes: {}, actor };
      const envelope = await workforce.handle({ adapter: backend.adapter, tx, method: req.method, path: req.path, body: req.body, admin });
      if (idemPath && !isRead) backend.adapter.set(tx, idemPath, { envelope, atMs: Date.now(), path: req.path, expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS) });
      return { envelope, changes: envelope.ok && !isRead ? { employees: { set: ['workforce'], del: [] } } : {}, actor, db: {}, workforce: true };
    }
    if (isRead && req.path === '/admin/summary' && actor && actor.role === 'admin') {
      return { envelope: { ok: true, status: 200, data: await adminSummary(ld) }, changes: {}, actor, reads: ld.reads };
    }
    await plan(ld, { method: req.method, path: req.path, query: req.query, body: req.body, actor });
    const roster = actor && actor.role === 'admin' ? [{ id: actor.id, name: actor.name, role: admin.role, status: 'active' }] : [];
    let rbac = null;
    if (actor && actor.role === 'admin') {                      // the stored RBAC catalogue decides module permissions
      const stored = await backend.adapter.get(tx, 'system/rbac');
      if (stored) rbac = { roles: stored.roles, overrides: { [actor.id]: ((stored.overrides || {})[actor.employeeId]) || [] } };
    }
    const res = await runtime.request({ db: ld.toDb(), roster, rbac, actor, method: req.method, path: req.path, query: req.query, body: req.body });
    let changes = {};
    if (res.envelope.ok && !isRead) changes = ld.commit(res.db).changes;
    if (res.envelope.ok) res.envelope.data = redactForProvider(res.envelope.data, actor, res.db);
    if (res.envelope.ok && actor && actor.role === 'customer') res.envelope.data = redactForCustomer(res.envelope.data);
    if (Object.keys(ld.pages).length && res.envelope.ok) res.envelope.page = { nextCursor: Object.values(ld.pages)[0] };
    if (idemPath && !isRead) backend.adapter.set(tx, idemPath, { envelope: res.envelope, atMs: Date.now(), path: req.path, expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS) });
    return { envelope: res.envelope, changes, actor, db: res.db, reads: ld.reads };
  };
  const out = isRead ? await execute(null) : await backend.runTransaction(execute);
  if (!isRead && out.envelope.ok && /^\/admin\/(settings|content|media|ai)(\/|$)/.test(req.path)) {
    invalidateShared(backend.adapter); content.invalidate(backend.adapter);     // system docs changed outside PartialDb.commit
  }
  if (out.contentV && backend.setPublic) {
    try { await backend.setPublic('public/content', { v: out.contentV, at: Date.now() }); } catch (e) { if (backend.log) backend.log('content signal failed', e && e.message); }
  }
  if (Object.keys(out.changes).length) {
    await backend.addDoc('audit', {
      at: new Date().toISOString(), uid: token ? token.uid : null, actor: out.actor ? { role: out.actor.role, id: out.actor.id, adminRole: out.actor.adminRole || null } : null,
      app: req.app, method: req.method, path: req.path, status: out.envelope.status,
      changes: Object.fromEntries(Object.entries(out.changes).map(([k, c]) => [k, { set: c.set.length, del: c.del.length }]))
    });
    if (out.quiet) { /* no change signals: site content travels on public/content */ }
    else if (out.workforce) { const admins = await backend.queryDocs('admins', 'status', '==', 'active'); await backend.signal(admins.map(a => a.id)); }
    else await notifyChanges(backend, out.changes, out.db, token && token.uid);
  }
  return out.envelope;
}

/** Callable `session`: sync (scoped read model), registerCustomer, claimOwner, importLocal. */
async function session(backend, { auth, data }) {
  const d = data || {};
  const token = tokenOf(auth);
  const app = APPS.includes(d.app) ? d.app : 'customer';
  switch (d.op) {
    case 'sync': {
      let admin = token && app === 'admin' ? await backend.getDoc(`admins/${token.uid}`) : null;
      if (token && app === 'admin' && !admin && token.email_verified) {           // invited employee signing in for the first time
        const accepted = await backend.runTransaction(tx => workforce.acceptInvite(backend.adapter, tx, token));
        if (accepted) admin = await backend.getDoc(`admins/${token.uid}`);
      }
      const gated = !!(app === 'admin' && admin && admin.status === 'active' && !adminCode.isUnlocked(admin));
      const ld = new PartialDb(backend.adapter, null);
      const actor = await loadActor(ld, token, app, gated ? null : admin);
      await syncPlan(ld, actor);
      if (ld.publicToSave) {     // (re)build of the public summary — one small write, then every sync reads 1 doc
        const snap = ld.publicToSave; ld.publicToSave = null;
        try { await backend.runTransaction(async tx => { backend.adapter.set(tx, 'system/public', snap); }); } catch (e) { if (backend.log) backend.log('public summary write failed', e && e.message); }
      }
      const db = ld.toDb() || runtime.emptyDb();
      if (token) await linkUser(backend, token.uid, actor, app);
      let adminData = null;
      if (actor && actor.role === 'admin') {
        const wf = await workforce.loadState(backend.adapter, null);
        adminData = { employeeId: actor.employeeId, employees: wf.employees, rbac: wf.rbac };
      }
      if (gated) return { serverTime: Date.now(), actor: null, db: scopeFor(db, null), provider: null, admin: null, adminGate: adminCode.gateOf(admin), signedIn: true, reads: ld.reads };
      return { serverTime: Date.now(), actor, db: scopeFor(db, actor), provider: app === 'provider' && token ? await providerStatusOf(ld, token) : null, admin: adminData, signedIn: !!token, reads: ld.reads };
    }
    case 'registerCustomer': {
      /* Three ways in, one customer record per phone:
         phone OTP   → the verified token phone is the identity (phoneVerified: true);
         email / quick (anonymous) account → identity is the uid; d.phone is a CONTACT number (phoneVerified: false)
         and may not belong to another account (requests are matched to customers by phone). */
      if (!token) fail('unauthenticated', 'سجّل الدخول أولًا');
      const verified = normalizePhone(token.phone_number);
      const phone = verified || normalizePhone(d.phone);
      if (!/^01[0125]\d{8}$/.test(phone)) fail(verified ? 'failed-precondition' : 'invalid-argument', 'اكتب رقم موبايل مصري صحيح (01xxxxxxxxx) للتواصل');
      const name = String(d.name || '').trim();
      if (name.length < 2 || name.length > 60) fail('invalid-argument', 'اكتب اسمك (2–60 حرفًا)');
      await rateLimit(backend, token.uid);
      const method = authMethodOf(token);
      const out = await backend.runTransaction(async tx => {
        const ld = new PartialDb(backend.adapter, tx);
        await ld.loadSystem();
        const [existing] = await ld.where('customers', [['phone', '==', phone]], { limit: 1 });
        if (existing && existing.status === 'suspended') fail('permission-denied', 'هذا الحساب موقوف');
        if (!verified) {
          const link = await backend.adapter.get(tx, `users/${token.uid}`);
          const mine = link && link.role === 'customer' && link.refId ? await ld.doc('customers', link.refId) : null;
          if (mine && mine.uid === token.uid) {                         // already registered on this account
            if (existing && existing.id !== mine.id) fail('already-exists', 'هذا الرقم مسجّل بحساب آخر');
            const res = runtime.operation({ db: ld.toDb(), roster: [] }, env => mine);
            return res;
          }
          if (existing && existing.uid !== token.uid) fail('already-exists', 'هذا الرقم مسجّل بالفعل — ادخل بنفس الطريقة التي سجّلت بها أول مرة');
        }
        const res = runtime.operation({ db: ld.toDb(), roster: [] }, env => env.mp.customerFor(name, phone));
        const rec = (res.db.customers || []).find(c => c.id === res.result.id);
        if (rec) {
          if (verified) { rec.phoneVerified = true; if (!rec.uid) rec.uid = token.uid; }
          else { rec.uid = token.uid; rec.phoneVerified = false; }
          rec.authMethod = method;
          if (token.email && !rec.email) rec.email = String(token.email).toLowerCase();
        }
        ld.commit(res.db);
        return res;
      });
      const actor = { role: 'customer', id: out.result.id, name: out.result.name };
      await linkUser(backend, token.uid, actor, 'customer');
      return { actor, db: scopeFor(out.db, actor) };
    }
    case 'ai': return ai.classify(backend, token, d, fail);   // «اكتب مشكلتك» / «صوّر المشكلة» → catalogue item + problem
    case 'content': {
      /* public site content; only fetched when settings.contentV changes. `have`: media ids this device caches */
      const have = Array.isArray(d.have) ? d.have.filter(x => typeof x === 'string').slice(0, 300) : [];
      return content.publicContent(backend, have);
    }
    case 'registerPush': {
      /* a device's FCM token, bound to the signed-in uid (server-side only: clients cannot read or write pushTokens) */
      if (!token) fail('unauthenticated', 'سجّل الدخول أولًا');
      const t = typeof d.token === 'string' ? d.token.trim() : '';
      if (!/^[\w:-]{100,4096}$/.test(t)) fail('invalid-argument', 'رمز الجهاز غير صالح');
      await rateLimit(backend, token.uid);
      const id = crypto.createHash('sha256').update(t).digest('hex');
      await backend.setDoc(`pushTokens/${id}`, { token: t, uid: token.uid, app, updatedAt: new Date().toISOString() });
      return { ok: true };
    }
    case 'unregisterPush': {
      if (!token) return { ok: true };
      const t = typeof d.token === 'string' ? d.token.trim() : '';
      if (!t) return { ok: true };
      const id = crypto.createHash('sha256').update(t).digest('hex');
      const cur = await backend.getDoc(`pushTokens/${id}`);
      if (cur && cur.uid === token.uid) await backend.deleteDoc(`pushTokens/${id}`);
      return { ok: true };
    }
    case 'claimOwner': {
      if (!token || !token.email || !token.email_verified) fail('unauthenticated', 'verified email sign-in required');
      const allowed = (backend.env.bootstrapEmails || []).map(e => e.toLowerCase());
      if (!allowed.includes(String(token.email).toLowerCase())) fail('permission-denied', 'this email is not in ADMIN_BOOTSTRAP_EMAILS');
      return backend.runTransaction(async tx => {
        let res;
        try { res = await workforce.createOwner(backend.adapter, tx, token, d.name || token.name); }
        catch (e) { if (e instanceof workforce.WfError) fail(e.code, e.message); throw e; }
        if (!res.replay) backend.adapter.set(tx, `audit/claimOwner_${token.uid}`, { at: new Date().toISOString(), uid: token.uid, action: 'claimOwner', employeeId: res.employee.id });
        return { ok: true, replay: res.replay, employeeId: res.employee.id };
      });
    }
    case 'adminCode': {   /* {action: 'set' | 'unlock' | 'lock', code?, current?} — the 8-digit access code */
      if (!token) fail('unauthenticated', 'سجّل الدخول أولًا');
      const admin = await backend.getDoc(`admins/${token.uid}`);
      if (!admin || admin.status !== 'active') fail('permission-denied', 'هذا الحساب ليس له صلاحية إدارة');
      await rateLimit(backend, token.uid);
      if (d.action === 'set') return viaCode(adminCode.setCode(backend, token.uid, admin, d.code, d.current));
      if (d.action === 'unlock') return viaCode(adminCode.unlock(backend, token.uid, admin, d.code));
      if (d.action === 'lock') { await adminCode.lockNow(backend, token.uid); return { ok: true }; }
      fail('invalid-argument', 'unknown adminCode action');
      break;
    }
    case 'importLocal': return importLocal(backend, token, d);
    default: fail('invalid-argument', 'unknown session op');
  }
}

/**
 * Migration of a browser database (localStorage hs_mp_db) into Firestore — owner only, additive and idempotent:
 * existing ids are never overwritten, demo records are skipped unless includeDemo, nothing local is deleted.
 * Existence is checked with chunked id lookups of the incoming records only (no collection scans).
 */
async function importLocal(backend, token, d) {
  if (!token) fail('unauthenticated', 'sign in required');
  const admin = await backend.getDoc(`admins/${token.uid}`);
  if (!admin || admin.status !== 'active' || admin.role !== 'owner' || !adminCode.isUnlocked(admin)) fail('permission-denied', 'owner only');
  const src = d.db;
  if (!src || typeof src !== 'object' || (src.v !== 1 && src.v !== 2)) fail('invalid-argument', 'not a HANSALEHLAK local database (v1/v2)');
  /* addedIds: Firestore document ids per collection (opaque ids only, no personal data) — the rollback list */
  const report = { dryRun: !!d.dryRun, added: {}, addedIds: {}, skippedExisting: {}, skippedDemo: {}, invalid: {}, at: new Date().toISOString() };
  const bump = (b, key) => { report[b][key] = (report[b][key] || 0) + 1; };
  const result = await backend.runTransaction(async tx => {
    const ld = new PartialDb(backend.adapter, tx);
    await ld.loadSystem();
    const accepted = {};
    let total = 0;
    for (const key of KNOWN_ARRAYS) {
      const incoming = Array.isArray(src[key]) ? src[key] : [];
      const valid = [];
      for (const it of incoming) {
        if (!it || typeof it !== 'object' || (key !== 'favorites' && key !== 'serviceAreas' && !it.id)) { bump('invalid', key); continue; }
        if (it.demo === true && !d.includeDemo) { bump('skippedDemo', key); continue; }
        valid.push(it);
      }
      if (key === 'favorites') await ld.where('favorites', [['customerId', 'in', [...new Set(valid.map(x => x.customerId))]]]);
      else if (key === 'serviceAreas') await ld.where('serviceAreas', []);
      else await ld.docsIn(key, valid.map(x => x.id));
      accepted[key] = valid;
    }
    const next = ld.toDb() || runtime.emptyDb();
    for (const key of KNOWN_ARRAYS) {
      next[key] = next[key] || [];
      const have = new Set(next[key].map(x => keyOf(key, x)));
      for (const it of accepted[key]) {
        const id = keyOf(key, it);
        if (have.has(id)) { bump('skippedExisting', key); continue; }
        if (++total > IMPORT_LIMIT) fail('resource-exhausted', 'import larger than ' + IMPORT_LIMIT + ' records — split it');
        next[key].push(it); have.add(id); bump('added', key);
        (report.addedIds[colName(key)] = report.addedIds[colName(key)] || []).push(id);
      }
    }
    const base = next.meta || {};
    next.meta = { ...base, lastReqNo: Math.max(base.lastReqNo || 1000, (src.meta || {}).lastReqNo || 0) };
    if (!next.settings) next.settings = runtime.emptyDb().settings;
    if (!d.dryRun) ld.commit(next);
    return { added: Object.values(report.added).reduce((s, n) => s + n, 0) };
  });
  if (!d.dryRun) await backend.addDoc('migrations', { ...report, uid: token.uid });
  return { report, totals: result };
}

module.exports = { api, session, importLocal, validateApi, affectedTags, ServiceError, WRITE_LIMIT_PER_MIN };
