/**
 * MODULE: ops-routes (HSOpsRoutes) — the /admin/alerts and /admin/tickets route logic, storage-agnostic and synchronous.
 * The caller loads the records into plain arrays (state.alerts / state.tickets / state.seen), calls handle(), then persists
 * what it reports as changed:
 *   • server  — functions/src/alerts.js loads the Firestore docs, runs this, writes the changed docs, audits;
 *   • demo    — services/ops-api.js runs it over the MP db arrays.
 * One implementation, so permissions, de-duplication and the claim / resolve rules cannot drift between demo and server.
 *
 * handle({ method, path, query, body, me: {id,name}, teams, can(module, action), risk(key) → '' | message, now, nextId(prefix), state, escalateMin })
 *   → { envelope: {ok,status,data|error}, changed: { alerts: [ids], tickets: [ids], seen: bool }, audit: [{action, subject}] }
 * Routes: GET /admin/alerts · POST /admin/alerts/seen · POST /admin/alerts/:id/claim|resolve|ticket ·
 *         GET|POST /admin/tickets · PATCH /admin/tickets/:id · POST /admin/tickets/:id/notes
 */
'use strict';
(function (root) {
  const core = () => root.HSOpsCore || (typeof require === 'function' ? require('./ops-core.js') : null);
  const ok = (data, status = 200) => ({ ok: true, status, data });
  const err = (status, code, message, details) => ({ ok: false, status, error: details ? { code, message, details } : { code, message } });
  const CODE = { NOT_FOUND: 404, CONFLICT: 409, VALIDATION: 422, FORBIDDEN: 403 };
  const fromCore = (r) => err(CODE[r.code] || 400, r.code || 'BAD_REQUEST', r.message || 'مش مقبول', r.errors);

  function handle(ctx) {
    const C = core();
    const { method, query = {}, body = {}, me, teams = [], now, state } = ctx;
    const seg = String(ctx.path).split('/').filter(Boolean);            // ['admin', 'alerts'|'tickets', id?, action?]
    const area = seg[1], id = seg[2], action = seg[3];
    const out = { envelope: null, changed: { alerts: [], tickets: [], seen: false }, audit: [] };
    const done = (env) => { out.envelope = env; return out; };
    const deny = (m, a) => (ctx.can(m, a) ? null : done(err(403, 'FORBIDDEN', 'ده خارج صلاحيات دورك')));
    const rank = (key) => { const m = ctx.risk ? ctx.risk(key) : ''; return m ? done(err(403, 'FORBIDDEN', m)) : null; };
    const alertsAll = () => state.alerts || (state.alerts = []);
    const ticketsAll = () => state.tickets || (state.tickets = []);
    const findAlert = (aid) => alertsAll().find((a) => a.id === aid);
    const findTicket = (tid) => ticketsAll().find((t) => t.id === tid);
    const put = (list, item) => { const i = list.findIndex((x) => x.id === item.id); if (i >= 0) list[i] = item; else list.unshift(item); };
    const seeTicket = (t) => teams.includes('owner') || teams.includes(t.team) || (t.owner && t.owner.id === me.id) || (t.createdBy && t.createdBy.id === me.id);

    /* ───── alerts ───── */
    if (area === 'alerts') {
      if (method === 'GET' && !id) {
        let d; if ((d = deny('alerts', 'view'))) return d;
        let list = alertsAll().filter((a) => C.visibleTo(a, teams));
        if (query.status) list = list.filter((a) => a.status === query.status); else if (!query.all) list = list.filter((a) => a.status !== 'resolved' || now - Date.parse(a.resolvedAt || a.lastAt) < 86400000);
        if (query.team) list = list.filter((a) => a.team === query.team);
        if (query.mine) list = list.filter((a) => a.claimedBy && a.claimedBy.id === me.id);
        const visible = alertsAll().filter((a) => C.visibleTo(a, teams));
        return done(ok({ items: C.sortAlerts(list).slice(0, 100), unread: C.unreadCount(alertsAll(), (state.seen || {})[me.id], teams), open: visible.filter((a) => a.status === 'open').length,
          mine: visible.filter((a) => a.status === 'claimed' && a.claimedBy && a.claimedBy.id === me.id).length, teams }));
      }
      if (method === 'POST' && id === 'seen') {
        let d; if ((d = deny('alerts', 'view'))) return d;
        state.seen = state.seen || {}; state.seen[me.id] = now; out.changed.seen = true;
        return done(ok({ unread: 0 }));
      }
      if (method === 'POST' && id && ['claim', 'resolve', 'ticket'].includes(action)) {
        let d; if ((d = deny('alerts', action === 'ticket' ? 'view' : 'decide'))) return d;
        const a = findAlert(id); if (!a || !C.visibleTo(a, teams)) return done(err(404, 'NOT_FOUND', 'التنبيه غير موجود'));
        if (action === 'ticket') {
          if ((d = deny('tickets', 'create')) || (d = rank('tickets.create'))) return d;
          const existing = ticketsAll().find((t) => t.alertId === a.id && t.status !== 'done');
          if (existing) return done(ok(existing));
          const r = C.ticketFromAlert(a, me, now, ctx.nextId('tk')); if (!r.ok) return done(fromCore(r));
          put(ticketsAll(), r.ticket); out.changed.tickets.push(r.ticket.id); out.audit.push({ action: 'ticket.create', subject: r.ticket.id });
          if (a.status === 'open') { const c = C.claim(a, me, now); if (c.ok) { put(alertsAll(), c.alert); out.changed.alerts.push(a.id); } }
          return done(ok(r.ticket, 201));
        }
        if ((d = rank(action === 'claim' ? 'alerts.claim' : 'alerts.resolve'))) return d;
        const r = action === 'claim' ? C.claim(a, me, now) : C.resolve(a, me, now);
        if (!r.ok) return done(fromCore(r));
        put(alertsAll(), r.alert); out.changed.alerts.push(a.id); out.audit.push({ action: 'alert.' + action, subject: a.id });
        return done(ok(r.alert));
      }
    }

    /* ───── tickets ───── */
    if (area === 'tickets') {
      let d;
      if (method === 'GET' && !id) {
        if ((d = deny('tickets', 'view'))) return d;
        const list = C.filterTickets(ticketsAll().filter(seeTicket), { team: query.team, status: query.status, mine: !!query.mine, whoId: me.id, open: !!query.open });
        return done(ok({ items: list.slice(0, 200), total: list.length }));
      }
      if (method === 'POST' && !id) {
        if ((d = deny('tickets', 'create')) || (d = rank('tickets.create'))) return d;
        const team = body.team || teams.find((t) => t !== 'owner') || 'ops';
        if (!teams.includes('owner') && !teams.includes(team)) return done(err(403, 'FORBIDDEN', 'مينفعش تفتح بلاغ لفريق مش فريقك'));
        const r = C.createTicket({ ...body, team }, me, now, ctx.nextId('tk')); if (!r.ok) return done(fromCore(r));
        put(ticketsAll(), r.ticket); out.changed.tickets.push(r.ticket.id); out.audit.push({ action: 'ticket.create', subject: r.ticket.id });
        return done(ok(r.ticket, 201));
      }
      const t = id ? findTicket(id) : null;
      if (id && (!t || !seeTicket(t))) return done(err(404, 'NOT_FOUND', 'البلاغ غير موجود'));
      if (method === 'PATCH' && id && !action) {
        if ((d = deny('tickets', 'edit'))) return d;
        if (body.owner !== undefined && body.owner && body.owner.id !== me.id && (d = rank('tickets.assign'))) return d;
        const r = C.patchTicket(t, body, me, now); if (!r.ok) return done(fromCore(r));
        put(ticketsAll(), r.ticket); out.changed.tickets.push(id); out.audit.push({ action: 'ticket.update', subject: id });
        return done(ok(r.ticket));
      }
      if (method === 'POST' && id && action === 'notes') {
        if ((d = deny('tickets', 'edit'))) return d;
        const r = C.addNote(t, body.text, me, now, ctx.nextId('nt')); if (!r.ok) return done(fromCore(r));
        put(ticketsAll(), r.ticket); out.changed.tickets.push(id); out.audit.push({ action: 'ticket.note', subject: id });
        return done(ok(r.ticket, 201));
      }
    }
    return done(err(404, 'NOT_FOUND', 'لا يوجد مسار ' + ctx.method + ' ' + ctx.path));
  }

  /** Folds raw events (MP.raiseAlert output) into the alert list; returns the alerts that are new / changed. */
  function ingest(state, events, now) {
    const C = core(); const list = state.alerts || (state.alerts = []); const fresh = [];
    for (const ev of events || []) {
      const e = C.normalizeEvent(ev); if (!e) continue;
      const prev = list.find((a) => a.id === C.alertId(e.dedupeKey));
      const r = C.upsertAlert(prev, e, now); if (!r) continue;
      const i = list.findIndex((a) => a.id === r.alert.id); if (i >= 0) list[i] = r.alert; else list.unshift(r.alert);
      fresh.push({ alert: r.alert, isNew: r.isNew, upgraded: r.upgraded });
    }
    return fresh;
  }

  const api = Object.freeze({ handle, ingest });
  root.HSOpsRoutes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
