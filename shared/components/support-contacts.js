/**
 * MODULE: support-contacts (HSSupportContacts) — the support channels the admin set in Admin › الإعدادات
 * (settings.support = {phone, whatsapp, email, hours}, public). Only the channels that are set are shown — no
 * placeholder numbers. WhatsApp opens with a prefilled Arabic message (including the order number when known).
 * Used by the customer «المساعدة» page and the provider app.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function get(settings) {
    let s = settings;
    if (!s) { try { s = (typeof MP !== 'undefined' && MP.db().settings) || {}; } catch (e) { s = {}; } }
    const c = (s && s.support) || {};
    const phone = /^(01[0125]\d{8}|0[2-9]\d{7,8}|1\d{4})$/.test(String(c.phone || '')) ? c.phone : '';
    const whatsapp = /^01[0125]\d{8}$/.test(String(c.whatsapp || '')) ? c.whatsapp : '';
    const email = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(String(c.email || '')) ? c.email : '';
    return { phone, whatsapp, email, hours: String(c.hours || '').slice(0, 80) };
  }
  const any = (c) => !!(c.phone || c.whatsapp || c.email);
  function waLink(number, orderNo, who) {
    const text = (who === 'provider' ? 'أهلًا، أنا مقدم خدمة على هنصلحلك ومحتاج مساعدة' : 'أهلًا، محتاج مساعدة من هنصلحلك') + (orderNo ? ' بخصوص الطلب رقم ' + orderNo : '');
    return 'https://wa.me/2' + number + '?text=' + encodeURIComponent(text);
  }
  /** Buttons for the channels that are set; '' when none. opts: {orderNo?, who?: 'customer'|'provider', cls?, icon?} */
  function html(opts) {
    const o = opts || {}, c = get(o.settings), ic = typeof o.icon === 'function' ? o.icon : () => '';
    if (!any(c)) return '';
    const cls = o.cls || 'hs-contact';
    const btn = (href, icon, label, sub, ext) => `<a class="${cls}" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${ic(icon)}<span><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></a>`;
    return `<div class="hs-contacts" role="list">`
      + (c.phone ? btn('tel:' + c.phone, 'call', 'اتصل بالدعم', c.phone, false) : '')
      + (c.whatsapp ? btn(waLink(c.whatsapp, o.orderNo, o.who), 'chat', 'واتساب', c.whatsapp, true) : '')
      + (c.email ? btn('mailto:' + c.email + (o.orderNo ? '?subject=' + encodeURIComponent('طلب رقم ' + o.orderNo) : ''), 'send', 'بريد إلكتروني', c.email, false) : '')
      + `</div>${c.hours ? `<p class="hs-contact-hours">مواعيد الدعم: ${esc(c.hours)}</p>` : ''}`;
  }
  const api = Object.freeze({ get, any, html, waLink });
  root.HSSupportContacts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
