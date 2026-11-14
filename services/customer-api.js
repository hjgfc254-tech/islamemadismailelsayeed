/**
 * MODULE: customer-api
 * RESPONSIBILITY: Signed-in customer self-service contract over services/api-client.js (mock handlers on MP).
 *   Every route is scoped to the calling customer — there is no way to address another customer's data.
 * ROUTES (customer):
 *   GET    /customers/me                    own profile
 *   GET    /customers/me/addresses          saved addresses
 *   POST   /customers/me/addresses          {label, gov, area, addr}
 *   PATCH  /customers/me/addresses/:id      partial address
 *   DELETE /customers/me/addresses/:id
 *   GET    /customers/me/favorites
 *   POST   /customers/me/favorites/toggle   {kind: 'provider'|'service', refId}
 * STATUS: IMPLEMENTED (MOCK ADAPTER — local store only, no network)
 */
'use strict';
(function (root, factory) {
  const client = root.HSApiClient || (typeof require === 'function' ? require('./api-client.js') : null);
  const api = factory(client);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSCustomerApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (client) {
  const { ok, fail } = client;
  const C = ['customer'];
  const KINDS = ['provider', 'service'];

  function validateAddress(a, partial) {
    const errors = {};
    for (const k of ['gov', 'addr']) if (!partial || k in a) if (!String(a[k] || '').trim()) errors[k] = 'مطلوب';
    if (a.addr && String(a.addr).length > 300) errors.addr = 'العنوان حتى 300 حرف';
    if (a.label && String(a.label).length > 40) errors.label = 'الاسم حتى 40 حرفًا';
    return errors;
  }
  const pick = a => { const o = {}; for (const k of ['label', 'gov', 'area', 'addr', 'isDefault']) if (k in a) o[k] = a[k]; return o; };
  const ownAddress = (store, actor, id) => store.addressesFor(actor.id).find(a => a.id === id) || null;

  client.define('GET', '/customers/me', { roles: C, summary: 'Own customer profile.' }, ({ actor, store }) => {
    const c = store.get('customers', actor.id);
    return c ? { id: c.id, name: c.name, phone: c.phone, status: c.status } : fail('NOT_FOUND');
  });
  client.define('GET', '/customers/me/addresses', { roles: C, summary: 'Saved addresses.' }, ({ actor, store }) => store.addressesFor(actor.id));
  client.define('POST', '/customers/me/addresses', { roles: C, summary: 'Add an address.' }, ({ body, actor, store }) => {
    const errors = validateAddress(body, false);
    if (Object.keys(errors).length) return fail('VALIDATION', 'راجع بيانات العنوان', errors);
    return ok(store.addAddress(actor.id, pick(body)), 201);
  });
  client.define('PATCH', '/customers/me/addresses/:id', { roles: C, summary: 'Edit an own address.' }, ({ params, body, actor, store }) => {
    if (!ownAddress(store, actor, params.id)) return fail('NOT_FOUND', 'العنوان غير موجود');
    const errors = validateAddress(body, true);
    if (Object.keys(errors).length) return fail('VALIDATION', 'راجع بيانات العنوان', errors);
    store.updateAddress(params.id, pick(body));
    return ownAddress(store, actor, params.id);
  });
  client.define('DELETE', '/customers/me/addresses/:id', { roles: C, summary: 'Remove an own address.' }, ({ params, actor, store }) => {
    if (!ownAddress(store, actor, params.id)) return fail('NOT_FOUND', 'العنوان غير موجود');
    store.removeAddress(params.id);
    return { id: params.id, removed: true };
  });
  client.define('GET', '/customers/me/favorites', { roles: C, summary: 'Favorites.' }, ({ actor, store }) => store.favoritesFor(actor.id));
  client.define('POST', '/customers/me/favorites/toggle', { roles: C, summary: 'Toggle a favorite {kind, refId}.' }, ({ body, actor, store }) => {
    if (!KINDS.includes(body.kind) || !String(body.refId || '').trim()) return fail('VALIDATION', 'عنصر غير صالح', { kind: KINDS.join('|'), refId: 'مطلوب' });
    store.toggleFavorite(actor.id, body.kind, String(body.refId));
    return { kind: body.kind, refId: String(body.refId), favorite: !!store.isFavorite(actor.id, body.kind, String(body.refId)) };
  });

  const id = v => encodeURIComponent(v);
  return {
    validateAddress,
    me: () => client.get('/customers/me'),
    addresses: () => client.get('/customers/me/addresses'),
    addAddress: a => client.post('/customers/me/addresses', a),
    updateAddress: (aid, patch) => client.patch('/customers/me/addresses/' + id(aid), patch),
    removeAddress: aid => client.del('/customers/me/addresses/' + id(aid)),
    favorites: () => client.get('/customers/me/favorites'),
    toggleFavorite: (kind, refId) => client.post('/customers/me/favorites/toggle', { kind, refId })
  };
});
