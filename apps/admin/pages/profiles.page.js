/**
 * MODULE: profiles.page — registers the full-profile routes (2026-11-27). The views and models live in
 * modules/profile-360.js (HSAdminProfile), loaded just before this file.
 *   #/customer/<id> «ملف العميل» · #/provider/<id> «ملف الفني» · #/order/<id> «ملف الطلب»
 */
'use strict';
(function (root) {
  const S = root.HSAdminShell, P = root.HSAdminProfile;
  if (!S || typeof S.registerPage !== 'function' || !P) return;
  S.registerPage('customer', { title: 'ملف العميل', description: 'كل حاجة عن العميل في مكان واحد: طلباته، شكاويه، تقييماته، والإجراءات.', render: (ctx) => P.render('customer', ctx) });
  S.registerPage('provider', { title: 'ملف الفني', description: 'كل حاجة عن الفني: بياناته، شغله، فلوسه، شكاويه، تقييماته، والإجراءات.', render: (ctx) => P.render('provider', ctx) });
  S.registerPage('order', { title: 'ملف الطلب', description: 'كل حاجة عن الطلب: المراحل، الأطراف، السعر والدفع، الشكاوى، والإجراءات.', render: (ctx) => P.render('order', ctx) });
})(typeof window !== 'undefined' ? window : globalThis);
