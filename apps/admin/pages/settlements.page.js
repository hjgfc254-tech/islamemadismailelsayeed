/**
 * MODULE: settlements.page
 * RESPONSIBILITY: Admin settlements (provider dues) — summary, per-provider dues, settlements grid with search/filters/sort,
 *   settlement details, hold/discrepancy reasons, and SIMULATED review / approve / mark-complete actions with a mandatory
 *   confirmation step and a local action log.
 * STATUS: IMPLEMENTED (DEMO). Every settlement is a local fixture derived from the finance dashboard's 30-day demo figures
 *   (shared category totals, split between two fictional providers per category). Nothing is read from or written to a backend,
 *   no payment gateway exists, NO MONEY MOVES: «completed» means «marked complete in this local simulation» only.
 *   The «today» used here is a FIXED demo date. Workflow, statuses and the 3–300 char reason bound are DEMO assumptions
 *   (see docs/DECISIONS/2026-11-09-settlements-demo-assumptions.md), not approved financial policy.
 * Interactions: grid (search, status/category/provider/discrepancy filters, sort, pagination, loading/error/empty), details dialog,
 *   two-step simulated actions (choose → confirm with note; hold and discrepancy review require a written reason), local log, reset.
 * Depends on: HSAdminShell, HSDataGrid, HSStatusBadge (registers `settlement`), HSDialog, HSMoney,
 *   finance-dashboard.page (category list + 30-day demo totals; must load before this file). No deletion, no real-operation API.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const M = root.HSMoney || (typeof require === 'function' ? require('../../../shared/utils/money.js') : null);
  const FIN = root.HSAdminFinanceDashboardPage || (typeof require === 'function' ? require('./finance-dashboard.page.js') : null);
  const nf = (n) => M.number(n);
  const money = (n) => M.format(n);
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeZone: 'UTC' }).format(t); } catch (e) { return iso; } };

  const DEMO_TODAY = '2026-11-09';
  const REASON_MIN = 3, REASON_MAX = 300;

  /* ───── Statuses and allowed transitions (DEMO assumptions) ───── */
  const STATUS = {
    pending: { label: 'بانتظار المراجعة', tone: 'neutral', icon: 'st-sent' },
    in_review: { label: 'قيد المراجعة', tone: 'info', icon: 'st-search' },
    approved: { label: 'معتمدة (محاكاة)', tone: 'brand', icon: 'st-accepted' },
    on_hold: { label: 'معلّقة', tone: 'warning', icon: 'warn' },
    completed: { label: 'مكتملة (محاكاة)', tone: 'success', icon: 'st-done' }
  };
  const FLOW = { pending: ['in_review', 'on_hold'], in_review: ['approved', 'on_hold'], on_hold: ['in_review'], approved: ['completed', 'on_hold'], completed: [] };
  const ACTION_LABEL = { in_review: 'بدء المراجعة', approved: 'اعتماد (محاكاة)', completed: 'تعليم كمكتملة (محاكاة محلية)', on_hold: 'تعليق' };
  const CONFIRM_LABEL = { in_review: 'تأكيد بدء المراجعة (محاكاة محلية)', approved: 'تأكيد الاعتماد (محاكاة محلية)', completed: 'تأكيد التعليم كمكتملة (محاكاة محلية)', on_hold: 'تأكيد التعليق (محاكاة محلية)' };
  const CONFIRM_NOTE = {
    in_review: 'ستنتقل التسوية إلى «قيد المراجعة» داخل هذه الصفحة فقط.',
    approved: 'ستُعلَّم التسوية «معتمدة» داخل هذه الصفحة فقط. لا يصدر أي قرار مالي حقيقي.',
    completed: 'ستُعلَّم التسوية «مكتملة (محاكاة)». لا يتم تحويل أي مبلغ إلى مقدم الخدمة ولا يوجد اتصال بأي بوابة دفع.',
    on_hold: 'ستُعلَّق التسوية داخل هذه الصفحة فقط، ويُسجَّل سبب التعليق.'
  };
  const REASON_REQUIRED = ['on_hold'];
  const B = root.HSStatusBadge;
  if (B && B.domains().indexOf('settlement') === -1) B.register('settlement', STATUS);
  const badge = (s, o) => (B ? B.render('settlement', s, o) : esc((STATUS[s] || {}).label || 'غير محدد'));

  /* ───── Fixtures (derived from the finance dashboard's 30-day demo totals) ───── */
  const PLAN = [
    { cat: 'electric', providers: [
      { id: 'pv-e1', name: 'مزوّد كهرباء تجريبي (أ)', status: 'pending', due: '2026-11-12' },
      { id: 'pv-e2', name: 'مزوّد كهرباء تجريبي (ب)', status: 'in_review', due: '2026-11-13', diff: true }] },
    { cat: 'plumbing', providers: [
      { id: 'pv-p1', name: 'مزوّد سباكة تجريبي (أ)', status: 'on_hold', due: '2026-11-12', hold: 'بيانات استلام المزوّد التجريبية غير مكتملة' },
      { id: 'pv-p2', name: 'مزوّد سباكة تجريبي (ب)', status: 'approved', due: '2026-11-11' }] },
    { cat: 'carpentry', providers: [
      { id: 'pv-c1', name: 'مزوّد نجارة تجريبي (أ)', status: 'pending', due: '2026-11-14' },
      { id: 'pv-c2', name: 'مزوّد نجارة تجريبي (ب)', status: 'on_hold', due: '2026-11-14', diff: true, hold: 'بانتظار حسم اختلاف مفتوح' }] },
    { cat: 'other', providers: [
      { id: 'pv-o1', name: 'مزوّد خدمات أخرى تجريبي (أ)', status: 'in_review', due: '2026-11-13' },
      { id: 'pv-o2', name: 'مزوّد خدمات أخرى تجريبي (ب)', status: 'pending', due: '2026-11-15' }] }
  ];
  const FIRST_SHARE = 60; // the first provider of each category gets 60%, the second the remainder (demo split)
  const SETTLED_PERIOD = { from: '2026-10-11', to: '2026-10-25' }, SETTLED_ON = '2026-10-28', PENDING_PERIOD = { from: '2026-10-26', to: '2026-11-09' };
  const DEMO_DIFF = { amount: 850, reason: 'فرق بين المبلغ المسجّل والمتوقع في طلب مرتبط', reviewed: false };

  const buildFixtures = () => {
    if (!FIN) return [];
    const rows = FIN.buildModel('30', 'all').rows, out = [];
    let n = 0;
    const mk = (o) => { n += 1; return Object.assign({ id: 's' + n, ref: 'STL-DEMO-' + String(n).padStart(4, '0') }, o); };
    PLAN.forEach((g) => {
      const row = rows.find((r) => r.id === g.cat); if (!row) return;
      const cat = FIN.CATEGORIES.find((c) => c.id === g.cat);
      const split = (total, i) => (i === 0 ? Math.round(total * FIRST_SHARE / 100) : total - Math.round(total * FIRST_SHARE / 100));
      g.providers.forEach((p, i) => {
        const base = { providerId: p.id, provider: p.name, category: g.cat, categoryLabel: cat.label, discrepancy: null, hold: null, settledOn: null, dueOn: null };
        out.push(mk(Object.assign({}, base, { amount: split(row.settled, i), status: 'completed', periodFrom: SETTLED_PERIOD.from, periodTo: SETTLED_PERIOD.to, settledOn: SETTLED_ON })));
        out.push(mk(Object.assign({}, base, { amount: split(row.pendingDues, i), status: p.status, periodFrom: PENDING_PERIOD.from, periodTo: PENDING_PERIOD.to, dueOn: p.due,
          hold: p.status === 'on_hold' ? { reason: p.hold } : null, discrepancy: p.diff ? Object.assign({}, DEMO_DIFF) : null })));
      });
    });
    return out;
  };
  let settlements = buildFixtures(), log = [];
  const resetState = () => { settlements = buildFixtures(); log = []; };

  /* ───── Pure logic (unit-tested) ───── */
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  const hasOpenDiscrepancy = (s) => !!(s.discrepancy && !s.discrepancy.reviewed);
  const canTransition = (from, to) => Object.prototype.hasOwnProperty.call(FLOW, from) && FLOW[from].indexOf(to) !== -1;
  /** Actions offered for a settlement: allowed transitions minus approval/completion while a discrepancy is still open. */
  const allowedActions = (s) => (FLOW[s.status] || []).filter((to) => !((to === 'approved' || to === 'completed') && hasOpenDiscrepancy(s)));

  /** Returns a list of human-readable consistency problems; [] means the data is valid. */
  const validateSettlements = (list) => {
    const p = [], ids = new Set(), refs = new Set();
    list.forEach((s) => {
      const w = (m) => p.push(s.id + ': ' + m);
      if (ids.has(s.id)) w('duplicate id'); ids.add(s.id);
      if (!/^STL-DEMO-\d{4}$/.test(s.ref || '')) w('reference must look like STL-DEMO-0001'); else if (refs.has(s.ref)) w('duplicate reference'); else refs.add(s.ref);
      if (!Number.isInteger(s.amount) || s.amount <= 0) w('amount must be a positive whole number');
      if (!STATUS[s.status]) w('unknown status');
      if (!isDate(s.periodFrom) || !isDate(s.periodTo) || s.periodFrom > s.periodTo) w('invalid accrual period');
      if (s.status === 'completed') { if (!isDate(s.settledOn)) w('completed settlement needs a demo settlement date'); if (hasOpenDiscrepancy(s)) w('completed settlement has an open discrepancy'); if (s.hold) w('completed settlement cannot be on hold'); }
      else { if (s.settledOn) w('only completed settlements have a settlement date'); if (!isDate(s.dueOn)) w('expected settlement date missing'); }
      if (s.status === 'on_hold' && !(s.hold && String(s.hold.reason || '').trim().length >= REASON_MIN)) w('on-hold settlement needs a reason');
      if (s.status !== 'on_hold' && s.hold) w('hold reason on a settlement that is not on hold');
      if (s.discrepancy && !(Number.isInteger(s.discrepancy.amount) && s.discrepancy.amount > 0 && String(s.discrepancy.reason || '').trim() && typeof s.discrepancy.reviewed === 'boolean')) w('invalid discrepancy');
      if (s.status === 'approved' && hasOpenDiscrepancy(s)) w('approved settlement has an open discrepancy');
    });
    return p;
  };
  const counts = (list) => { const c = { total: list.length }; Object.keys(STATUS).forEach((k) => { c[k] = 0; }); list.forEach((s) => { if (c[s.status] != null) c[s.status]++; }); return c; };
  const sumBy = (list, f) => list.filter(f).reduce((a, s) => a + s.amount, 0);
  /** total = settled + outstanding; onHold is a subset of outstanding. */
  const totals = (list) => {
    const total = sumBy(list, () => true), settled = sumBy(list, (s) => s.status === 'completed');
    const open = list.filter(hasOpenDiscrepancy);
    return { total, settled, outstanding: total - settled, onHold: sumBy(list, (s) => s.status === 'on_hold'),
      discrepancyCount: open.length, discrepancyAmount: open.reduce((a, s) => a + s.discrepancy.amount, 0) };
  };
  const byProvider = (list) => {
    const m = new Map();
    list.forEach((s) => { if (!m.has(s.providerId)) m.set(s.providerId, { providerId: s.providerId, provider: s.provider, categoryLabel: s.categoryLabel, items: [] }); m.get(s.providerId).items.push(s); });
    return Array.from(m.values()).map((g) => Object.assign({ providerId: g.providerId, provider: g.provider, categoryLabel: g.categoryLabel, count: g.items.length }, totals(g.items)));
  };
  const stamp = (at) => at || new Date().toISOString();
  const noteOf = (v) => String(v == null ? '' : v).trim().slice(0, REASON_MAX);
  /** Simulated status change. Immutable: returns { settlements, log }. Throws RangeError('Unknown settlement'|'Unknown status'|'Transition not allowed'|'Open discrepancy'|'Reason required'). */
  const transition = (list, entries, id, to, input, at) => {
    const s = list.find((x) => x.id === id);
    if (!s) throw new RangeError('Unknown settlement');
    if (!STATUS[to]) throw new RangeError('Unknown status');
    if (!canTransition(s.status, to)) throw new RangeError('Transition not allowed');
    if ((to === 'approved' || to === 'completed') && hasOpenDiscrepancy(s)) throw new RangeError('Open discrepancy');
    const note = noteOf(input && input.note);
    if (REASON_REQUIRED.indexOf(to) !== -1 && note.length < REASON_MIN) throw new RangeError('Reason required');
    const next = Object.assign({}, s, { status: to });
    if (to === 'on_hold') next.hold = { reason: note };
    else if (s.status === 'on_hold') next.hold = null;
    if (to === 'completed') next.settledOn = DEMO_TODAY;
    const entry = { at: stamp(at), settlementId: s.id, ref: s.ref, provider: s.provider, action: ACTION_LABEL[to], from: s.status, to, note, simulated: true };
    return { settlements: list.map((x) => (x.id === id ? next : x)), log: entries.concat([entry]) };
  };
  /** Simulated review of an open discrepancy (needs a written reason). Immutable. Throws 'Unknown settlement'|'No open discrepancy'|'Reason required'. */
  const reviewDiscrepancy = (list, entries, id, input, at) => {
    const s = list.find((x) => x.id === id);
    if (!s) throw new RangeError('Unknown settlement');
    if (!hasOpenDiscrepancy(s)) throw new RangeError('No open discrepancy');
    const note = noteOf(input && input.note);
    if (note.length < REASON_MIN) throw new RangeError('Reason required');
    const next = Object.assign({}, s, { discrepancy: Object.assign({}, s.discrepancy, { reviewed: true }) });
    const entry = { at: stamp(at), settlementId: s.id, ref: s.ref, provider: s.provider, action: 'مراجعة الاختلاف', from: s.status, to: s.status, note, simulated: true };
    return { settlements: list.map((x) => (x.id === id ? next : x)), log: entries.concat([entry]) };
  };

  /* ───── Grid view model ───── */
  const diffState = (s) => (!s.discrepancy ? 'none' : s.discrepancy.reviewed ? 'reviewed' : 'open');
  const DIFF_LABEL = { none: 'بلا اختلاف', open: 'اختلاف مفتوح', reviewed: 'اختلاف تمت مراجعته' };
  const attentionText = (s) => {
    const a = [];
    if (s.status === 'on_hold' && s.hold) a.push('معلّقة: ' + s.hold.reason);
    if (s.discrepancy) a.push(s.discrepancy.reviewed ? 'اختلاف تمت مراجعته' : 'اختلاف مفتوح (' + money(s.discrepancy.amount) + '): ' + s.discrepancy.reason);
    return a.length ? a.join(' — ') : '—';
  };
  const toRow = (s) => Object.assign({}, s, { periodText: dt(s.periodFrom) + ' — ' + dt(s.periodTo), dateKey: s.settledOn || s.dueOn, diffState: diffState(s), attention: attentionText(s) });
  const COLUMNS = [
    { key: 'ref', label: 'الرقم المرجعي (تجريبي)', html: (r) => `<span dir="ltr">${esc(r.ref)}</span>` },
    { key: 'provider', label: 'مقدم الخدمة (التصنيف)', format: (r) => r.provider + ' — ' + r.categoryLabel },
    { key: 'periodTo', label: 'فترة الاستحقاق', type: 'date', format: (r) => r.periodText },
    { key: 'amount', label: 'المبلغ', type: 'number', align: 'end', format: (r) => money(r.amount) },
    { key: 'status', label: 'الحالة', type: 'status', statusDomain: 'settlement' },
    { key: 'dateKey', label: 'تاريخ التسوية (تجريبي)', type: 'date', format: (r) => (r.status === 'completed' ? dt(r.settledOn) : 'متوقع ' + dt(r.dueOn)) },
    { key: 'attention', label: 'التعليق / الاختلاف', sortable: false }
  ];
  const FILTERS = [
    { key: 'status', label: 'الحالة', options: Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k].label })) },
    { key: 'categoryLabel', label: 'التصنيف' }, { key: 'provider', label: 'مقدم الخدمة' },
    { key: 'diffState', label: 'الاختلاف', options: Object.keys(DIFF_LABEL).map((k) => ({ value: k, label: DIFF_LABEL[k] })) }
  ];
  const GRID_CFG = { columns: COLUMNS, searchKeys: ['ref', 'provider', 'categoryLabel', 'attention'], filters: FILTERS };

  /* ───── Rendering ───── */
  const summaryHtml = () => {
    const t = totals(settlements), s = (l, v, cls) => `<div class="ord-stat ${cls || ''}"><span>${l}</span><b>${esc(v)}</b></div>`;
    return `<section class="ord-sum stl-sum" aria-label="ملخص المستحقات التجريبية">${s('إجمالي المستحقات (تجريبي)', money(t.total))}${s('مسوّاة (محاكاة)', money(t.settled))}${s('متبقية غير مسوّاة', money(t.outstanding))}${s('معلّقة', money(t.onHold))}${s('اختلافات مفتوحة', nf(t.discrepancyCount) + (t.discrepancyCount ? ' (' + money(t.discrepancyAmount) + ')' : ''))}</section>`;
  };
  const providersHtml = () => {
    const list = byProvider(settlements);
    return `<section class="dash-card" aria-labelledby="stl-h-prov"><h2 id="stl-h-prov">مستحقات مقدمي الخدمة <span class="dash-count">${nf(list.length)}</span></h2>
      ${list.length ? `<ul class="stl-prov">${list.map((p) => `<li><div><b>${esc(p.provider)}</b><small>${esc(p.categoryLabel)}</small></div>
        <dl class="fin-disc-v"><div><dt>إجمالي المستحق</dt><dd>${esc(money(p.total))}</dd></div><div><dt>مسوّاة (محاكاة)</dt><dd>${esc(money(p.settled))}</dd></div>
        <div><dt>متبقية</dt><dd>${esc(money(p.outstanding))}</dd></div><div><dt>معلّقة</dt><dd>${esc(money(p.onHold))}</dd></div></dl></li>`).join('')}</ul>`
        : '<p class="ord-muted">لا توجد مستحقات لعرضها.</p>'}</section>`;
  };
  const logHtml = () => `<section class="dash-card" aria-labelledby="stl-h-log"><h2 id="stl-h-log" tabindex="-1">سجل الإجراءات المحلي <span class="dash-count">${nf(log.length)}</span></h2>
    ${log.length ? `<ul class="ord-tl">${log.slice().reverse().slice(0, 10).map((a) => `<li><span><b>${esc(a.action)}</b> — <span dir="ltr">${esc(a.ref)}</span> — ${esc(a.provider)}<br>${a.from !== a.to ? esc((STATUS[a.from] || {}).label) + ' ← ' + esc((STATUS[a.to] || {}).label) : 'الحالة: ' + esc((STATUS[a.to] || {}).label)}${a.note ? '<br>الملاحظة: ' + esc(a.note) : ''}<br><em>محاكاة محلية — لم يتحرك أي مال</em></span><small>${esc(dt(a.at))}</small></li>`).join('')}</ul>`
      : '<p class="ord-muted">لا إجراءات بعد. كل إجراء محاكى يمر بتأكيد ويظهر هنا.</p>'}</section>`;
  const factsHtml = (s) => `<dl class="ord-facts">
    <div><dt>الرقم المرجعي (تجريبي)</dt><dd dir="ltr">${esc(s.ref)}</dd></div><div><dt>الحالة</dt><dd>${badge(s.status)}</dd></div>
    <div><dt>مقدم الخدمة</dt><dd>${esc(s.provider)}</dd></div><div><dt>التصنيف</dt><dd>${esc(s.categoryLabel)}</dd></div>
    <div><dt>المبلغ المستحق</dt><dd>${esc(money(s.amount))}</dd></div><div><dt>فترة الاستحقاق</dt><dd>${esc(dt(s.periodFrom))} — ${esc(dt(s.periodTo))}</dd></div>
    <div><dt>${s.status === 'completed' ? 'تاريخ التسوية (تجريبي)' : 'تاريخ التسوية المتوقع (تجريبي)'}</dt><dd>${esc(dt(s.settledOn || s.dueOn))}</dd></div></dl>`;
  const reasonsHtml = (s) => {
    const parts = [];
    if (s.status === 'on_hold' && s.hold) parts.push(`<p class="stl-why is-hold"><b>سبب التعليق:</b> ${esc(s.hold.reason)}</p>`);
    if (s.discrepancy) parts.push(`<p class="stl-why ${s.discrepancy.reviewed ? '' : 'is-diff'}"><b>${s.discrepancy.reviewed ? 'اختلاف تمت مراجعته (محاكاة):' : 'اختلاف مفتوح:'}</b> ${esc(s.discrepancy.reason)} — الفرق ${esc(money(s.discrepancy.amount))}.${s.discrepancy.reviewed ? '' : ' لا يمكن الاعتماد قبل مراجعته.'}</p>`);
    return parts.join('');
  };
  const detailHtml = (st, s) => {
    const acts = allowedActions(s), hist = log.filter((a) => a.settlementId === s.id);
    return `<div class="ord-dlg-in">
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">تفاصيل التسوية</h2><p><span dir="ltr">${esc(s.ref)}</span> — ${esc(s.provider)}</p></div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق التفاصيل">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>محاكاة محلية: لا يتم تحويل أي مبلغ لمقدم الخدمة، ولا يوجد اتصال بأي بوابة دفع. الإجراءات هنا تغيّر هذه الصفحة فقط.</span></p>
      <p class="stl-result" id="stl-result" role="status" tabindex="-1" ${st.msg ? '' : 'hidden'}>${esc(st.msg || '')}</p>
      ${factsHtml(s)}${reasonsHtml(s)}
      <section aria-labelledby="stl-h-act"><h3 id="stl-h-act">إجراءات محاكاة</h3>
        ${acts.length || hasOpenDiscrepancy(s) ? `<div class="ord-act">${acts.map((to) => `<button type="button" class="adm-btn ${to === 'completed' || to === 'approved' ? 'adm-btn-p' : ''}" data-stl-act="${to}">${esc(ACTION_LABEL[to])}</button>`).join('')}${hasOpenDiscrepancy(s) ? '<button type="button" class="adm-btn" data-stl-act="review">تعليم الاختلاف كمُراجَع (محاكاة)</button>' : ''}</div>`
          : '<p class="ord-muted">لا إجراءات متاحة: التسوية مكتملة (محاكاة) ولا يمكن تعديلها.</p>'}
        ${hasOpenDiscrepancy(s) && (FLOW[s.status] || []).some((t) => t === 'approved' || t === 'completed') ? '<p class="ord-muted">الاعتماد والتعليم كمكتملة غير متاحين قبل مراجعة الاختلاف.</p>' : ''}</section>
      <section aria-labelledby="stl-h-hist"><h3 id="stl-h-hist">سجل هذه التسوية (محلي)</h3>${hist.length ? `<ul class="ord-tl">${hist.slice().reverse().map((a) => `<li><span><b>${esc(a.action)}</b>${a.note ? ' — ' + esc(a.note) : ''}</span><small>${esc(dt(a.at))}</small></li>`).join('')}</ul>` : '<p class="ord-muted">لا إجراءات مسجلة لهذه التسوية.</p>'}</section>
      <div class="ord-act"><button type="button" class="adm-btn" data-ord-close>إغلاق</button></div></div>`;
  };
  const confirmHtml = (st, s) => {
    const isRev = st.action === 'review', need = isRev || REASON_REQUIRED.indexOf(st.action) !== -1;
    const title = isRev ? 'تأكيد مراجعة الاختلاف' : 'تأكيد: ' + ACTION_LABEL[st.action];
    return `<div class="ord-dlg-in">
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">${esc(title)}</h2><p><span dir="ltr">${esc(s.ref)}</span> — ${esc(s.provider)} — ${esc(money(s.amount))}</p></div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>${esc(isRev ? 'سيُعلَّم الاختلاف «تمت مراجعته» داخل هذه الصفحة فقط، دون أي أثر مالي.' : CONFIRM_NOTE[st.action])}</span></p>
      <div class="hs-grid-field"><label for="stl-note">${need ? 'السبب (مطلوب ويُسجَّل، ' + nf(REASON_MIN) + '–' + nf(REASON_MAX) + ' حرفًا)' : 'ملاحظة (اختيارية)'}</label><textarea id="stl-note" rows="2" maxlength="${REASON_MAX}">${esc(st.note || '')}</textarea></div>
      <p class="ord-err" id="ord-err" role="alert" hidden></p>
      <div class="ord-act"><button type="button" class="adm-btn adm-btn-p" data-stl-confirm>${esc(isRev ? 'تأكيد مراجعة الاختلاف (محاكاة محلية)' : CONFIRM_LABEL[st.action])}</button><button type="button" class="adm-btn" data-stl-back>رجوع</button></div></div>`;
  };

  const render = () => {
    const L = root.HSAdminLive && root.HSAdminLive.enabled() ? root.HSAdminLive : null;   /* server backend mode: provider balances from real transactions */
    if (L) settlements = L.rows('settlements', { CATS: FIN ? FIN.CATEGORIES : [] });
    const wrap = root.document.createElement('div'); wrap.className = 'ord stl';
    wrap.innerHTML = `<div class="fin-banner" role="note">${icon('info')}<span>بيانات تجريبية محلية — ليست مستحقات حقيقية. لا يتم تحويل أي مبلغ لأي مقدم خدمة، ولا توجد بوابة دفع. الأرقام الأولية مشتقة من لوحة الماليات (٣٠ يومًا) وتعديلاتك المحلية هنا لا تنعكس عليها. تاريخ العرض الثابت: ${esc(dt(DEMO_TODAY))}.</span></div>
      <div id="stl-sum"></div><div id="stl-prov"></div><div id="stl-grid"></div><div id="stl-log"></div><dialog class="ord-dlg" id="stl-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const dlgEl = wrap.querySelector('#stl-dlg');
    let st = null, grid = null;
    const paintSide = () => { wrap.querySelector('#stl-sum').innerHTML = summaryHtml(); wrap.querySelector('#stl-prov').innerHTML = providersHtml(); wrap.querySelector('#stl-log').innerHTML = logHtml(); };
    const rowsView = () => settlements.map(toRow);
    const current = () => (st ? settlements.find((x) => x.id === st.id) : null);
    const paintDlg = (sel) => {
      const s = current(); if (!st || !s) return;
      dlgEl.innerHTML = st.stage === 'confirm' ? confirmHtml(st, s) : detailHtml(st, s);
      const f = sel && dlgEl.querySelector(sel); if (f) f.focus();
    };
    paintSide();
    const openFor = (id) => { st = { id, stage: 'view', action: null, note: '', msg: '' }; paintDlg('[data-ord-close]'); d.open(); };
    grid = root.HSDataGrid.create(wrap.querySelector('#stl-grid'), Object.assign({}, GRID_CFG, {
      caption: 'التسويات التجريبية', pageSize: 10, rowId: (r) => r.id,
      rows: [], searchPlaceholder: 'ابحث بالرقم المرجعي أو مقدم الخدمة…',
      rowActions: [{ id: 'open', label: 'التفاصيل', onClick: (r) => openFor(r.id) }],
      emptyText: 'لا توجد تسويات.',
      onRetry: () => load()
    }));
    const load = () => { try { grid.setRows(rowsView()); } catch (e) { grid.setState('error', 'تعذر تحميل بيانات التسويات التجريبية.'); } };
    load();
    const d = root.HSDialog.attach(dlgEl, {
      closeSelector: '[data-ord-close]',
      fallbackFocus: () => (st && wrap.querySelector('tr[data-row="' + st.id + '"] [data-act="open"]')) || wrap.querySelector('.hs-grid-search input'),
      onClose: () => { st = null; }
    });
    const showErr = (m) => { const e = dlgEl.querySelector('#ord-err'); if (e) { e.textContent = m; e.hidden = !m; } };
    d.onClick((b) => {
      if (!st) return;
      if (b.hasAttribute('data-stl-act')) { st.action = b.getAttribute('data-stl-act'); st.stage = 'confirm'; st.note = ''; st.msg = ''; paintDlg('#stl-note'); }
      else if (b.hasAttribute('data-stl-back')) { st.stage = 'view'; st.action = null; paintDlg('[data-stl-act]'); }
      else if (b.hasAttribute('data-stl-confirm')) {
        st.note = dlgEl.querySelector('#stl-note').value;
        if (L) {
          if (st.action !== 'completed') { showErr(L.UNSUPPORTED); return; }
          L.status('settlements', st.id, 'completed').then((res) => {
            if (!res.ok) { showErr(L.errorText(res)); return; }
            settlements = L.rows('settlements', { CATS: FIN ? FIN.CATEGORIES : [] });
            st.msg = 'تم تسجيل تحصيل حصة المنصة على الخادم.'; st.stage = 'view'; st.action = null; st.id = 'stl:done:' + String(st.id).slice('stl:pending:'.length);
            grid.setRows(rowsView()); paintSide(); paintDlg('#stl-result');
          });
          return;
        }
        try {
          const r = st.action === 'review' ? reviewDiscrepancy(settlements, log, st.id, { note: st.note }) : transition(settlements, log, st.id, st.action, { note: st.note });
          settlements = r.settlements; log = r.log;
          st.msg = (st.action === 'review' ? 'سُجّلت مراجعة الاختلاف محليًا.' : 'سُجّل الإجراء «' + ACTION_LABEL[st.action] + '» محليًا.') + ' محاكاة فقط — لم يتحرك أي مال.';
          st.stage = 'view'; st.action = null; grid.setRows(rowsView()); paintSide(); paintDlg('#stl-result');
        } catch (err) {
          const m = err && err.message;
          if (m === 'Reason required') showErr('اكتب السبب (' + nf(REASON_MIN) + ' أحرف على الأقل) لتوثيقه.');
          else if (m === 'Transition not allowed') showErr('هذا الانتقال غير مسموح من الحالة الحالية.');
          else if (m === 'Open discrepancy') showErr('راجع الاختلاف المفتوح أولًا.');
          else { showErr('تعذر تنفيذ الإجراء المحاكى.'); }
        }
      }
    });
    return wrap;
  };

  const api = { STATUS, FLOW, ACTION_LABEL, DEMO_TODAY, REASON_MIN, REASON_MAX, GRID_CFG, COLUMNS, buildFixtures, validateSettlements, canTransition, allowedActions,
    hasOpenDiscrepancy, counts, totals, byProvider, transition, reviewDiscrepancy, toRow, resetState, _settlements: () => settlements, _log: () => log };
  root.HSAdminSettlementsPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('settlements', {
      title: 'التسويات',
      description: 'مستحقات مقدمي الخدمة وحالات التسوية مع محاكاة محلية للمراجعة والاعتماد — عرض تجريبي فقط، لا يتم تحويل أي أموال.',
      actions: [{ id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { resetState(); ctx.shell.refresh(); } }],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
