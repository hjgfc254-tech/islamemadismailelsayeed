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
    workforce: 'workforce', 'employee-details': 'workforce', departments: 'departments', roles: 'roles', permissions: 'permissions',
    /* teams release (2026-11-22): money pages need the finance module, the rest follow their team */
    finance: 'finance', commissions: 'finance', settlements: 'finance', reports: 'finance', quotes: 'orders', insights: 'orders',
    tickets: 'tickets', alerts: 'alerts', tech: 'tech', 'content-studio': 'marketing'
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

  /* «إدارة المنصة» switches that only the owner may open (the server enforces the same for its routes). */
  const OWNER_ONLY = Object.freeze(['controls', 'security', 'audit', 'settings', 'super-dashboard']);

  /** canView(routeId, employee) — owner-only pages need the owner; uncatalogued routes are open; catalogued ones need `<module>.view`. */
  function canView(routeId, employee) {
    if (OWNER_ONLY.includes(routeId)) return !!employee && employee.role === 'owner';
    const module = ROUTE_MODULE[routeId];
    if (!module) return true;
    return can(employee, module, 'view');
  }

  /** The roster employee behind an API actor (server: adminRole on the actor; demo: the RBAC roster). */
  function employeeOf(actor) {
    const r = rbac(); if (!actor) return null;
    const e = r && r.state && (r.state.roster || []).find((x) => x.id === actor.id);
    return e || (actor.adminRole ? { id: actor.id, role: actor.adminRole, status: 'active' } : null);
  }
  /** '' when the actor's rank is enough for a risky action, else the Arabic refusal (who may do it). */
  function riskDenied(actor, riskKey) {
    const r = rbac(); if (!r || !r.levelOf || !actor || actor.role !== 'admin') return '';
    const emp = employeeOf(actor); if (!emp) return '';
    const need = r.riskNeed(riskKey), have = r.levelOf(r.state.roles, emp.role);
    return have >= need ? '' : `«${r.RISK_LABEL[riskKey] || riskKey}» محتاج رتبة ${r.LEVELS[need]} أو أعلى`;
  }

  /* ── API gate for admin actors (api-client.js calls it for every non-public route; the server runs the same code) ──
     Routes that used to be open to any admin now need the module of their team. The `tech` role is locked to an
     allow-list: no customer / provider / request / complaint / money route, whatever overrides it was given. */
  const API_NEEDS = Object.freeze({
    'GET /requests': 'orders.view', 'GET /requests/:id': 'orders.view', 'GET /requests/:id/photos': 'orders.view', 'POST /requests/:id/cancel': 'orders.decide',
    'GET /complaints': 'complaints.view', 'POST /complaints/:id/resolve': 'complaints.decide',
    'GET /admin/transactions': 'finance.view', 'GET /admin/commission': 'finance.view'
  });
  const TECH_API = Object.freeze(['GET /admin/summary', 'GET /notifications', 'POST /notifications/read', 'GET /admin/controls', 'GET /admin/support-contacts']);
  function apiDenied(actor, method, pattern) {
    if (!actor || actor.role !== 'admin' || !actor.adminRole) return '';
    const sig = String(method).toUpperCase() + ' ' + pattern;
    if (actor.adminRole === 'tech') return TECH_API.includes(sig) ? '' : 'دور التقنية مالوش وصول لبيانات العملاء ومقدمي الخدمة والطلبات والماليات';
    const need = API_NEEDS[sig]; if (!need) return '';
    const emp = employeeOf(actor); if (!emp) return '';
    const [m, a] = need.split('.');
    return can(emp, m, a) ? '' : 'ده خارج صلاحيات دورك';
  }

  const api = Object.freeze({ ROUTE_MODULE, OWNER_ONLY, API_NEEDS, TECH_API, apiDenied, employeeOf, riskDenied, permissionsOf, can, canView, isGuarded: (id) => !!ROUTE_MODULE[id] });
  root.HSAdminPermissionGuard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
