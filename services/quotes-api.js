/**
 * MODULE: quotes-api
 * RESPONSIBILITY: Quote and free-service contract over services/api-client.js (mock handlers on the local MP store).
 *   Business rules enforced at the boundary AND again in the store:
 *     • a quote total must be > 0 — zero-value quotes are refused on submit (422) and on accept (409);
 *     • a job done without charge uses the separate FREE-SERVICE workflow (propose → customer accepts/declines →
 *       provider completes, value 0, no commission) — never a zero quote;
 *     • providers submit quotes / free proposals; only the owning customer approves or rejects them.
 * ROUTES:
 *   POST /requests/:id/quotes               provider   {labor, parts, visitFee, discount, note}
 *   POST /requests/:id/quote/approve        customer
 *   POST /requests/:id/quote/reject         customer   {reason}
 *   GET  /free-reasons                      public     reason catalogue
 *   POST /requests/:id/free                 provider   {reason ∈ FREE_REASONS}
 *   POST /requests/:id/free/respond         customer   {accept}
 *   POST /requests/:id/free/complete        provider
 * STATUS: IMPLEMENTED (MOCK ADAPTER — local store only, no payments, no network)
 */
'use strict';
(function (root, factory) {
  const req = typeof require === 'function' ? require : null;
  const client = root.HSApiClient || (req ? req('./api-client.js') : null);
  const orders = root.HSOrdersApi || (req ? req('./orders-api.js') : null);
  const api = factory(client, orders);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSQuotesApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (client, orders) {
  const { ok, fail } = client;
  const AMOUNT_KEYS = ['labor', 'parts', 'visitFee', 'discount'];
  const MAX_AMOUNT = 1e6;

  const load = (store, actor, id) => { const r = store.get('serviceRequests', id); return r && orders.canAccess(actor, r, store) ? r : null; };
  const notFound = () => fail('NOT_FOUND', 'الطلب غير موجود');

  /** Pure validation shared by UI and boundary. Returns { total, errors }. */
  function validateQuote(q) {
    const errors = {};
    for (const k of AMOUNT_KEYS) {
      const v = q[k];
      if (v === undefined || v === '' || v === null) continue;
      if (!Number.isFinite(+v) || +v < 0) errors[k] = 'قيمة غير صالحة';
      else if (+v > MAX_AMOUNT) errors[k] = 'قيمة كبيرة جدًا';
    }
    const total = Math.max(0, (+q.labor || 0) + (+q.parts || 0) + (+q.visitFee || 0) - (+q.discount || 0));
    if (!Object.keys(errors).length && !(total > 0)) errors.total = 'لا يُسمح بعرض سعر بقيمة صفر — استخدم «خدمة مجانية» للخدمة بلا مقابل';
    return { total, errors };
  }

  client.define('POST', '/requests/:id/quotes', { roles: ['provider'], summary: 'Submit a quote (total > 0).' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const { errors } = validateQuote(body);
    if (Object.keys(errors).length) return fail('VALIDATION', errors.total || 'راجع قيم عرض السعر', errors);
    const res = store.createQuote(r.id, { ...body, note: String(body.note || '').slice(0, 500) });
    return res && res.ok ? ok(store.currentQuote(r.id), 201) : fail('CONFLICT', (res && res.msg) || 'تعذر إرسال عرض السعر');
  });

  client.define('POST', '/requests/:id/quote/approve', { roles: ['customer'], summary: 'Approve the current quote (refused when total is 0).' }, ({ params, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const q = store.currentQuote(r.id);
    if (!q || q.status !== 'pending') return fail('CONFLICT', 'لا يوجد عرض سعر بانتظار موافقتك');
    if (!(+q.total > 0)) return fail('CONFLICT', 'لا يمكن قبول عرض سعر بقيمة صفر');
    return store.approveQuote(r.id) ? store.currentQuote(r.id) : fail('CONFLICT', 'تعذر قبول عرض السعر');
  });

  client.define('POST', '/requests/:id/quote/reject', { roles: ['customer'], summary: 'Reject the current quote {reason}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const q = store.currentQuote(r.id);
    if (!q || q.status !== 'pending') return fail('CONFLICT', 'لا يوجد عرض سعر بانتظار ردّك');
    return store.rejectQuote(r.id, String(body.reason || '').slice(0, 300)) ? store.currentQuote(r.id) : fail('CONFLICT', 'تعذر رفض عرض السعر');
  });

  client.define('GET', '/free-reasons', { roles: ['public'], summary: 'Free-service reason catalogue.' }, ({ store }) =>
    Object.entries(store.FREE_REASONS).map(([id, label]) => ({ id, label })));

  client.define('POST', '/requests/:id/free', { roles: ['provider'], summary: 'Propose doing the job free of charge {reason}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    if (!Object.prototype.hasOwnProperty.call(store.FREE_REASONS, body.reason)) return fail('VALIDATION', 'اختر سبب الخدمة المجانية', { reason: 'مطلوب' });
    const res = store.proposeFree(r.id, body.reason);
    return res && res.ok ? ok(store.get('serviceRequests', r.id).freeService, 201) : fail('CONFLICT', (res && res.msg) || 'تعذر اقتراح الخدمة المجانية');
  });

  client.define('POST', '/requests/:id/free/respond', { roles: ['customer'], summary: 'Accept or decline a free-service proposal {accept}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    return store.respondFree(r.id, !!body.accept) ? store.get('serviceRequests', r.id).freeService : fail('CONFLICT', 'لا يوجد اقتراح خدمة مجانية بانتظار ردّك');
  });

  client.define('POST', '/requests/:id/free/complete', { roles: ['provider'], summary: 'Complete an accepted free service (value 0, no commission).' }, ({ params, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    return store.completeFree(r.id) ? store.get('serviceRequests', r.id) : fail('CONFLICT', 'الخدمة المجانية لم يوافق عليها العميل بعد');
  });

  const id = v => encodeURIComponent(v);
  return {
    validateQuote,
    submit: (reqId, q) => client.post('/requests/' + id(reqId) + '/quotes', q),
    approve: reqId => client.post('/requests/' + id(reqId) + '/quote/approve'),
    reject: (reqId, reason) => client.post('/requests/' + id(reqId) + '/quote/reject', { reason }),
    freeReasons: () => client.get('/free-reasons'),
    proposeFree: (reqId, reason) => client.post('/requests/' + id(reqId) + '/free', { reason }),
    respondFree: (reqId, accept) => client.post('/requests/' + id(reqId) + '/free/respond', { accept }),
    completeFree: reqId => client.post('/requests/' + id(reqId) + '/free/complete')
  };
});
