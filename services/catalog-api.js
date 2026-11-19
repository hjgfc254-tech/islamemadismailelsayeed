/**
 * MODULE: catalog-api
 * RESPONSIBILITY: Public browsing contract (Guest and Customer) over services/api-client.js: categories (CAT,
 *   services/local-catalog.js), services and provider directory/profiles (MP). Only APPROVED, non-suspended providers
 *   are listed, and the public projection never exposes phone numbers, documents or commission terms.
 * ROUTES (all public):
 *   GET /categories                 active categories
 *   GET /services?cat=              services, optionally by category
 *   GET /providers?cat=&gov=&q=     approved provider directory (public projection, rating)
 *   GET /providers/:id              one approved provider's public profile + recent reviews
 * STATUS: IMPLEMENTED (MOCK ADAPTER — local data only, no network)
 */
'use strict';
(function (root, factory) {
  const client = root.HSApiClient || (typeof require === 'function' ? require('./api-client.js') : null);
  const api = factory(client);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSCatalogApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (client) {
  const { fail } = client;
  /* CAT is a global lexical binding (services/local-catalog.js), not a globalThis property. */
  const catalog = () => { try { return typeof CAT !== 'undefined' ? CAT : null; } catch { return null; } };

  /** Public provider projection — the only provider shape Guest/Customer contracts may receive. */
  function publicProvider(store, p) {
    return {
      id: p.id, name: p.name, type: p.type || 'individual', cats: (p.cats || []).slice(), govs: (p.govs || []).slice(),
      areas: (p.areas || []).slice(), years: +p.years || 0, bio: p.bio || '', available: p.available !== false,
      rating: store.rating(p.id), jobs: +p.jobs || 0
    };
  }
  const listed = p => p && p.status === 'approved';

  client.define('GET', '/categories', { roles: ['public'], summary: 'Active categories.' }, () => {
    const c = catalog();
    if (!c) return fail('UNAVAILABLE', 'دليل الأقسام غير محمّل');
    return c.categories().filter(x => x.active !== false).map(x => ({ id: x.id, name: x.name, icon: x.icon, kind: x.kind }));
  });

  client.define('GET', '/services', { roles: ['public'], summary: 'Services (?cat=).' }, ({ query, store }) =>
    store.db().services.filter(s => !query.cat || s.cat === query.cat).map(s => ({ id: s.id, cat: s.cat, name: s.name })));

  client.define('GET', '/providers', { roles: ['public'], summary: 'Approved provider directory (?cat=&gov=&q=).' }, ({ query, store }) => {
    const q = String(query.q || '').trim();
    const items = store.db().providers.filter(p => listed(p)
      && (!query.cat || (p.cats || []).includes(query.cat))
      && (!query.gov || (p.govs || []).includes(query.gov))
      && (!q || p.name.includes(q) || String(p.bio || '').includes(q)));
    return { items: items.map(p => publicProvider(store, p)), total: items.length };
  });

  client.define('GET', '/providers/:id', { roles: ['public'], summary: 'Public provider profile + recent reviews.' }, ({ params, store }) => {
    const p = store.get('providers', params.id);
    if (!listed(p)) return fail('NOT_FOUND', 'مقدم الخدمة غير موجود');
    const reviews = store.db().reviews.filter(v => v.providerId === p.id && !v.hidden).slice(0, 10).map(v => ({ stars: v.stars, comment: v.comment || '', at: v.at }));
    return { ...publicProvider(store, p), reviews };
  });

  client.define('GET', '/providers/:id/portfolio', { roles: ['public'], summary: 'Before / after photos the customers allowed the provider to show.' }, ({ params, store }) => {
    const p = store.get('providers', params.id);
    if (!listed(p)) return fail('NOT_FOUND', 'مقدم الخدمة غير موجود');
    return { items: (typeof store.portfolio === 'function' ? store.portfolio(p.id) : []).map(x => ({ before: x.before, after: x.after, at: x.at })) };
  });

  const qs = o => { const s = Object.entries(o).filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'); return s ? '?' + s : ''; };
  return {
    publicProvider,
    categories: () => client.get('/categories'),
    services: cat => client.get('/services' + qs({ cat })),
    providers: (filters = {}) => client.get('/providers' + qs({ cat: filters.cat, gov: filters.gov, q: filters.q })),
    provider: id => client.get('/providers/' + encodeURIComponent(id)),
    portfolio: id => client.get('/providers/' + encodeURIComponent(id) + '/portfolio')
  };
});
