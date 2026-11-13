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
- `tests/unit/provider-app-actions.test.js` — P0 behavior: account select/logout, gate, availability, accept/reject (reason required), propose/confirm, advance (valid/invalid/final), quote validation, completion bounds, stale-action failures, local-only mutation invariant (25 tests).
- `tests/unit/provider-app-routing.test.js` — P0 routes: every tab, unknown/query/legacy hash fallback, group routes, details deep link, missing/unknown/malformed/foreign IDs, reload persistence, no-session deep link (12 tests).
- `tests/unit/provider-app-a11y.test.js` — P1 focus/semantics: route-change focus + titles, same-route focus restoration, inline form naming/focus/single instance/Escape/cancel focus return, reduced motion, live region, native labelled buttons (14 tests).
- Harness: `tests/helpers/provider-app-harness.js` loads the real script list parsed from `index.html` into `node:vm` with a minimal DOM and dispatches through the app's delegated listeners, only on rendered controls (`force` simulates stale UI).
- Full suite: `npm test`.

### Runtime behavior contracts added in P0 (2026-11-13)
- `accept`, `confirm`, reject submit and propose submit check the `MP` result; on `false` (stale view, e.g. customer cancelled) the view re-renders and shows `تعذر تنفيذ الإجراء…` instead of a success toast, and no route change happens.
- Reject requires a non-empty reason (`select[required]` + runtime check). Propose refuses past times (mirrors the input `min`).
- Quote submit requires labor and non-negative finite amounts (mirrors the form constraints). A zero total is still accepted — no documented product rule; open decision.
- Completion additionally rejects non-finite values; bound remains `0 <= deductions <= value`, `value > 0`.
- A successful `advance` on a group route follows the request to its new group (as accept/reject/quote/complete already route); details and home keep their route.

### Focus and semantics contracts added in P1 (2026-11-13)
- `render(focusTargets)`: a route change focuses `#provider-view` (never on initial load); a same-route re-render focuses the first matching selector, else the view. Availability keeps focus on its toggle; confirm/advance focus the request's next `advance` control, else its details control.
- `document.title` = `<route label> | مساحة مقدم الخدمة | هنصلحلك` (picker: `اختيار حساب العرض`, gate: `حالة الحساب`, details: `تفاصيل الطلب`).
- Inline forms: one at a time (previous removed — fixes duplicate ids), `aria-label` with the request number, first field focused, Escape or Cancel closes and returns focus to the opening control, validation errors keep focus in the form and are announced via the polite toast.
- `scrollIntoView` uses `auto` under `prefers-reduced-motion: reduce`. Visible focus comes from `design-system.css` `:focus-visible`.

Do not confuse source/script-order tests with end-to-end browser proof. Standalone Provider browser verification is pending if the environment blocks local navigation.

## 7. Next work — exact priority
1. ✅ **P0 behavior tests — done 2026-11-13** (see §6). Known, deliberately unchanged: selecting an account after opening a deep link without a session lands on `#/home`, not the original link.
2. ✅ **P1 accessibility — done 2026-11-13** (see §6). Not verified: real screen readers; per-field `aria-invalid`/`aria-describedby` (errors are announced via the live toast instead).
3. ✅ **P2 browser QA — done 2026-11-13** with `tests/e2e/provider-standalone.cdp.js` (real Edge, 170/170 at 1280/768/430/390/320). Defects found and fixed: all `ic()` icons rendered at container size with black fill (no `svg.i` rule in `provider.css`); `.pv-availability`, `.pv-toast`, `.pv-note`, `.pv-quote` had no styles (toast text lingered in page flow); missing favicon link caused a 404. Guards: `provider-pages.test.js` (every runtime `pv-*` class has a rule; icon contract; favicon). Not covered: WebKit/Firefox, real screen readers, Cairo webfont (blocked for determinism).
4. ✅ **P3 legacy parity audit — done 2026-11-13:** `docs/PROVIDER_LEGACY_PARITY_AUDIT.md` + `tests/unit/provider-legacy-parity.test.js` (grouping identical across 105 combinations; shared `MP` store; separate demo identities). `portal-compat.js` also hosts a legacy **Admin** console. Gaps: **G1** self-registration, **G2** profile edit (decision: keep disabled), **G3** commission preview on completion, **G4** `login.html` placeholder. Retirement not recommended yet.
5. ✅ **G3 + G4 — done 2026-11-13:** completion form live commission/net preview (`completionPreview`, `#pv-complete-preview`, `.pv-calc`, `input` listener; rate from `MP.rateFor(cat, provider)`); `login.html` hands off to the standalone picker with a demo notice.
6. **Next:** G1 standalone self-registration. Do not reroute Customer entries or unload the bridge without a recorded decision.

See `docs/AI_AGENT_CONTINUATION_PROTOCOL.md` sections 5–6. Do not start another Provider visual rebuild before P0 tests are added.
