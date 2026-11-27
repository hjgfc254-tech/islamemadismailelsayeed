/**
 * MODULE: customer-api
 * RESPONSIBILITY: Signed-in customer self-service contract over services/api-client.js (mock handlers on MP).
 *   Every route is scoped to the calling customer — there is no way to address another customer's data.
 * ROUTES (customer):
 *   GET    /customers/me                    own profile
 *   GET    /customers/me/addresses          saved addresses
 *   POST   /customers/me/addresses          {label, gov, area, addr, detail, type, default}
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
  const pick = a => { const o = {}; for (const k of ['label', 'gov', 'area', 'addr', 'detail', 'type', 'default']) if (k in a) o[k] = a[k]; return o; };
  const ownAddress = (store, actor, id) => store.addressesFor(actor.id).find(a => a.id === id) || null;

  client.define('GET', '/customers/me', { roles: C, summary: 'Own customer profile.' }, ({ actor, store }) => {
    const c = store.get('customers', actor.id);
    return c ? { id: c.id, name: c.name, phone: c.phone, status: c.status } : fail('NOT_FOUND');
  });
  const PREF_KEYS = ['notifyStatus', 'notifyQuotes', 'notifyReminders'];
  const CONTACTS = ['call', 'whatsapp', 'sms'];
  client.define('PATCH', '/customers/me', { roles: C, summary: 'Edit own profile {name, phone, email, prefs}.' }, ({ body, actor, store }) => {
    const c = store.get('customers', actor.id);
    if (!c) return fail('NOT_FOUND');
    const errors = {};
    const name = body.name === undefined ? c.name : String(body.name).replace(/\s+/g, ' ').trim();
    const phone = body.phone === undefined ? c.phone : String(body.phone).trim();
    const email = body.email === undefined ? (c.email || '') : String(body.email).trim();
    if (!name || name.length > 80) errors.name = 'الاسم مطلوب (حتى 80 حرفًا)';
    if (!/^[0-9+ ]{8,15}$/.test(phone)) errors.phone = 'رقم الهاتف غير صحيح';
    else if (store.db().customers.some(x => x.phone === phone && x.id !== c.id)) errors.phone = 'الرقم مستخدم لحساب آخر';
    if (email && (email.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) errors.email = 'بريد غير صالح';
    if (Object.keys(errors).length) return fail('VALIDATION', 'راجع بيانات الملف الشخصي', errors);
    let prefs = c.prefs;
    if (body.prefs && typeof body.prefs === 'object') {
      prefs = { notifyStatus: true, notifyQuotes: true, notifyReminders: true, preferredContact: 'call', ...(c.prefs || {}) };
      for (const k of PREF_KEYS) if (typeof body.prefs[k] === 'boolean') prefs[k] = body.prefs[k];
      if (CONTACTS.includes(body.prefs.preferredContact)) prefs.preferredContact = body.prefs.preferredContact;
    }
    Object.assign(c, { name, phone, email }, prefs ? { prefs } : {});
    store.save();
    return { id: c.id, name: c.name, phone: c.phone, email: c.email || '', status: c.status, prefs: c.prefs || null };
  });
  client.define('DELETE', '/customers/me', { roles: C, summary: 'Delete own account (profile, addresses, favorites; refused with an open request; past requests are kept anonymised for invoices / warranty).' }, ({ actor, store }) => {
    const db = store.db();
    if (!store.get('customers', actor.id)) return fail('NOT_FOUND');
    const mine = (db.serviceRequests || []).filter(r => r.customerId === actor.id);
    if (mine.some(r => !['completed', 'closed', 'cancelled', 'failed'].includes(r.status))) return fail('CONFLICT', 'عندك طلب لسه شغال — استنى لما يخلص أو الغيه الأول، وبعدها احذف الحساب');
    /* personal data out of the kept requests (law 151/2020): no name, phone, street address, map pin, notes or photos */
    mine.forEach(r => Object.assign(r, { name: 'عميل محذوف', phone: '', addr: '', geo: null, liveGeo: null, note: '', notes: '', photos: [], customerDeleted: true }));
    db.customers = db.customers.filter(c => c.id !== actor.id);
    db.addresses = db.addresses.filter(a => a.customerId !== actor.id);
    db.favorites = db.favorites.filter(f => f.customerId !== actor.id);
    store.save();
    return { id: actor.id, deleted: true };
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
  client.define('GET', '/customers/me/devices', { roles: C, summary: '«بيتي»: own appliances with the next maintenance date.' }, ({ actor, store }) => store.devicesFor(actor.id));
  client.define('POST', '/customers/me/devices', { roles: C, summary: 'Add an appliance {item, brand, year}.' }, ({ body, actor, store }) => {
    if (!String(body.item || '').trim()) return fail('VALIDATION', 'اختار الجهاز', { item: 'مطلوب' });
    const d = store.addDevice(actor.id, body); return d ? ok(d, 201) : fail('CONFLICT', 'وصلت للحد الأقصى (20 جهاز)');
  });
  client.define('DELETE', '/customers/me/devices/:id', { roles: C, summary: 'Remove an appliance.' }, ({ params, actor, store }) => store.removeDevice(actor.id, params.id) ? { removed: true } : fail('NOT_FOUND', 'الجهاز غير موجود'));
  client.define('POST', '/customers/me/ref-code', { roles: C, summary: 'Own invite code (created on first use) + current credit and the invite reward.' }, ({ actor, store }) => {
    const c = store.get('customers', actor.id); if (!c) return fail('UNAUTHENTICATED');
    const ref = (store.db().settings || {}).referral || {};
    if (!ref.on) return fail('CONFLICT', 'برنامج الدعوة مش متاح دلوقتي');
    return { code: store.refCodeFor(c.id), reward: +ref.reward || 0, credit: +c.credit || 0 };
  });

  const id = v => encodeURIComponent(v);
  return {
    validateAddress,
    me: () => client.get('/customers/me'),
    updateMe: patch => client.patch('/customers/me', patch),
    deleteMe: () => client.del('/customers/me'),
    addresses: () => client.get('/customers/me/addresses'),
    addAddress: a => client.post('/customers/me/addresses', a),
    updateAddress: (aid, patch) => client.patch('/customers/me/addresses/' + id(aid), patch),
    removeAddress: aid => client.del('/customers/me/addresses/' + id(aid)),
    favorites: () => client.get('/customers/me/favorites'),
    toggleFavorite: (kind, refId) => client.post('/customers/me/favorites/toggle', { kind, refId }),
    refCode: () => client.post('/customers/me/ref-code', {}),
    devices: () => client.get('/customers/me/devices'),
    addDevice: d => client.post('/customers/me/devices', d),
    removeDevice: did => client.del('/customers/me/devices/' + id(did))
  };
});
