/**
 * MODULE: services-management.page
 * RESPONSIBILITY: Admin services management — summary counts, searchable/filterable/sortable services grid, and one dialog
 *   used to create a service or edit/preview an existing one (validated form, simulated publish/deactivate, display order).
 * STATUS: IMPLEMENTED (DEMO). 20 local fixtures; every change is in memory only and labelled as a local simulation
 *   (nothing is saved, published to customers/providers or written to a catalog).
 * Depends on: HSAdminShell, HSDataGrid, HSStatusBadge (registers the «service» status domain here if absent), HSDialog.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();

  const STATUS = {
    draft: { label: 'مسودة', tone: 'neutral', icon: 'st-closed' },
    active: { label: 'منشورة', tone: 'success', icon: 'check' },
    inactive: { label: 'متوقفة', tone: 'warning', icon: 'warn' }
  };
  const B = root.HSStatusBadge;
  if (B && B.domains().indexOf('service') === -1) B.register('service', STATUS);
  const label = (s) => (B && B.known('service', s) ? B.label('service', s) : (STATUS[s] ? STATUS[s].label : 'غير محدد'));
  const badge = (s) => (B ? B.render('service', s) : esc(label(s)));

  const CATEGORIES = ['كهرباء', 'سباكة', 'نجارة', 'تكييف', 'دهانات'];
  const LIMITS = { name: 60, description: 200 };
  const NEXT = {
    draft: [{ to: 'active', text: 'نشر الخدمة محليًا', cls: 'adm-btn-p' }],
    active: [{ to: 'inactive', text: 'إيقاف الخدمة محليًا', cls: 'adm-btn-d' }],
    inactive: [{ to: 'active', text: 'إعادة التفعيل محليًا', cls: 'adm-btn-p' }]
  };

  /* ───── Fixtures (demo) ───── */
  const BASE = {
    'كهرباء': ['إصلاح أعطال الكهرباء', 'تركيب لمبات وإنارة', 'تمديد خطوط كهرباء', 'تركيب مراوح سقف'],
    'سباكة': ['إصلاح تسريب مياه', 'تركيب خلاط', 'فتح سدد المجاري', 'تركيب سخان مياه'],
    'نجارة': ['تركيب باب', 'إصلاح دولاب', 'تفصيل مطبخ', 'تركيب أرفف'],
    'تكييف': ['صيانة تكييف', 'تركيب تكييف', 'شحن فريون', 'تنظيف وحدة التكييف'],
    'دهانات': ['دهان غرفة', 'دهان واجهة', 'معالجة رطوبة الجدران', 'تركيب ورق حائط']
  };
  const buildFixtures = () => {
    const out = []; let i = 0;
    CATEGORIES.forEach((c) => BASE[c].forEach((n, k) => {
      i++;
      const status = i % 10 === 0 ? 'draft' : (i % 7 === 0 ? 'inactive' : 'active');
      out.push({ id: 's' + (4000 + i), name: n, category: c, description: 'وصف مختصر لخدمة «' + n + '» (بيانات تجريبية).', status, order: i, orders: status === 'draft' ? 0 : 5 + ((i * 13) % 80) });
    }));
    return out;
  };

  let services = buildFixtures();
  let grid = null, createHook = null;
  const resetState = () => { services = buildFixtures(); };

  /* ───── Pure logic (unit-tested) ───── */
  const sorted = (list) => list.slice().sort((a, b) => a.order - b.order);
  const renumber = (list) => sorted(list).map((s, i) => Object.assign({}, s, { order: i + 1 }));
  const counts = (list) => ({
    total: list.length,
    active: list.filter((s) => s.status === 'active').length,
    draft: list.filter((s) => s.status === 'draft').length,
    inactive: list.filter((s) => s.status === 'inactive').length,
    categories: new Set(list.map((s) => s.category)).size
  });
  const clean = (f) => ({ name: String((f && f.name) == null ? '' : f.name).replace(/\s+/g, ' ').trim(), category: String((f && f.category) == null ? '' : f.category), description: String((f && f.description) == null ? '' : f.description).trim() });
  /** Returns { ok, errors: {name?, category?, description?}, value } — name must be unique (Arabic-insensitive to spacing/case). */
  const validate = (fields, list, selfId) => {
    const v = clean(fields), errors = {};
    if (!v.name) errors.name = 'اكتب اسم الخدمة.';
    else if (v.name.length < 2) errors.name = 'اسم الخدمة قصير جدًا.';
    else if (v.name.length > LIMITS.name) errors.name = 'اسم الخدمة أطول من ' + nf(LIMITS.name) + ' حرفًا.';
    else if (list.some((s) => s.id !== selfId && norm(s.name) === norm(v.name))) errors.name = 'يوجد خدمة بنفس الاسم.';
    if (!CATEGORIES.includes(v.category)) errors.category = 'اختر تصنيفًا من القائمة.';
    if (v.description.length > LIMITS.description) errors.description = 'الوصف أطول من ' + nf(LIMITS.description) + ' حرفًا.';
    return { ok: Object.keys(errors).length === 0, errors, value: v };
  };
  const nextId = (list) => 's' + (Math.max(4000, ...list.map((s) => Number(String(s.id).slice(1)) || 0)) + 1);
  const createService = (list, fields) => {
    const r = validate(fields, list); if (!r.ok) { const e = new RangeError('Invalid service'); e.errors = r.errors; throw e; }
    return list.concat([Object.assign({ id: nextId(list), status: 'draft', order: list.length + 1, orders: 0 }, r.value)]);
  };
  const updateService = (list, id, fields) => {
    if (!list.some((s) => s.id === id)) throw new RangeError('Unknown service: ' + id);
    const r = validate(fields, list, id); if (!r.ok) { const e = new RangeError('Invalid service'); e.errors = r.errors; throw e; }
    return list.map((s) => (s.id === id ? Object.assign({}, s, r.value) : s));
  };
  const allowedNext = (s) => (NEXT[s] || []).map((x) => x.to);
  const setStatus = (list, id, next) => {
    const s = list.find((x) => x.id === id);
    if (!s) throw new RangeError('Unknown service: ' + id);
    if (!allowedNext(s.status).includes(next)) throw new RangeError('Transition not allowed: ' + s.status + ' → ' + next);
    return list.map((x) => (x.id === id ? Object.assign({}, x, { status: next }) : x));
  };
  /** dir: -1 = earlier in display order, +1 = later. Swaps with the neighbour; at an end it throws. */
  const move = (list, id, dir) => {
    const l = renumber(list), i = l.findIndex((s) => s.id === id), j = i + (dir < 0 ? -1 : 1);
    if (i < 0) throw new RangeError('Unknown service: ' + id);
    if (j < 0 || j >= l.length) throw new RangeError('Already at the end');
    const a = l[i].order; l[i] = Object.assign({}, l[i], { order: l[j].order }); l[j] = Object.assign({}, l[j], { order: a });
    return l;
  };

  /* ───── Rendering ───── */
  const COLUMNS = [
    { key: 'order', label: 'الترتيب', type: 'number', align: 'end' },
    { key: 'name', label: 'الخدمة' },
    { key: 'category', label: 'التصنيف' },
    { key: 'orders', label: 'الطلبات', type: 'number', align: 'end' },
    { key: 'status', label: 'الحالة', type: 'status', statusDomain: 'service' }
  ];
  const summaryHtml = () => {
    const c = counts(services); const s = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${nf(v)}</b></div>`;
    return `<section class="ord-sum" aria-label="ملخص الخدمات">${s('الإجمالي', c.total)}${s('منشورة', c.active)}${s('مسودات', c.draft)}${s('متوقفة', c.inactive)}${s('التصنيفات', c.categories)}</section>`;
  };
  const fieldErr = (errs, k) => (errs && errs[k] ? `<small class="ord-err" id="svc-e-${k}" role="alert">${esc(errs[k])}</small>` : '');
  const formHtml = (s, st) => {
    const v = st.values || s || { name: '', category: '', description: '' }, errs = st.errors || {};
    const inv = (k) => (errs[k] ? ` aria-invalid="true" aria-describedby="svc-e-${k}"` : '');
    return `<div class="hs-grid-field"><label for="svc-name">اسم الخدمة</label><input id="svc-name" type="text" maxlength="${LIMITS.name + 20}" value="${esc(v.name)}" required${inv('name')}>${fieldErr(errs, 'name')}</div>
      <div class="hs-grid-field"><label for="svc-cat">التصنيف</label><select id="svc-cat" required${inv('category')}><option value="">اختر التصنيف</option>${CATEGORIES.map((c) => `<option value="${esc(c)}"${v.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>${fieldErr(errs, 'category')}</div>
      <div class="hs-grid-field"><label for="svc-desc">وصف مختصر</label><textarea id="svc-desc" rows="3" maxlength="${LIMITS.description + 50}"${inv('description')}>${esc(v.description)}</textarea>${fieldErr(errs, 'description')}</div>`;
  };
  const dialogHtml = (s, st) => {
    const creating = !s, acts = s ? (NEXT[s.status] || []) : [], l = sorted(services), idx = s ? l.findIndex((x) => x.id === s.id) : -1;
    return `<form class="ord-dlg-in" novalidate>
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">${creating ? 'إضافة خدمة' : esc(s.name)}</h2>${creating ? '' : `<p>${badge(s.status)}</p>`}</div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>إجراءات تجريبية: التغييرات محلية في هذه الصفحة فقط ولا تظهر للعملاء ولا للمزودين.</span></p>
      ${st.message ? `<p class="ord-muted" role="status">${esc(st.message)}</p>` : ''}
      <section aria-labelledby="ord-h-form"><h3 id="ord-h-form">${creating ? 'بيانات الخدمة' : 'تعديل البيانات'}</h3>${formHtml(s, st)}
        <p><button type="button" class="adm-btn adm-btn-p" data-svc-save>${creating ? 'إضافة كمسودة' : 'حفظ التعديلات محليًا'}</button></p></section>
      ${creating ? '' : `<section aria-labelledby="ord-h-act"><h3 id="ord-h-act">النشر (محاكاة)</h3><div class="ord-act">${acts.map((a) => `<button type="button" class="adm-btn ${a.cls}" data-ord-status="${a.to}">${a.text}</button>`).join('')}</div></section>
      <section aria-labelledby="ord-h-ord"><h3 id="ord-h-ord">ترتيب الظهور</h3><p class="ord-muted">الموضع ${nf(idx + 1)} من ${nf(l.length)}.</p>
        <div class="ord-act">${idx > 0 ? '<button type="button" class="adm-btn" data-svc-move="-1">تقديم في الترتيب</button>' : ''}${idx < l.length - 1 ? '<button type="button" class="adm-btn" data-svc-move="1">تأخير في الترتيب</button>' : ''}</div></section>`}</form>`;
  };

  const render = () => {
    const wrap = root.document.createElement('div');
    wrap.className = 'ord';
    wrap.innerHTML = `<p class="dash-note">بيانات تجريبية محلية — ليست كتالوج الخدمات الفعلي، وأي تغيير يُفقد عند إعادة التحميل.</p>
      <div id="ord-sum"></div><div id="ord-grid"></div><dialog class="ord-dlg" id="ord-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const sum = wrap.querySelector('#ord-sum'), dlgEl = wrap.querySelector('#ord-dlg');
    let openId = null, st = {};
    const paintSum = () => { sum.innerHTML = summaryHtml(); };
    paintSum();
    const view = () => sorted(services);
    grid = root.HSDataGrid.create(wrap.querySelector('#ord-grid'), {
      caption: 'قائمة الخدمات', columns: COLUMNS, rows: view(), pageSize: 10, rowId: (r) => r.id,
      searchKeys: ['name', 'category', 'description'],
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k].label })) }, { key: 'category', label: 'التصنيف' }],
      rowActions: [{ id: 'details', label: 'فتح', onClick: (r) => { openId = r.id; st = {}; paintDlg(); d.open(); } }],
      emptyText: 'لا توجد خدمات في البيانات التجريبية.', onRetry: () => grid.setRows(view())
    });
    const sync = () => { grid.setRows(view()); paintSum(); };
    const paintDlg = (sel) => {
      const s = openId ? services.find((x) => x.id === openId) : null; if (openId && !s) return;
      dlgEl.innerHTML = dialogHtml(s, st); const f = sel && dlgEl.querySelector(sel); if (f) f.focus();
    };
    const read = () => ({ name: dlgEl.querySelector('#svc-name').value, category: dlgEl.querySelector('#svc-cat').value, description: dlgEl.querySelector('#svc-desc').value });
    const d = root.HSDialog.attach(dlgEl, {
      closeSelector: '[data-ord-close]',
      fallbackFocus: () => wrap.querySelector('tr[data-row="' + openId + '"] [data-act="details"]') || wrap.querySelector('.hs-grid-search input'),
      onClose: () => { openId = null; st = {}; }
    });
    createHook = () => { openId = null; st = {}; paintDlg(); d.open(root.document.activeElement); const f = dlgEl.querySelector('#svc-name'); if (f) f.focus(); };
    const save = () => {
      const values = read();
      try {
        if (openId) { services = updateService(services, openId, values); st = { message: 'تم حفظ التعديلات محليًا.' }; sync(); paintDlg('#svc-name'); }
        else { services = createService(services, values); openId = services[services.length - 1].id; st = { message: 'أُضيفت الخدمة كمسودة محلية.' }; sync(); paintDlg('[data-ord-close]'); }
      } catch (err) {
        if (!err.errors) { st = { values, errors: {}, message: 'تعذر تنفيذ الإجراء.' }; paintDlg(); return; }
        st = { values, errors: err.errors }; paintDlg(); const k = Object.keys(err.errors)[0]; const f = dlgEl.querySelector({ name: '#svc-name', category: '#svc-cat', description: '#svc-desc' }[k]); if (f) f.focus();
      }
    };
    dlgEl.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    d.onClick((b) => {
      try {
        if (b.hasAttribute('data-svc-save')) save();
        else if (b.dataset.ordStatus) { services = setStatus(services, openId, b.dataset.ordStatus); st = {}; sync(); paintDlg('[data-ord-close]'); }
        else if (b.dataset.svcMove) { services = move(services, openId, Number(b.dataset.svcMove)); st = { message: 'تم تغيير الترتيب محليًا.' }; sync(); paintDlg('[data-ord-close]'); }
      } catch (err) { st = { message: 'تعذر تنفيذ الإجراء على هذه الخدمة.' }; paintDlg(); }
    });
    return wrap;
  };

  const api = { STATUS, CATEGORIES, LIMITS, allowedNext, counts, validate, createService, updateService, setStatus, move, sorted, buildFixtures, resetState, _services: () => services };
  root.HSAdminServicesPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('services', {
      title: 'الخدمات',
      description: 'قائمة الخدمات وحالتها وترتيب ظهورها، مع إضافة وتعديل ونشر وإيقاف تجريبي محلي.',
      actions: [
        { id: 'create', label: 'إضافة خدمة', kind: 'primary', onClick: () => { if (createHook) createHook(); } },
        { id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { resetState(); ctx.shell.refresh(); } }
      ],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
