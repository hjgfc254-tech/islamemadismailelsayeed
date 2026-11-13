/**
 * MODULE: admin-session — HSAdminSession
 * Which demo employee is using the Admin Center in this tab (sessionStorage `hs_admin_demo_session`). Selecting an
 * employee also sets the RBAC demo actor (`HSAdminRbac.state.actor = employee.role`), so the roles/permissions pages
 * apply that employee's authority. NOT a secure session.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  const KEY = 'hs_admin_demo_session';
  const store = () => { try { return root.sessionStorage || null; } catch (e) { return null; } };
  const auth = () => root.HSAdminAuth || null;
  const rbac = () => root.HSAdminRbac || null;

  const currentId = () => { const s = store(); try { return (s && s.getItem(KEY)) || ''; } catch (e) { return ''; } };

  /** The signed-in demo employee (active roster entry) or null; keeps the RBAC actor in sync. */
  function current() {
    const a = auth(); const e = a ? a.resolveDemoAccount(currentId()) : null;
    if (e && rbac()) rbac().state.actor = e.role;
    return e;
  }

  /** Select a demo employee; returns the employee or null when the id is not an active demo account. */
  function select(id) {
    const a = auth(); const e = a ? a.resolveDemoAccount(id) : null;
    if (!e) return null;
    const s = store(); try { if (s) s.setItem(KEY, e.id); } catch (err) { /* storage unavailable */ }
    if (rbac()) rbac().state.actor = e.role;
    return e;
  }

  function clear() {
    const s = store(); try { if (s) s.removeItem(KEY); } catch (e) { /* ignore */ }
    if (rbac()) rbac().state.actor = 'admin'; // the RBAC store's own default actor
  }

  const api = Object.freeze({ KEY, currentId, current, select, clear });
  root.HSAdminSession = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
