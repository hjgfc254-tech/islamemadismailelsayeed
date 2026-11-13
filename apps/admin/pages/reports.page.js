/**
 * MODULE: reports.page
 * RESPONSIBILITY: Admin financial reports — pick a report, a period and a category filter, view the result (meta, bar chart,
 *   table with totals, reconciliation checks) and export it as a LOCAL CSV file.
 * STATUS: IMPLEMENTED (DEMO). Every figure is derived from the demo fixtures of the finance dashboard and the settlements
 *   page (same numbers, no second copy of the data). Nothing is read from or sent to a backend; no real accounting result,
 *   no payment, collection or settlement is produced. The «today» is the FIXED demo date 2026-11-09.
 * Reports (4): finance-summary · commission-collection · provider-dues (fixed 30-day basis, from settlements) · discrepancies.
 * Interactions: report switch, period (7/30/90, disabled for fixed-basis reports), category filter, loading/empty/error/success
 *   states, local CSV export (UTF-8 BOM, CSV-injection guard, demo disclosure rows) and a local export log (memory only), reset.
 * Depends on: HSAdminShell, HSMoney, finance-dashboard.page (HSAdminFinanceDashboardPage) and settlements.page
 *   (HSAdminSettlementsPage) — both must load before this file. Permissions are NOT enforced (frontend-only phase).
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const M = root.HSMoney || (typeof require === 'function' ? require('../../../shared/utils/money.js') : null);
  const FIN = root.HSAdminFinanceDashboardPage || (typeof require === 'function' ? require('./finance-dashboard.page.js') : null);
  const SET = root.HSAdminSettlementsPage || (typeof require === 'function' ? require('./settlements.page.js') : null);
  const nf = (n) => M.number(n);
  const money = (n) => M.format(n);
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeZone: 'UTC' }).format(t); } catch (e) { return iso; } };

  const DEMO_TODAY = (SET && SET.DEMO_TODAY) || '2026-11-09';
  const PERIODS = FIN ? FIN.PERIODS : [{ id: '7', label: '7 أيام' }, { id: '30', label: '30 يومًا' }, { id: '90', label: '90 يومًا' }];
  const FIXED_PERIOD = '30';
  const DEMO_NOTICE = 'بيانات تجريبية محلية — ليست أرقامًا حقيقية';
  const SOURCE_FIN = 'لوحة الماليات (بيانات تجريبية ثابتة)';
  const SOURCE_SET = 'صفحة التسويات (بيانات تجريبية ثابتة مشتقة من لوحة الماليات)';

  /* ───── Report catalogue ───── */
  const REPORTS = [
    { id: 'finance-summary', title: 'الملخص المالي حسب التصنيف', description: 'قيمة الطلبات والعمولات وصافي مقدمي الخدمة لكل تصنيف.', basis: 'period', source: SOURCE_FIN },
    { id: 'commission-collection', title: 'تحصيل العمولات', description: 'العمولة المحسوبة مقابل المحصّلة ونسبة التحصيل لكل تصنيف.', basis: 'period', source: SOURCE_FIN },
    { id: 'provider-dues', title: 'مستحقات مقدمي الخدمة', description: 'المستحق والمسوّى (محاكاة) والمتبقي والمعلّق لكل مقدم خدمة — أساس ثابت 30 يومًا.', basis: 'fixed', source: SOURCE_SET },
    { id: 'discrepancies', title: 'الفروقات المالية', description: 'الفروقات بين المبلغ المتوقع والمسجّل في الفترة المختارة.', basis: 'period', source: SOURCE_FIN }
  ];
  const reportDef = (id) => REPORTS.find((r) => r.id === id) || null;

  /* ───── Pure helpers (unit-tested) ───── */
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const normPeriod = (p) => (PERIODS.some((x) => x.id === p) ? p : FIXED_PERIOD);
  const normCategory = (c) => (c === 'all' || (FIN && FIN.CATEGORIES.some((x) => x.id === c)) ? c : 'all');
  /** Inclusive range ending on the fixed demo date: 7 days → 2026-11-03…2026-11-09. */
  const periodRange = (p) => { const days = Number(normPeriod(p)); return { days, from: addDays(DEMO_TODAY, -(days - 1)), to: DEMO_TODAY }; };
  const rate = (part, whole) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0);
  const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const catLabel = (c) => (c === 'all' ? 'كل التصنيفات' : ((FIN.CATEGORIES.find((x) => x.id === c) || {}).label || 'كل التصنيفات'));
  const check = (label, ok) => ({ label, ok: !!ok });

  const COLS = {
    finance: [
      { key: 'label', label: 'التصنيف', type: 'text' }, { key: 'gmv', label: 'قيمة الطلبات', type: 'money' }, { key: 'commission', label: 'العمولة المحسوبة', type: 'money' },
      { key: 'collected', label: 'العمولة المحصّلة', type: 'money' }, { key: 'uncollected', label: 'غير المحصّلة', type: 'money' }, { key: 'providerNet', label: 'صافي مقدمي الخدمة', type: 'money' },
      { key: 'settled', label: 'المسوّى (محاكاة)', type: 'money' }, { key: 'pendingDues', label: 'المتبقي غير المسوّى', type: 'money' }],
    collection: [
      { key: 'label', label: 'التصنيف', type: 'text' }, { key: 'commission', label: 'العمولة المحسوبة', type: 'money' }, { key: 'collected', label: 'العمولة المحصّلة', type: 'money' },
      { key: 'uncollected', label: 'غير المحصّلة', type: 'money' }, { key: 'collectRate', label: 'نسبة التحصيل', type: 'percent' }],
    dues: [
      { key: 'provider', label: 'مقدم الخدمة (تجريبي)', type: 'text' }, { key: 'categoryLabel', label: 'التصنيف', type: 'text' }, { key: 'total', label: 'إجمالي المستحق', type: 'money' },
      { key: 'settled', label: 'مسوّاة (محاكاة)', type: 'money' }, { key: 'outstanding', label: 'متبقية', type: 'money' }, { key: 'onHold', label: 'معلّقة', type: 'money' },
      { key: 'openDiscrepancies', label: 'اختلافات مفتوحة', type: 'int' }],
    discrepancies: [
      { key: 'ref', label: 'المرجع (تجريبي)', type: 'ref' }, { key: 'categoryLabel', label: 'التصنيف', type: 'text' }, { key: 'expected', label: 'المتوقع', type: 'money' },
      { key: 'recorded', label: 'المسجّل', type: 'money' }, { key: 'diff', label: 'الفرق', type: 'delta' }, { key: 'note', label: 'الوصف', type: 'text' }]
  };

  const builders = {
    'finance-summary': (p, c) => {
      const m = FIN.buildModel(p, c, { reviewed: {} });
      const rows = m.rows.map((r) => Object.assign({}, r));
      const totals = { label: 'الإجمالي' }; ['gmv', 'commission', 'collected', 'uncollected', 'providerNet', 'settled', 'pendingDues'].forEach((k) => { totals[k] = sum(rows, k); });
      return { columns: COLS.finance, rows, totals,
        chart: { label: 'قيمة الطلبات حسب التصنيف', items: rows.map((r) => ({ label: r.label, value: r.gmv, text: money(r.gmv) })) },
        checks: [check('العمولة المحسوبة = المحصّلة + غير المحصّلة', totals.commission === totals.collected + totals.uncollected),
          check('صافي مقدمي الخدمة = المسوّى + المتبقي', totals.providerNet === totals.settled + totals.pendingDues),
          check('قيمة الطلبات = العمولة + صافي مقدمي الخدمة', totals.gmv === totals.commission + totals.providerNet),
          check('الإجماليات تطابق لوحة الماليات لنفس الفترة والتصنيف', totals.gmv === m.totals.gmv && totals.commission === m.totals.commission && totals.pendingDues === m.totals.pendingDues)] };
    },
    'commission-collection': (p, c) => {
      const m = FIN.buildModel(p, c, { reviewed: {} });
      const rows = m.rows.map((r) => ({ label: r.label, commission: r.commission, collected: r.collected, uncollected: r.uncollected, collectRate: rate(r.collected, r.commission) }));
      const totals = { label: 'الإجمالي', commission: sum(rows, 'commission'), collected: sum(rows, 'collected'), uncollected: sum(rows, 'uncollected') };
      totals.collectRate = rate(totals.collected, totals.commission);
      return { columns: COLS.collection, rows, totals,
        chart: { label: 'نسبة التحصيل حسب التصنيف', max: 100, items: rows.map((r) => ({ label: r.label, value: r.collectRate, text: M.percent(r.collectRate) })) },
        checks: [check('العمولة المحسوبة = المحصّلة + غير المحصّلة (لكل تصنيف)', rows.every((r) => r.commission === r.collected + r.uncollected)),
          check('كل نسب التحصيل بين 0٪ و100٪', rows.every((r) => r.collectRate >= 0 && r.collectRate <= 100) && totals.collectRate <= 100),
          check('إجمالي العمولات يطابق لوحة الماليات', totals.commission === m.totals.commission && totals.collected === m.totals.collected)] };
    },
    'provider-dues': (p, c) => {
      const list = SET.buildFixtures().filter((s) => c === 'all' || s.category === c);
      const rows = SET.byProvider(list).map((g) => ({ provider: g.provider, categoryLabel: g.categoryLabel, total: g.total, settled: g.settled, outstanding: g.outstanding, onHold: g.onHold, openDiscrepancies: g.discrepancyCount }));
      const totals = { provider: 'الإجمالي', categoryLabel: '' }; ['total', 'settled', 'outstanding', 'onHold', 'openDiscrepancies'].forEach((k) => { totals[k] = sum(rows, k); });
      const fin = FIN.buildModel(FIXED_PERIOD, c, { reviewed: {} }).totals;
      return { columns: COLS.dues, rows, totals,
        chart: { label: 'المتبقي غير المسوّى لكل مقدم خدمة', items: rows.map((r) => ({ label: r.provider, value: r.outstanding, text: money(r.outstanding) })) },
        checks: [check('إجمالي المستحق = المسوّى + المتبقي (لكل مقدم خدمة)', rows.every((r) => r.total === r.settled + r.outstanding)),
          check('المعلّق جزء من المتبقي', rows.every((r) => r.onHold <= r.outstanding)),
          check('الإجماليات تطابق لوحة الماليات (30 يومًا): الصافي والمسوّى والمتبقي', totals.total === fin.providerNet && totals.settled === fin.settled && totals.outstanding === fin.pendingDues)] };
    },
    discrepancies: (p, c) => {
      const m = FIN.buildModel(p, c, { reviewed: {} });
      const rows = m.discrepancies.map((d) => ({ ref: d.ref, categoryLabel: d.categoryLabel, expected: d.expected, recorded: d.recorded, diff: d.recorded - d.expected, note: d.note }));
      const totals = { ref: 'الإجمالي', categoryLabel: '', expected: sum(rows, 'expected'), recorded: sum(rows, 'recorded'), diff: sum(rows, 'diff'), note: nf(rows.length) + ' حالة' };
      const abs = rows.reduce((a, r) => a + Math.abs(r.diff), 0);
      return { columns: COLS.discrepancies, rows, totals,
        chart: { label: 'مقدار الفرق لكل حالة', items: rows.map((r) => ({ label: r.ref, value: Math.abs(r.diff), text: money(Math.abs(r.diff)) })) },
        checks: [check('الفرق = المسجّل − المتوقع (لكل حالة)', rows.every((r) => r.diff === r.recorded - r.expected)),
          check('عدد الحالات ومجموع الفروقات يطابقان لوحة الماليات (قبل أي تعليم محلي)', rows.length === m.totals.discrepancyCount && abs === m.totals.discrepancyAmount)] };
    }
  };

  /**
   * Builds a report model. Throws RangeError('Unknown report'). Unknown period → 30, unknown category → all (same as the finance
   * dashboard). `fixed` reports ignore the period and always use the 30-day basis.
   */
  const buildReport = (id, period, category) => {
    const def = reportDef(id);
    if (!def || !builders[id]) throw new RangeError('Unknown report');
    if (!FIN || (id === 'provider-dues' && !SET)) throw new RangeError('Data source unavailable');
    const c = normCategory(category);
    const p = def.basis === 'fixed' ? FIXED_PERIOD : normPeriod(period);
    const body = builders[id](p, c);
    return Object.assign({ id, title: def.title, description: def.description, basis: def.basis, source: def.source, period: p, range: periodRange(p), category: c, categoryLabel: catLabel(c),
      today: DEMO_TODAY, notice: DEMO_NOTICE, empty: body.rows.length === 0 }, body);
  };
  /** Never throws: { ok:true, report } | { ok:false, error }. */
  const safeBuild = (id, period, category) => { try { return { ok: true, report: buildReport(id, period, category) }; } catch (e) { return { ok: false, error: (e && e.message) || 'Unknown error' }; } };

  /* ───── Cell formatting + CSV ───── */
  const deltaText = (v) => (v > 0 ? 'زيادة ' + money(v) : v < 0 ? 'نقص ' + money(Math.abs(v)) : 'لا فرق');
  const cellText = (col, v) => {
    if (v == null || v === '') return '';
    switch (col.type) {
      case 'money': return money(v);
      case 'percent': return M.percent(v);
      case 'int': return nf(v);
      case 'delta': return deltaText(v);
      default: return String(v);
    }
  };
  const csvCell = (v) => {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula-injection guard (text only; numbers stay numeric)
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  /** CSV text (UTF-8 BOM + CRLF). Numbers are raw whole pounds / percent values; the first rows disclose that the data is demo data. */
  const toCsv = (report) => {
    const line = (cells) => cells.map(csvCell).join(',');
    const out = [line([report.title]), line(['ملاحظة', report.notice + ' — لا يمثل حسابًا حقيقيًا ولا عملية مالية']), line(['المصدر', report.source]),
      line(['الفترة', report.range.from + ' → ' + report.range.to + ' (' + report.range.days + ' يومًا)' + (report.basis === 'fixed' ? ' — أساس ثابت' : '')]),
      line(['التصنيف', report.categoryLabel]), line(['تاريخ العرض (ثابت تجريبي)', report.today]), '',
      line(report.columns.map((c) => c.label))];
    report.rows.forEach((r) => out.push(line(report.columns.map((c) => r[c.key]))));
    if (report.totals && report.rows.length) out.push(line(report.columns.map((c) => report.totals[c.key])));
    return '﻿' + out.join('\r\n') + '\r\n';
  };
  const csvFileName = (report) => 'hansalehlak-demo-' + report.id + '-' + report.period + 'd-' + report.category + '.csv';

  /** Immutable export log entry. Throws RangeError('Nothing to export') for an empty report. */
  const recordExport = (entries, report, at) => {
    if (!report || report.empty || !report.rows || !report.rows.length) throw new RangeError('Nothing to export');
    const entry = { at: at || new Date().toISOString(), reportId: report.id, title: report.title, period: report.period, category: report.category, categoryLabel: report.categoryLabel,
      rowCount: report.rows.length, fileName: csvFileName(report), local: true };
    return entries.concat([entry]);
  };

  /* ───── State (memory only) ───── */
  const fresh = () => ({ report: REPORTS[0].id, period: '30', category: 'all' });
  let state = fresh();
  let exportLog = [];
  const resetState = () => { state = fresh(); exportLog = []; };

  /* ───── Rendering ───── */
  const cellHtml = (col, v) => (col.type === 'ref' ? `<span dir="ltr">${esc(v)}</span>` : esc(cellText(col, v)));
  const tableHtml = (r) => {
    const head = r.columns.map((c) => `<th scope="col"${c.type === 'text' || c.type === 'ref' ? '' : ' class="is-num"'}>${esc(c.label)}</th>`).join('');
    const body = r.rows.map((row) => `<tr>${r.columns.map((c, i) => (i === 0 ? `<th scope="row">${cellHtml(c, row[c.key])}</th>` : `<td${c.type === 'text' ? '' : ' class="is-num"'}>${cellHtml(c, row[c.key])}</td>`)).join('')}</tr>`).join('');
    const foot = `<tr>${r.columns.map((c, i) => (i === 0 ? `<th scope="row">${esc(r.totals[c.key])}</th>` : `<td${c.type === 'text' ? '' : ' class="is-num"'}>${cellHtml(c, r.totals[c.key])}</td>`)).join('')}</tr>`;
    return `<div class="rep-scroll" role="region" tabindex="0" aria-label="جدول التقرير: ${esc(r.title)}"><table class="rep-table"><caption class="rep-sr">${esc(r.title)} — ${esc(DEMO_NOTICE)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>`;
  };
  const chartHtml = (r) => {
    const max = r.chart.max || Math.max.apply(null, r.chart.items.map((i) => i.value).concat([1]));
    return `<ul class="rep-chart" aria-label="${esc(r.chart.label)}">${r.chart.items.map((i) => `<li><span class="rep-chart-l">${esc(i.label)}</span><span class="dash-bar rep-chart-b" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Math.round((i.value / max) * 100)))}%"></i></span><b>${esc(i.text)}</b></li>`).join('')}</ul>`;
  };
  const metaHtml = (r) => `<dl class="rep-meta">
    <div><dt>التقرير</dt><dd>${esc(r.title)}</dd></div>
    <div><dt>الفترة</dt><dd>${esc(dt(r.range.from))} — ${esc(dt(r.range.to))} (${nf(r.range.days)} يومًا)${r.basis === 'fixed' ? ' · أساس ثابت' : ''}</dd></div>
    <div><dt>التصنيف</dt><dd>${esc(r.categoryLabel)}</dd></div>
    <div><dt>مصدر البيانات</dt><dd>${esc(r.source)}</dd></div>
    <div><dt>تاريخ العرض (ثابت تجريبي)</dt><dd>${esc(dt(r.today))}</dd></div></dl>`;
  const checksHtml = (r) => `<ul class="rep-checks">${r.checks.map((c) => `<li class="${c.ok ? 'is-ok' : 'is-bad'}"><b aria-hidden="true">${c.ok ? '✓' : '✗'}</b><span>${esc(c.label)} — <em>${c.ok ? 'متطابق' : 'غير متطابق'}</em></span></li>`).join('')}</ul>`;
  const logHtml = () => `<section class="dash-card" aria-labelledby="rep-h-log"><h2 id="rep-h-log">سجل التصدير المحلي <span class="dash-count">${nf(exportLog.length)}</span></h2>
    ${exportLog.length ? `<ul class="ord-tl">${exportLog.slice().reverse().slice(0, 10).map((e) => `<li><span><b>${esc(e.title)}</b> — ${esc(e.categoryLabel)} — ${nf(e.rowCount)} صفًا<br><span dir="ltr">${esc(e.fileName)}</span><br><em>ملف تجريبي أُنشئ على هذا الجهاز فقط — لم يُرسل إلى أي جهة</em></span><small>${esc(dt(e.at))}</small></li>`).join('')}</ul>`
      : '<p class="ord-muted">لا تصديرات بعد. كل تصدير يُسجَّل هنا (في الذاكرة فقط).</p>'}</section>`;

  const resultHtml = (st) => {
    if (st.phase === 'loading') return `<div class="rep-state" role="status" aria-busy="true">${icon('info')}<span>جارٍ إنشاء التقرير…</span></div>`;
    if (st.phase === 'error') return `<div class="rep-state is-error" role="alert">${icon('warn')}<span>تعذر إنشاء التقرير التجريبي. ${esc(st.error || '')}</span><button type="button" class="adm-btn" data-rep-retry>إعادة المحاولة</button></div>`;
    const r = st.result;
    if (r.empty) return `${metaHtml(r)}<div class="rep-state" role="status">${icon('info')}<span>لا توجد بيانات لهذا التقرير في الفترة والتصنيف المختارين. جرّب فترة أطول أو «كل التصنيفات».</span></div>`;
    return `${metaHtml(r)}
      <section class="dash-card" aria-labelledby="rep-h-chart"><h2 id="rep-h-chart">${esc(r.chart.label)}</h2>${chartHtml(r)}</section>
      <section class="dash-card" aria-labelledby="rep-h-table"><h2 id="rep-h-table">جدول التقرير <span class="dash-count">${nf(r.rows.length)} صفًا</span></h2>${tableHtml(r)}</section>
      <section class="dash-card" aria-labelledby="rep-h-chk"><h2 id="rep-h-chk">فحوص التطابق</h2>${checksHtml(r)}</section>`;
  };

  const viewHtml = (st) => {
    const def = reportDef(st.report), fixed = def && def.basis === 'fixed';
    const canExport = st.phase === 'ready' && st.result && !st.result.empty;
    return `
    <div class="fin-banner" role="note">${icon('info')}<span>${esc(DEMO_NOTICE)}. التقارير مشتقة من أرقام لوحة الماليات والتسويات التجريبية؛ التصدير ينشئ ملف CSV محليًا على هذا الجهاز ولا يُرسل شيئًا. لا يتم تنفيذ أي دفع أو تحصيل أو تسوية. الصلاحيات هنا للعرض فقط وليست حماية فعلية.</span></div>
    <section aria-labelledby="rep-h-pick"><h2 id="rep-h-pick" class="rep-sr">اختيار التقرير</h2>
      <div class="rep-pick">${REPORTS.map((r) => `<button type="button" class="rep-pick-b" data-report="${esc(r.id)}" aria-pressed="${r.id === st.report}"><b>${esc(r.title)}</b><small>${esc(r.description)}</small></button>`).join('')}</div></section>
    <div class="dash-tools">
      <div role="radiogroup" class="dash-seg" aria-label="الفترة الزمنية">
        ${PERIODS.map((p) => `<button type="button" role="radio" aria-checked="${(fixed ? FIXED_PERIOD : st.period) === p.id}" data-period="${esc(p.id)}" ${fixed ? 'disabled' : ''}>${esc(p.label)}</button>`).join('')}
      </div>
      <label class="fin-filter"><span>التصنيف</span>
        <select data-category>
          <option value="all" ${st.category === 'all' ? 'selected' : ''}>كل التصنيفات</option>
          ${FIN.CATEGORIES.map((c) => `<option value="${esc(c.id)}" ${st.category === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
        </select></label>
      <button type="button" class="adm-btn adm-btn-p" data-rep-export ${canExport ? '' : 'disabled'}>${icon('save')}تصدير CSV (ملف تجريبي محلي)</button>
    </div>
    ${fixed ? '<p class="ord-muted">هذا التقرير يعتمد على أساس ثابت (آخر 30 يومًا) ولا يتأثر باختيار الفترة.</p>' : ''}
    <p class="rep-msg" id="rep-msg" role="status" tabindex="-1" ${st.msg ? '' : 'hidden'}>${esc(st.msg || '')}</p>
    <div id="rep-result" aria-live="polite">${resultHtml(st)}</div>
    ${logHtml()}`;
  };

  const render = () => {
    const wrap = root.document.createElement('div');
    wrap.className = 'dash fin rep';
    const st = { phase: 'loading', result: null, error: '', msg: '' };
    let token = 0;
    const view = () => Object.assign({}, state, st);
    const paint = (focusSel) => {
      wrap.innerHTML = viewHtml(view());
      if (focusSel) { const n = wrap.querySelector(focusSel); if (n && !n.disabled) n.focus(); }
    };
    const run = (focusSel) => {
      const mine = ++token;
      st.phase = 'loading'; st.msg = ''; paint(focusSel);
      root.setTimeout(() => {
        if (mine !== token) return;
        const res = safeBuild(state.report, state.period, state.category);
        if (res.ok) { st.phase = 'ready'; st.result = res.report; st.error = ''; } else { st.phase = 'error'; st.result = null; st.error = ''; }
        paint(focusSel);
      }, 0);
    };
    run();
    const download = (report) => {
      const blob = new root.Blob([toCsv(report)], { type: 'text/csv;charset=utf-8' });
      const url = root.URL.createObjectURL(blob);
      const a = root.document.createElement('a');
      a.href = url; a.download = csvFileName(report); a.rel = 'noopener';
      root.document.body.appendChild(a); a.click(); a.remove();
      root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
    };
    wrap.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t || t.disabled) return;
      if (t.dataset.report) { state.report = t.dataset.report; run('[data-report="' + state.report + '"]'); }
      else if (t.dataset.period) { state.period = t.dataset.period; run('[data-period="' + state.period + '"]'); }
      else if (t.hasAttribute('data-rep-retry')) run('[data-rep-export]');
      else if (t.hasAttribute('data-rep-export')) {
        try {
          if (st.phase !== 'ready' || !st.result) throw new RangeError('Nothing to export');
          exportLog = recordExport(exportLog, st.result);
          download(st.result);
          st.msg = 'تم إنشاء ملف CSV تجريبي (' + csvFileName(st.result) + ') على هذا الجهاز فقط. لم يُرسل إلى أي جهة.';
        } catch (err) {
          st.msg = err && err.message === 'Nothing to export' ? 'لا توجد بيانات لتصديرها.' : 'تعذر إنشاء الملف المحلي على هذا المتصفح.';
        }
        paint('#rep-msg');
      }
    });
    wrap.addEventListener('change', (e) => {
      if (e.target.hasAttribute && e.target.hasAttribute('data-category')) { state.category = e.target.value; run('[data-category]'); }
    });
    return wrap;
  };

  const api = { REPORTS, PERIODS, FIXED_PERIOD, DEMO_TODAY, DEMO_NOTICE, buildReport, safeBuild, periodRange, toCsv, csvCell, csvFileName, cellText, recordExport,
    resetState, _state: () => state, _log: () => exportLog };
  root.HSAdminReportsPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('reports', {
      title: 'التقارير',
      description: 'تقارير مالية تجريبية: اختر تقريرًا وفترة وتصنيفًا، واعرض النتائج أو صدّرها كملف CSV محلي — بيانات تجريبية فقط.',
      actions: [{ id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { resetState(); ctx.shell.refresh(); } }],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
