'use strict';
/* Customer router + session + guest policy/entry: pure module behavior and full-app deep-link integration. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boot, scripts, ROOT } = require('../helpers/customer-app-harness.js');

function load(files, extra = {}) {
  const mem = new Map();
  const ctx = { console, localStorage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) },
    sessionStorage: (() => { const s = new Map(); return { getItem: k => (s.has(k) ? s.get(k) : null), setItem: (k, v) => s.set(k, String(v)), removeItem: k => s.delete(k) }; })(),
    ...extra };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { ctx, mem };
}
const MODULES = ['apps/customer/customer-session.js', 'apps/customer/customer-router.js', 'apps/guest/guest-policy.js', 'apps/guest/guest-entry.js'];
const plain = v => JSON.parse(JSON.stringify(v));

test('the four modules are real code loaded by the Customer entry before the page scripts', async () => {
  const list = scripts();
  for (const f of MODULES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /STATUS:\s*PLACEHOLDER|No functional implementation/, `${f} must not be a placeholder`);
    assert.ok(list.includes(f), `${f} loaded by apps/customer/index.html`);
    assert.ok(list.indexOf(f) > list.indexOf('services/local-market-store.js') && list.indexOf(f) < list.indexOf('apps/customer/app.js'), `${f} loads after MP and before app.js`);
  }
});

test('router parses and formats every supported deep link and rejects everything else', async () => {
  const R = load(['apps/customer/customer-router.js']).ctx.HSCustomerRouter;
  for (const tab of ['home', 'sections', 'search', 'orders', 'account']) {
    assert.deepEqual(plain(R.parse('#/' + tab)), { screen: tab, tab });
    assert.equal(R.format(tab), '#/' + tab);
  }
  assert.deepEqual(plain(R.parse('#/track/r_abc-1')), { screen: 'tracking', id: 'r_abc-1', tab: 'orders' });
  assert.deepEqual(plain(R.parse('#/provider/p_demo1')), { screen: 'providerDetails', id: 'p_demo1', tab: 'home' });
  assert.deepEqual(plain(R.parse('#orders/')), { screen: 'orders', tab: 'orders' }, 'tolerates missing slash and trailing slash');
  assert.deepEqual(plain(R.parse('#/orders?from=push')), { screen: 'orders', tab: 'orders' }, 'ignores query');
  assert.equal(R.format('tracking', 'r_1'), '#/track/r_1');
  assert.equal(R.format('providerDetails', 'p_demo1'), '#/provider/p_demo1');
  for (const bad of ['', '#', '#/', '#/admin', '#/track', '#/track/', '#/track/a/b', '#/orders/x', '#/track/%E0%A4%A', '#/track/<script>', '#/track/' + 'x'.repeat(65)]) {
    assert.equal(R.parse(bad), null, bad);
  }
  for (const [screen, id] of [['details', 'electric'], ['tracking'], ['tracking', 'bad id'], ['providerDetails', '']]) assert.equal(R.format(screen, id), '', `${screen} has no deep link`);
  assert.equal(R.format('wizard'), '#/request', 'the wizard screen is the request-create route');
});

test('router sync mirrors the screen with replaceState only when the hash changes', async () => {
  const calls = [];
  const location = { hash: '' };
  const history = { state: { tab: 'x' }, replaceState: (s, t, url) => { calls.push([s, url]); location.hash = url; } };
  const R = load(['apps/customer/customer-router.js'], { location, history }).ctx.HSCustomerRouter;
  assert.equal(R.sync('orders'), '#/orders');
  assert.deepEqual(calls, [[{ tab: 'x' }, '#/orders']], 'keeps history.state');
  R.sync('orders');
  assert.equal(calls.length, 1, 'no write when unchanged');
  assert.equal(R.sync('details', 'electric'), '');
  assert.equal(calls.length, 1, 'non-routable screens leave the URL alone');
});

test('session validates, signs in (creating the local customer), updates and signs out on the existing hs_user key', async () => {
  const { ctx, mem } = load(['shared/icons/icon-registry.js', 'shared/config/legacy-data.js', 'services/local-catalog.js', 'services/local-market-store.js', 'apps/customer/customer-session.js']);
  const S = ctx.HSCustomerSession;
  assert.equal(S.KEY, 'hs_user');
  assert.match(S.validate('', '01011112222'), /الاسم/);
  assert.match(S.validate('x'.repeat(81), '01011112222'), /الاسم/);
  assert.match(S.validate('سارة', '123'), /الهاتف/);
  assert.equal(S.validate('سارة', '010 1111 2222'), '');
  assert.equal(S.signIn('سارة', 'abc').ok, false);
  assert.equal(S.current(), null);
  const res = S.signIn('  سارة  ', ' 01011112222 ');
  assert.equal(res.ok, true);
  assert.deepEqual(JSON.parse(mem.get('hs_user')), { name: 'سارة', phone: '01011112222' });
  assert.equal(S.customer().phone, '01011112222', 'local MP customer record created and resolved');
  S.update({ name: 'سارة أحمد', phone: '01011112222' });
  assert.equal(S.current().name, 'سارة أحمد');
  S.update({ name: '', phone: 'bad' });
  assert.equal(S.current().name, 'سارة أحمد', 'invalid updates are ignored');
  S.signOut();
  assert.equal(S.current(), null);
  assert.equal(S.isSignedIn(), false);
  mem.set('hs_user', '{"name":5}');
  assert.equal(S.current(), null, 'malformed stored identity is treated as signed out');
});

test('guest policy: public screens open; orders/tracking need a customer; tracking needs ownership', async () => {
  const P = load(['apps/guest/guest-policy.js']).ctx.HSGuestPolicy;
  const MP = { get: (col, id) => ({ r1: { id: 'r1', customerId: 'c1' } })[id] || null };
  const me = { id: 'c1' }, other = { id: 'c2' };
  for (const screen of ['home', 'sections', 'search', 'account', 'providerDetails']) assert.equal(P.decide({ screen }, null, MP).allow, true, screen);
  assert.deepEqual(plain(P.decide({ screen: 'orders' }, null, MP)), { allow: false, reason: 'signin' });
  assert.deepEqual(plain(P.decide({ screen: 'tracking', id: 'r1' }, null, MP)), { allow: false, reason: 'signin' });
  assert.equal(P.decide({ screen: 'tracking', id: 'r1' }, me, MP).allow, true);
  assert.deepEqual(plain(P.decide({ screen: 'tracking', id: 'r1' }, other, MP)), { allow: false, reason: 'not-found' }, 'other customers cannot open it');
  assert.deepEqual(plain(P.decide({ screen: 'tracking', id: 'nope' }, me, MP)), { allow: false, reason: 'not-found' });
  assert.deepEqual(plain(P.decide(null, me, MP)), { allow: false, reason: 'not-found' });
});

test('guest entry resolves links, remembers the sign-in return target once', async () => {
  const { ctx } = load(['apps/customer/customer-router.js', 'apps/guest/guest-policy.js', 'apps/guest/guest-entry.js']);
  const E = ctx.HSGuestEntry;
  const MP = { get: () => ({ customerId: 'c1' }) };
  assert.equal(E.resolve('', null, MP), null, 'no deep link');
  assert.deepEqual(plain(E.resolve('#/orders', null, MP)), { screen: 'account', tab: 'account', signin: true, returnTo: '#/orders' });
  assert.deepEqual(plain(E.resolve('#/track/r1', { id: 'c1' }, MP)), { screen: 'tracking', id: 'r1', tab: 'orders' });
  assert.deepEqual(plain(E.resolve('#/nonsense', null, MP)), { screen: 'home', tab: 'home', notFound: true });
  E.rememberReturn('#/track/r1');
  assert.equal(E.consumeReturn(), '#/track/r1');
  assert.equal(E.consumeReturn(), '', 'one-shot');
});

/* ───────── full Customer app (real index.html script list) ───────── */
const SIGNED_IN = { hs_user: JSON.stringify({ name: 'سارة أحمد', phone: '01011112222' }) };
function withRequest(owner = SIGNED_IN) {
  // create the request through a first boot, then reboot with the persisted store + the deep link
  const first = boot({ local: owner });
  first.run("MP.customerFor('سارة أحمد','01011112222'); MP.customerFor('منى','01099998888')"); // owner + a second local customer
  const id = first.newRequest();
  return { id, store: first.local._map.get('hs_mp_db') };
}

test('app: the URL mirrors the current screen (tabs, tracking, provider details)', async () => {
  const app = boot({ local: SIGNED_IN });
  assert.equal(app.location.hash, '#/home');
  app.run("go('orders')");
  assert.equal(app.location.hash, '#/orders');
  const id = app.newRequest();
  await app.clickDoc({ track: id });
  assert.equal(app.location.hash, '#/track/' + id);
  app.run("show('details','electric')");
  assert.equal(app.location.hash, '#/track/' + id, 'screens without a deep link keep the last URL');
});

test('app: deep links open the right screen on boot for a signed-in customer', async () => {
  const { id, store } = withRequest();
  const orders = boot({ hash: '#/orders', local: { ...SIGNED_IN, hs_mp_db: store } });
  assert.match(orders.html(), /<h2 tabindex="-1">طلباتي<\/h2>/);
  assert.equal(orders.run('state.tab'), 'orders');
  const track = boot({ hash: '#/track/' + id, local: { ...SIGNED_IN, hs_mp_db: store } });
  assert.match(track.html(), /متابعة الطلب #HS-/);
  assert.equal(track.run('state.tab'), 'orders');
  assert.deepEqual(plain(track.run('state.stack')), ['track:' + id], 'Back returns to Orders like an in-app open');
  const prov = boot({ hash: '#/provider/p_demo1', local: SIGNED_IN });
  assert.match(prov.html(), /أحمد مصطفى/);
});

test('app: a guest opening a customer-only link is asked to sign in, then returned to the link', async () => {
  const { id, store } = withRequest();
  const app = boot({ hash: '#/track/' + id, local: { hs_mp_db: store } });
  assert.equal(app.run('state.tab'), 'account', 'sign-in screen shown instead of the request');
  assert.doesNotMatch(app.html(), /متابعة الطلب/);
  assert.match(app.toast(), /سجّل الدخول/);
  assert.equal(app.session._map.get('hs_return_to'), '#/track/' + id);
  await app.submitDoc('loginFormAcc', { name: 'سارة أحمد', phone: '01011112222' });
  assert.match(app.html(), /متابعة الطلب #HS-/, 'returned to the requested tracking page');
  assert.equal(app.session._map.has('hs_return_to'), false);
});

test('app: another customer cannot open a tracking link that is not theirs; unknown links fall back to home', async () => {
  const { id, store } = withRequest();
  const other = { hs_user: JSON.stringify({ name: 'منى', phone: '01099998888' }), hs_mp_db: store };
  const app = boot({ hash: '#/track/' + id, local: other });
  assert.doesNotMatch(app.html(), /متابعة الطلب/);
  assert.equal(app.run('state.tab'), 'home');
  assert.match(app.toast(), /الرابط غير متاح/);
  const bad = boot({ hash: '#/does-not-exist', local: SIGNED_IN });
  assert.equal(bad.run('state.tab'), 'home');
  assert.equal(bad.location.hash, '#/home', 'URL corrected to the shown screen');
});

test('app: editing the address bar (hashchange) navigates; sign-in validation uses the session rules', async () => {
  const app = boot({ local: SIGNED_IN });
  app.navigate('#/account');
  assert.equal(app.run('state.tab'), 'account');
  app.navigate('#/search');
  assert.equal(app.run('state.tab'), 'search');
  const guest = boot({ hash: '#/account' });
  await guest.submitDoc('loginFormAcc', { name: 'سارة', phone: '12' });
  assert.match(guest.toast(), /رقم الهاتف غير صحيح/);
  assert.equal(guest.local._map.get('hs_user') ?? null, null);
});

test('app: editing the address bar while a stacked screen is open still opens the typed link (popstate fires first)', async () => {
  const app = boot();
  app.run("startRequest()");                       // wizard open → state.stack = ['wizard']
  assert.equal(app.location.hash, '#/request');
  app.navigate('#/provider/p_demo1');              // popstate pops the wizard and re-renders home before hashchange
  assert.match(app.html(), /تفاصيل مقدم الخدمة/, 'the typed provider link wins');
  assert.equal(app.location.hash, '#/provider/p_demo1');
});

test('app: logout and account deletion clear the demo identity through the session module', async () => {
  const app = boot({ local: SIGNED_IN });
  app.run("MP.customerFor('سارة أحمد','01011112222'); go('account')");
  app.run('globalThis.HTMLElement = globalThis.HTMLElement || function HTMLElement() {}');
  await app.clickDoc({ accountLogout: '' });
  assert.match(app.run("document.getElementById('sheet').innerHTML"), /id="askForm"[^>]*data-kind="logout"/, 'confirmation sheet, not native confirm()');
  assert.ok(app.run('HSCustomerSession.current()'), 'nothing happens until confirmed');
  await app.submitDoc('askForm', {}, { kind: 'logout', id: 'session' });
  assert.equal(app.run('HSCustomerSession.current()'), null);
  assert.equal(app.local._map.get('hs_user'), 'null', 'same stored shape as before (store.set(user,null))');
});

test('account screen survives an unknown/stale tab key (falls back to orders instead of throwing)', () => {
  const app = boot({ local: SIGNED_IN });
  app.run("MP.customerFor('سارة أحمد','01011112222')");
  assert.doesNotThrow(() => app.run("state.accountTab='notifications'; show('account')"));
  assert.match(app.html(), /data-account-tab="orders"/);
});