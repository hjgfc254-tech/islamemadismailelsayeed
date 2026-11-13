'use strict';
/* Admin modules/* (former placeholders): workforce, audit and access-control modules extracted from their pages.
   Extraction parity vs the previous page code was verified at extraction time (42 comparisons, 0 differences). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const M = 'apps/admin/modules/';
const FILES = ['workforce/employee-status.js', 'workforce/employee-form.js', 'workforce/employee-invitation.js', 'audit/audit-filters.js', 'audit/audit-details.js',
  'access-control/permission-matrix.js', 'access-control/permission-presets.js', 'access-control/role-editor.js'];
const ST = require(path.join(ROOT, M, 'workforce/employee-status.js'));
const EF = require(path.join(ROOT, M, 'workforce/employee-form.js'));
const INV = require(path.join(ROOT, M, 'workforce/employee-invitation.js'));
const AF = require(path.join(ROOT, M, 'audit/audit-filters.js'));
const AD = require(path.join(ROOT, M, 'audit/audit-details.js'));
const PM = require(path.join(ROOT, M, 'access-control/permission-matrix.js'));
const PP = require(path.join(ROOT, M, 'access-control/permission-presets.js'));
const RE = require(path.join(ROOT, M, 'access-control/role-editor.js'));
const R = require(path.join(ROOT, 'apps/admin/rbac-store.js'));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

test('the 8 module files are real code loaded by index.html before the pages that use them', () => {
  const html = read('apps/admin/index.html');
  for (const f of FILES) {
    assert.doesNotMatch(read(M + f), /STATUS: PLACEHOLDER|Documentation only/, f);
    assert.ok(html.indexOf(`modules/${f}`) > -1, `${f} loaded`);
  }
  const before = (mod, page) => assert.ok(html.indexOf(`modules/${mod}`) < html.indexOf(`pages/${page}`), `${mod} before ${page}`);
  ['workforce/employee-status.js', 'workforce/employee-form.js', 'workforce/employee-invitation.js'].forEach(m => before(m, 'workforce.page.js'));
  ['audit/audit-filters.js', 'audit/audit-details.js'].forEach(m => before(m, 'audit-log.page.js'));
  before('access-control/permission-matrix.js', 'permissions.page.js');
  ['access-control/permission-presets.js', 'access-control/role-editor.js'].forEach(m => before(m, 'roles.page.js'));
  assert.ok(html.indexOf('employee-status.js') < html.indexOf('employee-form.js') && html.indexOf('permission-presets.js') < html.indexOf('role-editor.js'), 'module dependencies first');
  for (const page of ['workforce', 'audit-log', 'roles', 'permissions']) assert.match(read(`apps/admin/pages/${page}.page.js`), /modules\//, `${page} page uses its modules`);
});

test('employee status: transitions, last-owner guard and logged changes', () => {
  const L = [{ id: 'e1', role: 'owner', status: 'active', log: [] }, { id: 'e2', role: 'admin', status: 'invited', log: [] }];
  assert.deepEqual(ST.allowedNext('invited'), ['active']); assert.deepEqual(ST.allowedNext('active'), ['disabled']); assert.deepEqual(ST.allowedNext('x'), []);
  assert.throws(() => ST.setStatus(L, 'e1', 'disabled'), /Last owner/);
  assert.throws(() => ST.setStatus(L, 'e2', 'disabled'), /Transition not allowed/);
  const next = ST.setStatus(L, 'e2', 'active', '2026-01-01T00:00:00Z');
  assert.equal(next.find(e => e.id === 'e2').status, 'active');
  assert.deepEqual(next.find(e => e.id === 'e2').log.at(-1), { kind: 'status', text: 'تغيير حالة الحساب إلى «مفعّل» (محاكاة)', at: '2026-01-01T00:00:00Z' });
  assert.equal(L[1].status, 'invited', 'pure: input list is not mutated');
});

test('employee form: normalisation, validation and create/update', () => {
  const L = [{ id: 'e9001', name: 'سامي', email: 'a@example.test', department: 'exec', role: 'owner', status: 'active', log: [] }];
  assert.deepEqual(EF.clean({ name: '  منى   علي ', email: ' M@Example.TEST ', department: 'ops', role: 'admin' }), { name: 'منى علي', email: 'm@example.test', department: 'ops', role: 'admin' });
  const bad = EF.validate({ name: '', email: 'a@example.test', department: 'x', role: 'y' }, L);
  assert.equal(bad.ok, false); assert.deepEqual(Object.keys(bad.errors).sort(), ['department', 'email', 'name', 'role']);
  assert.match(EF.validate({ name: 'سامي', email: 'a@example.test', department: 'exec', role: 'admin' }, L, 'e9001').errors.role, /آخر مالك/);
  const created = EF.createEmployee(L, { name: 'منى', email: 'm@example.test', department: 'ops', role: 'admin' }, '2026-02-03T00:00:00Z');
  assert.deepEqual({ ...created.at(-1), log: undefined }, { id: 'e9002', status: 'invited', created: '2026-02-03', name: 'منى', email: 'm@example.test', department: 'ops', role: 'admin', log: undefined });
  assert.throws(() => EF.updateEmployee(created, 'e9002', { name: 'منى', email: 'm@example.test', department: 'ops', role: 'admin' }), /No change/);
  assert.match(EF.updateEmployee(created, 'e9002', { name: 'منى', email: 'm@example.test', department: 'finance', role: 'admin' }).at(-1).log.at(-1).text, /الإدارة: «المالية»/);
});

test('employee invitation: only invited employees, simulated resend logged', () => {
  const L = [{ id: 'e1', status: 'invited', log: [] }, { id: 'e2', status: 'active', log: [] }];
  assert.equal(INV.canResend(L[0]), true); assert.equal(INV.canResend(L[1]), false);
  assert.throws(() => INV.resendInvite(L, 'e2'), /Not invited/);
  assert.match(INV.resendInvite(L, 'e1').find(e => e.id === 'e1').log.at(-1).text, /محاكاة — لم تُرسل/);
});

test('audit filters and details: grid config and read-only escaped details', () => {
  const cfg = AF.gridConfig([{ key: 'at' }], { success: { label: 'نجح' }, denied: { label: 'مرفوض' } });
  assert.deepEqual(cfg.searchKeys, ['actor', 'action', 'record', 'summary', 'moduleLabel']);
  assert.deepEqual(cfg.filters[1].options, [{ value: 'success', label: 'نجح' }, { value: 'denied', label: 'مرفوض' }]);
  const html = AD.render({ id: 'ev1', action: '<b>x</b>', at: 'z', result: 'success', actor: 'a', moduleLabel: 'm', record: 'r', summary: 's', reason: '' }, { esc, icon: () => '', dt: () => 'date', badge: () => '<badge>' });
  assert.match(html, /تفاصيل الحدث/); assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/); assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.doesNotMatch(html, /<(input|form|select|textarea)\b/, 'details are read-only');
  assert.doesNotMatch(html, /السبب/, 'reason row only when present');
  assert.throws(() => AD.render({}, {}), /helpers are required/);
});

test('permission matrix: cells follow effective (direct + inherited) permissions', () => {
  const cells = PM.cells(R);
  assert.equal(cells.length, Object.keys(R.MODULES).length);
  const owner = cells.find(c => c.module === 'roles').byRole.owner;
  assert.deepEqual(owner, Object.keys(R.ACTIONS), 'owner holds every action');
  for (const c of cells) for (const role of R.state.roles) {
    const eff = new Set(R.effective(R.state.roles, role.id));
    assert.deepEqual(c.byRole[role.id], Object.keys(R.ACTIONS).filter(a => eff.has(R.key(c.module, a))));
  }
  assert.match(PM.render(R, { esc }), /<table class="rl-table">/);
});

test('permission presets: derived from the seed roles + view-only, clamped to the actor and without inherited keys', () => {
  const list = PP.list(R);
  assert.equal(list[0].id, 'view-all');
  assert.deepEqual(list[0].permissions, R.sortKeys(Object.keys(R.MODULES).map(m => m + '.view')));
  assert.ok(!list.some(p => p.id === 'role:owner'), 'protected owner role is not offered as a preset');
  for (const p of list.slice(1)) assert.deepEqual(p.permissions, R.effective(R.buildRoles(), p.id.slice(5)));
  const asOwner = PP.apply(R, 'view-all', 'owner', []);
  assert.equal(asOwner.keys.length, Object.keys(R.MODULES).length); assert.deepEqual(asOwner.skipped, []);
  const support = PP.apply(R, 'view-all', 'support', []);
  assert.ok(support.skipped.length > 0, 'keys outside the actor authority are skipped, not granted');
  assert.ok(support.keys.every(k => R.effective(R.state.roles, 'support').includes(k)));
  const withInh = PP.apply(R, 'view-all', 'owner', ['orders.view']);
  assert.ok(!withInh.keys.includes('orders.view'), 'inherited keys stay inherited');
  assert.deepEqual(PP.apply(R, 'nope', 'owner', []), { keys: [], skipped: [] });
});

test('role editor: preset picker for editable roles only; protected roles stay read-only', () => {
  const ed = RE.create({ R, esc, icon: () => '', nf: n => String(n), dt: () => 'd' });
  const custom = R.state.roles.find(r => !r.system), sys = R.state.roles.find(r => r.system);
  const form = ed.dialogHtml(custom, {});
  assert.match(form, /<select id="rl-preset"><option value="">— بدون قالب —<\/option>/);
  assert.equal((form.match(/<option value="(view-all|role:[a-z]+)">/g) || []).length, PP.list(R).length);
  assert.match(ed.dialogHtml(null, {}), /إضافة دور/);
  assert.doesNotMatch(ed.dialogHtml(sys, {}), /rl-preset|<form/, 'system role dialog has no editor');
  assert.throws(() => RE.create({}), /required/);
});
