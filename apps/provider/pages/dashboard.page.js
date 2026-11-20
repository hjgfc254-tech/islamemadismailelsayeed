/* Provider dashboard page renderer — presentation only. */
(function (root) {
  'use strict';
  root.HSProviderDashboardPage = Object.freeze({
    render(ctx) {
      const { p, groups, transactions, summary, requestCard, date, esc } = ctx;
      const priority = [...groups.quote, ...groups.new, ...groups.accepted, ...groups.progress].slice(0, 4);
      const next = [...groups.accepted, ...groups.progress]
        .filter(x => x.request.agreedAt || x.request.when)
        .sort((a, b) => new Date(a.request.agreedAt || a.request.when) - new Date(b.request.agreedAt || b.request.when))
        .slice(0, 4);
      const priorityHtml = priority.length
        ? priority.map(x => requestCard(x, p)).join('')
        : (ctx.empty?ctx.empty('priority','لا توجد طلبات تحتاج إلى إجراء حاليًا.'):'<div class="pv-empty">لا توجد طلبات تحتاج إلى إجراء حاليًا.</div>');
      const nextHtml = next.length
        ? next.map(x => `<div class="pv-list-row"><b>${esc(x.request.serviceName)}</b><span>${date(x.request.agreedAt || x.request.when)}</span></div>`).join('')
        : (ctx.empty?ctx.empty('schedule','لا توجد مواعيد مسجلة.'):'<div class="pv-empty">لا توجد مواعيد مسجلة.</div>');
      return `${summary(p, groups, transactions)}
        <section class="pv-panel"><div class="pv-section-head"><h2>الأولوية الآن</h2><span>${ctx.num?ctx.num(priority.length):priority.length} طلبات</span></div>${priorityHtml}</section>
        <section class="pv-panel"><div class="pv-section-head"><h2>المواعيد القادمة</h2></div>${nextHtml}</section>`;
    }
  });
})(globalThis);
