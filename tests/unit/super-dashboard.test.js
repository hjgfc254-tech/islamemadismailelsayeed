'use strict';
const path = require('path'), fs = require('fs'), assert = require('assert');
const root = path.join(__dirname, '../..');
let passed = 0; const test = (n, f) => { try { f(); passed++; console.log('✓ ' + n); } catch (e) { console.error('✗ ' + n + '\n ' + e.message); process.exitCode = 1; } };
const page = (f) => require(path.join(root, 'apps/admin/pages/' + f + '.page.js'));
const O = page('orders-management'), P = page('providers-management'), C = page('customers-management'), Q = page('quotes-management'), CP = page('complaints-management'),
  R = page('reviews-management'), ST = page('settlements'), F = page('finance-dashboard'), SEC = page('security'), A = page('audit-log'), SS = page('system-settings');
const S = page('super-dashboard');
const SHELL_NAV = require(path.join(root, 'apps/admin/admin-shell.js')).NAV;
const money = require(path.join(root, 'shared/utils/money.js'));
const nf = (n) => new Intl.NumberFormat('ar-EG').format(n);
const kp = (m, id) => m.kpis.find((k) => k.id === id);
const readers = (over) => Object.assign({}, S.SOURCES, over || {});
const zero = {
  orders: () => ({ total: 0, new: 0, active: 0, done: 0, problem: 0 }), providers: () => ({ total: 0, approved: 0, pending: 0, suspended: 0, rejected: 0 }),
  customers: () => ({ total: 0, active: 0, inactive: 0, suspended: 0, spent: 0 }), quotes: () => ({ total: 0, awaiting: 0, expired: 0, approved: 0, returned: 0, rejected: 0, approvedAmount: 0 }),
  complaints: () => ({ total: 0, new: 0, review: 0, hot: 0, resolved: 0 }), reviews: () => ({ total: 0, published: 0, flagged: 0, hidden: 0, average: null }),
  settlements: () => ({ total: 0, settled: 0, outstanding: 0, onHold: 0, discrepancyCount: 0, discrepancyAmount: 0 }),
  finance: () => ({ commission: 0, uncollected: 0, discrepancyCount: 0 }), security: () => ({ openAlerts: 0, critical: 0, activeSessions: 0, failedLogins: 0 }),
  audit: () => ({ total: 0, success: 0, denied: 0, failed: 0 }), settings: () => ({ platformName: 'منصة', maintenance: false, providerApproval: true, taxEnabled: false, taxRatePct: 14 })
};

test('every KPI is derived from the implemented pages (no copied numbers)', () => {
  const m = S.buildModel();
  const o = O.counts(O._orders()), p = P.counts(P._providers()), c = C.counts(C._customers()), q = Q.counts(Q._quotes()), cp = CP.counts(CP._items()),
    st = ST.totals(ST._settlements()), f = F.buildModel('30', 'all').totals, s = SEC.counts();
  assert.strictEqual(kp(m, 'orders').value, o.total); assert.strictEqual(kp(m, 'providers').value, p.approved); assert.strictEqual(kp(m, 'customers').value, c.total);
  assert.strictEqual(kp(m, 'quotes').value, q.awaiting); assert.strictEqual(kp(m, 'complaints').value, cp.new + cp.review);
  assert.strictEqual(kp(m, 'commission').value, f.commission); assert.strictEqual(kp(m, 'commission').valueText, money.format(f.commission));
  assert.strictEqual(kp(m, 'dues').value, st.outstanding); assert.strictEqual(kp(m, 'security').value, s.openAlerts);
  assert.deepStrictEqual(m.unavailable, []); assert.strictEqual(m.kpis.length, 8);
  assert(o.total > 0 && p.approved > 0, 'fixtures must be non-trivial');
});
test('attention items equal the source counters and each links to a real NAV page', () => {
  const m = S.buildModel(), ids = new Set(SHELL_NAV.reduce((a, g) => a.concat(g.items.map((i) => i.id)), []).concat(Object.keys(require(path.join(root, 'apps/admin/admin-shell.js'))._internals.HIDDEN_PAGES)));
  const by = (id) => m.attention.find((a) => a.id === id);
  assert.strictEqual(by('sec-critical').count, SEC.counts().critical); assert.strictEqual(by('complaints-hot').count, CP.counts(CP._items()).hot);
  assert.strictEqual(by('orders-problem').count, O.counts(O._orders()).problem); assert.strictEqual(by('providers-pending').count, P.counts(P._providers()).pending);
  assert.strictEqual(by('settlement-disc').count, ST.totals(ST._settlements()).discrepancyCount);
  m.attention.forEach((a) => { assert(a.count > 0); assert(ids.has(a.module), a.module); assert(a.text.includes(nf(a.count)) || a.id === 'maintenance'); });
});
test('attention is ordered danger → warning → info and the platform state follows the worst level', () => {
  const m = S.buildModel(), rank = { danger: 0, warning: 1, info: 2 };
  assert.deepStrictEqual(m.attention.map((a) => rank[a.level]), m.attention.map((a) => rank[a.level]).slice().sort((x, y) => x - y));
  assert.strictEqual(m.health, 'critical');
  const w = S.buildModel(S.readSources(readers(Object.assign({}, zero, { providers: () => ({ total: 3, approved: 1, pending: 2, suspended: 0, rejected: 0 }) }))));
  assert.strictEqual(w.health, 'attention');
});
test('all-zero sources: stable, no attention items, no invented values', () => {
  const m = S.buildModel(S.readSources(zero));
  assert.strictEqual(m.health, 'stable'); assert.deepStrictEqual(m.attention, []); assert.deepStrictEqual(m.unavailable, []);
  m.kpis.forEach((k) => { assert.strictEqual(k.value, 0); assert.strictEqual(k.tone, ''); });
});
test('an unavailable source shows «غير متاح», is reported, and creates no attention item', () => {
  const m = S.buildModel(S.readSources(readers({ security: () => { throw new Error('boom'); } })));
  const k = kp(m, 'security');
  assert.strictEqual(k.value, null); assert.strictEqual(k.valueText, 'غير متاح'); assert.strictEqual(k.hint, '');
  assert.deepStrictEqual(m.unavailable, ['security']); assert.deepStrictEqual(m.unavailableLabels, ['الأمان']);
  assert(!m.attention.some((a) => a.module === 'security')); assert.notStrictEqual(m.health, 'error');
  assert(m.ops.some(([l, v]) => /الجلسات/.test(l) && v === 'غير متاح'));
  assert(/تعذّرت قراءة: الأمان/.test(S.viewHtml(m)));
});
test('every source failing is an error state, not an empty-looking dashboard', () => {
  const bad = {}; Object.keys(S.LABEL).forEach((k) => { bad[k] = () => { throw new Error('x'); }; });
  const m = S.buildModel(S.readSources(bad));
  assert.strictEqual(m.health, 'error'); assert.strictEqual(m.unavailable.length, Object.keys(S.LABEL).length);
  const html = S.viewHtml(m); assert(/role="alert"/.test(html)); assert(!/dash-kpis/.test(html));
});
test('the model follows the sources (live), and maintenance mode is surfaced as a simulated warning', () => {
  const a = S.buildModel(S.readSources(zero));
  const b = S.buildModel(S.readSources(Object.assign({}, zero, { orders: () => ({ total: 9, new: 1, active: 2, done: 3, problem: 3 }), settings: () => ({ platformName: 'م', maintenance: true, providerApproval: false, taxEnabled: true, taxRatePct: 14 }) })));
  assert.strictEqual(kp(a, 'orders').value, 0); assert.strictEqual(kp(b, 'orders').value, 9);
  const mt = b.attention.find((x) => x.id === 'maintenance'); assert(mt && /محاكاة/.test(mt.text) && mt.level === 'warning' && mt.module === 'settings');
  assert.deepStrictEqual(b.ops.slice(0, 3), [['وضع الصيانة', 'مفعّل (محاكاة)'], ['اعتماد المزود الجديد', 'غير مطلوب'], ['الضريبة', 'مفعّلة ١٤٪ (غير معتمدة بعد)']]);
});
test('module links: self excluded, only registered pages are links, the rest are disabled «قريبًا»', () => {
  const shell = { NAV: SHELL_NAV, isRegistered: (id) => id !== 'quotes' };   // the owner board is a tab of «الإحصائيات» now (not in NAV)
  const groups = S.modulesFor(shell), items = groups.reduce((x, g) => x.concat(g.items), []);
  assert(!items.some((i) => i.id === 'super-dashboard')); assert.strictEqual(items.find((i) => i.id === 'quotes').enabled, false);
  assert.strictEqual(items.find((i) => i.id === 'orders').enabled, true);
  assert.strictEqual(items.length, SHELL_NAV.reduce((n, g) => n + g.items.length, 0));
  global.HSAdminShell = shell;
  try { const html = S.viewHtml(S.buildModel(S.readSources(zero))); assert(/href="#\/orders"/.test(html)); assert(!/href="#\/quotes"/.test(html)); assert(/aria-disabled="true">عروض الأسعار <small>\(قريبًا\)<\/small>/.test(html.replace(/<span aria-hidden="true">[\s\S]*?<\/span>/g, ''))); }
  finally { delete global.HSAdminShell; }
});
test('rendered HTML escapes values and discloses demo/read-only', () => {
  const m = S.buildModel(S.readSources(Object.assign({}, zero, { settings: () => ({ platformName: '<img src=x onerror=alert(1)>', maintenance: false, providerApproval: true, taxEnabled: false, taxRatePct: 14 }) })));
  const html = S.viewHtml(m);
  assert(!/<img/.test(html)); assert(/&lt;img/.test(html)); assert(/للقراءة فقط/.test(html) && /بيانات تجريبية/.test(html));
});
test('source: registered as super-dashboard, loaded last in index.html, read-only, no network/storage/fixtures', () => {
  const src = fs.readFileSync(path.join(root, 'apps/admin/pages/super-dashboard.page.js'), 'utf8');
  assert.match(src, /registerPage\('super-dashboard'/); assert.match(src, /STATUS: IMPLEMENTED \(DEMO\)/);
  assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|firebase|firestore/i);
  assert.doesNotMatch(src, /<(button|form|input|select|textarea)\b/i, 'the page offers no controls that could change state');
  assert.doesNotMatch(src, /\.(applyTransition|setStatus|decide|transition|transitionAlert|revokeSession|applyChange|resetState)\(/, 'never mutates another page');
  const html = fs.readFileSync(path.join(root, 'apps/admin/index.html'), 'utf8'), refs = [...html.matchAll(/pages\/([a-z-]+)\.page\.js/g)].map((m) => m[1]);
  const me = refs.indexOf('super-dashboard'); assert(me >= 0 && me === refs.length - 1, 'must be the last page script');
  ['orders-management', 'providers-management', 'customers-management', 'quotes-management', 'complaints-management', 'reviews-management', 'settlements', 'finance-dashboard', 'security', 'audit-log', 'system-settings'].forEach((d) => assert(refs.indexOf(d) >= 0 && refs.indexOf(d) < me, d));
});
console.log('\n' + passed + ' passed');
