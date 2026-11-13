/**
 * MODULE: roles.page
 * RESPONSIBILITY: Admin roles — searchable/sortable roles grid and one dialog to create/edit a role: name, description, optional single
 *   inheritance (no cycles), a module × action permission checklist (inherited permissions shown locked), and a MANDATORY two-step save:
 *   «review impact» (added/removed effective permissions for the role and every role inheriting from it, employees affected) then confirm.
 *   The demo acting role limits what can be granted (never above its own authority).
 * STATUS: IMPLEMENTED (DEMO). Uses the shared in-memory HSAdminRbac store. NO ENFORCEMENT: saving a role grants or removes no real access
 *   (the page says so). The owner role is a protected system role (read-only). Roles cannot be deleted in this demo.
 * Depends on: HSAdminShell, HSDataGrid, HSDialog, HSAdminRbac.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(t); } catch (e) { return iso; } };
  const R = root.HSAdminRbac;
  let grid = null, createHook = null;

  const rows = () => R.state.roles.map((r) => { const p = r.inherits ? R.roleById(R.state.roles, r.inherits) : null;
    return { id: r.id, name: r.name, description: r.description, typeName: r.system ? 'نظام' : 'مخصص', inheritsName: p ? p.name : 'بدون', employees: R.roleEmployees(R.state.roster, r.id).length, perms: R.effective(R.state.roles, r.id).length }; });
  const COLUMNS = [
    { key: 'name', label: 'الدور' }, { key: 'description', label: 'الوصف', sortable: false, format: (r) => (r.description.length > 40 ? r.description.slice(0, 40) + '…' : r.description) },
    { key: 'typeName', label: 'النوع' }, { key: 'inheritsName', label: 'يرث من' },
    { key: 'employees', label: 'الموظفون', type: 'number', align: 'end' }, { key: 'perms', label: 'الصلاحيات الفعلية', type: 'number', align: 'end' }
  ];
  const summaryHtml = () => { const rs = R.state.roles; const s = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${nf(v)}</b></div>`;
    return `<section class="ord-sum" aria-label="ملخص الأدوار">${s('الأدوار', rs.length)}${s('أدوار نظام', rs.filter((r) => r.system).length)}${s('أدوار مخصصة', rs.filter((r) => !r.system).length)}${s('ترث من دور', rs.filter((r) => r.inherits).length)}${s('الموظفون', R.state.roster.length)}</section>`; };
  const fErr = (e, k) => (e && e[k] ? `<small class="ord-err" id="rl-e-${k}" role="alert">${esc(e[k])}</small>` : '');
  const list = (keys, max) => { const k = keys.slice(0, max || 8).map(R.keyLabel); return esc(k.join('، ')) + (keys.length > (max || 8) ? ' … و' + nf(keys.length - (max || 8)) + ' أخرى' : ''); };

  const permFields = (v, role) => {
    const inh = new Set(v.inherits ? R.effective(R.state.roles, v.inherits) : []), held = new Set(R.effective(R.state.roles, R.state.actor)), direct = new Set(v.permissions);
    return Object.keys(R.MODULES).map((m) => `<fieldset class="rl-fs"><legend>${esc(R.MODULES[m])}</legend><div class="rl-acts">${Object.keys(R.ACTIONS).map((a) => {
      const k = R.key(m, a), isInh = inh.has(k), on = isInh || direct.has(k), locked = !on && !held.has(k), id = 'rl-p-' + m + '-' + a;
      return `<label class="rl-chk" for="${id}"><input type="checkbox" id="${id}" name="perm" value="${k}"${on ? ' checked' : ''}${isInh || locked ? ' disabled' : ''}> <span>${esc(R.ACTIONS[a])}${isInh ? ' (موروثة)' : locked ? ' (فوق سلطتك)' : ''}</span></label>`;
    }).join('')}</div></fieldset>`).join('');
  };
  const reviewHtml = (st, role) => {
    const im = st.impact;
    return `<section aria-labelledby="rl-h-rv"><h3 id="rl-h-rv">مراجعة التأثير قبل الحفظ</h3>
      <p>${im.changed ? `سيتغير ما تملكه ${nf(im.perRole.length)} دور (${nf(im.employees)} موظف): ${nf(im.added)} صلاحية مضافة و${nf(im.removed)} مُزالة.` : 'لا يغيّر هذا التعديل الصلاحيات الفعلية لأي دور (تغيير في الاسم/الوصف أو ما يُعادله).'}</p>
      <ul class="ord-notes">${im.perRole.map((r) => `<li><b>${esc(r.name)}</b> — ${nf(r.employees)} موظف، +${nf(r.added.length)} / −${nf(r.removed.length)}${r.added.length ? '<br><small>تُضاف: ' + list(r.added) + '</small>' : ''}${r.removed.length ? '<br><small>تُزال: ' + list(r.removed) + '</small>' : ''}</li>`).join('')}</ul>
      <div class="ord-act"><button type="button" class="adm-btn adm-btn-p" data-rl-confirm>تأكيد الحفظ محليًا</button><button type="button" class="adm-btn" data-rl-back>رجوع للتعديل</button></div></section>`;
  };
  const dialogHtml = (role, st) => {
    const creating = !role, v = st.values || (role ? { name: role.name, description: role.description, inherits: role.inherits, permissions: role.permissions.filter((k) => !R.inherited(R.state.roles, role.id).includes(k)) } : { name: '', description: '', inherits: null, permissions: [] }), e = st.errors || {};
    const inv = (k) => (e[k] ? ` aria-invalid="true" aria-describedby="rl-e-${k}"` : '');
    const head = `<header class="ord-dlg-h"><div><h2 id="ord-dlg-t">${creating ? 'إضافة دور' : esc(role.name)}</h2>${role ? `<p>${role.system ? 'دور نظام محمي' : 'دور مخصص'} — ${nf(R.roleEmployees(R.state.roster, role.id).length)} موظف</p>` : ''}</div>
      <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>واجهة تجريبية بلا إنفاذ: حفظ الدور هنا لا يمنح ولا يسحب أي وصول فعلي.</span></p>${st.message ? `<p class="ord-muted" role="status">${esc(st.message)}</p>` : ''}`;
    const log = role ? `<section aria-labelledby="rl-h-log"><h3 id="rl-h-log">سجل التغييرات</h3>${R.auditFor('role:' + role.id).length ? `<ul class="ord-tl">${R.auditFor('role:' + role.id).slice().reverse().map((a) => `<li><span>${esc(a.text)}</span><small>${esc(dt(a.at))}</small></li>`).join('')}</ul>` : '<p class="ord-muted">لا توجد تغييرات مسجلة في هذه الجلسة.</p>'}</section>` : '';
    if (role && role.system) return `<div class="ord-dlg-in">${head}<p>${esc(role.description)}</p><section><h3>الصلاحيات الفعلية</h3><p class="ord-muted">كل الصلاحيات (${nf(R.effective(R.state.roles, role.id).length)}). هذا الدور محمي ولا يُعدَّل في العرض التجريبي.</p></section>${log}</div>`;
    if (st.review) return `<div class="ord-dlg-in">${head}${reviewHtml(st, role)}${log}</div>`;
    const parents = R.validParents(R.state.roles, role ? role.id : null);
    return `<form class="ord-dlg-in" novalidate>${head}
      <section aria-labelledby="ord-h-form"><h3 id="ord-h-form">${creating ? 'بيانات الدور' : 'تعديل الدور'}</h3>
        <div class="hs-grid-field"><label for="rl-name">اسم الدور</label><input id="rl-name" type="text" value="${esc(v.name)}" required${inv('name')}>${fErr(e, 'name')}</div>
        <div class="hs-grid-field"><label for="rl-desc">الوصف</label><textarea id="rl-desc" rows="2"${inv('description')}>${esc(v.description)}</textarea>${fErr(e, 'description')}</div>
        <div class="hs-grid-field"><label for="rl-inh">يرث من</label><select id="rl-inh"${inv('inherits')}><option value="">بدون</option>${parents.map((p) => `<option value="${esc(p.id)}"${v.inherits === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>${fErr(e, 'inherits')}</div>
        <h3>الصلاحيات</h3><p class="ord-muted">المنفّذ التجريبي الحالي: ${esc((R.roleById(R.state.roles, R.state.actor) || {}).name || '—')} — لا يمكن منح صلاحية لا يملكها المنفّذ.</p>
        <div id="rl-perms" aria-describedby="rl-e-permissions"${inv('permissions')}>${permFields(v, role)}</div>${fErr(e, 'permissions')}
        <p><button type="submit" class="adm-btn adm-btn-p" data-rl-review>مراجعة التأثير قبل الحفظ</button></p></section>${log}</form>`;
  };

  const render = () => {
    const wrap = root.document.createElement('div'); wrap.className = 'ord';
    wrap.innerHTML = `<p class="dash-note">بيانات تجريبية محلية — لا إنفاذ فعليًا للصلاحيات، وأي تغيير يُفقد عند إعادة التحميل.</p>
      <div class="hs-grid-field"><label for="rl-actor">المنفّذ التجريبي (يحدد سلطة منح الصلاحيات)</label><select id="rl-actor">${R.state.roles.map((r) => `<option value="${esc(r.id)}"${r.id === R.state.actor ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
      <div id="ord-sum"></div><div id="ord-grid"></div><dialog class="ord-dlg" id="ord-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const sum = wrap.querySelector('#ord-sum'), dlgEl = wrap.querySelector('#ord-dlg');
    let openId = null, st = {};
    const paintSum = () => { sum.innerHTML = summaryHtml(); }; paintSum();
    grid = root.HSDataGrid.create(wrap.querySelector('#ord-grid'), {
      caption: 'قائمة الأدوار', columns: COLUMNS, rows: rows(), pageSize: 10, rowId: (r) => r.id, searchKeys: ['name', 'description'],
      filters: [{ key: 'typeName', label: 'النوع' }, { key: 'inheritsName', label: 'يرث من' }],
      rowActions: [{ id: 'details', label: 'فتح', onClick: (r) => { openId = r.id; st = {}; paintDlg(); d.open(); } }],
      emptyText: 'لا توجد أدوار.', onRetry: () => grid.setRows(rows())
    });
    wrap.querySelector('#rl-actor').addEventListener('change', (e) => { R.state.actor = e.target.value; });
    const sync = () => { grid.setRows(rows()); paintSum(); };
    const paintDlg = (sel) => { const r = openId ? R.roleById(R.state.roles, openId) : null; if (openId && !r) return; dlgEl.innerHTML = dialogHtml(r, st); const f = sel && dlgEl.querySelector(sel); if (f) f.focus(); };
    const d = root.HSDialog.attach(dlgEl, {
      closeSelector: '[data-ord-close]',
      fallbackFocus: () => wrap.querySelector('tr[data-row="' + openId + '"] [data-act="details"]') || wrap.querySelector('.hs-grid-search input'),
      onClose: () => { openId = null; st = {}; }
    });
    createHook = () => { openId = null; st = {}; paintDlg(); d.open(root.document.activeElement); const f = dlgEl.querySelector('#rl-name'); if (f) f.focus(); };
    const read = () => ({ name: dlgEl.querySelector('#rl-name').value, description: dlgEl.querySelector('#rl-desc').value, inherits: dlgEl.querySelector('#rl-inh').value || null,
      permissions: Array.from(dlgEl.querySelectorAll('input[name=perm]:checked:not(:disabled)')).map((c) => c.value) });
    const apply = (values) => (openId ? R.updateRole(R.state.roles, R.state.actor, openId, values) : R.createRole(R.state.roles, R.state.actor, values));
    dlgEl.addEventListener('change', (e) => { if (e.target && e.target.id === 'rl-inh') { st = Object.assign({}, st, { values: read(), errors: undefined }); paintDlg('#rl-inh'); } });
    dlgEl.addEventListener('submit', (e) => {
      e.preventDefault(); if (st.review) return;
      const values = read();
      try { apply(values); st = { values, review: true, impact: R.impact(R.state.roles, R.state.roster, openId, values) }; paintDlg('#rl-h-rv'); }
      catch (err) {
        if (!err.errors) { st = { values, errors: {}, message: 'تعذر تنفيذ الإجراء.' }; paintDlg(); return; }
        st = { values, errors: err.errors }; paintDlg(); const k = ['name', 'description', 'inherits', 'permissions'].find((x) => err.errors[x]); const f = dlgEl.querySelector({ name: '#rl-name', description: '#rl-desc', inherits: '#rl-inh', permissions: '#rl-perms input' }[k]); if (f) f.focus();
      }
    });
    d.onClick((b) => {
      if (b.hasAttribute('data-rl-review')) return; /* submit button: handled once by the form's submit event */
      if (b.hasAttribute('data-rl-back')) { st = { values: st.values }; paintDlg('#rl-name'); return; }
      if (b.hasAttribute('data-rl-confirm')) {
        const im = st.impact, creating = !openId;
        try {
          R.state.roles = apply(st.values);
          if (creating) openId = R.state.roles[R.state.roles.length - 1].id;
          R.addAudit('role:' + openId, (creating ? 'إنشاء الدور' : 'تحديث الدور') + ' — +' + im.added + ' / −' + im.removed + ' صلاحية فعلية (محاكاة)');
          st = { message: creating ? 'أُضيف الدور محليًا.' : 'تم حفظ الدور محليًا (بلا إنفاذ فعلي).' }; sync(); paintDlg('[data-ord-close]');
        } catch (err) { st = { values: st.values, errors: err.errors || {}, message: err.errors ? undefined : 'تعذر تنفيذ الإجراء.' }; paintDlg(); }
      }
    });
    return wrap;
  };

  const api = { rows, COLUMNS };
  root.HSAdminRolesPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('roles', {
      title: 'الأدوار',
      description: 'الأدوار الوظيفية وصلاحياتها الموروثة والمحددة، مع إنشاء وتعديل ومراجعة التأثير قبل الحفظ (محاكاة بلا إنفاذ).',
      actions: [
        { id: 'create', label: 'إضافة دور', kind: 'primary', onClick: () => { if (createHook) createHook(); } },
        { id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { R.reset(); ctx.shell.refresh(); } }
      ],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
