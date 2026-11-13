'use strict';
/* Admin runtime modules (former placeholders): router, navigation builder, permission guard, demo auth/session, app bootstrap. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));
const MODULES = ['admin-router.js', 'navigation-builder.js', 'permission-guard.js', 'admin-auth.js', 'admin-session.js', 'app.js'];
const entryScripts = () => [...read('apps/admin/index.html').matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

function load() {
  const s = new Map();
  const ctx = { console, sessionStorage: { getItem: k => (s.has(k) ? s.get(k) : null), setItem: (k, v) => s.set(k, String(v)), removeItem: k => s.delete(k) } };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['admin-router.js', 'navigation-builder.js', 'rbac-store.js', 'permission-guard.js', 'admin-auth.js', 'admin-session.js'])
    vm.runInContext(read('apps/admin/' + f), ctx, { filename: f });
  return { ctx, store: s };
}

test('the six Admin runtime files are real code wired into apps/admin/index.html in dependency order', () => {
  const list = entryScripts();
  for (const f of MODULES) {
    assert.doesNotMatch(read('apps/admin/' + f), /STATUS: PLACEHOLDER|Documentation only/, f);
    assert.ok(list.includes(f), `${f} loaded by index.html`);
  }
  const at = f => list.indexOf(f);
  assert.ok(at('admin-router.js') < at('admin-shell.js') && at('navigation-builder.js') < at('admin-shell.js'), 'shell dependencies first');
  assert.ok(at('rbac-store.js') < at('permission-guard.js') && at('permission-guard.js') < at('admin-auth.js') && at('admin-auth.js') < at('admin-session.js'));
  assert.equal(list.at(-1), 'app.js', 'bootstrap loads last');
  assert.doesNotMatch(read('apps/admin/login.html'), /<input|<form|password/i, 'login route collects no credentials');
  assert.match(read('apps/admin/login.html'), /location\.replace\('index\.html'\+location\.hash\)/);
});

test('router: parse/format/breadcrumbs, and the shell delegates to it (same results)', () => {
  const { ctx } = load();
  const R = ctx.HSAdminRouter;
  const shell = require(path.join(ROOT, 'apps/admin/admin-shell.js'));
  for (const h of ['#/orders', '#orders', '#/ORDERS/x', '', '#', '#/!!']) assert.equal(R.parse(h), shell._internals.parseHash(h), h);
  assert.equal(R.parse('#/Orders/details'), 'orders');
  assert.equal(R.parse('nope'), 'dashboard');
  assert.equal(R.format('roles'), '#/roles');
  assert.deepEqual(plain(R.breadcrumbs(shell.NAV, shell._internals.HIDDEN_PAGES, 'employee-details', 'سامي')),
    [{ label: 'الإدارة', id: 'dashboard' }, { label: 'الفريق والصلاحيات' }, { label: 'فريق العمل', id: 'workforce' }, { label: 'سامي' }]);
  assert.deepEqual(plain(shell._internals.breadcrumbsFor('orders')), plain(R.breadcrumbs(shell.NAV, shell._internals.HIDDEN_PAGES, 'orders')));
  assert.equal(R.findItem(shell.NAV, 'audit').label, 'سجل التدقيق');
});

test('navigation builder keeps allowed items, flags readiness and drops empty groups', () => {
  const { ctx } = load();
  const B = ctx.HSAdminNavigationBuilder;
  const nav = [{ id: 'g1', label: 'A', items: [{ id: 'a', label: 'a', icon: 'x' }, { id: 'b', label: 'b', icon: 'y' }] }, { id: 'g2', label: 'B', items: [{ id: 'c', label: 'c' }] }];
  const model = B.build(nav, { isRegistered: id => id !== 'b', canView: id => id !== 'c' });
  assert.deepEqual(plain(model), [{ id: 'g1', label: 'A', items: [{ id: 'a', label: 'a', icon: 'x', ready: true }, { id: 'b', label: 'b', icon: 'y', ready: false }] }]);
  assert.equal(B.countReady(model), 1);
  assert.equal(B.build(nav).length, 2, 'defaults: all visible');
});

test('permission guard follows the RBAC demo catalog for the employee (role chain + extras)', () => {
  const { ctx } = load();
  const G = ctx.HSAdminPermissionGuard, R = ctx.HSAdminRbac;
  const roster = R.state.roster, owner = roster.find(e => e.role === 'owner');
  for (const id of Object.keys(G.ROUTE_MODULE)) assert.equal(G.canView(id, owner), true, `owner sees ${id}`);
  for (const e of roster) {
    const eff = new Set(R.employeeEffective(R.state.roles, R.state.overrides, e));
    for (const [route, mod] of Object.entries(G.ROUTE_MODULE)) assert.equal(G.canView(route, e), eff.has(mod + '.view'), `${e.role} ${route}`);
  }
  const support = roster.find(e => e.role === 'support');
  assert.equal(G.canView('roles', support), false, 'support role has no roles.view in the demo catalog');
  for (const open of ['dashboard', 'super-dashboard', 'finance', 'audit', 'settings']) assert.equal(G.canView(open, support), true, `${open} is outside the catalog → open`);
  assert.equal(G.canView('orders', null), false, 'no employee → guarded routes hidden');
  R.state.overrides[support.id] = ['roles.view'];
  assert.equal(G.canView('roles', support), true, 'per-employee extra permission is honoured');
});

test('demo auth lists only active roster employees; session selects, syncs the RBAC actor and clears', () => {
  const { ctx, store } = load();
  const A = ctx.HSAdminAuth, S = ctx.HSAdminSession, R = ctx.HSAdminRbac;
  const active = R.state.roster.filter(e => e.status === 'active');
  assert.equal(A.listDemoAccounts().length, active.length);
  assert.ok(A.listDemoAccounts().every(a => a.roleName && a.departmentName));
  const inactive = R.state.roster.find(e => e.status !== 'active');
  assert.equal(A.resolveDemoAccount(inactive.id), null);
  assert.equal(S.select(inactive.id), null, 'cannot sign in as an invited/disabled employee');
  assert.equal(S.current(), null);
  const finance = active.find(e => e.role === 'finance');
  assert.equal(S.select(finance.id).id, finance.id);
  assert.equal(store.get('hs_admin_demo_session'), finance.id);
  assert.equal(R.state.actor, 'finance', 'RBAC pages act with the selected employee role');
  assert.equal(S.current().id, finance.id);
  S.clear();
  assert.equal(S.current(), null);
  assert.equal(R.state.actor, 'admin', 'back to the store default actor');
});

test('app bootstrap: picker escapes roster text; the shell yields its auto-mount to the app', () => {
  const c = { console }; c.globalThis = c; vm.createContext(c);
  vm.runInContext(read('apps/admin/app.js'), c);
  const html = c.HSAdminApp.pickerHtml([{ id: 'e1', name: '<img src=x>', roleName: 'مالك', departmentName: 'الإدارة العليا' }]);
  assert.match(html, /data-adm-login="e1"/); assert.match(html, /&lt;img src=x&gt;/); assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /لا توجد مصادقة فعلية/);
  assert.match(c.HSAdminApp.accountHtml({ name: 'ريم' }, 'مسؤول'), /data-adm-switch/);
  assert.match(read('apps/admin/admin-shell.js'), /if \(root\.HSAdminApp\) return;/);
});

test('shell: setAccess hides disallowed items from the nav model and renders a denied state', () => {
  const src = read('apps/admin/admin-shell.js');
  assert.match(src, /NavBuilder\.build\(NAV, \{ isRegistered: \(id\) => !!pages\[id\], canView: \(id\) => canViewRoute\(id\) \}\)/);
  assert.match(src, /if \(denied\) \{ mountContent\(stateView\.denied\(\)\); \}/);
  const shell = require(path.join(ROOT, 'apps/admin/admin-shell.js'));
  assert.equal(typeof shell.setAccess, 'function');
  assert.equal(shell.canView('roles'), true, 'default: everything visible until the app installs a guard');
});
