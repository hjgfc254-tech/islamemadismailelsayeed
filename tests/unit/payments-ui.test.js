'use strict';
/* Round 12 payments UI on the real apps (pages/payment-card.js, provider app.js):
   customer — the choice card after a price is agreed (online only when a gateway exists), demo payment → «مدفوع ✓»,
   cash line, top-up, refund lines, the voucher on the certificate;
   provider — how the customer pays, completion locked while an online payment is due, the payout wallet field, and
   the online balance block in «فلوسي». */
const test = require('node:test');
const assert = require('node:assert/strict');
const customer = require('../helpers/customer-app-harness.js');
const provider = require('../helpers/provider-app-harness.js');
const P = require('../../apps/customer/pages/payment-card.js');

test('stateOf: what the order shows for each payment state', () => {
  assert.equal(P.stateOf({ status: 'scheduled', agreedValue: 300 }), 'choose');
  assert.equal(P.stateOf({ status: 'scheduled', agreedValue: 0 }), '');
  assert.equal(P.stateOf({ status: 'scheduled', agreedValue: 300, freeService: { status: 'accepted' } }), '');
  assert.equal(P.stateOf({ status: 'scheduled', agreedValue: 300, payment: { method: 'online', status: 'pending' } }), 'pending');
  assert.equal(P.stateOf({ status: 'started', agreedValue: 300, payment: { method: 'online', status: 'held' } }), 'held');
  assert.equal(P.stateOf({ status: 'started', agreedValue: 450, payment: { method: 'online', status: 'topup' } }), 'topup');
  assert.equal(P.stateOf({ status: 'closed', payment: { method: 'online', status: 'released' } }), 'released');
  assert.equal(P.stateOf({ status: 'closed', payment: { method: 'online', status: 'released', refund: { amount: 20, status: 'pending' } } }), 'refund');
  assert.equal(P.stateOf({ status: 'cancelled', payment: { method: 'online', status: 'refunded', refund: { amount: 300, status: 'done' } } }), 'refunded');
  assert.equal(P.stateOf({ status: 'scheduled', payment: { method: 'cash', status: 'cash' } }), 'cash');
  assert.equal(P.stateOf({ status: 'closed', payment: { method: 'cash', status: 'cash' } }), '');
});

function agreed(t) {
  t.run(`(() => { const s = MP.db().settings; s.autoAssign = false; s.bidding = true; })()`);
  const id = t.run(`(() => { let it, pr; for (const i of CAT.items('electric')) { const p = CAT.problems(i.id).find(x => !x.id.includes('/other')); if (p) { it = i; pr = p; break; } }
    return MP.createRequest({ name: 'سارة أحمد', phone: '01011112222', cat: 'electric', itemId: it.id, serviceId: it.id, itemName: it.name, serviceName: it.name, problemId: pr.id, problemName: pr.name, desc: 'd', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' }).id; })()`);
  const pid = t.run(`MP.db().assignments.find(a => a.reqId === ${JSON.stringify(id)} && a.bidding).providerId`);
  t.run(`MP.bid(${JSON.stringify(id)}, ${JSON.stringify(pid)}, { kind: 'quote', labor: 300 }); MP.chooseBid(${JSON.stringify(id)}, ${JSON.stringify(pid)}); MP.confirmTime(${JSON.stringify(id)}, 'provider')`);
  return id;
}

test('customer: the choice card, demo payment → «مدفوع ✓» and the voucher; cash line', async () => {
  const t = customer.boot(); t.signIn();
  const id = agreed(t);
  t.run(`show('tracking', ${JSON.stringify(id)})`);
  let h = t.html();
  assert.match(h, /هتدفع إزاي؟/);
  assert.match(h, /data-pay-method="online"/, 'the local demo has a (simulated) gateway');
  assert.match(h, /قسيمة ضمان هنصلحلك 20 يوم/);
  assert.match(h, /data-pay-method="cash"/);
  assert.doesNotMatch(h, /بدون ضمان|مفيش ضمان/, 'cash is never presented as losing something');
  t.run(`MP.choosePay(${JSON.stringify(id)}, 'online'); MP.markPaid(${JSON.stringify(id)}, { amount: MP.payDue(MP.get('serviceRequests', ${JSON.stringify(id)})), ref: 'demo_1' })`);
  t.run(`show('tracking', ${JSON.stringify(id)})`);
  h = t.html();
  assert.match(h, /مدفوع ✓/);
  assert.doesNotMatch(h, /هتدفع إزاي؟/);
  const t2 = customer.boot(); t2.signIn();
  const id2 = agreed(t2);
  t2.run(`MP.choosePay(${JSON.stringify(id2)}, 'cash')`);
  t2.run(`show('tracking', ${JSON.stringify(id2)})`);
  assert.match(t2.html(), /هتدفع للفني كاش بعد الشغل/);
});

test('customer: with no gateway (server without Paymob keys) only the plain cash line shows', () => {
  const t = customer.boot(); t.signIn();
  const id = agreed(t);
  t.run(`globalThis.HS_PAY_GATEWAY = null; show('tracking', ${JSON.stringify(id)})`);
  const h = t.html();
  assert.doesNotMatch(h, /data-pay-method="online"/);
  assert.doesNotMatch(h, /هتدفع إزاي؟/);
  assert.match(h, /هتدفع للفني كاش بعد الشغل/);
});

test('provider: payment status on the job, completion locked while unpaid, wallet field, online balance', async () => {
  const PID = 'p_demo1';
  let rid;
  const a = provider.boot({ session: PID, setup: ({ MP }) => {
    MP.db().settings.autoAssign = false;
    const r = MP.createRequest({ name: 'عميل', phone: '01000000001', cat: 'electric', serviceId: 's1', serviceName: 'كهرباء', desc: 'd', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1' });
    MP.db().assignments.push({ id: 'a_pay', reqId: r.id, providerId: PID, status: 'accepted', reason: '', at: new Date().toISOString() });
    r.status = 'started'; r.agreedValue = 330; r.payment = { method: 'online', status: 'pending', paid: 0, refs: [] };
    MP.db().quotes.unshift({ id: 'q_pay', reqId: r.id, providerId: PID, labor: 300, parts: 0, total: 300, status: 'approved', at: new Date().toISOString() });
    MP.db().transactions.push({ id: 't_paid', reqId: 'r_old', providerId: PID, value: 200, commission: 20, net: 180, at: new Date().toISOString(), payout: { status: 'paid', amount: 180, paidAt: new Date().toISOString(), ref: 'TX-1' } },
      { id: 't_due', reqId: 'r_old2', providerId: PID, value: 100, commission: 10, net: 90, at: new Date().toISOString(), payout: { status: 'due', amount: 90 } });
    rid = r.id;
  } });
  a.go('#/request/' + rid);
  let h = a.html();
  assert.match(h, /اختار <b>أونلاين<\/b> — مستني الدفع/);
  assert.match(h, /data-pv-action="complete"[^>]*disabled/, 'completion locked');
  assert.match(h, /العميل اختار أونلاين ولسه ما دفعش/);
  a.go('#/earnings');
  h = a.html();
  assert.match(h, /رصيدك من الدفع الأونلاين/);
  assert.match(h, /في التحويل الأسبوعي الجاي[\s\S]*90/);
  assert.match(h, /TX-1/);
  a.go('#/profile');
  await a.click({ 'data-pv-action': 'edit-profile' });
  assert.match(a.html(), /name="payoutWallet"/);
});
