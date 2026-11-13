# Admin application (Admin Center — frontend demo)

Entry: `index.html`. Bootstrap `app.js` shows a demo account picker (fictional RBAC roster), then mounts `admin-shell.js` for the
selected demo employee with a presentation-only permission guard (`permission-guard.js` over `rbac-store.js`).

- Runtime: `admin-router.js`, `navigation-builder.js`, `admin-shell.js`, `admin-auth.js`, `admin-session.js`, `app.js`, `login.html` (hand-off to the picker).
- Pages: `pages/*.page.js` — every menu item has a registered demo page (`super-dashboard.page.js` loads last).
- Modules: `modules/workforce/*` (status, form, invitation), `modules/audit/*` (filters, details), `modules/access-control/*` (permission matrix, presets, role editor).
- Styles: `styles/admin.css`, `admin-components.css`, `admin-responsive.css` (design-system tokens; literal baseline guarded by `design-token-audit.test.js`).

Everything is local demo behavior: no real authentication, authorization enforcement, invitations, payments or backend.
The legacy Admin console inside `apps/provider/legacy/portal-compat.js` (reached from the Customer menu) is separate.
See `docs/AI_CONTEXT/DOMAIN_MAPS/ADMIN.md`.
