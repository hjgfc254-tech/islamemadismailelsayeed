'use strict';
/* Tech Center («مركز التقنية»): the status route (owner / tech only, system information with NO personal data), error
   triage, usage counters / percentiles / cost, thresholds + de-duplicated alerts, and the scheduled health probe. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const service = require(path.join(ROOT, 'functions/src/service.js'));
const tech = require(path.join(ROOT, 'functions/src/tech-status.js'));
const usage = require(path.join(ROOT, 'functions/src/usage.js'));
const telemetry = require(path.join(ROOT, 'functions/src/telemetry.js'));
const adapterMod = require(path.join(ROOT, 'functions/src/alerts-adapter.js'));

function memBackend(extra = {}) {
  const docs = new Map(); let auto = 0; const clone = (v) => JSON.parse(JSON.stringify(v));
  const rows = (col) => [...docs].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2).map(([p, d]) => ({ id: p.split('/')[1], data: clone(d) }));
  const match = (r, [f, op, v]) => { const x = f === 'id' ? r.id : r.data[f]; return op === '==' ? x === v : op === 'in' ? v.includes(x) : false; };
  const adapter = {
    async get(tx, p) { return docs.has(p) ? clone(docs.get(p)) : null; },
    async query(tx, col, q) { let out = rows(col).filter((r) => (q.where || []).every((w) => match(r, w))); if (q.orderBy) { const [f, dir] = q.orderBy, s = dir === 'desc' ? -1 : 1; out = out.filter((r) => r.data[f] !== undefined).sort((a, b) => (a.data[f] < b.data[f] ? -s : s)); } if (q.limit) out = out.slice(0, q.limit); return out; },
    async count() { return 0; }, set(tx, p, d) { docs.set(p, clone(d)); }, del(tx, p) { docs.delete(p); }
  };
  return { docs, adapter, runTransaction: (fn) => fn({}), async getDoc(p) { return adapter.get(null, p); },
    async setDoc(p, d, merge) { docs.set(p, merge && docs.has(p) ? { ...docs.get(p), ...clone(d) } : clone(d)); },
    async addDoc(col, d) { docs.set(`${col}/auto${++auto}`, clone(d)); }, async deleteDoc(p) { docs.delete(p); },
    async queryDocs(col, field, op, value) { return rows(col).filter((x) => (op === 'in' ? value.includes(x.data[field]) : x.data[field] === value)); },
    async signal() {}, env: { bootstrapEmails: [] }, ...extra };
}
const unlocked = { status: 'active', codeHash: 'x', unlockedUntil: 9e15 };
const authOf = (uid) => ({ uid, token: { email: uid + '@example.com', email_verified: true } });
const call = (b, uid, method, p, body) => service.api(b, { auth: uid ? authOf(uid) : null, data: { app: 'admin', method, path: p, body } });
function setup(extra) {
  const b = memBackend(extra);
  b.docs.set('admins/u_owner', { ...unlocked, role: 'owner' });
  b.docs.set('admins/u_tech', { ...unlocked, role: 'tech' });
  b.docs.set('admins/u_sup', { ...unlocked, role: 'support' });
  b.docs.set('admins/u_locked', { status: 'active', role: 'owner', codeHash: 'x', unlockedUntil: 0 });
  usage._reset(); tech._resetCache(); tech._resetCooldown();
  return b;
}
const PII = [/[\w.+-]+@[\w-]+\.[\w.-]+/, /\+?\d{8,}/, /[٠-٩]{7,}/, /HS-\d{4}-\d+/i, /\b[a-z]_[a-z0-9]{6,}\b/i, /u_victim|uid1|victim/i];
const BAD_KEYS = /^(users|ua|phone|email|addr|address|customerId|providerId|uid|name|customer|provider|chat|desc|geo|lat|lng)$/i;
function scan(v, where = '$') {
  if (Array.isArray(v)) return v.forEach((x, i) => scan(x, where + '[' + i + ']'));
  if (v && typeof v === 'object') return Object.entries(v).forEach(([k, x]) => { assert.ok(!BAD_KEYS.test(k), `personal-data key «${k}» at ${where}`); scan(x, where + '.' + k); });
  if (typeof v === 'string') for (const re of PII) assert.ok(!re.test(v), `personal data ${re} in «${v.slice(0, 80)}» at ${where}`);
}
const DIRTY = { app: 'customer', kind: 'error', msg: 'Failed for ali@mail.com phone 01012345678 order HS-2026-1001 record r_abc123xyz', src: '/apps/customer/app.js:120:7', stack: 'at x (/apps/customer/app.js:120:7)\n at y r_abc123xyz', route: '#/track/r_abc123xyz', ua: 'Chrome 130', build: 'v1' };
async function seedErrors(b) { await telemetry.report(b, 'customer', { reports: [DIRTY] }, 'u_victim'); await telemetry.report(b, 'customer', { reports: [DIRTY] }, 'uid1'); }

test('status route: owner and tech allowed; support, signed-out and a locked admin refused', async () => {
  const b = setup();
  assert.equal((await call(b, 'u_owner', 'GET', '/admin/tech/status')).ok, true);
  assert.equal((await call(b, 'u_tech', 'GET', '/admin/tech/status')).ok, true);
  assert.equal((await call(b, 'u_sup', 'GET', '/admin/tech/status')).status, 403);
  assert.equal((await call(b, null, 'GET', '/admin/tech/status')).status, 401);
  assert.equal((await call(b, 'u_locked', 'GET', '/admin/tech/status')).ok, false, 'the 8-digit code gate still applies');
});

test('status response carries NO personal data — scanned recursively (keys and values), even for dirty error reports', async () => {
  const b = setup(); await seedErrors(b);
  b.docs.set('customers/c1', { name: 'Ali', phone: '01012345678', email: 'ali@mail.com' });          // data that exists but must never appear
  const r = await call(b, 'u_owner', 'GET', '/admin/tech/status');
  assert.equal(r.ok, true, JSON.stringify(r.error));
  scan(r.data);
  const g = r.data.errors.groups[0];
  assert.equal(g.count, 2); assert.equal(g.userCount, 2);
  assert.match(g.msg, /<email>/); assert.ok(!/HS-\d/.test(g.msg), 'order number masked'); assert.match(g.msg, /<id>/);
  assert.equal(g.route, '#/track/:id');
  assert.ok(!('users' in g) && !('ua' in g));
  assert.deepEqual(Object.keys(r.data).sort(), ['clocks', 'cost', 'deploy', 'errors', 'generatedAt', 'health', 'limits', 'performance', 'performanceScope', 'runtime', 'thresholds', 'usage']);
});

test('health: Firestore probe is measured; RTDB / Auth are «unknown» without probes and «down» when they throw; the stored result is reused for 5 minutes', async () => {
  const b = setup();
  const h = await tech.runHealth(b);
  assert.equal(h.areas.firestore.state, 'ok'); assert.equal(typeof h.areas.firestore.ms, 'number'); assert.equal(h.areas.rtdb.state, 'unknown');
  const b2 = setup({ ping: async (k) => { if (k === 'rtdb') throw new Error('rtdb unreachable for user ali@mail.com'); } });
  const h2 = await tech.runHealth(b2);
  assert.equal(h2.areas.rtdb.state, 'down'); assert.equal(h2.areas.auth.state, 'ok'); assert.equal(h2.overall, 'down');
  assert.ok(!/ali@mail\.com/.test(h2.areas.rtdb.error));
  const first = await call(b2, 'u_owner', 'GET', '/admin/tech/status');
  const second = await call(b2, 'u_owner', 'GET', '/admin/tech/status');
  assert.equal(first.data.health.source, 'live'); assert.equal(second.data.health.source, 'stored');
});

test('check now has a 10 s cooldown', async () => {
  const b = setup();
  assert.equal((await call(b, 'u_tech', 'POST', '/admin/tech/check', {})).ok, true);
  assert.equal((await call(b, 'u_tech', 'POST', '/admin/tech/check', {})).status, 429);
});

test('error triage: resolve / ignore / reopen, audited; a resolved error that happens again re-opens, an ignored one stays ignored', async () => {
  const b = setup(); await seedErrors(b);
  const id = [...b.docs.keys()].find((k) => k.startsWith('clientErrors/')).split('/')[1];
  assert.equal((await call(b, 'u_sup', 'POST', '/admin/tech/errors/' + id, { status: 'resolved' })).status, 403);
  assert.equal((await call(b, 'u_tech', 'POST', '/admin/tech/errors/' + id, { status: 'nonsense' })).status, 422);
  assert.equal((await call(b, 'u_tech', 'POST', '/admin/tech/errors/nope', { status: 'resolved' })).status, 404);
  assert.equal((await call(b, 'u_tech', 'POST', '/admin/tech/errors/' + id, { status: 'resolved' })).ok, true);
  let s = (await call(b, 'u_tech', 'GET', '/admin/tech/status')).data;
  assert.equal(s.errors.counts.resolved, 1); assert.equal(s.errors.counts.open, 0);
  await telemetry.report(b, 'customer', { reports: [DIRTY] }, null);
  s = (await call(b, 'u_tech', 'GET', '/admin/tech/status')).data;
  assert.equal(s.errors.groups[0].status, 'open'); assert.equal(s.errors.groups[0].reopened, true);
  await call(b, 'u_tech', 'POST', '/admin/tech/errors/' + id, { status: 'ignored' });
  await telemetry.report(b, 'customer', { reports: [DIRTY] }, null);
  s = (await call(b, 'u_tech', 'GET', '/admin/tech/status')).data;
  assert.equal(s.errors.groups[0].status, 'ignored');
  assert.ok([...b.docs.values()].some((d) => d.path && d.path.startsWith('/admin/tech/errors/')), 'triage is audited');
});

test('budget config: owner only, validated, drives the cost level', async () => {
  const b = setup();
  assert.equal((await call(b, 'u_tech', 'POST', '/admin/tech/config', { budgetEGP: 500, usdToEgp: 50 })).status, 403);
  assert.equal((await call(b, 'u_owner', 'POST', '/admin/tech/config', { budgetEGP: -1, usdToEgp: 50 })).status, 422);
  assert.equal((await call(b, 'u_owner', 'POST', '/admin/tech/config', { budgetEGP: 500, usdToEgp: 0 })).status, 422);
  assert.equal((await call(b, 'u_owner', 'POST', '/admin/tech/config', { budgetEGP: 500, usdToEgp: 49.5 })).ok, true);
  const s = (await call(b, 'u_owner', 'GET', '/admin/tech/status')).data;
  assert.equal(s.cost.budgetEGP, 500); assert.equal(s.cost.usdToEgp, 49.5);
});

test('usage counters: calls, errors, rate limits, latency buckets and percentiles; flushed at most once a minute', async () => {
  usage._reset();
  const t = Date.now();
  for (let i = 0; i < 90; i++) usage.record({ kind: 'api', path: '/requests', ms: 40, status: 200 }, t);
  for (let i = 0; i < 9; i++) usage.record({ kind: 'api', path: '/requests', ms: 700, status: 200 }, t);
  usage.record({ kind: 'api', path: '/requests', ms: 5000, status: 500 }, t);
  usage.record({ kind: 'session', ms: 120, status: 200 }, t);
  usage.record({ kind: 'api', path: '/admin/summary', ms: 10, status: 403 }, t);
  usage.record({ kind: 'api', path: '/requests', ms: 0, status: 429, rateLimited: true }, t);
  usage.addReads(25); usage.addWrites(4); usage.addDeletes(1); usage.addPushes(3);
  const st = usage._state();
  assert.equal(st.api, 102); assert.equal(st.session, 1); assert.equal(st.errors, 1); assert.equal(st.rejected, 1); assert.equal(st.rateLimited, 1);
  assert.equal(usage.groupOf('api', '/customers/me'), 'customer'); assert.equal(usage.groupOf('session'), 'sync'); assert.equal(usage.groupOf('api', '/x'), 'other');
  const m = usage.merge([usage.serialize(st), usage.serialize(st)]);
  const p = usage.performance(m);
  const req = p.groups.find((g) => g.group === 'requests');
  assert.equal(req.p50, 50); assert.equal(req.p95, 800); assert.equal(p.errors, 2);
  assert.equal(usage.percentile([0, 0, 0, 0, 0, 0, 0, 5], 0.95), 6400);
  assert.equal(usage.percentile([0, 0, 0, 0, 0, 0, 0, 0], 0.5), null);
  const b = memBackend();
  assert.equal(await usage.maybeFlush(b, t), true, 'first flush writes');
  usage.addReads(1);
  assert.equal(await usage.maybeFlush(b, t + 1000), false, 'within a minute: no write');
  assert.equal(await usage.maybeFlush(b, t + 61000), true);
  const doc = [...b.docs.entries()].find(([k]) => k.startsWith('usage/'));
  assert.ok(doc && doc[1].reads === 26 && doc[1].expiresAt, 'one document per instance and day with a TTL field');
  scan(doc[1]);
});

test('cost estimate: projection vs budget and levels', () => {
  const m = { api: 1000000, session: 0, reads: 5e6, writes: 1e6, deletes: 0, pushes: 0 };
  assert.equal(usage.cost(m), +((5e6 / 1e5) * 0.06 + (1e6 / 1e5) * 0.18 + 0.4).toFixed(4));
  const at = Date.UTC(2026, 10, 10, 12);                                                    // day 10 of a 30-day month
  const e = usage.estimate(m, at, { budgetEGP: 100, usdToEgp: 50 });
  assert.equal(e.daysElapsed, 10); assert.equal(e.daysInMonth, 30);
  assert.equal(e.projectedEGP, Math.round(usage.cost(m) / 10 * 30 * 50));
  assert.equal(usage.estimate(m, at, { budgetEGP: 100000, usdToEgp: 50 }).level, 'ok');
  assert.equal(usage.estimate(m, at, { budgetEGP: e.projectedEGP, usdToEgp: 50 }).level, 'warn');
  assert.equal(usage.estimate(m, at, { budgetEGP: Math.round(e.projectedEGP / 2), usdToEgp: 50 }).level, 'critical');
  assert.equal(usage.estimate(m, at, { budgetEGP: 0, usdToEgp: 50 }).level, 'unknown');
});

test('thresholds → alerts, de-duplicated (6 h normal / 2 h critical)', () => {
  const health = { areas: { firestore: { state: 'down', error: 'timeout' }, rtdb: { state: 'warn', ms: 3000 }, auth: { state: 'ok', ms: 80 } } };
  const perf = { calls: 200, errorRate: 0.25 }, est = { level: 'critical', projectedEGP: 3000, budgetEGP: 1000 }, clocks = { offers: { stale: true, ok: true } };
  const alerts = tech.evaluateAlerts({ health, perf, est, clocks, now: 1 });
  const by = (k) => alerts.find((a) => a.key === k);
  assert.equal(by('health:firestore').level, 'critical'); assert.equal(by('slow:rtdb').level, 'normal'); assert.equal(by('errors:rate').level, 'critical');
  assert.equal(by('cost').level, 'critical'); assert.equal(by('clock:offers').level, 'normal'); assert.equal(by('health:auth'), undefined);
  assert.equal(tech.evaluateAlerts({ health: { areas: {} }, perf: { calls: 10, errorRate: 1 }, est: { level: 'ok' }, clocks: {}, now: 1 }).length, 0, 'too few calls to judge an error rate');
  const H = 3600000, now = 100 * H;
  const sent = { 'health:firestore': now - 1 * H, 'slow:rtdb': now - 5 * H, 'cost': now - 3 * H };
  const keys = tech.alertsToSend(alerts, sent, now).map((a) => a.key);
  assert.ok(!keys.includes('health:firestore'), 'critical re-alerts only after 2 h');
  assert.ok(!keys.includes('slow:rtdb'), 'normal re-alerts only after 6 h');
  assert.ok(keys.includes('cost'), 'critical sent 3 h ago is due again');
  assert.ok(keys.includes('errors:rate') && keys.includes('clock:offers'));
});

test('health tick: stores system/health, alerts the tech team once per window, tracks the deployed revision', async () => {
  const b = setup({ ping: async () => { throw new Error('down'); } });
  const calls = []; const orig = adapterMod.notifyTeam; adapterMod.notifyTeam = async (...a) => { calls.push(a); };
  const rev = process.env.K_REVISION; process.env.K_REVISION = 'healthclock-00007-abc';
  try {
    const r1 = await tech.healthTick(b, Date.now());
    assert.equal(r1.overall, 'down'); assert.ok(r1.sent >= 2);
    assert.ok(calls.every(([bk, team, level, payload]) => team === 'tech' && ['critical', 'normal'].includes(level) && payload.text && payload.key));
    assert.ok(calls.some((c) => c[2] === 'critical'));
    const n = calls.length;
    const r2 = await tech.healthTick(b, Date.now() + 60000);
    assert.equal(r2.sent, 0); assert.equal(calls.length, n, 'same problem 1 minute later is not sent again');
    assert.equal(b.docs.get('system/health').overall, 'down');
    assert.equal(b.docs.get('system/deploy').revision, 'healthclock-00007-abc');
    scan(b.docs.get('system/health'));
  } finally { adapterMod.notifyTeam = orig; if (rev === undefined) delete process.env.K_REVISION; else process.env.K_REVISION = rev; }
});

test('alerts adapter falls back to the owner push when the team engine does not exist yet', async () => {
  const sent = [];
  const b = memBackend({ sendPush: async (tokens, msg) => { sent.push(msg); return []; } });
  b.docs.set('admins/o1', { role: 'owner', status: 'active' }); b.docs.set('pushTokens/t1', { uid: 'o1', token: 'tok' });
  assert.equal(typeof adapterMod._engine, 'function');
  await adapterMod.notifyTeam(b, 'tech', 'critical', { text: 'قاعدة البيانات مش بترد', link: 'apps/admin/index.html#/tech' });
  if (!adapterMod._engine()) { assert.equal(sent.length, 1); assert.match(sent[0].body, /^حرج — /); }
});

test('clock recording keeps only numbers and flags', async () => {
  const b = setup();
  await tech.recordClock(b, 'offers', { ok: true, changed: 3 }, 12345);
  assert.deepEqual(b.docs.get('system/clocks'), { offersAtMs: 12345, offersOk: true, offersChanged: 3 });
});

test('safeText / safeRoute mask identifiers', () => {
  assert.equal(tech.safeRoute('#/track/r_abc123xyz?x=1'), '#/track/:id');
  assert.equal(tech.safeRoute('#/orders'), '#/orders');
  const s = tech.safeText('x ٠١٠١٢٣٤٥٦٧٨ y HS-2026-1002 z c_deadbeef9 w 0123456789abcdef0123456789');
  assert.ok(!/٠١٠١٢٣٤٥٦٧٨|HS-2026|c_deadbeef9|0123456789abcdef/.test(s));
});

test('the page module and its wiring: registered in the nav, loaded in the admin entry, precached, owner + tech may open it', () => {
  const fs = require('node:fs');
  const page = require(path.join(ROOT, 'apps/admin/pages/tech-center.page.js'));
  const txt = page.reportText({ app: 'server', count: 3, msg: 'boom', src: '/a.js:1', route: '#/x', first: '1', last: '2', stack: 'at f' });
  assert.match(txt, /السيرفر/); assert.match(txt, /3 مرة/); assert.match(txt, /at f/);
  const shell = require(path.join(ROOT, 'apps/admin/admin-shell.js'));
  assert.ok(shell.NAV.find((g) => g.id === 'platform').items.some((i) => i.id === 'tech'));
  assert.match(fs.readFileSync(path.join(ROOT, 'apps/admin/index.html'), 'utf8'), /pages\/tech-center\.page\.js/);
  assert.ok(fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8').includes("'apps/admin/pages/tech-center.page.js'"));
  const G = require(path.join(ROOT, 'apps/admin/permission-guard.js'));
  assert.equal(G.canView('tech', { role: 'owner' }), true); assert.equal(G.canView('tech', { role: 'tech' }), true);
  assert.equal(G.canView('tech', { role: 'support' }), false); assert.equal(G.canView('tech', null), false);
  const src = fs.readFileSync(path.join(ROOT, 'apps/admin/pages/tech-center.page.js'), 'utf8');
  assert.ok(!/MP\.db\(\)|customers|serviceRequests|phone/.test(src), 'the page never reads customer / order data');
});
