/**
 * MODULE: workforce.page
 * RESPONSIBILITY: Admin workforce management — summary counts, searchable/filterable/sortable employees grid, and one dialog to add+invite an
 *   employee (simulated) or edit one: name, email, department, role, simulated invitation resend, simulated activate/disable, and a per-employee
 *   log of every local action.
 * STATUS: IMPLEMENTED (DEMO). 12 local fixtures (fake names, @example.test emails), in memory only. NO REAL ACCESS CONTROL: changing a role or
 *   status here grants/removes nothing, and no invitation is ever sent. Department and role lists are fixed local lists (the departments/roles
 *   pages are not implemented yet). Demo guard: the last ACTIVE owner cannot be disabled or moved to another role (avoids a lock-out in the demo).
 * Depends on: HSAdminShell, HSDataGrid, HSStatusBadge (registers the «employee» domain here if absent), HSDialog.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(t); } catch (e) { return iso; } };
  const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();

  const STATUS = { invited: { label: 'دعوة معلّقة', tone: 'info', icon: 'st-new' }, active: { label: 'مفعّل', tone: 'success', icon: 'check' }, disabled: { label: 'معطّل', tone: 'warning', icon: 'warn' } };
  const B = root.HSStatusBadge;
  if (B && B.domains().indexOf('employee') === -1) B.register('employee', STATUS);
  const badge = (s) => (B ? B.render('employee', s) : esc((STATUS[s] || {}).label || 'غير محدد'));
  const DEPARTMENTS = { ops: 'العمليات', support: 'الدعم', finance: 'المالية', content: 'المحتوى', exec: 'الإدارة العليا' };
  const ROLES = { owner: 'المالك', admin: 'مدير', support: 'دعم فني', finance: 'مالية', moderator: 'مراقب محتوى' };
  const NEXT = {
    invited: [{ to: 'active', text: 'تأكيد قبول الدعوة (محاكاة)', cls: 'adm-btn-p' }],
    active: [{ to: 'disabled', text: 'تعطيل الحساب محليًا', cls: 'adm-btn-d' }],
    disabled: [{ to: 'active', text: 'إعادة تفعيل الحساب محليًا', cls: 'adm-btn-p' }]
  };
  const LIMITS = { name: 60, email: 80 };

  /* ───── Fixtures (demo) ───── */
  const NAMES = ['سامي عبد الله', 'ريم حامد', 'طارق منصور', 'دينا يوسف', 'عمر شاكر', 'لمى ناصر', 'بسام قاسم', 'نهى فؤاد', 'زياد حمدي', 'مروة سعد', 'إياد رفعت', 'ليلى جابر'];
  const buildFixtures = () => {
    const spec = [['exec', 'owner', 'active'], ['ops', 'admin', 'active'], ['support', 'support', 'active'], ['finance', 'finance', 'active'], ['content', 'moderator', 'active'], ['support', 'support', 'invited'],
      ['ops', 'admin', 'disabled'], ['finance', 'finance', 'invited'], ['content', 'moderator', 'active'], ['support', 'support', 'disabled'], ['ops', 'support', 'active'], ['exec', 'admin', 'active']];
    return spec.map(([department, role, status], i) => ({
      id: 'e' + (9001 + i), name: NAMES[i], email: 'staff' + String(i + 1).padStart(2, '0') + '@example.test', department, role, status, created: '2026-0' + (1 + (i % 9)) + '-' + String(2 + ((i * 3) % 26)).padStart(2, '0'),
      log: [{ kind: 'create', text: status === 'invited' ? 'تمت إضافة الموظف ودعوته (بيانات تجريبية)' : 'تمت إضافة الموظف (بيانات تجريبية)', at: '2026-0' + (1 + (i % 9)) + '-' + String(2 + ((i * 3) % 26)).padStart(2, '0') }]
    }));
  };

  let staff = buildFixtures();
  let grid = null, createHook = null;
  const resetState = () => { staff = buildFixtures(); };

  /* ───── Pure logic (unit-tested) ───── */
  const counts = (list) => ({ total: list.length, active: list.filter((e) => e.status === 'active').length, invited: list.filter((e) => e.status === 'invited').length, disabled: list.filter((e) => e.status === 'disabled').length, departments: new Set(list.map((e) => e.department)).size });
  const isLastActiveOwner = (list, id) => { const a = list.filter((e) => e.role === 'owner' && e.status === 'active'); return a.length === 1 && a[0].id === id; };
  const clean = (f) => { const g = (k) => String((f && f[k]) == null ? '' : f[k]); return { name: g('name').replace(/\s+/g, ' ').trim(), email: g('email').trim().toLowerCase(), department: g('department'), role: g('role') }; };
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const validate = (fields, list, selfId) => {
    const v = clean(fields), errors = {};
    if (!v.name) errors.name = 'اكتب اسم الموظف.'; else if (v.name.length < 2) errors.name = 'الاسم قصير جدًا.'; else if (v.name.length > LIMITS.name) errors.name = 'الاسم أطول من ' + nf(LIMITS.name) + ' حرفًا.';
    if (!v.email) errors.email = 'اكتب البريد الإلكتروني.'; else if (v.email.length > LIMITS.email || !EMAIL.test(v.email)) errors.email = 'اكتب بريدًا إلكترونيًا صحيحًا.';
    else if (list.some((e) => e.id !== selfId && e.email === v.email)) errors.email = 'هذا البريد مستخدم لموظف آخر.';
    if (!DEPARTMENTS[v.department]) errors.department = 'اختر إدارة من القائمة.';
    if (!ROLES[v.role]) errors.role = 'اختر دورًا من القائمة.';
    else if (selfId && v.role !== 'owner' && isLastActiveOwner(list, selfId)) errors.role = 'لا يمكن تغيير دور آخر مالك مفعّل (قاعدة تجريبية).';
    return { ok: !Object.keys(errors).length, errors, value: v };
  };
  const fail = (errors) => { const e = new RangeError('Invalid employee'); e.errors = errors; return e; };
  const entry = (kind, text, at) => ({ kind, text, at: at || new Date().toISOString() });
  const nextId = (list) => 'e' + (Math.max(9000, ...list.map((e) => Number(String(e.id).slice(1)) || 0)) + 1);
  const createEmployee = (list, fields, at) => {
    const r = validate(fields, list); if (!r.ok) throw fail(r.errors);
    return list.concat([Object.assign({ id: nextId(list), status: 'invited', created: (at || new Date().toISOString()).slice(0, 10), log: [entry('create', 'تمت إضافة الموظف ودعوته محليًا (لم تُرسل دعوة فعلية)', at)] }, r.value)]);
  };
  const updateEmployee = (list, id, fields, at) => {
    const cur = list.find((e) => e.id === id); if (!cur) throw new RangeError('Unknown employee: ' + id);
    const r = validate(fields, list, id); if (!r.ok) throw fail(r.errors);
    const ch = []; if (cur.department !== r.value.department) ch.push('الإدارة: «' + DEPARTMENTS[r.value.department] + '»'); if (cur.role !== r.value.role) ch.push('الدور: «' + ROLES[r.value.role] + '»');
    if (cur.name !== r.value.name || cur.email !== r.value.email) ch.push('بيانات الاسم/البريد');
    if (!ch.length) throw new RangeError('No change');
    return list.map((e) => (e.id === id ? Object.assign({}, e, r.value, { log: e.log.concat([entry('profile', 'تحديث محلي — ' + ch.join('، '), at)]) }) : e));
  };
  const allowedNext = (s) => (NEXT[s] || []).map((x) => x.to);
  const setStatus = (list, id, next, at) => {
    const e = list.find((x) => x.id === id); if (!e) throw new RangeError('Unknown employee: ' + id);
    if (!allowedNext(e.status).includes(next)) throw new RangeError('Transition not allowed: ' + e.status + ' → ' + next);
    if (next === 'disabled' && isLastActiveOwner(list, id)) throw new RangeError('Last owner');
    return list.map((x) => (x.id === id ? Object.assign({}, x, { status: next, log: x.log.concat([entry('status', 'تغيير حالة الحساب إلى «' + STATUS[next].label + '» (محاكاة)', at)]) }) : x));
  };
  const resendInvite = (list, id, at) => {
    const e = list.find((x) => x.id === id); if (!e) throw new RangeError('Unknown employee: ' + id);
    if (e.status !== 'invited') throw new RangeError('Not invited');
    return list.map((x) => (x.id === id ? Object.assign({}, x, { log: x.log.concat([entry('invite', 'إعادة إرسال الدعوة (محاكاة — لم تُرسل)', at)]) }) : x));
  };

  /* ───── Rendering ───── */
  const rows = () => staff.map((e) => Object.assign({}, e, { departmentName: DEPARTMENTS[e.department], roleName: ROLES[e.role] }));
  const COLUMNS = [
    { key: 'name', label: 'الموظف' }, { key: 'email', label: 'البريد (تجريبي)', html: (r) => `<bdi dir="ltr">${esc(r.email)}</bdi>` },
    { key: 'departmentName', label: 'الإدارة' }, { key: 'roleName', label: 'الدور' }, { key: 'created', label: 'تاريخ الإضافة', type: 'date' },
    { key: 'status', label: 'الحالة', type: 'status', statusDomain: 'employee' }
  ];
  const summaryHtml = () => {
    const c = counts(staff); const s = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${nf(v)}</b></div>`;
    return `<section class="ord-sum" aria-label="ملخص فريق العمل">${s('الإجمالي', c.total)}${s('مفعّلون', c.active)}${s('دعوات معلّقة', c.invited)}${s('معطّلون', c.disabled)}${s('الإدارات', c.departments)}</section>`;
  };
  const fErr = (e, k) => (e && e[k] ? `<small class="ord-err" id="wf-e-${k}" role="alert">${esc(e[k])}</small>` : '');
  const opts = (map, cur, ph) => `<option value="">${ph}</option>` + Object.keys(map).map((k) => `<option value="${k}"${cur === k ? ' selected' : ''}>${esc(map[k])}</option>`).join('');
  const dialogHtml = (m, st) => {
    const creating = !m, v = st.values || m || { name: '', email: '', department: '', role: '' }, e = st.errors || {}, inv = (k) => (e[k] ? ` aria-invalid="true" aria-describedby="wf-e-${k}"` : '');
    const acts = m ? (NEXT[m.status] || []) : [], lastOwner = m && isLastActiveOwner(staff, m.id);
    return `<form class="ord-dlg-in" novalidate>
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">${creating ? 'إضافة موظف ودعوته' : esc(m.name)}</h2>${creating ? '' : `<p>${badge(m.status)}</p>`}</div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>واجهة تجريبية بلا صلاحيات فعلية: تغيير الدور أو الحالة هنا لا يمنح ولا يسحب أي وصول، ولا تُرسل دعوات.</span></p>
      ${st.message ? `<p class="ord-muted" role="status">${esc(st.message)}</p>` : ''}
      <section aria-labelledby="ord-h-form"><h3 id="ord-h-form">${creating ? 'بيانات الموظف' : 'تعديل البيانات'}</h3>
        <div class="hs-grid-field"><label for="wf-name">الاسم</label><input id="wf-name" type="text" value="${esc(v.name)}" required${inv('name')}>${fErr(e, 'name')}</div>
        <div class="hs-grid-field"><label for="wf-email">البريد الإلكتروني (تجريبي)</label><input id="wf-email" type="email" dir="ltr" value="${esc(v.email)}" required${inv('email')}>${fErr(e, 'email')}</div>
        <div class="hs-grid-field"><label for="wf-dep">الإدارة</label><select id="wf-dep"${inv('department')}>${opts(DEPARTMENTS, v.department, 'اختر الإدارة')}</select>${fErr(e, 'department')}</div>
        <div class="hs-grid-field"><label for="wf-role">الدور</label><select id="wf-role"${inv('role')}>${opts(ROLES, v.role, 'اختر الدور')}</select>${fErr(e, 'role')}</div>
        ${lastOwner ? '<p class="ord-muted">هذا آخر مالك مفعّل: لا يمكن تعطيله أو تغيير دوره (قاعدة تجريبية).</p>' : ''}
        <p><button type="submit" class="adm-btn adm-btn-p" data-wf-save>${creating ? 'إضافة ودعوة محليًا' : 'حفظ التعديلات محليًا'}</button></p></section>
      ${creating ? '' : `<section aria-labelledby="ord-h-act"><h3 id="ord-h-act">الحساب والدعوة (محاكاة)</h3><div class="ord-act">
        ${acts.filter((a) => !(a.to === 'disabled' && lastOwner)).map((a) => `<button type="button" class="adm-btn ${a.cls}" data-ord-status="${a.to}">${a.text}</button>`).join('')}
        ${m.status === 'invited' ? '<button type="button" class="adm-btn" data-wf-resend>إعادة إرسال الدعوة (محاكاة)</button>' : ''}</div></section>
      <section aria-labelledby="wf-h-log"><h3 id="wf-h-log">سجل الإجراءات</h3><ul class="ord-tl">${m.log.slice().reverse().map((l) => `<li><span>${esc(l.text)}</span><small>${esc(dt(l.at))}</small></li>`).join('')}</ul></section>`}</form>`;
  };

  const render = () => {
    const wrap = root.document.createElement('div'); wrap.className = 'ord';
    wrap.innerHTML = `<p class="dash-note">بيانات تجريبية محلية — ليست موظفين حقيقيين ولا صلاحيات فعلية، وأي تغيير يُفقد عند إعادة التحميل.</p>
      <div id="ord-sum"></div><div id="ord-grid"></div><dialog class="ord-dlg" id="ord-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const sum = wrap.querySelector('#ord-sum'), dlgEl = wrap.querySelector('#ord-dlg');
    let openId = null, st = {};
    const paintSum = () => { sum.innerHTML = summaryHtml(); }; paintSum();
    grid = root.HSDataGrid.create(wrap.querySelector('#ord-grid'), {
      caption: 'قائمة فريق العمل', columns: COLUMNS, rows: rows(), pageSize: 10, rowId: (r) => r.id, searchKeys: ['name', 'email', 'departmentName', 'roleName'],
      filters: [{ key: 'status', label: 'الحالة', options: Object.keys(STATUS).map((k) => ({ value: k, label: STATUS[k].label })) }, { key: 'departmentName', label: 'الإدارة' }, { key: 'roleName', label: 'الدور' }],
      rowActions: [{ id: 'details', label: 'فتح', onClick: (r) => { openId = r.id; st = {}; paintDlg(); d.open(); } }],
      emptyText: 'لا يوجد موظفون في البيانات التجريبية.', onRetry: () => grid.setRows(rows())
    });
    const sync = () => { grid.setRows(rows()); paintSum(); };
    const paintDlg = (sel) => { const m = openId ? staff.find((x) => x.id === openId) : null; if (openId && !m) return; dlgEl.innerHTML = dialogHtml(m, st); const f = sel && dlgEl.querySelector(sel); if (f) f.focus(); };
    const read = () => ({ name: dlgEl.querySelector('#wf-name').value, email: dlgEl.querySelector('#wf-email').value, department: dlgEl.querySelector('#wf-dep').value, role: dlgEl.querySelector('#wf-role').value });
    const d = root.HSDialog.attach(dlgEl, {
      closeSelector: '[data-ord-close]',
      fallbackFocus: () => wrap.querySelector('tr[data-row="' + openId + '"] [data-act="details"]') || wrap.querySelector('.hs-grid-search input'),
      onClose: () => { openId = null; st = {}; }
    });
    createHook = () => { openId = null; st = {}; paintDlg(); d.open(root.document.activeElement); const f = dlgEl.querySelector('#wf-name'); if (f) f.focus(); };
    const save = () => {
      const values = read();
      try {
        if (openId) { staff = updateEmployee(staff, openId, values); st = { message: 'تم حفظ التعديلات محليًا.' }; sync(); paintDlg('#wf-name'); }
        else { staff = createEmployee(staff, values); openId = staff[staff.length - 1].id; st = { message: 'أُضيف الموظف ودُعي محليًا (لم تُرسل دعوة).' }; sync(); paintDlg('[data-ord-close]'); }
      } catch (err) {
        if (err.message === 'No change') { st = { values, message: 'لا يوجد تغيير لحفظه.' }; paintDlg(); return; }
        if (!err.errors) { st = { values, errors: {}, message: 'تعذر تنفيذ الإجراء.' }; paintDlg(); return; }
        st = { values, errors: err.errors }; paintDlg(); const k = ['name', 'email', 'department', 'role'].find((x) => err.errors[x]); const f = dlgEl.querySelector({ name: '#wf-name', email: '#wf-email', department: '#wf-dep', role: '#wf-role' }[k]); if (f) f.focus();
      }
    };
    dlgEl.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    d.onClick((b) => {
      try {
        if (b.hasAttribute('data-wf-save')) return; /* submit button: handled once by the form's submit event (also covers Enter) */
        if (b.dataset.ordStatus) { staff = setStatus(staff, openId, b.dataset.ordStatus); st = {}; sync(); paintDlg('[data-ord-close]'); }
        else if (b.hasAttribute('data-wf-resend')) { staff = resendInvite(staff, openId); st = { message: 'سُجّلت إعادة الإرسال محليًا (لم تُرسل دعوة).' }; sync(); paintDlg('[data-ord-close]'); }
      } catch (err) { st = { message: err.message === 'Last owner' ? 'لا يمكن تعطيل آخر مالك مفعّل (قاعدة تجريبية).' : 'تعذر تنفيذ الإجراء على هذا الموظف.' }; paintDlg(); }
    });
    return wrap;
  };

  const api = { STATUS, DEPARTMENTS, ROLES, LIMITS, counts, isLastActiveOwner, validate, createEmployee, updateEmployee, allowedNext, setStatus, resendInvite, buildFixtures, resetState, _staff: () => staff };
  root.HSAdminWorkforcePage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('workforce', {
      title: 'فريق العمل',
      description: 'قائمة الموظفين والإدارات والأدوار والحالات والدعوات، مع إضافة ودعوة وتعديل وتفعيل/تعطيل تجريبي محلي بلا صلاحيات فعلية.',
      actions: [
        { id: 'create', label: 'إضافة موظف', kind: 'primary', onClick: () => { if (createHook) createHook(); } },
        { id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { resetState(); ctx.shell.refresh(); } }
      ],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
