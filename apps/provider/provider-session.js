/* Provider demo identity is isolated from the customer profile. This is NOT authentication. */
'use strict';
(function (root) {
  const KEY = 'hs_provider_demo_session';
  root.HSProviderSession = Object.freeze({
    currentId() { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } },
    select(id) { try { if (id) sessionStorage.setItem(KEY, String(id)); else sessionStorage.removeItem(KEY); } catch {} },
    clear() { try { sessionStorage.removeItem(KEY); } catch {} }
  });
})(globalThis);
