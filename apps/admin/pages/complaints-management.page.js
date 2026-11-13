/**
 * MODULE: complaints-management.page
 * RESPONSIBILITY: Admin complaints management — summary counts, searchable/filterable/sortable complaints grid, and a details dialog
 *   with the linked order, simulated classification/priority change, assignment to a fixed demo staff list, simulated status change
 *   limited to allowed moves, internal notes and a processing log of every local action.
 * STATUS: IMPLEMENTED (DEMO). 24 local fixtures with fake names/phones-free data; every change is in memory only and labelled as a
 *   local simulation (nothing is sent to the customer, the provider or any staff member).
 * Depends on: HSAdminShell, HSDataGrid, HSStatusBadge (registers «complaint» and «priority» domains here if absent), HSDialog.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(t); } catch (e) { return iso; } };

  const STATUS = {
    new: { label: 'جديدة', tone: 'info', icon: 'st-new' },
    review: { label: 'قيد المراجعة', tone: 'warning', icon: 'st-search' },
    resolved: { label: 'تم الحل', tone: 'success', icon: 'check' },
    dismissed: { label: 'مرفوضة', tone: 'neutral', icon: 'st-closed' }
  };
  const PRIORITY = {
    low: { label: 'منخفضة', tone: 'neutral' }, medium: { label: 'متوسطة', tone: 'info' },
    high: { label: 'مرتفعة', tone: 'warning', icon: 'warn' }, urgent: { label: 'عاجلة', tone: 'danger', icon: 'warn' }
  };
  const RANK = { low: 1, medium: 2, high: 3, urgent: 4 };
  const B = root.HSStatusBadge;
  if (B && B.domains().indexOf('complaint') === -1) B.register('complaint', STATUS);
  if (B && B.domains().indexOf('priority') === -1) B.register('priority', PRIORITY);
  const sBadge = (s) => (B ? B.render('complaint', s) : esc((STATUS[s] || {}).label || 'غير محدد'));
  const pBadge = (s) => (B ? B.render('priority', s) : esc((PRIORITY[s] || {}).label || 'غير محدد'));
  const NEXT = {
    new: [{ to: 'review', text: 'بدء المراجعة محليًا', cls: 'adm-btn-p' }, { to: 'dismissed', text: 'رفض الشكوى محليًا', cls: 'adm-btn-d' }],
    review: [{ to: 'resolved', text: 'تسجيل الحل محليًا', cls: 'adm-btn-p' }, { to: 'dismissed', text: 'رفض الشكوى محليًا', cls: 'adm-btn-d' }],
    resolved: [{ to: 'review', text: 'إعادة فتح محليًا', cls: 'adm-btn' }],
    dismissed: [{ to: 'review', text: 'إعادة فتح محليًا', cls: 'adm-btn' }]
  };
  const TYPES = ['تأخر في الوصول', 'جودة العمل', 'سلوك مقدم الخدمة', 'خلاف على السعر', 'عدم إتمام الخدمة', 'أخرى'];
  const STAFF = [{ id: 'u1', name: 'هالة مصطفى' }, { id: 'u2', name: 'ماجد سليم' }, { id: 'u3', name: 'نادين فؤاد' }, { id: 'u4', name: 'عاصم رشدي' }];
  const UNASSIGNED = 'غير معيّن';

  /* ───── Fixtures (demo) ───── */
  const CUST = ['أحمد إبراهيم', 'منى السيد', 'خالد محمود', 'سارة عادل', 'ياسر فتحي', 'هدى حسن'];
  const PROV = ['محمود السيد', 'سعيد فتحي', 'وليد حسن', 'كريم نبيل', 'أيمن رمضان'];
  const SUBJ = ['تأخر الفني عن الموعد', 'العمل لم يُنجز بالشكل المطلوب', 'أسلوب غير لائق أثناء الزيارة', 'السعر النهائي أعلى من المتفق عليه', 'الفني لم يحضر', 'استفسار عن استرداد'];
  const buildFixtures = () => {
    const pri = ['medium', 'high', 'low', 'urgent'], st = ['new', 'review', 'resolved', 'dismissed', 'new', 'review'];
    return Array.from({ length: 24 }, (_, i) => {
      const status = st[(i * 5) % st.length], created = '2026-10-' + String(1 + ((i * 3) % 27)).padStart(2, '0');
      const assignee = status === 'new' && i % 3 ? null : STAFF[i % STAFF.length].id;
      return {
        id: 'q' + (5001 + i), no: 5001 + i, subject: SUBJ[i % SUBJ.length], type: TYPES[i % TYPES.length], priority: pri[(i * 3) % pri.length], status,
        reporter: CUST[i % CUST.length], provider: PROV[(i * 2) % PROV.length], orderNo: 1001 + ((i * 7) % 30), created, assignee,
        text: 'نص الشكوى التجريبي رقم ' + nf(5001 + i) + ': ' + SUBJ[i % SUBJ.length] + '.',
        log: [{ kind: 'open', text: 'تم استلام الشكوى', at: created }]
      };
    });
  };

  let items = buildFixtures();
  let grid = null;
  const resetState = () => { items = buildFixtures(); };

  /* ───── Pure logic (unit-tested) ───── */
  const staffName = (id) => { const s = STAFF.find((x) => x.id === id); return s ? s.name : UNASSIGNED; };
  const isOpen = (c) => c.status === 'new' || c.status === 'review';
  const counts = (list) => ({
    total: list.length, new: list.filter((c) => c.status === 'new').length, review: list.filter((c) => c.status === 'review').length,
    hot: list.filter((c) => isOpen(c) && (c.priority === 'high' || c.priority === 'urgent')).length, resolved: list.filter((c) => c.status === 'resolved').length
  });
  const allowedNext = (s) => (NEXT[s] || []).map((x) => x.to);
  const get = (list, id) => { const c = list.find((x) => x.id === id); if (!c) throw new RangeError('Unknown complaint: ' + id); return c; };
  const patch = (list, id, fn) => list.map((x) => (x.id === id ? fn(x) : x));
  const entry = (kind, text, at) => ({ kind, text, at: at || new Date().toISOString() });
  const setStatus = (list, id, next, at) => {
    const c = get(list, id);
    if (!allowedNext(c.status).includes(next)) throw new RangeError('Transition not allowed: ' + c.status + ' → ' + next);
    return patch(list, id, (x) => Object.assign({}, x, { status: next, log: x.log.concat([entry('status', 'تغيير الحالة إلى «' + STATUS[next].label + '»', at)]) }));
  };
  /** Classification = complaint type + priority. No change → throws (no empty log entries). */
  const classify = (list, id, type, priority, at) => {
    const c = get(list, id);
    if (!TYPES.includes(type) || !PRIORITY[priority]) throw new RangeError('Invalid classification');
    if (c.type === type && c.priority === priority) throw new RangeError('No change');
    return patch(list, id, (x) => Object.assign({}, x, { type, priority, log: x.log.concat([entry('classify', 'تحديث التصنيف: «' + type + '» — الأولوية «' + PRIORITY[priority].label + '»', at)]) }));
  };
  /** staffId '' / null = unassign. */
  const assign = (list, id, staffId, at) => {
    const c = get(list, id), to = staffId || null;
    if (to && !STAFF.some((s) => s.id === to)) throw new RangeError('Unknown staff: ' + to);
    if ((c.assignee || null) === to) throw new RangeError('No change');
    return patch(list, id, (x) => Object.assign({}, x, { assignee: to, log: x.log.concat([entry('assign', to ? 'تعيين إلى ' + staffName(to) : 'إلغاء التعيين', at)]) }));
  };
  const addNote = (list, id, text, at) => {
    const t = String(text == null ? '' : text).trim();
    if (!t) throw new RangeError('Empty note');
    get(list, id);
    return patch(list, id, (x) => Object.assign({}, x, { log: x.log.concat([entry('note', t.slice(0, 500), at)]) }));
  };

  /* ───── Rendering ───── */
  const rows = () => items.map((c) => Object.assign({}, c, { assigneeName: staffName(c.assignee) }));
  const COLUMNS = [
    { key: 'no', label: 'رقم الشكوى', type: 'number', align: 'end', format: (r) => String(r.no) },
    { key: 'subject', label: 'الموضوع' },
    { key: 'type', label: 'التصنيف' },
    { key: 'priority', label: 'الأولوية', type: 'status', statusDomain: 'priority', sortValue: (r) => String(RANK[r.priority] || 0) },
    { key: 'assigneeName', label: 'المسؤول' },
    { key: 'created', label: 'التاريخ', type: 'date' },
    { key: 'status', label: 'الحالة', type: 'status', statusDomain: 'complaint' }
  ];
  const summaryHtml = () => {
    const c = counts(items); const s = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${nf(v)}</b></div>`;
    return `<section class="ord-sum" aria-label="ملخص الشكاوى">${s('الإجمالي', c.total)}${s('جديدة', c.new)}${s('قيد المراجعة', c.review)}${s('أولوية مرتفعة مفتوحة', c.hot)}${s('تم حلها', c.resolved)}</section>`;
  };
  const sel = (id, label, opts, cur) => `<div class="hs-grid-field"><label for="${id}">${label}</label><select id="${id}">${opts.map((o) => `<option value="${esc(o.v)}"${o.v === cur ? ' selected' : ''}>${esc(o.t)}</option>`).join('')}</select></div>`;
  const detailHtml = (c) => {
    const acts = NEXT[c.status] || [];
    return `<form method="dialog" class="ord-dlg-in">
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">شكوى #${esc(c.no)} — ${esc(c.subject)}</h2><p>${sBadge(c.status)} ${pBadge(c.priority)}</p></div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق التفاصيل">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>إجراءات تجريبية: التغييرات محلية في هذه الصفحة فقط ولا تصل إلى العميل ولا مقدم الخدمة ولا الموظف المعيّن.</span></p>
      <p>${esc(c.text)}</p>
      <dl class="ord-facts"><div><dt>مقدم الشكوى</dt><dd>${esc(c.reporter)}</dd></div><div><dt>مقدم الخدمة</dt><dd>${esc(c.provider)}</dd></div>
        <div><dt>الطلب المرتبط</dt><dd>#${esc(c.orderNo)}</dd></div><div><dt>تاريخ الشكوى</dt><dd>${esc(dt(c.created))}</dd></div>
        <div><dt>التصنيف</dt><dd>${esc(c.type)}</dd></div><div><dt>المسؤول</dt><dd>${esc(staffName(c.assignee))}</dd></div></dl>
      <section aria-labelledby="cmp-h-cl"><h3 id="cmp-h-cl">التصنيف والأولوية (محاكاة)</h3><div class="ord-act">
        ${sel('cmp-type', 'التصنيف', TYPES.map((t) => ({ v: t, t })), c.type)}${sel('cmp-pri', 'الأولوية', Object.keys(PRIORITY).map((k) => ({ v: k, t: PRIORITY[k].label })), c.priority)}
        <button type="button" class="adm-btn" data-cmp-classify>حفظ التصنيف محليًا</button></div></section>
      <section aria-labelledby="cmp-h-as"><h3 id="cmp-h-as">التعيين (محاكاة)</h3><div class="ord-act">
        ${sel('cmp-assignee', 'الموظف', [{ v: '', t: UNASSIGNED }].concat(STAFF.map((s) => ({ v: s.id, t: s.name }))), c.assignee || '')}
        <button type="button" class="adm-btn" data-cmp-assign>تعيين محليًا</button></div></section>
      <section aria-labelledby="ord-h-act"><h3 id="ord-h-act">الحالة (محاكاة)</h3>
        ${acts.length ? `<div class="ord-act">${acts.map((a) => `<button type="button" class="adm-btn ${a.cls}" data-ord-status="${a.to}">${a.text}</button>`).join('')}</div>` : ''}</section>
      <section aria-labelledby="ord-h-notes"><h3 id="ord-h-notes">سجل المعالجة والملاحظات</h3>
        <ul class="ord-tl">${c.log.slice().reverse().map((l) => `<li><span>${l.kind === 'note' ? 'ملاحظة: ' : ''}${esc(l.text)}</span><small>${esc(dt(l.at))}</small></li>`).join('')}</ul>
        <div class="ord-note"><div class="hs-grid-field"><label for="ord-note">إضافة ملاحظة داخلية</label><textarea id="ord-note" rows="2" maxlength="500"></textarea></div>
          <button type="button" class="adm-btn" data-ord-note>إضافة</button></div>
        <p class="ord-err" id="ord-err" role="alert" hidden></p></section></form>`;
  };

  const render = () => {
    const wrap = root.document.createElement('div'); wrap.className = 'ord';
    wrap.innerHTML = `<p class="dash-note">بيانات تجريبية محلية — ليست شكاوى حقيقية، وأي تغيير يُفقد عند إعادة التحميل.</p>
      <div id="ord-sum"></div><div id="ord-grid"></div><dialog class="ord-dlg" id="ord-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const sum = wrap.querySelector('#ord-sum'), dlgEl = wrap.querySelector('#ord-dlg');
    let openId = null;
    const paintSum = () => { sum.innerHTML = summaryHtml(); }; paintSum();
    grid = root.HSDataGrid.create(wrap.querySelector('#ord-grid'), {
      caption: 'قائمة الشكاوى', columns: COLUMNS, rows: rows(), pageSize: 10, rowId: (r) => r.id,
      searchKeys: ['no', 'subject', 'reporter', 'provider', 'type'],
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k].label })) },
        { key: 'priority', label: 'الأولوية', options: Object.keys(PRIORITY).map((k) => ({ value: k, label: PRIORITY[k].label })) }, { key: 'type', label: 'التصنيف' }, { key: 'assigneeName', label: 'المسؤول' }],
      rowActions: [{ id: 'details', label: 'التفاصيل', onClick: (r) => { openId = r.id; paintDlg(); d.open(); } }],
      emptyText: 'لا توجد شكاوى في البيانات التجريبية.', onRetry: () => grid.setRows(rows())
    });
    const sync = () => { grid.setRows(rows()); paintSum(); };
    const showErr = (m) => { const e = dlgEl.querySelector('#ord-err'); if (e) { e.textContent = m; e.hidden = !m; } };
    const paintDlg = (sel2) => { const c = items.find((x) => x.id === openId); if (!c) return; dlgEl.innerHTML = detailHtml(c); const f = sel2 && dlgEl.querySelector(sel2); if (f) f.focus(); };
    const d = root.HSDialog.attach(dlgEl, {
      closeSelector: '[data-ord-close]',
      fallbackFocus: () => wrap.querySelector('tr[data-row="' + openId + '"] [data-act="details"]') || wrap.querySelector('.hs-grid-search input'),
      onClose: () => { openId = null; }
    });
    d.onClick((b) => {
      const v = (s) => dlgEl.querySelector(s).value;
      try {
        if (b.dataset.ordStatus) { items = setStatus(items, openId, b.dataset.ordStatus); sync(); paintDlg('[data-ord-close]'); }
        else if (b.hasAttribute('data-cmp-classify')) { items = classify(items, openId, v('#cmp-type'), v('#cmp-pri')); sync(); paintDlg('#cmp-type'); }
        else if (b.hasAttribute('data-cmp-assign')) { items = assign(items, openId, v('#cmp-assignee')); sync(); paintDlg('#cmp-assignee'); }
        else if (b.hasAttribute('data-ord-note')) { items = addNote(items, openId, v('#ord-note')); sync(); paintDlg('#ord-note'); }
      } catch (err) { showErr(err.message === 'Empty note' ? 'اكتب نص الملاحظة أولًا.' : err.message === 'No change' ? 'لا يوجد تغيير لحفظه.' : 'تعذر تنفيذ الإجراء على هذه الشكوى.'); }
    });
    return wrap;
  };

  const api = { STATUS, PRIORITY, TYPES, STAFF, allowedNext, counts, setStatus, classify, assign, addNote, staffName, buildFixtures, resetState, _items: () => items };
  root.HSAdminComplaintsPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('complaints', {
      title: 'الشكاوى',
      description: 'قائمة الشكاوى والبلاغات بأولوياتها وحالاتها، مع البحث والتصفية وتجربة التصنيف والتعيين وتغيير الحالة محليًا وسجل المعالجة.',
      actions: [{ id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { resetState(); ctx.shell.refresh(); } }],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
