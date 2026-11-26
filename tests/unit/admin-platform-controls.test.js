'use strict';
/* Owner emergency switches (services/admin-api.js + the gate in services/api-client.js), the same rule on the server
   (functions/src via service.api), the admin navigation by responsibility, «الإحصائيات» and «مهام اليوم». */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const service = require(path.join(ROOT, 'functions/src/service.js'));
const client = require(path.join(ROOT, 'services/api-client.js'));

test('controlsBlock: maintenance blocks every customer / provider change; pauses block only their own action', () => {
  const B = client.controlsBlock;
  assert.equal(B(null, 'POST', '/requests'), '');
  assert.match(B({ maintenance: { on: true } }, 'POST', '/complaints'), /صيانة/);
  assert.equal(B({ maintenance: { on: true, message: 'ساعة وراجعين' } }, 'POST', '/requests'), 'ساعة وراجعين');
  assert.match(B({ pauseOrders: { on: true } }, 'POST', '/requests'), /الطلبات الجديدة/);
  assert.equal(B({ pauseOrders: { on: true } }, 'POST', '/complaints'), '', 'other actions continue');
  assert.match(B({ pauseSignups: { on: true } }, 'POST', '/providers/register'), /تسجيل/);
  assert.equal(B({ pauseOrders: { on: false } }, 'POST', '/requests'), '');
});

/* in-memory backend (same shape as firebase-backend.test.js) */
function memBackend() {
  const docs = new Map(); let auto = 0; const clone = (v) => JSON.parse(JSON.stringify(v));
  const rows = (col) => [...docs].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2).map(([p, d]) => ({ id: p.split('/')[1], data: clone(d) }));
  const match = (r, [f, op, v]) => { const x = f === 'id' ? r.id : r.data[f]; return op === '==' ? x === v : op === 'in' ? v.includes(x) : op === 'array-contains' ? Array.isArray(x) && x.includes(v) : false; };
  const adapter = {
    async get(tx, p) { return docs.has(p) ? clone(docs.get(p)) : null; },
    async query(tx, col, q) { let out = rows(col).filter((r) => (q.where || []).every((w) => match(r, w))); if (q.limit) out = out.slice(0, q.limit); return out; },
    async count(col, where) { return rows(col).filter((r) => (where || []).every((w) => match(r, w))).length; },
    set(tx, p, d) { docs.set(p, clone(d)); }, del(tx, p) { docs.delete(p); }
  };
  return { docs, adapter, runTransaction: (fn) => fn({}), async getDoc(p) { return adapter.get(null, p); },
    async setDoc(p, d, merge) { docs.set(p, merge && docs.has(p) ? { ...docs.get(p), ...clone(d) } : clone(d)); },
    async addDoc(col, d) { docs.set(`${col}/auto${++auto}`, clone(d)); }, async deleteDoc(p) { docs.delete(p); },
    async queryDocs(col, field, op, value) { return rows(col).filter((x) => (op === 'in' ? value.includes(x.data[field]) : x.data[field] === value)); },
    async signal() {}, env: { bootstrapEmails: ['owner@example.com'] } };
}
const OWNER = { uid: 'u_owner', token: { email: 'owner@example.com', email_verified: true } };
const SARA = { uid: 'u_sara', token: { phone_number: '+201011112222' } };
const call = (b, auth, app, method, p, body) => service.api(b, { auth, data: { app, method, path: p, body } });
const REQ = { cat: 'electric', serviceName: 'إصلاح', desc: 'الكهرباء مقطوعة في المطبخ', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع 1' };

test('server: only the owner flips a switch; maintenance refuses customer changes and is audited; admins keep working', async () => {
  const b = memBackend();
  await service.session(b, { auth: OWNER, data: { op: 'claimOwner', name: 'المالك' } });
  await service.session(b, { auth: OWNER, data: { op: 'adminCode', action: 'set', code: '24681357' } });
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  b.docs.set('admins/u_sup', { status: 'active', role: 'support', name: 'دعم', codeHash: 'x', unlockedUntil: 9e15 });
  const denied = await call(b, { uid: 'u_sup', token: { email: 's@x.com', email_verified: true } }, 'admin', 'POST', '/admin/controls', { key: 'maintenance', on: true });
  assert.equal(denied.ok, false); assert.equal(denied.status, 403);
  const on = await call(b, OWNER, 'admin', 'POST', '/admin/controls', { key: 'maintenance', on: true, message: 'صيانة ساعة' });
  assert.equal(on.ok, true, JSON.stringify(on.error)); assert.equal(on.data.maintenance.on, true);
  assert.ok([...b.docs.entries()].some(([p, d]) => p.startsWith('audit/') && d.path === '/admin/controls'), 'the switch is in the audit log');
  const blocked = await call(b, SARA, 'customer', 'POST', '/requests', REQ);
  assert.equal(blocked.ok, false); assert.equal(blocked.status, 503); assert.equal(blocked.error.message, 'صيانة ساعة');
  const sync = await service.session(b, { auth: SARA, data: { op: 'sync', app: 'customer' } });
  assert.equal(sync.db.settings.controls.maintenance.on, true, 'customers receive the switch to show the maintenance screen');
  const adminStill = await call(b, OWNER, 'admin', 'GET', '/admin/controls');
  assert.equal(adminStill.ok, true);
  await call(b, OWNER, 'admin', 'POST', '/admin/controls', { key: 'maintenance', on: false });
  const okNow = await call(b, SARA, 'customer', 'POST', '/requests', REQ);
  assert.equal(okNow.ok, true, JSON.stringify(okNow.error));
});

test('navigation: grouped by responsibility; one statistics page; owner area holds emergency, staff, security, log, settings', () => {
  const shell = require(path.join(ROOT, 'apps/admin/admin-shell.js'));
  const groups = shell.NAV.map((g) => g.label);
  assert.deepEqual(groups, ['اليوم', 'التشغيل', 'الدعم والجودة', 'الكتالوج والأسعار', 'المالية', 'الأرقام', 'إدارة المنصة']);
  const platform = shell.NAV.find((g) => g.id === 'platform').items.map((i) => i.id);
  assert.deepEqual(platform, ['controls', 'tech', 'workforce', 'departments', 'roles', 'permissions', 'security', 'audit', 'settings']);
  const flat = shell._internals.flatItems().map((i) => i.id);
  for (const statsPage of ['finance', 'reports', 'super-dashboard']) assert.ok(!flat.includes(statsPage) && shell._internals.HIDDEN_PAGES[statsPage].parent === 'insights', statsPage + ' lives under «الإحصائيات»');
  const G = require(path.join(ROOT, 'apps/admin/permission-guard.js'));
  assert.deepEqual([...G.OWNER_ONLY].sort(), ['audit', 'controls', 'security', 'settings', 'super-dashboard']);
});

test('work pages hide their own statistic strips; «الإحصائيات» keeps them', () => {
  const css = fs.readFileSync(path.join(ROOT, 'apps/admin/styles/admin-components.css'), 'utf8');
  assert.match(css, /\.adm-content \.ord-sum:not\(\.ins-keep\)\{display:none\}/);
  const src = fs.readFileSync(path.join(ROOT, 'apps/admin/pages/insights.page.js'), 'utf8');
  assert.match(src, /classList\.add\('ins-keep'\)/);
});

test('«الإحصائيات» counts each area from the records', () => {
  global.STATUS_LABEL = undefined;
  const I = require(path.join(ROOT, 'apps/admin/pages/insights.page.js'));
  const c = I.areaCounts({ serviceRequests: [{ status: 'received' }, { status: 'closed' }, { status: 'closed' }], providers: [{ status: 'approved', available: true }, { status: 'pending' }],
    customers: [{}], complaints: [{ status: 'open' }, { status: 'resolved' }], reviews: [{ stars: 5 }, { stars: 3 }],
    transactions: [{ value: 300, commission: 45, collection: 'pending' }, { value: 100, commission: 15, collection: 'collected' }, { free: true, value: 0 }] });
  assert.equal(c.orders.total, 3); assert.equal(c.orders.byStatus.closed, 2);
  assert.equal(c.providers.available, 1); assert.equal(c.complaints.open, 1); assert.equal(c.reviews.avg, 4);
  assert.deepEqual(c.money, { value: 400, commission: 60, pending: 45 });
  assert.deepEqual(I.TABS.map((t) => t.id), ['overview', 'areas', 'finance', 'reports', 'owner']);
  assert.equal(I.TABS.find((t) => t.id === 'owner').owner, true);
});

test('admin entry loads the new pages before the owner board and the apps load the platform status notice', () => {
  const admin = fs.readFileSync(path.join(ROOT, 'apps/admin/index.html'), 'utf8');
  assert.ok(admin.indexOf('pages/insights.page.js') < admin.indexOf('pages/super-dashboard.page.js'));
  assert.ok(admin.indexOf('pages/controls.page.js') < admin.indexOf('pages/super-dashboard.page.js'));
  for (const a of ['customer', 'provider']) assert.match(fs.readFileSync(path.join(ROOT, `apps/${a}/index.html`), 'utf8'), /shared\/components\/platform-status\.js/);
});

test('8-digit access code: required after email + password, never stored in clear, locks after 5 wrong tries, audited', async () => {
  const code = require(path.join(ROOT, 'functions/src/admin-code.js'));
  const b = memBackend();
  await service.session(b, { auth: OWNER, data: { op: 'claimOwner', name: 'المالك' } });
  let s = await service.session(b, { auth: OWNER, data: { op: 'sync', app: 'admin' } });
  assert.equal(s.actor, null, 'no admin actor before the code');
  assert.deepEqual({ needsCode: s.adminGate.needsCode, hasCode: s.adminGate.hasCode }, { needsCode: true, hasCode: false });
  const before = await call(b, OWNER, 'admin', 'GET', '/admin/controls');
  assert.equal(before.ok, false, 'admin API refused until the code is entered');
  for (const weak of ['1234567', '12345678', '11111111', '87654321', 'abcdefgh']) {
    await assert.rejects(service.session(b, { auth: OWNER, data: { op: 'adminCode', action: 'set', code: weak } }), /8 أرقام|سهل/);
  }
  await service.session(b, { auth: OWNER, data: { op: 'adminCode', action: 'set', code: '24681357' } });
  const doc = b.docs.get('admins/u_owner');
  assert.ok(doc.codeHash && doc.codeSalt && !JSON.stringify(doc).includes('24681357'), 'only a salted hash is stored');
  s = await service.session(b, { auth: OWNER, data: { op: 'sync', app: 'admin' } });
  assert.equal(s.actor.role, 'admin'); assert.equal(s.adminGate, undefined);
  assert.equal((await call(b, OWNER, 'admin', 'GET', '/admin/controls')).ok, true);
  await service.session(b, { auth: OWNER, data: { op: 'adminCode', action: 'lock' } });
  assert.equal((await call(b, OWNER, 'admin', 'GET', '/admin/controls')).ok, false, 'locking ends the unlock');
  for (let i = 1; i <= 4; i++) await assert.rejects(service.session(b, { auth: OWNER, data: { op: 'adminCode', action: 'unlock', code: '99990000' } }), new RegExp('فاضل ' + (5 - i)));
  await assert.rejects(service.session(b, { auth: OWNER, data: { op: 'adminCode', action: 'unlock', code: '99990000' } }), /مقفول/);
  await assert.rejects(service.session(b, { auth: OWNER, data: { op: 'adminCode', action: 'unlock', code: '24681357' } }), /مقفول/, 'even the right code waits for the lock');
  b.docs.set('admins/u_owner', { ...b.docs.get('admins/u_owner'), codeLockUntil: Date.now() - 1 });
  const ok = await service.session(b, { auth: OWNER, data: { op: 'adminCode', action: 'unlock', code: '24681357' } });
  assert.equal(ok.ok, true);
  const audit = [...b.docs.values()].filter((d) => String(d.action || '').startsWith('admin.code'));
  assert.ok(audit.some((d) => d.status === 'failed') && audit.some((d) => d.status === 'locked') && audit.some((d) => d.status === 'ok'), 'set, failures, lock and unlock are audited');
  assert.ok(code.weak('01234567') && code.weak('00000000') && !code.weak('24681357'));
});

test('owner resets an employee code (never their own); the employee must set a new one', async () => {
  const b = memBackend();
  await service.session(b, { auth: OWNER, data: { op: 'claimOwner', name: 'المالك' } });
  await service.session(b, { auth: OWNER, data: { op: 'adminCode', action: 'set', code: '24681357' } });
  b.docs.set('admins/u_sup', { status: 'active', role: 'support', name: 'دعم', employeeId: 'e2' });
  const SUP = { uid: 'u_sup', token: { email: 's@x.com', email_verified: true } };
  await service.session(b, { auth: SUP, data: { op: 'adminCode', action: 'set', code: '86420975' } });
  const supNo = await call(b, SUP, 'admin', 'POST', '/admin/security/reset-code/u_owner', {});
  assert.equal(supNo.ok, false, 'staff cannot reset codes');
  const self = await call(b, OWNER, 'admin', 'POST', '/admin/security/reset-code/u_owner', {});
  assert.equal(self.ok, false);
  const r = await call(b, OWNER, 'admin', 'POST', '/admin/security/reset-code/u_sup', {});
  assert.equal(r.ok, true, JSON.stringify(r.error));
  const s = await service.session(b, { auth: SUP, data: { op: 'sync', app: 'admin' } });
  assert.deepEqual({ needsCode: s.adminGate.needsCode, hasCode: s.adminGate.hasCode }, { needsCode: true, hasCode: false });
});

test('rank: riskier actions need a higher rank — support resolves complaints but cannot suspend; only the owner sets rates', () => {
  const vm = require('node:vm');
  const ctx = { console }; ctx.globalThis = ctx;
  for (const f of ['apps/admin/rbac-store.js', 'apps/admin/permission-guard.js']) vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
  const R = ctx.HSAdminRbac, G = ctx.HSAdminPermissionGuard;
  assert.equal(R.levelOf(R.state.roles, 'support'), 1); assert.equal(R.levelOf(R.state.roles, 'moderator'), 2, 'inherits support, own level 2');
  assert.equal(R.levelOf(R.state.roles, 'admin'), 3); assert.equal(R.levelOf(R.state.roles, 'owner'), 4);
  const who = (role) => ({ role: 'admin', id: 'x_' + role, adminRole: role });
  assert.equal(G.riskDenied(who('support'), 'complaints.resolve'), '');
  assert.match(G.riskDenied(who('support'), 'providers.suspend'), /مدير/);
  assert.equal(G.riskDenied(who('admin'), 'providers.suspend'), '');
  assert.match(G.riskDenied(who('admin'), 'finance.commission'), /المالك/);
  assert.equal(G.riskDenied(who('owner'), 'finance.commission'), '');
  assert.equal(G.riskDenied({ role: 'customer', id: 'c' }, 'providers.suspend'), '', 'only admin actors are ranked');
});

test('«الإحصائيات» exports CSV with a BOM, quoted cells and Arabic headers', () => {
  const I = require(path.join(ROOT, 'apps/admin/pages/insights.page.js'));
  const csv = I.toCsv([['أ', 'b,c'], ['قال "هاي"', 1]]);
  assert.equal(csv.charCodeAt(0), 0xfeff, 'BOM so Excel reads UTF-8');
  assert.ok(csv.includes('"b,c"') && csv.includes('"قال ""هاي"""'));
  const rows = I.exportRows('transactions', { transactions: [{ at: '2026-11-20T10:00:00Z', reqId: 'r1', providerId: 'p1', value: 300, commission: 45, collection: 'pending' }, { free: true }], providers: [{ id: 'p1', name: 'كريم' }], serviceRequests: [{ id: 'r1', no: 'HS-1' }] });
  assert.equal(rows.length, 2, 'free services are not exported');
  assert.deepEqual(rows[1], ['2026-11-20 10:00', 'HS-1', 'كريم', 300, 45, 255, 'لسه']);
});

