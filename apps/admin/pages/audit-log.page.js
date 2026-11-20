/**
 * MODULE: audit-log.page
 * RESPONSIBILITY: Admin audit log — READ-ONLY list of who did what, when, on which record, with what result; filters, search, event details.
 * STATUS: IMPLEMENTED (DEMO). Events are fixed local fixtures (fictional actors, example.test addresses). This is NOT a tamper-proof log:
 *   nothing is recorded, stored or verified; no event is produced by the other pages. No edit/delete/export action exists (by design).
 *   Fixed demo «now» = 2026-11-09. Event model is a demo assumption (docs/DECISIONS/2026-11-09-audit-log-demo-assumptions.md).
 * Interactions: HSDataGrid (search by actor/action/record/summary; module, result, actor filters; sort; pagination; loading/error/empty), details dialog.
 * Depends on: HSAdminShell, HSDataGrid, HSStatusBadge (registers `auditresult`), HSDialog.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(t); } catch (e) { return iso; } };
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const DEMO_NOW = '2026-11-09T12:00:00Z';

  const RESULT = {
    success: { label: 'نجحت', tone: 'success', icon: 'check' },
    denied: { label: 'مرفوضة', tone: 'warning', icon: 'warn' },
    failed: { label: 'فشلت', tone: 'danger', icon: 'cancel' }
  };
  const MODULES = { orders: 'الطلبات', providers: 'مقدمو الخدمة', finance: 'الماليات', roles: 'الأدوار والصلاحيات', workforce: 'فريق العمل', reports: 'التقارير', settings: 'الإعدادات', auth: 'الدخول' };
  const load = (g, file) => root[g] || (typeof require === 'function' ? require(file) : null);
  const AF = load('HSAdminAuditFilters', '../modules/audit/audit-filters.js'), AD = load('HSAdminAuditDetails', '../modules/audit/audit-details.js');
  if (!AF || !AD) throw new Error('audit-log.page.js requires modules/audit/* to load first');
  const B = root.HSStatusBadge;
  if (B && B.domains().indexOf('auditresult') === -1) B.register('auditresult', RESULT);
  const badge = (s) => (B ? B.render('auditresult', s) : esc((RESULT[s] || {}).label || 'غير محدد'));

  /* ───── Fixtures (demo) ───── */
  const ACTORS = { a1: 'مالك تجريبي (owner@example.test)', a2: 'موظفة مالية تجريبية (fin@example.test)', a3: 'مشرف عمليات تجريبي (ops@example.test)', a4: 'موظف دعم تجريبي (support@example.test)' };
  const E = (n, at, actor, module, action, record, result, summary, extra) => Object.assign({ id: 'ev' + n, at, actorId: actor, module, action, record, result, summary }, extra || {});
  const buildEvents = () => [
    E(1, '2026-11-09T11:42:00Z', 'a2', 'reports', 'تصدير تقرير', 'finance-summary', 'success', 'تصدير ملف CSV تجريبي محلي', { ip: '192.0.2.10' }),
    E(2, '2026-11-09T10:15:00Z', 'a2', 'finance', 'مراجعة اختلاف', 'ORD-DEMO-1042', 'success', 'تعليم اختلاف كمُراجَع (محاكاة)', { ip: '192.0.2.10' }),
    E(3, '2026-11-09T09:58:00Z', 'a4', 'roles', 'تعديل دور', 'role-support', 'denied', 'رفض: الصلاحية أعلى من سلطة المنفّذ', { ip: '192.0.2.44', reason: 'تجاوز سلطة المنفّذ' }),
    E(4, '2026-11-09T09:30:00Z', 'a1', 'roles', 'تعديل دور', 'role-finance', 'success', 'إضافة صلاحية عرض التقارير بعد مراجعة الأثر', { ip: '192.0.2.1' }),
    E(5, '2026-11-09T08:55:00Z', 'a3', 'orders', 'تغيير حالة طلب', 'ORD-DEMO-1050', 'success', 'من «جديد» إلى «قيد المراجعة»', { ip: '192.0.2.31' }),
    E(6, '2026-11-09T08:40:00Z', 'a3', 'orders', 'تغيير حالة طلب', 'ORD-DEMO-1049', 'failed', 'انتقال حالة غير مسموح', { ip: '192.0.2.31', reason: 'Transition not allowed' }),
    E(7, '2026-11-08T17:20:00Z', 'a1', 'workforce', 'دعوة موظف', 'emp-new-01', 'success', 'دعوة محاكاة (لم تُرسل)', { ip: '192.0.2.1' }),
    E(8, '2026-11-08T16:05:00Z', 'a4', 'auth', 'تسجيل دخول', 'session', 'failed', 'كلمة مرور غير صحيحة (محاكاة)', { ip: '192.0.2.44', reason: 'بيانات دخول غير صحيحة' }),
    E(9, '2026-11-08T16:07:00Z', 'a4', 'auth', 'تسجيل دخول', 'session', 'success', 'دخول ناجح (محاكاة)', { ip: '192.0.2.44' }),
    E(10, '2026-11-08T14:10:00Z', 'a2', 'finance', 'اعتماد تسوية', 'STL-DEMO-0004', 'success', 'اعتماد محاكاة (لم يُحوَّل أي مبلغ)', { ip: '192.0.2.10' }),
    E(11, '2026-11-08T13:50:00Z', 'a2', 'finance', 'تعليق تسوية', 'STL-DEMO-0006', 'success', 'السبب: بيانات استلام غير مكتملة', { ip: '192.0.2.10', reason: 'بيانات استلام غير مكتملة' }),
    E(12, '2026-11-08T12:00:00Z', 'a3', 'providers', 'مراجعة مزود', 'pv-014', 'success', 'اعتماد ملف المزود (محاكاة)', { ip: '192.0.2.31' }),
    E(13, '2026-11-07T15:30:00Z', 'a1', 'settings', 'تعديل إعداد', 'commission.default', 'success', 'تغيير نسبة افتراضية من ١٠٪ إلى ١٢٪ (محاكاة)', { ip: '192.0.2.1', reason: 'مراجعة ربع سنوية' }),
    E(14, '2026-11-07T11:11:00Z', 'a4', 'providers', 'إيقاف مزود', 'pv-009', 'denied', 'رفض: لا صلاحية لإيقاف المزودين', { ip: '192.0.2.44', reason: 'لا صلاحية' }),
    E(15, '2026-11-06T10:00:00Z', 'a1', 'workforce', 'تغيير دور موظف', 'emp-003', 'denied', 'رفض: آخر مالك مفعّل محمي', { ip: '192.0.2.1', reason: 'حماية آخر مالك' }),
    E(16, '2026-11-05T09:20:00Z', 'a3', 'orders', 'إضافة ملاحظة داخلية', 'ORD-DEMO-1031', 'success', 'ملاحظة داخلية', { ip: '192.0.2.31' }),
    E(17, '2026-11-04T18:45:00Z', 'a2', 'reports', 'تصدير تقرير', 'discrepancies', 'failed', 'تعذر إنشاء الملف المحلي (محاكاة)', { ip: '192.0.2.10', reason: 'خطأ متصفح' }),
    E(18, '2026-11-03T08:05:00Z', 'a1', 'roles', 'إنشاء دور', 'role-qa', 'success', 'إنشاء دور تجريبي', { ip: '192.0.2.1' })
  ];
  let events = buildEvents();

  /* ───── Pure logic (unit-tested) ───── */
  const validIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s) && Number.isFinite(Date.parse(s));
  /** Returns human-readable consistency problems; [] = valid. */
  const validateEvents = (list) => {
    const p = [], ids = new Set();
    list.forEach((e) => {
      const w = (m) => p.push(e.id + ': ' + m);
      if (ids.has(e.id)) w('duplicate id'); ids.add(e.id);
      if (!validIso(e.at)) w('invalid timestamp'); else if (Date.parse(e.at) > Date.parse(DEMO_NOW)) w('event is after the fixed demo time');
      if (!ACTORS[e.actorId]) w('unknown actor');
      if (!MODULES[e.module]) w('unknown module');
      if (!RESULT[e.result]) w('unknown result');
      if (!String(e.action || '').trim() || !String(e.record || '').trim() || !String(e.summary || '').trim()) w('action, record and summary are required');
      if ((e.result === 'denied' || e.result === 'failed') && !String(e.reason || '').trim()) w('denied/failed event needs a reason');
    });
    return p;
  };
  const counts = (list) => { const c = { total: list.length, success: 0, denied: 0, failed: 0 }; list.forEach((e) => { if (c[e.result] != null) c[e.result]++; }); return c; };
  const sortNewest = (list) => list.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (a.id < b.id ? -1 : 1));
  const toRow = (e) => Object.assign({}, e, { actor: ACTORS[e.actorId] || 'غير معروف', moduleLabel: MODULES[e.module] || 'غير معروف' });
  const COLUMNS = [
    { key: 'at', label: 'الوقت', type: 'date', format: (r) => dt(r.at) },
    { key: 'actor', label: 'المنفّذ' }, { key: 'moduleLabel', label: 'الوحدة' }, { key: 'action', label: 'الإجراء' },
    { key: 'record', label: 'السجل', html: (r) => `<span dir="ltr">${esc(r.record)}</span>` },
    { key: 'result', label: 'النتيجة', type: 'status', statusDomain: 'auditresult' }
  ];
  const GRID_CFG = AF.gridConfig(COLUMNS, RESULT);   /* search + filters: modules/audit/audit-filters.js */

  /* ───── Rendering ───── */
  const summaryHtml = () => {
    const c = counts(events), s = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${esc(nf(v))}</b></div>`;
    return `<section class="ord-sum" aria-label="ملخص الأحداث التجريبية">${s('إجمالي الأحداث', c.total)}${s('نجحت', c.success)}${s('مرفوضة', c.denied)}${s('فشلت', c.failed)}</section>`;
  };
  const detailHtml = (e) => AD.render(e, { esc, icon, dt, badge });   /* modules/audit/audit-details.js */

  const render = () => {
    const wrap = root.document.createElement('div'); wrap.className = 'ord aud';
    wrap.innerHTML = `<div class="fin-banner" role="note">${icon('info')}<span>بيانات تجريبية محلية للعرض فقط — ليست سجل تدقيق حقيقيًا ولا غير قابل للتلاعب، ولا يُسجَّل أي إجراء من الصفحات الأخرى هنا. لا تعديل ولا حذف ولا تصدير. تاريخ العرض الثابت: ${esc(dt(DEMO_NOW))}.</span></div>
      ${summaryHtml()}<div id="aud-grid"></div><section class="cerr" data-client-errors aria-labelledby="cerr-h"></section><dialog class="ord-dlg" id="aud-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    if (root.HSClientErrors) root.HSClientErrors.mount(wrap.querySelector('[data-client-errors]'));   /* modules/client-errors.js */
    const dlgEl = wrap.querySelector('#aud-dlg');
    let cur = null;
    const rows = () => sortNewest(events).map(toRow);
    const grid = root.HSDataGrid.create(wrap.querySelector('#aud-grid'), Object.assign({}, GRID_CFG, {
      caption: 'أحداث التدقيق التجريبية', pageSize: 10, rowId: (r) => r.id, rows: [], searchPlaceholder: 'ابحث بالمنفّذ أو الإجراء أو السجل…',
      rowActions: [{ id: 'open', label: 'التفاصيل', onClick: (r) => { cur = r.id; dlgEl.innerHTML = detailHtml(toRow(events.find((x) => x.id === r.id))); d.open(); const f = dlgEl.querySelector('[data-ord-close]'); if (f) f.focus(); } }],
      emptyText: 'لا توجد أحداث مطابقة.', onRetry: () => load()
    }));
    const load = () => { try { grid.setRows(rows()); } catch (e) { grid.setState('error', 'تعذر تحميل أحداث التدقيق التجريبية.'); } };
    load();
    const d = root.HSDialog.attach(dlgEl, { closeSelector: '[data-ord-close]',
      fallbackFocus: () => (cur && wrap.querySelector('tr[data-row="' + cur + '"] [data-act="open"]')) || wrap.querySelector('.hs-grid-search input'), onClose: () => { cur = null; } });
    return wrap;
  };

  const api = { RESULT, MODULES, ACTORS, DEMO_NOW, GRID_CFG, COLUMNS, buildEvents, validateEvents, counts, sortNewest, toRow, _events: () => events };
  root.HSAdminAuditLogPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('audit', {
      title: 'سجل التدقيق',
      description: 'من فعل ماذا ومتى وعلى أي سجل وما النتيجة — عرض تجريبي للقراءة فقط.',
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
