# Current Placeholder / Scaffold Register

> 2026-11-14: the legacy Provider bridge files were removed (no longer listed). `services/*-api.js` and `realtime-client.js` are now IMPLEMENTED (MOCK ADAPTER). `docs/AI_PROJECT_MAP.json` holds the authoritative per-file status; counts below may lag.

This is a per-file inventory status, not proof that a whole feature is absent. Some behavior may live in legacy/grouped modules.

**Files classified as PLACEHOLDER:** 120

## Rules
- Verify equivalent behavior elsewhere before implementing a placeholder.
- Do not delete a scaffold only because it is not used in the current phase.
- `backend/` and `database/` are preserved future scaffolding, outside Frontend scope.

## `apps/admin`

- `apps/admin/README.md` — Project documentation, test guide or module notes.
- `apps/admin/admin-auth.js` — Admin authentication adapter; requires backend identity verification.
- `apps/admin/admin-router.js` — Admin route resolution and direct navigation; not implemented.
- `apps/admin/admin-session.js` — Admin session lifecycle and isolation; not implemented.
- `apps/admin/app.js` — Admin application bootstrap; no production Admin Center runtime exists.
- `apps/admin/login.html` — Application route document.
- `apps/admin/modules/access-control/permission-matrix.js` — Access-control submodule: permission matrix. Requires server-defined roles and permissions.
- `apps/admin/modules/access-control/permission-presets.js` — Access-control submodule: permission presets. Requires server-defined roles and permissions.
- `apps/admin/modules/access-control/role-editor.js` — Access-control submodule: role editor. Requires server-defined roles and permissions.
- `apps/admin/modules/audit/audit-details.js` — Audit submodule: audit details. Requires immutable server-side audit records.
- `apps/admin/modules/audit/audit-filters.js` — Audit submodule: audit filters. Requires immutable server-side audit records.
- `apps/admin/modules/workforce/employee-form.js` — Workforce submodule: employee form. Planned only; depends on authenticated backend workforce APIs.
- `apps/admin/modules/workforce/employee-invitation.js` — Workforce submodule: employee invitation. Planned only; depends on authenticated backend workforce APIs.
- `apps/admin/modules/workforce/employee-status.js` — Workforce submodule: employee status. Planned only; depends on authenticated backend workforce APIs.
- `apps/admin/navigation-builder.js` — Builds navigation from server-provided permissions; no RBAC source exists yet.
- `apps/admin/permission-guard.js` — Client-side permission-aware presentation guard only; authoritative checks must live on the backend.

## `apps/customer`

- `apps/customer/customer-router.js` — Customer route resolution and direct-link handling; currently navigation is managed by apps/customer/app.js.
- `apps/customer/customer-session.js` — Customer-only session boundary; current demo identity/state remains in local storage through the legacy marketplace layer.
- `apps/customer/pages/providers.page.js` — Provider discovery/detail presentation is currently part of apps/customer/pages/market-ui.page.js; standalone extraction is pending.
- `apps/customer/pages/request-create.page.js` — Request creation wizard is implemented in apps/customer/pages/request-wizard.page.js; this file documents the planned route-level page boundary.

## `apps/guest`

- `apps/guest/README.md` — Project documentation, test guide or module notes.
- `apps/guest/guest-entry.js` — Documented future module boundary; see file header.
- `apps/guest/guest-policy.js` — Documented future module boundary; see file header.

## `apps/provider`

- `apps/provider/login.html` — Authentication entry placeholder; no production login/authentication.
- `apps/provider/provider-auth.js` — Demo account selector only; trusted backend authentication remains unimplemented.
- `apps/provider/provider-session.js` — Isolated demo session key only; not a secure production session.

Implemented frontend modules: standalone entry/shell/router, local demo bootstrap, twelve page renderers, request-domain grouping and responsive Provider stylesheet.

## `backend`

- `backend/README.md` — Project documentation, test guide or module notes.
- `backend/src/app.js` — Future backend application composition; no server framework is selected.
- `backend/src/config/database.js` — Database connection adapter; no production database is configured.
- `backend/src/config/env.js` — Validated server environment configuration; no secrets or environment contract defined.
- `backend/src/config/storage.js` — Object storage adapter; no provider is configured.
- `backend/src/jobs/notification-worker.js` — Background notification delivery worker; no queue/provider exists.
- `backend/src/jobs/scheduled-tasks.js` — Scheduled backend jobs; no scheduler exists.
- `backend/src/middleware/authenticate.js` — Server-side identity verification middleware; not implemented.
- `backend/src/middleware/error-handler.js` — Backend error normalization middleware; not implemented.
- `backend/src/middleware/rate-limit.js` — Server-side rate limiting middleware; not implemented.
- `backend/src/middleware/require-account-status.js` — Server-side account lifecycle enforcement; not implemented.
- `backend/src/middleware/require-permission.js` — Server-side permission enforcement; not implemented.
- `backend/src/middleware/validate-request.js` — Backend request validation middleware; not implemented.
- `backend/src/modules/access-control/access.service.js` — Backend access-control module component (access.service.js); planned only. No implementation or API is present.
- `backend/src/modules/access-control/permissions.routes.js` — Backend access-control module component (permissions.routes.js); planned only. No implementation or API is present.
- `backend/src/modules/access-control/policy.repository.js` — Backend access-control module component (policy.repository.js); planned only. No implementation or API is present.
- `backend/src/modules/access-control/roles.routes.js` — Backend access-control module component (roles.routes.js); planned only. No implementation or API is present.
- `backend/src/modules/audit/README.md` — Backend audit module component (README.md); planned only. No implementation or API is present.
- `backend/src/modules/auth/auth.controller.js` — Backend auth module component (auth.controller.js); planned only. No implementation or API is present.
- `backend/src/modules/auth/auth.routes.js` — Backend auth module component (auth.routes.js); planned only. No implementation or API is present.
- `backend/src/modules/auth/auth.service.js` — Backend auth module component (auth.service.js); planned only. No implementation or API is present.
- `backend/src/modules/auth/session.repository.js` — Backend auth module component (session.repository.js); planned only. No implementation or API is present.
- `backend/src/modules/catalog/README.md` — Backend catalog module component (README.md); planned only. No implementation or API is present.
- `backend/src/modules/complaints/README.md` — Backend complaints module component (README.md); planned only. No implementation or API is present.
- `backend/src/modules/customers/README.md` — Backend customers module component (README.md); planned only. No implementation or API is present.
- `backend/src/modules/finance/README.md` — Backend finance module component (README.md); planned only. No implementation or API is present.
- `backend/src/modules/notifications/README.md` — Backend notifications module component (README.md); planned only. No implementation or API is present.
- `backend/src/modules/orders/README.md` — Backend orders module component (README.md); planned only. No implementation or API is present.
- `backend/src/modules/providers/README.md` — Backend providers module component (README.md); planned only. No implementation or API is present.
- `backend/src/modules/quotes/README.md` — Backend quotes module component (README.md); planned only. No implementation or API is present.
- `backend/src/modules/reports/README.md` — Backend reports module component (README.md); planned only. No implementation or API is present.
- `backend/src/modules/reviews/README.md` — Backend reviews module component (README.md); planned only. No implementation or API is present.
- `backend/src/modules/settings/README.md` — Backend settings module component (README.md); planned only. No implementation or API is present.
- `backend/src/modules/workforce/workforce.controller.js` — Backend workforce module component (workforce.controller.js); planned only. No implementation or API is present.
- `backend/src/modules/workforce/workforce.repository.js` — Backend workforce module component (workforce.repository.js); planned only. No implementation or API is present.
- `backend/src/modules/workforce/workforce.routes.js` — Backend workforce module component (workforce.routes.js); planned only. No implementation or API is present.
- `backend/src/modules/workforce/workforce.service.js` — Backend workforce module component (workforce.service.js); planned only. No implementation or API is present.
- `backend/src/server.js` — Future backend process entry point; no backend runtime is included.
- `backend/tests/audit.test.js` — Documented future module boundary; see file header.
- `backend/tests/auth.test.js` — Documented future module boundary; see file header.
- `backend/tests/authorization.test.js` — Documented future module boundary; see file header.
- `backend/tests/workforce.test.js` — Documented future module boundary; see file header.

## `database`

- `database/README.md` — Project documentation, test guide or module notes.
- `database/schema/accounts.schema.js` — Proposed accounts data schema. No production database schema/migration is implemented.
- `database/schema/audit-events.schema.js` — Proposed audit events data schema. No production database schema/migration is implemented.
- `database/schema/complaints.schema.js` — Proposed complaints data schema. No production database schema/migration is implemented.
- `database/schema/customers.schema.js` — Proposed customers data schema. No production database schema/migration is implemented.
- `database/schema/departments.schema.js` — Proposed departments data schema. No production database schema/migration is implemented.
- `database/schema/employees.schema.js` — Proposed employees data schema. No production database schema/migration is implemented.
- `database/schema/notifications.schema.js` — Proposed notifications data schema. No production database schema/migration is implemented.
- `database/schema/orders.schema.js` — Proposed orders data schema. No production database schema/migration is implemented.
- `database/schema/permissions.schema.js` — Proposed permissions data schema. No production database schema/migration is implemented.
- `database/schema/providers.schema.js` — Proposed providers data schema. No production database schema/migration is implemented.
- `database/schema/quotes.schema.js` — Proposed quotes data schema. No production database schema/migration is implemented.
- `database/schema/roles.schema.js` — Proposed roles data schema. No production database schema/migration is implemented.
- `database/schema/services.schema.js` — Proposed services data schema. No production database schema/migration is implemented.
- `database/schema/transactions.schema.js` — Proposed transactions data schema. No production database schema/migration is implemented.

## `services`

- `services/admin-api.js` — Admin Api adapter boundary for a future backend. No HTTP API/backend is present; this module intentionally contains documentation only.
- `services/api-client.js` — Api Client adapter boundary for a future backend. No HTTP API/backend is present; this module intentionally contains documentation only.
- `services/auth-api.js` — Auth Api adapter boundary for a future backend. No HTTP API/backend is present; this module intentionally contains documentation only.
- `services/catalog-api.js` — Catalog Api adapter boundary for a future backend. No HTTP API/backend is present; this module intentionally contains documentation only.
- `services/customer-api.js` — Customer Api adapter boundary for a future backend. No HTTP API/backend is present; this module intentionally contains documentation only.
- `services/finance-api.js` — Finance Api adapter boundary for a future backend. No HTTP API/backend is present; this module intentionally contains documentation only.
- `services/notifications-api.js` — Notifications Api adapter boundary for a future backend. No HTTP API/backend is present; this module intentionally contains documentation only.
- `services/orders-api.js` — Orders Api adapter boundary for a future backend. No HTTP API/backend is present; this module intentionally contains documentation only.
- `services/provider-api.js` — Provider Api adapter boundary for a future backend. No HTTP API/backend is present; this module intentionally contains documentation only.
- `services/quotes-api.js` — Quotes Api adapter boundary for a future backend. No HTTP API/backend is present; this module intentionally contains documentation only.
- `services/realtime-client.js` — Realtime Client adapter boundary for a future backend. No HTTP API/backend is present; this module intentionally contains documentation only.
- `services/support-api.js` — Support Api adapter boundary for a future backend. No HTTP API/backend is present; this module intentionally contains documentation only.
- `services/uploads-api.js` — Uploads Api adapter boundary for a future backend. No HTTP API/backend is present; this module intentionally contains documentation only.

## `shared`

- `shared/design-system/components.css` — Shared component styles extraction target; existing stylesheet retained in design-system.css.
- `shared/design-system/layout.css` — Shared layout primitives extraction target; not extracted.
- `shared/design-system/tokens.css` — Design tokens extraction target; existing complete stylesheet is design-system.css.
- `shared/design-system/typography.css` — Typography layer extraction target; existing design tokens remain in design-system.css.

## `tests`

- `tests/e2e/README.md` — Project documentation, test guide or module notes.
- `tests/integration/README.md` — Project documentation, test guide or module notes.
- `tests/security/README.md` — Project documentation, test guide or module notes.

## 2026-11-13 — Shared foundation implementation

Implemented and behavior-tested 16 previously documentation-only files under `shared/utils/`, `shared/config/`, `shared/types/`, and `shared/components/`. Their entries were removed from the placeholder list only after `npm test` passed. Render primitives are available but are not yet globally wired into legacy pages. Backend, database, production API/auth and authorization scaffolds remain intentionally untouched under the Frontend-only project rule.

## 2026-11-13 — Customer Page Extraction Batch 01

`apps/customer/pages/home.page.js` and `apps/customer/pages/orders.page.js` are now implemented as dependency-injected presentation renderers, covered by `tests/unit/customer-page-renderers.test.js`. Their former PLACEHOLDER entries have been removed. `apps/customer/pages/order-details.page.js` now also renders the tracking/detail view with injected MP/presentation dependencies. The remaining Customer page modules are still grouped/pending and must not be marked complete until extracted and behavior-tested.

The three Customer page renderer files are covered by `tests/unit/customer-page-renderers.test.js`; this does not imply independent Customer routing or session boundaries.
