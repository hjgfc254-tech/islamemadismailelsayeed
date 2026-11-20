/**
 * MODULE: insights.page — «الإحصائيات والتقارير»: the one place for numbers in the Admin Center.
 * Tabs: نظرة عامة (KPIs + 14-day trends, from admin-dashboard.page) · حسب القسم (counts per area, computed from the
 * loaded records) · الماليات (finance page) · التقارير (reports page) · لوحة المالك (owner board — owner only).
 * The finance / reports / owner pages stay registered (deep links keep working) but are reached from here, and the
 * work pages no longer repeat their own statistic strips (hidden by .adm-content .ord-sum in admin-components.css).
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const money = (n) => nf(Math.round(+n || 0)) + ' ج.م';
  const isOwner = () => { try { const R = root.HSAdminRbac; return !!(R && R.state && R.state.actor === 'owner'); } catch (e) { return false; } };
  const TABS = [
    { id: 'overview', label: 'نظرة عامة' },
    { id: 'areas', label: 'حسب القسم' },
    { id: 'finance', label: 'الماليات', page: 'finance' },
    { id: 'reports', label: 'التقارير', page: 'reports' },
    { id: 'owner', label: 'لوحة المالك', page: 'super-dashboard', owner: true }
  ];
  let tab = 'overview';

  /** Counts per area from the loaded records (pure; unit-tested). */
  function areaCounts(d) {
    d = d || (typeof MP !== 'undefined' ? MP.db() : {});
    const by = (list, key) => (list || []).reduce((m, x) => { const k = x[key] || '—'; m[k] = (m[k] || 0) + 1; return m; }, {});
    const tx = (d.transactions || []).filter((t) => !t.free);
    return {
      orders: { total: (d.serviceRequests || []).length, byStatus: by(d.serviceRequests, 'status') },
      providers: { total: (d.providers || []).length, byStatus: by(d.providers, 'status'), available: (d.providers || []).filter((p) => p.status === 'approved' && p.available).length },
      customers: { total: (d.customers || []).length },
      complaints: { total: (d.complaints || []).length, open: (d.complaints || []).filter((k) => k.status === 'open').length },
      reviews: { total: (d.reviews || []).length, avg: (d.reviews || []).length ? (d.reviews.reduce((s, r) => s + (+r.stars || 0), 0) / d.reviews.length) : 0 },
      money: { value: tx.reduce((s, t) => s + (+t.value || 0), 0), commission: tx.reduce((s, t) => s + (+t.commission || 0), 0), pending: tx.filter((t) => t.collection === 'pending').reduce((s, t) => s + (+t.commission || 0), 0) }
    };
  }
  const STATUS = () => (typeof STATUS_LABEL !== 'undefined' ? STATUS_LABEL : {});
  const PSTATUS = { approved: 'معتمد', pending: 'قيد المراجعة', suspended: 'معلّق', rejected: 'مرفوض' };
  function areasHtml() {
    const c = areaCounts();
    const card = (title, big, rows, link) => `<section class="ins-card"><h3>${esc(title)}</h3><b class="ins-big">${big}</b>${rows.length ? `<ul>${rows.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join('')}</ul>` : ''}${link ? `<a class="dash-link" href="#/${link}">افتح الصفحة</a>` : ''}</section>`;
    const st = STATUS();
    return `<div class="ins-grid">
      ${card('الطلبات', nf(c.orders.total), Object.entries(c.orders.byStatus).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [st[k] || k, nf(v)]), 'orders')}
      ${card('مقدمو الخدمة', nf(c.providers.total), [['متاحين دلوقتي', nf(c.providers.available)], ...Object.entries(c.providers.byStatus).map(([k, v]) => [PSTATUS[k] || k, nf(v)])], 'providers')}
      ${card('العملاء', nf(c.customers.total), [], 'customers')}
      ${card('الشكاوى', nf(c.complaints.total), [['مفتوحة', nf(c.complaints.open)]], 'complaints')}
      ${card('التقييمات', nf(c.reviews.total), [['المتوسط', c.reviews.total ? c.reviews.avg.toLocaleString('ar-EG', { maximumFractionDigits: 1 }) + ' / ٥' : '—']], 'reviews')}
      ${card('الفلوس', money(c.money.value), [['حصة المنصة', money(c.money.commission)], ['لسه ما اتحصّلتش', money(c.money.pending)]], 'settlements')}
    </div>`;
  }

  /* ── CSV export (opens in Excel; UTF-8 BOM so Arabic shows correctly) ── */
  const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function toCsv(rows) { return '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); }
  function exportRows(kind, d) {
    d = d || (typeof MP !== 'undefined' ? MP.db() : {});
    const st = STATUS(), day = (iso) => String(iso || '').slice(0, 16).replace('T', ' ');
    if (kind === 'orders') return [['رقم الطلب', 'التاريخ', 'الخدمة', 'القسم', 'المحافظة', 'المنطقة', 'الحالة', 'القيمة النهائية']].concat((d.serviceRequests || []).map((x) => [x.no || x.id, day(x.createdAt), x.serviceName || '', x.cat || '', x.gov || '', x.area || '', st[x.status] || x.status, x.finalValue || '']));
    if (kind === 'transactions') return [['التاريخ', 'الطلب', 'مقدم الخدمة', 'قيمة الخدمة', 'حصة المنصة', 'صافي مقدم الخدمة', 'التحصيل']].concat((d.transactions || []).filter((x) => !x.free).map((x) => {
      const p = (d.providers || []).find((y) => y.id === x.providerId), r = (d.serviceRequests || []).find((y) => y.id === x.reqId);
      return [day(x.at), r ? (r.no || r.id) : x.reqId || '', p ? p.name : x.providerId || '', x.value || 0, x.commission || 0, x.net != null ? x.net : (x.value || 0) - (x.commission || 0), ({ collected: 'اتحصّلت', pending: 'لسه' })[x.collection] || x.collection || ''];
    }));
    if (kind === 'providers') return [['الاسم', 'الحالة', 'التخصصات', 'المحافظات', 'التقييم', 'عدد الشغلانات', 'متاح']].concat((d.providers || []).map((p) => [p.name, PSTATUS[p.status] || p.status, (p.cats || []).join(' / '), (p.govs || []).join(' / '), p.rating || '', p.jobs || 0, p.available ? 'نعم' : 'لا']));
    return [];
  }
  function download(kind) {
    const rows = exportRows(kind); if (rows.length < 2) return false;
    const name = ({ orders: 'الطلبات', transactions: 'المعاملات', providers: 'مقدمي-الخدمة' })[kind] + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    try { const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })); const a = root.document.createElement('a'); a.href = url; a.download = name; root.document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); return true; } catch (e) { return false; }
  }
  const exportBar = () => `<div class="ins-export" role="group" aria-label="تصدير"><b>تصدير لملف Excel:</b>${[['orders', 'الطلبات'], ['transactions', 'المعاملات'], ['providers', 'مقدمو الخدمة']].map(([k, l]) => `<button type="button" class="adm-btn" data-ins-export="${k}">${l}</button>`).join('')}<span role="status" aria-live="polite" class="ord-muted" data-ins-export-status></span></div>`;

  async function paintTab(host, ctx) {
    const t = TABS.find((x) => x.id === tab) || TABS[0];
    if (t.id === 'overview') { host.innerHTML = ''; if (root.HSAdminDashboardPage && root.HSAdminDashboardPage.kpiView) root.HSAdminDashboardPage.kpiView(host); return; }
    if (t.id === 'areas') { host.innerHTML = areasHtml(); return; }
    const def = root.HSAdminShell && root.HSAdminShell.getPage ? root.HSAdminShell.getPage(t.page) : null;
    if (!def) { host.innerHTML = '<p class="ord-muted">الصفحة غير متاحة.</p>'; return; }
    host.innerHTML = '<div aria-busy="true" class="sk sk-bar"></div>';
    try {
      const out = await def.render(Object.assign({}, ctx, { id: t.page }));
      host.innerHTML = '';
      if (out && typeof out === 'object' && out.nodeType) host.appendChild(out); else host.innerHTML = String(out || '');
      host.querySelectorAll('.ord-sum').forEach((n) => n.classList.add('ins-keep'));     // statistics belong here: keep them visible
    } catch (e) { host.innerHTML = '<p>تعذّر تحميل هذا القسم.</p>'; }
  }

  function render(ctx) {
    const wrap = root.document.createElement('div');
    wrap.className = 'ins';
    const tabs = TABS.filter((t) => !t.owner || isOwner());
    if (!tabs.some((t) => t.id === tab)) tab = 'overview';
    wrap.innerHTML = `<div class="ins-tabs" role="tablist" aria-label="أقسام الإحصائيات">${tabs.map((t) => `<button type="button" role="tab" id="ins-t-${t.id}" aria-controls="ins-panel" aria-selected="${t.id === tab}" tabindex="${t.id === tab ? 0 : -1}" data-ins-tab="${t.id}">${esc(t.label)}</button>`).join('')}</div>
      ${exportBar()}
      <div id="ins-panel" role="tabpanel" aria-labelledby="ins-t-${tab}" class="ins-panel"></div>`;
    const panel = wrap.querySelector('#ins-panel');
    paintTab(panel, ctx);
    const select = (id, focus) => {
      tab = id;
      wrap.querySelectorAll('[data-ins-tab]').forEach((b) => { const on = b.dataset.insTab === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
      panel.setAttribute('aria-labelledby', 'ins-t-' + id);
      const fresh = panel.cloneNode(false); panel.replaceWith(fresh);          // drop listeners of the previous tab
      paintTab(wrap.querySelector('#ins-panel'), ctx);
    };
    wrap.addEventListener('click', (e) => { const b = e.target.closest('[data-ins-export]'); if (!b) return; const ok = download(b.dataset.insExport); const s = wrap.querySelector('[data-ins-export-status]'); if (s) s.textContent = ok ? 'اتحمّل الملف.' : 'مفيش بيانات للتصدير.'; });
    wrap.querySelector('.ins-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-ins-tab]'); if (b) select(b.dataset.insTab); });
    wrap.querySelector('.ins-tabs').addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const ids = tabs.map((t) => t.id), i = ids.indexOf(tab);
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : (i + (e.key === 'ArrowLeft' ? 1 : -1) + ids.length) % ids.length;   // RTL
      e.preventDefault(); select(ids[n], true);
    });
    return wrap;
  }

  const api = { TABS, areaCounts, render, exportRows, toCsv, _setTab: (t) => { tab = t; } };
  root.HSAdminInsightsPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('insights', {
      title: 'الإحصائيات والتقارير',
      description: 'كل الأرقام في مكان واحد: المؤشرات، كل قسم، الماليات، التقارير ولوحة المالك.',
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
