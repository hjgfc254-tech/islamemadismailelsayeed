'use strict';
/* Provider P0 — route and deep-link behavior for the standalone Provider app. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, offerRequest, entryScripts } = require('../helpers/provider-app-harness.js');

const PROVIDER = 'p_demo1';
const TAB_ROUTES = ['home', 'new', 'accepted', 'progress', 'quote', 'schedule', 'done', 'reviews', 'transactions', 'earnings', 'services', 'notifications', 'profile'];
const activeRoute = app => (/data-pv-route="([^"]+)" class="is-active[^"]*" aria-current="page"/.exec(app.navHtml()) || [])[1];

test('harness loads exactly the production script list of apps/provider/index.html, app.js last', async () => {
  const scripts = entryScripts();
  assert.equal(scripts.at(-1), 'apps/provider/app.js');
  assert.equal(scripts.filter(s => s.includes('/pages/')).length, 12);
  assert.ok(!scripts.some(s => s.includes('legacy/') || s.includes('apps/customer/') || s.endsWith('provider-workspace.js')),
    'standalone entry must not load Customer scripts or the legacy bridge');
});

test('an empty hash boots to #/home', async () => {
  const app = boot({ session: PROVIDER });
  assert.equal(app.location.hash, '#/home');
  assert.equal(activeRoute(app), 'home');
});

test('four destinations; every older route opens inside one of them and lights its tab', async () => {
  const app = boot({ session: PROVIDER });
  assert.equal((app.navHtml().match(/data-pv-route=/g) || []).length, 4);
  const TAB = { home: 'home', new: 'home', accepted: 'home', progress: 'home', quote: 'home', schedule: 'home', done: 'home', cancelled: 'home', earnings: 'earnings', transactions: 'earnings', reviews: 'reviews', profile: 'profile', services: 'profile' };
  for (const [route, tab] of Object.entries(TAB)) {
    app.go('#/' + route);
    assert.equal(activeRoute(app), tab, route);
    assert.equal((app.navHtml().match(/aria-current="page"/g) || []).length, 1, route);
    assert.ok(app.html().length > 0, route);
  }
  app.go('#/notifications');
  assert.equal(activeRoute(app), undefined, 'notifications live behind the bell, not a tab');
  assert.match(app.html(), /الإشعارات/);
});

test('الطلبات: three filters with counts; older group routes select the matching filter', async () => {
  let rid;
  const app = boot({ session: PROVIDER, setup: ({ MP }) => { rid = offerRequest(MP, PROVIDER).id; MP.respond(rid, true); } });
  app.go('#/accepted');
  assert.match(app.html(), /data-pv-route="progress" class="is-on" aria-pressed="true">شغالة <b>١<\/b>/);
  assert.match(app.html(), new RegExp('data-pv-route="request/' + rid));
  app.go('#/done');
  assert.match(app.html(), /data-pv-route="done" class="is-on"/);
  assert.match(app.html(), /لسه ما خلصتش طلبات/);
  app.go('#/home');
  assert.match(app.html(), /data-pv-route="progress" class="is-on"/, 'home opens the filter that has work in it');
});

test('nav clicks navigate through the hash router', async () => {
  const app = boot({ session: PROVIDER });
  await app.click({ 'data-pv-route': 'earnings' });
  assert.equal(app.location.hash, '#/earnings');
  assert.equal(activeRoute(app), 'earnings');
});

test('unknown routes and query strings fall back safely', async () => {
  const app = boot({ session: PROVIDER });
  app.go('#/does-not-exist');
  assert.equal(activeRoute(app), 'home');
  app.go('#/new?ref=push');
  assert.equal(activeRoute(app), 'home');
  app.go('#services');
  assert.equal(activeRoute(app), 'profile', 'services opens inside حسابي');
  assert.equal(app.ctx.HSProviderRouter.navigate('admin'), undefined);
  assert.equal(app.location.hash, '#/home', 'navigate() never writes an unsupported route');
});

test('request details deep link renders the request card and a back control', async () => {
  let rid;
  const app = boot({ session: PROVIDER, setup: ({ MP }) => { rid = offerRequest(MP, PROVIDER).id; } });
  app.go('#/request/' + encodeURIComponent(rid));
  assert.match(app.html(), /تفاصيل الطلب/);
  assert.ok(app.has({ 'data-pv-action': 'accept', 'data-id': rid }));
  assert.ok(app.has({ 'data-pv-route': 'home' }));
});

test('the details control on a request card opens that request', async () => {
  let rid;
  const app = boot({ session: PROVIDER, setup: ({ MP }) => { rid = offerRequest(MP, PROVIDER).id; } });
  app.go('#/new');
  await app.click({ 'data-pv-route': 'request/' + encodeURIComponent(rid) });
  assert.equal(app.location.hash, '#/request/' + encodeURIComponent(rid));
  assert.match(app.html(), /تفاصيل الطلب/);
});

test('request details for a missing, unknown, malformed or foreign id shows not-found', async () => {
  let foreign;
  const app = boot({ session: PROVIDER, setup: ({ MP }) => {
    offerRequest(MP, PROVIDER);
    foreign = offerRequest(MP, 'p_demo2', { cat: 'plumbing', phone: '01000000002' }).id;
  } });
  for (const hash of ['#/request', '#/request/', '#/request/r_unknown', '#/request/%E0%A4%A', '#/request/' + foreign]) {
    app.go(hash);
    assert.match(app.html(), /الطلب غير موجود ضمن طلبات هذا الحساب/, hash);
    assert.ok(app.has({ 'data-pv-route': 'home' }), hash);
  }
});

test('a deep link survives reload while the demo session exists', async () => {
  let rid;
  const first = boot({ session: PROVIDER, setup: ({ MP }) => { rid = offerRequest(MP, PROVIDER).id; } });
  first.go('#/request/' + rid);
  // Reload: same sessionStorage session, same persisted localStorage store, same hash.
  const reloaded = boot({ session: PROVIDER, hash: '#/request/' + rid, store: first.local.getItem('hs_mp_db') });
  assert.equal(reloaded.location.hash, '#/request/' + rid);
  assert.match(reloaded.html(), /تفاصيل الطلب/);
  assert.ok(reloaded.has({ 'data-pv-action': 'accept', 'data-id': rid }));
});

test('a deep link without a demo session shows the account picker, not request data', async () => {
  let rid;
  const app = boot({ hash: '#/request/x', setup: ({ MP }) => { rid = offerRequest(MP, PROVIDER).id; } });
  app.go('#/request/' + rid);
  assert.match(app.html(), /pv-account-list/);
  assert.doesNotMatch(app.html(), /تركيب لوحة كهرباء/);
});
