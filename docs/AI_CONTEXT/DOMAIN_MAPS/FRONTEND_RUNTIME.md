> **Historical — frontend-only phase (2026-11-13/19).** This document describes the platform before it went live on Firebase. The real backend, payments, catalogue, call centre and security model are in `docs/MAINTENANCE_GUIDE.md`, and the current state is in `docs/AI_CONTEXT/START_HERE.md`. Source code wins over this file.

# Frontend Runtime Map

## Entry points and observed wiring

### Customer
- Entry: `apps/customer/index.html`
- Ordered classic scripts (verified against `index.html` 2026-11-14): icon registry → accessible tabs → legacy data → local catalog → local market store → `customer-session.js` → `customer-router.js` → `../guest/guest-policy.js` → `../guest/guest-entry.js` → `pages/home.page.js` → `apps/customer/app.js` → UI kit → `pages/orders.page.js` → `pages/order-details.page.js` → `pages/providers.page.js` → market UI → request wizard → `pages/request-create.page.js` → local attachments → search → discover → addresses → account → support. Registers the Service Worker from `app.js`.
- Main concentration points: `apps/customer/app.js`, `apps/customer/pages/market-ui.page.js`, `apps/customer/pages/request-wizard.page.js`, `apps/customer/styles/customer.css`.
- Several customer page files are placeholders or planned extraction targets; behavior may still live in the large legacy modules.

### Provider
- Standalone entry: `apps/provider/index.html` with its own 23-script chain, shell, router and 12 renderers; registers the Service Worker inline. See `DOMAIN_MAPS/PROVIDER.md`.
- The legacy in-Customer bridge (`portal-compat.js`, `provider-workspace.js`) was **removed 2026-11-14**. Customer links to `apps/provider/index.html#/join` for onboarding only; it has no role switching.

### Admin
- Entry: `apps/admin/index.html`.
- Load order: see `DOMAIN_MAPS/ADMIN.md`. Since 2026-11-14 the entry also loads `shared/config/legacy-data.js` → `services/local-catalog.js` → `services/local-market-store.js` (after `rbac-store.js`) for `pages/marketplace.page.js`, which runs live operations on the shared `MP` store.
- Isolation: Admin is reachable only from its own entry. No Customer or Provider file links to it (`tests/unit/legacy-migration.test.js`).
- Implemented pages are registered with `HSAdminShell`; check `HSAdminShell.NAV` and the actual script list before adding a page.
- Admin is a local demo interface; it is not production authentication, RBAC enforcement, or backend-connected.

### Guest
- Guest is a restricted mode of the Customer app: `apps/guest/guest-policy.js` + `guest-entry.js` are loaded by the Customer entry (sign-in gate with return-to via `hs_return_to`).

## Cross-cutting dependencies
- Shared design system: `shared/design-system/`.
- Shared UI: `shared/components/`.
- Shared utilities: `shared/utils/`.
- Local demo data/services: `services/` (`MP`, `CAT`, `AT`). Backend-ready **mock adapters**: `services/api-client.js` + `*-api.js` + `realtime-client.js`. No entry loads them yet; contract in `docs/API_CONTRACTS.md`.
- Assets/icons: `assets/`, `shared/icons/`.

## Service Worker (`service-worker.js`)
- Navigation: network-first, cache fallback. Assets: cache-first, then network (runtime-cached).
- Offline entries are the ones that register the worker: Customer and Provider. On a first visit the worker does not control
  the page yet, so **every local script/stylesheet/icon those entries load must be in `FILES`** or the app breaks offline
  (proven 2026-11-13: missing `home.page.js` made the Customer home fail after an offline reload).
- Admin has no manifest and does not register the worker; it is deliberately not precached.
- Guard: `tests/unit/service-worker-precache.test.js` derives the asset list from the entry HTML. When adding/moving a precached
  file, add it to `FILES` and bump `CACHE` (four tests pin the version literal).

## Safe change rule
Classic script order and globals are runtime contracts. Any move, module conversion, or file split must update script wiring and add regression tests before removing old wiring.
