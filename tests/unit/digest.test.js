'use strict';
/* Digest model + renderer (functions/src/digest.js): Cairo windows, aggregates from fixtures, team sections,
   Arabic numerals, weekly notes, HTML escaping and — most important — no personal data. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const D = require(path.resolve(__dirname, '../../functions/src/digest.js'));
const { memoryBackend } = require('../helpers/memory-backend.js');

const NOW = Date.UTC(2026, 10, 22, 7, 0);                 // 22 Nov 2026 09:00 Cairo (UTC+2)
const at = (dayUtcMs, hhmm = '09:00') => new Date(dayUtcMs + (+hhmm.slice(0, 2)) * 3600000 + (+hhmm.slice(3)) * 60000).toISOString();
const D21 = Date.UTC(2026, 10, 21), D20 = Date.UTC(2026, 10, 20);   // yesterday / the day before (UTC midnights, inside the Cairo days)

function fixtures() {
  const seed = {
    'system/settings': { controls: { pauseOrders: { on: true } } },
    /* personal data that must never reach a digest */
    'customers/c1': { name: 'سارة محمد', phone: '01011112222', email: 'sara@example.com', addr: 'شارع النصر 12' },
    'providers/p1': { name: 'كريم فتحي', phone: '01099998888', status: 'approved', createdAt: at(D21, '10:00') },
    'providers/p2': { name: 'مروان', phone: '01055556666', status: 'pending', createdAt: at(D20 - 40 * 86400000, '10:00') },
    'providers/p3': { name: 'علي', phone: '01077778888', status: 'pending', createdAt: at(D20 - 50 * 86400000, '10:00') }
  };
  const req = (id, day, hhmm, status, cat, extra = {}) => { seed[`requests/${id}`] = { id, no: 'HS-' + id, customerId: 'c1', phone: '01011112222', addr: 'شارع النصر 12', createdAt: at(day, hhmm), status, cat, ...extra }; };
  req('r1', D21, '08:00', 'completed', 'electric', { bidding: true });
  req('r2', D21, '09:00', 'completed', 'electric', { bidding: true });
  req('r3', D21, '10:00', 'closed', 'plumbing', { bidding: true });
  req('r4', D21, '11:00', 'cancelled', 'plumbing');
  req('r5', D21, '12:00', 'searching', 'painting');
  req('r6', D21, '13:00', 'accepted', 'electric', { log: [{ status: 'accepted', at: at(D21, '13:20') }] });
  req('q1', D20, '09:00', 'completed', 'electric'); req('q2', D20, '10:00', 'completed', 'plumbing'); req('q3', D20, '11:00', 'cancelled', 'plumbing'); req('q4', D20, '12:00', 'completed', 'painting');
  const as = (id, reqId, offerAt) => { seed[`assignments/${id}`] = { id, reqId, providerId: 'p1', status: 'offered', ...(offerAt ? { offer: { at: offerAt, total: 300 } } : {}) }; };
  as('a1', 'r1', at(D21, '08:10')); as('a2', 'r1', at(D21, '08:30')); as('a3', 'r2', at(D21, '09:20'));   // r3: no offers
  const tx = (id, day, value, commission, collection, extra = {}) => { seed[`transactions/${id}`] = { id, reqId: 'r1', providerId: 'p1', customerId: 'c1', at: at(day, '15:00'), value, commission, collection, ...extra }; };
  tx('t1', D21, 300, 45, 'collected'); tx('t2', D21, 200, 30, 'pending'); tx('t3', D21, 0, 0, 'none', { free: true }); tx('t4', D20, 100, 15, 'collected');
  seed['complaints/k1'] = { id: 'k1', by: 'customer:c1', text: 'الفني اتأخر وكلمني على 01011112222', status: 'open', at: at(D21, '12:00') };
  seed['complaints/k2'] = { id: 'k2', status: 'resolved', at: at(D21, '13:00') };
  seed['reviews/v1'] = { id: 'v1', stars: 5, comment: 'ممتاز جدا', at: at(D21, '14:00') };
  seed['reviews/v2'] = { id: 'v2', stars: 4, at: at(D21, '14:30') };
  seed['reviews/v3'] = { id: 'v3', stars: 1, hidden: true, at: at(D21, '14:40') };
  seed['clientErrors/e1'] = { app: 'customer', msg: '<b>خطأ في الشاشة</b>', count: 7, last: at(D21, '16:00') };
  seed['clientErrors/e2'] = { app: 'server', msg: 'مشكلة في قاعدة البيانات', count: 2, last: at(D21, '17:00') };
  seed['clientErrors/e3'] = { app: 'provider', msg: 'قديم', count: 99, last: at(D20 - 20 * 86400000, '17:00') };
  for (let i = 0; i < 4; i++) seed[`audit/u${i}`] = { at: at(D21, '03:0' + i), action: 'admin.code.unlock', status: 'failed' };
  seed['audit/u9'] = { at: at(D21, '03:09'), action: 'admin.code.unlock', status: 'ok' };
  return memoryBackend(seed);
}

test('Cairo windows: yesterday / last 7 days, winter (UTC+2) and summer (UTC+3), previous period alongside', () => {
  const w = D.windowFor('daily', NOW);
  assert.equal(new Date(w.cur.start).toISOString(), '2026-11-20T22:00:00.000Z'); assert.equal(new Date(w.cur.end).toISOString(), '2026-11-21T22:00:00.000Z');
  assert.equal(w.prev.end, w.cur.start); assert.equal(w.cur.end - w.cur.start, 86400000); assert.equal(w.key, '2026-11-22'); assert.equal(w.sendHour, 9);
  const s = D.windowFor('daily', Date.UTC(2026, 6, 15, 7, 0));
  assert.equal(new Date(s.cur.start).toISOString(), '2026-07-13T21:00:00.000Z'); assert.equal(s.sendHour, 10);
  const wk = D.windowFor('weekly', NOW);
  assert.equal(wk.cur.end - wk.cur.start, 7 * 86400000); assert.equal(wk.prev.end, wk.cur.start); assert.equal(wk.weekday, 0);   // Sunday
  assert.match(wk.label, /^من .+ إلى .+$/);
});

test('collect: aggregates only — counts, money, rates, offers, top categories, errors, wrong codes, switches', async () => {
  const s = await D.collect(fixtures(), D.windowFor('daily', NOW), NOW);
  assert.equal(s.cur.requests.total, 6); assert.equal(s.cur.requests.completed, 3); assert.equal(s.cur.requests.cancelled, 1);
  assert.deepEqual(s.cur.requests.byCat, { electric: 3, plumbing: 2, painting: 1 });
  assert.equal(s.prev.requests.total, 4);
  assert.deepEqual(s.cur.money, { services: 2, value: 500, commission: 75, pending: 30, collected: 45, capped: false });
  assert.deepEqual(s.cur.complaints, { opened: 2, resolved: 1 }); assert.equal(s.now.openComplaints, 1);
  assert.equal(s.cur.reviews.count, 2); assert.equal(s.cur.reviews.avg, 4.5, 'hidden reviews are excluded');
  assert.equal(s.cur.providersNew, 1); assert.equal(s.now.pendingProviders, 2);
  assert.equal(s.now.unassigned.count, 1); assert.ok(s.now.unassigned.oldestMin > 30);
  const o = s.cur.requests.offers; assert.equal(o.biddingRequests, 3); assert.equal(o.perRequest, 1); assert.equal(Math.round(o.firstOfferMin), 15);   // r1: 10 min, r2: 20 min
  assert.equal(Math.round(o.acceptMin), 20);
  assert.equal(s.errors.groups, 2); assert.equal(s.errors.occurrences, 9); assert.equal(s.errors.server, 1); assert.equal(s.errors.top[0].count, 7);
  assert.equal(s.security.wrongCodes, 4); assert.deepEqual(s.now.controls, { maintenance: false, pauseOrders: true, pauseSignups: false });
  assert.equal(s.alerts, null, 'the optional alerts engine is not required');
});

test('render: team sections, Arabic numerals, brand RTL layout, plain-text twin', async () => {
  const stats = await D.collect(fixtures(), D.windowFor('daily', NOW), NOW);
  const titles = (team) => D.buildModel(stats, 'daily', team).sections.map((s) => s.title);
  assert.deepEqual(titles('owner'), ['الخلاصة', 'العمليات', 'الفلوس', 'الشكاوى', 'مقدمو الخدمة', 'الجودة', 'أكتر الأقسام طلبًا', 'العروض', 'النظام', 'الأخطاء']);
  assert.deepEqual(titles('ops'), ['الخلاصة', 'العمليات', 'الشكاوى', 'مقدمو الخدمة', 'الجودة']);
  assert.deepEqual(titles('finance'), ['الفلوس']);
  assert.deepEqual(titles('content'), ['أكتر الأقسام طلبًا', 'العروض', 'الجودة']);
  assert.deepEqual(titles('tech'), ['النظام', 'الأخطاء']);
  const m = D.render(D.buildModel(stats, 'daily', 'owner'));
  assert.match(m.subject, /^ملخص هنصلحلك اليومي — /);
  assert.match(m.html, /<html lang="ar" dir="rtl">/); assert.match(m.html, /logo-v10-lockup\.webp/); assert.match(m.html, /#B4511C/);
  const visible = m.html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  assert.ok(!/[٠-٩]/.test(visible), 'every visible number is written with Latin digits (one style across the platform): ' + (visible.match(/.{0,12}[٠-٩].{0,12}/) || [''])[0]);
  assert.ok(!/[٠-٩]/.test(m.subject));
  assert.match(m.text, /الفلوس:/); assert.match(m.text, /- طلبات جديدة: 6/);
  const fin = D.render(D.buildModel(stats, 'daily', 'finance'));
  assert.ok(!/الشكاوى|مقدمو الخدمة|العمليات/.test(fin.html), 'finance does not receive operations sections');
  const tech = D.render(D.buildModel(stats, 'daily', 'tech'));
  assert.ok(!/الفلوس|قيمة الخدمات/.test(tech.html), 'tech does not receive money');
});

test('privacy: no customer / provider name, phone, e-mail or address can appear in any team’s digest', async () => {
  const stats = await D.collect(fixtures(), D.windowFor('weekly', NOW), NOW);
  const blob = JSON.stringify(stats);
  for (const secret of ['سارة', 'كريم', 'مروان', '01011112222', '01099998888', '01055556666', 'sara@example.com', 'النصر', 'اتأخر']) assert.ok(!blob.includes(secret), 'stats leaked ' + secret);
  for (const team of D.TEAMS) for (const type of ['daily', 'weekly']) {
    const r = D.render(D.buildModel(stats, type, team));
    for (const secret of ['سارة', 'كريم', 'مروان', '0101', '0109', '0105', 'example.com', 'النصر']) assert.ok(!r.html.includes(secret) && !r.text.includes(secret), `${team}/${type} leaked ${secret}`);
  }
});

test('render escapes text that came from error reports', async () => {
  const stats = await D.collect(fixtures(), D.windowFor('daily', NOW), NOW);
  const html = D.render(D.buildModel(stats, 'daily', 'tech')).html;
  assert.ok(html.includes('&lt;b&gt;خطأ في الشاشة&lt;/b&gt;') && !html.includes('<b>خطأ في الشاشة'));
});

const zero = () => ({ requests: { total: 0, completed: 0, cancelled: 0, byCat: {}, offers: null }, money: { services: 0, value: 0, commission: 0, pending: 0, collected: 0 }, complaints: { opened: 0, resolved: 0 }, reviews: { count: 0, avg: null }, providersNew: 0 });
function stats(cur, prev, now = {}) {
  const c = Object.assign(zero(), cur), p = Object.assign(zero(), prev);
  return { window: D.windowFor('weekly', NOW), nowMs: NOW, cur: c, prev: p, now: Object.assign({ pendingProviders: 0, openComplaints: 0, unassigned: { count: 0, oldestMin: null }, controls: {} }, now), errors: { groups: 0, occurrences: 0, server: 0, top: [] }, security: { wrongCodes: 0, lockouts: 0 }, alerts: null };
}

test('weekly «ملاحظات»: rules over week-over-week numbers, filtered by team, daily has none', () => {
  const s = stats({ requests: { total: 40, completed: 20, cancelled: 12, byCat: {}, offers: null }, complaints: { opened: 6, resolved: 2 }, money: { services: 20, value: 9000, commission: 1350, pending: 900, collected: 450 } },
    { requests: { total: 40, completed: 32, cancelled: 5, byCat: {}, offers: null }, complaints: { opened: 3, resolved: 3 } }, { pendingProviders: 8 });
  const ops = D.buildModel(s, 'weekly', 'ops').notes.join('\n');
  assert.match(ops, /الإلغاءات زادت 140٪/); assert.match(ops, /نسبة الإنجاز نزلت من 80٪ لـ 50٪/); assert.match(ops, /الشكاوى زادت 100٪/); assert.match(ops, /8 فني مستني المراجعة/);
  assert.ok(!/العمولات/.test(ops));
  assert.match(D.buildModel(s, 'weekly', 'finance').notes.join('\n'), /العمولات اللي لسه ما اتحصّلتش أكتر/);
  assert.deepEqual(D.buildModel(stats(zero(), zero()), 'weekly', 'owner').notes, ['مفيش حاجة غريبة الأسبوع ده.']);
  assert.equal(D.buildModel(s, 'daily', 'ops').notes, null);
  assert.match(D.render(D.buildModel(s, 'weekly', 'ops')).html, /ملاحظات/);
});

test('deltas: better / worse colouring, missing previous period, teamOfRole mapping', () => {
  assert.deepEqual(D.delta(12, 10), { text: '▲ 20٪', cls: 'up', good: true, pct: 20 });
  assert.equal(D.delta(12, 10, false).good, false); assert.equal(D.delta(5, 0), null); assert.equal(D.delta(10, 10).cls, 'flat');
  assert.deepEqual(['owner', 'admin', 'support', 'finance', 'moderator', 'tech', 'custom'].map(D.teamOfRole), ['owner', 'ops', 'ops', 'finance', 'content', 'tech', 'ops']);
});

test('the optional alerts engine is used when one is supplied and never required', async () => {
  const none = await D.collect(fixtures(), D.windowFor('daily', NOW), NOW, { alerts: {} });
  assert.equal(none.alerts, null);
  const s = await D.collect(fixtures(), D.windowFor('daily', NOW), NOW, { alerts: { openCounts: async () => ({ open: 3, critical: 1 }) } });
  assert.deepEqual(s.alerts, { open: 3, critical: 1 });
  assert.match(D.render(D.buildModel(s, 'daily', 'tech')).html, /بلاغات مفتوحة/);
  const broken = await D.collect(fixtures(), D.windowFor('daily', NOW), NOW, { alerts: { openCounts: async () => { throw new Error('boom'); } } });
  assert.equal(broken.alerts, null, 'a failing alerts engine never breaks the digest');
});
