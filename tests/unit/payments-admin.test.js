'use strict';
/* Admin «المدفوعات» (apps/admin/modules/payments-admin.js): banner per gateway, payouts, release / refund, settings. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const P = require(path.join(ROOT, 'apps/admin/modules/payments-admin.js'));

test('banner: Paymob on / switched off, demo, no keys', () => {
  assert.match(P.banner('paymob', true).text, /Paymob شغال/);
  assert.match(P.banner('paymob', false).text, /مقفول من الإعدادات/);
  assert.match(P.banner('demo', true).text, /وضع تجريبي/);
  assert.match(P.banner(null, true).text, /مفاتيح Paymob/);
});

const DATA = () => ({
  config: { online: true, gateway: 'paymob', warrantyDays: 20, autoReleaseHours: 48, gatewayRate: 2.75 },
  held: [{ id: 'r1', no: 'HS-1', amount: 300, due: 0, payStatus: 'held', completedAt: '2026-11-26T10:00:00Z', provider: 'أحمد' }],
  refunds: [{ id: 'r2', no: 'HS-2', refund: { amount: 50, why: 'الفرق', at: '2026-11-26T10:00:00Z' } }],
  payouts: [{ providerId: 'p1', name: '<b>أحمد</b>', phone: '011', wallet: '', total: 270, items: [{ id: 't1' }, { id: 't2' }] }],
  totals: { held: 300, payouts: 270 }
});

function boot() {
  const calls = [];
  const ctx = { console, Intl, Date, Math, JSON, String, Number, Array, Object, Promise, encodeURIComponent };
  ctx.globalThis = ctx; vm.createContext(ctx);
  ctx.HSApiClient = { request: (m, p, o) => { calls.push([m, p, o && o.body]); if (m === 'PATCH' && o.body.warrantyDays === '999') return Promise.resolve({ ok: false, error: { message: 'راجع البيانات', details: { warrantyDays: 'رقم من 0 لـ 365' } } }); return Promise.resolve({ ok: true, data: DATA() }); } };
  ctx.HSUiDialog = { confirm: () => Promise.resolve(true), prompt: () => Promise.resolve('TX-778') };
  vm.runInContext(read('apps/admin/modules/payments-admin.js'), ctx);
  const L = {}; const host = { innerHTML: '', querySelector: () => null, addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); } };
  const fire = (t, target) => Promise.all((L[t] || []).map((f) => f({ target, preventDefault() {} })));
  const btn = (d) => ({ dataset: d, disabled: false, closest() { return this; } });
  return { ctx, host, calls, fire, btn };
}

test('page: totals, payouts (wallet warning, escaped), held money, refunds, settings', async () => {
  const b = boot(); await b.ctx.HSPaymentsAdmin.mount(b.host);
  const h = b.host.innerHTML;
  assert.match(h, /فلوس محجوزة دلوقتي[\s\S]*300 ج\.م/);
  assert.match(h, /الفني ما حطّش محفظة/);
  assert.doesNotMatch(h, /<b>أحمد<\/b>/, 'names are escaped');
  assert.match(h, /data-pay-payout="p1"/);
  assert.match(h, /data-pay-release="r1"/);
  assert.match(h, /data-pay-refund="r1"/);
  assert.match(h, /استرجاعات جارية[\s\S]*50 ج\.م/);
  assert.match(h, /name="warrantyDays"[^>]*value="20"/);
});

test('actions: payout with the transfer reference, release, refund, settings validation per field', async () => {
  const b = boot(); await b.ctx.HSPaymentsAdmin.mount(b.host);
  await b.fire('click', b.btn({ payPayout: 'p1' }));
  const po = b.calls.find((c) => c[1] === '/admin/payments/payouts');
  assert.deepEqual(JSON.parse(JSON.stringify(po[2])), { providerId: 'p1', ids: ['t1', 't2'], ref: 'TX-778' });
  await b.fire('click', b.btn({ payRelease: 'r1' }));
  assert.ok(b.calls.some((c) => c[1] === '/admin/payments/r1/release'));
  await b.fire('click', b.btn({ payRefund: 'r1', paid: '300', done: '0' }));
  const rf = b.calls.find((c) => c[1] === '/admin/payments/r1/refund');
  assert.deepEqual(JSON.parse(JSON.stringify(rf[2])), {}, 'before the job ends the refund is the whole amount');
  await b.fire('submit', { closest() { return this; }, online: { checked: true }, warrantyDays: { value: '999' }, autoReleaseHours: { value: '48' }, gatewayRate: { value: '2' } });
  assert.match(b.host.innerHTML, /pay-e-warrantyDays[^>]*>رقم من 0 لـ 365/);
  assert.match(b.host.innerHTML, /name="warrantyDays"[^>]*aria-invalid="true"/);
});

test('wiring: a tab of «الفلوس», finance permission, live page, loaded and cached', () => {
  const shell = require(path.join(ROOT, 'apps/admin/admin-shell.js'));
  assert.deepEqual(shell._internals.SECTIONS.commissions.pages, ['commissions', 'settlements', 'payments']);
  assert.equal(require(path.join(ROOT, 'apps/admin/permission-guard.js')).ROUTE_MODULE.payments, 'finance');
  assert.match(read('apps/admin/admin-shell.js'), /'order', 'payments'\]\)/);
  assert.match(read('apps/admin/index.html'), /modules\/payments-admin\.js"><\/script><script src="pages\/payments\.page\.js"/);
  assert.match(read('service-worker.js'), /'apps\/admin\/pages\/payments\.page\.js'/);
});
