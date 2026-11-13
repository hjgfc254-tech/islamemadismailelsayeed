# Frontend Runtime Map

## Entry points and observed wiring

### Customer
- Entry: `apps/customer/index.html`
- Ordered classic scripts (verified against `index.html` 2026-11-13): icon registry → accessible tabs → legacy data → local catalog → local market store → `customer-session.js` → `customer-router.js` → `../guest/guest-policy.js` → `../guest/guest-entry.js` → `pages/home.page.js` → `apps/customer/app.js` → UI kit → `pages/orders.page.js` → `pages/order-details.page.js` → market UI → request wizard → Provider legacy compatibility bridge → Provider workspace → local attachments → search → discover → addresses → account → support. Registers the Service Worker from `app.js`.
- Main concentration points: `apps/customer/app.js`, `apps/customer/pages/market-ui.page.js`, `apps/customer/pages/request-wizard.page.js`, `apps/customer/styles/customer.css`.
- Several customer page files are placeholders or planned extraction targets; behavior may still live in the large legacy modules.

### Provider
- Standalone entry: `apps/provider/index.html` with its own 23-script chain, shell, router and 12 renderers; registers the Service Worker inline. See `DOMAIN_MAPS/PROVIDER.md`.
- Legacy runtime still loaded from the Customer entry: `apps/provider/legacy/portal-compat.js` and `apps/provider/provider-workspace.js`.
- Do not remove the compatibility bridge until a parity audit (Provider P3) proves behavior parity.

### Admin
- Entry: `apps/admin/index.html`.
- Load order: shared icon registry → status badge → data grid → dialogs → tree utility → money utility → `admin-shell.js` → `rbac-store.js` → registered page scripts.
- Implemented pages are registered with `HSAdminShell`; check `HSAdminShell.NAV` and the actual script list before adding a page.
- Admin is a local demo interface; it is not production authentication, RBAC enforcement, or backend-connected.

### Guest
- `apps/guest/` is a small entry/policy scaffold. Verify its actual linking from root routes before expanding it.

## Cross-cutting dependencies
- Shared design system: `shared/design-system/`.
- Shared UI: `shared/components/`.
- Shared utilities: `shared/utils/`.
- Local demo data/services: `services/`.
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
