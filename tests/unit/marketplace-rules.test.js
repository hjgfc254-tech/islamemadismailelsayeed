'use strict';
/* Marketplace business rules (2026-11-14): zero-value quotes forbidden, independent free-service workflow,
   provider profile editing, Customer → Provider onboarding entry. Exercised through the real Provider and Customer runtimes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot: bootProvider, offerRequest } = require('../helpers/provider-app-harness.js');
const { boot: bootCustomer } = require('../helpers/customer-app-harness.js');

const PROVIDER = 'p_demo1';
/* Offered request walked to `started` through the shared store (the same MP methods the apps call). */
function started(MP) {
  const r = offerRequest(MP, PROVIDER);
  MP.respond(r.id, true); MP.confirmTime(r.id, 'provider'); ['enroute', 'arrived', 'started'].forEach(s => MP.advance(r.id, s));
  return r.id;
}
const providerAt = (prepare) => { let id; const app = bootProvider({ session: PROVIDER, setup: ({ MP }) => { id = started(MP); if (prepare) prepare(MP, id); } }); app.go('#/progress'); return { app, id }; };

test('store: zero-value quotes are rejected; approval of a zero quote is refused', () => {
  const { app, id } = providerAt();
  const M = app.MP;
  for (const q of [{ labor: 0 }, { labor: 100, discount: 100 }, { labor: 50, discount: 80 }, {}]) {
    const res = M.createQuote(id, q);
    assert.equal(res.ok, false, JSON.stringify(q)); assert.match(res.msg, /قيمة صفر/);
  }
  assert.equal(M.currentQuote(id), null);
  assert.equal(M.createQuote(id, { labor: 1 }).ok, true, 'any positive total is a valid quote');
  M.db().quotes[0].total = 0;                       // legacy/corrupted data
  assert.equal(M.approveQuote(id), false, 'a zero quote can never be approved');
});

test('provider UI: a zero-total quote is refused with guidance to the free-service flow', () => {
  const { app, id } = providerAt();
  app.click({ 'data-pv-action': 'quote', 'data-id': id });
  app.submit('pv-quote-form', { labor: '100', parts: '0', visitFee: '0', discount: '100', note: '' });
  assert.equal(app.MP.currentQuote(id), null);
  assert.match(app.toast.textContent, /قيمة صفر[\s\S]*خدمة مجانية/);
});

test('store: free-service workflow has its own states and validation', () => {
  const { app, id } = providerAt();
  const M = app.MP;
  assert.equal(M.proposeFree(id, '').ok, false, 'reason required');
  assert.equal(M.proposeFree(id, 'bogus').ok, false, 'reason must be a known one');
  assert.equal(M.respondFree(id, true), false, 'nothing to respond to yet');
  assert.equal(M.completeFree(id), false, 'cannot complete before agreement');
  assert.equal(M.proposeFree(id, 'warranty').ok, true);
  assert.equal(M.get('serviceRequests', id).freeService.status, 'proposed');
  assert.equal(M.proposeFree(id, 'warranty').ok, false, 'no duplicate proposal');
  assert.equal(M.createQuote(id, { labor: 100 }).ok, false, 'no quote while a free service is pending');
  assert.equal(M.complete(id, 100, 0), false, 'no paid completion while a free service is pending');
  assert.equal(M.completeFree(id), false, 'customer must accept first');
  assert.equal(M.respondFree(id, true), true);
  assert.equal(M.completeFree(id), true);
  const r = M.get('serviceRequests', id), tx = M.db().transactions.filter(t => t.reqId === id);
  assert.equal(r.status, 'completed'); assert.equal(r.finalValue, 0); assert.equal(r.freeService.status, 'completed');
  assert.equal(tx.length, 1);
  assert.deepEqual({ value: tx[0].value, commission: tx[0].commission, net: tx[0].net, free: tx[0].free, collection: tx[0].collection }, { value: 0, commission: 0, net: 0, free: true, collection: 'none' });
  assert.equal(M.db().quotes.length, 0, 'a free service is never represented as a quote');
});

test('store: a free service cannot be proposed over an existing quote; a declined offer reopens quoting', () => {
  const { app, id } = providerAt(M => {});
  const M = app.MP;
  assert.equal(M.createQuote(id, { labor: 200 }).ok, true);
  const refused = M.proposeFree(id, 'goodwill');
  assert.equal(refused.ok, false, 'refused while a quote is active (request is now in the quote stage)');
  assert.equal(M.get('serviceRequests', id).freeService, undefined);
  const second = providerAt();
  second.app.MP.proposeFree(second.id, 'inspection');
  second.app.MP.respondFree(second.id, false);
  assert.equal(second.app.MP.get('serviceRequests', second.id).freeService.status, 'declined');
  assert.equal(second.app.MP.createQuote(second.id, { labor: 150 }).ok, true, 'quote allowed after the customer declines');
});

test('provider UI: propose free service (reason required) → waits for customer → completes without charge', () => {
  const { app, id } = providerAt();
  assert.ok(app.has({ 'data-pv-action': 'free', 'data-id': id }), 'free-service action offered while the job is in progress');
  app.click({ 'data-pv-action': 'free', 'data-id': id });
  assert.match(app.html(), /<form class="pv-inline-form" id="pv-free-form"[\s\S]*<select name="reason" required>/);
  app.submit('pv-free-form', { reason: '' });
  assert.match(app.toast.textContent, /سبب الخدمة المجانية/);
  assert.equal(app.MP.get('serviceRequests', id).freeService, undefined);
  app.submit('pv-free-form', { reason: 'inspection' });
  assert.equal(app.MP.get('serviceRequests', id).freeService.status, 'proposed');
  assert.match(app.html(), /بانتظار موافقة العميل/);
  assert.equal(app.has({ 'data-pv-action': 'quote', 'data-id': id }), false, 'no quote while awaiting the customer');
  app.MP.respondFree(id, true);                    // the customer accepts in the Customer app
  app.go('#/home'); app.go('#/progress');
  assert.ok(app.has({ 'data-pv-action': 'complete-free', 'data-id': id }));
  assert.equal(app.has({ 'data-pv-action': 'complete', 'data-id': id }), false, 'paid completion hidden in the free flow');
  app.click({ 'data-pv-action': 'complete-free', 'data-id': id });
  assert.equal(app.MP.get('serviceRequests', id).status, 'completed');
  assert.equal(app.location.hash, '#/done');
  assert.match(app.toast.textContent, /بلا مقابل/);
});

test('customer UI: the free-service offer can be accepted or declined from tracking', () => {
  const owner = { hs_user: JSON.stringify({ name: 'سارة أحمد', phone: '01011112222' }) };
  const first = bootCustomer({ local: owner });
  first.run("MP.customerFor('سارة أحمد','01011112222'); MP.db().settings.autoAssign=false");
  const id = first.newRequest();
  first.run(`MP.assign('${id}','p_demo1'); MP.respond('${id}',true); MP.confirmTime('${id}','provider'); ['enroute','arrived','started'].forEach(s=>MP.advance('${id}',s)); MP.proposeFree('${id}','warranty')`);
  const app = bootCustomer({ hash: '#/track/' + id, local: { ...owner, hs_mp_db: first.local._map.get('hs_mp_db') } });
  assert.match(app.html(), /عرض تنفيذ الخدمة مجانًا[\s\S]*ضمان على خدمة سابقة/);
  assert.match(app.html(), new RegExp(`data-act="acceptFree" data-id="${id}"`));
  app.clickDoc({ act: 'acceptFree', id });
  assert.equal(app.run(`MP.get('serviceRequests', '${id}').freeService.status`), 'accepted');
  assert.match(app.html(), /تم الاتفاق على تنفيذ الخدمة مجانًا/);
  assert.match(app.toast(), /مجانًا/);
});

test('provider profile editing is enabled: prefilled form, shared validation, saved to the shared store', () => {
  const app = bootProvider({ session: PROVIDER });
  app.go('#/profile');
  assert.ok(app.has({ 'data-pv-action': 'edit-profile' }));
  assert.doesNotMatch(app.html(), /غير متاحين/, 'the old "editing unavailable" notice is gone');
  app.click({ 'data-pv-action': 'edit-profile' });
  const html = app.html();
  assert.match(html, /<form class="pv-inline-form pv-register-form" id="pv-profile-form" aria-label="تعديل ملف مقدم الخدمة"/);
  assert.match(html, /name="name" required maxlength="80" autocomplete="name" value="أحمد مصطفى"/);
  assert.match(html, /name="cats" value="electric" checked/);
  app.submit('pv-profile-form', { name: 'أحمد', phone: '12', type: 'individual', cats: ['electric'], govs: ['القاهرة'], years: '12', bio: '', areas: '', docs: '' });
  assert.match(app.toast.textContent, /الهاتف/, 'same validation as onboarding');
  app.submit('pv-profile-form', { name: 'أحمد مصطفى المعدّل', phone: '01099990000', type: 'individual', cats: ['electric', 'appliances'], govs: ['القاهرة'], years: '13', bio: 'نبذة جديدة', areas: 'مدينة نصر', docs: '' });
  const p = app.MP.get('providers', PROVIDER);
  assert.equal(p.name, 'أحمد مصطفى المعدّل'); assert.deepEqual([...p.cats], ['electric', 'appliances']); assert.equal(p.years, 13);
  assert.equal(p.status, 'approved', 'editing never changes the approval status');
  assert.match(app.html(), /أحمد مصطفى المعدّل/);
  assert.match(app.toast.textContent, /تم حفظ ملفك/);
});

test('onboarding entry: #/join opens registration without a session; registration grants no access until admin approval', () => {
  const app = bootProvider({ hash: '#/join' });
  assert.match(app.html(), /id="pv-register-form"/);
  assert.match(app.title(), /^الانضمام كمقدم خدمة \|/);
  app.submit('pv-register-form', { name: 'فني جديد', phone: '01055554444', type: 'individual', cats: ['plumbing'], govs: ['الجيزة'], areas: '', years: '3', bio: '', docs: '' });
  const p = app.MP.db().providers.at(-1);
  assert.equal(p.status, 'pending');
  assert.match(app.html(), /pv-gate[\s\S]*قيد المراجعة/);
  assert.equal(app.nav.hidden, true, 'no provider workspace before approval');
  app.MP.updateProvider(p.id, { status: 'approved' });   // what Admin «تشغيل السوق» does
  app.go('#/home');
  assert.equal(app.nav.hidden, false, 'approved by admin → workspace opens');
  const signedIn = bootProvider({ session: PROVIDER, hash: '#/join' });
  assert.doesNotMatch(signedIn.html(), /pv-register-form/, 'signed-in providers are not sent to registration');
});
