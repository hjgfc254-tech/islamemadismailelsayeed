/**
 * MODULE: finance-dashboard.page
 * RESPONSIBILITY: Admin finance dashboard — revenue, commissions, provider dues, settlements and discrepancies summary.
 * STATUS: IMPLEMENTED (DEMO). Every figure is a local fixture defined in this file; nothing is read from a backend,
 *   no payment/transfer/settlement is executed, and nothing here is a real accounting result.
 * Interactions: period switch (7/30/90 days), category filter, KPI detail expand/collapse (per-category breakdown),
 *   discrepancy list with a LOCAL «reviewed» mark (memory only), links to commissions/settlements/reports only if those
 *   pages are registered, reset of demo state. Plugs into admin-shell.js via HSAdminShell.registerPage('finance').
 * Money: whole Egyptian pounds, formatted by shared/utils/money.js (HSMoney).
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const M = root.HSMoney || (typeof require === 'function' ? require('../../../shared/utils/money.js') : null);
  const nf = (n) => (M ? M.number(n) : String(n));
  const money = (n) => (M ? M.format(n) : String(n) + ' ج.م');

  /* ───── Fixtures (demo) ───── */
  const PERIODS = [{ id: '7', label: '7 أيام' }, { id: '30', label: '30 يومًا' }, { id: '90', label: '90 يومًا' }];
  // rate: commission rate; collect: share of commission already collected; settle: share of provider net already settled.
  const CATEGORIES = [
    { id: 'electric', label: 'كهرباء', rate: 0.12, collect: 0.9, settle: 0.8, gmv: { 7: 64000, 30: 280000, 90: 810000 } },
    { id: 'plumbing', label: 'سباكة', rate: 0.12, collect: 0.85, settle: 0.75, gmv: { 7: 52000, 30: 240000, 90: 690000 } },
    { id: 'carpentry', label: 'نجارة', rate: 0.10, collect: 0.8, settle: 0.7, gmv: { 7: 31000, 30: 150000, 90: 430000 } },
    { id: 'other', label: 'أخرى', rate: 0.10, collect: 0.75, settle: 0.7, gmv: { 7: 36000, 30: 170000, 90: 505000 } }
  ];
  // ageDays decides which periods include the item (ageDays <= period days). expected/recorded are demo amounts.
  const DISCREPANCIES = [
    { id: 'd1', ref: 'ORD-DEMO-1042', category: 'electric', ageDays: 3, expected: 1850, recorded: 1700, note: 'فرق بين المبلغ المتوقع والمسجّل' },
    { id: 'd2', ref: 'ORD-DEMO-1017', category: 'plumbing', ageDays: 6, expected: 920, recorded: 1020, note: 'مبلغ مسجّل أعلى من المتوقع' },
    { id: 'd3', ref: 'ORD-DEMO-0988', category: 'other', ageDays: 12, expected: 640, recorded: 600, note: 'عمولة محصّلة أقل من المحسوبة' },
    { id: 'd4', ref: 'ORD-DEMO-0931', category: 'carpentry', ageDays: 25, expected: 2400, recorded: 2250, note: 'فرق بين المبلغ المتوقع والمسجّل' },
    { id: 'd5', ref: 'ORD-DEMO-0856', category: 'electric', ageDays: 40, expected: 770, recorded: 860, note: 'مبلغ مسجّل أعلى من المتوقع' },
    { id: 'd6', ref: 'ORD-DEMO-0790', category: 'plumbing', ageDays: 70, expected: 1300, recorded: 1180, note: 'عمولة محصّلة أقل من المحسوبة' }
  ];
  const MODULE_LABEL = { commissions: 'العمولات', settlements: 'التسويات', reports: 'التقارير' };

  const STATUS = {
    open: { label: 'مفتوح', tone: 'warning', icon: 'warn' },
    reviewed: { label: 'تمت المراجعة (محليًا)', tone: 'success', icon: 'check' }
  };
  const B = root.HSStatusBadge;
  if (B && B.domains().indexOf('discrepancy') === -1) B.register('discrepancy', STATUS);
  const badge = (s) => (B ? B.render('discrepancy', s) : esc((STATUS[s] || {}).label || 'غير محدد'));

  /* ───── State (memory only) ───── */
  const fresh = () => ({ period: '30', category: 'all', open: {}, reviewed: {} });
  let state = fresh();

  /* ───── Pure model (unit-tested) ───── */
  const rowFor = (c, p) => {
    const gmv = c.gmv[p];
    const commission = Math.round(gmv * c.rate);
    const collected = Math.round(commission * c.collect);
    const providerNet = gmv - commission;
    const settled = Math.round(providerNet * c.settle);
    return { id: c.id, label: c.label, gmv, commission, collected, uncollected: commission - collected, providerNet, settled, pendingDues: providerNet - settled };
  };
  const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
  const share = (part, whole) => (whole > 0 ? part / whole : 0);

  const buildModel = (period, category, st) => {
    st = st || state;
    const p = PERIODS.some((x) => x.id === period) ? period : '30';
    const cat = CATEGORIES.some((c) => c.id === category) ? category : 'all';
    const L = root.HSAdminLive && root.HSAdminLive.enabled() ? root.HSAdminLive : null;   /* server backend mode: real transactions via HSAdminLive, no fixture rates */
    const rows = L ? L.financeRows(Number(p), CATEGORIES.map((c) => c.id), Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]))).filter((r) => cat === 'all' || r.id === cat)
      : CATEGORIES.filter((c) => cat === 'all' || c.id === cat).map((c) => rowFor(c, p));
    const days = Number(p);
    const disc = (L ? [] : DISCREPANCIES).filter((d) => d.ageDays <= days && (cat === 'all' || d.category === cat)).map((d) => Object.assign({}, d, {
      diff: d.recorded - d.expected, status: st.reviewed[d.id] ? 'reviewed' : 'open',
      categoryLabel: (CATEGORIES.find((c) => c.id === d.category) || {}).label || ''
    }));
    const openDisc = disc.filter((d) => d.status === 'open');
    const totals = { gmv: sum(rows, 'gmv'), commission: sum(rows, 'commission'), collected: sum(rows, 'collected'), uncollected: sum(rows, 'uncollected'),
      providerNet: sum(rows, 'providerNet'), settled: sum(rows, 'settled'), pendingDues: sum(rows, 'pendingDues'),
      discrepancyCount: openDisc.length, discrepancyAmount: openDisc.reduce((a, d) => a + Math.abs(d.diff), 0) };
    const kpi = (id, label, ic2, key, module, tone) => ({ id, label, icon: ic2, value: totals[key], valueText: money(totals[key]), module: module || null, tone: tone || '',
      detail: rows.map((r) => ({ label: r.label, amount: r[key], share: share(r[key], totals[key]) })) });
    const kpis = [
      kpi('gmv', 'إجمالي قيمة الطلبات', 'list', 'gmv', 'reports'),
      kpi('commission', 'العمولات المحسوبة', 'wallet', 'commission', 'commissions'),
      kpi('collected', 'العمولات المحصّلة', 'check', 'collected', 'commissions'),
      kpi('pendingDues', 'مستحقات مقدمي الخدمة غير المسوّاة', 'provider', 'pendingDues', 'settlements', 'warning'),
      kpi('settled', 'مستحقات تمت تسويتها (محاكاة)', 'st-done', 'settled', 'settlements'),
      { id: 'discrepancies', label: 'فروقات مفتوحة', icon: 'warn', value: totals.discrepancyAmount, valueText: money(totals.discrepancyAmount),
        count: totals.discrepancyCount, module: null, tone: totals.discrepancyCount ? 'danger' : '',
        detail: rows.map((r) => {
          const amt = openDisc.filter((d) => d.category === r.id).reduce((a, d) => a + Math.abs(d.diff), 0);
          return { label: r.label, amount: amt, share: share(amt, totals.discrepancyAmount) };
        }) }
    ];
    return { period: p, category: cat, rows, totals, kpis, discrepancies: disc, uncollectedShare: share(totals.uncollected, totals.commission) };
  };

  /* ───── Rendering ───── */
  const link = (mod, text, cls) => {
    const shell = root.HSAdminShell;
    return shell && shell.isRegistered(mod)
      ? `<a class="${cls}" href="#/${esc(mod)}">${text}</a>`
      : `<span class="${cls} is-soon" aria-disabled="true">${text} <small>(قريبًا)</small></span>`;
  };
  const kpiHtml = (k) => {
    const open = !!state.open[k.id];
    const rows = k.detail.map((d) => `<li><span>${esc(d.label)}</span><span class="dash-bar" aria-hidden="true"><i style="width:${Math.round(d.share * 100)}%"></i></span><b>${money(d.amount)} (${nf(Math.round(d.share * 100))}٪)</b></li>`).join('');
    const extra = k.id === 'discrepancies' ? `<span class="fin-sub">${nf(k.count)} حالة مفتوحة</span>` : '';
    return `<article class="dash-kpi fin-kpi ${k.tone ? 'is-' + esc(k.tone) : ''}" data-kpi="${esc(k.id)}">
      <button type="button" class="dash-kpi-btn" data-kpi-toggle="${esc(k.id)}" aria-expanded="${open}" aria-controls="fin-d-${esc(k.id)}">
        <span class="dash-kpi-ico" aria-hidden="true">${icon(k.icon)}</span>
        <span class="dash-kpi-body"><span class="dash-kpi-l">${esc(k.label)}</span><span class="dash-kpi-v fin-v">${esc(k.valueText)}</span>${extra}</span>
        <span class="dash-kpi-more">${open ? 'إخفاء التفاصيل' : 'التفاصيل حسب التصنيف'}</span>
      </button>
      <div class="dash-kpi-detail" id="fin-d-${esc(k.id)}" ${open ? '' : 'hidden'}>
        <ul>${rows}</ul>
        ${k.module ? `<p>${link(k.module, 'فتح صفحة ' + esc(MODULE_LABEL[k.module] || ''), 'dash-link')}</p>` : ''}
      </div></article>`;
  };
  const discHtml = (d) => `<li class="fin-disc ${d.status === 'reviewed' ? 'is-done' : ''}" data-disc="${esc(d.id)}">
    <div class="fin-disc-h"><b dir="ltr">${esc(d.ref)}</b> ${badge(d.status)}</div>
    <p class="fin-disc-n">${esc(d.categoryLabel)} — ${esc(d.note)}</p>
    <dl class="fin-disc-v"><div><dt>المتوقع</dt><dd>${money(d.expected)}</dd></div><div><dt>المسجّل</dt><dd>${money(d.recorded)}</dd></div>
      <div><dt>الفرق</dt><dd>${d.diff > 0 ? 'زيادة ' : 'نقص '}${money(Math.abs(d.diff))}</dd></div></dl>
    ${d.status === 'open' ? `<button type="button" class="adm-btn" data-review="${esc(d.id)}">تعليم كمُراجَع (محاكاة محلية)</button>`
      : `<button type="button" class="adm-btn" data-unreview="${esc(d.id)}">إعادة فتح (محاكاة محلية)</button>`}</li>`;

  const viewHtml = () => {
    const m = buildModel(state.period, state.category);
    const pct = Math.round((1 - m.uncollectedShare) * 100);
    return `
    <div class="fin-banner" role="note">${icon('info')}<span>بيانات تجريبية محلية — ليست أرقامًا حقيقية. لا يتم تنفيذ أي دفع أو تحصيل أو تسوية من هذه الصفحة.</span></div>
    <div class="dash-tools">
      <div role="radiogroup" class="dash-seg" aria-label="الفترة الزمنية">
        ${PERIODS.map((p) => `<button type="button" role="radio" aria-checked="${p.id === m.period}" data-period="${p.id}">${p.label}</button>`).join('')}
      </div>
      <label class="fin-filter"><span>التصنيف</span>
        <select data-category>
          <option value="all" ${m.category === 'all' ? 'selected' : ''}>كل التصنيفات</option>
          ${CATEGORIES.map((c) => `<option value="${c.id}" ${m.category === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
        </select></label>
    </div>
    <section aria-label="المؤشرات المالية" class="dash-kpis">${m.kpis.map(kpiHtml).join('')}</section>
    <section class="dash-card" aria-labelledby="fin-h-comm"><h2 id="fin-h-comm">تحصيل العمولات</h2>
      <p class="fin-cap">المحصّل ${money(m.totals.collected)} من ${money(m.totals.commission)} — غير المحصّل ${money(m.totals.uncollected)} (${nf(100 - pct)}٪).</p>
      <div class="dash-bar fin-bar" role="img" aria-label="نسبة العمولات المحصّلة ${nf(pct)}٪"><i style="width:${pct}%"></i></div>
    </section>
    <section class="dash-card" aria-labelledby="fin-h-disc"><h2 id="fin-h-disc" tabindex="-1">الفروقات <span class="dash-count">${nf(m.totals.discrepancyCount)} مفتوحة من ${nf(m.discrepancies.length)}</span></h2>
      ${m.discrepancies.length ? `<ul class="fin-discs">${m.discrepancies.map(discHtml).join('')}</ul>`
        : `<p class="dash-empty">${icon('check')}<span>لا توجد فروقات في هذه الفترة والتصنيف.</span></p>`}
    </section>
    <section class="dash-card" aria-labelledby="fin-h-short"><h2 id="fin-h-short">اختصارات</h2>
      <div class="dash-short">${link('commissions', `<span aria-hidden="true">${icon('wallet')}</span>العمولات`, 'dash-sc')}${link('settlements', `<span aria-hidden="true">${icon('st-done')}</span>التسويات`, 'dash-sc')}${link('reports', `<span aria-hidden="true">${icon('info')}</span>التقارير`, 'dash-sc')}</div></section>`;
  };

  const render = () => {
    const wrap = root.document.createElement('div');
    wrap.className = 'dash fin';
    const paint = (focusSel) => {
      wrap.innerHTML = viewHtml();
      if (focusSel) { const n = wrap.querySelector(focusSel); if (n) n.focus(); }
    };
    paint();
    wrap.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.period) { state.period = t.dataset.period; paint('[data-period="' + state.period + '"]'); }
      else if (t.dataset.kpiToggle) { const id = t.dataset.kpiToggle; state.open[id] = !state.open[id]; paint('[data-kpi-toggle="' + id + '"]'); }
      else if (t.dataset.review) { state.reviewed[t.dataset.review] = true; paint('#fin-h-disc'); }
      else if (t.dataset.unreview) { delete state.reviewed[t.dataset.unreview]; paint('#fin-h-disc'); }
    });
    wrap.addEventListener('change', (e) => {
      if (e.target.hasAttribute && e.target.hasAttribute('data-category')) { state.category = e.target.value; paint('[data-category]'); }
    });
    return wrap;
  };

  const api = { buildModel, PERIODS, CATEGORIES, DISCREPANCIES, resetState() { state = fresh(); }, _state: () => state };
  root.HSAdminFinanceDashboardPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('finance', {
      title: 'الماليات',
      description: 'ملخص الإيرادات والعمولات ومستحقات مقدمي الخدمة والفروقات — عرض تجريبي فقط.',
      actions: [
        { id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { state = fresh(); ctx.shell.refresh(); } },
        { id: 'refresh', label: 'تحديث', kind: 'primary', onClick: (ctx) => ctx.shell.refresh() }
      ],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
