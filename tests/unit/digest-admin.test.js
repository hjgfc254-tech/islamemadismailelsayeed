'use strict';
/* Digest scheduling + admin routes (functions/src/digest-admin.js, wired in service.js) over an in-memory backend:
   hour / weekday rules, idempotency across instances, retries, stored-but-not-sent, permissions, unsubscribe, audit. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const DA = require(path.resolve(__dirname, '../../functions/src/digest-admin.js'));
const service = require(path.resolve(__dirname, '../../functions/src/service.js'));
const { memoryBackend } = require('../helpers/memory-backend.js');

const NOW = Date.UTC(2026, 10, 22, 7, 0);                 // Sunday 22 Nov 2026, 09:00 Cairo
const UNLOCK = { codeHash: 'x', unlockedUntil: 9e15 };

function world(extra = {}) {
  const b = memoryBackend({
    'admins/u_owner': { status: 'active', role: 'owner', name: 'المالك', email: 'owner@example.com', ...UNLOCK },
    'admins/u_sup': { status: 'active', role: 'support', name: 'دعم', email: 'support@example.com', ...UNLOCK },
    'admins/u_fin': { status: 'active', role: 'finance', name: 'مالية', email: 'fin@example.com', ...UNLOCK },
    'admins/u_off': { status: 'active', role: 'admin', name: 'مدير', email: 'mgr@example.com', ...UNLOCK },
    'admins/u_dis': { status: 'disabled', role: 'admin', name: 'معطّل', email: 'gone@example.com', ...UNLOCK },
    'admins/u_locked': { status: 'active', role: 'owner', name: 'مقفول', email: 'locked@example.com', codeHash: 'x', unlockedUntil: 0 },
    'digestPrefs/u_off': { off: true },
    ...extra
  });
  const sent = [];
  b.digestDeps = { mailer: { status: () => ({ transport: 'mock', configured: true, missing: [], from: 'd@x.co' }), isEmail: require('../../functions/src/mailer.js').isEmail, send: async (m) => { sent.push(m); return { ok: true, transport: 'mock', id: 'm' + sent.length }; } } };
  return { b, sent };
}
const turnOn = (b, cfg = {}) => b.setDoc('system/digest', { daily: { on: true, hour: 8 }, weekly: { on: true, weekday: 0, hour: 9 }, extraRecipients: [{ email: 'extra@example.com', team: 'ops' }], ...cfg }, false);

test('config: defaults are OFF, values are clamped / validated, extra recipients limited and normalised', () => {
  const d = DA.normalizeConfig(null);
  assert.deepEqual(d, { daily: { on: false, hour: 8 }, weekly: { on: false, weekday: 6, hour: 9 }, extraRecipients: [], timezone: 'Africa/Cairo' });
  assert.equal(DA.normalizeConfig({ daily: { on: true, hour: 99 } }).daily.hour, 23);
  const v = DA.validateConfig({ daily: { on: true, hour: 7 }, weekly: { weekday: 5 }, extraRecipients: ['A@B.co', { email: 'c@d.co', team: 'finance' }] }, d);
  assert.deepEqual(v.value.extraRecipients, [{ email: 'a@b.co', team: 'ops' }, { email: 'c@d.co', team: 'finance' }]); assert.equal(v.value.weekly.weekday, 5); assert.equal(v.value.daily.hour, 7);
  for (const bad of [{ daily: { hour: 24 } }, { daily: { on: 'yes' } }, { weekly: { weekday: 7 } }, { extraRecipients: ['nope'] }, { extraRecipients: [{ email: 'a@b.co', team: 'ceo' }] }, { extraRecipients: Array(11).fill('a@b.co') }, { daily: 5 }]) assert.ok(DA.validateConfig(bad, d).errors, JSON.stringify(bad));
});

test('tick: nothing before the configured hour or when off; sends once at / after it, per recipient team, skipping off / disabled admins', async () => {
  const { b, sent } = world();
  assert.deepEqual(await DA.tick(b, NOW, b.digestDeps), {}, 'default OFF');
  await turnOn(b);
  assert.deepEqual(await DA.tick(b, Date.UTC(2026, 10, 22, 5, 0), b.digestDeps), {}, '07:00 Cairo is before hour 8 (daily) and 9 (weekly)');
  const r = await DA.tick(b, NOW, b.digestDeps);
  assert.equal(r.daily.status, 'sent'); assert.equal(r.weekly.status, 'sent');
  const daily = sent.filter((m) => /اليومي/.test(m.subject)), weekly = sent.filter((m) => /الأسبوعي/.test(m.subject));
  assert.deepEqual(daily.map((m) => m.to).sort(), ['extra@example.com', 'fin@example.com', 'locked@example.com', 'owner@example.com', 'support@example.com'], 'active, opted-in admins + extras (a digest needs no code unlock); the opted-out and the disabled admin get nothing');
  assert.equal(weekly.length, 5);
  const byTo = (to) => daily.find((m) => m.to === to);
  assert.match(byTo('fin@example.com').html, /الفلوس/); assert.ok(!/الشكاوى/.test(byTo('fin@example.com').html));
  assert.match(byTo('support@example.com').html, /الشكاوى/); assert.ok(!/الفلوس/.test(byTo('support@example.com').html));
  assert.match(byTo('owner@example.com').html, /الفلوس/); assert.match(byTo('owner@example.com').html, /النظام/);
  const st = await b.getDoc('system/digestState');
  assert.equal(st.daily.key, '2026-11-22'); assert.equal(st.daily.sent, 5); assert.equal(st.daily.failed, 0);
  assert.ok(await b.getDoc('digests/daily_2026-11-22') && await b.getDoc('digests/weekly_2026-11-22'), 'rendered digests are stored');
});

test('tick: weekly only on its weekday; idempotent for the same Cairo day, also with two instances at once', async () => {
  const { b, sent } = world(); await turnOn(b, { weekly: { on: true, weekday: 1, hour: 9 } });
  const r = await DA.tick(b, NOW, b.digestDeps);                    // Sunday: weekly is configured for Monday
  assert.ok(r.daily && !r.weekly);
  const n = sent.length;
  assert.equal((await DA.tick(b, NOW + 3600000, b.digestDeps)).daily.status, 'skipped'); assert.equal(sent.length, n, 'next hour, same day: nothing');
  const { b: b2, sent: sent2 } = world(); await turnOn(b2, { weekly: { on: false, weekday: 0, hour: 9 } });
  const two = await Promise.all([DA.tick(b2, NOW, b2.digestDeps), DA.tick(b2, NOW, b2.digestDeps)]);
  assert.deepEqual(two.map((x) => x.daily.status).sort(), ['sent', 'skipped'], 'exactly one instance sends');
  assert.equal(sent2.length, 5);
  assert.equal((await DA.tick(b2, NOW + 86400000, b2.digestDeps)).daily.status, 'sent', 'the next Cairo day sends again');
});

test('tick: failures are recorded, retried at most 3 times, partial success is reported', async () => {
  const { b, sent } = world(); await turnOn(b, { weekly: { on: false, weekday: 0, hour: 9 } });
  let fail = true;
  b.digestDeps.mailer.send = async (m) => { if (fail) { const e = new Error('Resend 500'); e.code = 'send-failed'; throw e; } sent.push(m); return { ok: true }; };
  let r = await DA.tick(b, NOW, b.digestDeps); assert.equal(r.daily.status, 'failed'); assert.equal(r.daily.attempts, 1); assert.match(r.daily.error, /Resend 500/);
  fail = false;
  r = await DA.tick(b, NOW + 3600000, b.digestDeps); assert.equal(r.daily.status, 'sent'); assert.equal(r.daily.attempts, 2, 'a failed run is retried in the next hour');
  const { b: b3 } = world(); await turnOn(b3, { weekly: { on: false, weekday: 0, hour: 9 } });
  b3.digestDeps.mailer.send = async () => { const e = new Error('down'); throw e; };
  for (let i = 0; i < 3; i++) assert.equal((await DA.tick(b3, NOW + i * 3600000, b3.digestDeps)).daily.status, 'failed');
  assert.equal((await DA.tick(b3, NOW + 3 * 3600000, b3.digestDeps)).daily.status, 'skipped', 'gives up after 3 attempts');
  const { b: b4 } = world(); await turnOn(b4, { weekly: { on: false, weekday: 0, hour: 9 } });
  let k = 0; b4.digestDeps.mailer.send = async () => { if (k++ === 0) throw new Error('one bad address'); return { ok: true }; };
  const p = await DA.tick(b4, NOW, b4.digestDeps); assert.equal(p.daily.status, 'partial'); assert.equal(p.daily.sent, 4); assert.equal(p.daily.failed, 1);
});

test('tick without a transport: digests are generated and stored, nothing is sent, the state says what is missing', async () => {
  const { b } = world(); await turnOn(b, { weekly: { on: false, weekday: 0, hour: 9 } });
  let calls = 0; b.digestDeps.mailer = { status: () => ({ transport: null, configured: false, missing: ['RESEND_API_KEY + MAIL_FROM'] }), isEmail: () => true, send: async () => { calls++; } };
  const r = await DA.tick(b, NOW, b.digestDeps);
  assert.equal(r.daily.status, 'stored'); assert.equal(calls, 0); assert.match(r.daily.error, /RESEND_API_KEY/);
  const doc = await b.getDoc('digests/daily_2026-11-22'); assert.ok(doc.teams.owner.html.includes('<html') && doc.teams.finance && doc.expiresAt);
});

const call = (b, uid, method, p, body, query) => service.api(b, { auth: { uid, token: { email: uid + '@example.com', email_verified: true } }, data: { app: 'admin', method, path: p, query: query || {}, body: body || {} } });
const as = (b) => ({ get: (u, p, q) => call(b, u, 'GET', p, null, q), post: (u, p, body) => call(b, u, 'POST', p, body) });

test('routes: config is owner-only, validated, persisted, audited; transport status lists missing variables', async () => {
  const { b } = world(); const api = as(b);
  assert.equal((await api.get('u_sup', '/admin/digest/config')).status, 403);
  assert.equal((await api.post('u_sup', '/admin/digest/config', { daily: { on: true } })).status, 403);
  assert.equal((await api.get('u_locked', '/admin/digest/config')).status, 403, 'a locked admin cannot use any digest route');
  b.digestDeps.mailer.status = () => ({ transport: null, configured: false, missing: ['MAIL_FROM'] });
  const g = await api.get('u_owner', '/admin/digest/config');
  assert.equal(g.ok, true); assert.equal(g.data.config.daily.on, false); assert.deepEqual(g.data.transport.missing, ['MAIL_FROM']);
  assert.ok(g.data.recipients.some((r) => r.email.includes('•') && !r.email.includes('owner@')), 'e-mails are masked');
  assert.equal((await api.post('u_owner', '/admin/digest/config', { daily: { hour: 30 } })).status, 422);
  const p = await api.post('u_owner', '/admin/digest/config', { daily: { on: true, hour: 7 }, extraRecipients: ['boss@example.com'] });
  assert.equal(p.ok, true); assert.equal(p.data.config.daily.hour, 7);
  assert.equal((await b.getDoc('system/digest')).daily.on, true);
  assert.ok([...b.docs.values()].some((d) => d.path === '/admin/digest/config' && d.method === 'POST'), 'the change is in the audit log');
});

test('routes: preview — owner sees any team, others only their own, content has no personal data', async () => {
  const { b } = world({ 'customers/c1': { name: 'سارة', phone: '01011112222' }, 'requests/r1': { createdAt: '2026-11-21T09:00:00.000Z', status: 'completed', cat: 'electric', phone: '01011112222' } });
  const api = as(b);
  const own = await api.get('u_sup', '/admin/digest/preview', { type: 'daily' });
  assert.equal(own.ok, true); assert.equal(own.data.team, 'ops'); assert.match(own.data.html, /الشكاوى/); assert.ok(!own.data.html.includes('01011112222'));
  assert.equal((await api.get('u_sup', '/admin/digest/preview', { type: 'daily', team: 'finance' })).status, 403);
  assert.equal((await api.get('u_sup', '/admin/digest/preview', { type: 'daily', team: 'owner' })).status, 403);
  const fin = await api.get('u_owner', '/admin/digest/preview', { type: 'weekly', team: 'finance' });
  assert.equal(fin.ok, true); assert.match(fin.data.subject, /الأسبوعي/); assert.match(fin.data.html, /الفلوس/);
  assert.equal((await api.get('u_fin', '/admin/digest/preview', { type: 'daily' })).data.team, 'finance');
});

test('routes: «ابعت تجربة» sends to the caller’s own e-mail once a minute; missing transport is explained, not an error', async () => {
  const { b, sent } = world(); const api = as(b);
  const t1 = await api.post('u_sup', '/admin/digest/test', { type: 'daily' });
  assert.equal(t1.ok, true); assert.equal(t1.data.sent, true); assert.match(t1.data.to, /^s•+@example\.com$/);
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'support@example.com'); assert.match(sent[0].subject, /^\[تجربة\]/);
  assert.equal((await api.post('u_sup', '/admin/digest/test', {})).status, 429, 'throttled for a minute');
  assert.equal((await api.post('u_sup', '/admin/digest/test', { team: 'finance' })).status, 403);
  b.digestDeps.mailer.status = () => ({ transport: null, configured: false, missing: ['RESEND_API_KEY + MAIL_FROM'] });
  const miss = await api.post('u_fin', '/admin/digest/test', {});
  assert.equal(miss.ok, true); assert.equal(miss.data.sent, false); assert.equal(miss.data.reason, 'transport-missing'); assert.deepEqual(miss.data.missing, ['RESEND_API_KEY + MAIL_FROM']);
  b.digestDeps.mailer.status = () => ({ transport: 'mock', configured: true, missing: [] }); b.digestDeps.mailer.send = async () => { throw new Error('SMTP: auth failed'); };
  const bad = await api.post('u_owner', '/admin/digest/test', {});
  assert.equal(bad.status, 502); assert.match(bad.error.message, /auth failed/);
});

test('routes: each admin can stop and resume their own digest; the scheduler honours it', async () => {
  const { b, sent } = world(); await turnOn(b, { weekly: { on: false, weekday: 0, hour: 9 }, extraRecipients: [] }); const api = as(b);
  assert.equal((await api.get('u_sup', '/admin/digest/me')).data.off, false);
  assert.equal((await api.post('u_sup', '/admin/digest/me', { off: 'yes' })).status, 422);
  assert.equal((await api.post('u_sup', '/admin/digest/me', { off: true })).data.off, true);
  assert.equal((await api.get('u_sup', '/admin/digest/me')).data.off, true);
  await DA.tick(b, NOW, b.digestDeps);
  assert.ok(!sent.some((m) => m.to === 'support@example.com'), 'switched off: no digest');
  await api.post('u_sup', '/admin/digest/me', { off: false });
  const { b: b2, sent: s2 } = world(); await turnOn(b2, { weekly: { on: false, weekday: 0, hour: 9 }, extraRecipients: [] }); await b2.setDoc('digestPrefs/u_sup', { off: false }, true);
  await DA.tick(b2, NOW, b2.digestDeps); assert.ok(s2.some((m) => m.to === 'support@example.com'));
});

test('wiring: digestClock exists in functions/index.js, hourly in Cairo time; service routes require an unlocked admin', () => {
  const idx = require('node:fs').readFileSync(path.resolve(__dirname, '../../functions/index.js'), 'utf8');
  assert.match(idx, /exports\.digestClock = onSchedule\(\{ schedule: '5 \* \* \* \*', timeZone: 'Africa\/Cairo'/);
  assert.match(idx, /digestAdmin\.tick\(backend\)/);
});
