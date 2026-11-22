/**
 * Digest scheduling, sending and the admin routes (pure rendering/collection live in digest.js, transport in mailer.js).
 *
 * Storage (all server-only: Firestore rules deny every client):
 *   system/digest            configuration { daily:{on,hour}, weekly:{on,weekday,hour}, extraRecipients:[…], timezone }
 *   system/digestState       per type { key, status, attempts, claimedAt, at, sent, failed, error, transport, recipients }
 *   digestPrefs/{uid}        { off, lastTestAt } — each admin switches their own digest off here
 *   digests/{type}_{key}     the rendered digests of one run (kept 30 days, also when nothing could be sent)
 *
 * Routes (admin app, code-unlocked admins only; service.js calls handle()):
 *   GET  /admin/digest/config           owner   configuration + last state + transport status + recipients (e-mails masked)
 *   POST /admin/digest/config           owner   {daily?, weekly?, extraRecipients?}
 *   GET  /admin/digest/preview          owner (any team) | other roles (their own team): ?type=daily|weekly&team=…
 *   POST /admin/digest/test             same rule as preview: sends the digest to the caller's own e-mail (1 per minute)
 *   GET  /admin/digest/me, POST /admin/digest/me  {off:bool}   any admin: stop / resume my own digest
 */
'use strict';
const digest = require('./digest');

const PATH_RE = /^\/admin\/digest(\/(config|preview|test|me))?$/;
const DEFAULT_CFG = Object.freeze({ daily: { on: false, hour: 8 }, weekly: { on: false, weekday: 6, hour: 9 }, extraRecipients: [], timezone: digest.TZ });
const TTL_MS = 30 * 86400000, STALE_MS = 30 * 60000, MAX_ATTEMPTS = 3, MAX_EXTRA = 10, TEST_GAP_MS = 60000;

const env = (status, code, message, details) => ({ ok: false, status, error: details ? { code, message, details } : { code, message } });
const okEnv = (data, status = 200) => ({ ok: true, status, data });
const mailerOf = (deps) => (deps && deps.mailer) || require('./mailer');
const maskEmail = (e) => { const [u, d] = String(e || '').split('@'); return u && d ? `${u[0]}${'•'.repeat(Math.max(2, Math.min(5, u.length - 1)))}@${d}` : ''; };

/* ───────────── configuration ───────────── */
function normalizeConfig(c) {
  const src = c && typeof c === 'object' ? c : {};
  const int = (v, lo, hi, d) => { const n = Number.isInteger(v) ? v : d; return Math.min(hi, Math.max(lo, n)); };
  const extra = (Array.isArray(src.extraRecipients) ? src.extraRecipients : []).map((x) => (typeof x === 'string' ? { email: x, team: 'ops' } : x)).filter((x) => x && require('./mailer').isEmail(x.email) && digest.TEAMS.includes(x.team || 'ops'))
    .slice(0, MAX_EXTRA).map((x) => ({ email: x.email.trim().toLowerCase(), team: x.team || 'ops' }));
  return {
    daily: { on: !!(src.daily && src.daily.on), hour: int(src.daily && src.daily.hour, 0, 23, DEFAULT_CFG.daily.hour) },
    weekly: { on: !!(src.weekly && src.weekly.on), weekday: int(src.weekly && src.weekly.weekday, 0, 6, DEFAULT_CFG.weekly.weekday), hour: int(src.weekly && src.weekly.hour, 0, 23, DEFAULT_CFG.weekly.hour) },
    extraRecipients: extra, timezone: digest.TZ
  };
}
async function getConfig(backend) { return normalizeConfig(await backend.getDoc('system/digest')); }

/** strict validation of a POST body → { value } | { errors } */
function validateConfig(body, cur) {
  const b = body && typeof body === 'object' ? body : {}, errors = {}, next = JSON.parse(JSON.stringify(cur));
  const num = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  for (const t of ['daily', 'weekly']) {
    if (b[t] === undefined) continue;
    const x = b[t]; if (!x || typeof x !== 'object') { errors[t] = 'object'; continue; }
    if (x.on !== undefined) { if (typeof x.on !== 'boolean') errors[t + '.on'] = 'boolean'; else next[t].on = x.on; }
    if (x.hour !== undefined) { if (!num(x.hour, 0, 23)) errors[t + '.hour'] = '0–23'; else next[t].hour = x.hour; }
    if (t === 'weekly' && x.weekday !== undefined) { if (!num(x.weekday, 0, 6)) errors['weekly.weekday'] = '0–6'; else next.weekly.weekday = x.weekday; }
  }
  if (b.extraRecipients !== undefined) {
    if (!Array.isArray(b.extraRecipients) || b.extraRecipients.length > MAX_EXTRA) errors.extraRecipients = `حتى ${MAX_EXTRA} عناوين`;
    else {
      const out = [];
      for (const x of b.extraRecipients) {
        const e = typeof x === 'string' ? { email: x, team: 'ops' } : x;
        if (!e || !require('./mailer').isEmail(e.email) || !digest.TEAMS.includes(e.team || 'ops')) { errors.extraRecipients = 'إيميل غير صالح أو فريق غير معروف'; break; }
        out.push({ email: e.email.trim().toLowerCase(), team: e.team || 'ops' });
      }
      if (!errors.extraRecipients) next.extraRecipients = out;
    }
  }
  return Object.keys(errors).length ? { errors } : { value: next };
}

/* ───────────── recipients ───────────── */
async function listRecipients(backend, cfg) {
  const mailer = require('./mailer'), out = [], seen = new Set();
  for (const d of await backend.queryDocs('admins', 'status', '==', 'active')) {
    const email = d.data && d.data.email ? String(d.data.email).trim().toLowerCase() : '';
    if (!mailer.isEmail(email) || seen.has(email)) continue;
    const prefs = (await backend.getDoc(`digestPrefs/${d.id}`)) || {};
    seen.add(email);
    out.push({ uid: d.id, name: d.data.name || '', email, team: digest.teamOfRole(d.data.role), off: !!prefs.off, source: 'admin' });
  }
  for (const x of cfg.extraRecipients) if (!seen.has(x.email)) { seen.add(x.email); out.push({ uid: null, name: '', email: x.email, team: x.team, off: false, source: 'extra' }); }
  return out;
}

/* ───────────── a run (scheduler) ───────────── */
async function claim(backend, type, key, nowMs) {
  return backend.runTransaction(async (tx) => {
    const st = (await backend.adapter.get(tx, 'system/digestState')) || {}, cur = st[type] || {};
    const stale = cur.status === 'sending' && nowMs - (cur.claimedAt || 0) > STALE_MS;
    const can = cur.key !== key || ((cur.status === 'failed' || stale) && (cur.attempts || 0) < MAX_ATTEMPTS);
    if (!can) return null;
    const attempts = cur.key === key ? (cur.attempts || 0) + 1 : 1;
    backend.adapter.set(tx, 'system/digestState', { ...st, [type]: { key, status: 'sending', attempts, claimedAt: nowMs } });
    return { attempts };
  });
}

async function runDigest(backend, cfg, type, win, nowMs, deps, claimed) {
  const mailer = mailerOf(deps), tstat = mailer.status(deps && deps.env);
  const base = { key: win.key, attempts: claimed.attempts, claimedAt: nowMs, at: new Date(nowMs).toISOString(), transport: tstat.transport };
  let result;
  try {
    const stats = await digest.collect(backend, win, nowMs, deps);
    const all = await listRecipients(backend, cfg), live = all.filter((r) => !r.off);
    const teams = [...new Set(['owner'].concat(live.map((r) => r.team)))], rendered = {};
    for (const t of teams) rendered[t] = digest.render(digest.buildModel(stats, type, t));
    await backend.setDoc(`digests/${type}_${win.key}`, { type, key: win.key, label: win.label, at: base.at, teams: rendered, expiresAt: new Date(nowMs + TTL_MS) }, false);
    if (!tstat.configured) result = { ...base, status: 'stored', sent: 0, failed: 0, recipients: live.length, error: 'الإرسال غير مفعّل — ناقص: ' + tstat.missing.join(' / ') };
    else {
      let sent = 0, failed = 0, error = '';
      for (const r of live) {
        try { const m = rendered[r.team]; await mailer.send({ to: r.email, subject: m.subject, html: m.html, text: m.text }, deps); sent++; }
        catch (e) { failed++; error = error || String((e && e.message) || e).slice(0, 200); }
      }
      result = { ...base, status: !live.length ? 'stored' : failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial', sent, failed, recipients: live.length, error };
    }
  } catch (e) { result = { ...base, status: 'failed', sent: 0, failed: 0, recipients: 0, error: String((e && e.message) || e).slice(0, 200) }; }
  await backend.setDoc('system/digestState', { [type]: result }, true);
  return result;
}

/** Called every hour by the scheduled function. Idempotent: one claim per (type, Cairo day) across all instances. */
async function tick(backend, nowMs = Date.now(), deps = {}) {
  const cfg = await getConfig(backend), out = {};
  for (const type of ['daily', 'weekly']) {
    const c = cfg[type]; if (!c.on) continue;
    const win = digest.windowFor(type, nowMs, cfg.timezone);
    if (win.sendHour < c.hour || (type === 'weekly' && win.weekday !== c.weekday)) continue;
    const claimed = await claim(backend, type, win.key, nowMs);
    out[type] = claimed ? await runDigest(backend, cfg, type, win, nowMs, deps, claimed) : { status: 'skipped' };
  }
  return out;
}

/* ───────────── routes ───────────── */
async function handle({ backend, method, path, query = {}, body = {}, admin, uid, deps = {}, now = Date.now() }) {
  const sub = (path.split('/')[3] || '');
  const isOwner = admin && admin.role === 'owner', myTeam = digest.teamOfRole(admin && admin.role);
  const mailer = mailerOf(deps);
  const wantTeam = (t) => (digest.TEAMS.includes(t) ? t : myTeam);
  const typeOf = (v) => (v === 'weekly' ? 'weekly' : 'daily');
  const buildFor = async (type, team) => {
    const cfg = await getConfig(backend), win = digest.windowFor(type, now, cfg.timezone);
    return { win, m: digest.render(digest.buildModel(await digest.collect(backend, win, now, deps), type, team)) };
  };

  if (sub === 'config') {
    if (!isOwner) return env(403, 'FORBIDDEN', 'إعدادات الملخصات للمالك فقط');
    let cfg = await getConfig(backend);
    if (method === 'POST') {
      const v = validateConfig(body, cfg);
      if (v.errors) return env(422, 'VALIDATION', 'راجع الإعدادات', v.errors);
      cfg = v.value; await backend.setDoc('system/digest', { ...cfg, updatedAt: new Date(now).toISOString(), updatedBy: uid || null }, false);
    } else if (method !== 'GET') return env(405, 'METHOD_NOT_ALLOWED', 'GET / POST');
    const st = (await backend.getDoc('system/digestState')) || {};
    const rec = await listRecipients(backend, cfg);
    return okEnv({ config: cfg, state: { daily: st.daily || null, weekly: st.weekly || null }, transport: mailer.status(deps.env), teams: digest.TEAM_LABEL, weekdays: digest.WEEKDAY_AR,
      recipients: rec.map((r) => ({ name: r.name, team: r.team, email: maskEmail(r.email), off: r.off, source: r.source })) });
  }
  if (sub === 'preview' || sub === 'test') {
    const type = typeOf(query.type || body.type), team = wantTeam(query.team || body.team);
    if (!isOwner && team !== myTeam) return env(403, 'FORBIDDEN', 'تقدر تشوف ملخص فريقك بس');
    if (sub === 'preview') {
      if (method !== 'GET') return env(405, 'METHOD_NOT_ALLOWED', 'GET');
      const { win, m } = await buildFor(type, team);
      return okEnv({ type, team, label: win.label, subject: m.subject, html: m.html, text: m.text });
    }
    if (method !== 'POST') return env(405, 'METHOD_NOT_ALLOWED', 'POST');
    const email = admin && admin.email ? String(admin.email).trim() : '';
    if (!mailer.isEmail(email)) return env(422, 'VALIDATION', 'حسابك مفيهوش إيميل صالح');
    const st = mailer.status(deps.env);
    if (!st.configured) return okEnv({ sent: false, reason: 'transport-missing', missing: st.missing, transport: st.transport });
    const prefs = (await backend.getDoc(`digestPrefs/${uid}`)) || {};
    if (now - (+prefs.lastTestAt || 0) < TEST_GAP_MS) return env(429, 'RATE_LIMITED', 'استنى دقيقة قبل تجربة تانية');
    await backend.setDoc(`digestPrefs/${uid}`, { lastTestAt: now }, true);
    const { m } = await buildFor(type, team);
    try { const r = await mailer.send({ to: email, subject: `[تجربة] ${m.subject}`, html: m.html, text: m.text }, deps); return okEnv({ sent: true, to: maskEmail(email), transport: r.transport }); }
    catch (e) { return env(502, 'SEND_FAILED', String((e && e.message) || e).slice(0, 200)); }
  }
  if (sub === 'me') {
    if (!uid) return env(401, 'UNAUTHENTICATED', 'سجّل الدخول');
    const prefs = (await backend.getDoc(`digestPrefs/${uid}`)) || {};
    if (method === 'POST') {
      if (typeof body.off !== 'boolean') return env(422, 'VALIDATION', 'off لازم true أو false', { off: 'boolean' });
      await backend.setDoc(`digestPrefs/${uid}`, { off: body.off }, true); prefs.off = body.off;
    } else if (method !== 'GET') return env(405, 'METHOD_NOT_ALLOWED', 'GET / POST');
    return okEnv({ off: !!prefs.off, team: myTeam, teamLabel: digest.TEAM_LABEL[myTeam], email: maskEmail(admin && admin.email), canChooseTeam: !!isOwner, teams: isOwner ? digest.TEAM_LABEL : { [myTeam]: digest.TEAM_LABEL[myTeam] } });
  }
  return env(404, 'NOT_FOUND', 'مسار غير معروف');
}

module.exports = { PATH_RE, DEFAULT_CFG, normalizeConfig, validateConfig, getConfig, listRecipients, tick, claim, handle, maskEmail };
