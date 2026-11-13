/**
 * MODULE: role-editor — HSAdminRoleEditor
 * Role editor dialog markup for the Admin roles page: name/description/inheritance fields, permission checkboxes per
 * module (inherited and above-authority keys disabled), a permission-preset picker, the impact review, and the change log.
 * `create({R, esc, icon, nf, dt})` binds helpers once; the roles page owns events and state.
 * Extracted from pages/roles.page.js (same markup) + preset picker (permission-presets.js). No enforcement.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  const PP = root.HSAdminPermissionPresets || (typeof require === 'function' ? require('./permission-presets.js') : null);

  function create(deps) {
    const { R, esc, icon, nf, dt } = deps || {};
    if (!R || typeof esc !== 'function' || typeof icon !== 'function' || typeof nf !== 'function' || typeof dt !== 'function') throw new Error('HSAdminRoleEditor.create: R, esc, icon, nf and dt are required');

    const fErr = (e, k) => (e && e[k] ? `<small class="ord-err" id="rl-e-${k}" role="alert">${esc(e[k])}</small>` : '');
    const list = (keys, max) => { const k = keys.slice(0, max || 8).map(R.keyLabel); return esc(k.join('، ')) + (keys.length > (max || 8) ? ' … و' + nf(keys.length - (max || 8)) + ' أخرى' : ''); };

    const permFields = (v, role) => {
      const inh = new Set(v.inherits ? R.effective(R.state.roles, v.inherits) : []), held = new Set(R.effective(R.state.roles, R.state.actor)), direct = new Set(v.permissions);
      return Object.keys(R.MODULES).map((m) => `<fieldset class="rl-fs"><legend>${esc(R.MODULES[m])}</legend><div class="rl-acts">${Object.keys(R.ACTIONS).map((a) => {
        const k = R.key(m, a), isInh = inh.has(k), on = isInh || direct.has(k), locked = !on && !held.has(k), id = 'rl-p-' + m + '-' + a;
        return `<label class="rl-chk" for="${id}"><input type="checkbox" id="${id}" name="perm" value="${k}"${on ? ' checked' : ''}${isInh || locked ? ' disabled' : ''}> <span>${esc(R.ACTIONS[a])}${isInh ? ' (موروثة)' : locked ? ' (فوق سلطتك)' : ''}</span></label>`;
      }).join('')}</div></fieldset>`).join('');
    };

    /** Preset picker (permission-presets.js); selecting one replaces the direct permissions within the actor's authority. */
    const presetField = () => (PP ? `<div class="hs-grid-field"><label for="rl-preset">ابدأ من قالب صلاحيات</label><select id="rl-preset"><option value="">— بدون قالب —</option>${PP.list(R).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>` : '');

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
        ${presetField()}
        <div id="rl-perms" aria-describedby="rl-e-permissions"${inv('permissions')}>${permFields(v, role)}</div>${fErr(e, 'permissions')}
        <p><button type="submit" class="adm-btn adm-btn-p" data-rl-review>مراجعة التأثير قبل الحفظ</button></p></section>${log}</form>`;
    };

    return Object.freeze({ fErr, list, permFields, presetField, reviewHtml, dialogHtml });
  }

  const api = Object.freeze({ create });
  root.HSAdminRoleEditor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
