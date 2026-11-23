/**
 * MODULE: alerts.page — registers «التنبيهات» (alerts) and «البلاغات» (tickets) in the Admin shell.
 * The screens themselves live in modules/ops-center.js (HSOpsCenter); data comes from /admin/alerts and /admin/tickets.
 */
'use strict';
(function (root) {
  const S = root.HSAdminShell, O = root.HSOpsCenter;
  if (!S || typeof S.registerPage !== 'function' || !O) return;
  S.registerPage('alerts', { title: 'التنبيهات', description: 'اللي محتاج تدخّل من فريقك دلوقتي — استلمه بـ«أنا هاخده» وقفله بـ«تم».', render: () => O.renderAlerts() });
  S.registerPage('tickets', { title: 'البلاغات', description: 'الشغل الداخلي بين الفرق: افتح بلاغ، تابعه، وقفله لما يخلص.', render: () => O.renderTickets() });
})(typeof window !== 'undefined' ? window : globalThis);