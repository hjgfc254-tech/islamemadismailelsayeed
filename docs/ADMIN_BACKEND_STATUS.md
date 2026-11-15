# Admin Center — backend integration status (Firebase mode, 2026-11-15)

**Live pages read the server read model** (`session.sync` admin window, written into MP by `services/firebase-backend.js`)
and act only through deployed API routes, via `apps/admin/modules/admin-live.js`. Actions without a server route are
refused with an explicit message (HTTP-like 501), never simulated. The 9 pages listed under Live panels mount server panels instead (see below). In local mode (development and tests) every page keeps
its fixtures.

## Mapped pages (15 of 24)

| Page | Data (collections) | Real actions (routes) | Refused (no server route) |
|---|---|---|---|
| marketplace | providers, requests, assignments, transactions, complaints, system/settings | Approve, reject or suspend a provider; special rate; assign / auto-match; collection status; commission rates; resolve a complaint | — |
| orders | requests (+ customers, assignments, transactions, quotes) | Cancel (`POST /requests/:id/cancel`) | Other status transitions (they belong to the provider or customer lifecycle); admin notes |
| customers | customers (+ requests, transactions) | Suspend / reactivate (`POST /admin/customers/:id/status`) | Notes |
| providers | providers (+ reviews for rating) | Approve, reject or suspend (`POST /admin/providers/:id/status`; rejection only for pending, enforced server-side) | Notes; per-document review (the backend stores one documents field) |
| complaints | complaints (+ requests, customers, providers) | Resolve (`POST /complaints/:id/resolve`) | Dismiss, classify, assign, notes |
| reviews | reviews (+ requests, customers, providers) | — (read-only) | Hide/publish moderation: no route exists |
| quotes | quotes (+ requests, customers, providers) | — (read-only) | Approve/reject/return: on the server the decision belongs to the customer (`/quote/approve`, `/quote/reject`); the backend has no quote expiry, so none is shown |
| dashboard | KPIs from real records: requests, new customers, approved providers, commission of paid transactions, average review stars, open complaints; delta vs the preceding period of equal length | — | Fixture tasks/alerts and split details are not shown |
| finance (dashboard) | transactions (value, commission, net, collection; free services excluded), bucketed into the page categories | — (read-only) | Discrepancy review (no discrepancy records exist). Settled/pending dues are 0: in the current collection model the platform makes no payouts (see the payout decision) |
| settlements | transactions per provider (Uber cash model: the customer pays the provider; the provider owes the platform share = commission) | Collect a provider's uncollected platform share (each pending transaction → `POST /admin/transactions/:id/collection {collected}`) | Review / approve / hold steps (no rule on the server) |
| categories | The real service catalogue (`CAT`: categories → devices/work types, problem counts) + base prices | Set or clear the base price of a device/work type (`POST /admin/pricing`, Uber-style upfront pricing) | Create, edit, move, activate: the catalogue is code; editing needs a server catalogue |
| workforce, employee details, roles, permissions | employees, admins, system/rbac | Invite, edit, status, re-invite; roles; overrides | — |


## Live panels (9 pages, `apps/admin/modules/admin-live-panels.js`)
These pages were built on fixture-only entities. In Firebase mode the shell mounts a compact server panel that shows real data and real actions only. No Admin page is gated any more.

| Page | Data (route) | Real actions |
|---|---|---|
| audit-log | `GET /admin/audit` | — |
| system-settings | `GET /admin/settings` | Auto-assign and customer fee (`POST /admin/settings`); platform markup (`POST /admin/pricing`) |
| departments | `GET /admin/departments` | Add; activate or deactivate (`POST` / `PATCH /admin/departments`) |
| security | `GET /admin/security/admins` (last sign-in from Auth) | Revoke sessions (`POST /admin/security/revoke/:uid`; owner only, never self) |
| notifications | `GET /admin/notifications/broadcasts` | In-app broadcast to active customers or approved providers (`POST /admin/notifications/broadcast`, max 500 recipients). There is no SMS, email or push provider. |
| commissions | `GET /admin/commission`, `GET /admin/pricing` | Default rate (`POST /admin/commission`) |
| reports | Requests by status and completed transactions over 7/30/90 days (sync window) | — |
| super-dashboard | `GET /admin/summary` plus the uncollected platform share | — |
| services | Catalogue items with the provider amount and the customer price | Prices are edited on the categories page |
## Known behaviour
- **One Firebase Auth session per origin.** The three apps share a host, so signing in as a provider signs the owner
  out of the Admin app, and the reverse. Use separate browser profiles or hosts for parallel roles.
- **Admin lists show the sync window:** 200 most recent requests, 300 providers, 300 customers, 200
  complaints/transactions/reviews. The API supports cursor pagination for older records.
