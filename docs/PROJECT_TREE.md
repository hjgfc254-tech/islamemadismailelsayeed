# Current Project Tree

> Generated from the inventory file set (git: tracked + untracked-unignored files). Human reference only; use `docs/AI_CONTEXT/FILE_INDEX.json` for fast AI lookup.

```text
hansalhlak/
├── .claude/
│   └── skills/
│       ├── browser-qa/
│       │   └── SKILL.md
│       ├── finish-gate/
│       │   └── SKILL.md
│       └── vm-script-test/
│           └── SKILL.md
├── apps/
│   ├── admin/
│   │   ├── modules/
│   │   │   ├── access-control/
│   │   │   │   ├── permission-matrix.js
│   │   │   │   ├── permission-presets.js
│   │   │   │   └── role-editor.js
│   │   │   ├── audit/
│   │   │   │   ├── audit-details.js
│   │   │   │   └── audit-filters.js
│   │   │   ├── workforce/
│   │   │   │   ├── employee-form.js
│   │   │   │   ├── employee-invitation.js
│   │   │   │   └── employee-status.js
│   │   │   └── admin-live.js
│   │   ├── pages/
│   │   │   ├── admin-dashboard.page.js
│   │   │   ├── audit-log.page.js
│   │   │   ├── categories-management.page.js
│   │   │   ├── commissions.page.js
│   │   │   ├── complaints-management.page.js
│   │   │   ├── customers-management.page.js
│   │   │   ├── departments.page.js
│   │   │   ├── employee-details.page.js
│   │   │   ├── finance-dashboard.page.js
│   │   │   ├── marketplace.page.js
│   │   │   ├── notifications-management.page.js
│   │   │   ├── orders-management.page.js
│   │   │   ├── permissions.page.js
│   │   │   ├── providers-management.page.js
│   │   │   ├── quotes-management.page.js
│   │   │   ├── reports.page.js
│   │   │   ├── reviews-management.page.js
│   │   │   ├── roles.page.js
│   │   │   ├── security.page.js
│   │   │   ├── services-management.page.js
│   │   │   ├── settlements.page.js
│   │   │   ├── super-dashboard.page.js
│   │   │   ├── system-settings.page.js
│   │   │   └── workforce.page.js
│   │   ├── styles/
│   │   │   ├── admin-components.css
│   │   │   ├── admin-responsive.css
│   │   │   └── admin.css
│   │   ├── admin-auth.js
│   │   ├── admin-router.js
│   │   ├── admin-session.js
│   │   ├── admin-shell.js
│   │   ├── app.js
│   │   ├── index.html
│   │   ├── login.html
│   │   ├── navigation-builder.js
│   │   ├── permission-guard.js
│   │   ├── rbac-store.js
│   │   └── README.md
│   ├── customer/
│   │   ├── pages/
│   │   │   ├── account.page.js
│   │   │   ├── addresses.page.js
│   │   │   ├── discover.page.js
│   │   │   ├── home.page.js
│   │   │   ├── market-ui.page.js
│   │   │   ├── order-details.page.js
│   │   │   ├── orders.page.js
│   │   │   ├── providers.page.js
│   │   │   ├── request-create.page.js
│   │   │   ├── request-wizard.page.js
│   │   │   ├── search.page.js
│   │   │   └── support.page.js
│   │   ├── styles/
│   │   │   └── customer.css
│   │   ├── app.js
│   │   ├── customer-router.js
│   │   ├── customer-session.js
│   │   ├── index.html
│   │   ├── intro-3d.js
│   │   └── README.md
│   ├── guest/
│   │   ├── guest-entry.js
│   │   ├── guest-policy.js
│   │   └── README.md
│   └── provider/
│       ├── pages/
│       │   ├── active-jobs.page.js
│       │   ├── dashboard.page.js
│       │   ├── earnings.page.js
│       │   ├── incoming-requests.page.js
│       │   ├── notifications.page.js
│       │   ├── profile.page.js
│       │   ├── quotes.page.js
│       │   ├── request-details.page.js
│       │   ├── reviews.page.js
│       │   ├── schedule.page.js
│       │   ├── services.page.js
│       │   └── transactions.page.js
│       ├── styles/
│       │   └── provider.css
│       ├── app.js
│       ├── index.html
│       ├── login.html
│       ├── provider-auth.js
│       ├── provider-domain.js
│       ├── provider-request-domain.js
│       ├── provider-router.js
│       ├── provider-session.js
│       ├── provider-shell.js
│       └── README.md
├── assets/
│   ├── brand/
│   │   ├── hero-technician.jpg
│   │   ├── logo-wordmark-light.png
│   │   ├── logo-wordmark.png
│   │   ├── README.md
│   │   └── trust-handshake.jpg
│   ├── vendor/
│   │   ├── firebase/
│   │   │   └── 13.1.0/
│   │   │       ├── firebase-app-check.js
│   │   │       ├── firebase-app.js
│   │   │       ├── firebase-auth.js
│   │   │       ├── firebase-database.js
│   │   │       └── firebase-functions.js
│   │   ├── gsap.min.js
│   │   ├── lucide.LICENSE.txt
│   │   ├── README.md
│   │   ├── three.LICENSE.txt
│   │   └── three.module.min.js
│   ├── icon.svg
│   ├── logo-mark.webp
│   ├── logo-word.webp
│   ├── slide-guide.svg
│   ├── slide-latest.svg
│   └── slide-popular.svg
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js
│   │   │   ├── env.js
│   │   │   └── storage.js
│   │   ├── jobs/
│   │   │   ├── notification-worker.js
│   │   │   └── scheduled-tasks.js
│   │   ├── middleware/
│   │   │   ├── authenticate.js
│   │   │   ├── error-handler.js
│   │   │   ├── rate-limit.js
│   │   │   ├── require-account-status.js
│   │   │   ├── require-permission.js
│   │   │   └── validate-request.js
│   │   ├── modules/
│   │   │   ├── access-control/
│   │   │   │   ├── access.service.js
│   │   │   │   ├── permissions.routes.js
│   │   │   │   ├── policy.repository.js
│   │   │   │   └── roles.routes.js
│   │   │   ├── audit/
│   │   │   │   └── README.md
│   │   │   ├── auth/
│   │   │   │   ├── auth.controller.js
│   │   │   │   ├── auth.routes.js
│   │   │   │   ├── auth.service.js
│   │   │   │   └── session.repository.js
│   │   │   ├── catalog/
│   │   │   │   └── README.md
│   │   │   ├── complaints/
│   │   │   │   └── README.md
│   │   │   ├── customers/
│   │   │   │   └── README.md
│   │   │   ├── finance/
│   │   │   │   └── README.md
│   │   │   ├── notifications/
│   │   │   │   └── README.md
│   │   │   ├── orders/
│   │   │   │   └── README.md
│   │   │   ├── providers/
│   │   │   │   └── README.md
│   │   │   ├── quotes/
│   │   │   │   └── README.md
│   │   │   ├── reports/
│   │   │   │   └── README.md
│   │   │   ├── reviews/
│   │   │   │   └── README.md
│   │   │   ├── settings/
│   │   │   │   └── README.md
│   │   │   └── workforce/
│   │   │       ├── workforce.controller.js
│   │   │       ├── workforce.repository.js
│   │   │       ├── workforce.routes.js
│   │   │       └── workforce.service.js
│   │   ├── app.js
│   │   └── server.js
│   ├── tests/
│   │   ├── audit.test.js
│   │   ├── auth.test.js
│   │   ├── authorization.test.js
│   │   └── workforce.test.js
│   └── README.md
├── database/
│   ├── migrations/
│   │   └── README.md
│   ├── policies/
│   │   ├── access-matrix.md
│   │   └── data-access-policy.md
│   ├── schema/
│   │   ├── accounts.schema.js
│   │   ├── audit-events.schema.js
│   │   ├── complaints.schema.js
│   │   ├── customers.schema.js
│   │   ├── departments.schema.js
│   │   ├── employees.schema.js
│   │   ├── notifications.schema.js
│   │   ├── orders.schema.js
│   │   ├── permissions.schema.js
│   │   ├── providers.schema.js
│   │   ├── quotes.schema.js
│   │   ├── roles.schema.js
│   │   ├── services.schema.js
│   │   └── transactions.schema.js
│   ├── seeds/
│   │   └── README.md
│   └── README.md
├── docs/
│   ├── AI_CONTEXT/
│   │   ├── DOMAIN_MAPS/
│   │   │   ├── ADMIN.md
│   │   │   ├── CUSTOMER.md
│   │   │   ├── FRONTEND_RUNTIME.md
│   │   │   ├── FUTURE_BACKEND_BOUNDARY.md
│   │   │   ├── PROVIDER.md
│   │   │   ├── SHARED_AND_SERVICES.md
│   │   │   └── TESTING.md
│   │   ├── EXECUTION_CHECKPOINT.md
│   │   ├── FILE_INDEX.json
│   │   ├── README.md
│   │   ├── START_HERE.md
│   │   └── WORKFLOW.md
│   ├── DECISIONS/
│   │   ├── 2026-11-09-audit-log-demo-assumptions.md
│   │   ├── 2026-11-09-quotes-demo-assumptions.md
│   │   ├── 2026-11-09-reports-demo-assumptions.md
│   │   ├── 2026-11-09-security-demo-assumptions.md
│   │   ├── 2026-11-09-settlements-demo-assumptions.md
│   │   ├── 2026-11-09-system-settings-demo-assumptions.md
│   │   └── 2026-11-10-super-dashboard-demo-assumptions.md
│   ├── ADMIN_BACKEND_STATUS.md
│   ├── ADMIN_MODULES.md
│   ├── AI_AGENT_CONTINUATION_PROTOCOL.md
│   ├── AI_NEXT_IMPLEMENTATION_ORDER.md
│   ├── AI_PROJECT_MAP.csv
│   ├── AI_PROJECT_MAP.json
│   ├── AI_PROJECT_MAP.md
│   ├── API_CONTRACTS.md
│   ├── ARCHITECTURE_BLUEPRINT_V1.md
│   ├── ARCHITECTURE.md
│   ├── AUTHENTICATION.md
│   ├── DATA_MODEL.md
│   ├── DEPENDENCY_GRAPH.md
│   ├── DESIGN_SYSTEM_AUDIT.md
│   ├── DESIGN_SYSTEM_V9.md
│   ├── DEVELOPMENT_PROGRESS.md
│   ├── EMPTY_PLACEHOLDERS.md
│   ├── ENGINEERING_ENVIRONMENT_REPORT.md
│   ├── FILE_MAP.md
│   ├── FINAL_8_PERCENT_ENGINEERING_FINDINGS.md
│   ├── FINAL_AUDIT.md
│   ├── FIREBASE_BACKEND_BLUEPRINT.md
│   ├── FIREBASE_BACKEND.md
│   ├── FIREBASE_DATA_INVENTORY.md
│   ├── FIREBASE_MIGRATION_PLAN.md
│   ├── FIREBASE_SCHEMA.md
│   ├── FRONTEND_ARCHITECTURE.md
│   ├── FRONTEND_COMPONENT_CATALOG.md
│   ├── FRONTEND_DESIGN_SYSTEM.md
│   ├── FRONTEND_FILE_CATALOG.md
│   ├── FRONTEND_INTERACTION_SPEC.md
│   ├── FRONTEND_PAGE_CATALOG.md
│   ├── FRONTEND_QA_ACCEPTANCE.md
│   ├── FRONTEND_TEAM_AI_PROTOCOL.md
│   ├── HANDOFF_NEXT_AI.md
│   ├── HANSALEHLAK_MASTER_FUNCTIONAL_ARCHITECTURE.md
│   ├── HANSALHLAK_V8_PROGRESS.md
│   ├── ICON_ASSET_AUDIT.md
│   ├── ICON_SYSTEM_REPORT.md
│   ├── IMPLEMENTATION_STATUS.md
│   ├── INTRO_V2_REPORT.md
│   ├── KEYBOARD_ACCESSIBILITY_AUDIT.md
│   ├── MIGRATION_PLAN.md
│   ├── MIGRATION_REPORT.md
│   ├── NEW_FILES_REPORT.md
│   ├── P1_PROVIDER_AUDIT.md
│   ├── PERMISSIONS.md
│   ├── PROJECT_CONTROL_CENTER_GUIDE.md
│   ├── PROJECT_TREE.md
│   ├── PROMPT_LOG_V8.md
│   ├── PROVIDER_LEGACY_PARITY_AUDIT.md
│   ├── REMOVED_FILES_REPORT.md
│   ├── RESPONSIVE_AUDIT.md
│   ├── SECURITY_MODEL.md
│   ├── TEST_RESULTS.md
│   └── TESTING_STRATEGY.md
├── functions/
│   ├── domain/
│   │   ├── apps/
│   │   │   └── admin/
│   │   │       ├── modules/
│   │   │       │   └── workforce/
│   │   │       │       ├── employee-form.js
│   │   │       │       ├── employee-invitation.js
│   │   │       │       └── employee-status.js
│   │   │       ├── permission-guard.js
│   │   │       └── rbac-store.js
│   │   ├── services/
│   │   │   ├── admin-api.js
│   │   │   ├── api-client.js
│   │   │   ├── auth-api.js
│   │   │   ├── catalog-api.js
│   │   │   ├── customer-api.js
│   │   │   ├── finance-api.js
│   │   │   ├── local-catalog.js
│   │   │   ├── local-market-store.js
│   │   │   ├── notifications-api.js
│   │   │   ├── orders-api.js
│   │   │   ├── provider-api.js
│   │   │   ├── quotes-api.js
│   │   │   └── support-api.js
│   │   ├── shared/
│   │   │   └── config/
│   │   │       └── legacy-data.js
│   │   └── manifest.json
│   ├── src/
│   │   ├── admin-extra.js
│   │   ├── identity.js
│   │   ├── limits.js
│   │   ├── partial.js
│   │   ├── plan.js
│   │   ├── runtime.js
│   │   ├── scope.js
│   │   ├── service.js
│   │   ├── store.js
│   │   └── workforce.js
│   ├── .env.example
│   ├── .gitignore
│   ├── index.js
│   ├── package-lock.json
│   └── package.json
├── scripts/
│   ├── build-lucide-icons.cjs
│   ├── inventory-files.mjs
│   ├── refresh-project-inventory.mjs
│   ├── sync-functions-domain.cjs
│   └── verify-project-inventory.mjs
├── services/
│   ├── admin-api.js
│   ├── api-client.js
│   ├── auth-api.js
│   ├── catalog-api.js
│   ├── customer-api.js
│   ├── finance-api.js
│   ├── firebase-backend.js
│   ├── firebase-config.js
│   ├── local-attachments.js
│   ├── local-catalog.js
│   ├── local-market-store.js
│   ├── notifications-api.js
│   ├── orders-api.js
│   ├── provider-api.js
│   ├── quotes-api.js
│   ├── README.md
│   ├── realtime-client.js
│   ├── support-api.js
│   └── uploads-api.js
├── shared/
│   ├── components/
│   │   ├── accessible-tabs.js
│   │   ├── buttons.js
│   │   ├── data-grid.js
│   │   ├── dialogs.js
│   │   ├── forms.js
│   │   ├── notification-center.js
│   │   ├── status-badge.js
│   │   ├── tables.js
│   │   └── ui-kit.js
│   ├── config/
│   │   ├── app-config.js
│   │   ├── feature-flags.js
│   │   ├── legacy-data.js
│   │   └── routes.js
│   ├── design-system/
│   │   ├── components.css
│   │   ├── design-system.css
│   │   ├── layout.css
│   │   ├── tokens.css
│   │   └── typography.css
│   ├── icons/
│   │   └── icon-registry.js
│   ├── types/
│   │   ├── account.types.js
│   │   ├── order.types.js
│   │   ├── permission.types.js
│   │   └── provider.types.js
│   ├── utils/
│   │   ├── dates.js
│   │   ├── errors.js
│   │   ├── formatting.js
│   │   ├── money.js
│   │   ├── sanitization.js
│   │   ├── tree.js
│   │   └── validation.js
│   └── README.md
├── tests/
│   ├── e2e/
│   │   ├── lib/
│   │   │   ├── a11y-audit.js
│   │   │   └── cdp.js
│   │   ├── a11y.cdp.js
│   │   ├── admin-app.cdp.js
│   │   ├── audit-log.browser.js
│   │   ├── customer-orders.cdp.js
│   │   ├── customer-request-wizard-accessibility.browser.py
│   │   ├── customer-search-keyboard.browser.py
│   │   ├── customer-sheet-focus.browser.py
│   │   ├── firebase-emulator.cdp.js
│   │   ├── guest.cdp.js
│   │   ├── interaction.cdp.js
│   │   ├── provider-standalone.cdp.js
│   │   ├── quotes-management.browser.js
│   │   ├── README.md
│   │   ├── reports.browser.js
│   │   ├── responsive-sweep.cdp.js
│   │   ├── security.browser.js
│   │   ├── super-dashboard.browser.js
│   │   └── system-settings.browser.js
│   ├── emulator/
│   │   └── firebase-emulator.test.js
│   ├── fixtures/
│   │   └── README.md
│   ├── helpers/
│   │   ├── customer-app-harness.js
│   │   ├── design-token-audit.js
│   │   └── provider-app-harness.js
│   ├── integration/
│   │   └── README.md
│   ├── security/
│   │   └── README.md
│   └── unit/
│       ├── a11y-markup.test.js
│       ├── accessible-tabs-contract.test.js
│       ├── accessible-tabs.test.js
│       ├── admin-dashboard.test.js
│       ├── admin-modules.test.js
│       ├── admin-runtime.test.js
│       ├── admin-shell.test.js
│       ├── api-adapters.test.js
│       ├── audit-log.test.js
│       ├── catalog-wizard.test.js
│       ├── categories-management.test.js
│       ├── commissions.test.js
│       ├── complaints-management.test.js
│       ├── customer-page-renderers.test.js
│       ├── customer-providers-page.test.js
│       ├── customer-request-create.test.js
│       ├── customer-routing-session.test.js
│       ├── customer-screen-focus.test.js
│       ├── customer-workflow.test.js
│       ├── customers-management.test.js
│       ├── data-grid.test.js
│       ├── departments.test.js
│       ├── design-system.test.js
│       ├── design-token-audit.test.js
│       ├── dialogs.test.js
│       ├── discover.test.js
│       ├── finance-dashboard.test.js
│       ├── firebase-backend.test.js
│       ├── firebase-integration-contract.test.js
│       ├── firebase-mode-data.test.js
│       ├── frontend-contracts.test.js
│       ├── home.test.js
│       ├── icon-asset-audit.test.js
│       ├── inventory-reproducibility.test.js
│       ├── legacy-migration.test.js
│       ├── marketplace-rules.test.js
│       ├── notifications-management.test.js
│       ├── order-lifecycle.test.js
│       ├── orders-management.test.js
│       ├── provider-app-a11y.test.js
│       ├── provider-app-actions.test.js
│       ├── provider-app-register.test.js
│       ├── provider-app-routing.test.js
│       ├── provider-domain.test.js
│       ├── provider-pages.test.js
│       ├── provider-request-domain.test.js
│       ├── providers-management.test.js
│       ├── quotes-management.test.js
│       ├── rbac-pages.test.js
│       ├── rbac-store.test.js
│       ├── README.md
│       ├── reports.test.js
│       ├── responsive-audit.test.js
│       ├── responsive-sweep-regression.test.js
│       ├── reviews-management.test.js
│       ├── security.test.js
│       ├── service-worker-precache.test.js
│       ├── services-management.test.js
│       ├── settlements-edge-cases.test.js
│       ├── settlements.test.js
│       ├── shared-components.test.js
│       ├── shared-foundations.test.js
│       ├── static-audit.test.js
│       ├── status-badge.test.js
│       ├── super-dashboard.test.js
│       ├── system-settings.test.js
│       ├── tree.test.js
│       ├── ui-adapter-integration.test.js
│       ├── ui-kit.test.js
│       ├── upfront-pricing.test.js
│       └── workforce.test.js
├── _redirects
├── .editorconfig
├── .firebaserc
├── .gitattributes
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── database.rules.json
├── firebase.json
├── firestore.indexes.json
├── firestore.rules
├── HANSALEHLAK_FRONTEND_MASTER_REPORT_AR.md
├── index.html
├── manifest.json
├── package.json
├── PROJECT_CONTROL_CENTER.html
├── README.md
└── service-worker.js
```
