/**
 * Team alerts + internal tickets («بلاغات») on the server. The rules are the shared domain files
 * (apps/admin/modules/ops-core.js + ops-routes.js, synced to functions/domain) — this file only loads / stores them and
 * delivers alerts.
 *
 * Storage (server-only: Firestore rules deny every client):
 *   opsAlerts/{id}      one alert per dedupeKey (id = HSOpsCore.alertId(dedupeKey)); repeats raise `count`
 *   opsTickets/{id}     tickets
 *   alertSeen/{uid}     { at } when this admin last opened the bell
 * Channels: CHANNELS.inApp (the alert document → bell in the Admin app) and CHANNELS.push (FCM to the team's admins).
 * CHANNELS.whatsapp is a reserved slot (owner decision: later) — deliver() is where it plugs in.
 *
 *   notifyTeam(backend, team, level, payload)   any server module: payload {text|title, body?, link?, key?, kind?}
 *   ingest(backend, events)                     events raised by the domain (MP.raiseAlert → runtime HS_ALERT_OUTBOX)
 *   handle({backend, method, path, query, body, admin, uid})   the /admin/alerts and /admin/tickets routes
 *   tick(backend)                               alertsClock: time-based alerts (MP.opsScan) + owner escalation
 * Best effort for delivery: an alert never fails the action that raised it.
 */
'use strict';
const path = require('path');

const DOMAIN = path.join(__dirname, '..', 'domain', 'apps', 'admin');
const core = () => require(path.join(DOMAIN, 'modules', 'ops-core.js'));
const routes = () => { core(); return require(path.join(DOMAIN, 'modules', 'ops-routes.js')); };
const rbacLib = () => require(path.join(DOMAIN, 'rbac-store.js'));

const PATH_RE = /^\/admin\/(alerts|tickets)(\/|$)/;
const CHANNELS = Object.freeze({ inApp: true, push: true, whatsapp: false });   // whatsapp: reserved slot, not built yet
const RESOLVED_KEEP_MS = 86400000;            // resolved alerts stay visible one day
const DONE_KEEP_MS = 30 * 86400000;           // finished tickets stay listed 30 days
const uid36 = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const log = (backend, msg, e) => { if (backend && backend.log) backend.log(msg, e && e.message); };

/* ───────────── who belongs to which team ───────────── */
async function rbacOf(backend) {
  const R = rbacLib();
  const stored = await backend.getDoc('system/rbac');
  return { R, roles: R.mergePresets(stored && Array.isArray(stored.roles) ? stored.roles : R.buildRoles()), overrides: (stored && stored.overrides) || {} };
}
function permsOf(rb, admin) {
  if (!admin || admin.role === 'owner') return new Set(rb.R.ALL_KEYS);
  return new Set(rb.R.employeeEffective(rb.roles, rb.overrides, { id: admin.employeeId || '', role: admin.role }));
}
function actorCtx(rb, admin) {
  const C = core(), perms = permsOf(rb, admin), role = admin.role || 'owner';
  const level = rb.R.levelOf(rb.roles, role);
  return {
    teams: C.teamsFor(perms, role),
    can: (m, a) => role === 'owner' || perms.has(m + '.' + a),
    risk: (k) => (level >= rb.R.riskNeed(k) ? '' : `«${rb.R.RISK_LABEL[k] || k}» محتاج رتبة ${rb.R.LEVELS[rb.R.riskNeed(k)]} أو أعلى`)
  };
}
async function teamMembers(backend, team) {
  const C = core(), rb = await rbacOf(backend);
  const admins = await backend.queryDocs('admins', 'status', '==', 'active');
  return admins.filter((a) => { const d = a.data || {}; return team === 'owner' ? d.role === 'owner' : C.teamsFor(permsOf(rb, d), d.role || 'owner').includes(team); }).map((a) => a.id);
}

/* ───────────── delivery ───────────── */
async function pushTo(backend, uids, alert) {
  if (!CHANNELS.push || !backend.sendPush || !uids.length) return 0;
  let sent = 0;
  for (const uid of uids) {
    const tokens = (await backend.queryDocs('pushTokens', 'uid', '==', uid)).map((x) => (x.data || x).token).filter(Boolean);
    if (!tokens.length) continue;
    await backend.sendPush(tokens, { title: (alert.severity === 'critical' ? 'عاجل — ' : '') + alert.title, body: String(alert.body || '').slice(0, 180),
      link: 'apps/admin/index.html' + (alert.link && alert.link.startsWith('#') ? alert.link : '#/alerts'), tag: 'ops-' + alert.id });
    sent += tokens.length;
  }
  return sent;
}
async function deliver(backend, alert) {
  try {
    if (alert.severity === 'info') return 0;                               // info: in-app only
    const uids = await teamMembers(backend, alert.team);
    const owners = alert.team === 'owner' ? [] : alert.severity === 'critical' ? await teamMembers(backend, 'owner') : [];
    return await pushTo(backend, [...new Set(uids.concat(owners))], alert);
    /* CHANNELS.whatsapp: send here when the owner enables it (template message to the team's numbers) */
  } catch (e) { log(backend, 'alert delivery failed', e); return 0; }
}

/** Folds events into opsAlerts (de-duplicated) and delivers the new / upgraded ones. Returns the stored alerts. */
async function ingest(backend, events) {
  const list = (events || []).filter(Boolean);
  if (!list.length) return [];
  const C = core(), out = [];
  try {
    for (const ev of list) {
      const e = C.normalizeEvent(ev); if (!e) continue;
      const id = C.alertId(e.dedupeKey);
      const prev = await backend.getDoc(`opsAlerts/${id}`);
      const r = C.upsertAlert(prev, e, Date.now()); if (!r) continue;
      await backend.setDoc(`opsAlerts/${id}`, r.alert);
      out.push(r.alert);
      if (r.isNew || r.upgraded) await deliver(backend, r.alert);
    }
  } catch (e) { log(backend, 'alert ingest failed', e); }
  return out;
}

/** Public entry for server modules (tech-status via alerts-adapter, owner-alerts, …). level: critical | normal | info */
async function notifyTeam(backend, team, level, payload) {
  const p = payload || {};
  const title = String(p.title || p.text || '').slice(0, 120);
  const r = await ingest(backend, [{ team, severity: level, kind: p.kind || 'system', title, body: p.body || (p.title ? p.text : '') || '', link: p.link || '', dedupeKey: p.key || (team + ':' + title) }]);
  return r.length;
}

/* ───────────── routes ───────────── */
async function loadState(adapter, tx, now, uid, withTickets) {
  const rows = async (col, where) => (await adapter.query(tx, col, { where: [where], limit: 300 })).map((x) => x.data);
  const alerts = (await rows('opsAlerts', ['status', 'in', ['open', 'claimed']])).concat(await rows('opsAlerts', ['resolvedAt', '>=', new Date(now - RESOLVED_KEEP_MS).toISOString()]));
  const tickets = withTickets ? (await rows('opsTickets', ['status', 'in', ['new', 'doing']])).concat(await rows('opsTickets', ['doneAt', '>=', new Date(now - DONE_KEEP_MS).toISOString()])) : [];
  const seenDoc = await adapter.get(tx, `alertSeen/${uid}`);
  return { alerts, tickets, seen: seenDoc ? { [uid]: seenDoc.at } : {} };
}

async function handle({ backend, method, path: p, query, body, admin, uid }) {
  const R = routes(), rb = await rbacOf(backend), ctx = actorCtx(rb, admin);
  const withTickets = /^\/admin\/tickets/.test(p) || /\/ticket$/.test(p);
  const run = async (tx) => {
    const now = Date.now();
    const state = await loadState(backend.adapter, tx, now, uid, withTickets);
    const out = R.handle({ method, path: p, query: query || {}, body: body || {}, me: { id: uid, name: admin.name || '' }, teams: ctx.teams, can: ctx.can, risk: ctx.risk, now, nextId: uid36, state });
    if (out.envelope.ok) {                                                 // all reads done above: writes last (Firestore transaction rule)
      for (const id of out.changed.alerts) { const a = state.alerts.find((x) => x.id === id); if (a) backend.adapter.set(tx, `opsAlerts/${id}`, a); }
      for (const id of out.changed.tickets) { const t = state.tickets.find((x) => x.id === id); if (t) backend.adapter.set(tx, `opsTickets/${id}`, t); }
      if (out.changed.seen) backend.adapter.set(tx, `alertSeen/${uid}`, { at: now });
    }
    return out;
  };
  const out = method === 'GET' ? await run(null) : await backend.runTransaction(run);
  for (const a of out.envelope.ok ? out.audit : []) {
    await backend.addDoc('audit', { at: new Date().toISOString(), uid, actor: { role: 'admin', id: uid, adminRole: admin.role || null }, app: 'admin', method, path: p, status: out.envelope.status, action: a.action, subject: a.subject });
  }
  return out.envelope;
}

/* ───────────── clock: time-based alerts + escalation ───────────── */
async function escalate(backend, now) {
  const C = core();
  const open = (await backend.queryDocs('opsAlerts', 'status', '==', 'open')).map((x) => x.data);
  if (!open.some((a) => a.severity === 'critical' && !a.escalated && a.team !== 'owner')) return 0;   // cost: settings read only when needed
  const settings = (await backend.getDoc('system/settings')) || {};
  const minutes = +((settings.opsAlerts || {}).escalateMin) || C.DEFAULT_ESCALATE_MIN;
  let n = 0;
  for (const a of open) {
    if (a.team === 'owner' || !C.escalationDue(a, now, minutes)) continue;
    await backend.setDoc(`opsAlerts/${a.id}`, { ...a, escalated: true, escalatedAt: new Date(now).toISOString() });
    await pushTo(backend, await teamMembers(backend, 'owner'), { ...a, title: 'محدش استلم: ' + a.title });
    n++;
  }
  return n;
}

/** alertsClock (functions/index.js): runs MP.opsScan over the records it needs, stores the alerts, escalates. */
async function tick(backend, runtimeOp) {
  const out = { raised: 0, escalated: 0 };
  try {
    if (runtimeOp) { const events = await runtimeOp(); out.raised = (await ingest(backend, events)).length; }
  } catch (e) { log(backend, 'ops scan failed', e); }
  try { out.escalated = await escalate(backend, Date.now()); } catch (e) { log(backend, 'escalation failed', e); }
  return out;
}

module.exports = { PATH_RE, CHANNELS, notifyTeam, ingest, handle, tick, escalate, teamMembers, _actorCtx: actorCtx, _rbacOf: rbacOf };
