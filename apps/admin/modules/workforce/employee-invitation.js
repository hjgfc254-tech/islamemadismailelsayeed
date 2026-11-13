/**
 * MODULE: employee-invitation — HSAdminEmployeeInvitation
 * Workforce invitation actions (demo): resend an invitation to an employee whose status is `invited`, recording a
 * log entry. Simulated only — no email or invitation is ever sent. Pure over an employee list.
 * Extracted from pages/workforce.page.js (same behavior). Depends on HSAdminEmployeeStatus.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  const ST = root.HSAdminEmployeeStatus || (typeof require === 'function' ? require('./employee-status.js') : null);
  if (!ST) throw new Error('employee-invitation.js requires employee-status.js to load first');

  const canResend = (employee) => !!employee && employee.status === 'invited';
  const resendInvite = (list, id, at) => {
    const e = list.find((x) => x.id === id); if (!e) throw new RangeError('Unknown employee: ' + id);
    if (e.status !== 'invited') throw new RangeError('Not invited');
    return list.map((x) => (x.id === id ? Object.assign({}, x, { log: x.log.concat([ST.entry('invite', 'إعادة إرسال الدعوة (محاكاة — لم تُرسل)', at)]) }) : x));
  };

  const api = Object.freeze({ canResend, resendInvite });
  root.HSAdminEmployeeInvitation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
