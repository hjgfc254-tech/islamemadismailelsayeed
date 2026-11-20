'use strict';
/* Provider P0 — behavior tests for standalone Provider actions (apps/provider/app.js).
   Runs the real production script order from apps/provider/index.html via tests/helpers/provider-app-harness.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, offerRequest, SESSION_KEY, STORE_KEY } = require('../helpers/provider-app-harness.js');

const PROVIDER = 'p_demo1';
const future = (days = 2) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 16);
const past = () => new Date(Date.now() - 864e5).toISOString().slice(0, 16);

/* Boot with a signed-in demo provider and one request offered to them. */
function withOffer(prepare) {
  let rid;
  const app = boot({ session: PROVIDER, setup: ({ MP }) => { rid = offerRequest(MP, PROVIDER).id; if (prepare) prepare(MP, rid); } });
  return { app, rid };
}
/* Walk an offered request to `target` status through the real UI, opening the group page where each action lives
   (the dashboard priority list is capped at four cards, so it is not a reliable place to find a specific request). */
const GROUP_FOR_STEP = { accepted: '#/new', scheduled: '#/accepted', enroute: '#/accepted', arrived: '#/progress', started: '#/progress' };
async function walkTo(app, rid, target) {
  const steps = ['accepted', 'scheduled', 'enroute', 'arrived', 'started'];
  const from = steps.indexOf(app.request(rid).status) + 1; // resume from the current status (0 when still offered)
  for (const step of steps.slice(from, steps.indexOf(target) + 1)) {
    app.go(GROUP_FOR_STEP[step]);
    if (step === 'accepted') await app.click({ 'data-pv-action': 'accept', 'data-id': rid });
    else if (step === 'scheduled') await app.click({ 'data-pv-action': 'confirm', 'data-id': rid });
    else await app.click({ 'data-pv-action': 'advance', 'data-next': step, 'data-id': rid });
    assert.equal(app.request(rid).status, step);
  }
}

test('without a demo session the account picker is shown and the workspace is not exposed', async () => {
  const app = boot();
  assert.match(app.html(), /pv-account-list/);
  assert.match(app.html(), /لا توجد مصادقة فعلية/);
  assert.equal(app.nav.hidden, true);
  assert.equal(app.logout.hidden, true);
  assert.ok(app.has({ 'data-pv-action': 'select', 'data-id': PROVIDER }));
  assert.doesNotMatch(app.html(), /data-pv-action="accept"/);
});

test('selecting an unknown demo account does not create a session', async () => {
  const app = boot();
  await app.click({ 'data-pv-action': 'select', 'data-id': 'p_missing' }, { force: true });
  assert.equal(app.session.getItem(SESSION_KEY), null);
  assert.match(app.html(), /pv-account-list/);
});

test('selecting a demo account stores only the demo session id and opens the workspace', async () => {
  const app = boot();
  await app.click({ 'data-pv-action': 'select', 'data-id': PROVIDER });
  assert.equal(app.session.getItem(SESSION_KEY), PROVIDER);
  assert.equal(app.location.hash, '#/home');
  assert.equal(app.nav.hidden, false);
  assert.equal(app.logout.hidden, false);
  assert.match(app.html(), /pv-ohead/);
  assert.equal(app.toast.textContent, 'تم فتح حساب العرض التجريبي');
});

test('logout clears the demo session and returns to the account picker', async () => {
  const app = boot({ session: PROVIDER });
  await app.click({ 'data-pv-action': 'logout' }, { force: true }); // topbar logout lives in the shell, outside the view
  assert.equal(app.session.getItem(SESSION_KEY), null);
  assert.match(app.html(), /pv-account-list/);
  assert.equal(app.nav.hidden, true);
});

test('a non-approved provider sees the account-status gate and no request actions', async () => {
  for (const status of ['pending', 'suspended', 'rejected']) {
    const app = boot({ session: PROVIDER, setup: ({ MP }) => { offerRequest(MP, PROVIDER); MP.updateProvider(PROVIDER, { status }); } });
    assert.match(app.html(), /pv-gate/, status);
    assert.equal(app.nav.hidden, true, status);
    assert.doesNotMatch(app.html(), /data-pv-action="accept"/, status);
    assert.ok(app.has({ 'data-pv-action': 'logout' }), status);
  }
});

test('availability toggle flips the provider flag, aria-pressed state and persists locally', async () => {
  const app = boot({ session: PROVIDER });
  assert.ok(app.has({ 'data-pv-action': 'availability', 'aria-pressed': 'true' }));
  await app.click({ 'data-pv-action': 'availability' });
  assert.equal(app.MP.get('providers', PROVIDER).available, false);
  assert.ok(app.has({ 'data-pv-action': 'availability', 'aria-pressed': 'false' }));
  assert.equal(JSON.parse(app.local.getItem(STORE_KEY)).providers.find(p => p.id === PROVIDER).available, false);
  await app.click({ 'data-pv-action': 'availability' });
  assert.equal(app.MP.get('providers', PROVIDER).available, true);
});

test('accepting an offer accepts the assignment, reveals the full address and routes to accepted', async () => {
  const { app, rid } = withOffer();
  app.go('#/new');
  assert.match(app.html(), /يظهر العنوان التفصيلي بعد قبول الطلب/);
  await app.click({ 'data-pv-action': 'accept', 'data-id': rid });
  assert.equal(app.assignmentFor(rid, PROVIDER).status, 'accepted');
  assert.equal(app.request(rid).status, 'accepted');
  assert.equal(app.location.hash, '#/accepted');
  assert.equal(app.toast.textContent, 'تم قبول الطلب');
  assert.match(app.html(), /شارع 1/);
  assert.ok(app.has({ 'data-pv-action': 'confirm', 'data-id': rid }));
  assert.ok(app.has({ 'data-pv-action': 'propose', 'data-id': rid }));
});

test('accepting a stale offer (withdrawn by the customer) reports failure instead of success', async () => {
  const { app, rid } = withOffer();
  app.go('#/new');
  assert.ok(app.has({ 'data-pv-action': 'accept', 'data-id': rid }));
  app.MP.cancel(rid, 'ألغى العميل'); // happens in another tab; this view is now stale
  await app.click({ 'data-pv-action': 'accept', 'data-id': rid });
  assert.equal(app.assignmentFor(rid, PROVIDER).status, 'withdrawn');
  assert.equal(app.request(rid).status, 'cancelled');
  assert.notEqual(app.toast.textContent, 'تم قبول الطلب');
  assert.match(app.toast.textContent, /تعذر/);
  assert.notEqual(app.location.hash, '#/accepted');
});

test('reject opens a reason form; confirming records the reason and routes to cancelled', async () => {
  const { app, rid } = withOffer();
  await app.click({ 'data-pv-action': 'reject', 'data-id': rid });
  assert.match(app.html(), /id="pv-reject-form"/);
  assert.match(app.html(), /<select name="reason" required>/);
  assert.equal(app.assignmentFor(rid, PROVIDER).status, 'offered', 'opening the form must not mutate');
  const { prevented } = await app.submit('pv-reject-form', { reason: 'خارج المنطقة' });
  assert.equal(prevented, true);
  const a = app.assignmentFor(rid, PROVIDER);
  assert.equal(a.status, 'rejected');
  assert.equal(a.reason, 'خارج المنطقة');
  assert.equal(app.request(rid).status, 'searching');
  assert.equal(app.location.hash, '#/cancelled');
  assert.match(app.html(), /data-pv-route="done" class="is-on"/, 'cancelled opens the «خلصت» filter');
});

test('reject requires a reason', async () => {
  const { app, rid } = withOffer();
  await app.click({ 'data-pv-action': 'reject', 'data-id': rid });
  await app.submit('pv-reject-form', { reason: '   ' });
  assert.equal(app.assignmentFor(rid, PROVIDER).status, 'offered');
  assert.match(app.toast.textContent, /سبب الرفض/);
  assert.match(app.html(), /id="pv-reject-form"/, 'form stays open for correction');
});

test('rejecting a stale offer reports failure and does not route to cancelled', async () => {
  const { app, rid } = withOffer();
  app.go('#/new');
  await app.click({ 'data-pv-action': 'reject', 'data-id': rid });
  app.MP.cancel(rid, 'ألغى العميل');
  await app.submit('pv-reject-form', { reason: 'خارج المنطقة' });
  assert.equal(app.assignmentFor(rid, PROVIDER).status, 'withdrawn');
  assert.equal(app.location.hash, '#/new');
  assert.match(app.toast.textContent, /تعذر/);
  assert.doesNotMatch(app.html(), /pv-reject-form/, 'view refreshed');
});

test('cancelling an inline form removes it without mutating the request', async () => {
  const { app, rid } = withOffer();
  const before = app.local.getItem(STORE_KEY);
  await app.click({ 'data-pv-action': 'reject', 'data-id': rid });
  await app.click({ 'data-pv-action': 'cancel-form' });
  assert.doesNotMatch(app.html(), /pv-reject-form/);
  assert.equal(app.local.getItem(STORE_KEY), before);
});

test('propose records a future appointment and hides confirm while awaiting the customer', async () => {
  const { app, rid } = withOffer();
  await walkTo(app, rid, 'accepted');
  await app.click({ 'data-pv-action': 'propose', 'data-id': rid });
  assert.match(app.html(), /id="pv-propose-form"[\s\S]*type="datetime-local" name="at" required min="/);
  const at = future();
  await app.submit('pv-propose-form', { at });
  assert.equal(app.request(rid).proposal.at, new Date(at).toISOString());
  assert.equal(app.request(rid).proposal.by, 'provider');
  assert.equal(app.toast.textContent, 'تم إرسال اقتراح الموعد');
  assert.match(app.html(), /بانتظار العميل/);
  assert.equal(app.has({ 'data-pv-action': 'confirm', 'data-id': rid }), false);
});

test('propose rejects missing, invalid and past times', async () => {
  const { app, rid } = withOffer();
  await walkTo(app, rid, 'accepted');
  for (const at of ['', 'not-a-date', past()]) {
    await app.click({ 'data-pv-action': 'propose', 'data-id': rid });
    await app.submit('pv-propose-form', { at });
    assert.equal(app.request(rid).proposal, null, `"${at}" must not be proposed`);
    assert.match(app.toast.textContent, /موعد/);
    await app.click({ 'data-pv-action': 'cancel-form' });
  }
});

test('propose on a request that is no longer awaiting scheduling reports failure', async () => {
  const { app, rid } = withOffer();
  await walkTo(app, rid, 'accepted');
  await app.click({ 'data-pv-action': 'propose', 'data-id': rid });
  app.MP.confirmTime(rid, 'customer'); // customer confirmed meanwhile
  await app.submit('pv-propose-form', { at: future() });
  assert.equal(app.request(rid).proposal, null);
  assert.notEqual(app.toast.textContent, 'تم إرسال اقتراح الموعد');
  assert.match(app.toast.textContent, /تعذر/);
});

test('confirm schedules the requested time; a stale confirm reports failure', async () => {
  const when = new Date(Date.now() + 3 * 864e5).toISOString();
  const { app, rid } = withOffer((MP, id) => { MP.get('serviceRequests', id).when = when; });
  await walkTo(app, rid, 'accepted');
  await app.click({ 'data-pv-action': 'confirm', 'data-id': rid });
  assert.equal(app.request(rid).status, 'scheduled');
  assert.equal(app.request(rid).agreedAt, when);
  assert.equal(app.toast.textContent, 'تم تأكيد الموعد');
  await app.click({ 'data-pv-action': 'confirm', 'data-id': rid }, { force: true });
  assert.equal(app.request(rid).status, 'scheduled');
  assert.match(app.toast.textContent, /تعذر/);
});

test('status advances one step at a time through rendered controls only', async () => {
  const { app, rid } = withOffer();
  await walkTo(app, rid, 'scheduled');
  assert.equal(app.has({ 'data-pv-action': 'advance', 'data-next': 'arrived', 'data-id': rid }), false);
  await app.click({ 'data-pv-action': 'advance', 'data-next': 'started', 'data-id': rid }, { force: true });
  assert.equal(app.request(rid).status, 'scheduled', 'skipping steps is refused');
  assert.equal(app.toast.textContent, 'تعذر تحديث الحالة؛ راجع تسلسل الطلب');
  await walkTo(app, rid, 'started');
  assert.equal(app.toast.textContent, 'تم تحديث حالة الطلب');
  assert.ok(app.has({ 'data-pv-action': 'quote', 'data-id': rid }));
  assert.ok(app.has({ 'data-pv-action': 'complete', 'data-id': rid }));
});

test('advancing from a group list follows the request to its new group; details and home stay put', async () => {
  const { app, rid } = withOffer();
  await walkTo(app, rid, 'scheduled');
  app.go('#/accepted');
  await app.click({ 'data-pv-action': 'advance', 'data-next': 'enroute', 'data-id': rid });
  assert.equal(app.location.hash, '#/progress', 'enroute belongs to the progress group');
  assert.ok(app.has({ 'data-pv-action': 'advance', 'data-next': 'arrived', 'data-id': rid }), 'card still visible');
  app.go('#/request/' + rid);
  await app.click({ 'data-pv-action': 'advance', 'data-next': 'arrived', 'data-id': rid });
  assert.equal(app.location.hash, '#/request/' + rid, 'details page keeps its route');
  app.go('#/home');
  await app.click({ 'data-pv-action': 'advance', 'data-next': 'started', 'data-id': rid }, { force: true });
  assert.equal(app.request(rid).status, 'started');
  assert.equal(app.location.hash, '#/home', 'dashboard keeps its route');
});

test('advance is refused for a request in an alternative final state', async () => {
  const { app, rid } = withOffer();
  await walkTo(app, rid, 'scheduled');
  app.MP.cancel(rid, 'x');
  await app.click({ 'data-pv-action': 'advance', 'data-next': 'enroute', 'data-id': rid }, { force: true });
  assert.equal(app.request(rid).status, 'cancelled');
  assert.match(app.toast.textContent, /تعذر/);
});

test('quote submission validates amounts before creating a local quote', async () => {
  const { app, rid } = withOffer();
  await walkTo(app, rid, 'started');
  const base = { labor: '200', parts: '0', visitFee: '0', discount: '0', note: '' };
  const invalid = [{ labor: '' }, { labor: 'abc' }, { labor: '-1' }, { parts: '-5' }, { visitFee: '-1' }, { discount: '-1' }];
  for (const patch of invalid) {
    await app.click({ 'data-pv-action': 'quote', 'data-id': rid });
    await app.submit('pv-quote-form', { ...base, ...patch });
    assert.equal(app.MP.currentQuote(rid), null, JSON.stringify(patch));
    assert.match(app.toast.textContent, /عرض السعر|المبالغ/, JSON.stringify(patch));
    await app.click({ 'data-pv-action': 'cancel-form' });
  }
  assert.equal(app.request(rid).status, 'started');
});

test('a valid quote moves the request to quote and can be updated with prefilled values', async () => {
  const { app, rid } = withOffer();
  await walkTo(app, rid, 'started');
  await app.click({ 'data-pv-action': 'quote', 'data-id': rid });
  await app.submit('pv-quote-form', { labor: '300', parts: '150.5', visitFee: '50', discount: '20', note: '  تغيير قاطع  ' });
  const q = app.MP.currentQuote(rid);
  assert.equal(q.total, 480.5);
  assert.equal(q.note, 'تغيير قاطع');
  assert.equal(q.status, 'pending');
  assert.equal(app.request(rid).status, 'quote');
  assert.equal(app.location.hash, '#/quote');
  assert.equal(app.toast.textContent, 'تم إرسال عرض السعر');
  app.go('#/progress');
  app.go('#/quote');
  await app.click({ 'data-pv-action': 'quote', 'data-id': rid });
  assert.match(app.html(), /name="labor"[^>]*value="300"/);
  assert.match(app.html(), /إرسال عرض السعر/);
});

test('completion enforces value and deduction boundaries', async () => {
  const { app, rid } = withOffer();
  await walkTo(app, rid, 'started');
  const invalid = [{ value: '0', deductions: '0' }, { value: '', deductions: '0' }, { value: '-10', deductions: '0' },
    { value: '100', deductions: '-1' }, { value: '100', deductions: '100.01' }, { value: '100', deductions: 'abc' }];
  for (const v of invalid) {
    await app.click({ 'data-pv-action': 'complete', 'data-id': rid });
    await app.submit('pv-complete-form', v);
    assert.equal(app.request(rid).status, 'started', JSON.stringify(v));
    assert.equal(app.toast.textContent, 'راجع قيمة الخدمة والخصم', JSON.stringify(v));
    await app.click({ 'data-pv-action': 'cancel-form' });
  }
  assert.equal(app.MP.db().transactions.filter(t => t.reqId === rid).length, 0);
});

test('valid completion records one local demo transaction and cannot be repeated', async () => {
  const { app, rid } = withOffer();
  await walkTo(app, rid, 'started');
  await app.click({ 'data-pv-action': 'complete', 'data-id': rid });
  await app.submit('pv-complete-form', { value: '500', deductions: '500' }); // deductions == value is the upper bound
  assert.equal(app.request(rid).status, 'completed');
  assert.equal(app.request(rid).finalValue, 500);
  assert.equal(app.location.hash, '#/done');
  const tx = app.MP.db().transactions.filter(t => t.reqId === rid);
  assert.equal(tx.length, 1);
  assert.equal(tx[0].demo, true);
  assert.equal(tx[0].deductions, 500);
  assert.equal(tx[0].providerId, PROVIDER);
  await app.submit('pv-complete-form', { value: '600', deductions: '0', __id: rid }, { force: true });
  assert.equal(app.toast.textContent, 'لا يمكن إكمال الطلب في حالته الحالية');
  assert.equal(app.MP.db().transactions.filter(t => t.reqId === rid).length, 1);
});

test('completion form previews platform commission and net live, using the provider/category rate (G3 parity)', async () => {
  const { app, rid } = withOffer(MP => { MP.db().settings.rates.electric = 12; });
  await walkTo(app, rid, 'started');
  await app.click({ 'data-pv-action': 'complete', 'data-id': rid });
  const rate = app.MP.rateFor('electric', PROVIDER);
  assert.equal(rate, 12);
  assert.match(app.html(), /id="pv-complete-form" data-id="[^"]+" data-rate="12"/);
  assert.match(app.html(), /<p class="pv-calc" id="pv-complete-preview" aria-live="polite">أدخل القيمة لمعاينة عمولة المنصة \(12%\)/);
  const money = n => n.toLocaleString('ar-EG', { maximumFractionDigits: 2 }) + ' ج.م';
  app.input('pv-complete-form', { value: '500', deductions: '20' });
  const x = app.MP.calc(500, 12, 20);
  assert.equal(x.commission, 60); assert.equal(x.net, 420);
  assert.equal(app.el('pv-complete-preview').textContent, `عمولة المنصة (12%): ${money(60)} • الخصومات: ${money(20)} • صافي مستحقك: ${money(420)}`);
  app.input('pv-complete-form', { value: '100', deductions: '150' });
  assert.equal(app.el('pv-complete-preview').textContent, 'الخصم يجب أن يكون بين صفر وقيمة الخدمة.');
  app.input('pv-complete-form', { value: '', deductions: '0' });
  assert.match(app.el('pv-complete-preview').textContent, /^أدخل القيمة/);
  const special = withOffer(MP => { MP.updateProvider(PROVIDER, { specialRate: 7 }); });
  await walkTo(special.app, special.rid, 'started');
  special.app.click({ 'data-pv-action': 'complete', 'data-id': special.rid });
  assert.match(special.app.html(), /data-rate="7"/, 'provider special rate wins, as in MP.rateFor');
  assert.equal(app.request(rid).status, 'started', 'preview never mutates');
});

test('completion form suggests the approved quote total', async () => {
  const { app, rid } = withOffer();
  await walkTo(app, rid, 'started');
  await app.click({ 'data-pv-action': 'quote', 'data-id': rid });
  await app.submit('pv-quote-form', { labor: '250', parts: '0', visitFee: '0', discount: '0', note: '' });
  app.MP.rejectQuote(rid, 'غالي'); // back to started, quote rejected → no suggestion
  app.go('#/progress');
  await app.click({ 'data-pv-action': 'complete', 'data-id': rid });
  assert.match(app.html(), /name="value" type="number" min="1" step="0.01" required value=""/);
  await app.click({ 'data-pv-action': 'cancel-form' });
  app.MP.createQuote(rid, { labor: 320 });
  app.MP.get('serviceRequests', rid).status = 'started';
  app.MP.db().quotes[0].status = 'approved';
  app.go('#/home'); app.go('#/progress');
  await app.click({ 'data-pv-action': 'complete', 'data-id': rid });
  assert.match(app.html(), /name="value"[^>]*value="320"/);
});

test('a full provider journey mutates only the local demo store and the demo session key', async () => {
  const app = boot();
  const sessionKeys = () => app.session.keys().sort();
  await app.click({ 'data-pv-action': 'select', 'data-id': PROVIDER });
  const rid = offerRequest(app.MP, PROVIDER).id;
  app.go('#/new');
  await walkTo(app, rid, 'started');
  await app.click({ 'data-pv-action': 'quote', 'data-id': rid });
  await app.submit('pv-quote-form', { labor: '100', parts: '0', visitFee: '0', discount: '0', note: '' });
  // Paid lifecycle: while the quote awaits the customer there is no completion control.
  app.go('#/quote');
  assert.ok(!app.has({ 'data-pv-action': 'complete', 'data-id': rid }), 'no completion while the quote is pending');
  assert.equal(app.MP.approveQuote(rid), true, 'customer approves (shared store)');
  assert.equal(app.request(rid).status, 'started', 'approval does not complete the job');
  app.go('#/progress');
  assert.ok(!app.has({ 'data-pv-action': 'quote', 'data-id': rid }), 'an approved quote cannot be replaced');
  await app.click({ 'data-pv-action': 'complete', 'data-id': rid });
  await app.submit('pv-complete-form', { value: '100', deductions: '0' });
  assert.equal(app.request(rid).status, 'completed');
  assert.deepEqual(app.local.keys(), [STORE_KEY]);
  assert.deepEqual(sessionKeys(), [SESSION_KEY]);
  assert.equal(app.fetchCalls.length, 0, 'no network calls');
  const persisted = JSON.parse(app.local.getItem(STORE_KEY));
  assert.equal(persisted.serviceRequests.find(r => r.id === rid).status, 'completed');
});
