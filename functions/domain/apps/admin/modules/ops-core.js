/**
 * MODULE: ops-core (HSOpsCore) — pure rules for the team workflow of the Admin Center: ALERTS (what needs a team's
 * attention) and TICKETS («بلاغات», the internal work items). No storage, no network: the server
 * (functions/src/alerts.js, Firestore) and the local demo (services/ops-api.js, MP db arrays) call the same functions,
 * so both behave identically. Shared domain file: synced to functions/domain by `npm run functions:sync`.
 *
 * Alert  {id, team, severity: critical|normal|info, kind, title, body, link, createdAt, lastAt, status: open|claimed|resolved,
 *         claimedBy:{id,name}|null, claimedAt, resolvedBy, resolvedAt, dedupeKey, count, escalated, escalatedAt, pushPending}
 * Ticket {id, title, description, team, priority: low|normal|high|urgent, status: new|doing|done, owner:{id,name}|null,
 *         notes:[{id,by:{id,name},text,at}], link, alertId, createdAt, createdBy:{id,name}, updatedAt, doneAt}
 * Titles / bodies carry no personal data (request numbers and counts only).
 */
'use strict';
(function (root) {
  const TEAMS = Object.freeze({ ops: 'عمليات ودعم', finance: 'المالية', content: 'المحتوى والأسعار', tech: 'التقنية', owner: 'المالك' });
  const SEVERITY_RANK = Object.freeze({ info: 0, normal: 1, critical: 2 });
  const SEVERITY_LABEL = Object.freeze({ critical: 'عاجل', normal: 'عادي', info: 'معلومة' });
  const PRIORITIES = Object.freeze(['low', 'normal', 'high', 'urgent']);
  const PRIORITY_LABEL = Object.freeze({ low: 'منخفضة', normal: 'عادية', high: 'عالية', urgent: 'عاجلة' });
  const TICKET_STATUS = Object.freeze({ new: 'جديد', doing: 'بيتعمل عليه', done: 'خلص' });
  const LIMITS = Object.freeze({ title: 120, body: 400, link: 200, desc: 1000, note: 500, notes: 50, dedupe: 120 });
  const DEFAULT_ESCALATE_MIN = 15;

  const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  const who = (w) => (w && w.id ? { id: String(w.id), name: str(w.name, 60) } : null);
  const iso = (ms) => new Date(ms).toISOString();
  const ms = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : 0; };

  const ROLE_TEAMS = Object.freeze({ tech: ['tech'], ops: ['ops'], support: ['ops'], moderator: ['ops'], finance: ['finance'], content: ['content'], admin: ['ops', 'finance', 'content'], callcenter: ['ops'] });
  /** Teams an admin follows: preset roles by name, custom roles from the permission keys they hold. The owner follows everyone. */
  function teamsFor(perms, role) {
    if (role === 'owner') return ['ops', 'finance', 'content', 'tech', 'owner'];
    const has = (k) => (perms instanceof Set ? perms.has(k) : Array.isArray(perms) && perms.includes(k));
    if (ROLE_TEAMS[role]) return ROLE_TEAMS[role].slice();               // preset roles: their team by name (finance views orders but is not ops)
    const out = [];
    if (['orders.view', 'complaints.view', 'providers.view'].some(has)) out.push('ops');
    if (has('finance.view')) out.push('finance');
    if (has('marketing.view')) out.push('content');
    if (has('tech.view')) out.push('tech');
    return out;
  }
  const visibleTo = (a, teams) => !!a && Array.isArray(teams) && (teams.includes('owner') || teams.includes(a.team));

  /** deterministic short id from the dedupe key (53-bit string hash) */
  function alertId(key) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57; const s = String(key);
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'al_' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  /** Validated event → alert fields (null when it has no title). */
  function normalizeEvent(ev) {
    if (!ev || typeof ev !== 'object') return null;
    const title = str(ev.title, LIMITS.title); if (!title) return null;
    const team = TEAMS[ev.team] ? ev.team : 'ops';
    const severity = SEVERITY_RANK[ev.severity] != null ? ev.severity : 'normal';
    const kind = str(ev.kind || 'general', 40);
    return { team, severity, kind, title, body: str(ev.body, LIMITS.body), link: str(ev.link, LIMITS.link), dedupeKey: str(ev.dedupeKey || kind, LIMITS.dedupe) };
  }

  /**
   * Folds an event into the alert list entry with the same dedupeKey (prev, or null).
   * → { alert, isNew, upgraded }   isNew: first time or reopened after «تم»; upgraded: severity raised on an open alert.
   */
  function upsertAlert(prev, ev, now) {
    const e = normalizeEvent(ev); if (!e) return null;
    const t = iso(now);
    if (!prev || prev.status === 'resolved') {
      return { isNew: true, upgraded: false, alert: { id: alertId(e.dedupeKey), team: e.team, severity: e.severity, kind: e.kind, title: e.title, body: e.body, link: e.link,
        createdAt: t, lastAt: t, status: 'open', claimedBy: null, claimedAt: null, resolvedBy: null, resolvedAt: null, dedupeKey: e.dedupeKey,
        count: 1, escalated: false, escalatedAt: null, pushPending: e.severity === 'normal', reopened: !!prev } };
    }
    const upgraded = SEVERITY_RANK[e.severity] > SEVERITY_RANK[prev.severity];
    return { isNew: false, upgraded, alert: { ...prev, severity: upgraded ? e.severity : prev.severity, title: e.title, body: e.body, link: e.link || prev.link,
      lastAt: t, count: (+prev.count || 1) + 1, pushPending: prev.pushPending } };
  }

  const bad = (code, message) => ({ ok: false, code, message });
  function claim(a, by, now) {
    if (!a) return bad('NOT_FOUND', 'التنبيه غير موجود');
    if (a.status === 'resolved') return bad('CONFLICT', 'التنبيه اتقفل');
    if (a.status === 'claimed' && a.claimedBy && a.claimedBy.id !== (by && by.id)) return bad('CONFLICT', 'التنبيه ده استلمه ' + (a.claimedBy.name || 'زميل'));
    return { ok: true, alert: { ...a, status: 'claimed', claimedBy: who(by), claimedAt: a.claimedAt || iso(now), pushPending: false } };
  }
  function resolve(a, by, now) {
    if (!a) return bad('NOT_FOUND', 'التنبيه غير موجود');
    if (a.status === 'resolved') return bad('CONFLICT', 'التنبيه اتقفل قبل كده');
    return { ok: true, alert: { ...a, status: 'resolved', claimedBy: a.claimedBy || who(by), claimedAt: a.claimedAt || iso(now), resolvedBy: who(by), resolvedAt: iso(now), pushPending: false } };
  }
  /** an open (unclaimed) critical alert older than `minutes` goes to the owner once */
  const escalationDue = (a, now, minutes) => !!a && a.severity === 'critical' && a.status === 'open' && !a.escalated && now - ms(a.createdAt) >= (minutes || DEFAULT_ESCALATE_MIN) * 60000;
  const unreadCount = (alerts, seenAtMs, teams) => (alerts || []).filter((a) => a.status !== 'resolved' && visibleTo(a, teams) && ms(a.lastAt) > (+seenAtMs || 0)).length;
  const sortAlerts = (list) => list.slice().sort((x, y) => (x.status === 'resolved') - (y.status === 'resolved') || SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity] || ms(y.lastAt) - ms(x.lastAt));

  /* ───────────── tickets ───────────── */
  function validateTicket(input) {
    const i = input || {}, errors = {};
    const title = str(i.title, LIMITS.title), description = String(i.description == null ? '' : i.description).trim().slice(0, LIMITS.desc);
    if (title.length < 3) errors.title = 'اكتب عنوان البلاغ (3 حروف على الأقل)';
    const team = i.team == null || i.team === '' ? 'ops' : i.team; if (!TEAMS[team] || team === 'owner') errors.team = 'اختار فريق من القايمة';
    const priority = i.priority == null || i.priority === '' ? 'normal' : i.priority; if (!PRIORITIES.includes(priority)) errors.priority = 'أولوية غير معروفة';
    return { ok: !Object.keys(errors).length, errors, value: { title, description, team, priority, link: str(i.link, LIMITS.link), alertId: str(i.alertId, 60) } };
  }
  function createTicket(input, by, now, id) {
    const v = validateTicket(input); if (!v.ok) return { ok: false, code: 'VALIDATION', message: 'راجع بيانات البلاغ', errors: v.errors };
    const t = iso(now);
    return { ok: true, ticket: { id, ...v.value, status: 'new', owner: null, notes: [], createdAt: t, createdBy: who(by), updatedAt: t, doneAt: null } };
  }
  function ticketFromAlert(a, by, now, id) {
    if (!a) return bad('NOT_FOUND', 'التنبيه غير موجود');
    return createTicket({ title: a.title, description: a.body, team: a.team === 'owner' ? 'ops' : a.team, priority: a.severity === 'critical' ? 'urgent' : a.severity === 'info' ? 'low' : 'normal', link: a.link, alertId: a.id }, by, now, id);
  }
  const NEXT = { new: ['doing', 'done'], doing: ['new', 'done'], done: ['doing'] };
  /** patch: {title?, description?, priority?, team?, status?, owner?: {id,name}|null} */
  function patchTicket(tk, patch, by, now) {
    if (!tk) return bad('NOT_FOUND', 'البلاغ غير موجود');
    const p = patch || {}, next = { ...tk }, errors = {};
    if (p.title !== undefined) { const v = str(p.title, LIMITS.title); if (v.length < 3) errors.title = 'العنوان قصير'; else next.title = v; }
    if (p.description !== undefined) next.description = String(p.description).trim().slice(0, LIMITS.desc);
    if (p.priority !== undefined) { if (!PRIORITIES.includes(p.priority)) errors.priority = 'أولوية غير معروفة'; else next.priority = p.priority; }
    if (p.team !== undefined) { if (!TEAMS[p.team] || p.team === 'owner') errors.team = 'فريق غير معروف'; else next.team = p.team; }
    if (p.status !== undefined && p.status !== tk.status) {
      if (!TICKET_STATUS[p.status]) errors.status = 'حالة غير معروفة';
      else if (!NEXT[tk.status].includes(p.status)) errors.status = 'مينفعش تنقل البلاغ من «' + TICKET_STATUS[tk.status] + '» لـ«' + TICKET_STATUS[p.status] + '»';
      else { next.status = p.status; next.doneAt = p.status === 'done' ? iso(now) : null; if (p.status === 'doing' && !next.owner) next.owner = who(by); }
    }
    if (p.owner !== undefined) next.owner = p.owner ? who(p.owner) : null;
    if (Object.keys(errors).length) return { ok: false, code: 'VALIDATION', message: 'راجع البيانات', errors };
    next.updatedAt = iso(now);
    return { ok: true, ticket: next };
  }
  function addNote(tk, text, by, now, id) {
    if (!tk) return bad('NOT_FOUND', 'البلاغ غير موجود');
    const v = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, LIMITS.note);
    if (!v) return { ok: false, code: 'VALIDATION', message: 'اكتب الملاحظة', errors: { text: 'مطلوبة' } };
    if ((tk.notes || []).length >= LIMITS.notes) return bad('CONFLICT', 'عدد الملاحظات وصل للحد الأقصى');
    return { ok: true, ticket: { ...tk, notes: (tk.notes || []).concat([{ id, by: who(by), text: v, at: iso(now) }]), updatedAt: iso(now) } };
  }
  const PRI_RANK = { urgent: 3, high: 2, normal: 1, low: 0 };
  /** filters: {team, status, mine, whoId, open} — newest / most urgent first, finished last */
  function filterTickets(list, f) {
    const q = f || {};
    return (list || []).filter((t) => (!q.team || t.team === q.team) && (!q.status || t.status === q.status) && (!q.open || t.status !== 'done') && (!q.mine || (t.owner && t.owner.id === q.whoId)))
      .sort((a, b) => (a.status === 'done') - (b.status === 'done') || PRI_RANK[b.priority] - PRI_RANK[a.priority] || ms(b.updatedAt) - ms(a.updatedAt));
  }

  const api = Object.freeze({ TEAMS, SEVERITY_LABEL, SEVERITY_RANK, PRIORITIES, PRIORITY_LABEL, TICKET_STATUS, LIMITS, DEFAULT_ESCALATE_MIN,
    teamsFor, visibleTo, alertId, normalizeEvent, upsertAlert, claim, resolve, escalationDue, unreadCount, sortAlerts,
    validateTicket, createTicket, ticketFromAlert, patchTicket, addNote, filterTickets });
  root.HSOpsCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
