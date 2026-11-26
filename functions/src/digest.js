/**
 * Owner / manager e-mail digests — pure parts: Cairo time windows, data collection (aggregates only), the model per
 * team and the RTL HTML + plain-text renderer. Sending, scheduling and the admin routes live in digest-admin.js.
 *
 * Privacy: nothing personal ever enters a digest. collect() reads documents but copies only numbers, statuses,
 * category ids and the (already scrubbed) text of error groups; no customer / provider name, phone, e-mail or address
 * is read into the stats object, so the renderer cannot leak one.
 */
'use strict';

const TZ = 'Africa/Cairo';
const LOGO = 'https://hansalahlak.web.app/assets/brand/logo-v10-lockup.webp';
const ADMIN_URL = 'https://hansalahlak.web.app/apps/admin/index.html#/settings';
const TEAMS = ['owner', 'ops', 'finance', 'content', 'tech'];
const TEAM_LABEL = { owner: 'المالك', ops: 'العمليات والدعم', finance: 'المالية', content: 'المحتوى والأسعار', tech: 'التقنية والصيانة' };
const CAT_NAME = { electric: 'كهرباء', plumbing: 'سباكة', carpentry: 'نجارة', painting: 'دهانات', cars: 'سيارات', cleaning: 'تنظيف', appliances: 'أجهزة منزلية' };
const CAPS = { requests: 1500, tx: 1500, small: 500, assignSample: 300 };
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEKDAY_AR = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];

/** role (admins/{uid}.role) → digest team; digestPrefs.team overrides it */
function teamOfRole(role) {
  const r = String(role || '');
  if (r === 'owner') return 'owner';
  if (r === 'finance') return 'finance';
  if (r === 'moderator' || r === 'content') return 'content';
  if (r === 'tech' || r.startsWith('tech') || r === 'dev' || r === 'devops') return 'tech';
  return 'ops';   // admin, support and any custom role
}

/* ───────────── Cairo time ───────────── */
const fmtCache = new Map();
function dtf(tz) {
  if (!fmtCache.has(tz)) fmtCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' }));
  return fmtCache.get(tz);
}
function parts(ms, tz = TZ) {
  const o = {}; for (const p of dtf(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, min: +o.minute, s: +o.second, wd: WD[o.weekday] };
}
const offsetMs = (ms, tz) => { const p = parts(ms, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000; };
function dayStart(y, m, d, tz = TZ) {
  let t = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 3; i++) { const n = Date.UTC(y, m - 1, d) - offsetMs(t, tz); if (n === t) break; t = n; }
  return t;
}
function addDays(day, n) { const t = new Date(Date.UTC(day.y, day.m - 1, day.d + n)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
const ymd = (day) => `${day.y}-${String(day.m).padStart(2, '0')}-${String(day.d).padStart(2, '0')}`;

const nf = (n, d = 0) => (Number.isFinite(+n) ? (+n).toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—');
function dateLabel(ms, tz = TZ) { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeZone: tz, day: 'numeric', month: 'long' }).format(new Date(ms)); }

/** Window of the digest sent at nowMs (Cairo): daily = yesterday, weekly = the 7 full days before today; prev = the period before. */
function windowFor(type, nowMs, tz = TZ) {
  const len = type === 'weekly' ? 7 : 1;
  const p = parts(nowMs, tz), today = { y: p.y, m: p.m, d: p.d };
  const startDay = addDays(today, -len), prevDay = addDays(today, -2 * len);
  const cur = { start: dayStart(startDay.y, startDay.m, startDay.d, tz), end: dayStart(today.y, today.m, today.d, tz) };
  const prev = { start: dayStart(prevDay.y, prevDay.m, prevDay.d, tz), end: cur.start };
  const last = cur.end - 12 * 3600000;
  const label = type === 'weekly' ? `من ${dateLabel(cur.start + 12 * 3600000, tz)} إلى ${dateLabel(last, tz)}` : dateLabel(cur.start + 12 * 3600000, tz);
  return { type, tz, cur, prev, label, key: ymd(today), sendHour: p.h, weekday: p.wd };
}

/* ───────────── collection (aggregates only) ───────────── */
const iso = (ms) => new Date(ms).toISOString();
const ms = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
const DONE = ['completed', 'closed'], CANCELLED = ['cancelled', 'failed'];

async function periodStats(a, win, withOffers) {
  const range = (f) => [[f, '>=', iso(win.start)], [f, '<', iso(win.end)]];
  const out = { requests: { total: 0, completed: 0, cancelled: 0, capped: false, byCat: {}, offers: null }, money: { services: 0, value: 0, commission: 0, pending: 0, collected: 0, capped: false },
    complaints: { opened: 0, resolved: 0 }, reviews: { count: 0, avg: null }, providersNew: 0 };
  let rows = await a.query(null, 'requests', { where: range('createdAt'), limit: CAPS.requests + 1 });
  if (rows.length > CAPS.requests) { out.requests.capped = true; rows = rows.slice(0, CAPS.requests); }
  const reqs = rows.map((r) => ({ id: r.id, status: r.data.status, cat: r.data.cat, createdAt: ms(r.data.createdAt), bidding: !!r.data.bidding, accepted: acceptedAt(r.data) }));
  out.requests.total = reqs.length;
  for (const r of reqs) {
    if (DONE.includes(r.status)) out.requests.completed++;
    if (CANCELLED.includes(r.status)) out.requests.cancelled++;
    const c = String(r.cat || 'other'); out.requests.byCat[c] = (out.requests.byCat[c] || 0) + 1;
  }
  if (withOffers && reqs.length) {
    const sample = reqs.slice(-CAPS.assignSample);   // the most recent ones
    const byReq = new Map(sample.map((r) => [r.id, []]));
    const ids = sample.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 30) {
      const as = await a.query(null, 'assignments', { where: [['reqId', 'in', ids.slice(i, i + 30)]], limit: 400 });
      for (const x of as) if (byReq.has(x.data.reqId)) byReq.get(x.data.reqId).push({ offerAt: x.data.offer ? ms(x.data.offer.at) : null });
    }
    let biddingReqs = 0, offers = 0; const first = [], accept = [];
    for (const r of sample) {
      if (r.bidding) {
        biddingReqs++;
        const list = byReq.get(r.id).filter((x) => x.offerAt != null);
        offers += list.length;
        if (list.length && r.createdAt != null) first.push((Math.min(...list.map((x) => x.offerAt)) - r.createdAt) / 60000);
      }
      if (r.accepted != null && r.createdAt != null && r.accepted >= r.createdAt) accept.push((r.accepted - r.createdAt) / 60000);
    }
    const avg = (l) => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : null);
    out.requests.offers = { sampled: sample.length, biddingRequests: biddingReqs, perRequest: biddingReqs ? offers / biddingReqs : null, firstOfferMin: avg(first), acceptMin: avg(accept) };
  }
  let tx = await a.query(null, 'transactions', { where: range('at'), limit: CAPS.tx + 1 });
  if (tx.length > CAPS.tx) { out.money.capped = true; tx = tx.slice(0, CAPS.tx); }
  for (const t of tx) {
    const d = t.data; if (d.free) continue;
    out.money.services++; out.money.value += +d.value || 0;
    const c = +d.commission || 0; out.money.commission += c;
    if (d.collection === 'pending') out.money.pending += c; else if (d.collection === 'collected') out.money.collected += c;
  }
  for (const k of await a.query(null, 'complaints', { where: range('at'), limit: CAPS.small })) { out.complaints.opened++; if (k.data.status === 'resolved') out.complaints.resolved++; }
  let stars = 0;
  for (const v of await a.query(null, 'reviews', { where: range('at'), limit: CAPS.small })) { if (v.data.hidden || !Number.isFinite(+v.data.stars)) continue; out.reviews.count++; stars += +v.data.stars; }
  out.reviews.avg = out.reviews.count ? stars / out.reviews.count : null;
  out.providersNew = (await a.query(null, 'providers', { where: range('createdAt'), limit: CAPS.small })).length;
  return out;
}
function acceptedAt(r) {
  const list = r.log || r.timeline || r.history;
  if (!Array.isArray(list)) return null;
  const e = list.find((x) => x && (x.status === 'accepted' || x.s === 'accepted' || x.to === 'accepted'));
  return e ? ms(e.at) : null;
}

/** Everything a digest needs, as numbers. backend: { adapter, getDoc }. Never copies personal fields. */
async function collect(backend, win, nowMs = Date.now(), deps = {}) {
  const a = backend.adapter;
  const [cur, prev] = [await periodStats(a, win.cur, true), await periodStats(a, win.prev, false)];
  const now = { pendingProviders: await a.count('providers', [['status', '==', 'pending']]), openComplaints: await a.count('complaints', [['status', '==', 'open']]), unassigned: { count: 0, oldestMin: null }, controls: {} };
  const wait = await a.query(null, 'requests', { where: [['status', 'in', ['received', 'searching']]], limit: 200 });
  const cutoff = nowMs - 30 * 60000; let oldest = null;
  for (const r of wait) { const t = ms(r.data.createdAt); if (t != null && t <= cutoff) { now.unassigned.count++; if (oldest == null || t < oldest) oldest = t; } }
  now.unassigned.oldestMin = oldest == null ? null : Math.round((nowMs - oldest) / 60000);
  try { const s = await backend.getDoc('system/settings'); const c = (s && s.controls) || {}; now.controls = { maintenance: !!(c.maintenance && c.maintenance.on), pauseOrders: !!(c.pauseOrders && c.pauseOrders.on), pauseSignups: !!(c.pauseSignups && c.pauseSignups.on) }; } catch (e) { /* settings unreadable: no switches shown */ }
  const errors = { groups: 0, occurrences: 0, server: 0, top: [] };
  try {
    const rows = (await a.query(null, 'clientErrors', { orderBy: ['last', 'desc'], limit: 50 })).filter((r) => (ms(r.data.last) || 0) >= win.cur.start);
    errors.groups = rows.length;
    for (const r of rows) { errors.occurrences += +r.data.count || 0; if (r.data.app === 'server') errors.server++; }
    errors.top = rows.sort((x, y) => (+y.data.count || 0) - (+x.data.count || 0)).slice(0, 3).map((r) => ({ app: r.data.app, msg: String(r.data.msg || '').slice(0, 120), count: +r.data.count || 0 }));
  } catch (e) { /* collection may not exist yet */ }
  const security = { wrongCodes: 0, lockouts: 0 };
  try {
    for (const r of await a.query(null, 'audit', { orderBy: ['at', 'desc'], limit: 300 })) {
      const t = ms(r.data.at); if (t == null || t < win.cur.start || t >= win.cur.end) continue;
      if (r.data.action === 'admin.code.unlock' && r.data.status === 'failed') security.wrongCodes++;
      if (r.data.action === 'admin.code.unlock' && r.data.status === 'locked') security.lockouts++;
    }
  } catch (e) { /* no audit yet */ }
  let alerts = null;
  try { const m = deps.alerts || require('./alerts'); if (m && typeof m.openCounts === 'function') alerts = await m.openCounts(backend); } catch (e) { alerts = null; }   // optional engine (another module): absent → no alerts line
  return { window: win, nowMs, cur, prev, now, errors, security, alerts };
}

/* ───────────── model per team ───────────── */
function delta(cur, prev, higherIsBetter = true) {
  if (!Number.isFinite(+cur) || !Number.isFinite(+prev) || +prev === 0) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { text: 'زي الفترة اللي فاتت', cls: 'flat', good: null, pct };
  const up = pct > 0;
  return { text: `${up ? '▲' : '▼'} ${nf(Math.abs(pct))}٪`, cls: up ? 'up' : 'down', good: higherIsBetter ? up : !up, pct };
}
const mins = (m) => (m == null ? '—' : m < 90 ? `${nf(Math.round(m))} دقيقة` : `${nf(m / 60, 1)} ساعة`);
const money = (n) => `${nf(Math.round(n || 0))} ج.م`;
const rate = (c) => (c.requests.total ? Math.round((c.requests.completed / c.requests.total) * 100) : null);
const row = (label, value, d, hint) => ({ label, value, delta: d || null, hint: hint || '' });

const SECTIONS = {
  'ops-headline': (s) => ({ title: 'الخلاصة', rows: [
    row('طلبات جديدة', nf(s.cur.requests.total), delta(s.cur.requests.total, s.prev.requests.total)),
    row('نسبة الإنجاز', rate(s.cur) == null ? '—' : `${nf(rate(s.cur))}٪`, delta(rate(s.cur), rate(s.prev))),
    row('طلبات من غير فني (أكتر من نص ساعة)', nf(s.now.unassigned.count), null, s.now.unassigned.oldestMin != null ? `أقدمها من ${mins(s.now.unassigned.oldestMin)}` : '')] }),
  operations: (s) => ({ title: 'العمليات', rows: [
    row('طلبات جديدة', nf(s.cur.requests.total), delta(s.cur.requests.total, s.prev.requests.total), s.cur.requests.capped ? 'الرقم وصل لحد القراءة' : ''),
    row('اتنفّذت', nf(s.cur.requests.completed), delta(s.cur.requests.completed, s.prev.requests.completed)),
    row('اتلغت', nf(s.cur.requests.cancelled), delta(s.cur.requests.cancelled, s.prev.requests.cancelled, false)),
    row('نسبة الإنجاز', rate(s.cur) == null ? '—' : `${nf(rate(s.cur))}٪`, delta(rate(s.cur), rate(s.prev))),
    row('من غير فني دلوقتي (أكتر من نص ساعة)', nf(s.now.unassigned.count))] }),
  offers: (s) => { const o = s.cur.requests.offers; return { title: 'العروض', rows: [
    row('متوسط العروض لكل طلب', o && o.perRequest != null ? nf(o.perRequest, 1) : '—', null, o ? `من ${nf(o.biddingRequests)} طلب عروض` : ''),
    row('متوسط الوقت لأول عرض', mins(o && o.firstOfferMin)),
    row('متوسط الوقت لقبول الطلب', mins(o && o.acceptMin))] }; },
  complaints: (s) => ({ title: 'الشكاوى', rows: [
    row('اتفتحت', nf(s.cur.complaints.opened), delta(s.cur.complaints.opened, s.prev.complaints.opened, false)),
    row('اتحلّت', nf(s.cur.complaints.resolved)),
    row('مفتوحة دلوقتي', nf(s.now.openComplaints))] }),
  providers: (s) => ({ title: 'مقدمو الخدمة', rows: [
    row('مستنيين المراجعة', nf(s.now.pendingProviders)),
    row('تسجيلات جديدة', nf(s.cur.providersNew), delta(s.cur.providersNew, s.prev.providersNew))] }),
  quality: (s) => ({ title: 'الجودة', rows: [
    row('متوسط التقييم', s.cur.reviews.avg == null ? '—' : `${nf(s.cur.reviews.avg, 1)} من 5`, s.cur.reviews.avg != null && s.prev.reviews.avg != null ? delta(s.cur.reviews.avg, s.prev.reviews.avg) : null, `من ${nf(s.cur.reviews.count)} تقييم`)] }),
  money: (s) => ({ title: 'الفلوس', rows: [
    row('خدمات مدفوعة', nf(s.cur.money.services), delta(s.cur.money.services, s.prev.money.services)),
    row('قيمة الخدمات', money(s.cur.money.value), delta(s.cur.money.value, s.prev.money.value)),
    row('حصة المنصة', money(s.cur.money.commission), delta(s.cur.money.commission, s.prev.money.commission)),
    row('اتحصّلت', money(s.cur.money.collected)),
    row('لسه ما اتحصّلتش', money(s.cur.money.pending), null, s.cur.money.capped ? 'الرقم وصل لحد القراءة' : '')] }),
  catalogue: (s) => {
    const list = Object.entries(s.cur.requests.byCat).sort((x, y) => y[1] - x[1]).slice(0, 3), total = s.cur.requests.total || 1;
    return { title: 'أكتر الأقسام طلبًا', rows: list.length ? list.map(([c, n]) => row(CAT_NAME[c] || c, nf(n), null, `${nf(Math.round((n / total) * 100))}٪ من الطلبات`)) : [row('مفيش طلبات في الفترة دي', '—')] };
  },
  system: (s) => {
    const sw = [s.now.controls.maintenance && 'وضع الصيانة', s.now.controls.pauseOrders && 'إيقاف الطلبات الجديدة', s.now.controls.pauseSignups && 'إيقاف تسجيل الفنيين'].filter(Boolean);
    const rows = [row('حالة المنصة', sw.length ? `شغّال: ${sw.join('، ')}` : 'طبيعية'),
      row('محاولات كود إدارة غلط', nf(s.security.wrongCodes)), row('حسابات اتقفلت بسبب الكود', nf(s.security.lockouts)),
      row('حجم بيانات الفترة', `${nf(s.cur.requests.total)} طلب · ${nf(s.cur.money.services)} معاملة`, null, 'مؤشر على الاستهلاك والتكلفة')];
    if (s.alerts) rows.push(row('بلاغات مفتوحة', nf(s.alerts.open), null, s.alerts.critical ? `منها ${nf(s.alerts.critical)} حرجة` : ''));
    return { title: 'النظام', rows };
  },
  errors: (s) => ({ title: 'الأخطاء', rows: [row('أخطاء نشطة (مجموعات)', nf(s.errors.groups)), row('إجمالي التكرار', nf(s.errors.occurrences)), row('أخطاء السيرفر', nf(s.errors.server))]
    .concat(s.errors.top.map((e) => row(`${e.app === 'server' ? 'السيرفر' : e.app === 'provider' ? 'تطبيق المزود' : e.app === 'admin' ? 'الإدارة' : 'تطبيق العميل'}: ${e.msg}`, `${nf(e.count)} مرة`))) })
};
const TEAM_SECTIONS = {
  owner: ['ops-headline', 'operations', 'money', 'complaints', 'providers', 'quality', 'catalogue', 'offers', 'system', 'errors'],
  ops: ['ops-headline', 'operations', 'complaints', 'providers', 'quality'],
  finance: ['money'],
  content: ['catalogue', 'offers', 'quality'],
  tech: ['system', 'errors']
};

function attention(s, team) {
  const all = [];
  if (s.now.unassigned.count) all.push([['owner', 'ops'], `${nf(s.now.unassigned.count)} طلب من غير فني من أكتر من نص ساعة`]);
  if (s.now.pendingProviders) all.push([['owner', 'ops'], `${nf(s.now.pendingProviders)} فني مستني المراجعة`]);
  if (s.now.openComplaints) all.push([['owner', 'ops'], `${nf(s.now.openComplaints)} شكوى مفتوحة`]);
  if (s.now.controls.maintenance) all.push([['owner', 'tech', 'ops'], 'وضع الصيانة شغّال دلوقتي']);
  if (s.now.controls.pauseOrders) all.push([['owner', 'tech', 'ops'], 'استقبال الطلبات الجديدة متوقف']);
  if (s.now.controls.pauseSignups) all.push([['owner', 'tech', 'ops'], 'تسجيل الفنيين الجداد متوقف']);
  if (s.security.wrongCodes >= 3) all.push([['owner', 'tech'], `${nf(s.security.wrongCodes)} محاولة كود إدارة غلط في الفترة دي`]);
  if (s.errors.server) all.push([['owner', 'tech'], `${nf(s.errors.server)} خطأ من السيرفر`]);
  if (s.alerts && s.alerts.critical) all.push([['owner', 'tech', 'ops'], `${nf(s.alerts.critical)} بلاغ حرج مفتوح`]);
  if (s.cur.money.pending > s.cur.money.collected && s.cur.money.pending > 0) all.push([['owner', 'finance'], `عمولات لسه ما اتحصّلتش: ${money(s.cur.money.pending)}`]);
  return all.filter(([teams]) => teams.includes(team)).map(([, t]) => t);
}

/** weekly «ملاحظات»: simple rules over the week-over-week numbers */
function notes(s, team) {
  const c = s.cur, p = s.prev, out = [];
  const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);
  const canc = pct(c.requests.cancelled, p.requests.cancelled);
  if (c.requests.cancelled >= 3 && canc != null && canc > 20) out.push([['owner', 'ops'], `الإلغاءات زادت ${nf(Math.round(canc))}٪ عن الأسبوع اللي فات — راجع أسباب الإلغاء.`]);
  const rc = rate(c), rp = rate(p);
  if (rc != null && rp != null && rp - rc >= 10) out.push([['owner', 'ops'], `نسبة الإنجاز نزلت من ${nf(rp)}٪ لـ ${nf(rc)}٪.`]);
  const req = pct(c.requests.total, p.requests.total);
  if (req != null && Math.abs(req) >= 30 && Math.max(c.requests.total, p.requests.total) >= 10) out.push([['owner', 'ops', 'content'], `الطلبات ${req > 0 ? 'زادت' : 'قلّت'} ${nf(Math.round(Math.abs(req)))}٪ عن الأسبوع اللي فات.`]);
  const cmp = pct(c.complaints.opened, p.complaints.opened);
  if (c.complaints.opened >= 3 && cmp != null && cmp > 30) out.push([['owner', 'ops'], `الشكاوى زادت ${nf(Math.round(cmp))}٪ عن الأسبوع اللي فات.`]);
  if (c.reviews.avg != null && c.reviews.count >= 5 && (c.reviews.avg < 4 || (p.reviews.avg != null && p.reviews.avg - c.reviews.avg >= 0.3))) out.push([['owner', 'ops', 'content'], `متوسط التقييم ${nf(c.reviews.avg, 1)} — أقل من المعتاد.`]);
  if (c.money.pending > c.money.collected && c.money.pending > 0) out.push([['owner', 'finance'], 'العمولات اللي لسه ما اتحصّلتش أكتر من اللي اتحصّل.']);
  if (s.now.pendingProviders > 5) out.push([['owner', 'ops'], `فيه ${nf(s.now.pendingProviders)} فني مستني المراجعة.`]);
  if (s.errors.server > 0) out.push([['owner', 'tech'], 'فيه أخطاء من السيرفر الأسبوع ده — شوف قسم الأخطاء.']);
  const mine = out.filter(([teams]) => teams.includes(team)).map(([, t]) => t);
  return mine.length ? mine : ['مفيش حاجة غريبة الأسبوع ده.'];
}

function buildModel(stats, type, team) {
  const t = TEAMS.includes(team) ? team : 'ops';
  const sections = TEAM_SECTIONS[t].map((id) => SECTIONS[id](stats));
  return { type, team: t, teamLabel: TEAM_LABEL[t], label: stats.window.label, subject: `${type === 'weekly' ? 'ملخص هنصلحلك الأسبوعي' : 'ملخص هنصلحلك اليومي'} — ${stats.window.label}`,
    attention: attention(stats, t), notes: type === 'weekly' ? notes(stats, t) : null, sections };
}

/* ───────────── rendering ───────────── */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const INK = '#1F1B17', CREAM = '#F6F1EA', CARD = '#FFFDF9', ORANGE = '#B4511C', GREEN = '#2B6B40', RED = '#9C2A1F', MUTED = '#6B6158', LINE = '#E6DDCF';

function render(model) {
  const dcol = (d) => (d.good === true ? GREEN : d.good === false ? RED : MUTED);
  const rowHtml = (r) => `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};line-height:1.6">${esc(r.label)}${r.hint ? `<br><span style="font-size:12px;color:${MUTED}">${esc(r.hint)}</span>` : ''}</td>`
    + `<td style="padding:9px 12px;border-bottom:1px solid ${LINE};font-size:16px;font-weight:700;color:${INK};white-space:nowrap;text-align:left">${esc(r.value)}</td>`
    + `<td style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:12px;white-space:nowrap;text-align:left;color:${r.delta ? dcol(r.delta) : MUTED}">${r.delta ? esc(r.delta.text) : ''}</td></tr>`;
  const sec = (s) => `<tr><td style="padding:20px 24px 4px"><div style="font-size:15px;font-weight:700;color:${INK};border-right:4px solid ${ORANGE};padding-right:10px">${esc(s.title)}</div>`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:6px">${s.rows.map(rowHtml).join('')}</table></td></tr>`;
  const list = (title, items, color) => (items && items.length ? `<tr><td style="padding:18px 24px 0"><div style="background:${color === 'warn' ? '#FFF3D6' : '#EEF4EE'};border-radius:12px;padding:12px 16px"><div style="font-size:14px;font-weight:700;color:${INK};margin-bottom:6px">${esc(title)}</div>`
    + `${items.map((i) => `<div style="font-size:14px;color:${INK};line-height:1.8">• ${esc(i)}</div>`).join('')}</div></td></tr>` : '');
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(model.subject)}</title></head>`
    + `<body style="margin:0;padding:0;background:${CREAM};font-family:Tahoma,'Segoe UI','IBM Plex Sans Arabic',Arial,sans-serif">`
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(model.teamLabel)} — ${esc(model.label)}</div>`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${CREAM}"><tr><td align="center" style="padding:16px 8px">`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:${CARD};border-radius:18px;border:1px solid ${LINE}" dir="rtl">`
    + `<tr><td style="padding:22px 24px 8px"><img src="${LOGO}" alt="هنصلحلك" width="150" height="39" style="display:block;border:0;height:auto"></td></tr>`
    + `<tr><td style="padding:4px 24px 0"><h1 style="margin:0;font-size:21px;line-height:1.4;color:${INK}">${model.type === 'weekly' ? 'الملخص الأسبوعي' : 'الملخص اليومي'}</h1>`
    + `<div style="font-size:13px;color:${MUTED};margin-top:2px">${esc(model.label)} · ${esc(model.teamLabel)}</div></td></tr>`
    + list('يحتاج انتباهك', model.attention, 'warn') + list('ملاحظات', model.notes, 'note')
    + model.sections.map(sec).join('')
    + `<tr><td style="padding:22px 24px 24px;font-size:12px;color:${MUTED};line-height:1.8">الأرقام مجمّعة وما فيهاش بيانات عملاء. تقدر توقف الملخص ده من <a href="${ADMIN_URL}" style="color:${ORANGE}">إعدادات لوحة الإدارة › ملخصاتي</a>.</td></tr>`
    + `</table></td></tr></table></body></html>`;
  const text = [`${model.subject}`, model.teamLabel, '']
    .concat(model.attention.length ? ['يحتاج انتباهك:'].concat(model.attention.map((i) => `- ${i}`), ['']) : [])
    .concat(model.notes ? ['ملاحظات:'].concat(model.notes.map((i) => `- ${i}`), ['']) : [])
    .concat(...model.sections.map((s) => [`${s.title}:`].concat(s.rows.map((r) => `- ${r.label}: ${r.value}${r.delta ? ` (${r.delta.text})` : ''}${r.hint ? ` — ${r.hint}` : ''}`), [''])))
    .concat([`لإيقاف الملخص: ${ADMIN_URL}`]).join('\n');
  return { subject: model.subject, html, text };
}

module.exports = { TZ, TEAMS, TEAM_LABEL, TEAM_SECTIONS, WEEKDAY_AR, CAPS, teamOfRole, parts, dayStart, windowFor, collect, buildModel, render, delta, nf, esc };
