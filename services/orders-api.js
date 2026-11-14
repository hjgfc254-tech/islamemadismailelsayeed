/**
 * MODULE: orders-api
 * RESPONSIBILITY: Service-request (order) contract over services/api-client.js. Mock handlers delegate to the local
 *   demo store (MP) and add the boundaries a backend must enforce: role, ownership and state-transition errors.
 *   Access rule (shared by the other adapters via `canAccess`): a customer sees only their own requests; a provider
 *   only requests offered/assigned to them; admin sees all.
 * ROUTES:
 *   POST /requests                     customer   create a request (status received → searching)
 *   GET  /requests                     customer|provider|admin   list visible requests (?status=)
 *   GET  /requests/:id                 customer|provider|admin   one visible request (+ current quote)
 *   POST /requests/:id/cancel          customer|admin   cancel before work starts
 *   POST /requests/:id/respond         provider   accept/decline an offered assignment {accept, reason}
 *   POST /requests/:id/schedule        provider|customer   propose {at} (provider) / confirm the time
 *   POST /requests/:id/advance         provider   next FLOW step {to}
 *   POST /requests/:id/complete        provider   complete with {value, deductions} (> 0, or the approved quote)
 *   POST /requests/:id/close           customer   confirm completion
 *   POST /requests/:id/review          customer   {stars 1–5, comment}
 * STATUS: IMPLEMENTED (MOCK ADAPTER — local store only, no network)
 */
'use strict';
(function (root, factory) {
  const client = root.HSApiClient || (typeof require === 'function' ? require('./api-client.js') : null);
  const api = factory(client);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSOrdersApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (client) {
  const { ok, fail } = client;

  /** Can this actor see/act on this request? */
  function canAccess(actor, r, store) {
    if (!actor || !r) return false;
    if (actor.role === 'admin') return true;
    if (actor.role === 'customer') return r.customerId === actor.id;
    if (actor.role === 'provider') {
      const a = store.activeAssignment(r.id);
      const p = store.providerOf(r.id);
      return (a && a.providerId === actor.id) || (p && p.id === actor.id) || false;
    }
    return false;
  }
  /** Loads a request the actor may access, or returns a NOT_FOUND envelope (never leaks existence). */
  function load(store, actor, id) {
    const r = store.get('serviceRequests', id);
    return r && canAccess(actor, r, store) ? r : null;
  }
  const notFound = () => fail('NOT_FOUND', 'الطلب غير موجود');
  const view = (store, r) => ({ ...r, currentQuote: store.currentQuote(r.id) || null, statusLabel: (store.STATUS_LABEL && store.STATUS_LABEL[r.status]) || r.status });

  const REQUIRED = ['cat', 'serviceName', 'desc', 'gov', 'addr'];
  function validateCreate(b) {
    const errors = {};
    for (const k of REQUIRED) if (!String(b[k] || '').trim()) errors[k] = 'مطلوب';
    if (String(b.desc || '').length > 2000) errors.desc = 'الوصف أطول من 2000 حرف';
    return errors;
  }

  client.define('POST', '/requests', { roles: ['customer'], summary: 'Create a service request for the signed-in customer.' }, ({ body, actor, store }) => {
    const errors = validateCreate(body);
    if (Object.keys(errors).length) return fail('VALIDATION', 'راجع الحقول المطلوبة', errors);
    const c = store.get('customers', actor.id);
    if (!c) return fail('UNAUTHENTICATED');
    const r = store.createRequest({ ...body, name: c.name, phone: c.phone });
    return ok(view(store, r), 201);
  });

  client.define('GET', '/requests', { roles: ['customer', 'provider', 'admin'], summary: 'List requests visible to the actor (?status=).' }, ({ query, actor, store }) => {
    const items = store.reqs().filter(r => canAccess(actor, r, store) && (!query.status || r.status === query.status));
    return { items: items.map(r => view(store, r)), total: items.length };
  });

  client.define('GET', '/requests/:id', { roles: ['customer', 'provider', 'admin'], summary: 'One request (with current quote).' }, ({ params, actor, store }) => {
    const r = load(store, actor, params.id);
    return r ? view(store, r) : notFound();
  });

  client.define('POST', '/requests/:id/cancel', { roles: ['customer', 'admin'], summary: 'Cancel before work starts.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const reason = String(body.reason || (actor.role === 'admin' ? 'إلغاء من الإدارة' : 'إلغاء من العميل'));
    return store.cancel(r.id, reason) ? view(store, r) : fail('CONFLICT', 'لا يمكن إلغاء الطلب في حالته الحالية');
  });

  client.define('POST', '/requests/:id/respond', { roles: ['provider'], summary: 'Accept or decline an offered assignment.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    if (!body.accept && !String(body.reason || '').trim()) return fail('VALIDATION', 'اذكر سبب الاعتذار', { reason: 'مطلوب' });
    return store.respond(r.id, !!body.accept, body.reason || '') ? view(store, r) : fail('CONFLICT', 'لا يوجد عرض بانتظار ردّك على هذا الطلب');
  });

  client.define('POST', '/requests/:id/schedule', { roles: ['provider', 'customer'], summary: 'Provider proposes {at}; either side confirms.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const done = body.at && actor.role === 'provider' ? store.propose(r.id, String(body.at)) : store.confirmTime(r.id, actor.role);
    return done ? view(store, r) : fail('CONFLICT', 'حالة الطلب لا تسمح بتحديد الموعد');
  });

  client.define('POST', '/requests/:id/advance', { roles: ['provider'], summary: 'Move to the next FLOW status {to}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    if (!store.providerOf(r.id)) return fail('FORBIDDEN', 'اقبل الطلب أولًا');
    return store.advance(r.id, String(body.to || '')) ? view(store, r) : fail('CONFLICT', 'انتقال غير مسموح من الحالة الحالية');
  });

  client.define('POST', '/requests/:id/complete', { roles: ['provider'], summary: 'Complete a paid job: {value>0, deductions} or the approved quote.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    if (body.value !== undefined && body.value !== '' && !(+body.value > 0)) return fail('VALIDATION', 'القيمة النهائية يجب أن تكون أكبر من صفر — للخدمة بلا مقابل استخدم مسار الخدمة المجانية', { value: 'أكبر من صفر' });
    return store.complete(r.id, body.value, body.deductions) ? view(store, r) : fail('CONFLICT', 'لا يمكن إكمال الطلب الآن (حالة غير مناسبة، أو خدمة مجانية قيد التنفيذ، أو لا يوجد عرض سعر معتمد)');
  });

  client.define('POST', '/requests/:id/close', { roles: ['customer'], summary: 'Customer confirms completion.' }, ({ params, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    return store.close(r.id) ? view(store, r) : fail('CONFLICT', 'الطلب لم يكتمل بعد');
  });

  client.define('POST', '/requests/:id/review', { roles: ['customer'], summary: 'Rate the provider once {stars 1–5, comment}.' }, ({ params, body, actor, store }) => {
    const r = load(store, actor, params.id); if (!r) return notFound();
    const stars = +body.stars;
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return fail('VALIDATION', 'اختر تقييمًا من 1 إلى 5', { stars: '1–5' });
    if (!['completed', 'closed'].includes(r.status)) return fail('CONFLICT', 'التقييم متاح بعد إتمام الخدمة');
    return store.review(r.id, { stars, comment: String(body.comment || '').slice(0, 1000) }) ? ok(view(store, r), 201) : fail('CONFLICT', 'تم تقييم هذا الطلب من قبل');
  });

  const id = v => encodeURIComponent(v);
  return {
    canAccess,
    create: body => client.post('/requests', body),
    list: (status) => client.get('/requests' + (status ? '?status=' + id(status) : '')),
    get: reqId => client.get('/requests/' + id(reqId)),
    cancel: (reqId, reason) => client.post('/requests/' + id(reqId) + '/cancel', { reason }),
    respond: (reqId, accept, reason) => client.post('/requests/' + id(reqId) + '/respond', { accept, reason }),
    schedule: (reqId, at) => client.post('/requests/' + id(reqId) + '/schedule', at ? { at } : {}),
    advance: (reqId, to) => client.post('/requests/' + id(reqId) + '/advance', { to }),
    complete: (reqId, value, deductions) => client.post('/requests/' + id(reqId) + '/complete', { value, deductions }),
    close: reqId => client.post('/requests/' + id(reqId) + '/close'),
    review: (reqId, stars, comment) => client.post('/requests/' + id(reqId) + '/review', { stars, comment })
  };
});
