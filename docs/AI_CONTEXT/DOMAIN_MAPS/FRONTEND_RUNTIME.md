# Frontend Runtime Map

## Entry points and observed wiring

### Customer
- Entry: `apps/customer/index.html`
- Ordered classic scripts: icon registry → legacy data → local catalog → local market store → `apps/customer/app.js` → UI kit → market UI → request wizard → Provider legacy compatibility bridge → Provider workspace → local attachments → search → discover → addresses → account → support.
- Main concentration points: `apps/customer/app.js`, `apps/customer/pages/market-ui.page.js`, `apps/customer/pages/request-wizard.page.js`, `apps/customer/styles/customer.css`.
- Several customer page files are placeholders or planned extraction targets; behavior may still live in the large legacy modules.

### Provider
- Entry scaffold: `apps/provider/index.html` (currently no script chain).
- Legacy runtime currently loaded from Customer entry: `apps/provider/legacy/portal-compat.js` and `apps/provider/provider-workspace.js`.
- Do not treat `apps/provider/pages/*.page.js` as an independently running app until runtime wiring exists.
- Do not remove compatibility bridge until a new Provider shell is implemented and regression parity is proven.

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

## Safe change rule
Classic script order and globals are runtime contracts. Any move, module conversion, or file split must update script wiring and add regression tests before removing old wiring.
