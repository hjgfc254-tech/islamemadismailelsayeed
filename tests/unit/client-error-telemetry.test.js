'use strict';
/* Client error reporting: browser collector (shared/utils/error-reporter.js), server route (functions/src/telemetry.js
   via service.api), in-memory abuse limiter (functions/src/limits.js) and the Admin view (apps/admin/modules/client-errors.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');
const service = require(path.join(ROOT, 'functions/src/service.js'));
const telemetry = require(path.join(ROOT, 'functions/src/telemetry.js'));
const limits = require(path.join(ROOT, 'functions/src/limits.js'));

function backend() {
  const docs = new Map(); const clone = (v) => JSON.parse(JSON.stringify(v));
  const rows = (col) => [...docs].filter(([p]) => p.startsWith(col + '/')).map(([p, d]) => ({ id: p.split('/')[1], data: clone(d) }));
  let txs = 0;
  return {
    docs, txCount: () => txs,
    adapter: {
      async get(tx, p) { return docs.has(p) ? clone(docs.get(p)) : null; },
      async query(tx, col, q) { let out = rows(col); if (q.orderBy) { const [f, dir] = q.orderBy; out.sort((a, b) => (a.data[f] < b.data[f] ? 1 : -1) * (dir === 'desc' ? 1 : -1)); } return q.limit ? out.slice(0, q.limit) : out; },
      set(tx, p, d) { docs.set(p, clone(d)); }, del(tx, p) { docs.delete(p); }
    },
    runTransaction: (fn) => { txs++; return fn({}); },
    async getDoc(p) { return docs.has(p) ? clone(docs.get(p)) : null; },
    async setDoc(p, d) { docs.set(p, clone(d)); },
    async deleteDoc(p) { docs.delete(p); },
    async addDoc() {}, async queryDocs() { return []; }, async signal() {}, env: { bootstrapEmails: [] }
  };
}
const call = (b, auth, app, method, p, body) => service.api(b, { auth, data: { app, method, path: p, body } });
const OWNER = { uid: 'u_owner', token: { email: 'o@example.com', email_verified: true } };
const ERR = { msg: 'TypeError: x is undefined', src: 'https://site.example/apps/customer/app.js?v=2:120:7', stack: 'at render (https://site.example/apps/customer/app.js:120:7)', route: '#/orders?id=9', ua: 'Chrome 130 · Android' };

test('scrub masks emails, phone numbers, tokens and query strings', () => {
  const s = telemetry.scrub('fail for ali@mail.com phone +20 100 123 4567 key AIzaSyA1234567890abcdefghijk url /x?token=abc', 500);
  assert.ok(!/ali@mail\.com/.test(s) && s.includes('<email>'));
  assert.ok(!/123 4567/.test(s) && s.includes('<num>'));
  assert.ok(!/AIza/.test(s) && s.includes('<token>'));
  assert.ok(!s.includes('token=abc'));
});

test('POST /telemetry/errors works signed out, groups repeats into one document with a count, and is never audited', async () => {
  const b = backend();
  const r1 = await call(b, null, 'customer', 'POST', '/telemetry/errors', { reports: [ERR] });
  assert.equal(r1.ok, true); assert.equal(r1.data.stored, 1);
  await call(b, { uid: 'u1', token: {} }, 'customer', 'POST', '/telemetry/errors', { reports: [ERR, ERR] });
  const groups = [...b.docs].filter(([p]) => p.startsWith('clientErrors/'));
  assert.equal(groups.length, 1, 'same app + message + file → one group');
  const g = groups[0][1];
  assert.equal(g.count, 3); assert.equal(g.userCount, 1);
  assert.equal(g.src, '/apps/customer/app.js:120:7', 'origin and query string removed');
  assert.equal(g.route, '#/orders');
  assert.ok(g.expiresAt, 'TTL field for the Firestore TTL policy');
  assert.equal(b.txCount(), 0, 'no Firestore write-rate transaction for error reports');
  assert.ok(![...b.docs.keys()].some((p) => p.startsWith('audit/')));
});

test('a call carries at most MAX_REPORTS reports and empty / invalid reports are rejected', async () => {
  const b = backend();
  const many = Array.from({ length: 12 }, (_, i) => ({ ...ERR, msg: 'E' + i }));
  const r = await call(b, null, 'provider', 'POST', '/telemetry/errors', { reports: many });
  assert.equal(r.data.stored, telemetry.MAX_REPORTS);
  const bad = await call(b, null, 'provider', 'POST', '/telemetry/errors', { reports: [{ msg: '' }, 'x'] });
  assert.equal(bad.ok, false); assert.equal(bad.status, 422);
});

test('only an owner / admin role reads and clears the grouped errors; personal fields are not returned', async () => {
  const b = backend();
  await call(b, { uid: 'u9', token: {} }, 'customer', 'POST', '/telemetry/errors', { reports: [ERR] });
  const anon = await call(b, null, 'admin', 'GET', '/admin/client-errors');
  assert.equal(anon.status, 401);
  const cust = await call(b, { uid: 'u9', token: {} }, 'customer', 'GET', '/admin/client-errors');
  assert.equal(cust.ok, false);
  b.docs.set('admins/u_sup', { status: 'active', role: 'support' });
  const sup = await call(b, { uid: 'u_sup', token: {} }, 'admin', 'GET', '/admin/client-errors');
  assert.equal(sup.status, 403);
  b.docs.set('admins/u_owner', { status: 'active', role: 'owner' });
  const list = await call(b, OWNER, 'admin', 'GET', '/admin/client-errors');
  assert.equal(list.ok, true); assert.equal(list.data.items.length, 1);
  assert.equal(list.data.items[0].users, undefined, 'uids stay on the server');
  const clr = await call(b, OWNER, 'admin', 'POST', '/admin/client-errors/clear', {});
  assert.equal(clr.data.deleted, 1);
  assert.equal((await call(b, OWNER, 'admin', 'GET', '/admin/client-errors')).data.items.length, 0);
});

test('telemetry limiter: 10 reports a minute per uid / IP plus a per-instance ceiling, separate from reads', () => {
  let t = 0; const L = limits.createTelemetryLimiter({ perKeyPerMin: 10, perInstancePerMin: 15 }, () => t);
  for (let i = 0; i < 10; i++) assert.ok(L.allow({ ip: '1.1.1.1' }));
  assert.equal(L.allow({ ip: '1.1.1.1' }), false);
  for (let i = 0; i < 4; i++) assert.ok(L.allow({ uid: 'u' + i }));
  assert.equal(L.allow({ uid: 'other' }), false, 'instance ceiling');
  t = 60001; assert.ok(L.allow({ ip: '1.1.1.1' }), 'next minute');
  assert.ok(limits.isTelemetryCall('api', { path: '/telemetry/errors' }));
  assert.equal(limits.isTelemetryCall('session', { path: '/telemetry/errors' }), false);
});

function browser({ firebase = false } = {}) {
  const handlers = {}; const store = new Map(); const posted = [];
  const win = {
    location: { origin: 'https://site.example', pathname: '/apps/provider/index.html', hash: '#/jobs?id=5' },
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile' },
    addEventListener: (n, f) => { handlers[n] = f; },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    setTimeout: (f) => 0, clearTimeout: () => {}, Promise, JSON, Date, Set, String, RegExp
  };
  win.document = { addEventListener: () => {}, visibilityState: 'visible' };
  if (firebase) { win.HSFirebaseConfig = { mode: 'firebase' }; win.HSBackend = {}; win.HSApiClient = { request: (m, p, o) => { posted.push([m, p, o.body]); return Promise.resolve({ ok: true }); } }; }
  win.globalThis = win;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'shared/utils/error-reporter.js'), 'utf8'), win);
  return { win, handlers, store, posted };
}

test('browser collector: keeps own-site errors on the device in demo mode, masked, deduplicated', () => {
  const { win, handlers } = browser();
  const e = { message: 'Cannot read 01012345678', filename: 'https://site.example/apps/provider/app.js', lineno: 9, colno: 3, error: { stack: 'at x (https://site.example/apps/provider/app.js:9:3)' } };
  handlers.error(e); handlers.error(e);
  handlers.error({ message: 'Script error.', filename: '' });
  handlers.error({ message: 'boom', filename: 'chrome-extension://abc/x.js' });
  handlers.error({ message: 'third party', filename: 'https://cdn.other.com/x.js' });
  handlers.unhandledrejection({ reason: new Error('net down') });
  win.HSErrorReporter.flush();
  const saved = win.HSErrorReporter.local();
  assert.equal(saved.length, 2, 'one error + one rejection; noise and duplicates dropped');
  const err = saved.find((x) => x.kind === 'error');
  assert.equal(err.app, 'provider');
  assert.ok(!err.msg.includes('01012345678'));
  assert.equal(err.src, '/apps/provider/app.js:9:3');
  assert.equal(err.route, '#/jobs');
  assert.match(err.ua, /Chrome 130 · Android/);
});

test('browser collector: in Firebase mode it posts batches to /telemetry/errors and caps a page at 10 reports', () => {
  const { win, handlers, posted } = browser({ firebase: true });
  for (let i = 0; i < 25; i++) handlers.error({ message: 'E' + i, filename: 'https://site.example/apps/provider/app.js', lineno: i });
  win.HSErrorReporter.flush(); win.HSErrorReporter.flush();
  const reports = posted.flatMap(([, , b]) => b.reports);
  assert.ok(posted.every(([m, p]) => m === 'POST' && p === '/telemetry/errors'));
  assert.equal(reports.length, 10);
  assert.ok(posted.every(([, , b]) => b.reports.length <= 5));
});

test('Admin view lists grouped errors with counts and an empty state', () => {
  const ctx = { globalThis: null, Intl, Date, Number, String };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'apps/admin/modules/client-errors.js'), 'utf8'), ctx);
  assert.match(ctx.HSClientErrors.html([]), /مفيش أخطاء/);
  const h = ctx.HSClientErrors.html([{ app: 'customer', msg: '<b>x</b>', src: '/apps/customer/app.js:1', count: 4, userCount: 2, first: '2026-11-01T00:00:00Z', last: '2026-11-02T00:00:00Z' }]);
  assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;'), 'escaped');
  assert.match(h, /العميل/); assert.match(h, /data-cerr-clear/);
});

test('every app loads the reporter first, and the service worker precaches it', () => {
  for (const a of ['customer', 'provider', 'admin']) {
    const html = fs.readFileSync(path.join(ROOT, `apps/${a}/index.html`), 'utf8');
    const first = html.indexOf('<script src=');
    assert.ok(html.slice(first).startsWith('<script src="../../shared/utils/error-reporter.js">'), a);
  }
  const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  assert.ok(sw.includes("'shared/utils/error-reporter.js'") && sw.includes("'apps/admin/modules/client-errors.js'"));
});
