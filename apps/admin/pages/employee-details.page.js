/**
 * MODULE: employee-details.page
 * RESPONSIBILITY: Hidden admin page (parent: workforce) opened at #/employee-details/<id>: employee data (read-only name/email/status), the
 *   allowed editable fields (department and role) with the authority guards, the employee's effective permissions (role + extra), and the
 *   employee's audit list. Without a valid id it shows an employee picker instead of failing.
 * STATUS: IMPLEMENTED (DEMO). Uses the shared in-memory HSAdminRbac store (a static roster copy, NOT live-linked to the workforce page).
 *   NO ENFORCEMENT: nothing here changes real access. Account status is managed in the workforce page, not here.
 * Guards (from HSAdminRbac.changeEmployee): cannot edit an employee whose authority exceeds the acting role's; cannot assign a role above the
 *   acting role's authority; the last active owner's role cannot change (demo rule).
 * Depends on: HSAdminShell, HSAdminRbac.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(t); } catch (e) { return iso; } };
  const R = root.HSAdminRbac;
  /** '#/employee-details/e9002' → 'e9002'; anything else → null. */
  const parseId = (hash) => { const m = /^#\/?employee-details\/([a-z0-9_-]+)\/?$/i.exec(String(hash || '')); return m ? m[1] : null; };

  const pickerHtml = (unknown) => `${unknown ? '<p class="ord-err" role="alert">لم يُعثر على الموظف المطلوب. اختر موظفًا من القائمة.</p>' : '<p>اختر موظفًا لعرض تفاصيله.</p>'}
    <ul class="ord-notes">${R.state.roster.map((e) => `<li><a href="#/employee-details/${esc(e.id)}">${esc(e.name)}</a> — ${esc((R.roleById(R.state.roles, e.role) || {}).name)} — ${esc(R.DEPARTMENTS[e.department])}</li>`).join('')}</ul>`;
  const fErr = (e, k) => (e && e[k] ? `<small class="ord-err" id="ed-e-${k}" role="alert">${esc(e[k])}</small>` : '');
  const detailHtml = (emp, st) => {
    const S = R.state, role = R.roleById(S.roles, emp.role), v = st.values || { role: emp.role, department: emp.department }, e = st.errors || {}, inv = (k) => (e[k] ? ` aria-invalid="true" aria-describedby="ed-e-${k}"` : '');
    const held = new Set(R.effective(S.roles, S.actor)), eff = R.employeeEffective(S.roles, S.overrides, emp), extra = new Set(S.overrides[emp.id] || []), log = R.auditFor('emp:' + emp.id);
    return `<p><a href="#/workforce">← العودة إلى فريق العمل</a></p>
      <p class="ord-sim" role="note"><span>واجهة تجريبية بلا إنفاذ: التعديلات هنا محلية ولا تغيّر وصولًا فعليًا. حالة الحساب تُدار من صفحة فريق العمل.</span></p>
      <dl class="ord-facts"><div><dt>الاسم</dt><dd>${esc(emp.name)}</dd></div><div><dt>البريد (تجريبي)</dt><dd><bdi dir="ltr">${esc(emp.email)}</bdi></dd></div><div><dt>حالة الحساب</dt><dd>${esc(R.STATUS_LABEL[emp.status])}</dd></div>
        <div><dt>الدور الحالي</dt><dd>${esc(role ? role.name : '—')}</dd></div><div><dt>الإدارة الحالية</dt><dd>${esc(R.DEPARTMENTS[emp.department])}</dd></div><div><dt>الصلاحيات الفعلية</dt><dd>${nf(eff.length)}</dd></div></dl>
      <form id="ed-form" novalidate><h2>الحقول القابلة للتعديل</h2>
        <p class="ord-muted">المنفّذ التجريبي: ${esc((R.roleById(S.roles, S.actor) || {}).name || '—')}. الاسم والبريد غير قابلين للتعديل هنا.</p>
        <div class="hs-grid-field"><label for="ed-dep">الإدارة</label><select id="ed-dep"${inv('department')}>${Object.keys(R.DEPARTMENTS).map((k) => `<option value="${k}"${v.department === k ? ' selected' : ''}>${esc(R.DEPARTMENTS[k])}</option>`).join('')}</select>${fErr(e, 'department')}</div>
        <div class="hs-grid-field"><label for="ed-role">الدور</label><select id="ed-role"${inv('role')}>${S.roles.map((r) => { const above = R.grantViolations(S.roles, S.actor, R.effective(S.roles, r.id)).length > 0 && r.id !== emp.role; return `<option value="${esc(r.id)}"${v.role === r.id ? ' selected' : ''}${above ? ' disabled' : ''}>${esc(r.name)}${above ? ' (فوق سلطتك)' : ''}</option>`; }).join('')}</select>${fErr(e, 'role')}</div>
        ${st.message ? `<p class="ord-muted" role="status">${esc(st.message)}</p>` : ''}
        <p><button type="submit" class="adm-btn adm-btn-p" data-ed-save>حفظ التعديلات محليًا</button></p></form>
      <section aria-labelledby="ed-h-perm"><h2 id="ed-h-perm">الصلاحيات الفعلية</h2><p class="ord-muted">من الدور، والصلاحيات الإضافية معلَّمة. لتعديل الإضافية افتح صفحة «الصلاحيات» ← «حسب الموظف».</p>
        <ul class="ord-notes">${Object.keys(R.MODULES).map((m) => { const a = Object.keys(R.ACTIONS).filter((x) => eff.includes(R.key(m, x))); return a.length ? `<li><b>${esc(R.MODULES[m])}</b>: ${esc(a.map((x) => R.ACTIONS[x] + (extra.has(R.key(m, x)) ? ' (إضافية)' : '')).join('، '))}</li>` : ''; }).join('') || '<li>لا توجد صلاحيات.</li>'}</ul></section>
      <section aria-labelledby="ed-h-log"><h2 id="ed-h-log">سجل الإجراءات</h2>${log.length ? `<ul class="ord-tl">${log.slice().reverse().map((a) => `<li><span>${esc(a.text)}</span><small>${esc(dt(a.at))}</small></li>`).join('')}</ul>` : '<p class="ord-muted">لا توجد إجراءات مسجلة في هذه الجلسة.</p>'}</section>`;
  };

  const render = () => {
    const S = R.state, wrap = root.document.createElement('div'); wrap.className = 'ord';
    const id = parseId(root.location && root.location.hash), emp = id ? S.roster.find((e) => e.id === id) : null;
    if (!emp) { wrap.innerHTML = pickerHtml(!!id); return wrap; }
    S.selectedEmployee = emp.id;
    let st = {};
    const paint = (sel) => { const cur = S.roster.find((e) => e.id === emp.id); wrap.innerHTML = detailHtml(cur, st); const f = sel && wrap.querySelector(sel); if (f) f.focus(); }; paint();
    wrap.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const cur = S.roster.find((e) => e.id === emp.id), fields = { role: wrap.querySelector('#ed-role').value, department: wrap.querySelector('#ed-dep').value };
      const remote = root.HSBackend && root.HSBackend.mode === 'firebase' ? root.HSBackend : null;
      if (remote) {                                   /* Firebase backend: the server validates and applies the change */
        remote.admin('PATCH', '/admin/employees/' + encodeURIComponent(emp.id), fields).then((res) => {
          st = res.ok ? { message: 'تم حفظ التعديلات على الخادم.' } : { values: fields, errors: (res.error && res.error.details) || {}, message: res.error && res.error.details ? undefined : ((res.error && res.error.message) || 'تعذر تنفيذ الإجراء.') };
          paint(res.ok ? '#ed-role' : '[data-ed-save]');
        });
        return;
      }
      try {
        S.roster = R.changeEmployee(S.roles, S.roster, S.actor, emp.id, fields);
        const parts = []; if (cur.role !== fields.role) parts.push('الدور: «' + R.roleById(S.roles, cur.role).name + '» ← «' + R.roleById(S.roles, fields.role).name + '»'); if (cur.department !== fields.department) parts.push('الإدارة: «' + R.DEPARTMENTS[cur.department] + '» ← «' + R.DEPARTMENTS[fields.department] + '»');
        R.addAudit('emp:' + emp.id, 'تحديث — ' + parts.join('، ') + ' (محاكاة)'); st = { message: 'تم حفظ التعديلات محليًا (بلا إنفاذ فعلي).' }; paint('#ed-role');
      } catch (err) {
        st = { values: fields, errors: err.errors || {}, message: err.message === 'No change' ? 'لا يوجد تغيير لحفظه.' : (err.errors ? undefined : 'تعذر تنفيذ الإجراء.') };
        paint(err.errors && err.errors.role ? '#ed-role' : (err.errors && err.errors.department ? '#ed-dep' : '[data-ed-save]'));
      }
    });
    return wrap;
  };

  const api = { parseId };
  root.HSAdminEmployeeDetailsPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('employee-details', {
      title: 'تفاصيل الموظف',
      description: 'بيانات الموظف ودوره وإدارته وصلاحياته الفعلية وسجل الإجراءات، مع تعديل الحقول المسموحة محليًا بلا إنفاذ.',
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
