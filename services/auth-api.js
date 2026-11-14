/**
 * MODULE: auth-api
 * RESPONSIBILITY: Resolves the demo *actor* ({ role, id, ... }) that services/api-client.js attaches to every request,
 *   from the existing per-app demo sessions — it does not create a new identity system:
 *     customer → localStorage `hs_user` ({name, phone}) matched to an MP customer (not suspended)
 *     provider → sessionStorage `hs_provider_demo_session` → MP provider whose status is 'approved'
 *                (a pending/rejected/suspended registration gets NO provider role: registering never grants it)
 *     admin    → sessionStorage `hs_admin_demo_session` → active HSAdminRbac roster employee
 *   The actor follows the app that is running (`useApp`, defaulting to the page path), so an Admin session in one tab
 *   can never act inside the Customer or Provider app.
 * ROUTES: GET /auth/me (public) → the current actor or null.
 * STATUS: IMPLEMENTED (MOCK ADAPTER — demo identity only; NOT authentication, no passwords/tokens)
 */
'use strict';
(function (root, factory) {
  const client = root.HSApiClient || (typeof require === 'function' ? require('./api-client.js') : null);
  const api = factory(root, client);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSAuthApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, client) {
  const APPS = ['customer', 'provider', 'admin'];
  const KEYS = { customer: 'hs_user', provider: 'hs_provider_demo_session', admin: 'hs_admin_demo_session' };
  let app = null;
  let storages = null;      // tests may inject { local, session }

  const local = () => { try { return (storages && storages.local) || root.localStorage || null; } catch { return null; } };
  const session = () => { try { return (storages && storages.session) || root.sessionStorage || null; } catch { return null; } };
  const read = (s, k) => { try { return s ? s.getItem(k) : null; } catch { return null; } };

  function currentApp() {
    if (app) return app;
    const p = (root.location && root.location.pathname) || '';
    if (/\/apps\/admin\//.test(p)) return 'admin';
    if (/\/apps\/provider\//.test(p)) return 'provider';
    return 'customer';
  }

  function customerActor(store) {
    let u = null;
    try { u = JSON.parse(read(local(), KEYS.customer)); } catch { u = null; }
    if (!u || typeof u.phone !== 'string' || !u.phone) return null;
    const c = store && store.db().customers.find(x => x.phone === u.phone);
    if (!c || c.status === 'suspended') return null;
    return { role: 'customer', id: c.id, name: c.name };
  }
  function providerActor(store) {
    const id = read(session(), KEYS.provider);
    const p = id && store && store.get('providers', id);
    if (!p || p.status !== 'approved') return null;
    return { role: 'provider', id: p.id, name: p.name };
  }
  function adminActor() {
    const id = read(session(), KEYS.admin);
    const rbac = root.HSAdminRbac;
    const e = id && rbac && rbac.state && rbac.state.roster.find(x => x.id === id && x.status === 'active');
    return e ? { role: 'admin', id: e.id, name: e.name, adminRole: e.role } : null;
  }

  /** The actor for the running app, or null (guest / no demo session / not approved). */
  function currentActor() {
    const store = client && client.store();
    const a = currentApp();
    if (a === 'admin') return adminActor();
    if (a === 'provider') return providerActor(store);
    return customerActor(store);
  }

  /** Why a provider has no provider role (for honest UI copy), or '' when they do. */
  function providerBlockReason(store, id) {
    const p = id && store && store.get('providers', id);
    if (!p) return 'not-registered';
    return p.status === 'approved' ? '' : p.status;      // 'pending' | 'rejected' | 'suspended'
  }

  if (client) {
    client.setActorResolver(currentActor);
    client.define('GET', '/auth/me', { roles: ['public'], summary: 'Current demo actor for the running app, or null.' },
      () => currentActor());
  }

  return {
    APPS, KEYS, currentActor, currentApp, providerBlockReason,
    useApp(name) { if (name !== null && !APPS.includes(name)) throw new Error('auth-api: unknown app ' + name); app = name; },
    _useStorages(s) { storages = s || null; }
  };
});
