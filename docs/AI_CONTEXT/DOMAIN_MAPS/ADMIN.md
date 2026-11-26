> **Historical — frontend-only phase (2026-11-13/19).** This document describes the platform before it went live on Firebase. The real backend, payments, catalogue, call centre and security model are in `docs/MAINTENANCE_GUIDE.md`, and the current state is in `docs/AI_CONTEXT/START_HERE.md`. Source code wins over this file.

# Admin Domain Map

- Entry: `apps/admin/index.html`. Script order: icon registry → status badge → data grid → dialogs → accessible tabs → tree → money →
  `admin-router.js` → `navigation-builder.js` → `admin-shell.js` → `rbac-store.js` → `permission-guard.js` → `admin-auth.js` → `admin-session.js`
  → registered pages (… `super-dashboard.page.js` must be the last *page*) → `app.js` (bootstrap, last).
- Runtime (implemented 2026-11-13, frontend demo — NOT authentication/authorization):
  - `app.js` → `HSAdminApp`: no demo session → account picker (active RBAC roster employees); session → mounts the shell, installs the guard, shows the account + «تبديل الحساب» (reload to picker). The hash is kept, so deep links open after selection.
  - `admin-auth.js` → `HSAdminAuth.listDemoAccounts/resolveDemoAccount` (active employees only).
  - `admin-session.js` → `HSAdminSession` (sessionStorage `hs_admin_demo_session`); selecting sets `HSAdminRbac.state.actor` to the employee role.
  - `permission-guard.js` → `HSAdminPermissionGuard.canView(route, employee)`: routes mapped to an RBAC catalog module need `<module>.view` (role chain + per-employee extras); uncatalogued routes (dashboard, owner dashboard, quotes, finance, commissions, settlements, reports, security, audit, settings) stay open — no invented rule.
  - `navigation-builder.js` → `HSAdminNavigationBuilder.build(NAV, {isRegistered, canView})`; `admin-router.js` → `HSAdminRouter.parse/format/breadcrumbs` (extracted from the shell; shell `_internals` unchanged).
  - Shell additions: `setAccess(fn)` (hides items, denied state), `canView(id)`, `setAccount(html)`; auto-mount yields to `HSAdminApp`.
  - `login.html` (`/admin/login`) hands off to the picker; states real auth is not implemented.
- RBAC demo store: `apps/admin/rbac-store.js`. All RBAC, security, audit, finance, reports and the owner dashboard are local demo behavior.
- Modules (implemented 2026-11-13, extracted from pages; 42-point parity vs HEAD, 0 differences): `modules/workforce/employee-status.js` (`HSAdminEmployeeStatus`), `employee-form.js` (`HSAdminEmployeeForm`), `employee-invitation.js` (`HSAdminEmployeeInvitation`) → workforce page; `modules/audit/audit-filters.js`, `audit-details.js` → audit-log page; `modules/access-control/permission-matrix.js` → permissions page; `role-editor.js` + `permission-presets.js` (view-only + seed-role presets, clamped to the actor, inherited keys excluded) → roles page. Loaded after `admin-session.js`, before the pages; pages also `require` them in Node. No Admin placeholder remains.
- **Live marketplace operations (2026-11-14):** `pages/marketplace.page.js` → `HSAdminMarketplacePage`, route `#/marketplace`
  («تشغيل السوق»), NAV group operations, guard `ROUTE_MODULE.marketplace = 'providers'`.
  - Unlike the fixture-based pages, it works on the **shared `MP` store** (`hs_mp_db`). The entry loads `legacy-data.js` →
    `local-catalog.js` → `local-market-store.js` after `rbac-store.js`.
  - Tabs:
    - providers: admit, reject, suspend, special rate;
    - orders: candidate assign, auto-match, cancel before work;
    - customers: suspend;
    - complaints: resolve;
    - commissions: default and category rates, collection status (free jobs shown as «بلا مقابل»);
    - restore demo data (inline confirm).
  - Actions check `HSAdminPermissionGuard.can(employee, module, 'decide'|'edit')`; commissions are outside the demo
    catalog and always allowed.
  - This page replaces the legacy Admin console that used to live inside the Customer app (`portal-compat.js`, removed).
- **Isolation:** Admin is reachable only from `apps/admin/index.html`. No Customer or Provider source or screen mentions
  or links it (`tests/unit/legacy-migration.test.js`).
- Picker at 320px: `body{margin:0}` now applies before the shell mounts (it previously overflowed by the UA 8px margin).
- Tests: `tests/unit/admin-runtime.test.js`, `tests/unit/admin-modules.test.js`, `tests/unit/legacy-migration.test.js`;
  browser `tests/e2e/admin-app.cdp.js` (124/124 at 1280/768/430/390/320, including the marketplace approval via Enter). The older manual Playwright admin scripts (`tests/e2e/*.browser.js`) now land on the picker first and need a demo account selected (Playwright is not installed here).
