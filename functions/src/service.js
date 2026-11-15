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
const { PartialDb } = require('./partial');
const { plan, syncPlan } = require('./plan');
const { normalizePhone, APPS } = require('./identity');
const { scopeFor, customerRequestView, customerQuote } = require('./scope');
const workforce = require('./workforce');

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
  if (JSON.stringify(body).length > 100000) fail('invalid-argument', 'request body too large');
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
  if (!phone) return null;
  if (app === 'provider') {
    const [p] = await ld.where('providers', [['phone', '==', phone]], { limit: 1 });
    return p && p.status === 'approved' ? { role: 'provider', id: p.id, name: p.name } : null;
  }
  const [c] = await ld.where('customers', [['phone', '==', phone]], { limit: 1 });
  return c && c.status !== 'suspended' ? { role: 'customer', id: c.id, name: c.name } : null;
}
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
  for (let i = 0; i < tags.length; i += 30) {
    for (const d of await backend.queryDocs('users', 'tag', 'in', tags.slice(i, i + 30))) uids.add(d.id);
  }
  for (const d of await backend.queryDocs('admins', 'status', '==', 'active')) uids.add(d.id);
  if (uids.size) await backend.signal([...uids]);
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
  const fix = r => (r && typeof r === 'object' && r.no && r.customerId && !accepted.has(r.id) ? { ...r, phone: '', addr: '', geo: null } : r);
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
  if (!isRead) await rateLimit(backend, token ? token.uid : 'anonymous');
  const admin = token && req.app === 'admin' ? await backend.getDoc(`admins/${token.uid}`) : null;
  if (req.method === 'POST' && req.path === '/providers/register' && token && token.phone_number) {
    req.body.phone = normalizePhone(token.phone_number);        // a registration is bound to the verified phone
  }
  if (req.method === 'PATCH' && req.path === '/customers/me' && req.body.phone !== undefined && token && normalizePhone(req.body.phone) !== normalizePhone(token.phone_number)) {
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
  if (Object.keys(out.changes).length) {
    await backend.addDoc('audit', {
      at: new Date().toISOString(), uid: token ? token.uid : null, actor: out.actor ? { role: out.actor.role, id: out.actor.id, adminRole: out.actor.adminRole || null } : null,
      app: req.app, method: req.method, path: req.path, status: out.envelope.status,
      changes: Object.fromEntries(Object.entries(out.changes).map(([k, c]) => [k, { set: c.set.length, del: c.del.length }]))
    });
    if (out.workforce) { const admins = await backend.queryDocs('admins', 'status', '==', 'active'); await backend.signal(admins.map(a => a.id)); }
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
      const ld = new PartialDb(backend.adapter, null);
      const actor = await loadActor(ld, token, app, admin);
      await syncPlan(ld, actor);
      const db = ld.toDb() || runtime.emptyDb();
      if (token) await linkUser(backend, token.uid, actor, app);
      let adminData = null;
      if (actor && actor.role === 'admin') {
        const wf = await workforce.loadState(backend.adapter, null);
        adminData = { employeeId: actor.employeeId, employees: wf.employees, rbac: wf.rbac };
      }
      return { serverTime: Date.now(), actor, db: scopeFor(db, actor), provider: app === 'provider' && token ? await providerStatusOf(ld, token) : null, admin: adminData, signedIn: !!token, reads: ld.reads };
    }
    case 'registerCustomer': {
      if (!token) fail('unauthenticated', 'سجّل الدخول برقم الموبايل أولًا');
      const phone = normalizePhone(token.phone_number);
      if (!/^01[0125]\d{8}$/.test(phone)) fail('failed-precondition', 'رقم موبايل مصري مُتحقَّق منه مطلوب');
      const name = String(d.name || '').trim();
      if (name.length < 2 || name.length > 60) fail('invalid-argument', 'اكتب اسمك (2–60 حرفًا)');
      await rateLimit(backend, token.uid);
      const out = await backend.runTransaction(async tx => {
        const ld = new PartialDb(backend.adapter, tx);
        await ld.loadSystem();
        const [existing] = await ld.where('customers', [['phone', '==', phone]], { limit: 1 });
        if (existing && existing.status === 'suspended') fail('permission-denied', 'هذا الحساب موقوف');
        const res = runtime.operation({ db: ld.toDb(), roster: [] }, env => env.mp.customerFor(name, phone));
        ld.commit(res.db);
        return res;
      });
      const actor = { role: 'customer', id: out.result.id, name: out.result.name };
      await linkUser(backend, token.uid, actor, 'customer');
      return { actor, db: scopeFor(out.db, actor) };
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
  if (!admin || admin.status !== 'active' || admin.role !== 'owner') fail('permission-denied', 'owner only');
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
