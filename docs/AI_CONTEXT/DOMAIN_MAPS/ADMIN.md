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
- Remaining placeholders: `modules/access-control/*`, `modules/audit/*`, `modules/workforce/*` (logic currently inside the roles/permissions/audit-log/workforce pages).
- Tests: `tests/unit/admin-runtime.test.js`; browser `tests/e2e/admin-app.cdp.js` (60/60). The older manual Playwright admin scripts (`tests/e2e/*.browser.js`) now land on the picker first and need a demo account selected (Playwright is not installed here).
