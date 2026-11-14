/**
 * MODULE: permission-guard — HSAdminPermissionGuard
 * Presentation-only guard for the Admin Center demo: decides which pages the signed-in DEMO employee may open/see,
 * using the existing RBAC demo catalog (HSAdminRbac: roles, inheritance, per-employee extras).
 * NOT security: anyone can change local state; real authorization must be enforced by a server.
 *
 * Rule: a route that maps to an RBAC catalog module needs `<module>.view`. Routes the demo catalog does not cover
 * (dashboard, owner dashboard, quotes, finance, commissions, settlements, reports, security, audit, settings) stay open —
 * the catalog has no permission for them, so the guard does not invent one.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  /* route id → RBAC module (HSAdminRbac.MODULES keys) */
  const ROUTE_MODULE = Object.freeze({
    marketplace: 'providers',   /* live marketplace operations; each tab additionally gates its actions by its own module */
    orders: 'orders', customers: 'customers', providers: 'providers', services: 'services', categories: 'categories',
    complaints: 'complaints', reviews: 'reviews', notifications: 'notifications',
    workforce: 'workforce', 'employee-details': 'workforce', departments: 'departments', roles: 'roles', permissions: 'permissions'
  });
  const rbac = () => root.HSAdminRbac || null;

  /** Effective permission keys of an employee (role chain + extras), or null when no employee/RBAC is available. */
  function permissionsOf(employee) {
    const r = rbac();
    if (!r || !employee) return null;
    return new Set(r.employeeEffective(r.state.roles, r.state.overrides, employee)); // role chain + per-employee extras
  }

  /** can(employee, module, action='view') — false for unknown employees. */
  function can(employee, module, action) {
    const perms = permissionsOf(employee);
    return !!perms && perms.has(module + '.' + (action || 'view'));
  }

  /** canView(routeId, employee) — uncatalogued routes are open; catalogued ones need `<module>.view`. */
  function canView(routeId, employee) {
    const module = ROUTE_MODULE[routeId];
    if (!module) return true;
    return can(employee, module, 'view');
  }

  const api = Object.freeze({ ROUTE_MODULE, permissionsOf, can, canView, isGuarded: (id) => !!ROUTE_MODULE[id] });
  root.HSAdminPermissionGuard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
