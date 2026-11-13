/* HANSALEHLAK V8 — Provider domain adapter.
 * Thin compatibility shim that delegates classification & grouping
 * to HSProviderRequestDomain (single source of truth).
 * Must be loaded AFTER apps/provider/provider-request-domain.js.
 */
'use strict';
(function (root) {
  const domain = root.HSProviderRequestDomain;
  if (!domain || typeof domain.getRequestGroup !== 'function' || typeof domain.groupProviderRequests !== 'function') {
    throw new Error(
      'HSProviderDomain adapter requires HSProviderRequestDomain to be loaded first. ' +
      'Ensure apps/provider/provider-request-domain.js is included before apps/provider/provider-domain.js.'
    );
  }

  const GROUPS = Object.freeze({
    new: 'طلبات جديدة',
    accepted: 'مقبولة',
    progress: 'جارية',
    quote: 'عروض الأسعار',
    done: 'مكتملة',
    cancelled: 'ملغاة / مرفوضة'
  });

  function groupOf(request, assignment) {
    return domain.getRequestGroup(request, assignment);
  }

  function groupAssignments(db, providerId) {
    return domain.groupProviderRequests(db, providerId);
  }

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function totals(transactions) {
    const result = { value: 0, commission: 0, net: 0 };
    if (!Array.isArray(transactions)) return result;
    for (const item of transactions) {
      if (!item || typeof item !== 'object') continue;
      result.value += safeNumber(item.value);
      result.commission += safeNumber(item.commission);
      result.net += safeNumber(item.net);
    }
    return result;
  }

  root.HSProviderDomain = Object.freeze({ GROUPS, groupOf, groupAssignments, totals });
})(globalThis);
