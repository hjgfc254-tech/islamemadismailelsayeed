/**
 * MODULE: departments.page
 * RESPONSIBILITY: Admin departments — an organisational tree (max 3 levels) with expand/collapse, one dialog to create/edit a department
 *   (validated name, parent choice that cannot create a cycle or exceed the depth limit, head chosen among the department's ACTIVE employees),
 *   a read-only list of the linked employees, and simulated activate/deactivate with relation checks.
 * STATUS: IMPLEMENTED (DEMO). 9 local departments + a static copy of the 12 demo employees (same names/departments as the workforce page);
 *   in memory only, NOT live-linked to the workforce page. Nothing is saved or applied anywhere.
 * Demo relation rules (documented, not from the spec text): a department cannot be deactivated while it has an active sub-department, and
 *   cannot be activated while its parent is inactive. The head must be an active employee of that same department.
 * Depends on: HSAdminShell, HSStatusBadge (registers the «department» domain here if absent), HSDialog, HSTree.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
  const T = root.HSTree;

  const STATUS = { active: { label: 'مفعّلة', tone: 'success', icon: 'check' }, inactive: { label: 'متوقفة', tone: 'warning', icon: 'warn' } };
  const B = root.HSStatusBadge;
  if (B && B.domains().indexOf('department') === -1) B.register('department', STATUS);
  const badge = (s) => (B ? B.render('department', s) : esc((STATUS[s] || {}).label || 'غير محدد'));
  const EMP_STATUS = { active: 'مفعّل', invited: 'دعوة معلّقة', disabled: 'معطّل' };
  const MAX_DEPTH = 3, NAME_MAX = 50;

  /* ───── Fixtures (demo) ───── */
  const ROSTER = [['e9001', 'سامي عبد الله', 'exec', 'active'], ['e9002', 'ريم حامد', 'ops', 'active'], ['e9003', 'طارق منصور', 'support', 'active'], ['e9004', 'دينا يوسف', 'finance', 'active'],
    ['e9005', 'عمر شاكر', 'content', 'active'], ['e9006', 'لمى ناصر', 'support', 'invited'], ['e9007', 'بسام قاسم', 'ops', 'disabled'], ['e9008', 'نهى فؤاد', 'finance', 'invited'],
    ['e9009', 'زياد حمدي', 'content', 'active'], ['e9010', 'مروة سعد', 'support', 'disabled'], ['e9011', 'إياد رفعت', 'ops', 'active'], ['e9012', 'ليلى جابر', 'exec', 'active']]
    .map(([id, name, department, status]) => ({ id, name, department, status }));
  const buildFixtures = () => [
    ['exec', null, 'الإدارة العليا', 'active', 'e9001', 1], ['ops', null, 'العمليات', 'active', 'e9002', 2], ['ops-field', 'ops', 'العمليات الميدانية', 'active', null, 1], ['ops-field-n', 'ops-field', 'الميدان — الشمال', 'active', null, 1],
    ['support', null, 'الدعم', 'active', 'e9003', 3], ['support-l2', 'support', 'دعم المستوى الثاني', 'inactive', null, 1], ['finance', null, 'المالية', 'active', 'e9004', 4],
    ['content', null, 'المحتوى', 'active', 'e9005', 5], ['content-review', 'content', 'مراجعة المحتوى', 'active', null, 1]
  ].map(([id, parentId, name, status, headId, order]) => ({ id, parentId, name, status, headId, order }));

  let depts = buildFixtures();
  let createHook = null;
  const resetState = () => { depts = buildFixtures(); };

  /* ───── Pure logic (unit-tested) ───── */
  const members = (roster, deptId) => roster.filter((e) => e.department === deptId);
  const activeMembers = (roster, deptId) => members(roster, deptId).filter((e) => e.status === 'active');
  const headName = (list, roster, id) => { const d = T.byId(list, id), e = d && d.headId ? roster.find((x) => x.id === d.headId) : null; return e ? e.name : null; };
  const counts = (list, roster) => ({ total: list.length, active: list.filter((d) => d.status === 'active').length, noHead: list.filter((d) => d.status === 'active' && !d.headId).length, employees: roster.length, depth: list.length ? Math.max(...list.map((d) => T.depthOf(list, d.id))) : 0 });
  const clean = (f) => ({ name: String((f && f.name) == null ? '' : f.name).replace(/\s+/g, ' ').trim(), parentId: f && f.parentId ? String(f.parentId) : null, headId: f && f.headId ? String(f.headId) : null });
  const validate = (fields, list, roster, selfId) => {
    const v = clean(fields), errors = {};
    if (!v.name) errors.name = 'اكتب اسم الإدارة.'; else if (v.name.length < 2) errors.name = 'اسم الإدارة قصير جدًا.'; else if (v.name.length > NAME_MAX) errors.name = 'اسم الإدارة أطول من ' + nf(NAME_MAX) + ' حرفًا.';
    if (v.parentId && !T.validParents(list, selfId || null, MAX_DEPTH).some((d) => d.id === v.parentId)) errors.parentId = 'لا يمكن اختيار هذه الإدارة أبًا (دورة أو تجاوز ' + nf(MAX_DEPTH) + ' مستويات).';
    else if (v.name && !errors.name && list.some((d) => d.id !== selfId && (d.parentId || null) === v.parentId && norm(d.name) === norm(v.name))) errors.name = 'توجد إدارة بنفس الاسم في هذا المستوى.';
    if (v.headId && !(selfId && activeMembers(roster, selfId).some((e) => e.id === v.headId))) errors.headId = 'المسؤول يجب أن يكون موظفًا مفعّلًا في هذه الإدارة نفسها.';
    return { ok: !Object.keys(errors).length, errors, value: v };
  };
  const fail = (errors) => { const e = new RangeError('Invalid department'); e.errors = errors; return e; };
  const nextId = (list) => 'd' + (Math.max(0, ...list.map((d) => (/^d\d+$/.test(d.id) ? Number(d.id.slice(1)) : 0))) + 1);
  const createDepartment = (list, roster, fields) => {
    const r = validate(fields, list, roster); if (!r.ok) throw fail(r.errors);
    return list.concat([{ id: nextId(list), parentId: r.value.parentId, name: r.value.name, status: 'active', headId: null, order: T.siblings(list, r.value.parentId).length + 1 }]);
  };
  const renumber = (list, parentId) => { const m = {}; T.siblings(list, parentId).forEach((d, i) => { m[d.id] = i + 1; }); return list.map((d) => (m[d.id] ? Object.assign({}, d, { order: m[d.id] }) : d)); };
  const updateDepartment = (list, roster, id, fields) => {
    const cur = T.byId(list, id); if (!cur) throw new RangeError('Unknown department: ' + id);
    const r = validate(fields, list, roster, id); if (!r.ok) throw fail(r.errors);
    const moved = (cur.parentId || null) !== r.value.parentId;
    let out = list.map((d) => (d.id === id ? Object.assign({}, d, { name: r.value.name, parentId: r.value.parentId, headId: r.value.headId, order: moved ? T.siblings(list, r.value.parentId).length + 1 : d.order }) : d));
    if (moved) out = renumber(out, cur.parentId || null);
    return out;
  };
  const allowedNext = (s) => (s === 'active' ? ['inactive'] : s === 'inactive' ? ['active'] : []);
  const setStatus = (list, id, next) => {
    const d = T.byId(list, id); if (!d) throw new RangeError('Unknown department: ' + id);
    if (!allowedNext(d.status).includes(next)) throw new RangeError('Transition not allowed: ' + d.status + ' → ' + next);
    if (next === 'inactive' && list.some((x) => x.parentId === id && x.status === 'active')) throw new RangeError('Active children');
    if (next === 'active') { const p = d.parentId ? T.byId(list, d.parentId) : null; if (p && p.status !== 'active') throw new RangeError('Parent inactive'); }
    return list.map((x) => (x.id === id ? Object.assign({}, x, { status: next }) : x));
  };

  /* ───── Rendering ───── */
  const summaryHtml = () => {
    const c = counts(depts, ROSTER); const s = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${nf(v)}</b></div>`;
    return `<section class="ord-sum" aria-label="ملخص الإدارات">${s('الإدارات', c.total)}${s('مفعّلة', c.active)}${s('بدون مسؤول', c.noHead)}${s('الموظفون', c.employees)}${s('أقصى عمق', c.depth)}</section>`;
  };
  const treeHtml = (collapsed) => {
    const walk = (parent, lvl) => {
      const sib = T.siblings(depts, parent); if (!sib.length) return '';
      return `<ul class="cat-ul">${sib.map((d) => {
        const kids = depts.some((x) => x.parentId === d.id), isC = collapsed.has(d.id), hn = headName(depts, ROSTER, d.id), n = members(ROSTER, d.id).length;
        return `<li class="cat-li" data-lvl="${lvl}"><div class="cat-row">
          ${kids ? `<button type="button" class="adm-btn cat-tg" data-dp-toggle="${esc(d.id)}" aria-expanded="${isC ? 'false' : 'true'}" aria-label="${isC ? 'توسيع' : 'طي'} ${esc(d.name)}">${isC ? '＋' : '−'}</button>` : '<span class="cat-tg-sp" aria-hidden="true"></span>'}
          <span class="cat-name">${esc(d.name)}</span>${badge(d.status)}<span class="ord-muted">المسؤول: ${hn ? esc(hn) : 'غير معيّن'}</span><span class="ord-muted">${nf(n)} موظف</span>
          <button type="button" class="adm-btn" data-dp-open="${esc(d.id)}" aria-label="فتح الإدارة: ${esc(d.name)}">فتح</button></div>${kids && !isC ? walk(d.id, lvl + 1) : ''}</li>`;
      }).join('')}</ul>`;
    };
    return depts.length ? walk(null, 1) : '<p class="ord-muted">لا توجد إدارات في البيانات التجريبية.</p>';
  };
  const fErr = (e, k) => (e && e[k] ? `<small class="ord-err" id="dp-e-${k}" role="alert">${esc(e[k])}</small>` : '');
  const dialogHtml = (d, st) => {
    const creating = !d, v = st.values || (d ? { name: d.name, parentId: d.parentId, headId: d.headId } : { name: '', parentId: null, headId: null }), e = st.errors || {};
    const inv = (k) => (e[k] ? ` aria-invalid="true" aria-describedby="dp-e-${k}"` : '');
    const parents = T.validParents(depts, d ? d.id : null, MAX_DEPTH), heads = d ? activeMembers(ROSTER, d.id) : [], mem = d ? members(ROSTER, d.id) : [];
    return `<form class="ord-dlg-in" novalidate>
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">${creating ? 'إضافة إدارة' : esc(d.name)}</h2>${creating ? '' : `<p>${badge(d.status)}</p>`}</div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>إجراءات تجريبية: التغييرات محلية في هذه الصفحة فقط ولا تغيّر موظفين ولا صلاحيات، وقائمة الموظفين نسخة ثابتة غير مربوطة بصفحة فريق العمل.</span></p>
      ${st.message ? `<p class="ord-muted" role="status">${esc(st.message)}</p>` : ''}
      <section aria-labelledby="ord-h-form"><h3 id="ord-h-form">${creating ? 'بيانات الإدارة' : 'تعديل البيانات'}</h3>
        <div class="hs-grid-field"><label for="dp-name">اسم الإدارة</label><input id="dp-name" type="text" value="${esc(v.name)}" required${inv('name')}>${fErr(e, 'name')}</div>
        <div class="hs-grid-field"><label for="dp-parent">الإدارة الأم</label><select id="dp-parent"${inv('parentId')}><option value="">بدون (إدارة رئيسية)</option>${parents.map((o) => `<option value="${esc(o.id)}"${v.parentId === o.id ? ' selected' : ''}>${esc(T.pathOf(depts, o.id).join(' › '))}</option>`).join('')}</select>${fErr(e, 'parentId')}</div>
        <div class="hs-grid-field"><label for="dp-head">المسؤول</label><select id="dp-head"${inv('headId')}${creating ? ' disabled' : ''}><option value="">غير معيّن</option>${heads.map((o) => `<option value="${esc(o.id)}"${v.headId === o.id ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select>${fErr(e, 'headId')}</div>
        <p class="ord-muted">${creating ? 'يُعيَّن المسؤول بعد إضافة الإدارة وربط موظفين بها.' : (heads.length ? 'يُختار المسؤول من موظفي هذه الإدارة المفعّلين فقط.' : 'لا يوجد موظفون مفعّلون في هذه الإدارة لاختيار مسؤول منهم.')} أقصى عمق للهيكل ${nf(MAX_DEPTH)} مستويات.</p>
        <p><button type="submit" class="adm-btn adm-btn-p" data-dp-save>${creating ? 'إضافة محليًا' : 'حفظ التعديلات محليًا'}</button></p></section>
      ${creating ? '' : `<section aria-labelledby="ord-h-act"><h3 id="ord-h-act">الحالة (محاكاة)</h3><div class="ord-act">${allowedNext(d.status).map((n) => `<button type="button" class="adm-btn ${n === 'inactive' ? 'adm-btn-d' : 'adm-btn-p'}" data-ord-status="${n}">${n === 'inactive' ? 'إيقاف الإدارة محليًا' : 'تفعيل الإدارة محليًا'}</button>`).join('')}</div></section>
      <section aria-labelledby="dp-h-mem"><h3 id="dp-h-mem">الموظفون المرتبطون (عرض فقط)</h3>
        ${mem.length ? `<ul class="ord-notes">${mem.map((m) => `<li>${esc(m.name)} — ${esc(EMP_STATUS[m.status] || '')}${d.headId === m.id ? ' (المسؤول)' : ''}</li>`).join('')}</ul>` : '<p class="ord-muted">لا يوجد موظفون مرتبطون مباشرة بهذه الإدارة.</p>'}</section>`}</form>`;
  };

  const render = () => {
    const wrap = root.document.createElement('div'); wrap.className = 'ord';
    wrap.innerHTML = `<p class="dash-note">بيانات تجريبية محلية — ليست هيكلًا تنظيميًا حقيقيًا، وأي تغيير يُفقد عند إعادة التحميل.</p>
      <div id="ord-sum"></div><div class="cat-tools"><button type="button" class="adm-btn" data-dp-all="expand">توسيع الكل</button><button type="button" class="adm-btn" data-dp-all="collapse">طي الكل</button></div>
      <nav id="dp-tree" class="cat-tree" aria-label="شجرة الإدارات"></nav><dialog class="ord-dlg" id="ord-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const sum = wrap.querySelector('#ord-sum'), tree = wrap.querySelector('#dp-tree'), dlgEl = wrap.querySelector('#ord-dlg');
    const collapsed = new Set(); let openId = null, st = {};
    /* Expand/collapse-all reflect the current state (disabled when there is nothing to do) instead of silently doing nothing. */
  const paintTree = () => { tree.innerHTML = treeHtml(collapsed); const box = tree.parentElement, parents = depts.filter((d) => depts.some((x) => x.parentId === d.id)); const ex = box && box.querySelector('[data-dp-all="expand"]'), co = box && box.querySelector('[data-dp-all="collapse"]'); if (ex) ex.disabled = collapsed.size === 0; if (co) co.disabled = parents.every((d) => collapsed.has(d.id)); };
    const sync = () => { sum.innerHTML = summaryHtml(); paintTree(); }; sync();
    const paintDlg = (sel) => { const d = openId ? T.byId(depts, openId) : null; if (openId && !d) return; dlgEl.innerHTML = dialogHtml(d, st); const f = sel && dlgEl.querySelector(sel); if (f) f.focus(); };
    const dlg = root.HSDialog.attach(dlgEl, {
      closeSelector: '[data-ord-close]',
      fallbackFocus: () => (openId && wrap.querySelector('[data-dp-open="' + openId + '"]')) || wrap.querySelector('[data-dp-open]'),
      onClose: () => { openId = null; st = {}; }
    });
    const openDlg = (id, from) => { openId = id; st = {}; paintDlg(); dlg.open(from); };
    createHook = () => { openDlg(null, root.document.activeElement); const f = dlgEl.querySelector('#dp-name'); if (f) f.focus(); };
    tree.addEventListener('click', (e) => {
      const t = e.target.closest('[data-dp-toggle]'), o = e.target.closest('[data-dp-open]');
      if (t) { const id = t.dataset.dpToggle; if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id); paintTree(); const n = tree.querySelector('[data-dp-toggle="' + id + '"]'); if (n) n.focus(); }
      else if (o) openDlg(o.dataset.dpOpen, o);
    });
    wrap.querySelector('.cat-tools').addEventListener('click', (e) => {
      const b = e.target.closest('[data-dp-all]'); if (!b) return;
      collapsed.clear(); if (b.dataset.dpAll === 'collapse') depts.filter((d) => depts.some((x) => x.parentId === d.id)).forEach((d) => collapsed.add(d.id)); paintTree();
    });
    const save = () => {
      const hs = dlgEl.querySelector('#dp-head');
      const values = { name: dlgEl.querySelector('#dp-name').value, parentId: dlgEl.querySelector('#dp-parent').value || null, headId: hs && !hs.disabled ? (hs.value || null) : null };
      try {
        if (openId) { depts = updateDepartment(depts, ROSTER, openId, values); st = { message: 'تم حفظ التعديلات محليًا.' }; sync(); paintDlg('#dp-name'); }
        else { depts = createDepartment(depts, ROSTER, values); openId = depts[depts.length - 1].id; st = { message: 'أُضيفت الإدارة محليًا.' }; sync(); paintDlg('[data-ord-close]'); }
      } catch (err) {
        if (!err.errors) { st = { values, errors: {}, message: 'تعذر تنفيذ الإجراء.' }; paintDlg(); return; }
        st = { values, errors: err.errors }; paintDlg(); const k = ['name', 'parentId', 'headId'].find((x) => err.errors[x]); const f = dlgEl.querySelector({ name: '#dp-name', parentId: '#dp-parent', headId: '#dp-head' }[k]); if (f) f.focus();
      }
    };
    dlgEl.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    dlg.onClick((b) => {
      if (b.hasAttribute('data-dp-save')) return; /* submit button: handled once by the form's submit event (also covers Enter) */
      try {
        if (b.dataset.ordStatus) { depts = setStatus(depts, openId, b.dataset.ordStatus); st = {}; sync(); paintDlg('[data-ord-close]'); }
      } catch (err) {
        st = { message: err.message === 'Active children' ? 'لا يمكن إيقاف إدارة لها إدارة فرعية مفعّلة؛ أوقف الفرعية أولًا (قاعدة تجريبية).' : err.message === 'Parent inactive' ? 'لا يمكن تفعيل إدارة أمها متوقفة؛ فعّل الأم أولًا (قاعدة تجريبية).' : 'تعذر تنفيذ الإجراء على هذه الإدارة.' };
        paintDlg();
      }
    });
    return wrap;
  };

  const api = { STATUS, MAX_DEPTH, NAME_MAX, ROSTER, members, activeMembers, headName, counts, validate, createDepartment, updateDepartment, allowedNext, setStatus, buildFixtures, resetState, _depts: () => depts };
  root.HSAdminDepartmentsPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('departments', {
      title: 'الإدارات',
      description: 'الهيكل التنظيمي للإدارات ومسؤوليها وموظفيها المرتبطين، مع إضافة وتعديل وتفعيل/إيقاف تجريبي محلي والتحقق من العلاقات.',
      actions: [
        { id: 'create', label: 'إضافة إدارة', kind: 'primary', onClick: () => { if (createHook) createHook(); } },
        { id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { resetState(); ctx.shell.refresh(); } }
      ],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
