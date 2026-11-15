# Admin Center — backend integration status (Firebase mode, 2026-11-15)

**Live pages read the server read model** (`session.sync` admin window, written into MP by `services/firebase-backend.js`)
and act only through deployed API routes, via `apps/admin/modules/admin-live.js`. Actions without a server route are
refused with an explicit message (HTTP-like 501), never simulated. Pages that are not yet integrated are **gated**: they
show "not connected to the server yet" instead of fixtures. In local mode (development and tests) every page keeps
its fixtures.

## Live (10 of 24 pages)

| Page | Data (collections) | Real actions (routes) | Refused (no server route) |
|---|---|---|---|
| marketplace | providers, requests, assignments, transactions, complaints, system/settings | Approve, reject or suspend a provider; special rate; assign / auto-match; collection status; commission rates; resolve a complaint | — |
| orders | requests (+ customers, assignments, transactions, quotes) | Cancel (`POST /requests/:id/cancel`) | Other status transitions (they belong to the provider or customer lifecycle); admin notes |
| customers | customers (+ requests, transactions) | Suspend / reactivate (`POST /admin/customers/:id/status`) | Notes |
| providers | providers (+ reviews for rating) | Approve, reject or suspend (`POST /admin/providers/:id/status`; rejection only for pending, enforced server-side) | Notes; per-document review (the backend stores one documents field) |
| complaints | complaints (+ requests, customers, providers) | Resolve (`POST /complaints/:id/resolve`) | Dismiss, classify, assign, notes |
| reviews | reviews (+ requests, customers, providers) | — (read-only) | Hide/publish moderation: no route exists |
| workforce, employee details, roles, permissions | employees, admins, system/rbac | Invite, edit, status, re-invite; roles; overrides | — |

The dashboard route shows live counts (`GET /admin/summary`, aggregation queries) inside its gate.

## Gated (14 pages): what each needs
| Page | Missing backend piece or business rule |
|---|---|
| dashboard (full page), super-dashboard | KPI definitions beyond the 6 live counts (trend periods, targets) are not specified; the live counts are shown |
| finance-dashboard, commissions, settlements, reports | Settlement entity and payout workflow are not defined in the business rules. Collection and commission routes exist and are used by the marketplace page. Mapping the fixture KPIs needs an agreed formula set (see `docs/API_CONTRACTS.md` business rules). |
| quotes | Admin quote decisions (return, expire) have no business rule. A read-only mapping is possible once the page's FLOW is reconciled with server quote states (pending, approved, rejected, superseded). |
| notifications | Broadcast campaigns and delivery logs have no backend (no SMS, email or push provider) |
| categories, services | The catalogue is code (`services/local-catalog.js`, `CAT`); editing needs a server catalogue collection and publish workflow |
| departments | Departments are a fixed list in the workforce module; no department entity exists |
| security | Session and device management needs Auth admin APIs; no rule set has been defined |
| system-settings | Only commission settings have routes; other settings have no schema |
| audit-log | Needs a read endpoint for the `audit` collection (owner/admin only). This is a new Functions route and requires a deployment. |

## Known behaviour
- **One Firebase Auth session per origin.** The three apps share a host, so signing in as a provider signs the owner
  out of the Admin app, and the reverse. Use separate browser profiles or hosts for parallel roles.
- **Admin lists show the sync window:** 200 most recent requests, 300 providers, 300 customers, 200
  complaints/transactions/reviews. The API supports cursor pagination for older records.
