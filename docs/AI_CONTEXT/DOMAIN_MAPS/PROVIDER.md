# Provider Domain Map — Current Verified Architecture

**Status:** standalone `IMPLEMENTED (FRONTEND DEMO)`; legacy compatibility remains active for Customer.  
**Authoritative entry:** `apps/provider/index.html`.

## 1. Standalone script dependency order
The HTML script order is intentional:
1. `shared/icons/icon-registry.js`
2. `shared/config/legacy-data.js`
3. `services/local-catalog.js`
4. `services/local-market-store.js` (`MP`)
5. `provider-request-domain.js`
6. `provider-domain.js`
7. `provider-auth.js`
8. `provider-session.js`
9. `provider-router.js`
10. `provider-shell.js`
11. Twelve page renderers under `pages/`
12. `app.js` (last application script; mounts and binds the runtime)

When adding/reordering scripts, inspect actual globals and run script-order/contract tests. Do not convert to modules or reorder based on stylistic preference.

## 2. File responsibilities
| File | Ownership / contract |
|---|---|
| `index.html` | RTL entry, stylesheet, ordered scripts, service-worker registration |
| `app.js` | Current provider, MP reads, render orchestration, route handling, event delegation, local demo actions and forms |
| `provider-shell.js` | Mounts shell and returns host/view/nav/toast DOM references |
| `provider-router.js` | Hash route parse/navigation; verify actual supported route names in source/tests |
| `provider-auth.js` | Resolves/selects seeded demo accounts; NOT trusted identity verification |
| `provider-session.js` | Stores/clears selected demo provider ID; NOT secure authentication/session |
| `provider-request-domain.js` | Request grouping/derived provider request state |
| `provider-domain.js` | Provider domain adapter/constants consumed by app |
| `pages/*.page.js` | Presentation-only renderers; receive explicit context, return markup |
| `styles/provider.css` | Standalone Provider responsive visual system |
| `services/local-market-store.js` | LocalStorage-backed `MP` demo store; not an API/backend |
| `legacy/portal-compat.js` | Legacy bridge for Customer's Provider experience; not loaded by standalone Provider |
| `provider-workspace.js` | Legacy Customer-integrated workspace; do not delete before parity proof |

## 3. Renderer inventory
- `dashboard.page.js`
- `incoming-requests.page.js`
- `request-details.page.js`
- `quotes.page.js`
- `active-jobs.page.js`
- `schedule.page.js`
- `services.page.js`
- `earnings.page.js`
- `transactions.page.js`
- `reviews.page.js`
- `notifications.page.js`
- `profile.page.js`

Renderers do not own persistence or business transitions. The runtime owns actions. Keep action selectors/data attributes stable unless all callers/tests are updated.

## 4. Data and safety boundaries
- `MP` is local demo data in browser storage.
- `provider-auth.js` is demo account selection.
- `provider-session.js` is a demo identity pointer.
- Accept/reject/propose/confirm/quote/advance/complete are local simulations.
- Earnings/transactions are illustrative; no real balance, collection, transfer or payout exists.
- No production API, backend authorization or database persistence is connected.
- Do not introduce personal or production records into fixtures.

## 5. Compatibility boundary
Customer's legacy Provider route is separate from the standalone entry. `portal-compat.js` and `provider-workspace.js` remain required until proven otherwise. Before retirement, inventory:
- Customer entry script order and every bridge consumer;
- globals/functions/DOM selectors/storage keys and route fragments;
- all action workflows and visible states;
- behavioral parity tests for both routes;
- browser regression for Customer and standalone Provider.

No removal based only on static import search or apparent duplication.

## 6. Current test references
- `tests/unit/provider-pages.test.js`
- `tests/unit/provider-domain.test.js`
- `tests/unit/provider-request-domain.test.js`
- `tests/unit/provider-workspace.test.js`
- `tests/unit/frontend-contracts.test.js` (shared app contracts; inspect current assertions)
- Full suite: `npm test`.

Do not confuse source/script-order tests with end-to-end browser proof. Standalone Provider browser verification is pending if the environment blocks local navigation.

## 7. Next work — exact priority
1. **P0 behavior tests:** account select/session clear, availability, accept/reject, propose/confirm time, quote validation, status advancement valid/invalid, completion and deductions boundaries, route/deep-link behavior, unknown IDs/routes, and local-only mutation invariant.
2. **P1 accessibility:** keyboard navigation, visible focus, accessible names/labels, error associations, route-change focus and live feedback.
3. **P2 browser QA:** 1280/768/430/390/320px; route refresh/deep links, overflow, console and local asset checks.
4. **P3 legacy parity:** map bridge/workspace contracts and prove parity before any removal.

See `docs/AI_AGENT_CONTINUATION_PROTOCOL.md` sections 5–6. Do not start another Provider visual rebuild before P0 tests are added.
