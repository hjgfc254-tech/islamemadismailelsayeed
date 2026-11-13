/**
 * MODULE: employee-status — HSAdminEmployeeStatus
 * Workforce account status model (demo): labels/tones, allowed transitions (invited → active ⇄ disabled), the
 * last-active-owner guard and the per-employee log entry shape. Pure functions over an employee list (no DOM, no storage).
 * Extracted from pages/workforce.page.js (same behavior). Simulated only — no real account is activated or disabled.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  const STATUS = { invited: { label: 'دعوة معلّقة', tone: 'info', icon: 'st-new' }, active: { label: 'مفعّل', tone: 'success', icon: 'check' }, disabled: { label: 'معطّل', tone: 'warning', icon: 'warn' } };
  const NEXT = {
    invited: [{ to: 'active', text: 'تأكيد قبول الدعوة (محاكاة)', cls: 'adm-btn-p' }],
    active: [{ to: 'disabled', text: 'تعطيل الحساب محليًا', cls: 'adm-btn-d' }],
    disabled: [{ to: 'active', text: 'إعادة تفعيل الحساب محليًا', cls: 'adm-btn-p' }]
  };

  const entry = (kind, text, at) => ({ kind, text, at: at || new Date().toISOString() });
  const isLastActiveOwner = (list, id) => { const a = list.filter((e) => e.role === 'owner' && e.status === 'active'); return a.length === 1 && a[0].id === id; };
  const allowedNext = (s) => (NEXT[s] || []).map((x) => x.to);
  const setStatus = (list, id, next, at) => {
    const e = list.find((x) => x.id === id); if (!e) throw new RangeError('Unknown employee: ' + id);
    if (!allowedNext(e.status).includes(next)) throw new RangeError('Transition not allowed: ' + e.status + ' → ' + next);
    if (next === 'disabled' && isLastActiveOwner(list, id)) throw new RangeError('Last owner');
    return list.map((x) => (x.id === id ? Object.assign({}, x, { status: next, log: x.log.concat([entry('status', 'تغيير حالة الحساب إلى «' + STATUS[next].label + '» (محاكاة)', at)]) }) : x));
  };

  const api = Object.freeze({ STATUS, NEXT, entry, isLastActiveOwner, allowedNext, setStatus });
  root.HSAdminEmployeeStatus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
