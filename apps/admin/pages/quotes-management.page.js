/**
 * MODULE: quotes-management.page
 * RESPONSIBILITY: Admin quotes management — quotes linked to orders and providers, with status, amount and validity date; filters, search,
 *   details dialog and SIMULATED review decisions (approve / return to provider / reject) with a mandatory confirm step, a written reason
 *   for return/reject, and a local decision log.
 * STATUS: IMPLEMENTED (DEMO). Quotes are DERIVED from the orders demo fixtures (orders-management.page.js: every order that reached the
 *   quote stage or beyond) — there is no second copy of order data. Decisions live in memory only: no order status changes, nobody is
 *   notified, no money moves. Fixed demo «now» = 2026-11-09. Workflow/validity rules are demo assumptions
 *   (docs/DECISIONS/2026-11-09-quotes-demo-assumptions.md).
 * Depends on: HSAdminShell, HSDataGrid, HSStatusBadge (registers `quote`), HSDialog, HSMoney, orders-management.page (loaded before this page).
 */
'use strict';
(function (root) {
  const M = root.HSMoney || (typeof require === 'function' ? require('../../../shared/utils/money.js') : null);
  const ORD = root.HSAdminOrdersPage || (typeof require === 'function' ? require('./orders-management.page.js') : null);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeZone: 'UTC' }).format(t); } catch (e) { return iso; } };
  const nf = (n) => M.number(n);
  const DEMO_NOW = '2026-11-09T12:00:00Z', REASON_MIN = 3, REASON_MAX = 300, DAY = 86400000;

  const STATUS = {
    submitted: { label: 'بانتظار المراجعة', tone: 'info', icon: 'info' }, expired: { label: 'منتهي الصلاحية', tone: 'neutral', icon: 'warn' },
    approved: { label: 'معتمد (محاكاة)', tone: 'success', icon: 'check' }, returned: { label: 'أُعيد للمزود (محاكاة)', tone: 'warning', icon: 'warn' },
    rejected: { label: 'مرفوض (محاكاة)', tone: 'danger', icon: 'cancel' }
  };
  const B = root.HSStatusBadge;
  if (B && B.domains().indexOf('quote') === -1) B.register('quote', STATUS);
  const badge = (s) => (B ? B.render('quote', s) : esc((STATUS[s] || {}).label || 'غير محدد'));
  /** Admin decisions on a submitted quote (demo assumption). Approved / rejected are final; returned waits for the provider. */
  const FLOW = { submitted: ['approved', 'returned', 'rejected'], returned: ['rejected'], approved: [], rejected: [] };
  const REASON_REQUIRED = ['returned', 'rejected'];
  const ACTION_LABEL = { approved: 'اعتماد العرض (محاكاة)', returned: 'إرجاع للمزود (محاكاة)', rejected: 'رفض العرض (محاكاة)' };
  const CONFIRM_NOTE = {
    approved: 'سيُعلَّم العرض «معتمد» داخل هذه الصفحة فقط؛ لا تتغير حالة الطلب ولا يُبلَّغ العميل أو المزود.',
    returned: 'سيُعلَّم العرض «أُعيد للمزود» محليًا فقط؛ لا يصل أي إشعار للمزود.', rejected: 'سيُعلَّم العرض «مرفوض» محليًا فقط؛ لا يصل أي إشعار لأي جهة.'
  };
  /** Orders that reached the quote stage (or beyond) own a quote; their status decides the quote's starting status (demo assumption). */
  const QUOTE_ORDER_STATUS = { quote: 'submitted', started: 'returned', completed: 'approved', closed: 'approved' };

  /* ───── Derivation from the orders fixtures (no second copy) ───── */
  const day = (iso) => String(iso).slice(0, 10);
  const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  const demoDay = () => DEMO_NOW.slice(0, 10);
  const buildQuotes = (orders) => {
    const src = orders || ORD.buildFixtures();
    let k = 0; const out = [];
    src.slice().sort((a, b) => a.no - b.no).forEach((o) => {
      const st = QUOTE_ORDER_STATUS[o.status]; if (!st || !o.provider || !(o.amount > 0)) return;
      const sub = day(o.at), submitted = st === 'submitted';
      // For quotes still awaiting review the validity alternates between «still valid» and «already lapsed» so both paths are demonstrable.
      const valid = submitted ? addDays(demoDay(), (k++) % 2 === 0 ? 3 : -2) : addDays(sub, 14);
      out.push({ id: 'qt' + o.no, ref: 'QT-DEMO-' + String(o.no).padStart(4, '0'), orderNo: o.no, customer: o.customer, provider: o.provider, service: o.service, category: o.category, amount: o.amount, submittedOn: sub, validUntil: valid, status: st });
    });
    return out;
  };
  let quotes = buildQuotes(), log = [];
  const resetState = () => { quotes = buildQuotes(); log = []; };

  /* ───── Pure logic (unit-tested) ───── */
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z'));
  /** Effective status: a submitted quote whose validity date is before the fixed demo day is «expired». */
  const effective = (q) => (q.status === 'submitted' && q.validUntil < demoDay() ? 'expired' : q.status);
  const validate = (list, orders) => {
    const p = [], ids = new Set(), ord = {}; (orders || ORD.buildFixtures()).forEach((o) => { ord[o.no] = o; });
    list.forEach((q) => {
      const w = (m) => p.push(q.id + ': ' + m);
      if (ids.has(q.id)) w('duplicate id'); ids.add(q.id);
      const o = ord[q.orderNo]; if (!o) w('unknown order'); else { if (o.provider !== q.provider) w('provider differs from the order'); if (o.amount !== q.amount) w('amount differs from the order'); if (o.customer !== q.customer) w('customer differs from the order'); }
      if (!STATUS[q.status] || q.status === 'expired') w('unknown status');
      if (!Number.isInteger(q.amount) || q.amount <= 0) w('amount must be a positive whole number');
      if (!isDate(q.submittedOn) || !isDate(q.validUntil)) w('invalid date'); else if (q.validUntil < q.submittedOn) w('validity before submission');
      if (q.status === 'rejected' && !String(q.decisionReason || '').trim()) w('rejected quote needs a reason');
    });
    return p;
  };
  const counts = (list) => {
    const c = { total: list.length, awaiting: 0, expired: 0, approved: 0, returned: 0, rejected: 0, approvedAmount: 0 };
    list.forEach((q) => { const e = effective(q); if (e === 'submitted') c.awaiting++; else c[e]++; if (q.status === 'approved') c.approvedAmount += q.amount; });
    return c;
  };
  const allowedActions = (q) => {
    const e = effective(q), base = (FLOW[q.status] || []).slice();
    return e === 'expired' ? base.filter((a) => a !== 'approved') : base; // an expired quote cannot be approved
  };
  const cleanNote = (n) => String(n == null ? '' : n).trim();
  /** Simulated decision. Immutable. Throws 'Unknown quote'|'Decision not allowed'|'Quote expired'|'Reason required'. */
  const decide = (list, lg, id, to, o) => {
    const q = list.find((x) => x.id === id); if (!q) throw new Error('Unknown quote');
    if (!(FLOW[q.status] || []).includes(to)) throw new Error('Decision not allowed');
    if (to === 'approved' && effective(q) === 'expired') throw new Error('Quote expired');
    const note = cleanNote(o && o.note);
    if (REASON_REQUIRED.includes(to) && (note.length < REASON_MIN || note.length > REASON_MAX)) throw new Error('Reason required');
    if (note.length > REASON_MAX) throw new Error('Reason required');
    const next = Object.assign({}, q, { status: to }); if (note) next.decisionReason = note;
    return { quotes: list.map((x) => (x.id === id ? next : x)), log: lg.concat([{ id, action: to, note, at: DEMO_NOW }]) };
  };
  const toRow = (q) => Object.assign({}, q, { shown: effective(q), orderLabel: '#' + q.orderNo });

  const COLUMNS = [
    { key: 'ref', label: 'رقم العرض', html: (r) => `<span dir="ltr">${esc(r.ref)}</span>` }, { key: 'orderNo', label: 'الطلب', type: 'number', format: (r) => r.orderLabel },
    { key: 'customer', label: 'العميل' }, { key: 'provider', label: 'مقدم الخدمة' }, { key: 'amount', label: 'المبلغ', type: 'number', format: (r) => M.format(r.amount) },
    { key: 'validUntil', label: 'صالح حتى', type: 'date', format: (r) => dt(r.validUntil) }, { key: 'shown', label: 'الحالة', type: 'status', statusDomain: 'quote' }
  ];
  const FILTERS = [{ key: 'shown', label: 'الحالة', options: Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k].label })) }, { key: 'provider', label: 'مقدم الخدمة' }, { key: 'service', label: 'الخدمة' }];
  const GRID_CFG = { columns: COLUMNS, searchKeys: ['ref', 'orderLabel', 'customer', 'provider', 'service'], filters: FILTERS };

  /* ───── Rendering ───── */
  const summaryHtml = () => {
    const c = counts(quotes), s = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${esc(v)}</b></div>`;
    return `<section class="ord-sum" aria-label="ملخص العروض التجريبية">${s('إجمالي العروض', nf(c.total))}${s('بانتظار المراجعة', nf(c.awaiting))}${s('منتهية الصلاحية', nf(c.expired))}${s('معتمدة', nf(c.approved))}${s('أُعيدت / مرفوضة', nf(c.returned + c.rejected))}</section>`;
  };
  const headHtml = (t, sub) => `<header class="ord-dlg-h"><div><h2 id="ord-dlg-t">${esc(t)}</h2><p>${sub}</p></div><button type="button" class="adm-btn" data-ord-close aria-label="إغلاق">${icon('close')}</button></header>`;
  const detailHtml = (st, q) => {
    const acts = allowedActions(q), hist = log.filter((x) => x.id === q.id);
    return `<div class="ord-dlg-in">${headHtml('تفاصيل عرض السعر', '<span dir="ltr">' + esc(q.ref) + '</span> — ' + esc(q.provider))}
      <p class="ord-sim" role="note">${icon('info')}<span>بيانات تجريبية مشتقة من الطلبات: لا تتغير حالة الطلب، ولا يُبلَّغ العميل أو المزود، ولا يتحرك أي مال.</span></p>
      ${st.msg ? `<p class="stl-result" id="qt-result" tabindex="-1" role="status">${esc(st.msg)}</p>` : ''}
      <dl class="ord-facts"><div><dt>الحالة</dt><dd>${badge(effective(q))}</dd></div><div><dt>المبلغ</dt><dd>${esc(M.format(q.amount))}</dd></div>
      <div><dt>الطلب</dt><dd>#${esc(q.orderNo)} — ${esc(q.service)} (${esc(q.category)})</dd></div><div><dt>العميل</dt><dd>${esc(q.customer)}</dd></div>
      <div><dt>مقدم الخدمة</dt><dd>${esc(q.provider)}</dd></div><div><dt>تاريخ التقديم</dt><dd>${esc(dt(q.submittedOn))}</dd></div>
      <div><dt>صالح حتى</dt><dd>${esc(dt(q.validUntil))}</dd></div>${q.decisionReason ? `<div><dt>سبب القرار</dt><dd>${esc(q.decisionReason)}</dd></div>` : ''}</dl>
      <section aria-labelledby="qt-h-act"><h3 id="qt-h-act">قرار المراجعة (محاكاة)</h3>${acts.length ? `<div class="ord-act">${acts.map((a) => `<button type="button" class="adm-btn" data-qt-act="${a}">${esc(ACTION_LABEL[a])}</button>`).join('')}</div>` : '<p class="ord-muted">لا قرارات متاحة لهذا العرض.</p>'}
      ${effective(q) === 'expired' ? '<p class="ord-muted">العرض منتهي الصلاحية: لا يمكن اعتماده.</p>' : ''}</section>
      <section aria-labelledby="qt-h-hist"><h3 id="qt-h-hist">سجل القرارات (محلي)</h3>${hist.length ? `<ul class="ord-tl">${hist.slice().reverse().map((x) => `<li><span><b>${esc(ACTION_LABEL[x.action])}</b>${x.note ? ' — ' + esc(x.note) : ''}</span><small>${esc(dt(x.at))}</small></li>`).join('')}</ul>` : '<p class="ord-muted">لا قرارات مسجلة.</p>'}</section>
      <div class="ord-act"><button type="button" class="adm-btn" data-ord-close>إغلاق</button></div></div>`;
  };
  const confirmHtml = (st, q) => {
    const need = REASON_REQUIRED.includes(st.action);
    return `<div class="ord-dlg-in">${headHtml('تأكيد: ' + ACTION_LABEL[st.action], '<span dir="ltr">' + esc(q.ref) + '</span> — ' + esc(M.format(q.amount)))}
      <p class="ord-sim" role="note">${icon('info')}<span>${esc(CONFIRM_NOTE[st.action])}</span></p>
      <div class="hs-grid-field"><label for="qt-note">${need ? 'السبب (مطلوب ويُسجَّل، ' + nf(REASON_MIN) + '–' + nf(REASON_MAX) + ' حرفًا)' : 'ملاحظة (اختيارية)'}</label><textarea id="qt-note" rows="2" maxlength="${REASON_MAX}">${esc(st.note || '')}</textarea></div>
      <p class="ord-err" id="ord-err" role="alert" hidden></p>
      <div class="ord-act"><button type="button" class="adm-btn adm-btn-p" data-qt-confirm>تأكيد (محاكاة محلية)</button><button type="button" class="adm-btn" data-qt-back>رجوع</button></div></div>`;
  };

  const render = () => {
    const wrap = root.document.createElement('div'); wrap.className = 'ord qt';
    wrap.innerHTML = `<div class="fin-banner" role="note">${icon('info')}<span>بيانات تجريبية محلية — عروض الأسعار مشتقة من الطلبات التجريبية، والقرارات هنا محاكاة: لا تتغير حالة أي طلب، ولا يُرسل شيء للعميل أو المزود، ولا يتحرك أي مال. تُفقد القرارات عند إعادة التحميل. تاريخ العرض الثابت: ${esc(dt(DEMO_NOW))}.</span></div>
      <div id="qt-sum"></div><div id="qt-grid"></div><dialog class="ord-dlg" id="qt-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const dlgEl = wrap.querySelector('#qt-dlg'); let st = null, grid;
    const rows = () => quotes.map(toRow), paintSum = () => { wrap.querySelector('#qt-sum').innerHTML = summaryHtml(); };
    const cur = () => (st ? quotes.find((x) => x.id === st.id) : null);
    const paintDlg = (sel) => { const q = cur(); if (!st || !q) return; dlgEl.innerHTML = st.stage === 'confirm' ? confirmHtml(st, q) : detailHtml(st, q); const f = sel && dlgEl.querySelector(sel); if (f) f.focus(); };
    paintSum();
    grid = root.HSDataGrid.create(wrap.querySelector('#qt-grid'), Object.assign({}, GRID_CFG, {
      caption: 'عروض الأسعار التجريبية', pageSize: 10, rowId: (r) => r.id, rows: [], searchPlaceholder: 'ابحث برقم العرض أو الطلب أو العميل أو المزود…',
      rowActions: [{ id: 'open', label: 'التفاصيل', onClick: (r) => { st = { id: r.id, stage: 'view', action: null, note: '', msg: '' }; paintDlg('[data-ord-close]'); d.open(); } }],
      emptyText: 'لا توجد عروض أسعار مطابقة.', onRetry: () => load()
    }));
    const load = () => { try { grid.setRows(rows()); } catch (e) { grid.setState('error', 'تعذر تحميل عروض الأسعار التجريبية.'); } };
    load();
    const d = root.HSDialog.attach(dlgEl, { closeSelector: '[data-ord-close]',
      fallbackFocus: () => (st && wrap.querySelector('tr[data-row="' + st.id + '"] [data-act="open"]')) || wrap.querySelector('.hs-grid-search input'), onClose: () => { st = null; } });
    const showErr = (m) => { const e = dlgEl.querySelector('#ord-err'); if (e) { e.textContent = m; e.hidden = !m; } };
    d.onClick((b) => {
      if (!st) return;
      if (b.hasAttribute('data-qt-act')) { st.action = b.getAttribute('data-qt-act'); st.stage = 'confirm'; st.note = ''; st.msg = ''; paintDlg('#qt-note'); }
      else if (b.hasAttribute('data-qt-back')) { st.stage = 'view'; st.action = null; paintDlg('[data-qt-act]'); }
      else if (b.hasAttribute('data-qt-confirm')) {
        st.note = dlgEl.querySelector('#qt-note').value;
        try {
          const r = decide(quotes, log, st.id, st.action, { note: st.note }); quotes = r.quotes; log = r.log;
          st.msg = 'سُجّل القرار «' + ACTION_LABEL[st.action] + '» محليًا. محاكاة فقط — لم تتغير حالة الطلب ولم يُبلَّغ أحد.';
          st.stage = 'view'; st.action = null; grid.setRows(rows()); paintSum(); paintDlg('#qt-result');
        } catch (err) {
          const m = err && err.message;
          showErr(m === 'Reason required' ? 'اكتب السبب (' + nf(REASON_MIN) + ' أحرف على الأقل) لتوثيقه.' : m === 'Quote expired' ? 'العرض منتهي الصلاحية ولا يمكن اعتماده.' : m === 'Decision not allowed' ? 'هذا القرار غير مسموح من الحالة الحالية.' : 'تعذر تنفيذ القرار المحاكى.');
        }
      }
    });
    return wrap;
  };

  const api = { STATUS, FLOW, ACTION_LABEL, QUOTE_ORDER_STATUS, DEMO_NOW, REASON_MIN, REASON_MAX, GRID_CFG, COLUMNS, buildQuotes, validate, effective, counts, allowedActions, decide, toRow, resetState, _quotes: () => quotes, _log: () => log };
  root.HSAdminQuotesPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('quotes', {
      title: 'عروض الأسعار',
      description: 'عروض الأسعار المرتبطة بالطلبات وحالاتها ومواعيدها ومقدم الخدمة — قرارات مراجعة محاكاة محلية فقط.',
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
