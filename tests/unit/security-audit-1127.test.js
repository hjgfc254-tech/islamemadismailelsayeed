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

test('hosting headers: Permissions-Policy and a tighter CSP', () => {
  const all = JSON.parse(read('firebase.json')).hosting.headers.find((h) => h.source === '**').headers;
  const get = (k) => (all.find((h) => h.key === k) || {}).value || '';
  assert.match(get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.match(get('Content-Security-Policy'), /object-src 'none'/);
  assert.match(get('Permissions-Policy'), /microphone=\(\)/);
  assert.match(get('Permissions-Policy'), /geolocation=\(self\)/);
});
