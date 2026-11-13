/**
 * MODULE: guest-entry
 * Resolves where a deep link should land (frontend only), combining HSCustomerRouter (parsing) and
 * HSGuestPolicy (visibility). A guest opening a customer-only link is sent to the account sign-in and the
 * original link is remembered (sessionStorage) so the app can return there after a successful demo sign-in.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  const RETURN_KEY = 'hs_return_to';
  const session = () => { try { return root.sessionStorage || null; } catch { return null; } };

  /**
   * resolve(hash, customer, MP) →
   *   {screen, id?, tab}                         open this route
   *   {screen:'account', tab:'account', signin:true, returnTo}   ask to sign in first
   *   {screen:'home', tab:'home', notFound:true}  unknown, malformed or not visible to this customer
   *   null                                       no deep link (empty hash) — keep the default start
   */
  function resolve(hash, customer, MP) {
    const R = root.HSCustomerRouter, P = root.HSGuestPolicy;
    if (!R || !P) return null;
    if (!String(hash || '').replace(/^#\/?/, '')) return null;
    const route = R.parse(hash);
    const decision = P.decide(route, customer, MP);
    if (decision.allow) return route;
    if (decision.reason === 'signin') return { screen: 'account', tab: 'account', signin: true, returnTo: R.format(route.screen, route.id) };
    return { screen: 'home', tab: 'home', notFound: true };
  }

  function rememberReturn(hash) { const s = session(); if (s && hash) try { s.setItem(RETURN_KEY, hash); } catch {} }
  /** Read-and-clear the remembered link (one-shot). */
  function consumeReturn() {
    const s = session(); if (!s) return '';
    try { const v = s.getItem(RETURN_KEY) || ''; s.removeItem(RETURN_KEY); return v; } catch { return ''; }
  }

  root.HSGuestEntry = Object.freeze({ RETURN_KEY, resolve, rememberReturn, consumeReturn });
})(globalThis);
