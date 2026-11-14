'use strict';
/* Role isolation + legacy migration (2026-11-14). The Customer-loaded legacy bridge (apps/provider/legacy/portal-compat.js +
   apps/provider/provider-workspace.js) exposed Provider/Admin role switching inside the Customer app. Its Provider screen is
   covered by the standalone Provider app; its Admin console's live-data operations moved to apps/admin/pages/marketplace.page.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot: bootCustomer, scripts: customerScripts } = require('../helpers/customer-app-harness.js');
const { boot: bootProvider, entryScripts: providerScripts } = require('../helpers/provider-app-harness.js');

const ROOT = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const allFiles = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e => e.isDirectory() ? allFiles(path.join(dir, e.name)) : [path.join(dir, e.name).replace(/\\/g, '/')]);
const ADMIN_TRACE = /apps\/admin|admin\/index\.html|\/admin\b|لوحة الإدارة|مركز الإدارة|data-r="admin"|enterRole|screens\.admin/;

test('legacy bridge files are removed and no entry, worker or source references them', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'apps/provider/legacy/portal-compat.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'apps/provider/provider-workspace.js')), false);
  const runtime = ['apps/customer', 'apps/provider', 'apps/admin', 'apps/guest', 'shared', 'services'].flatMap(allFiles).filter(f => /\.(js|html)$/.test(f));
  const offenders = runtime.filter(f => /portal-compat|provider-workspace/.test(read(f).replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, '')));
  assert.deepEqual(offenders, []);
  assert.doesNotMatch(read('service-worker.js'), /portal-compat|provider-workspace/);
});

test('Customer app exposes no Admin navigation, controls, links or role switching', () => {
  const sources = allFiles('apps/customer').filter(f => /\.(js|html)$/.test(f));
  for (const f of sources) assert.doesNotMatch(read(f), ADMIN_TRACE, f);
  assert.ok(!customerScripts().some(s => s.startsWith('apps/admin/') || s.includes('legacy/')), 'Customer entry loads no Admin/legacy scripts');
  const app = bootCustomer({ local: { hs_user: JSON.stringify({ name: 'سارة', phone: '01011112222' }) } });
  app.run("MP.customerFor('سارة','01011112222')");
  for (const screen of ['home', 'sections', 'search', 'orders', 'account']) {
    app.run(`go('${screen}')`);
    assert.doesNotMatch(app.html(), ADMIN_TRACE, screen);
  }
  assert.equal(app.run("typeof enterRole"), 'undefined');
  assert.equal(app.run("typeof screens.admin"), 'undefined');
  assert.equal(app.run("typeof screens.provider"), 'undefined');
});

test('Provider app exposes no Admin navigation or controls', () => {
  for (const f of allFiles('apps/provider').filter(f => /\.(js|html)$/.test(f))) assert.doesNotMatch(read(f), ADMIN_TRACE, f);
  assert.ok(!providerScripts().some(s => s.startsWith('apps/admin/')));
  const app = bootProvider({ session: 'p_demo1' });
  for (const route of ['home', 'new', 'profile', 'services', 'earnings']) { app.go('#/' + route); assert.doesNotMatch(app.html() + app.navHtml(), ADMIN_TRACE, route); }
  const picker = bootProvider();
  assert.doesNotMatch(picker.html(), ADMIN_TRACE);
});

test('Customer offers a legitimate Provider onboarding invitation (menu + home), not a role switch', () => {
  const app = bootCustomer();
  assert.match(app.html(), /<a class="tag" href="\.\.\/provider\/index\.html#\/join">انضم كمقدم خدمة<\/a>/);
  assert.match(app.html(), /عايز تقدم خدماتك؟/);
  assert.match(read('apps/customer/app.js'), /<a class="menu-item" href="\.\.\/provider\/index\.html#\/join">\$\{ic\('wrench'\)\}عايز تقدم خدماتك؟ انضم كمقدم خدمة<\/a>/);
  assert.match(read('apps/provider/provider-router.js'), /'join'/);
});

test('Admin keeps its own restricted entry: picker + shell + guard; marketplace page is part of it', () => {
  const html = read('apps/admin/index.html');
  for (const s of ['admin-session.js', 'permission-guard.js', 'app.js', 'pages/marketplace.page.js', '../../services/local-market-store.js']) assert.ok(html.includes(`src="${s}"`), s);
  assert.ok(html.indexOf('local-market-store.js') < html.indexOf('pages/marketplace.page.js'));
  assert.ok(html.indexOf('pages/marketplace.page.js') < html.indexOf('pages/super-dashboard.page.js'), 'super-dashboard stays the last page');
  const shell = require(path.join(ROOT, 'apps/admin/admin-shell.js'));
  assert.ok(shell._internals.findItem('marketplace'));
  assert.equal(require(path.join(ROOT, 'apps/admin/permission-guard.js')).ROUTE_MODULE.marketplace, 'providers');
});

test('every legacy Admin console capability exists in the modern marketplace page on the shared store', () => {
  const src = read('apps/admin/pages/marketplace.page.js');
  const caps = {
    'approve provider registration': /data-mk="padmit"[\s\S]*M\.updateProvider\(id, \{ status: 'approved' \}\)/,
    'reject registration': /M\.updateProvider\(id, \{ status: 'rejected' \}\)/,
    'suspend / reactivate provider': /data-mk="psusp"/,
    'special commission rate': /specialRate: s === '' \? null : \+s/,
    'manual assignment with candidates': /M\.candidates\(r\)[\s\S]*M\.assign\(id, pid\)/,
    'auto-match': /data-mk="automatch"[\s\S]*M\.assign\(id\)/,
    'cancel before work starts': /M\.cancel\(id, 'إلغاء من الإدارة'\)/,
    'view current quote': /M\.currentQuote\(r\.id\)/,
    'suspend customer': /data-mk="csusp"/,
    'resolve complaint': /M\.resolveComplaint\(id, note\)/,
    'commission rates': /M\.setSetting\('defaultRate'[\s\S]*M\.setCatRate\(/,
    'collection status': /M\.setCollection\(/,
    'restore demo data': /M\.reset\(\)/
  };
  for (const [name, re] of Object.entries(caps)) assert.match(src, re, name);
  assert.doesNotMatch(src, /buildFixtures|FIXTURES/, 'operates on the shared MP store, not fixtures');
  const page = require(path.join(ROOT, 'apps/admin/pages/marketplace.page.js'));
  assert.deepEqual(page.summary({ providers: [{ status: 'pending' }, { status: 'approved' }], serviceRequests: [{ status: 'searching' }, { status: 'started' }], complaints: [{ status: 'open' }], transactions: [{ collection: 'pending' }, { collection: 'collected' }] }),
    { pending: 1, providers: 2, unassigned: 1, requests: 2, openComplaints: 1, uncollected: 1 });
});

test('Customer and Provider share one marketplace store: a customer request reaches the provider', () => {
  const owner = { hs_user: JSON.stringify({ name: 'سارة', phone: '01011112222' }) };
  const cust = bootCustomer({ local: owner });
  cust.run("MP.customerFor('سارة','01011112222'); MP.db().settings.autoAssign=false");
  const id = cust.newRequest('سارة', '01011112222');
  cust.run(`MP.assign('${id}','p_demo1')`);
  const prov = bootProvider({ session: 'p_demo1', store: cust.local._map.get('hs_mp_db') });
  prov.go('#/new');
  assert.ok(prov.has({ 'data-pv-action': 'accept', 'data-id': id }), 'the same request object, via the same hs_mp_db store');
});
