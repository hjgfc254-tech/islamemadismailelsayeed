/**
 * MODULE: guest-policy
 * Which Customer routes a visitor without a demo identity may open directly (deep links). Presentation policy only:
 * it decides what the frontend shows; it is NOT authorization — real access control requires a server.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  /* requestCreate is public: the wizard itself collects contact details and signs the visitor in on submit */
  const PUBLIC = Object.freeze(['home', 'sections', 'search', 'account', 'providerDetails', 'requestCreate']);
  const CUSTOMER_ONLY = Object.freeze(['orders', 'tracking']);

  /**
   * decide(route, customer, MP) → {allow:true} | {allow:false, reason:'signin'|'not-found'}
   * - public screens are always allowed;
   * - customer-only screens need a signed-in demo customer;
   * - tracking additionally requires the request to belong to that customer (no peeking at other customers' requests).
   */
  function decide(route, customer, MP) {
    if (!route || !route.screen) return { allow: false, reason: 'not-found' };
    if (PUBLIC.includes(route.screen)) return { allow: true };
    if (!CUSTOMER_ONLY.includes(route.screen)) return { allow: false, reason: 'not-found' };
    if (!customer) return { allow: false, reason: 'signin' };
    if (route.screen === 'tracking') {
      let request = null;
      try { request = MP && typeof MP.get === 'function' ? MP.get('serviceRequests', route.id) : null; } catch {}
      if (!request || request.customerId !== customer.id) return { allow: false, reason: 'not-found' };
    }
    return { allow: true };
  }

  root.HSGuestPolicy = Object.freeze({ PUBLIC, CUSTOMER_ONLY, decide, requiresCustomer: screen => CUSTOMER_ONLY.includes(screen) });
})(globalThis);
