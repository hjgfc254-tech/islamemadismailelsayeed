/**
 * MODULE: ops-api — /admin/alerts and /admin/tickets over services/api-client.js for the LOCAL demo (MP db arrays
 * db.alerts / db.tickets / db.alertSeen, fed by MP.raiseAlert → db.alertEvents). The rules live in
 * apps/admin/modules/ops-routes.js (shared with the server, which stores these in Firestore: functions/src/alerts.js and
 * intercepts these paths before the domain runtime, so this file only serves the demo).
 * ROUTES (admin only; each needs the alerts / tickets module of the admin's role):
 *   GET  /admin/alerts                   alerts of the admin's teams {items, unread, open, mine, teams} (?status=&team=&mine=1&all=1)
 *   POST /admin/alerts/seen              mark the bell as read
 *   POST /admin/alerts/:id/claim|resolve «أنا هاخده» / «تم»
 *   POST /admin/alerts/:id/ticket        «حوّل لبلاغ»
 *   GET  /admin/tickets                  (?team=&status=&mine=1&open=1)
 *   POST /admin/tickets                  {title, description?, team?, priority?, link?}
 *   PATCH /admin/tickets/:id             {title?, description?, priority?, team?, status?, owner?}
 *   POST /admin/tickets/:id/notes        {text}
 * STATUS: IMPLEMENTED (demo adapter; the server has its own storage)
 */
'use strict';
(function (root, factory) {
  const req = typeof require === 'function' ? require : null;
  const client = root.HSApiClient || (req ? req('./api-client.js') : null);
  const api = factory(client, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSOpsApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (client, root) {
  const A = ['admin'];
  const G = () => root.HSAdminPermissionGuard || null;
  const rbac = () => root.HSAdminRbac || null;
  const uid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function context(actor, method, path, query, body, db) {
    const g = G(), core = root.HSOpsCore, emp = g && actor.adminRole ? g.employeeOf(actor) : null;
    const rost = rbac() && rbac().state && (rbac().state.roster || []).find((e) => e.id === actor.id);
    const perms = emp && g ? g.permissionsOf(emp) : null;
    const role = emp ? emp.role : 'owner';                                            // demo without a role: unrestricted, like the other admin routes
    return {
      method, path, query, body, now: Date.now(), me: { id: actor.id, name: (rost && rost.name) || actor.name || 'مدير' },
      teams: core.teamsFor(perms, role), nextId: uid,
      can: (m, a) => (!emp || !g ? true : g.can(emp, m, a)), risk: (k) => (g && actor.adminRole ? g.riskDenied(actor, k) : ''),
      state: { alerts: (db.alerts = db.alerts || []), tickets: (db.tickets = db.tickets || []), seen: (db.alertSeen = db.alertSeen || {}) }
    };
  }
  function run(method, pattern) {
    return ({ params, query, body, actor, store }) => {
      const R = root.HSOpsRoutes; if (!R || !root.HSOpsCore) return client.fail('UNAVAILABLE');
      const db = store.db();
      const fold = () => { if (Array.isArray(db.alertEvents) && db.alertEvents.length) { R.ingest(db, db.alertEvents, Date.now()); db.alertEvents = []; } };
      fold();
      if (method === 'GET' && pattern === '/admin/alerts' && typeof store.opsScan === 'function') { store.opsScan(); fold(); }   // demo: the time-based alerts are derived on read
      const path = pattern.replace(/:(\w+)/g, (_, k) => params[k]);
      const out = R.handle(context(actor, method, path, query || {}, body || {}, db));
      if (typeof store.save === 'function') store.save();
      return out.envelope;
    };
  }
  for (const [m, p, s] of [
    ['GET', '/admin/alerts', 'Alerts of the admin’s teams.'], ['POST', '/admin/alerts/seen', 'Mark the alert bell as read.'],
    ['POST', '/admin/alerts/:id/claim', 'Claim an alert («أنا هاخده»).'], ['POST', '/admin/alerts/:id/resolve', 'Resolve an alert («تم»).'], ['POST', '/admin/alerts/:id/ticket', 'Turn an alert into a ticket.'],
    ['GET', '/admin/tickets', 'Tickets of the admin’s teams.'], ['POST', '/admin/tickets', 'Open a ticket {title, description?, team?, priority?, link?}.'],
    ['PATCH', '/admin/tickets/:id', 'Update / assign / close a ticket.'], ['POST', '/admin/tickets/:id/notes', 'Add a note to a ticket {text}.']
  ]) client.define(m, p, { roles: A, summary: s }, run(m, p));

  return {
    alerts: (q) => client.get('/admin/alerts' + (q ? '?' + new URLSearchParams(q).toString() : '')),
    seen: () => client.post('/admin/alerts/seen', {}),
    claim: (id) => client.post('/admin/alerts/' + encodeURIComponent(id) + '/claim', {}),
    resolve: (id) => client.post('/admin/alerts/' + encodeURIComponent(id) + '/resolve', {}),
    toTicket: (id) => client.post('/admin/alerts/' + encodeURIComponent(id) + '/ticket', {}),
    tickets: (q) => client.get('/admin/tickets' + (q ? '?' + new URLSearchParams(q).toString() : '')),
    createTicket: (b) => client.post('/admin/tickets', b),
    updateTicket: (id, b) => client.patch('/admin/tickets/' + encodeURIComponent(id), b),
    addNote: (id, text) => client.post('/admin/tickets/' + encodeURIComponent(id) + '/notes', { text })
  };
});
