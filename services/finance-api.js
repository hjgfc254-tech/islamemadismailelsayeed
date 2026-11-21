/**
 * MODULE: finance-api
 * RESPONSIBILITY: Commission/earnings contract over services/api-client.js (mock handlers on MP). Figures are local
 *   demo calculations — NO payment processing, NO payouts, NO real money movement exists anywhere in this frontend.
 *   Free-service jobs appear as value-0 transactions (free:true, collection 'none') and never carry commission.
 * ROUTES:
 *   GET  /providers/me/earnings              provider   own transactions + totals
 *   GET  /admin/transactions?collection=     admin      all transactions               finance.view
 *   POST /admin/transactions/:id/collection  admin      {status: pending|collected|settled}   finance.edit
 *   GET  /admin/commission                   admin      {defaultRate, rates{cat:%}}
 *   POST /admin/commission                   admin      {defaultRate?, cat?, rate?}    (0–100 %)
 * STATUS: IMPLEMENTED (MOCK ADAPTER — demo figures only, no payments, no network)
 */
'use strict';
(function (root, factory) {
  const client = root.HSApiClient || (typeof require === 'function' ? require('./api-client.js') : null);
  const api = factory(root, client);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSFinanceApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, client) {
  const { fail } = client;
  const COLLECTION = ['pending', 'collected', 'settled'];   // same states as the Admin marketplace page
  const rateOk = v => Number.isFinite(+v) && +v >= 0 && +v <= 100;   // same bound as the Admin UI
  function permitted(actor, module, action) {
    const G = root.HSAdminPermissionGuard;
    if (!G || !actor.adminRole) return true;
    return G.can(((((root.HSAdminRbac || {}).state || {}).roster || []).find((x) => x.id === actor.id) || { id: actor.id, role: actor.adminRole, status: 'active' }), module, action);
  }

  /** Totals over a transaction list (pure). Free jobs count as jobs but add nothing to value or commission. */
  function totals(list) {
    const sum = k => Math.round(list.reduce((s, t) => s + (+t[k] || 0), 0) * 100) / 100;
    return { jobs: list.length, freeJobs: list.filter(t => t.free).length, value: sum('value'), commission: sum('commission'), net: sum('net') };
  }

  /* rank check for risky actions (apps/admin/permission-guard.js riskDenied; same on the server) */
  const risk = (actor, key) => { const G = (typeof globalThis !== 'undefined' && globalThis.HSAdminPermissionGuard) || null; const m = G && G.riskDenied && key ? G.riskDenied(actor, key) : ''; return m ? client.fail('FORBIDDEN', m) : null; };
  client.define('GET', '/providers/me/earnings', { roles: ['provider'], summary: 'Own transactions and totals.' }, ({ actor, store }) => {
    const items = store.db().transactions.filter(t => t.providerId === actor.id);
    return { items, totals: totals(items), demo: true };
  });

  client.define('GET', '/admin/transactions', { roles: ['admin'], summary: 'All transactions (?collection=).' }, ({ query, actor, store }) => {
    if (!permitted(actor, 'finance', 'view')) return fail('FORBIDDEN');
    const items = store.db().transactions.filter(t => !query.collection || t.collection === query.collection);
    return { items, totals: totals(items), demo: true };
  });

  client.define('POST', '/admin/transactions/:id/collection', { roles: ['admin'], summary: 'Set a commission collection status.' }, ({ params, body, actor, store }) => {
    { const rk = risk(actor, 'finance.collection'); if (rk) return rk; }
    if (!permitted(actor, 'finance', 'edit')) return fail('FORBIDDEN');
    const t = store.get('transactions', params.id); if (!t) return fail('NOT_FOUND', 'المعاملة غير موجودة');
    if (t.free) return fail('CONFLICT', 'خدمة مجانية — لا توجد عمولة للتحصيل');
    if (!COLLECTION.includes(body.status)) return fail('VALIDATION', 'حالة غير صالحة', { status: COLLECTION.join('|') });
    store.setCollection(t.id, body.status);
    return store.get('transactions', t.id);
  });

  client.define('GET', '/admin/commission', { roles: ['admin'], summary: 'Commission settings.' }, ({ store }) => {
    const s = store.db().settings;
    return { defaultRate: s.defaultRate, rates: { ...s.rates }, collectionModel: s.collectionModel };
  });

  client.define('POST', '/admin/commission', { roles: ['admin'], summary: 'Update default or per-category rate (0–100 %).' }, ({ body, actor, store }) => {
    { const rk = risk(actor, 'finance.commission'); if (rk) return rk; }
    if (body.defaultRate !== undefined) {
      if (!rateOk(body.defaultRate)) return fail('VALIDATION', 'النسبة من 0 إلى 100', { defaultRate: '0–100' });
      store.setSetting('defaultRate', +body.defaultRate);
    }
    if (body.cat) {
      if (body.rate !== '' && body.rate !== null && !rateOk(body.rate)) return fail('VALIDATION', 'النسبة من 0 إلى 100', { rate: '0–100' });
      store.setCatRate(String(body.cat), body.rate === null ? '' : body.rate);
    }
    const s = store.db().settings;
    return { defaultRate: s.defaultRate, rates: { ...s.rates }, collectionModel: s.collectionModel };
  });

  /* ── Upfront pricing (Uber model): base price per service = provider amount; customer pays base × (1 + markup%) ── */
  const KEY_RE = /^[\w:./-]{1,80}$/;
  client.define('GET', '/pricing', { roles: ['public'], summary: 'Customer prices per service key (upfront, platform share included) and the markup rate.' }, ({ store }) => {
    const prices = store.db().settings.prices || {};
    const out = {};
    for (const k of Object.keys(prices)) { const q = store.priceFor(k); if (q) out[k] = q.customerPrice; }
    return { markupRate: store.markupRate(), prices: out };
  });
  /* base prices + markup + the learned price library (ranges of provider amounts of completed jobs per item / problem) */
  const pricingView = (store) => {
    const lib = (store.db().settings || {}).priceLib || {};
    const library = {}; for (const k of Object.keys(lib)) { const r = typeof store.priceRange === 'function' ? store.priceRange(k) : null; if (r) library[k] = r; }
    return { markupRate: store.markupRate(), prices: { ...(store.db().settings.prices || {}) }, library };
  };
  client.define('GET', '/admin/pricing', { roles: ['admin'], summary: 'Base prices (provider amounts) per service key and the markup rate.' }, ({ actor, store }) => {
    if (!permitted(actor, 'services', 'view')) return fail('FORBIDDEN');
    return pricingView(store);
  });
  client.define('POST', '/admin/pricing', { roles: ['admin'], summary: 'Set or clear the base price of a service key {key, base>0|null}; or the markup {markupRate 0–100}.' }, ({ body, actor, store }) => {
    { const rk = risk(actor, 'finance.pricing'); if (rk) return rk; }
    if (!permitted(actor, 'services', 'edit')) return fail('FORBIDDEN');
    if (body.markupRate !== undefined) {
      if (!rateOk(body.markupRate)) return fail('VALIDATION', 'النسبة من 0 إلى 100', { markupRate: '0–100' });
      store.setSetting('markupRate', +body.markupRate);
    }
    if (body.key !== undefined) {
      if (!KEY_RE.test(String(body.key))) return fail('VALIDATION', 'خدمة غير صالحة', { key: 'invalid' });
      if (body.base !== null && body.base !== '' && !(+body.base > 0 && +body.base <= 1000000)) return fail('VALIDATION', 'السعر الأساسي يجب أن يكون أكبر من صفر', { base: '>0' });
      store.setPrice(String(body.key), body.base === null || body.base === '' ? null : +body.base);
    }
    return pricingView(store);
  });

  return {
    totals,
    earnings: () => client.get('/providers/me/earnings'),
    transactions: collection => client.get('/admin/transactions' + (collection ? '?collection=' + encodeURIComponent(collection) : '')),
    setCollection: (txId, status) => client.post('/admin/transactions/' + encodeURIComponent(txId) + '/collection', { status }),
    commission: () => client.get('/admin/commission'),
    setCommission: patch => client.post('/admin/commission', patch)
  };
});
