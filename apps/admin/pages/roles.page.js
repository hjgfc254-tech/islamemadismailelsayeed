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
  /* Role editor markup → modules/access-control/role-editor.js; presets → permission-presets.js. Browser: loaded before this page. */
  const load = (g, file) => root[g] || (typeof require === 'function' ? require(file) : null);
  const RE = load('HSAdminRoleEditor', '../modules/access-control/role-editor.js'), PP = load('HSAdminPermissionPresets', '../modules/access-control/permission-presets.js');
  if (!RE || !PP) throw new Error('roles.page.js requires modules/access-control/role-editor.js and permission-presets.js to load first');
  const { dialogHtml } = RE.create({ R, esc, icon, nf, dt });

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
    dlgEl.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'rl-inh') { st = Object.assign({}, st, { values: read(), errors: undefined }); paintDlg('#rl-inh'); return; }
      if (e.target && e.target.id === 'rl-preset' && e.target.value) {   /* permission presets: replace direct permissions within the actor's authority */
        const cur = read(), res = PP.apply(R, e.target.value, R.state.actor, cur.inherits ? R.effective(R.state.roles, cur.inherits) : []);
        st = Object.assign({}, st, { values: Object.assign(cur, { permissions: res.keys }), errors: undefined,
          message: 'طُبّق القالب على الصلاحيات المباشرة (' + nf(res.keys.length) + ')' + (res.skipped.length ? ' — تُركت ' + nf(res.skipped.length) + ' صلاحية خارج سلطتك' : '') + '. راجع قبل الحفظ.' });
        paintDlg('#rl-preset');
      }
    });
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
        const remote = root.HSBackend && root.HSBackend.mode === 'firebase' ? root.HSBackend : null;
        if (remote) {                                 /* Firebase backend: roles are stored and enforced server-side */
          const values = st.values;
          remote.admin('POST', '/admin/rbac/roles', { id: openId || undefined, fields: values }).then((res) => {
            if (res.ok) { if (creating) openId = R.state.roles[R.state.roles.length - 1].id; st = { message: creating ? 'أُضيف الدور على الخادم.' : 'تم حفظ الدور على الخادم.' }; sync(); paintDlg('[data-ord-close]'); }
            else { st = { values, errors: (res.error && res.error.details) || {}, message: (res.error && res.error.message) || 'تعذر تنفيذ الإجراء.' }; paintDlg(); }
          });
          return;
        }
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
