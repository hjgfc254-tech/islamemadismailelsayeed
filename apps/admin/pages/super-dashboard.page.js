/**
 * MODULE: super-dashboard.page
 * RESPONSIBILITY: Owner overview («لوحة المالك») — a READ-ONLY cross-module summary: 8 KPIs, items that need attention, operating
 *   status and links to the admin modules. Every number is derived at render time from the in-memory state of the implemented admin
 *   pages (orders, providers, customers, quotes, complaints, reviews, settlements, finance, security, audit, settings); nothing is copied here.
 *   Differs from admin-dashboard.page.js, which owns period-based operational fixtures, tasks and dismissible alerts.
 * STATUS: IMPLEMENTED (DEMO). No real data, no actions that change anything, no backend. If a source page is not loaded or throws, its
 *   KPI shows «غير متاح» and the page says so (partial) — it never invents a value.
 * Plugs into admin-shell.js via HSAdminShell.registerPage('super-dashboard'). Must load AFTER every page it reads (read happens at render).
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG-u-nu-latn').format(n); } catch (e) { return String(n); } };
  const need = (g, f) => { const m = root[g] || (typeof require === 'function' ? require(f) : null); if (!m) throw new Error('unavailable: ' + g); return m; };
  const money = (n) => need('HSMoney', '../../../shared/utils/money.js').format(n);

  /* ───── Sources: one reader per implemented page. Each returns a plain summary object or throws. ───── */
  const SOURCES = {
    orders: () => { const m = need('HSAdminOrdersPage', './orders-management.page.js'); return m.counts(m._orders()); },
    providers: () => { const m = need('HSAdminProvidersPage', './providers-management.page.js'); return m.counts(m._providers()); },
    customers: () => { const m = need('HSAdminCustomersPage', './customers-management.page.js'); return m.counts(m._customers()); },
    quotes: () => { const m = need('HSAdminQuotesPage', './quotes-management.page.js'); return m.counts(m._quotes()); },
    complaints: () => { const m = need('HSAdminComplaintsPage', './complaints-management.page.js'); return m.counts(m._items()); },
    reviews: () => { const m = need('HSAdminReviewsPage', './reviews-management.page.js'); return m.counts(m._items()); },
    settlements: () => { const m = need('HSAdminSettlementsPage', './settlements.page.js'); return m.totals(m._settlements()); },
    finance: () => need('HSAdminFinanceDashboardPage', './finance-dashboard.page.js').buildModel('30', 'all').totals,
    security: () => need('HSAdminSecurityPage', './security.page.js').counts(),
    audit: () => { const m = need('HSAdminAuditLogPage', './audit-log.page.js'); return m.counts(m._events()); },
    settings: () => Object.assign({}, need('HSAdminSystemSettingsPage', './system-settings.page.js')._current())
  };
  const LABEL = { orders: 'الطلبات', providers: 'مقدمو الخدمة', customers: 'العملاء', quotes: 'عروض الأسعار', complaints: 'الشكاوى', reviews: 'التقييمات',
    settlements: 'التسويات', finance: 'الماليات', security: 'الأمان', audit: 'سجل التدقيق', settings: 'الإعدادات' };

  /** Reads every source once. Returns { key: { ok: true, data } | { ok: false } }. */
  const readSources = (readers) => {
    const rd = readers || SOURCES, out = {};
    Object.keys(LABEL).forEach((k) => { try { out[k] = { ok: true, data: rd[k]() }; } catch (e) { out[k] = { ok: false }; } });
    return out;
  };

  /* ───── Pure model (unit-tested) ───── */
  const LEVEL_RANK = { danger: 0, warning: 1, info: 2 };
  const buildModel = (src) => {
    src = src || readSources();
    const d = (k) => (src[k] && src[k].ok ? src[k].data : null);
    const unavailable = Object.keys(LABEL).filter((k) => !d(k));
    const kpi = (id, label, ic2, module, value, text, hint, tone) => ({ id, label, icon: ic2, module, value, valueText: value == null ? 'غير متاح' : text, hint: value == null ? '' : hint, tone: value == null ? '' : (tone || '') });
    const o = d('orders'), p = d('providers'), c = d('customers'), q = d('quotes'), cp = d('complaints'), rv = d('reviews'), st = d('settlements'), f = d('finance'), s = d('security'), a = d('audit'), set = d('settings');
    const kpis = [
      kpi('orders', 'إجمالي الطلبات', 'list', 'orders', o && o.total, o && nf(o.total), o && ('جديدة ' + nf(o.new) + ' · قيد التنفيذ ' + nf(o.active) + ' · مكتملة ' + nf(o.done))),
      kpi('providers', 'مقدمو خدمة معتمدون', 'provider', 'providers', p && p.approved, p && nf(p.approved), p && ('بانتظار المراجعة ' + nf(p.pending) + ' · موقوفون ' + nf(p.suspended)), p && p.pending ? 'warning' : ''),
      kpi('customers', 'العملاء', 'user', 'customers', c && c.total, c && nf(c.total), c && ('نشطون ' + nf(c.active) + ' · موقوفون ' + nf(c.suspended))),
      kpi('quotes', 'عروض بانتظار المراجعة', 'send', 'quotes', q && q.awaiting, q && nf(q.awaiting), q && ('منتهية الصلاحية ' + nf(q.expired)), q && q.awaiting ? 'info' : ''),
      kpi('complaints', 'شكاوى مفتوحة', 'warn', 'complaints', cp && (cp.new + cp.review), cp && nf(cp.new + cp.review), cp && ('عالية الأولوية ' + nf(cp.hot)), cp && cp.hot ? 'danger' : ''),
      kpi('commission', 'العمولات المحسوبة (30 يومًا)', 'wallet', 'finance', f && f.commission, f && money(f.commission), f && ('غير محصّلة ' + money(f.uncollected))),
      kpi('dues', 'مستحقات مقدمي الخدمة المتبقية', 'earnings', 'settlements', st && st.outstanding, st && money(st.outstanding), st && ('تمت تسويتها (محاكاة) ' + money(st.settled))),
      kpi('security', 'تنبيهات أمنية مفتوحة', 'shield', 'security', s && s.openAlerts, s && nf(s.openAlerts), s && ('حرجة ' + nf(s.critical) + ' · جلسات نشطة ' + nf(s.activeSessions)), s && s.critical ? 'danger' : '')
    ];
    const att = [];
    const add = (id, level, count, text, module) => { if (count > 0) att.push({ id, level, count, text, module }); };
    if (s) { add('sec-critical', 'danger', s.critical, nf(s.critical) + ' تنبيه أمني حرج مفتوح.', 'security'); add('sec-open', 'warning', s.openAlerts - s.critical, nf(s.openAlerts - s.critical) + ' تنبيه أمني مفتوح بخطورة أقل.', 'security'); }
    if (cp) add('complaints-hot', 'danger', cp.hot, nf(cp.hot) + ' شكوى عالية الأولوية بلا حل.', 'complaints');
    if (st) add('settlement-disc', 'danger', st.discrepancyCount, nf(st.discrepancyCount) + ' تسوية بها اختلاف مفتوح يمنع الاعتماد.', 'settlements');
    if (o) add('orders-problem', 'warning', o.problem, nf(o.problem) + ' طلب ملغى أو متعثر.', 'orders');
    if (p) add('providers-pending', 'warning', p.pending, nf(p.pending) + ' مقدم خدمة بانتظار المراجعة.', 'providers');
    if (rv) add('reviews-flagged', 'warning', rv.flagged, nf(rv.flagged) + ' تقييم مُبلَّغ عنه بانتظار الإشراف.', 'reviews');
    if (q) add('quotes-expired', 'warning', q.expired, nf(q.expired) + ' عرض سعر منتهي الصلاحية بلا قرار.', 'quotes');
    if (f) add('finance-disc', 'warning', f.discrepancyCount, nf(f.discrepancyCount) + ' فرق مالي مفتوح في لوحة الماليات.', 'finance');
    if (set && set.maintenance) add('maintenance', 'warning', 1, 'وضع الصيانة مفعّل في الإعدادات (محاكاة؛ لا يوقف أي تطبيق).', 'settings');
    if (q) add('quotes-awaiting', 'info', q.awaiting, nf(q.awaiting) + ' عرض سعر بانتظار المراجعة.', 'quotes');
    if (a) add('audit-flagged', 'info', a.denied + a.failed, nf(a.denied + a.failed) + ' حدث تدقيق مرفوض أو فاشل.', 'audit');
    const attention = att.map((x, i) => [x, i]).sort((x, y) => LEVEL_RANK[x[0].level] - LEVEL_RANK[y[0].level] || x[1] - y[1]).map((x) => x[0]);
    const top = attention.length ? attention[0].level : null;
    const health = unavailable.length === Object.keys(LABEL).length ? 'error' : top === 'danger' ? 'critical' : top === 'warning' ? 'attention' : 'stable';
    const ops = set ? [
      ['وضع الصيانة', set.maintenance ? 'مفعّل (محاكاة)' : 'غير مفعّل'],
      ['اعتماد المزود الجديد', set.providerApproval ? 'مطلوب' : 'غير مطلوب'],
      ['الضريبة', set.taxEnabled ? 'مفعّلة ' + nf(set.taxRatePct) + '٪ (غير معتمدة بعد)' : 'غير مفعّلة'],
      ['الجلسات النشطة', s ? nf(s.activeSessions) : 'غير متاح'],
      ['محاولات دخول فاشلة مسجلة', s ? nf(s.failedLogins) : 'غير متاح']
    ] : [];
    return { health, unavailable, unavailableLabels: unavailable.map((k) => LABEL[k]), kpis, attention, ops, platformName: set ? set.platformName : '' };
  };
  const HEALTH = { stable: ['مستقر', 'check', 'is-info'], attention: ['يحتاج انتباهًا', 'warn', 'is-warning'], critical: ['توجد تنبيهات حرجة', 'warn', 'is-danger'], error: ['تعذّر قراءة البيانات', 'warn', 'is-danger'] };

  /** Links grouped as in the shell NAV. Only registered pages are links; everything else is disabled with «قريبًا». Self is excluded. */
  const modulesFor = (shell) => ((shell && shell.NAV) || []).map((g) => ({ label: g.label, items: g.items.filter((i) => i.id !== 'super-dashboard').map((i) => ({ id: i.id, label: i.label, icon: i.icon, enabled: !!(shell.isRegistered && shell.isRegistered(i.id)) })) })).filter((g) => g.items.length);

  /* ───── Rendering ───── */
  const link = (mod, text, cls) => {
    const shell = root.HSAdminShell;
    return shell && shell.isRegistered(mod) ? `<a class="${cls}" href="#/${esc(mod)}">${text}</a>` : `<span class="${cls} is-soon" aria-disabled="true">${text} <small>(قريبًا)</small></span>`;
  };
  const kpiHtml = (k) => `<article class="dash-kpi sd-kpi ${k.tone ? 'is-' + esc(k.tone) : ''}" data-kpi="${esc(k.id)}"><div class="sd-kpi-in">
    <span class="dash-kpi-ico" aria-hidden="true">${icon(k.icon)}</span>
    <span class="dash-kpi-body"><span class="dash-kpi-l">${esc(k.label)}</span><span class="dash-kpi-v sd-v">${esc(k.valueText)}</span>${k.hint ? `<small class="sd-hint">${esc(k.hint)}</small>` : ''}</span>
    <span class="sd-kpi-link">${link(k.module, 'فتح ' + esc(LABEL[k.module] || ''), 'dash-link')}</span></div></article>`;
  const viewHtml = (m) => {
    const h = HEALTH[m.health];
    const body = m.health === 'error'
      ? `<p class="dash-empty" role="alert">${icon('warn')}<span>تعذّرت قراءة بيانات كل الوحدات التجريبية. حدّث الصفحة.</span></p>`
      : `<section aria-label="المؤشرات" class="dash-kpis">${m.kpis.map(kpiHtml).join('')}</section>
    <div class="dash-cols">
      <section class="dash-card" aria-labelledby="sd-h-att"><h2 id="sd-h-att" tabindex="-1">يحتاج انتباهك <span class="dash-count">${nf(m.attention.length)}</span></h2>
        ${m.attention.length ? `<ul class="dash-alerts">${m.attention.map((a) => `<li class="dash-alert is-${esc(a.level)}"><span class="dash-alert-ico" aria-hidden="true">${icon(a.level === 'info' ? 'info' : 'warn')}</span><span class="dash-alert-t">${esc(a.text)} ${link(a.module, 'عرض', 'dash-link')}</span></li>`).join('')}</ul>`
          : `<p class="dash-empty">${icon('check')}<span>لا توجد عناصر تحتاج انتباهًا في البيانات التجريبية الحالية.</span></p>`}</section>
      <section class="dash-card" aria-labelledby="sd-h-ops"><h2 id="sd-h-ops">حالة التشغيل (إعدادات تجريبية)</h2>
        ${m.ops.length ? `<dl class="sd-ops">${m.ops.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '<p class="dash-empty">إعدادات النظام غير متاحة.</p>'}</section>
    </div>`;
    const mods = modulesFor(root.HSAdminShell);
    return `<div class="fin-banner" role="note">${icon('info')}<span>بيانات تجريبية محلية — هذه الصفحة للقراءة فقط وتجمع أرقامًا من حالة الصفحات التجريبية في هذه الجلسة. لا بيانات حقيقية ولا إجراء هنا يغيّر شيئًا، وتُفقد التعديلات التجريبية عند إعادة التحميل.</span></div>
    <p class="sd-health ${h[2]}" role="status">${icon(h[1])}<span>حالة المنصة (تجريبية): <b>${esc(h[0])}</b>${m.platformName ? ' — ' + esc(m.platformName) : ''}</span></p>
    ${m.health !== 'error' && m.unavailable.length ? `<p class="fin-banner" role="alert">${icon('warn')}<span>تعذّرت قراءة: ${esc(m.unavailableLabels.join('، '))}. تظهر مؤشراتها «غير متاح».</span></p>` : ''}
    ${body}
    <section class="dash-card" aria-labelledby="sd-h-mod"><h2 id="sd-h-mod">وحدات الإدارة</h2>${mods.map((g) => `<h3 class="sd-g">${esc(g.label)}</h3><div class="dash-short">${g.items.map((i) => link(i.id, `<span aria-hidden="true">${icon(i.icon)}</span>${esc(i.label)}`, 'dash-sc')).join('')}</div>`).join('')}</section>`;
  };
  const render = () => { const wrap = root.document.createElement('div'); wrap.className = 'dash sd'; wrap.innerHTML = viewHtml(buildModel()); return wrap; };

  const api = { SOURCES, LABEL, HEALTH, readSources, buildModel, modulesFor, viewHtml };
  root.HSAdminSuperDashboardPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('super-dashboard', {
      title: 'لوحة المالك',
      description: 'ملخص عام للمؤشرات والتنبيهات وحالة التشغيل وروابط الوحدات — عرض تجريبي للقراءة فقط.',
      actions: [{ id: 'refresh', label: 'تحديث', kind: 'primary', onClick: (ctx) => ctx.shell.refresh() }],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
