/**
 * Client error reports (server-native, no domain counterpart):
 *   POST /telemetry/errors      {reports: [{msg, src?, stack?, route?, build?, ua?, kind?}]}   anyone (signed in or not)
 *   GET  /admin/client-errors   grouped errors, most recent first (?limit=)                    owner | admin role
 *   POST /admin/client-errors/clear   delete every group                                        owner | admin role
 * Each report is scrubbed (emails, phone numbers, long digit runs, tokens and query strings are removed), clipped, and
 * folded into one document per (app, message, source) so a crash loop on many devices is one row with a count, not
 * thousands of documents. Documents carry expiresAt (+30 days) for the Firestore TTL policy.
 * Abuse limits: reports are rate limited in memory per uid / IP before this handler runs (limits.js, telemetryAllowed),
 * at most MAX_REPORTS per call and MAX_GROUPS_PER_DAY new groups per instance per day.
 */
'use strict';
const crypto = require('crypto');

const PATH_RE = /^\/(telemetry\/errors|admin\/client-errors(\/clear)?)$/;
const MAX_REPORTS = 5, MAX_GROUPS_PER_DAY = 500, TTL_MS = 30 * 86400000;
const KINDS = ['error', 'rejection', 'console'];
const env = (status, code, message) => ({ ok: false, status, error: { code, message } });
const okEnv = (data, status = 200) => ({ ok: true, status, data });

/** Removes personal data and secrets from free text before it is stored. */
function scrub(s, max) {
  return String(s == null ? '' : s)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
        .replace(/\b(eyJ[\w-]{10,}\.[\w-]+\.[\w-]+|AIza[\w-]{20,}|[A-Za-z0-9_-]{32,})\b/g, '<token>')
    .replace(/\+?[\d\u0660-\u0669][\d\u0660-\u0669\s-]{7,}[\d\u0660-\u0669]/g, '<num>')
    .replace(/\?[^\s#)'":]*/g, '')          // query strings can carry ids / tokens
    .replace(/\s+\n/g, '\n').slice(0, max);
}
/** Keeps only the path of a source URL relative to the site (no origin, no query). */
function srcPath(s) {
  return scrub(String(s || '').replace(/^[a-z]+:\/\/[^/]+/i, ''), 200);
}

function clean(r, app) {
  if (!r || typeof r !== 'object') return null;
  const msg = scrub(r.msg, 300).trim();
  if (!msg) return null;
  return {
    app, msg, src: srcPath(r.src), kind: KINDS.includes(r.kind) ? r.kind : 'error',
    stack: scrub(String(r.stack || '').split('\n').slice(0, 6).map(l => l.replace(/[a-z]+:\/\/[^/\s)]+/gi, '')).join('\n'), 900),
    route: scrub(String(r.route || '').replace(/^#?/, '#'), 80), build: scrub(r.build, 60), ua: scrub(r.ua, 120)
  };
}
const groupId = c => crypto.createHash('sha1').update([c.app, c.msg, c.src].join('|')).digest('hex').slice(0, 32);

let dayKey = '', newGroupsToday = 0;

async function report(backend, app, body, uid) {
  const list = (Array.isArray(body.reports) ? body.reports : []).slice(0, MAX_REPORTS).map(r => clean(r, app)).filter(Boolean);
  if (!list.length) return env(422, 'VALIDATION', 'no valid reports');
  const now = new Date(), iso = now.toISOString(), day = iso.slice(0, 10);
  if (day !== dayKey) { dayKey = day; newGroupsToday = 0; }
  let stored = 0;
  for (const c of list) {
    const path = `clientErrors/${groupId(c)}`;
    const cur = await backend.getDoc(path);
    if (!cur && ++newGroupsToday > MAX_GROUPS_PER_DAY) continue;
    const users = cur && Array.isArray(cur.users) ? cur.users : [];
    if (uid && !users.includes(uid) && users.length < 50) users.push(uid);
    await backend.setDoc(path, {
      ...c, first: cur ? cur.first : iso, last: iso, count: (cur ? +cur.count || 0 : 0) + 1, users, userCount: users.length,
      /* Tech Center triage: a resolved group that happens again re-opens; an ignored one stays ignored */
      status: cur && cur.status === 'ignored' ? 'ignored' : 'open', ...(cur && cur.status === 'resolved' ? { reopenedAt: iso } : (cur && cur.reopenedAt ? { reopenedAt: cur.reopenedAt } : {})),
      expiresAt: new Date(now.getTime() + TTL_MS)
    }, false);
    stored++;
    const n = (cur ? +cur.count || 0 : 0) + 1;
    if ([10, 100, 1000].includes(n)) await require('./owner-alerts').notifyOwner(backend, `خطأ بيتكرر (${n} مرة) في ${c.app === 'server' ? 'السيرفر' : c.app === 'provider' ? 'تطبيق مقدم الخدمة' : c.app === 'admin' ? 'الإدارة' : 'تطبيق العميل'}: ${c.msg.slice(0, 90)}`, 'apps/admin/index.html#/audit');
  }
  return okEnv({ stored }, 201);
}

async function handle({ backend, method, path, query, body, app, actor, token }) {
  if (path === '/telemetry/errors') {
    if (method !== 'POST') return env(405, 'METHOD_NOT_ALLOWED', 'POST only');
    return report(backend, app, body || {}, token ? token.uid : null);
  }
  if (!actor || actor.role !== 'admin') return env(actor ? 403 : 401, actor ? 'FORBIDDEN' : 'UNAUTHENTICATED', 'admin only');
  if (!['owner', 'admin'].includes(actor.adminRole)) return env(403, 'FORBIDDEN', 'ليست لديك صلاحية لهذا الإجراء');
  if (path === '/admin/client-errors' && method === 'GET') {
    const limit = Math.min(200, Math.max(1, parseInt((query || {}).limit, 10) || 100));
    const rows = await backend.adapter.query(null, 'clientErrors', { orderBy: ['last', 'desc'], limit });
    return okEnv({ items: rows.map(r => { const { users, expiresAt, ...d } = r.data; return { id: r.id, ...d }; }) });
  }
  if (path === '/admin/client-errors/clear' && method === 'POST') {
    const rows = await backend.adapter.query(null, 'clientErrors', { limit: 500 });
    for (const r of rows) await backend.deleteDoc(`clientErrors/${r.id}`);
    return okEnv({ deleted: rows.length });
  }
  return env(404, 'NOT_FOUND', 'unknown route');
}

module.exports = { PATH_RE, handle, report, scrub, clean, groupId, MAX_REPORTS };
