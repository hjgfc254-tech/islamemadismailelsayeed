'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const html = read('apps/admin/index.html');
const shell = require('../../apps/admin/admin-shell.js');
const navIds = new Set(shell._internals.flatItems().map((x) => x.id).concat(Object.keys(shell._internals.HIDDEN_PAGES)));

function scriptPaths(source) {
  return [...source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
}
function resolveFromHtml(src) {
  return path.normalize(path.join('apps/admin', src));
}

test('admin entry contains no duplicate local script references', () => {
  const refs = scriptPaths(html).filter((x) => !/^https?:/i.test(x));
  assert.equal(new Set(refs).size, refs.length);
});

test('every local admin script reference resolves to a real file', () => {
  const refs = scriptPaths(html).filter((x) => !/^https?:/i.test(x));
  const missing = refs.map(resolveFromHtml).filter((p) => !exists(p));
  assert.deepEqual(missing, []);
});

test('every page module that registers itself is loaded by the admin entry', () => {
  const pageDir = path.join(root, 'apps/admin/pages');
  const files = fs.readdirSync(pageDir).filter((x) => x.endsWith('.page.js'));
  const missing = files.filter((file) => {
    const src = fs.readFileSync(path.join(pageDir, file), 'utf8');
    return /registerPage\s*\(/.test(src) && !html.includes(`pages/${file}`);
  });
  assert.deepEqual(missing, []);
});

test('every registered admin page id exists in the navigation model', () => {
  const pageDir = path.join(root, 'apps/admin/pages');
  const files = fs.readdirSync(pageDir).filter((x) => x.endsWith('.page.js'));
  const invalid = [];
  for (const file of files) {
    const src = fs.readFileSync(path.join(pageDir, file), 'utf8');
    const match = src.match(/registerPage\s*\(\s*['"]([^'"]+)['"]/);
    if (match && !navIds.has(match[1]) && match[1] !== 'employee-details') invalid.push(`${file}:${match[1]}`);
  }
  assert.deepEqual(invalid, []);
});

test('shared design system styles load before admin-specific styles', () => {
  const refs = [...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css)["'][^>]*>/gi)].map((m) => m[1]);
  const design = refs.findIndex((x) => x.includes('design-system.css'));
  const admin = refs.findIndex((x) => x === 'styles/admin.css');
  const components = refs.findIndex((x) => x === 'styles/admin-components.css');
  const responsive = refs.findIndex((x) => x === 'styles/admin-responsive.css');
  assert(design >= 0 && admin > design && components > admin && responsive > components);
});

test('shared dependencies load before all pages that consume them', () => {
  const refs = scriptPaths(html);
  const order = [
    'shared/icons/icon-registry.js',
    'shared/components/status-badge.js',
    'shared/components/data-grid.js',
    'shared/components/dialogs.js',
    'shared/components/accessible-tabs.js',
    'shared/utils/tree.js',
    'shared/utils/money.js',
    'admin-shell.js',
    'pages/finance-dashboard.page.js',
    'pages/commissions.page.js',
    'pages/settlements.page.js',
    'pages/reports.page.js',
    'pages/audit-log.page.js',
    'pages/security.page.js',
    'pages/system-settings.page.js',
    'pages/orders-management.page.js',
    'pages/quotes-management.page.js',
    'pages/super-dashboard.page.js'
  ].map((x) => refs.findIndex((r) => r.endsWith(x)));
  assert(order.every((x) => x >= 0));
  assert.deepEqual(order, order.slice().sort((a, b) => a - b));
});

test('finance pages use the single shared money utility', () => {
  const finance = read('apps/admin/pages/finance-dashboard.page.js');
  const commissions = read('apps/admin/pages/commissions.page.js');
  const settlements = read('apps/admin/pages/settlements.page.js');
  const money = read('shared/utils/money.js');
  assert.match(money, /HSMoney/);
  for (const src of [finance, commissions, settlements]) assert.match(src, /HSMoney|require\([^)]*money\.js/);
});

test('financial demo pages explicitly disclose simulation and absence of real transfers', () => {
  for (const file of ['finance-dashboard.page.js', 'commissions.page.js', 'settlements.page.js']) {
    const src = read(`apps/admin/pages/${file}`);
    assert.match(src, /تجريبي|محاكاة/);
    if (file === 'finance-dashboard.page.js') assert.match(src, /لا يتم تنفيذ أي دفع أو تحصيل أو تسوية/);
    if (file === 'commissions.page.js') assert.match(src, /لا تُطبَّق النسبة على أي طلب حقيقي/);
    if (file === 'settlements.page.js') assert.match(src, /لا يتم تحويل أي مبلغ/);
  }
});

test('financial demo pages do not expose direct network or database calls', () => {
  for (const file of ['finance-dashboard.page.js', 'commissions.page.js', 'settlements.page.js']) {
    const src = read(`apps/admin/pages/${file}`);
    assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|WebSocket|firebase|firestore/i, file);
  }
});

test('all navigation ids are unique and labels are present', () => {
  const items = shell._internals.flatItems();
  assert.equal(new Set(items.map((x) => x.id)).size, items.length);
  assert(items.every((x) => typeof x.label === 'string' && x.label.trim().length > 0));
});

test('every admin menu item and hidden page has a registered page module (no placeholder left in the menu)', () => {
  const src = fs.readdirSync(path.join(root, 'apps/admin/pages')).filter((x) => x.endsWith('.page.js')).map((f) => read('apps/admin/pages/' + f)).join('\n');
  const ids = shell._internals.flatItems().map((x) => x.id).concat(Object.keys(shell._internals.HIDDEN_PAGES || { 'employee-details': 1 }));
  ids.forEach((id) => assert.match(src, new RegExp("registerPage\\(\\s*'" + id + "'"), 'no page registers ' + id));
});

test('all active page registrations are unique at source level', () => {
  const pageDir = path.join(root, 'apps/admin/pages');
  const files = fs.readdirSync(pageDir).filter((x) => x.endsWith('.page.js'));
  const ids = [];
  for (const file of files) {
    const src = fs.readFileSync(path.join(pageDir, file), 'utf8');
    const match = src.match(/registerPage\s*\(\s*['"]([^'"]+)['"]/);
    if (match) ids.push(match[1]);
  }
  assert.equal(new Set(ids).size, ids.length, `duplicate page registrations: ${ids.join(', ')}`);
});

test('admin entry keeps RTL document semantics and a unique shell mount point', () => {
  assert.match(html, /<html[^>]*lang=["']ar["'][^>]*dir=["']rtl["']/i);
  assert.equal((html.match(/id=["']admin-app["']/g) || []).length, 1);
  assert.match(html, /data-admin-shell/);
});

test('handoff records completed design/icon audits and the completed responsive browser sweep', () => {
  const handoff = read('docs/HANDOFF_NEXT_AI.md');
  const order = read('docs/AI_NEXT_IMPLEMENTATION_ORDER.md');
  assert.match(handoff, /آخر مهمة مكتملة: Design System Audit/);
  assert.match(handoff, /PHASE 5 \/ TASK 03 مكتملة/);
  assert.match(handoff, /TASK 04: Customer Bottom Sheet \+ home\/dedicated Search \+ guide carousel \+ Request Wizard \+ account-label accessibility دفعة واحدة منفذة ومختبرة جزئيًا/);
  assert.match(handoff, /استكمال فحص Customer \(addresses\/orders\/tracking\/support\/details\).*Provider.*Admin/s);
  assert.match(order, /✅[^\n]{0,80}super-dashboard\.page\.js/);
  assert.match(order, /منجز[^\n]{0,180}تدقيق نظام التصميم/);
  assert.match(order, /3\. ✅ \*\*منجز \(2026-11-13\)\*\*[^\n]{0,300}Responsive browser sweep/);
  assert.match(order, /4\. 🟡 \*\*قيد التنفيذ \(2026-11-13\)\*\*[^\n]{0,320}Keyboard & Accessibility Sweep/);
  assert.match(read('apps/admin/pages/super-dashboard.page.js'), /STATUS: IMPLEMENTED \(DEMO\)/);
  assert.match(read('apps/admin/pages/quotes-management.page.js'), /STATUS: IMPLEMENTED \(DEMO\)/);
  assert.match(read('apps/admin/pages/system-settings.page.js'), /STATUS: IMPLEMENTED \(DEMO\)/);
  assert.match(read('apps/admin/pages/security.page.js'), /STATUS: IMPLEMENTED \(DEMO\)/);
  assert.match(read('apps/admin/pages/audit-log.page.js'), /STATUS: IMPLEMENTED \(DEMO\)/);
  assert.match(read('apps/admin/pages/settlements.page.js'), /STATUS: IMPLEMENTED \(DEMO\)/);
  assert.match(read('apps/admin/pages/reports.page.js'), /STATUS: IMPLEMENTED \(DEMO\)/);
});

test('reports page registers after its data sources and discloses demo-only, local-only export', () => {
  const src = read('apps/admin/pages/reports.page.js');
  assert.match(src, /registerPage\(\s*'reports'/);
  assert.match(src, /لم يُرسل إلى أي جهة/);
  assert.match(src, /لا يتم تنفيذ أي دفع أو تحصيل أو تسوية/);
  assert.match(read('apps/admin/styles/admin-components.css'), /\.rep-table/);
});
