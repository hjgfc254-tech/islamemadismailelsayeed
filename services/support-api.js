/**
 * MODULE: support-api
 * RESPONSIBILITY: Complaints/support contract over services/api-client.js (mock handlers on MP). Customers and
 *   providers file complaints only about requests they can access (or a general one with no request); only Admin
 *   lists all complaints and resolves them.
 * ROUTES:
 *   POST /complaints                 customer|provider   {reqId?, text, kind?}
 *   GET  /complaints                 customer|provider|admin   own complaints (admin: all, ?status=)
 *   POST /complaints/:id/resolve     admin   {resolution}
 * STATUS: IMPLEMENTED (MOCK ADAPTER — local store only, no ticketing system, no network)
 */
'use strict';
(function (root, factory) {
  const req = typeof require === 'function' ? require : null;
  const client = root.HSApiClient || (req ? req('./api-client.js') : null);
  const orders = root.HSOrdersApi || (req ? req('./orders-api.js') : null);
  const api = factory(client, orders);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSSupportApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (client, orders) {
  const { ok, fail } = client;
  const byOf = actor => actor.role + ':' + actor.id;

  client.define('POST', '/complaints', { roles: ['customer', 'provider'], summary: 'File a complaint {reqId?, text, kind?}.' }, ({ body, actor, store }) => {
    const text = String(body.text || '').trim();
    if (text.length < 5 || text.length > 1000) return fail('VALIDATION', 'اكتب تفاصيل الشكوى (5–1000 حرف)', { text: '5–1000' });
    if (body.reqId) {
      const r = store.get('serviceRequests', body.reqId);
      if (!r || !orders.canAccess(actor, r, store)) return fail('NOT_FOUND', 'الطلب غير موجود');
    }
    store.complain(body.reqId || '', byOf(actor), text, { kind: String(body.kind || '').slice(0, 40) });
    return ok(store.db().complaints[0], 201);
  });

  client.define('GET', '/complaints', { roles: ['customer', 'provider', 'admin'], summary: 'Own complaints; admin sees all (?status=).' }, ({ query, actor, store }) => {
    const all = store.db().complaints;
    const items = (actor.role === 'admin' ? all : all.filter(k => k.by === byOf(actor))).filter(k => !query.status || k.status === query.status);
    return { items, total: items.length };
  });

  client.define('POST', '/complaints/:id/resolve', { roles: ['admin'], summary: 'Resolve a complaint {resolution}.' }, ({ params, body, actor, store }) => {
    const G = (typeof globalThis !== 'undefined' && globalThis.HSAdminPermissionGuard) || null;
    const emp = actor.adminRole ? { id: actor.id, role: actor.adminRole, status: 'active' } : null;
    if (G && emp && !G.can(emp, 'complaints', 'decide')) return fail('FORBIDDEN');
    const k = store.get('complaints', params.id);
    if (!k) return fail('NOT_FOUND', 'الشكوى غير موجودة');
    if (k.status !== 'open') return fail('CONFLICT', 'الشكوى مغلقة بالفعل');
    const res = String(body.resolution || '').trim();
    if (!res) return fail('VALIDATION', 'اكتب نتيجة المعالجة', { resolution: 'مطلوب' });
    store.resolveComplaint(k.id, res.slice(0, 500));
    return store.get('complaints', k.id);
  });

  return {
    file: (text, reqId, kind) => client.post('/complaints', { text, reqId, kind }),
    list: status => client.get('/complaints' + (status ? '?status=' + encodeURIComponent(status) : '')),
    resolve: (id, resolution) => client.post('/complaints/' + encodeURIComponent(id) + '/resolve', { resolution })
  };
});
