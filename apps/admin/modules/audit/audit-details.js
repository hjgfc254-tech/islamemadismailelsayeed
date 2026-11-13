/**
 * MODULE: audit-details — HSAdminAuditDetails
 * Renders the read-only details dialog content for one audit event (time, result badge, actor, module, action,
 * affected record, summary, optional reason, example network address). Helpers are passed in explicitly.
 * Extracted from pages/audit-log.page.js (same markup). Demo events only — no edit/delete/export.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  /** render(eventRow, {esc, icon, dt, badge}) → dialog inner HTML. `eventRow` is the page's toRow() output. */
  const render = (e, h) => {
    const { esc, icon, dt, badge } = h || {};
    if (typeof esc !== 'function' || typeof icon !== 'function' || typeof dt !== 'function' || typeof badge !== 'function') throw new Error('HSAdminAuditDetails.render: esc, icon, dt and badge helpers are required');
    return `<div class="ord-dlg-in">
    <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">تفاصيل الحدث</h2><p><span dir="ltr">${esc(e.id)}</span> — ${esc(e.action)}</p></div>
      <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق التفاصيل">${icon('close')}</button></header>
    <p class="ord-sim" role="note">${icon('info')}<span>بيانات تجريبية للعرض فقط: هذا الحدث ليس سجلًا حقيقيًا ولا يمكن تعديله أو حذفه أو تصديره من هنا.</span></p>
    <dl class="ord-facts">
      <div><dt>الوقت (UTC)</dt><dd>${esc(dt(e.at))}</dd></div><div><dt>النتيجة</dt><dd>${badge(e.result)}</dd></div>
      <div><dt>المنفّذ</dt><dd>${esc(e.actor)}</dd></div><div><dt>الوحدة</dt><dd>${esc(e.moduleLabel)}</dd></div>
      <div><dt>الإجراء</dt><dd>${esc(e.action)}</dd></div><div><dt>السجل المتأثر</dt><dd dir="ltr">${esc(e.record)}</dd></div>
      <div><dt>الملخص</dt><dd>${esc(e.summary)}</dd></div>${e.reason ? `<div><dt>السبب</dt><dd>${esc(e.reason)}</dd></div>` : ''}
      <div><dt>عنوان الشبكة (مثال)</dt><dd dir="ltr">${esc(e.ip || '—')}</dd></div></dl>
    <div class="ord-act"><button type="button" class="adm-btn" data-ord-close>إغلاق</button></div></div>`;
  };

  const api = Object.freeze({ render });
  root.HSAdminAuditDetails = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
