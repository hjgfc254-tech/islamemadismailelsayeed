# Admin Domain Map

- Entry: `apps/admin/index.html`.
- Shell: `apps/admin/admin-shell.js`.
- RBAC demo store: `apps/admin/rbac-store.js`.
- Shared admin components loaded before shell/pages: `shared/components/status-badge.js`, `data-grid.js`, `dialogs.js`; utilities `shared/utils/tree.js`, `shared/utils/money.js`.
- Registered page modules are listed in the entry HTML; inspect that file before adding/removing registration.
- Current completed demo areas include workforce, departments, roles, permissions, employee details, orders, customers, providers, services, categories, complaints, reviews, notifications (partial), finance, commissions, settlements, reports, audit log, security, system settings, quotes, and the owner dashboard (`super-dashboard.page.js`: read-only, derived live from the other pages; must load last).
- Every item of `HSAdminShell.NAV` now has a registered page (a contract test enforces it). No placeholder admin page remains; the remaining admin scaffolds (`admin-auth/router/session/app.js`, `login.html`, `navigation-builder.js`, `permission-guard.js`, `modules/*`) are Backend/Auth work and out of scope.
- Next recorded task: Phase 5 item 1 — design-system audit (see `docs/HANDOFF_NEXT_AI.md`).
- Check source + `AI_PROJECT_MAP.json` before implementation; no feature is complete merely because it is listed here.
- All RBAC, security events, audit events, finance, commissions, settlements, reports, and the owner dashboard are local demo behavior only.
