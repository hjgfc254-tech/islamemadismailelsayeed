'use strict';
/* Security audit 2026-11-27:
   1. alert / ticket links accept in-app hash routes only (no stored `javascript:` link that runs on a colleague's click);
   2. a customer cannot delete the account with an open request; the kept requests lose the personal data (law 151/2020);
   3. the customer app only follows a Paymob checkout URL;
   4. hosting sends a Permissions-Policy and a tighter CSP. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const C = require(path.join(ROOT, 'apps/admin/modules/ops-core.js'));

test('ops links: only #/ routes survive (tickets and alerts)', () => {
  for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'https://evil.example/x', '//evil.example', 'data:text/html,<b>x</b>', '#/x" onmouseover="alert(1)']) {
    assert.equal(C.safeLink(bad), '', bad);
    const t = C.createTicket({ title: 'بلاغ تجريبي', link: bad }, { id: 'u1', name: 'م' }, Date.now(), 'tk1');
    assert.equal(t.ticket.link, '', 'ticket link dropped: ' + bad);
    assert.equal(C.normalizeEvent({ title: 'تنبيه', link: bad }).link, '', 'alert link dropped: ' + bad);
  }
  for (const good of ['#/order/r_1', '#/order/r_1?complaint=k_2', '#/provider/p1?collect=1', '#/complaints']) assert.equal(C.safeLink(good), good);
  assert.match(read('apps/admin/modules/ops-center.js'), /safeHref\(a\.link\)[\s\S]*safeHref\(t\.link\)/, 'records stored before the check are not rendered as links either');
});

function customerApi() {
  const ctx = { console, Date, Math, JSON, Promise, URLSearchParams, encodeURIComponent };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['services/api-client.js', 'services/customer-api.js']) vm.runInContext(read(f), ctx);
  const db = { customers: [{ id: 'c1', name: 'سارة', phone: '01011112222' }], addresses: [{ id: 'a1', customerId: 'c1' }], favorites: [],
    serviceRequests: [{ id: 'r1', customerId: 'c1', status: 'closed', name: 'سارة', phone: '01011112222', addr: 'ش 1', geo: { lat: 30, lng: 31 }, photos: ['data:x'] },
      { id: 'r2', customerId: 'c1', status: 'scheduled', name: 'سارة', phone: '01011112222', addr: 'ش 1' }] };
  ctx.HSApiClient.setStore({ db: () => db, save() {}, get: (k, id) => (db[k] || []).find((x) => x.id === id) || null });
  ctx.HSApiClient.setActorResolver(() => ({ role: 'customer', id: 'c1' }));
  return { A: ctx.HSCustomerApi, db };
}

test('account deletion: refused with an open request; past requests are anonymised', async () => {
  const { A, db } = customerApi();
  const r1 = await A.deleteMe();
  assert.equal(r1.status, 409); assert.match(r1.error.message, /طلب لسه شغال/);
  assert.equal(db.customers.length, 1, 'nothing deleted');
  db.serviceRequests[1].status = 'cancelled';
  const r2 = await A.deleteMe();
  assert.equal(r2.ok, true);
  assert.equal(db.customers.length, 0);
  for (const r of db.serviceRequests) { assert.equal(r.phone, ''); assert.equal(r.addr, ''); assert.equal(r.name, 'عميل محذوف'); assert.equal(r.geo, null); assert.deepEqual([...r.photos], []); }
  assert.match(read('functions/src/plan.js'), /ld\.where\('serviceRequests', \[\['customerId', '==', actor\.id\]\], \{ limit: 300 \}\)/, 'the server loads the requests the rule reads');
});

test('payment redirect: only the Paymob checkout host', () => {
  assert.match(read('apps/customer/pages/payment-card.js'), /\/\^https:\\\/\\\/accept\\\.paymob\\\.com\\\/\/\.test\(String\(d\.checkoutUrl\)\)/);
});

test('no inline code in the served pages (CSP-ready); boot files are cached by the service worker', () => {
  const pages = ['index.html', 'apps/customer/index.html', 'apps/provider/index.html', 'apps/admin/index.html', 'apps/provider/login.html', 'apps/admin/login.html'];
  for (const f of pages) {
    const t = read(f);
    assert.equal((t.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).length, 0, f + ': inline <script>');
    assert.doesNotMatch(t, /\son(load|click|error|submit|change)=/, f + ': inline event handler');
  }
  assert.doesNotMatch(read('apps/customer/app.js'), /onerror="/, 'generated markup carries no inline handler');
  const sw = read('service-worker.js');
  for (const f of ['apps/customer/boot-head.js', 'apps/customer/boot-home.js', 'shared/boot/async-fonts.js', 'shared/boot/frame-guard.js', 'shared/boot/sw-register.js', 'shared/boot/redirect.js']) assert.ok(sw.includes(`'${f}'`), f);
});

test('CSP reports: both report formats become scrubbed «csp» client-error groups per app', () => {
  const T = require(path.join(ROOT, 'functions/src/telemetry.js'));
  const legacy = T.cspToReports({ 'csp-report': { 'document-uri': 'https://hansalahlak.web.app/apps/admin/index.html', 'violated-directive': 'script-src-elem', 'blocked-uri': 'https://evil.example/x.js?token=abc' } });
  assert.equal(legacy[0].app, 'admin');
  assert.equal(legacy[0].r.kind, 'csp');
  assert.equal(legacy[0].r.msg, 'CSP: script-src-elem blocked https://evil.example', 'origin only — no path or query');
  const modern = T.cspToReports([{ type: 'csp-violation', body: { documentURL: 'https://x/apps/provider/index.html', effectiveDirective: 'connect-src', blockedURL: 'wss://y.example/socket' } }, { type: 'deprecation', body: {} }]);
  assert.equal(modern.length, 1); assert.equal(modern[0].app, 'provider'); assert.match(modern[0].r.msg, /connect-src blocked wss:\/\/y\.example/);
  assert.deepEqual(T.cspToReports({ nothing: 1 }), []);
  const fb = JSON.parse(read('firebase.json')).hosting;
  assert.ok(fb.rewrites.some((r) => r.source === '/csp-report' && r.function.functionId === 'cspReport'));
  const ro = fb.headers.find((h) => h.source === '**').headers.find((h) => h.key === 'Content-Security-Policy-Report-Only').value;
  assert.match(ro, /script-src 'self'/); assert.doesNotMatch(ro, /script-src[^;]*'unsafe-inline'/, 'no inline scripts allowed'); assert.match(ro, /report-uri \/csp-report/);
});

test('hosting headers: Permissions-Policy and a tighter CSP', () => {
  const all = JSON.parse(read('firebase.json')).hosting.headers.find((h) => h.source === '**').headers;
  const get = (k) => (all.find((h) => h.key === k) || {}).value || '';
  assert.match(get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.match(get('Content-Security-Policy'), /object-src 'none'/);
  assert.match(get('Permissions-Policy'), /microphone=\(\)/);
  assert.match(get('Permissions-Policy'), /geolocation=\(self\)/);
});
