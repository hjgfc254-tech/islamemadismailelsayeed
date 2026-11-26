/**
 * MODULE: permissions.page
 * RESPONSIBILITY: Admin permissions policy view — two tabs: (1) «حسب الدور»: a read-only module × role matrix of effective permissions
 *   (editing roles happens in the roles page); (2) «حسب الموظف»: an employee's role-based permissions (locked) plus EXTRA permissions that can
 *   be granted individually, never above the acting user's own authority, with an audit list.
 * STATUS: IMPLEMENTED (DEMO). Uses the shared in-memory HSAdminRbac store. NO ENFORCEMENT: nothing granted here gives or removes real access
 *   (the page says so). The acting role is a demo selector that sets the authority used by the «no grant above your authority» rule.
 * Depends on: HSAdminShell, HSAdminRbac.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG-u-nu-latn').format(n); } catch (e) { return String(n); } };
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' }).format(t); } catch (e) { return iso; } };
  const R = root.HSAdminRbac;

  /* matrix → modules/access-control/permission-matrix.js (browser: loaded before this page; Node: required) */
  const PM = root.HSAdminPermissionMatrix || (typeof require === 'function' ? require('../modules/access-control/permission-matrix.js') : null);
  if (!PM) throw new Error('permissions.page.js requires modules/access-control/permission-matrix.js to load first');
  const matrixHtml = () => PM.render(R, { esc });
  const employeeHtml = (st) => {
    const S = R.state, emp = S.roster.find((e) => e.id === (S.selectedEmployee || S.roster[0].id)) || S.roster[0];
    const roleHas = new Set(R.effective(S.roles, emp.role)), extra = new Set(st.values || S.overrides[emp.id] || []), held = new Set(R.effective(S.roles, S.actor)), errs = st.errors || {};
    const role = R.roleById(S.roles, emp.role), total = R.employeeEffective(S.roles, S.overrides, emp).length, log = R.auditFor('emp:' + emp.id);
    return `<div class="hs-grid-field"><label for="pm-emp">الموظف</label><select id="pm-emp">${S.roster.map((e) => `<option value="${esc(e.id)}"${e.id === emp.id ? ' selected' : ''}>${esc(e.name)} — ${esc((R.roleById(S.roles, e.role) || {}).name)}</option>`).join('')}</select></div>
      <dl class="ord-facts"><div><dt>الدور</dt><dd>${esc(role ? role.name : '—')}</dd></div><div><dt>الإدارة</dt><dd>${esc(R.DEPARTMENTS[emp.department])}</dd></div><div><dt>حالة الحساب</dt><dd>${esc(R.STATUS_LABEL[emp.status])}</dd></div>
        <div><dt>الصلاحيات الفعلية</dt><dd>${nf(total)}</dd></div></dl>
      <p><a href="#/employee-details/${esc(emp.id)}">فتح تفاصيل الموظف</a></p>
      <form id="pm-form" novalidate><h3>صلاحيات إضافية لهذا الموظف</h3><p class="ord-muted">المنفّذ التجريبي: ${esc((R.roleById(S.roles, S.actor) || {}).name || '—')}. الصلاحيات الممنوحة عبر الدور مقفلة، ولا يمكن منح ما لا يملكه المنفّذ.</p>
        ${Object.keys(R.MODULES).map((m) => `<fieldset class="rl-fs"><legend>${esc(R.MODULES[m])}</legend><div class="rl-acts">${Object.keys(R.ACTIONS).map((a) => {
          const k = R.key(m, a), fromRole = roleHas.has(k), on = fromRole || extra.has(k), locked = !on && !held.has(k), id = 'pm-p-' + m + '-' + a;
          return `<label class="rl-chk" for="${id}"><input type="checkbox" id="${id}" name="perm" value="${k}"${on ? ' checked' : ''}${fromRole || locked ? ' disabled' : ''}> <span>${esc(R.ACTIONS[a])}${fromRole ? ' (من الدور)' : locked ? ' (فوق سلطتك)' : ''}</span></label>`; }).join('')}</div></fieldset>`).join('')}
        ${errs.permissions ? `<small class="ord-err" id="pm-err" role="alert">${esc(errs.permissions)}</small>` : ''}
        ${st.message ? `<p class="ord-muted" role="status">${esc(st.message)}</p>` : ''}
        <p><button type="submit" class="adm-btn adm-btn-p" data-pm-save>حفظ الصلاحيات الإضافية محليًا</button></p></form>
      <section aria-labelledby="pm-h-log"><h3 id="pm-h-log">سجل التغييرات</h3>${log.length ? `<ul class="ord-tl">${log.slice().reverse().map((a) => `<li><span>${esc(a.text)}</span><small>${esc(dt(a.at))}</small></li>`).join('')}</ul>` : '<p class="ord-muted">لا توجد تغييرات مسجلة في هذه الجلسة.</p>'}</section>`;
  };

  const render = () => {
    const S = R.state, wrap = root.document.createElement('div'); wrap.className = 'ord';
    const c = { mods: Object.keys(R.MODULES).length, acts: Object.keys(R.ACTIONS).length, extra: Object.keys(S.overrides).filter((k) => S.overrides[k].length).length };
    wrap.innerHTML = `<p class="dash-note">بيانات تجريبية محلية — لا إنفاذ فعليًا للصلاحيات، وأي تغيير يُفقد عند إعادة التحميل.</p>
      <div class="hs-grid-field"><label for="pm-actor">المنفّذ التجريبي (يحدد سلطة منح الصلاحيات)</label><select id="pm-actor">${S.roles.map((r) => `<option value="${esc(r.id)}"${r.id === S.actor ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
      <section class="ord-sum" aria-label="ملخص الصلاحيات"><div class="ord-stat"><span>الوحدات</span><b>${nf(c.mods)}</b></div><div class="ord-stat"><span>الإجراءات</span><b>${nf(c.acts)}</b></div><div class="ord-stat"><span>الأدوار</span><b>${nf(S.roles.length)}</b></div><div class="ord-stat"><span>الموظفون</span><b>${nf(S.roster.length)}</b></div><div class="ord-stat" id="pm-extra"><span>لديهم صلاحيات إضافية</span><b>${nf(c.extra)}</b></div></section>
      <div role="tablist" aria-label="أقسام الصلاحيات" class="cat-tools"><button type="button" role="tab" class="adm-btn" id="pm-tab-r" aria-controls="pm-p-r" aria-selected="true" data-pm-tab="r">حسب الدور</button><button type="button" role="tab" class="adm-btn" id="pm-tab-e" aria-controls="pm-p-e" aria-selected="false" data-pm-tab="e">حسب الموظف</button></div>
      <div role="tabpanel" id="pm-p-r" aria-labelledby="pm-tab-r"></div><div role="tabpanel" id="pm-p-e" aria-labelledby="pm-tab-e" hidden></div>`;
    const pr = wrap.querySelector('#pm-p-r'), pe = wrap.querySelector('#pm-p-e'); let st = {};
    const paintR = () => { pr.innerHTML = matrixHtml(); }, paintE = (sel) => { pe.innerHTML = employeeHtml(st); const f = sel && pe.querySelector(sel); if (f) f.focus(); };
    const refreshExtra = () => { wrap.querySelector('#pm-extra b').textContent = nf(Object.keys(S.overrides).filter((k) => S.overrides[k].length).length); };
    paintR(); paintE();
    wrap.querySelector('#pm-actor').addEventListener('change', (e) => { S.actor = e.target.value; st = {}; paintE(); });
    wrap.querySelector('[role=tablist]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pm-tab]'); if (!b) return; const k = b.dataset.pmTab;
      pr.hidden = k !== 'r'; pe.hidden = k !== 'e'; wrap.querySelector('#pm-tab-r').setAttribute('aria-selected', k === 'r' ? 'true' : 'false'); wrap.querySelector('#pm-tab-e').setAttribute('aria-selected', k === 'e' ? 'true' : 'false'); if (k === 'r') paintR();
    });
    if (root.HSA11yTabs) root.HSA11yTabs.attach(wrap.querySelector('[role=tablist]'));
    pe.addEventListener('change', (e) => { if (e.target && e.target.id === 'pm-emp') { S.selectedEmployee = e.target.value; st = {}; paintE('#pm-emp'); } });
    pe.addEventListener('submit', (e) => {
      e.preventDefault(); const id = S.selectedEmployee || S.roster[0].id;
      const keys = Array.from(pe.querySelectorAll('input[name=perm]:checked:not(:disabled)')).map((c2) => c2.value);
      const remote = root.HSBackend && root.HSBackend.mode === 'firebase' ? root.HSBackend : null;
      if (remote) {                                   /* Firebase backend: overrides are stored and enforced server-side */
        remote.admin('POST', '/admin/rbac/overrides/' + encodeURIComponent(id), { keys }).then((res) => {
          st = res.ok ? { message: 'تم حفظ الصلاحيات الإضافية على الخادم.' } : { values: keys, errors: (res.error && res.error.details) || {}, message: (res.error && res.error.message) || 'تعذر تنفيذ الإجراء.' };
          if (res.ok) refreshExtra();
          paintE('[data-pm-save]');
        });
        return;
      }
      try {
        const before = S.overrides[id] || []; S.overrides = R.setOverrides(S.roles, S.overrides, S.roster, S.actor, id, keys);
        const after = S.overrides[id], add = after.filter((k) => !before.includes(k)).length, rem = before.filter((k) => !after.includes(k)).length;
        R.addAudit('emp:' + id, 'تحديث الصلاحيات الإضافية — +' + add + ' / −' + rem + ' (محاكاة)'); st = { message: 'تم حفظ الصلاحيات الإضافية محليًا (بلا إنفاذ فعلي).' }; refreshExtra(); paintE('[data-pm-save]');
      } catch (err) {
        st = { values: keys, errors: err.errors || {}, message: err.message === 'No change' ? 'لا يوجد تغيير لحفظه.' : (err.errors ? undefined : 'تعذر تنفيذ الإجراء.') }; paintE(err.errors && err.errors.permissions ? '#pm-err' : '[data-pm-save]');
      }
    });
    return wrap;
  };

  const api = { matrixHtml };
  root.HSAdminPermissionsPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('permissions', {
      title: 'الصلاحيات',
      description: 'مصفوفة الصلاحيات الفعلية حسب الدور، وصلاحيات إضافية لكل موظف بحدود سلطة المنفّذ (محاكاة بلا إنفاذ).',
      actions: [{ id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { R.reset(); ctx.shell.refresh(); } }],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
