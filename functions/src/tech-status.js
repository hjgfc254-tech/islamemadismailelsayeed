/**
 * Tech Center backend («مركز التقنية») — system information ONLY, never customer / provider / order / personal data.
 *   GET  /admin/tech/status            health, deploy, clocks, grouped errors, usage & cost vs budget, latency, limits
 *   POST /admin/tech/check             run the health probe now (10 s cooldown)
 *   POST /admin/tech/errors/:id        {status: open | resolved | ignored} for one error group
 *   POST /admin/tech/config            {budgetEGP, usdToEgp}   owner only
 * Allowed: admin role `owner` or `tech`. Handled outside a Firestore transaction (service.js), mutations are audited.
 * healthTick() is the 10-minute scheduled probe (functions/index.js healthClock): it stores system/health, tracks the
 * deployed revision in system/deploy, evaluates thresholds and sends team alerts (alerts-adapter.js), de-duplicated.
 * Everything leaving this module goes through safeText()/safeRoute(): emails, phones, tokens, order numbers and
 * record ids are masked even if an error message happened to contain one.
 */
'use strict';
const usage = require('./usage');
const { scrub } = require('./telemetry');

const PATH_RE = /^\/admin\/tech\/(status|check|config|errors\/[A-Za-z0-9_-]{1,64})$/;
const ROLES = ['owner', 'tech'];
const REGION = 'me-central1';
const HEALTH_FRESH_MS = 5 * 60000, CHECK_COOLDOWN_MS = 10000, MONTH_CACHE_MS = 55000, REALERT_MS = { normal: 6 * 3600000, critical: 2 * 3600000 };
const THRESHOLDS = Object.freeze({ firestoreWarnMs: 1500, otherWarnMs: 2500, offersClockStaleMs: 20 * 60000, errorRateWarn: 0.05, errorRateCritical: 0.2, minCallsForRate: 50 });
const DEFAULT_CFG = Object.freeze({ budgetEGP: 1000, usdToEgp: 50 });

const env = (status, code, message, details) => ({ ok: false, status, error: details ? { code, message, details } : { code, message } });
const okEnv = (data, status = 200) => ({ ok: true, status, data });

/* ───── privacy: mask anything that could identify a person or a record ───── */
function safeText(s, max = 300) {
  return scrub(String(s == null ? '' : s), max * 2)
    .replace(/[٠-٩]{7,}/g, '<num>')                          // Arabic-Indic digit runs
    .replace(/\bHS-\d{4}-\d+\b/gi, '<order>')                          // order numbers
    .replace(/\b[a-z]{1,3}_[a-z0-9]{6,}\b/gi, '<id>')                  // r_xxx, c_xxx, p_xxx record ids
    .replace(/\b[a-f0-9]{20,}\b/gi, '<id>')
    .slice(0, max);
}
/** '#/track/r_abc123' → '#/track/:id' (the first segment names the screen, the rest may be a record id) */
function safeRoute(r) {
  const seg = String(r || '').replace(/^#?\/?/, '').split('/').filter(Boolean);
  if (!seg.length) return '';
  return '#/' + safeText(seg[0], 40) + (seg.length > 1 ? '/:id' : '');
}

/* ───── health probe ───── */
async function probe(fn, warnMs) {
  const t = Date.now();
  try { await fn(); const ms = Date.now() - t; return { state: ms > warnMs ? 'warn' : 'ok', ms }; }
  catch (e) { return { state: 'down', ms: Date.now() - t, error: safeText(e && e.message, 120) }; }
}
async function runHealth(backend, now = Date.now()) {
  const areas = {
    firestore: await probe(() => backend.getDoc('system/meta'), THRESHOLDS.firestoreWarnMs),
    rtdb: typeof backend.ping === 'function' ? await probe(() => backend.ping('rtdb'), THRESHOLDS.otherWarnMs) : { state: 'unknown', ms: null },
    auth: typeof backend.ping === 'function' ? await probe(() => backend.ping('auth'), THRESHOLDS.otherWarnMs) : { state: 'unknown', ms: null }
  };
  const states = Object.values(areas).map((a) => a.state);
  const overall = states.includes('down') ? 'down' : states.includes('warn') ? 'warn' : 'ok';
  return { areas, overall, atMs: now, checkedAt: new Date(now).toISOString() };
}
async function healthFor(backend, now, force) {
  const stored = await backend.getDoc('system/health').catch(() => null);
  if (!force && stored && now - (+stored.atMs || 0) < HEALTH_FRESH_MS) return { areas: stored.areas, overall: stored.overall, atMs: stored.atMs, checkedAt: stored.checkedAt, source: 'stored' };
  const h = await runHealth(backend, now);
  await backend.setDoc('system/health', { ...h, alertsSent: (stored && stored.alertsSent) || {} }, true).catch(() => {});
  return { ...h, source: 'live' };
}

/* ───── data ───── */
let monthCache = { at: 0, month: '', docs: [] };
const _resetCache = () => { monthCache = { at: 0, month: '', docs: [] }; };
async function monthDocs(backend, now) {
  const month = new Date(now).toISOString().slice(0, 7);
  if (monthCache.month === month && now - monthCache.at < MONTH_CACHE_MS) return monthCache.docs;
  const rows = await backend.queryDocs('usage', 'month', '==', month);
  monthCache = { at: now, month, docs: rows.map((r) => r.data || r) };
  return monthCache.docs;
}
async function errorsView(backend) {
  const rows = await backend.adapter.query(null, 'clientErrors', { orderBy: ['last', 'desc'], limit: 200 });
  const all = rows.map((r) => ({ id: r.id, ...r.data }));
  const st = (g) => (g.status === 'resolved' || g.status === 'ignored' ? g.status : 'open');
  const counts = { open: 0, resolved: 0, ignored: 0, total: all.length };
  all.forEach((g) => { counts[st(g)]++; });
  const groups = all.slice().sort((a, b) => (st(a) === 'open' ? 0 : 1) - (st(b) === 'open' ? 0 : 1) || (+b.count || 0) - (+a.count || 0)).slice(0, 20).map((g) => ({
    id: g.id, app: ['customer', 'provider', 'admin', 'server'].includes(g.app) ? g.app : 'other', kind: safeText(g.kind, 20), msg: safeText(g.msg, 300), src: safeText(g.src, 200),
    stack: safeText(g.stack, 900), route: safeRoute(g.route), build: safeText(g.build, 60), count: +g.count || 0, userCount: +g.userCount || 0,
    first: g.first || null, last: g.last || null, status: st(g), reopened: !!g.reopenedAt }));
  return { counts, groups };
}
const cfgOf = (doc) => ({ budgetEGP: +(doc && doc.budgetEGP) > 0 ? +doc.budgetEGP : DEFAULT_CFG.budgetEGP, usdToEgp: +(doc && doc.usdToEgp) > 0 ? +doc.usdToEgp : DEFAULT_CFG.usdToEgp, configured: !!(doc && +doc.budgetEGP > 0) });

async function buildStatus(backend, now = Date.now()) {
  await usage.maybeFlush(backend, now, true);
  const [cfgDoc, clocks, deploy, settings, health, docs, errors] = await Promise.all([
    backend.getDoc('system/tech'), backend.getDoc('system/clocks'), backend.getDoc('system/deploy'), backend.getDoc('system/settings'),
    healthFor(backend, now, false), monthDocs(backend, now), errorsView(backend)]);
  const cfg = cfgOf(cfgDoc), today = new Date(now).toISOString().slice(0, 10);
  const month = usage.merge(docs), day = usage.merge(docs.filter((d) => d.day === today));
  const est = usage.estimate(month, now, cfg);
  const c = (settings && settings.controls) || {};
  const flag = (k) => !!(c[k] && c[k].on);
  return {
    generatedAt: new Date(now).toISOString(),
    runtime: { node: process.version, region: REGION, revision: safeText(process.env.K_REVISION || '', 80), app: 'hansalehlak-functions' },
    health,
    clocks: {
      offers: clocks && clocks.offersAtMs ? { at: new Date(+clocks.offersAtMs).toISOString(), ok: clocks.offersOk !== false, changed: +clocks.offersChanged || 0, stale: now - clocks.offersAtMs > THRESHOLDS.offersClockStaleMs } : null,
      health: health.atMs ? { at: new Date(+health.atMs).toISOString() } : null
    },
    deploy: deploy ? { revision: safeText(deploy.revision, 80), firstSeenAt: deploy.at || null, node: safeText(deploy.node, 20), release: deploy.release ? { commit: safeText(deploy.release.commit, 40), cache: safeText(deploy.release.cache, 60), at: deploy.release.at || null } : null } : null,
    errors,
    usage: { today: pick(day), month: pick(month), instanceDays: month.days },
    cost: est,
    performance: usage.performance(day.api + day.session ? day : month),
    performanceScope: day.api + day.session ? 'today' : 'month',
    limits: { rateLimitedToday: day.rateLimited, appCheckEnforced: process.env.ENFORCE_APP_CHECK === 'true', maintenance: flag('maintenance'), pauseOrders: flag('pauseOrders'), pauseSignups: flag('pauseSignups') },
    thresholds: THRESHOLDS
  };
}
const pick = (m) => ({ api: m.api, session: m.session, reads: m.reads, writes: m.writes, deletes: m.deletes, pushes: m.pushes, errors: m.errors, rejected: m.rejected, rateLimited: m.rateLimited });

/* ───── thresholds → alerts (pure) ───── */
function evaluateAlerts({ health, perf, est, clocks, now }) {
  const out = [], link = 'apps/admin/index.html#/tech';
  const names = { firestore: 'قاعدة البيانات', rtdb: 'الإشارات اللحظية', auth: 'تسجيل الدخول' };
  for (const [k, a] of Object.entries((health && health.areas) || {})) {
    if (a.state === 'down') out.push({ key: 'health:' + k, level: 'critical', text: `${names[k] || k} مش بترد${a.error ? ' (' + a.error + ')' : ''}`, link });
    else if (a.state === 'warn') out.push({ key: 'slow:' + k, level: 'normal', text: `${names[k] || k} بطيئة (${a.ms} مللي ثانية)`, link });
  }
  if (clocks && clocks.offers && clocks.offers.stale) out.push({ key: 'clock:offers', level: 'normal', text: 'ساعة جولات العروض ما اشتغلتش من أكتر من 20 دقيقة', link });
  if (clocks && clocks.offers && clocks.offers.ok === false) out.push({ key: 'clock:offers:fail', level: 'normal', text: 'ساعة جولات العروض فشلت في آخر تشغيل', link });
  if (perf && perf.calls >= THRESHOLDS.minCallsForRate) {
    if (perf.errorRate >= THRESHOLDS.errorRateCritical) out.push({ key: 'errors:rate', level: 'critical', text: `نسبة أخطاء السيرفر ${Math.round(perf.errorRate * 100)}٪ من ${perf.calls} طلب`, link });
    else if (perf.errorRate >= THRESHOLDS.errorRateWarn) out.push({ key: 'errors:rate', level: 'normal', text: `نسبة أخطاء السيرفر ${Math.round(perf.errorRate * 100)}٪ من ${perf.calls} طلب`, link });
  }
  if (est && est.level === 'critical') out.push({ key: 'cost', level: 'critical', text: `التكلفة المتوقعة للشهر ${est.projectedEGP} ج.م — أكتر من 130٪ من الميزانية (${est.budgetEGP})`, link });
  else if (est && est.level === 'warn') out.push({ key: 'cost', level: 'normal', text: `التكلفة المتوقعة للشهر ${est.projectedEGP} ج.م — عدّت الميزانية (${est.budgetEGP})`, link });
  return out;
}
/** de-duplicate: the same key is re-sent after 6 h (normal) / 2 h (critical) */
function alertsToSend(alerts, sent, now) {
  return alerts.filter((a) => !(sent && sent[a.key]) || now - sent[a.key] >= (REALERT_MS[a.level] || REALERT_MS.normal));
}

/** the scheduled probe (every 10 minutes) */
let deployMemo = '';   // the deployed revision is checked once per instance, not every tick
async function healthTick(backend, now = Date.now()) {
  /* cost: the month's usage documents (one per instance per day — hundreds by month end) and the budget are read once an
     hour, not every 10 minutes; in between the last perf / cost summary stored in system/health is reused. */
  const prev = await backend.getDoc('system/health').catch(() => null);
  const hourly = !prev || !prev.costAtMs || now - prev.costAtMs >= 55 * 60000;
  await usage.maybeFlush(backend, now, hourly);
  const h = await runHealth(backend, now);
  const [docs, clocks, cfgDoc] = await Promise.all([hourly ? monthDocs(backend, now).catch(() => []) : [], backend.getDoc('system/clocks').catch(() => null), hourly ? backend.getDoc('system/tech').catch(() => null) : null]);
  let perf, est;
  if (hourly) {
    const today = new Date(now).toISOString().slice(0, 10), month = usage.merge(docs), day = usage.merge(docs.filter((d) => d.day === today));
    perf = usage.performance(day.api + day.session ? day : month); est = usage.estimate(month, now, cfgOf(cfgDoc));
  } else { perf = prev.perfLite || {}; est = prev.estLite || {}; }
  const offers = clocks && clocks.offersAtMs ? { stale: now - clocks.offersAtMs > THRESHOLDS.offersClockStaleMs, ok: clocks.offersOk !== false } : null;
  const alerts = evaluateAlerts({ health: h, perf, est, clocks: { offers }, now });
  const sent = { ...((prev && prev.alertsSent) || {}) };
  const toSend = alertsToSend(alerts, sent, now);
  const { notifyTeam } = require('./alerts-adapter');
  for (const a of toSend) { await notifyTeam(backend, 'tech', a.level, { text: a.text, link: a.link, key: a.key }); sent[a.key] = now; }
  for (const k of Object.keys(sent)) if (!alerts.some((a) => a.key === k) && now - sent[k] > 24 * 3600000) delete sent[k];
  const perfLite = { calls: +perf.calls || 0, errorRate: +perf.errorRate || 0 }, estLite = est ? { level: est.level, projectedEGP: est.projectedEGP, budgetEGP: est.budgetEGP } : {};
  await backend.setDoc('system/health', { ...h, alertsSent: sent, perfLite, estLite, costAtMs: hourly ? now : prev.costAtMs }, false);
  const rev = process.env.K_REVISION || '';
  if (rev && rev !== deployMemo) { deployMemo = rev; const dep = await backend.getDoc('system/deploy').catch(() => null); if (!dep || dep.revision !== rev) await backend.setDoc('system/deploy', { revision: rev, at: new Date(now).toISOString(), node: process.version }, true).catch(() => {}); }
  return { overall: h.overall, alerts: alerts.length, sent: toSend.length };
}
/* cost: the 5-minute clocks used to write system/clocks on every run (288 writes a day each). Now a write happens only when
   the result changes (ok / work done) or 15 minutes passed — still well inside offersClockStaleMs (20 min). Per instance. */
const CLOCK_WRITE_EVERY_MS = 15 * 60000;
const clockMemo = new Map();
async function recordClock(backend, name, data, now = Date.now()) {
  const ok = data.ok !== false, changed = +data.changed || 0, m = clockMemo.get(name);
  if (m && m.ok === ok && !changed && !m.changed && now - m.at < CLOCK_WRITE_EVERY_MS) return false;
  try { await backend.setDoc('system/clocks', { [name + 'AtMs']: now, [name + 'Ok']: ok, [name + 'Changed']: changed }, true); clockMemo.set(name, { ok, changed, at: now }); return true; } catch (e) { return false; /* never break the clock */ }
}

/* ───── HTTP-like handler ───── */
let lastCheck = 0;
const _resetCooldown = () => { lastCheck = 0; };
async function audit(backend, actor, method, path) { try { await backend.addDoc('audit', { at: new Date().toISOString(), uid: actor.id, actor: { role: 'admin', id: actor.id, adminRole: actor.adminRole }, app: 'admin', method, path, status: 200 }); } catch (e) {} }

async function handle({ backend, method, path, body, actor, now = Date.now() }) {
  if (!actor || actor.role !== 'admin') return env(actor ? 403 : 401, actor ? 'FORBIDDEN' : 'UNAUTHENTICATED', 'admin only');
  if (!ROLES.includes(actor.adminRole)) return env(403, 'FORBIDDEN', 'ليست لديك صلاحية لهذا الإجراء');
  const route = path.replace(/^\/admin\/tech\//, '');
  if (route === 'status' && method === 'GET') return okEnv(await buildStatus(backend, now));
  if (route === 'check' && method === 'POST') {
    if (now - lastCheck < CHECK_COOLDOWN_MS) return env(429, 'RATE_LIMITED', 'استنى ثواني قبل ما تعيد الفحص');
    lastCheck = now;
    const h = await healthFor(backend, now, true);
    return okEnv(h);
  }
  if (route.startsWith('errors/') && method === 'POST') {
    const id = route.slice(7), status = String((body || {}).status || '');
    if (!['open', 'resolved', 'ignored'].includes(status)) return env(422, 'VALIDATION', 'status لازم تكون open أو resolved أو ignored');
    const cur = await backend.getDoc('clientErrors/' + id);
    if (!cur) return env(404, 'NOT_FOUND', 'مجموعة الأخطاء غير موجودة');
    await backend.setDoc('clientErrors/' + id, { status, statusAt: new Date(now).toISOString(), statusBy: actor.id }, true);
    await audit(backend, actor, method, path);
    return okEnv({ id, status });
  }
  if (route === 'config' && method === 'POST') {
    if (actor.adminRole !== 'owner') return env(403, 'FORBIDDEN', 'ضبط الميزانية للمالك فقط');
    const b = Number((body || {}).budgetEGP), r = Number((body || {}).usdToEgp);
    if (!(b > 0 && b <= 1e7)) return env(422, 'VALIDATION', 'الميزانية لازم تكون رقم أكبر من صفر', { budgetEGP: '>0' });
    if (!(r > 0 && r <= 1000)) return env(422, 'VALIDATION', 'سعر الدولار لازم يكون رقم صحيح', { usdToEgp: '>0' });
    await backend.setDoc('system/tech', { budgetEGP: Math.round(b), usdToEgp: +r.toFixed(2), updatedAt: new Date(now).toISOString(), updatedBy: actor.id }, true);
    _resetCache();
    await audit(backend, actor, method, path);
    return okEnv({ budgetEGP: Math.round(b), usdToEgp: +r.toFixed(2) });
  }
  return env(404, 'NOT_FOUND', 'unknown route');
}

module.exports = { PATH_RE, ROLES, THRESHOLDS, DEFAULT_CFG, handle, buildStatus, runHealth, healthTick, recordClock, evaluateAlerts, alertsToSend, safeText, safeRoute, _resetCache, _resetCooldown };
