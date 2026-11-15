# Admin Modules

The former legacy Admin console (`portal-compat.js`) was removed on 2026-11-14; its live operations are `apps/admin/pages/marketplace.page.js`. Admin Center pages and `modules/*` are implemented as local demos (see `docs/AI_CONTEXT/DOMAIN_MAPS/ADMIN.md`). Planned domains include workforce, access control, departments, catalog/services, providers, customers, orders, quotes, complaints, reviews, finance, reports, notifications, audit, security and system settings. No workforce or permission workflow is implemented.


## Admin shell (implemented, demo)

`apps/admin/admin-shell.js` provides the frame only. A page plugs in with `HSAdminShell.registerPage(id, { title, description?, actions?, render(ctx) })`; `id` must be one of the documented pages (see `HSAdminShell.NAV`) or the hidden `employee-details`. Nav items for pages with no registration render disabled with a "قريبًا" tag and open an honest "غير منفذة بعد" state if reached by URL. Routing is a minimal hash route (`#/<id>`); a future `admin-router.js` can replace it by calling `navigate()`/`refresh()`. The shell never enforces permissions and states this in a banner. Decision: the navigation list lives inside the shell for now; `navigation-builder.js` remains a placeholder until an RBAC source exists.
