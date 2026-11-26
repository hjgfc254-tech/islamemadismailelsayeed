'use strict';
/**
 * Online payments through Paymob (Egypt): cards + mobile wallets, money HELD by the platform until the customer confirms
 * the job (owner model 2026-11-26; rules in services/local-market-store.js «round 12: payments»).
 *
 * Who calls it:
 *   - service.js api: after `POST /requests/:id/pay {method:'online'}` succeeds → checkout() creates a Paymob intention
 *     and returns the hosted checkout URL to the customer app (envelope.data.checkoutUrl);
 *   - index.js paymobWebhook (https, public): Paymob's «transaction processed» callback → webhook() verifies the HMAC and
 *     records the payment (MP.markPaid) or a refund (MP.markRefunded) in one domain transaction;
 *   - index.js paymentsClock (every 30 min): tick() — sends pending refunds to Paymob, auto-confirms jobs whose hold time
 *     ran out (MP.autoRelease).
 * Env (functions/.env — names only): PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY, PAYMOB_HMAC_SECRET, PAYMOB_INTEGRATION_IDS
 *   (comma list: card id, wallet id, …), PAYMOB_RETURN_URL (optional; default the customer app). Without the keys online
 *   payment is off (runtime HS_PAY_GATEWAY = null) and customers pay cash — nothing here runs.
 * Paymob endpoints used (verify against developers.paymob.com when the account is activated):
 *   POST https://accept.paymob.com/v1/intention/                       (Authorization: Token <secret key>)
 *   GET  https://accept.paymob.com/unifiedcheckout/?publicKey=…&clientSecret=…   (hosted checkout page)
 *   POST https://accept.paymob.com/api/acceptance/void_refund/refund   {transaction_id, amount_cents}
 *   Webhook HMAC: SHA-512 over the documented field list (HMAC_FIELDS), hex, compared in constant time.
 * Collections: serviceRequests (payment field, through the domain), system/payClock (last run).
 */
const crypto = require('crypto');

const API = 'https://accept.paymob.com';
const HMAC_FIELDS = ['amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success'];

let fetchImpl = (...a) => fetch(...a);
const setFetch = f => { fetchImpl = f || ((...a) => fetch(...a)); };

const cfg = () => ({
  secret: process.env.PAYMOB_SECRET_KEY || '', pub: process.env.PAYMOB_PUBLIC_KEY || '', hmac: process.env.PAYMOB_HMAC_SECRET || '',
  integrations: String(process.env.PAYMOB_INTEGRATION_IDS || '').split(',').map(s => +s.trim()).filter(n => Number.isInteger(n) && n > 0),
  returnUrl: process.env.PAYMOB_RETURN_URL || 'https://hansalahlak.web.app/apps/customer/index.html'
});
const enabled = () => { const c = cfg(); return !!(c.secret && c.pub && c.integrations.length); };

const get = (o, p) => p.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
const str = v => (v === true ? 'true' : v === false ? 'false' : v == null ? '' : String(v));
/** Paymob «transaction processed» HMAC check (constant time). */
function verifyHmac(obj, hmac, secret) {
  if (!obj || !hmac || !secret) return false;
  const want = crypto.createHmac('sha512', secret).update(HMAC_FIELDS.map(f => str(get(obj, f))).join('')).digest('hex');
  const a = Buffer.from(want, 'utf8'), b = Buffer.from(String(hmac).toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** reqId is carried in the merchant reference: "<reqId>~<attempt>" */
const refOf = (reqId) => `${reqId}~${Date.now().toString(36)}`;
const reqIdOf = (ref) => { const s = String(ref || ''); const i = s.lastIndexOf('~'); return i > 0 ? s.slice(0, i) : ''; };

/**
 * Creates the Paymob intention for the amount due and returns { checkoutUrl } — called right after the domain accepted
 * `POST /requests/:id/pay {method:'online'}`. r is the request view returned to the customer.
 */
async function checkout(r) {
  const c = cfg();
  if (!enabled()) return { ok: false, error: 'الدفع الأونلاين مش متاح دلوقتي' };
  const due = Math.round((+((r.payment && r.payment.due) || 0)) * 100);
  if (!(due > 0)) return { ok: false, error: 'مفيش مبلغ مطلوب' };
  const name = String(r.name || 'عميل').trim().split(/\s+/);
  const body = {
    amount: due, currency: 'EGP', payment_methods: c.integrations,
    items: [{ name: String(r.serviceName || 'خدمة').slice(0, 50), amount: due, description: 'طلب ' + (r.no || r.id), quantity: 1 }],
    billing_data: { first_name: name[0] || 'عميل', last_name: name.slice(1).join(' ') || '-', phone_number: String(r.phone || '01000000000'), email: 'customer@hansalahlak.app', country: 'EG', city: String(r.gov || 'NA'), street: 'NA', building: 'NA', floor: 'NA', apartment: 'NA' },
    special_reference: refOf(r.id),
    redirection_url: c.returnUrl + '#/track/' + encodeURIComponent(r.id)
  };
  const res = await fetchImpl(API + '/v1/intention/', { method: 'POST', headers: { Authorization: 'Token ' + c.secret, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.client_secret) return { ok: false, error: 'تعذّر فتح صفحة الدفع — جرّب تاني أو ادفع كاش' };
  return { ok: true, checkoutUrl: `${API}/unifiedcheckout/?publicKey=${encodeURIComponent(c.pub)}&clientSecret=${encodeURIComponent(j.client_secret)}` };
}

/**
 * Paymob callback. Verifies the HMAC, then records a successful payment (or a completed refund) on the request.
 * domainOp: service.domainOp(backend, {load, run}); plan: plan.js plan(); returns {status, body}.
 */
async function webhook(backend, req, { domainOp, plan }) {
  const c = cfg();
  const obj = req.body && req.body.obj, hmac = (req.query && req.query.hmac) || '';
  if (!verifyHmac(obj, hmac, c.hmac)) return { status: 401, body: { ok: false } };
  if ((req.body.type || 'TRANSACTION') !== 'TRANSACTION') return { status: 200, body: { ok: true, ignored: true } };
  const reqId = reqIdOf(get(obj, 'order.merchant_order_id') || get(obj, 'special_reference') || (obj.payment_key_claims && obj.payment_key_claims.extra && obj.payment_key_claims.extra.special_reference));
  if (!reqId || !/^[\w-]{1,80}$/.test(reqId)) return { status: 200, body: { ok: true, ignored: 'no reference' } };
  const success = obj.success === true && obj.pending !== true && obj.is_voided !== true;
  const refunded = obj.is_refunded === true;
  if (!success && !refunded) return { status: 200, body: { ok: true, ignored: 'not successful' } };
  const amount = (+obj.amount_cents || 0) / 100, txn = String(obj.id);
  const out = await domainOp(backend, {
    load: async (ld) => { await plan(ld, { method: 'POST', path: `/requests/${reqId}/close`, query: {}, body: {}, actor: null }); return {}; },
    run: (env) => {
      const r = env.mp.get('serviceRequests', reqId);
      if (!r) return { ok: true, ignored: true };
      if (refunded && obj.has_parent_transaction) { env.mp.markRefunded(reqId, txn); return { ok: true, refunded: true }; }
      const res = env.mp.markPaid(reqId, { amount, ref: 'pm_' + txn, gateway: 'paymob' });
      if (res.ok && r.payment) { r.payment.txns = Array.isArray(r.payment.txns) ? r.payment.txns : []; if (!r.payment.txns.some(t => t.id === txn)) r.payment.txns.push({ id: txn, amount }); }
      return { ok: true, res };
    }
  });
  return { status: 200, body: { ok: true, result: out.result && out.result.ok !== false } };
}

/** Refund through Paymob, spread over the request's captured transactions (newest first). */
async function refund(payment) {
  const c = cfg();
  let left = Math.round((+(payment.refund && payment.refund.amount) || 0) * 100);
  const refs = [];
  for (const t of (payment.txns || []).slice().reverse()) {
    if (left <= 0) break;
    const cents = Math.min(left, Math.round(+t.amount * 100));
    const res = await fetchImpl(API + '/api/acceptance/void_refund/refund', { method: 'POST', headers: { Authorization: 'Token ' + c.secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ transaction_id: +t.id, amount_cents: cents }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.success === false) return { ok: false, refs };
    refs.push(String(j.id || t.id)); left -= cents;
  }
  return { ok: left <= 0, refs };
}

/**
 * paymentsClock: (1) pending refunds → Paymob, (2) held payments of completed jobs past autoReleaseHours → released.
 * Cost: two single-field queries; nothing to do → 2 reads.
 */
async function tick(backend, { domainOp, plan, PartialDb }) {
  const ld = new PartialDb(backend.adapter, null);
  const [refunds, held] = await Promise.all([
    ld.where('serviceRequests', [['payment.refund.status', '==', 'pending']], { limit: 50 }),
    ld.where('serviceRequests', [['payment.status', '==', 'held']], { limit: 200 })
  ]);
  const out = { refunded: 0, released: 0, failed: 0 };
  if (enabled()) {
    for (const r of refunds) {
      if (!r.payment || r.payment.gateway !== 'paymob') continue;
      const res = await refund(r.payment);
      if (!res.ok) { out.failed++; if (backend.log) backend.log('paymob refund failed', r.id); continue; }
      await domainOp(backend, { load: async (l) => { await plan(l, { method: 'POST', path: `/requests/${r.id}/close`, query: {}, body: {}, actor: null }); return {}; }, run: (env) => ({ ok: true, done: env.mp.markRefunded(r.id, res.refs.join(',')) }) });
      out.refunded++;
    }
  }
  for (const r of held.filter(x => x.status === 'completed')) {
    const res = await domainOp(backend, { load: async (l) => { await plan(l, { method: 'POST', path: `/requests/${r.id}/close`, query: {}, body: {}, actor: null }); await l.where('complaints', [['reqId', '==', r.id]]); return {}; }, run: (env) => ({ ok: true, ids: env.mp.autoRelease() }) });
    if (res.result && res.result.ids && res.result.ids.length) out.released++;
  }
  return out;
}

module.exports = { checkout, webhook, tick, refund, verifyHmac, enabled, setFetch, refOf, reqIdOf, HMAC_FIELDS };
