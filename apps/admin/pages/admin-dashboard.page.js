/**
 * MODULE: admin-dashboard.page
 * RESPONSIBILITY: Admin dashboard — operational KPIs, tasks, alerts and module shortcuts.
 * STATUS: IMPLEMENTED (DEMO). All figures are local fixtures defined in this file; nothing is read from a backend.
 * Interactions: period switch (7/30/90 days), KPI detail expand/collapse, task check-off, alert dismiss
 *   (links to a module only if that module page is registered), shortcuts (enabled only for registered pages),
 *   reset of demo state. State lives in memory only. Plugs into admin-shell.js via HSAdminShell.registerPage.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };

  /* ───── Fixtures (demo) ───── */
  const PERIODS = [{ id: '7', label: '7 أيام' }, { id: '30', label: '30 يومًا' }, { id: '90', label: '90 يومًا' }];
  const KPI_DEFS = [
    { id: 'orders', label: 'الطلبات', icon: 'list', unit: '', module: 'orders', v: { 7: [182, 6], 30: [764, 11], 90: [2210, 4] },
      detail: [['جديدة', .22], ['قيد التنفيذ', .31], ['مكتملة', .41], ['ملغاة', .06]] },
    { id: 'providers', label: 'مقدمو خدمة نشطون', icon: 'provider', unit: '', module: 'providers', v: { 7: [96, 2], 30: [118, 5], 90: [141, 9] },
      detail: [['كهرباء', .28], ['سباكة', .24], ['نجارة', .16], ['أخرى', .32]] },
    { id: 'customers', label: 'عملاء جدد', icon: 'user', unit: '', module: 'customers', v: { 7: [64, -3], 30: [271, 8], 90: [803, 12] },
      detail: [['عبر التطبيق', .7], ['عبر الإحالة', .2], ['أخرى', .1]] },
    { id: 'revenue', label: 'إجمالي العمولات', icon: 'wallet', unit: 'ج.م', module: 'finance', v: { 7: [18400, 7], 30: [79200, 10], 90: [231500, 6] },
      detail: [['كهرباء', .34], ['سباكة', .29], ['نجارة', .17], ['أخرى', .2]] },
    { id: 'rating', label: 'متوسط التقييم', icon: 'star', unit: '/ 5', module: 'reviews', decimal: true, v: { 7: [4.6, 1], 30: [4.5, -1], 90: [4.5, 0] },
      detail: [['5 نجوم', .58], ['4 نجوم', .27], ['3 نجوم', .09], ['أقل', .06]] },
    { id: 'complaints', label: 'شكاوى مفتوحة', icon: 'warn', unit: '', module: 'complaints', invert: true, v: { 7: [9, -10], 30: [14, 3], 90: [17, -5] },
      detail: [['تأخير', .4], ['جودة', .35], ['سعر', .15], ['أخرى', .1]] }
  ];
  const TASKS = [
    { id: 't1', text: 'مراجعة طلبات انضمام مقدمي الخدمة الجدد', due: 'اليوم', module: 'providers' },
    { id: 't2', text: 'اعتماد تسوية مقدمي الخدمة الأسبوعية', due: 'غدًا', module: 'settlements' },
    { id: 't3', text: 'الرد على الشكاوى عالية الأولوية', due: 'اليوم', module: 'complaints' },
    { id: 't4', text: 'مراجعة تقييمات تم الإبلاغ عنها', due: 'هذا الأسبوع', module: 'reviews' }
  ];
  const ALERTS = [
    { id: 'a1', level: 'danger', text: '3 طلبات بلا مقدم خدمة منذ أكثر من 24 ساعة.', module: 'orders' },
    { id: 'a2', level: 'warning', text: 'ارتفاع الشكاوى عن التأخير في فئة السباكة.', module: 'complaints' },
    { id: 'a3', level: 'info', text: 'تسوية الأسبوع جاهزة للمراجعة.', module: 'settlements' }
  ];
  const SHORTCUTS = [['orders', 'الطلبات', 'list'], ['providers', 'مقدمو الخدمة', 'provider'], ['customers', 'العملاء', 'user'],
    ['complaints', 'الشكاوى', 'warn'], ['settlements', 'التسويات', 'wallet'], ['insights', 'الإحصائيات', 'info']];
  const MODULE_LABEL = { orders: 'الطلبات', providers: 'مقدمو الخدمة', customers: 'العملاء', finance: 'الماليات', reviews: 'التقييمات', complaints: 'الشكاوى', settlements: 'التسويات', reports: 'التقارير' };

  /* ───── State (memory only) ───── */
  const fresh = () => ({ period: '30', open: {}, done: {}, dismissed: {} });
  let state = fresh();

  /* ───── Pure model (unit-tested) ───── */
  const fmtValue = (k, raw) => (k.decimal ? new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(raw) : nf(raw));
  const buildModel = (period, st) => {
    st = st || state;
    const p = PERIODS.some((x) => x.id === period) ? period : '30';
    const L = root.HSAdminLive && root.HSAdminLive.enabled() ? root.HSAdminLive : null;   /* server backend mode: KPIs from real records */
    const live = L ? L.dashboardKpis(Number(p)) : null;
    return {
      period: p,
      kpis: KPI_DEFS.map((k) => {
        const [value, delta] = live ? (live[k.id] || [0, 0]) : k.v[p];
        const good = k.invert ? delta <= 0 : delta >= 0;
        return { id: k.id, label: k.label, icon: k.icon, unit: k.unit, module: k.module, value, valueText: fmtValue(k, value), delta, good,
          detail: live ? [] : k.detail.map(([label, share]) => ({ label, share, amount: k.decimal ? null : Math.round(value * share) })) };
      }),
      tasks: live ? [] : TASKS.map((t) => Object.assign({}, t, { done: !!st.done[t.id] })),
      alerts: live ? [] : ALERTS.filter((a) => !st.dismissed[a.id])
    };
  };

  /* ───── Rendering ───── */
  const link = (mod, text, cls) => {
    const shell = root.HSAdminShell;
    return shell && shell.isRegistered(mod)
      ? `<a class="${cls}" href="#/${esc(mod)}">${text}</a>`
      : `<span class="${cls} is-soon" aria-disabled="true">${text} <small>(قريبًا)</small></span>`;
  };
  const deltaHtml = (k) => {
    if (k.delta === 0) return '<span class="dash-delta">بلا تغيير</span>';
    const up = k.delta > 0;
    return `<span class="dash-delta ${k.good ? 'is-good' : 'is-bad'}"><span aria-hidden="true">${up ? '▲' : '▼'}</span> ${nf(Math.abs(k.delta))}٪ <span class="adm-sr">${up ? 'ارتفاع' : 'انخفاض'}</span></span>`;
  };
  const kpiHtml = (k) => {
    const open = !!state.open[k.id];
    const rows = k.detail.map((d) => `<li><span>${esc(d.label)}</span><span class="dash-bar" aria-hidden="true"><i style="width:${Math.round(d.share * 100)}%"></i></span><b>${d.amount == null ? nf(Math.round(d.share * 100)) + '٪' : nf(d.amount) + ' (' + nf(Math.round(d.share * 100)) + '٪)'}</b></li>`).join('');
    return `<article class="dash-kpi" data-kpi="${esc(k.id)}">
      <button type="button" class="dash-kpi-btn" data-kpi-toggle="${esc(k.id)}" aria-expanded="${open}" aria-controls="dash-d-${esc(k.id)}">
        <span class="dash-kpi-ico" aria-hidden="true">${icon(k.icon)}</span>
        <span class="dash-kpi-body"><span class="dash-kpi-l">${esc(k.label)}</span>
          <span class="dash-kpi-v">${esc(k.valueText)} <small>${esc(k.unit)}</small></span>${deltaHtml(k)}</span>
        <span class="dash-kpi-more">${open ? 'إخفاء التفاصيل' : 'التفاصيل'}</span>
      </button>
      <div class="dash-kpi-detail" id="dash-d-${esc(k.id)}" ${open ? '' : 'hidden'}>
        <ul>${rows}</ul>
        <p>${link(k.module, 'فتح صفحة ' + esc(MODULE_LABEL[k.module] || ''), 'dash-link')}</p>
      </div></article>`;
  };
  const taskHtml = (t) => `<li class="${t.done ? 'is-done' : ''}"><label><input type="checkbox" data-task="${esc(t.id)}" ${t.done ? 'checked' : ''}>
    <span class="dash-task-t">${esc(t.text)}</span></label><small>${esc(t.due)}</small>${link(t.module, 'فتح', 'dash-link')}</li>`;
  const alertHtml = (a) => `<li class="dash-alert is-${esc(a.level)}"><span class="dash-alert-ico" aria-hidden="true">${icon(a.level === 'info' ? 'info' : 'warn')}</span>
    <span class="dash-alert-t">${esc(a.text)} ${link(a.module, 'عرض', 'dash-link')}</span>
    <button type="button" class="adm-btn dash-x" data-dismiss="${esc(a.id)}" aria-label="تجاهل التنبيه: ${esc(a.text)}">${icon('close')}</button></li>`;

  /* last 14 days from the loaded read model: new requests per day and completed-service value per day */
  const chartsHtml = () => {
    const C = root.HSMiniCharts; if (!C || typeof MP === 'undefined') return '';
    const d = MP.db();
    const reqs = C.daily(d.serviceRequests || [], 14, r => r.createdAt);
    const value = C.daily((d.transactions || []).filter(t => !t.free), 14, t => t.at, t => t.value);
    return `<section class="dash-card dash-charts" aria-label="الاتجاهات خلال آخر 14 يوم">
      ${C.bars({ id: 'ch-req', title: 'الطلبات الجديدة يوميًا', points: reqs })}
      ${C.bars({ id: 'ch-val', title: 'قيمة الخدمات المكتملة يوميًا', unit: 'ج.م', points: value })}</section>`;
  };
  /* «مهام اليوم»: what needs a decision now, counted from the loaded records (demo and live alike). Statistics live in
     «الإحصائيات» (pages/insights.page.js), not here. */
  const queue = () => {
    if (typeof MP === 'undefined') return [];
    const d = MP.db(), now = Date.now(), old = (iso, min) => now - (Date.parse(iso) || now) > min * 60000;
    const rows = [
      { n: (d.providers || []).filter((p) => p.status === 'pending').length, text: 'طلبات انضمام مقدمي خدمة مستنية مراجعة', module: 'providers', level: 'warning' },
      { n: (d.serviceRequests || []).filter((r) => ['received', 'searching'].includes(r.status) && old(r.createdAt, 30)).length, text: 'طلبات من غير مقدم خدمة من أكتر من نص ساعة', module: 'orders', level: 'danger' },
      { n: (d.complaints || []).filter((k) => k.status === 'open').length, text: 'شكاوى مفتوحة', module: 'complaints', level: 'warning' },
      { n: (d.quotes || []).filter((q) => q.status === 'pending').length, text: 'عروض أسعار مستنية رد العميل', module: 'quotes', level: 'info' },
      { n: (d.transactions || []).filter((x) => !x.free && x.collection === 'pending').length, text: 'عمولات لسه ما اتحصّلتش', module: 'settlements', level: 'info' }
    ];
    return rows.filter((r) => r.n > 0);
  };
  const queueHtml = () => {
    const q = queue();
    return `<section class="dash-card dash-queue" aria-labelledby="dash-h-queue"><h2 id="dash-h-queue">محتاج تصرّف دلوقتي <span class="dash-count">${nf(q.reduce((s, r) => s + r.n, 0))}</span></h2>
      ${q.length ? `<ul class="dash-qlist">${q.map((r) => `<li class="is-${esc(r.level)}"><b>${nf(r.n)}</b><span>${esc(r.text)}</span>${link(r.module, 'افتح', 'dash-link')}</li>`).join('')}</ul>`
        : `<p class="dash-empty">${icon('check')}<span>مفيش حاجة مستنياك — كل حاجة ماشية.</span></p>`}</section>`;
  };
  /* KPIs + trend charts: rendered by «الإحصائيات» through kpiView(host). */
  const kpiHtml2 = () => {
    const m = buildModel(state.period);
    return `<div class="dash-tools">
      <div role="radiogroup" class="dash-seg" aria-label="الفترة الزمنية">
        ${PERIODS.map((p) => `<button type="button" role="radio" aria-checked="${p.id === m.period}" data-period="${p.id}">${p.label}</button>`).join('')}
      </div>
      ${root.HSAdminLive && root.HSAdminLive.enabled() ? '' : '<p class="dash-note">بيانات تجريبية محلية — ليست أرقامًا حقيقية.</p>'}
    </div>
    <section aria-label="المؤشرات التشغيلية" class="dash-kpis">${m.kpis.map(kpiHtml).join('')}</section>${chartsHtml()}`;
  };
  function kpiView(host) {
    const paint = (sel) => { host.innerHTML = kpiHtml2(); if (sel) { const n = host.querySelector(sel); if (n) n.focus(); } };
    paint();
    host.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.period) { state.period = t.dataset.period; paint('[data-period="' + state.period + '"]'); }
      else if (t.dataset.kpiToggle) { const id = t.dataset.kpiToggle; state.open[id] = !state.open[id]; paint('[data-kpi-toggle="' + id + '"]'); }
    });
    return host;
  }
  const viewHtml = () => {
    const m = buildModel(state.period);
    const pend = m.tasks.filter((t) => !t.done).length;
    return `${queueHtml()}
    <div class="dash-cols">
      <section class="dash-card" aria-labelledby="dash-h-tasks"><h2 id="dash-h-tasks">المهام <span class="dash-count">${nf(pend)} متبقية</span></h2>
        ${pend === 0 && m.tasks.length ? `<p class="dash-ok">${icon('check')}<span>أنجزت كل المهام.</span></p>` : ''}
        <ul class="dash-tasks">${m.tasks.map(taskHtml).join('')}</ul></section>
      <section class="dash-card" aria-labelledby="dash-h-alerts"><h2 id="dash-h-alerts">التنبيهات <span class="dash-count">${nf(m.alerts.length)}</span></h2>
        ${m.alerts.length ? `<ul class="dash-alerts">${m.alerts.map(alertHtml).join('')}</ul>` : `<p class="dash-empty">${icon('check')}<span>لا توجد تنبيهات حاليًا.</span></p>`}</section>
    </div>
    <section class="dash-card" aria-labelledby="dash-h-short"><h2 id="dash-h-short">اختصارات</h2>
      <div class="dash-short">${SHORTCUTS.map(([id, l, i]) => link(id, `<span aria-hidden="true">${icon(i)}</span>${esc(l)}`, 'dash-sc')).join('')}</div></section>`;
  };

  const render = () => {
    const wrap = root.document.createElement('div');
    wrap.className = 'dash';
    const paint = (focusSel) => {
      wrap.innerHTML = viewHtml();
      if (focusSel) { const n = wrap.querySelector(focusSel); if (n) n.focus(); }
    };
    paint();
    wrap.addEventListener('click', (e) => {
      const t = e.target.closest('button,input');
      if (!t) return;
      if (t.dataset.period) { state.period = t.dataset.period; paint('[data-period="' + state.period + '"]'); }
      else if (t.dataset.kpiToggle) { const id = t.dataset.kpiToggle; state.open[id] = !state.open[id]; paint('[data-kpi-toggle="' + id + '"]'); }
      else if (t.dataset.dismiss) { state.dismissed[t.dataset.dismiss] = true; paint('#dash-h-alerts'); const h = wrap.querySelector('#dash-h-alerts'); if (h) { h.tabIndex = -1; h.focus(); } }
    });
    wrap.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.task) { state.done[t.dataset.task] = t.checked; paint('[data-task="' + t.dataset.task + '"]'); }
    });
    /* «صندوق الشغل» (modules/ops-center.js): my team's open alerts + my tickets, above the day view */
    if (!root.HSOpsCenter || !root.HSOpsCenter.mountWorkBox) return wrap;
    const outer = root.document.createElement('div');
    const box = root.document.createElement('div');
    outer.append(box, wrap);
    root.HSOpsCenter.mountWorkBox(box);
    return outer;
  };

  /* Toolbar actions re-render identical demo data: announce the result so the user gets feedback (shell live region). */
  function announce(msg) { const l = root.document && root.document.getElementById('adm-live'); if (!l) return; l.textContent = ''; setTimeout(() => { l.textContent = msg; }, 60); }

  const api = { buildModel, PERIODS, kpiView, queue, resetState() { state = fresh(); }, _state: () => state };
  root.HSAdminDashboardPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('dashboard', {
      title: 'مهام اليوم',
      description: 'اللي محتاج تصرّف دلوقتي، والمهام والتنبيهات. الأرقام والمؤشرات في «الإحصائيات».',
      actions: [
        { id: 'reset', label: 'استعادة البيانات التجريبية', hidden: () => !!(root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase'), onClick: (ctx) => { state = fresh(); ctx.shell.refresh(); announce('تمت استعادة بيانات اللوحة التجريبية.'); } },
        { id: 'refresh', label: 'تحديث', kind: 'primary', onClick: (ctx) => { ctx.shell.refresh(); announce('تم تحديث اللوحة.'); } }
      ],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
