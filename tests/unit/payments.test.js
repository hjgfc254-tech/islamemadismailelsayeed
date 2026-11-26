'use strict';
/* Payments (owner model 2026-11-26): cash after the job, or online up front through Paymob — the money is HELD by the
   platform until the customer confirms (or automatically after the hold time), then the provider's net joins the weekly
   payout; online jobs carry the «ضمان هنصلحلك» voucher; the platform share is taken on the labour only.
   Domain rules (vm) + the server path (service.js → payments.js, Paymob faked). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const FN = path.resolve(__dirname, '../../functions/src');

process.env.PAYMOB_SECRET_KEY = 'sk_test'; process.env.PAYMOB_PUBLIC_KEY = 'pk_test'; process.env.PAYMOB_HMAC_SECRET = 'hmac_test'; process.env.PAYMOB_INTEGRATION_IDS = '111,222';
const service = require(path.join(FN, 'service.js'));
const payments = require(path.join(FN, 'payments.js'));
const runtime = require(path.join(FN, 'runtime.js'));

/* in-memory Firestore (dotted fields supported for payment.* queries) */
function memBackend() {
  const docs = new Map(); let auto = 0;
  const clone = v => JSON.parse(JSON.stringify(v));
  const dig = (o, f) => f.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
  const rows = col => [...docs].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2).map(([p, d]) => ({ id: p.split('/')[1], data: clone(d) }));
  const match = (r, [f, op, v]) => { const x = f === 'id' ? r.id : dig(r.data, f); return op === '==' ? x === v : op === 'in' ? v.includes(x) : op === 'array-contains' ? Array.isArray(x) && x.includes(v) : false; };
  const unlocked = (p, d) => (p.startsWith('admins/') && d && d.codeHash === undefined ? { ...d, codeHash: 'test', codeSalt: '00', unlockedUntil: 9e15 } : d);
  const adapter = {
    async get(tx, p) { return docs.has(p) ? clone(docs.get(p)) : null; },
    async query(tx, col, q) { let out = rows(col).filter(r => (q.where || []).every(w => match(r, w))); if (q.limit) out = out.slice(0, q.limit); return out; },
    async count(col, where) { return rows(col).filter(r => (where || []).every(w => match(r, w))).length; },
    set(tx, p, d) { docs.set(p, unlocked(p, clone(d))); }, del(tx, p) { docs.delete(p); }
  };
  return { docs, adapter, runTransaction: fn => fn({}), async getDoc(p) { return adapter.get(null, p); }, async setDoc(p, d) { docs.set(p, unlocked(p, clone(d))); }, async addDoc(col, d) { docs.set(`${col}/auto${++auto}`, clone(d)); },
    async queryDocs(col, field, op, value) { return rows(col).filter(x => (op === 'in' ? value.includes(x.data[field]) : x.data[field] === value)); }, async signal() {}, env: { bootstrapEmails: ['owner@example.com'] },
    col: name => [...docs].filter(([p]) => p.startsWith(name + '/') && p.split('/').length === 2).map(([, d]) => d) };
}
const phoneUser = (uid, phone) => ({ uid, token: { phone_number: phone } });
const call = (b, auth, app, method, p, body) => service.api(b, { auth, data: { app, method, path: p, body } });
const SARA = phoneUser('u_sara', '+201011112222'), KARIM = phoneUser('u_karim', '+201099998888'), OWNER = { uid: 'u_owner', token: { email: 'owner@example.com', email_verified: true } };
const REQ = { cat: 'electric', serviceName: 'إصلاح انقطاع كهرباء', desc: 'الكهرباء مقطوعة في المطبخ', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع 1' };
const PROVIDER_FORM = { name: 'كريم فتحي', phone: '01000000000', type: 'individual', cats: ['electric'], govs: ['القاهرة'], areas: ['مدينة نصر'], years: 5, bio: 'كهربائي منازل بخبرة خمس سنوات.' };
const sign = (obj) => crypto.createHmac('sha512', 'hmac_test').update(payments.HMAC_FIELDS.map(f => { const v = f.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); return v === true ? 'true' : v === false ? 'false' : v == null ? '' : String(v); }).join('')).digest('hex');
const txn = (id, ref, cents, extra = {}) => ({ id, amount_cents: cents, created_at: '2026-11-26T10:00:00', currency: 'EGP', error_occured: false, has_parent_transaction: false, integration_id: 111, is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: 9000 + id, merchant_order_id: ref }, owner: 1, pending: false, source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' }, success: true, ...extra });

test('domain: labour-only share, cash vs online, hold → release, voucher only online, refunds on cancel, auto release', () => {
  const env = runtime.createContext(null, []);
  const q = env.run('MP.quoteParts(300, 100, 10)');
  assert.deepEqual([q.customerPrice, q.platformFee, q.providerAmount], [430, 30, 400], 'parts pass through at cost');
  /* the server has keys in this test → paymob; without them online is off */
  assert.equal(env.run('MP.payConfig().gateway'), 'paymob');
  delete process.env.PAYMOB_SECRET_KEY;
  assert.equal(runtime.createContext(null, []).run('MP.payConfig().gateway'), null, 'no keys → online off on the server');
  assert.equal(runtime.createContext(null, []).run(`(() => { const c = MP.customerFor('س','01011112222'); const r = MP.createRequest({ name:'س', phone:'01011112222', cat:'electric', serviceName:'x', gov:'القاهرة', area:'a', addr:'b' }); r.agreedValue = 100; return MP.choosePay(r.id, 'online').ok; })()`), false);
  process.env.PAYMOB_SECRET_KEY = 'sk_test';
  const flow = JSON.parse(env.run(`JSON.stringify((() => {
    const out = {};
    const mk = () => { const r = MP.createRequest({ name:'سارة', phone:'01011112222', cat:'electric', serviceName:'x', gov:'القاهرة', area:'a', addr:'b' }); let p = MP.db().providers.find(x => x.id === 'p_t'); if (!p) { p = { id:'p_t', name:'فني', phone:'01099998888', status:'approved', available:true, cats:['electric'], govs:['القاهرة'], areas:[] }; MP.db().providers.push(p); } MP.assign(r.id, p.id); MP.respond(r.id, true); ['scheduled','enroute','arrived','started'].forEach(s => MP.advance(r.id, s)); r.agreedValue = 400; return r; };
    const a = mk(); MP.choosePay(a.id, 'cash'); MP.complete(a.id, 400);
    out.cashVoucher = a.warrantyUntil || null; out.cashPay = a.payment.status;
    const b = mk(); out.choose = MP.choosePay(b.id, 'online').due;
    out.blocked = MP.complete(b.id, 400);
    out.paid = MP.markPaid(b.id, { amount: 400, ref: 'pm_1', gateway: 'paymob' }).held;
    out.dup = MP.markPaid(b.id, { amount: 400, ref: 'pm_1' }).dup;
    out.done = MP.complete(b.id, 400);
    const tb = MP.db().transactions.find(t => t.reqId === b.id && !t.kind);
    out.held = [tb.collection, tb.payout.status];
    out.voucher = !!b.warrantyUntil && b.warrantyVoucher.days;
    MP.close(b.id); out.released = [b.payment.status, tb.payout.status, tb.collection];
    out.payouts = MP.payoutsDue().length;
    const c = mk(); c.status = 'scheduled'; MP.choosePay(c.id, 'online'); MP.markPaid(c.id, { amount: 400, ref: 'pm_2' });
    MP.cancel(c.id, 'x'); out.refund = [c.payment.status, c.payment.refund.amount, c.payment.refund.status];
    const d = mk(); MP.choosePay(d.id, 'online'); MP.markPaid(d.id, { amount: 400, ref: 'pm_3' }); MP.complete(d.id, 400);
    d.completedAt = new Date(Date.now() - 49 * 36e5).toISOString();
    out.auto = MP.autoRelease().includes(d.id) && d.status === 'closed' && d.payment.status === 'released';
    return out;
  })())`));
  assert.equal(flow.cashVoucher, null, 'cash → no voucher'); assert.equal(flow.cashPay, 'cash');
  assert.equal(flow.choose, 400); assert.equal(flow.blocked, false, 'no completion before the online payment');
  assert.equal(flow.paid, true); assert.equal(flow.dup, true, 'webhook retries are idempotent');
  assert.equal(flow.done, true); assert.deepEqual(flow.held, ['held', 'hold']);
  assert.equal(flow.voucher, 20, '«ضمان هنصلحلك» 20 days');
  assert.deepEqual(flow.released, ['released', 'due', 'deducted']); assert.equal(flow.payouts, 1);
  assert.deepEqual(flow.refund, ['refunded', 400, 'pending'], 'cancelled before the trip → full refund');
  assert.equal(flow.auto, true, 'held money released after 48 h without a complaint');
});

test('server: Paymob checkout, HMAC-verified webhook holds the money, completion → voucher, release → payout, admin refund via the clock', async () => {
  const b = memBackend();
  await service.session(b, { auth: OWNER, data: { op: 'claimOwner', name: 'المالك' } });
  await service.session(b, { auth: SARA, data: { op: 'registerCustomer', name: 'سارة' } });
  const id = (await call(b, SARA, 'customer', 'POST', '/requests', REQ)).data.id;
  const reg = await call(b, KARIM, 'provider', 'POST', '/providers/register', { ...PROVIDER_FORM, payoutWallet: '01099998888' });
  assert.equal(reg.ok, true, JSON.stringify(reg.error));
  await call(b, OWNER, 'admin', 'POST', `/admin/providers/${reg.data.id}/status`, { status: 'approved' });
  await call(b, OWNER, 'admin', 'POST', `/admin/requests/${id}/assign`, { providerId: reg.data.id });
  await call(b, KARIM, 'provider', 'POST', `/requests/${id}/respond`, { accept: true });
  await call(b, KARIM, 'provider', 'POST', `/requests/${id}/schedule`, { at: new Date(Date.now() + 864e5).toISOString() });
  await call(b, SARA, 'customer', 'POST', `/requests/${id}/schedule`, {});
  for (const to of ['enroute', 'arrived', 'started']) { const a = await call(b, KARIM, 'provider', 'POST', `/requests/${id}/advance`, { to }); assert.equal(a.ok, true, to + ' ' + JSON.stringify(a.error)); }
  { const qq = await call(b, KARIM, 'provider', 'POST', `/requests/${id}/quotes`, { labor: 300, parts: 100 }); assert.equal(qq.ok, true, JSON.stringify(qq.error)); }
  { const ap = await call(b, SARA, 'customer', 'POST', `/requests/${id}/quote/approve`); assert.equal(ap.ok, true, JSON.stringify(ap.error)); }
  /* demo payment is never available on the server */
  assert.equal((await call(b, SARA, 'customer', 'POST', `/requests/${id}/pay/demo`)).ok, false);
  /* online → Paymob intention (faked) → hosted checkout URL */
  const sent = [];
  payments.setFetch(async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => (url.includes('/v1/intention/') ? { client_secret: 'cs_abc' } : { id: 77, success: true }) }; });
  const pay = await call(b, SARA, 'customer', 'POST', `/requests/${id}/pay`, { method: 'online' });
  assert.equal(pay.ok, true, JSON.stringify(pay.error));
  assert.match(pay.data.checkoutUrl, /unifiedcheckout\/\?publicKey=pk_test&clientSecret=cs_abc/);
  const intent = sent[0].body; assert.equal(intent.amount, 40000); assert.deepEqual(intent.payment_methods, [111, 222]);
  assert.equal(payments.reqIdOf(intent.special_reference), id);
  assert.equal((await call(b, KARIM, 'provider', 'POST', `/requests/${id}/complete`, {})).ok, false, 'provider waits for the payment');
  /* webhook: a forged HMAC is refused, a signed one records the payment once */
  const obj = txn(501, intent.special_reference, 40000);
  assert.equal((await service.paymentsWebhook(b, { body: { type: 'TRANSACTION', obj }, query: { hmac: 'bad' } })).status, 401);
  for (let i = 0; i < 2; i++) assert.equal((await service.paymentsWebhook(b, { body: { type: 'TRANSACTION', obj }, query: { hmac: sign(obj) } })).status, 200);
  let r = b.col('requests').find(x => x.id === id);
  assert.equal(r.payment.status, 'held'); assert.equal(r.payment.paid, 400); assert.deepEqual(r.payment.txns, [{ id: '501', amount: 400 }]);
  /* job done → voucher; the platform share was taken on the labour only (quote: 300 labour + 100 parts) */
  assert.equal((await call(b, KARIM, 'provider', 'POST', `/requests/${id}/complete`, {})).ok, true);
  r = b.col('requests').find(x => x.id === id);
  const days = Math.round((Date.parse(r.warrantyUntil) - Date.now()) / 864e5); assert.ok(days >= 19 && days <= 20, 'voucher 20 days');
  const t = b.col('transactions').find(x => x.reqId === id && !x.kind);
  assert.equal(t.collection, 'held'); assert.equal(t.payout.status, 'hold');
  /* admin: partial refund of 50 → the rest released to the provider; the clock sends the refund to Paymob */
  const ref = await call(b, OWNER, 'admin', 'POST', `/admin/payments/${id}/refund`, { amount: 50 });
  assert.equal(ref.ok, true, JSON.stringify(ref.error));
  const view = await call(b, OWNER, 'admin', 'GET', '/admin/payments');
  assert.equal(view.data.refunds.length, 1); assert.equal(view.data.payouts.length, 1);
  assert.equal(view.data.payouts[0].wallet, '01099998888');
  const tick = await service.paymentsTick(b);
  assert.equal(tick.refunded, 1);
  const rf = sent.find(s => s.url.includes('/refund')); assert.deepEqual(rf.body, { transaction_id: 501, amount_cents: 5000 });
  assert.equal(b.col('requests').find(x => x.id === id).payment.refund.status, 'done');
  /* admin «release» (dispute decided for the provider): closes the job; already released money is not paid twice */
  assert.equal((await call(b, OWNER, 'admin', 'POST', `/admin/payments/${id}/release`)).ok, true);
  assert.equal(b.col('requests').find(x => x.id === id).status, 'closed');
  assert.equal(b.col('transactions').filter(x => x.reqId === id && x.payout && x.payout.status === 'due').length, 1);
  /* weekly transfer recorded */
  const pid = reg.data.id, ids = view.data.payouts[0].items.map(i => i.id);
  assert.equal((await call(b, OWNER, 'admin', 'POST', '/admin/payments/payouts', { providerId: pid, ids, ref: 'IP-123' })).ok, true);
  assert.equal(b.col('transactions').find(x => x.reqId === id && !x.kind).payout.status, 'paid');
  /* settings */
  assert.equal((await call(b, OWNER, 'admin', 'PATCH', '/admin/payments/settings', { warrantyDays: 999 })).status, 422);
  assert.equal((await call(b, OWNER, 'admin', 'PATCH', '/admin/payments/settings', { warrantyDays: 30, autoReleaseHours: 24 })).data.config.warrantyDays, 30);
  /* the customer app learns whether «ادفع أونلاين» can be shown */
  const sync = await service.session(b, { auth: SARA, data: { op: 'sync', app: 'customer' } });
  assert.equal(sync.db.settings.payments.gatewayReady, true);
  payments.setFetch(null);
});
