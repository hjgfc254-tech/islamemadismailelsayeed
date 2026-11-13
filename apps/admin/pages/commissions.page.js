/**
 * MODULE: commissions.page
 * RESPONSIBILITY: Admin commission rules — rates per category, effective dates, current effective rates, and a
 *   hypothetical impact preview before any change; every change is recorded in a local audit list with a written reason.
 * STATUS: IMPLEMENTED (DEMO). Rules and the 30-day sample volumes are local fixtures; nothing is read from or written to a
 *   backend, no rate is applied to a real order, and no money moves. The «today» used for rule status is a FIXED demo date.
 * Interactions: grid (status/scope filters), one dialog to create/edit a rule (validation, no overlapping enabled rules of the
 *   same scope), mandatory two-step save (review impact → confirm with a reason of 3–300 chars), local audit list, reset.
 * Depends on: HSAdminShell, HSDataGrid, HSStatusBadge (registers `commissionrule`), HSDialog, HSMoney, finance-dashboard.page
 *   (category list and 30-day sample volumes). No deletion of rules is offered.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const M = root.HSMoney || (typeof require === 'function' ? require('../../../shared/utils/money.js') : null);
  const FIN = root.HSAdminFinanceDashboardPage || (typeof require === 'function' ? require('./finance-dashboard.page.js') : null);
  const nf = (n) => M.number(n);
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeZone: 'UTC' }).format(t); } catch (e) { return iso; } };

  const DEMO_TODAY = '2026-11-09';
  const RATE_MAX = 30; // demo bound, not a business rule from the specification
  const REASON_MIN = 3, REASON_MAX = 300;
  const CATS = FIN ? FIN.CATEGORIES.map((c) => ({ id: c.id, label: c.label, gmv: c.gmv[30] })) : [];
  const SCOPES = [{ id: 'all', label: 'كل التصنيفات (افتراضية)' }].concat(CATS.map((c) => ({ id: c.id, label: c.label })));
  const scopeLabel = (id) => (SCOPES.find((s) => s.id === id) || {}).label || 'غير محدد';

  const STATUS = {
    active: { label: 'سارية', tone: 'success', icon: 'check' },
    scheduled: { label: 'مجدولة', tone: 'info', icon: 'st-quote' },
    expired: { label: 'منتهية', tone: 'neutral', icon: 'st-closed' },
    disabled: { label: 'موقوفة', tone: 'neutral', icon: 'st-closed' }
  };
  const B = root.HSStatusBadge;
  if (B && B.domains().indexOf('commissionrule') === -1) B.register('commissionrule', STATUS);
  const badge = (s) => (B ? B.render('commissionrule', s) : esc((STATUS[s] || {}).label || 'غير محدد'));

  const buildFixtures = () => ([
    { id: 'r1', name: 'العمولة الأساسية', category: 'all', rate: 10, from: '2026-01-01', to: null, enabled: true },
    { id: 'r2', name: 'عمولة الكهرباء', category: 'electric', rate: 12, from: '2026-03-01', to: null, enabled: true },
    { id: 'r3', name: 'عمولة السباكة', category: 'plumbing', rate: 12, from: '2026-03-01', to: '2026-11-30', enabled: true },
    { id: 'r4', name: 'السباكة — عرض الشتاء', category: 'plumbing', rate: 8, from: '2026-12-01', to: '2027-02-28', enabled: true },
    { id: 'r5', name: 'النجارة — الشريحة القديمة', category: 'carpentry', rate: 9, from: '2026-01-01', to: '2026-06-30', enabled: true },
    { id: 'r6', name: 'عمولة أخرى — موقوفة', category: 'other', rate: 11, from: '2026-05-01', to: null, enabled: false }
  ]);
  let rules = buildFixtures(), audit = [], createHook = null;
  const resetState = () => { rules = buildFixtures(); audit = []; };

  /* ───── Pure logic (unit-tested) ───── */
  const statusOf = (r, today) => {
    const t = today || DEMO_TODAY;
    if (!r.enabled) return 'disabled';
    if (r.from > t) return 'scheduled';
    if (r.to && r.to < t) return 'expired';
    return 'active';
  };
  const covers = (r, date) => r.enabled && r.from <= date && (!r.to || r.to >= date);
  /** Category-specific rule wins over the default («all») rule; null when nothing applies. */
  const effective = (list, cat, date) => {
    const own = list.find((r) => r.category === cat && covers(r, date));
    if (own) return own;
    return list.find((r) => r.category === 'all' && covers(r, date)) || null;
  };
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  const overlaps = (a, b) => a.from <= (b.to || '9999-12-31') && b.from <= (a.to || '9999-12-31');
  const validate = (list, d, ignoreId) => {
    const e = {};
    const name = String(d.name == null ? '' : d.name).trim();
    if (name.length < 3 || name.length > 60) e.name = 'اسم القاعدة من ٣ إلى ٦٠ حرفًا.';
    else if (list.some((r) => r.id !== ignoreId && r.name.trim().toLowerCase() === name.toLowerCase())) e.name = 'اسم القاعدة مستخدم من قبل.';
    if (!SCOPES.some((s) => s.id === d.category)) e.category = 'اختر نطاقًا من القائمة.';
    if (!M.isRate(d.rate, RATE_MAX)) e.rate = 'النسبة رقم بين ٠ و' + nf(RATE_MAX) + ' بحد أقصى منزلتين عشريتين (حد تجريبي).';
    if (!isDate(d.from)) e.from = 'أدخل تاريخ سريان صحيحًا.';
    if (d.to != null && d.to !== '') { if (!isDate(d.to)) e.to = 'تاريخ الانتهاء غير صحيح.'; else if (isDate(d.from) && d.to < d.from) e.to = 'تاريخ الانتهاء قبل تاريخ السريان.'; }
    if (!e.category && !e.from && !e.to && d.enabled) {
      const clash = list.find((r) => r.id !== ignoreId && r.enabled && r.category === d.category && overlaps(r, { from: d.from, to: d.to || null }));
      if (clash) e.from = 'تتداخل فترة السريان مع القاعدة المفعّلة «' + clash.name + '» لنفس النطاق.';
    }
    return e;
  };
  const clean = (d) => ({ name: String(d.name == null ? '' : d.name).trim(), category: d.category, rate: Number(d.rate), from: d.from, to: d.to ? d.to : null, enabled: !!d.enabled });
  const withDraft = (list, d, id) => (id ? list.map((r) => (r.id === id ? Object.assign({}, r, clean(d)) : r)) : list.concat([Object.assign({ id: '__new' }, clean(d))]));
  /** Hypothetical effect on the 30-day sample volumes, evaluated on the later of today and the rule's start date. */
  const impact = (list, d, id, today) => {
    const t = today || DEMO_TODAY, c = clean(d);
    const when = c.from > t ? c.from : t;
    const after = withDraft(list, d, id);
    const rows = CATS.map((cat) => {
      const b = effective(list, cat.id, when), a = effective(after, cat.id, when);
      const rb = b ? b.rate : 0, ra = a ? a.rate : 0;
      const cb = M.applyRate(cat.gmv, rb), ca = M.applyRate(cat.gmv, ra);
      return { id: cat.id, label: cat.label, gmv: cat.gmv, before: rb, after: ra, beforeRule: b ? b.name : null, afterRule: a ? a.name : null, commissionBefore: cb, commissionAfter: ca, delta: ca - cb };
    });
    const totalDelta = rows.reduce((s, r) => s + r.delta, 0);
    return { when, rows, totalDelta, commissionBefore: rows.reduce((s, r) => s + r.commissionBefore, 0), commissionAfter: rows.reduce((s, r) => s + r.commissionAfter, 0),
      hasEffect: rows.some((r) => r.before !== r.after) };
  };
  const FIELD = { name: 'الاسم', category: 'النطاق', rate: 'النسبة', from: 'تاريخ السريان', to: 'تاريخ الانتهاء', enabled: 'التفعيل' };
  const show = (k, v) => (k === 'category' ? scopeLabel(v) : k === 'rate' ? M.percent(v) : k === 'enabled' ? (v ? 'مفعّلة' : 'موقوفة') : (v == null || v === '' ? 'بلا' : v));
  const changesOf = (old, nw) => Object.keys(FIELD).filter((k) => (old ? old[k] : undefined) !== nw[k]).map((k) => FIELD[k] + ': ' + (old ? show(k, old[k]) + ' ← ' : '') + show(k, nw[k]));
  /** Save = validate + reason + audit entry. Returns new immutable lists. Throws RangeError('Validation'|'Reason required'|'No change'|'Unknown rule'). */
  const save = (list, log, d, id, reason, at) => {
    const why = String(reason == null ? '' : reason).trim();
    if (id && !list.some((r) => r.id === id)) throw new RangeError('Unknown rule');
    const errs = validate(list, d, id);
    if (Object.keys(errs).length) { const e = new RangeError('Validation'); e.errors = errs; throw e; }
    if (why.length < REASON_MIN) throw new RangeError('Reason required');
    const nw = clean(d), old = id ? list.find((r) => r.id === id) : null;
    const changes = changesOf(old, nw);
    if (id && !changes.length) throw new RangeError('No change');
    const newId = id || 'r' + (list.reduce((m, r) => Math.max(m, Number(String(r.id).slice(1)) || 0), 0) + 1);
    const next = id ? list.map((r) => (r.id === id ? Object.assign({}, r, nw) : r)) : list.concat([Object.assign({ id: newId }, nw)]);
    const entry = { at: at || new Date().toISOString(), ruleId: newId, ruleName: nw.name, action: id ? 'تعديل' : 'إنشاء', reason: why.slice(0, REASON_MAX), changes };
    return { rules: next, audit: log.concat([entry]), id: newId };
  };
  const counts = (list, today) => { const c = { total: list.length, active: 0, scheduled: 0, expired: 0, disabled: 0 }; list.forEach((r) => { c[statusOf(r, today)]++; }); return c; };
  const currentTable = (list, today) => CATS.map((cat) => { const r = effective(list, cat.id, today || DEMO_TODAY); return { id: cat.id, label: cat.label, rate: r ? r.rate : null, rule: r ? r.name : null, commission: r ? M.applyRate(cat.gmv, r.rate) : 0, gmv: cat.gmv }; });

  /* ───── Rendering ───── */
  const rowsView = () => rules.map((r) => Object.assign({}, r, { status: statusOf(r), scopeLabel: scopeLabel(r.category) }));
  const COLUMNS = [
    { key: 'name', label: 'القاعدة' }, { key: 'scopeLabel', label: 'النطاق' },
    { key: 'rate', label: 'النسبة', type: 'number', align: 'end', format: (r) => M.percent(r.rate) },
    { key: 'from', label: 'يسري من', type: 'date', format: (r) => dt(r.from) },
    { key: 'to', label: 'حتى', type: 'date', format: (r) => (r.to ? dt(r.to) : 'مفتوحة') },
    { key: 'status', label: 'الحالة', type: 'status', statusDomain: 'commissionrule' }
  ];
  const summaryHtml = () => { const c = counts(rules); const s = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${v}</b></div>`;
    return `<section class="ord-sum" aria-label="ملخص القواعد">${s('الإجمالي', nf(c.total))}${s('سارية', nf(c.active))}${s('مجدولة', nf(c.scheduled))}${s('منتهية', nf(c.expired))}${s('موقوفة', nf(c.disabled))}</section>`; };
  const currentHtml = () => `<section class="dash-card" aria-labelledby="cm-h-cur"><h2 id="cm-h-cur">العمولات السارية في تاريخ العرض (${esc(dt(DEMO_TODAY))})</h2>
    <p class="cm-cap">أثر افتراضي على حجم عيّنة 30 يومًا، وليس على طلبات فعلية.</p>
    <ul class="cm-cur">${currentTable(rules).map((r) => `<li><b>${esc(r.label)}</b><span>${r.rate == null ? 'لا توجد قاعدة سارية' : esc(M.percent(r.rate)) + ' — ' + esc(r.rule)}</span><span>${esc(M.format(r.commission))} من ${esc(M.format(r.gmv))}</span></li>`).join('')}</ul></section>`;
  const auditHtml = () => `<section class="dash-card" aria-labelledby="cm-h-aud"><h2 id="cm-h-aud" tabindex="-1">سجل التعديلات المحلي <span class="dash-count">${nf(audit.length)}</span></h2>
    ${audit.length ? `<ul class="ord-tl">${audit.slice().reverse().slice(0, 10).map((a) => `<li><span><b>${esc(a.action)}</b> — ${esc(a.ruleName)}<br>${a.changes.map(esc).join('؛ ')}<br>السبب: ${esc(a.reason)}</span><small>${esc(dt(a.at))}</small></li>`).join('')}</ul>`
      : '<p class="ord-muted">لا توجد تعديلات بعد. كل حفظ يتطلب سببًا مكتوبًا ويظهر هنا.</p>'}</section>`;
  const fieldErr = (e, k) => (e && e[k] ? `<small class="ord-err" id="cm-e-${k}">${esc(e[k])}</small>` : '');
  const formHtml = (st) => {
    const d = st.draft, e = st.errors || {}, isNew = !st.id;
    const inv = (k) => (e[k] ? ` aria-invalid="true" aria-describedby="cm-e-${k}"` : '');
    const hist = audit.filter((a) => a.ruleId === st.id);
    return `<form class="ord-dlg-in" novalidate data-cm-form>
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">${isNew ? 'إضافة قاعدة عمولة' : 'تعديل قاعدة العمولة'}</h2></div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>محاكاة محلية: لا تُطبَّق النسبة على أي طلب حقيقي. الحفظ يمر بمراجعة الأثر ثم تأكيد بسبب مكتوب.</span></p>
      <div class="hs-grid-field"><label for="cm-name">اسم القاعدة</label><input id="cm-name" value="${esc(d.name)}" maxlength="60" autocomplete="off"${inv('name')}>${fieldErr(e, 'name')}</div>
      <div class="hs-grid-field"><label for="cm-cat">النطاق</label><select id="cm-cat"${inv('category')}>${SCOPES.map((s) => `<option value="${esc(s.id)}" ${d.category === s.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>${fieldErr(e, 'category')}</div>
      <div class="hs-grid-field"><label for="cm-rate">النسبة ٪ (من ٠ إلى ${nf(RATE_MAX)})</label><input id="cm-rate" type="number" inputmode="decimal" step="0.01" min="0" max="${RATE_MAX}" value="${esc(d.rate)}"${inv('rate')}>${fieldErr(e, 'rate')}</div>
      <div class="hs-grid-field"><label for="cm-from">تاريخ السريان</label><input id="cm-from" type="date" value="${esc(d.from)}"${inv('from')}>${fieldErr(e, 'from')}</div>
      <div class="hs-grid-field"><label for="cm-to">تاريخ الانتهاء (اختياري)</label><input id="cm-to" type="date" value="${esc(d.to || '')}"${inv('to')}>${fieldErr(e, 'to')}</div>
      <label class="cm-chk"><input id="cm-en" type="checkbox" ${d.enabled ? 'checked' : ''}> <span>القاعدة مفعّلة</span></label>
      ${!isNew ? `<section aria-labelledby="cm-h-hist"><h3 id="cm-h-hist">سجل هذه القاعدة</h3>${hist.length ? `<ul class="ord-tl">${hist.slice().reverse().map((a) => `<li><span>${esc(a.action)}: ${a.changes.map(esc).join('؛ ')} — السبب: ${esc(a.reason)}</span><small>${esc(dt(a.at))}</small></li>`).join('')}</ul>` : '<p class="ord-muted">لا تعديلات مسجلة.</p>'}</section>` : ''}
      <div class="ord-act"><button type="submit" class="adm-btn adm-btn-p">مراجعة الأثر</button><button type="button" class="adm-btn" data-ord-close>إلغاء</button></div></form>`;
  };
  const reviewHtml = (st) => {
    const im = impact(rules, st.draft, st.id), why = st.reason || '';
    return `<form class="ord-dlg-in" novalidate data-cm-review>
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">مراجعة الأثر قبل الحفظ</h2><p>${esc(clean(st.draft).name)} — ${esc(M.percent(Number(st.draft.rate)))}</p></div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>أثر افتراضي على عيّنة 30 يومًا بتاريخ ${esc(dt(im.when))}. لا يغيّر أي طلب فعلي.</span></p>
      ${im.hasEffect ? '' : '<p class="ord-muted">لا يغيّر هذا التعديل النسب السارية في ذلك التاريخ.</p>'}
      <ul class="cm-cur">${im.rows.map((r) => `<li><b>${esc(r.label)}</b><span>${esc(M.percent(r.before))} ← ${esc(M.percent(r.after))}</span><span>${r.delta === 0 ? 'بلا تغيير' : (r.delta > 0 ? 'زيادة ' : 'نقص ') + esc(M.format(Math.abs(r.delta)))}</span></li>`).join('')}</ul>
      <p><b>الإجمالي:</b> ${im.totalDelta === 0 ? 'بلا تغيير' : (im.totalDelta > 0 ? 'زيادة ' : 'نقص ') + esc(M.format(Math.abs(im.totalDelta)))} من ${esc(M.format(im.commissionBefore))} إلى ${esc(M.format(im.commissionAfter))}</p>
      <div class="hs-grid-field"><label for="cm-reason">سبب التغيير (مطلوب ويُسجَّل، ${nf(REASON_MIN)}–${nf(REASON_MAX)} حرفًا)</label><textarea id="cm-reason" rows="2" maxlength="${REASON_MAX}">${esc(why)}</textarea></div>
      <p class="ord-err" id="ord-err" role="alert" hidden></p>
      <div class="ord-act"><button type="button" class="adm-btn adm-btn-p" data-cm-confirm>تأكيد الحفظ (محاكاة محلية)</button><button type="button" class="adm-btn" data-cm-back>رجوع للتعديل</button></div></form>`;
  };

  const render = () => {
    const wrap = root.document.createElement('div'); wrap.className = 'ord cm';
    wrap.innerHTML = `<p class="dash-note">بيانات تجريبية محلية — ليست قواعد عمولة حقيقية ولا تُطبَّق على أي طلب. تاريخ العرض الثابت: ${esc(dt(DEMO_TODAY))}.</p>
      <div id="cm-sum"></div><div id="cm-grid"></div><div id="cm-cur"></div><div id="cm-aud"></div><dialog class="ord-dlg" id="cm-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const dlgEl = wrap.querySelector('#cm-dlg');
    let st = null, grid = null;
    const paintSide = () => { wrap.querySelector('#cm-sum').innerHTML = summaryHtml(); wrap.querySelector('#cm-cur').innerHTML = currentHtml(); wrap.querySelector('#cm-aud').innerHTML = auditHtml(); };
    paintSide();
    const blank = () => ({ name: '', category: 'all', rate: 10, from: DEMO_TODAY, to: '', enabled: true });
    const paintDlg = (sel) => { if (!st) return; dlgEl.innerHTML = st.stage === 'review' ? reviewHtml(st) : formHtml(st); const f = sel && dlgEl.querySelector(sel); if (f) f.focus(); };
    const readDraft = () => ({ name: dlgEl.querySelector('#cm-name').value, category: dlgEl.querySelector('#cm-cat').value, rate: dlgEl.querySelector('#cm-rate').value === '' ? NaN : Number(dlgEl.querySelector('#cm-rate').value),
      from: dlgEl.querySelector('#cm-from').value, to: dlgEl.querySelector('#cm-to').value, enabled: dlgEl.querySelector('#cm-en').checked });
    const openFor = (id) => { const r = id && rules.find((x) => x.id === id); st = { id: id || null, stage: 'edit', draft: r ? { name: r.name, category: r.category, rate: r.rate, from: r.from, to: r.to || '', enabled: r.enabled } : blank(), errors: null, reason: '' }; paintDlg('#cm-name'); d.open(); };
    grid = root.HSDataGrid.create(wrap.querySelector('#cm-grid'), {
      caption: 'قواعد العمولة', columns: COLUMNS, rows: rowsView(), pageSize: 10, rowId: (r) => r.id, searchKeys: ['name', 'scopeLabel'],
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k].label })) }, { key: 'scopeLabel', label: 'النطاق' }],
      rowActions: [{ id: 'edit', label: 'تعديل', onClick: (r) => openFor(r.id) }],
      emptyText: 'لا توجد قواعد عمولة.', onRetry: () => grid.setRows(rowsView())
    });
    createHook = () => openFor(null);
    const d = root.HSDialog.attach(dlgEl, {
      closeSelector: '[data-ord-close]',
      fallbackFocus: () => (st && st.id && wrap.querySelector('tr[data-row="' + st.id + '"] [data-act="edit"]')) || wrap.querySelector('.hs-grid-search input'),
      onClose: () => { st = null; }
    });
    const showErr = (m) => { const e = dlgEl.querySelector('#ord-err'); if (e) { e.textContent = m; e.hidden = !m; } };
    dlgEl.addEventListener('submit', (e) => {
      e.preventDefault(); if (!st || st.stage !== 'edit') return;
      st.draft = readDraft(); const errs = validate(rules, st.draft, st.id);
      if (Object.keys(errs).length) { st.errors = errs; paintDlg('[aria-invalid="true"]'); return; }
      st.errors = null; st.stage = 'review'; paintDlg('#cm-reason');
    });
    d.onClick((b) => {
      if (!st) return;
      if (b.hasAttribute('data-cm-back')) { st.reason = dlgEl.querySelector('#cm-reason').value; st.stage = 'edit'; paintDlg('#cm-name'); }
      else if (b.hasAttribute('data-cm-confirm')) {
        const reason = dlgEl.querySelector('#cm-reason').value; st.reason = reason;
        try {
          const r = save(rules, audit, st.draft, st.id, reason); rules = r.rules; audit = r.audit;
          grid.setRows(rowsView()); paintSide(); d.close();
        } catch (err) {
          if (err.message === 'Reason required') { paintDlg('#cm-reason'); showErr('اكتب سبب التغيير (' + nf(REASON_MIN) + ' أحرف على الأقل) لتوثيقه.'); }
          else if (err.message === 'No change') showErr('لا يوجد تغيير لحفظه.');
          else if (err.message === 'Validation') { st.errors = err.errors; st.stage = 'edit'; paintDlg('[aria-invalid="true"]'); }
          else showErr('تعذر حفظ القاعدة.');
        }
      }
    });
    return wrap;
  };

  const api = { STATUS, DEMO_TODAY, RATE_MAX, REASON_MIN, SCOPES, buildFixtures, statusOf, effective, validate, impact, save, counts, currentTable, resetState,
    _rules: () => rules, _audit: () => audit };
  root.HSAdminCommissionsPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('commissions', {
      title: 'العمولات',
      description: 'قواعد العمولة وتواريخ سريانها والعمولات السارية، مع معاينة الأثر الافتراضي وسجل تعديلات محلي — عرض تجريبي فقط.',
      actions: [
        { id: 'add', label: 'إضافة قاعدة', kind: 'primary', onClick: () => { if (createHook) createHook(); } },
        { id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { resetState(); ctx.shell.refresh(); } }
      ],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
