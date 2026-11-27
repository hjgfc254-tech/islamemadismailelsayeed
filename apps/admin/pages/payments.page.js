/**
 * MODULE: payments.page — registers «المدفوعات» (#/payments), a tab of the «الفلوس» section (2026-11-27).
 * The view lives in modules/payments-admin.js (HSPaymentsAdmin); it reads and writes the real routes in both modes.
 */
'use strict';
(function (root) {
  const S = root.HSAdminShell;
  if (!S || typeof S.registerPage !== 'function') return;
  S.registerPage('payments', {
    title: 'المدفوعات',
    description: 'الدفع الأونلاين: الفلوس المحجوزة، تحويلات الفنيين الأسبوعية، الاسترجاعات، وإعدادات الدفع.',
    render: () => { const host = root.document.createElement('div'); host.className = 'pay'; if (root.HSPaymentsAdmin) root.HSPaymentsAdmin.mount(host); return host; }
  });
})(typeof window !== 'undefined' ? window : globalThis);
