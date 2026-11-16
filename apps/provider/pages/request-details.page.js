/* Provider request details page renderer. */
(function (root) {
  'use strict';
  root.HSProviderRequestDetailsPage = Object.freeze({
    render(ctx) {
      const item = ctx.items.find(x => x.request.id === ctx.id);
      if (!item) {
        return '<section class="pv-panel"><div class="pv-empty">الطلب غير موجود ضمن طلبات هذا الحساب.</div><button type="button" class="pv-btn" data-pv-route="home">العودة للرئيسية</button></section>';
      }
      return `<section class="pv-panel">
        <div class="pv-section-head"><div><span class="pv-eyebrow">تفاصيل الطلب</span><h1>${ctx.esc(item.request.serviceName || 'طلب خدمة')}</h1></div>
        <span class="pv-status">${ctx.esc(ctx.statusLabel[item.request.status] || item.request.status)}</span></div>
        ${ctx.requestCard(item, ctx.p)}
        ${typeof ctx.chatPanel === 'function' ? ctx.chatPanel(item) : ''}
        <button type="button" class="pv-btn" data-pv-route="${ctx.backPage}">العودة للقائمة</button>
      </section>`;
    }
  });
})(globalThis);
