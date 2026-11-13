/**
 * MODULE: employee-form — HSAdminEmployeeForm
 * Workforce employee form model (demo): department/role lists, field limits, normalisation, validation (name, email
 * format/uniqueness, department, role, last-active-owner role guard) and create/update over an employee list.
 * Pure functions (no DOM, no storage). Extracted from pages/workforce.page.js (same behavior). Depends on HSAdminEmployeeStatus.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  const ST = root.HSAdminEmployeeStatus || (typeof require === 'function' ? require('./employee-status.js') : null);
  if (!ST) throw new Error('employee-form.js requires employee-status.js to load first');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };

  const DEPARTMENTS = { ops: 'العمليات', support: 'الدعم', finance: 'المالية', content: 'المحتوى', exec: 'الإدارة العليا' };
  const ROLES = { owner: 'المالك', admin: 'مدير', support: 'دعم فني', finance: 'مالية', moderator: 'مراقب محتوى' };
  const LIMITS = { name: 60, email: 80 };
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const clean = (f) => { const g = (k) => String((f && f[k]) == null ? '' : f[k]); return { name: g('name').replace(/\s+/g, ' ').trim(), email: g('email').trim().toLowerCase(), department: g('department'), role: g('role') }; };
  const validate = (fields, list, selfId) => {
    const v = clean(fields), errors = {};
    if (!v.name) errors.name = 'اكتب اسم الموظف.'; else if (v.name.length < 2) errors.name = 'الاسم قصير جدًا.'; else if (v.name.length > LIMITS.name) errors.name = 'الاسم أطول من ' + nf(LIMITS.name) + ' حرفًا.';
    if (!v.email) errors.email = 'اكتب البريد الإلكتروني.'; else if (v.email.length > LIMITS.email || !EMAIL.test(v.email)) errors.email = 'اكتب بريدًا إلكترونيًا صحيحًا.';
    else if (list.some((e) => e.id !== selfId && e.email === v.email)) errors.email = 'هذا البريد مستخدم لموظف آخر.';
    if (!DEPARTMENTS[v.department]) errors.department = 'اختر إدارة من القائمة.';
    if (!ROLES[v.role]) errors.role = 'اختر دورًا من القائمة.';
    else if (selfId && v.role !== 'owner' && ST.isLastActiveOwner(list, selfId)) errors.role = 'لا يمكن تغيير دور آخر مالك مفعّل (قاعدة تجريبية).';
    return { ok: !Object.keys(errors).length, errors, value: v };
  };
  const fail = (errors) => { const e = new RangeError('Invalid employee'); e.errors = errors; return e; };
  const nextId = (list) => 'e' + (Math.max(9000, ...list.map((e) => Number(String(e.id).slice(1)) || 0)) + 1);
  const createEmployee = (list, fields, at) => {
    const r = validate(fields, list); if (!r.ok) throw fail(r.errors);
    return list.concat([Object.assign({ id: nextId(list), status: 'invited', created: (at || new Date().toISOString()).slice(0, 10), log: [ST.entry('create', 'تمت إضافة الموظف ودعوته محليًا (لم تُرسل دعوة فعلية)', at)] }, r.value)]);
  };
  const updateEmployee = (list, id, fields, at) => {
    const cur = list.find((e) => e.id === id); if (!cur) throw new RangeError('Unknown employee: ' + id);
    const r = validate(fields, list, id); if (!r.ok) throw fail(r.errors);
    const ch = []; if (cur.department !== r.value.department) ch.push('الإدارة: «' + DEPARTMENTS[r.value.department] + '»'); if (cur.role !== r.value.role) ch.push('الدور: «' + ROLES[r.value.role] + '»');
    if (cur.name !== r.value.name || cur.email !== r.value.email) ch.push('بيانات الاسم/البريد');
    if (!ch.length) throw new RangeError('No change');
    return list.map((e) => (e.id === id ? Object.assign({}, e, r.value, { log: e.log.concat([ST.entry('profile', 'تحديث محلي — ' + ch.join('، '), at)]) }) : e));
  };

  const api = Object.freeze({ DEPARTMENTS, ROLES, LIMITS, EMAIL, clean, validate, nextId, createEmployee, updateEmployee });
  root.HSAdminEmployeeForm = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
