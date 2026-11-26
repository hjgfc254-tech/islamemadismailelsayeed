/**
 * Domain runtime: executes the application's own business rules and route handlers (functions/domain/, a verified copy
 * of services/*.js + the Admin RBAC catalog) inside an isolated vm context per call.
 * The caller supplies the persisted database snapshot and a SERVER-RESOLVED actor; the client never supplies identity.
 * Called by: service.js, workforce.js, admin-extra.js, ai.js, agent-gateway.js. No Firestore access of its own.
 * ORDER mirrors the browser script order; functions/domain is refreshed with `npm run functions:sync` (never by hand).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DOMAIN_DIR = path.join(__dirname, '..', 'domain');
const ORDER = [
  'shared/config/legacy-data.js', 'services/catalog-question-bank.js', 'services/local-catalog.js', 'services/local-market-store.js',
  'services/api-client.js', 'services/auth-api.js', 'services/orders-api.js', 'services/quotes-api.js',
  'services/catalog-api.js', 'services/provider-api.js', 'services/customer-api.js', 'services/notifications-api.js',
  'services/support-api.js', 'services/finance-api.js', 'services/admin-api.js',
  'apps/admin/modules/ops-core.js', 'apps/admin/modules/ops-routes.js', 'services/ops-api.js',
  'apps/admin/rbac-store.js', 'apps/admin/permission-guard.js',
  'apps/admin/modules/workforce/employee-status.js', 'apps/admin/modules/workforce/employee-form.js', 'apps/admin/modules/workforce/employee-invitation.js'
];
const DB_KEY = 'hs_mp_db';
/** Collections that are derived at load time and never persisted. */
const DERIVED = ['services', 'alertEvents'];   // alertEvents: demo-only event queue; on the server events leave through HS_ALERT_OUTBOX

let compiled = null;
function scripts() {
  if (!compiled) compiled = ORDER.map(f => new vm.Script(fs.readFileSync(path.join(DOMAIN_DIR, f), 'utf8'), { filename: f }));
  return compiled;
}

function memStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() };
}

/**
 * Creates a fresh domain context over `db` (a plain MP database object, or null for a brand-new backend).
 * roster: admin employees visible to the RBAC guard ([{id,name,role,status}]).
 */
function createContext(db, roster, rbac) {
  const local = memStorage(db ? { [DB_KEY]: JSON.stringify(db) } : {});
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Date, Math,
    localStorage: local, sessionStorage: memStorage(),
    addEventListener() {}, removeEventListener() {},
    location: { pathname: '/server' }
  };
  ctx.globalThis = ctx;
  ctx.HS_ALERT_OUTBOX = [];            /* MP.raiseAlert events of this call: functions/src/alerts.js persists and delivers them */
  vm.createContext(ctx);
  for (const s of scripts()) s.runInContext(ctx);
  const run = code => vm.runInContext(code, ctx);
  if (!db) {
    /* Fresh backend: the app seeds demo providers for the offline demo. Production data never starts with mock
       providers — keep the structure, settings and reference service areas only. */
    run('(() => { const d = MP.db(); d.providers = []; MP.save ? MP.save() : localStorage.setItem("hs_mp_db", JSON.stringify(d)); })()');
  }
  if (Array.isArray(roster)) ctx.HSAdminRbac.state.roster = roster.map(e => ({ ...e }));
  if (rbac && Array.isArray(rbac.roles)) ctx.HSAdminRbac.state.roles = ctx.HSAdminRbac.mergePresets(JSON.parse(JSON.stringify(rbac.roles)));   /* stored catalogues gain the team presets / new modules */
  if (rbac && rbac.overrides) ctx.HSAdminRbac.state.overrides = JSON.parse(JSON.stringify(rbac.overrides));
  return { ctx, run, mp: run('MP'), client: ctx.HSApiClient, alerts: () => JSON.parse(JSON.stringify(ctx.HS_ALERT_OUTBOX || [])) };
}

/** The persistable database (derived collections removed) as a plain JSON-safe object. */
function snapshot(env) {
  const db = JSON.parse(JSON.stringify(env.mp.db()));
  for (const k of DERIVED) delete db[k];
  return db;
}

/**
 * Runs one API request through the app's route table.
 * Returns { envelope, db, alerts } where db is the resulting persistable database and alerts the ops-alert events raised.
 */
async function request({ db, roster, rbac, actor, method, path: p, query, body }) {
  const env = createContext(db, roster, rbac);
  const envelope = await env.client.request(method, p, { query: query || {}, body: body || {}, actor: actor || null });
  return { envelope: JSON.parse(JSON.stringify(envelope)), db: snapshot(env), alerts: env.alerts() };
}

/** Runs a named MP operation (used by session bootstrap, e.g. customerFor). */
function operation({ db, roster, rbac }, fn) {
  const env = createContext(db, roster, rbac);
  const result = fn(env);
  return { result: result === undefined ? null : JSON.parse(JSON.stringify(result)), db: snapshot(env), alerts: env.alerts() };
}

/** Empty, valid database (what a brand-new backend starts from). */
function emptyDb() { return snapshot(createContext(null, [])); }

module.exports = { request, operation, emptyDb, createContext, snapshot, ORDER, DERIVED };
