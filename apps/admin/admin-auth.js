/**
 * MODULE: admin-auth — HSAdminAuth
 * Demo account selection for the Admin Center: lists the fictional employees of the RBAC demo roster that may open the
 * console (status `active`) and resolves a selection. NOT authentication — no credentials, tokens or server checks.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  const rbac = () => root.HSAdminRbac || null;

  /** [{id,name,email,role,roleName,department,departmentName}] for active demo employees. */
  function listDemoAccounts() {
    const r = rbac(); if (!r) return [];
    return r.state.roster.filter((e) => e.status === 'active').map((e) => {
      const role = r.roleById(r.state.roles, e.role);
      return { id: e.id, name: e.name, email: e.email, role: e.role, roleName: role ? role.name : e.role,
        department: e.department, departmentName: r.DEPARTMENTS[e.department] || e.department };
    });
  }

  /** The roster employee for an id if it may open the console (active), else null. */
  function resolveDemoAccount(id) {
    const r = rbac(); if (!r || !id) return null;
    const e = r.state.roster.find((x) => x.id === id);
    return e && e.status === 'active' ? e : null;
  }

  const api = Object.freeze({ listDemoAccounts, resolveDemoAccount });
  root.HSAdminAuth = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
