# Execution Checkpoint

Compact resume state for autonomous sessions. Update after every committed batch. Commit hashes: `git log --oneline`.

## Completed batches (2026-11-13)
1. Provider P0 behavior tests + stale-action fixes — `854e281`.
2. Provider P1 accessibility — `5b25c44`.
3. Provider P2 real-browser QA + visual fixes — `b2003ae`.
4. Service Worker precache completeness — `c137eef`.
5. Provider P3 legacy parity audit — `7bbe4c8`.
6. Provider G3 commission preview + G4 login hand-off — `b85425c`.
7. Provider G1 demo self-registration (+ nav `[hidden]`, sticky-chrome, picker-cancel fixes) — `8e081d9`.
8. Customer Orders/Tracking focus — `apps/customer/app.js` (`renderTabs` keeps tab focus; `show()` restores lost focus via
   `requestFocusAfterShow`/heading/`#view`; `head()` heading `tabindex="-1"`), `market-ui.page.js` (filter focus request; timeline
   `aria-current="step"`), `tests/unit/customer-screen-focus.test.js` (new, 9), `tests/e2e/lib/cdp.js` (new, shared helpers),
   `tests/e2e/customer-orders.cdp.js` (new), Provider runner refactored onto lib (still 231/231), SW cache `-12`, docs.
   `npm test` 265/265; Customer browser 60/60. Commit `cf1e81c`.
9. Customer routing/session/guest — placeholders converted to real modules: `apps/customer/customer-session.js`, `customer-router.js`,
   `apps/guest/guest-policy.js`, `guest-entry.js` (+ `apps/guest/README.md`); wired into `index.html`, `app.js`, `account.page.js`, `market-ui.page.js`,
   `request-wizard.page.js`; SW cache `-13`. Tests: `customer-routing-session.test.js` (12; 0/12 on placeholders), shared `customer-app-harness.js`.
   `npm test` 277/277; Customer browser 68/68. Commit `e4c2f99`.
10. Customer providers + request-create — placeholders converted: `apps/customer/pages/providers.page.js` (extracted from market-ui,
   78 renders byte-identical), `pages/request-create.page.js` (`#/request[/<catalogId>]` → existing wizard). Fixed: `hashchange` now reads
   `event.newURL` (Chromium popstate-before-hashchange clobbered typed links). Tests: `customer-providers-page` (6), `customer-request-create` (6),
   +1 routing regression; SW cache `-14`. `npm test` 290/290; Customer browser 75/75. Commit `f0c57c4`.
11. Admin runtime — 7 placeholders converted: `apps/admin/{admin-router,navigation-builder,permission-guard,admin-auth,admin-session,app}.js`,
   `login.html`; shell delegates routing/nav, gains `setAccess`/`setAccount`/denied state. Tests: `admin-runtime.test.js` (7), browser
   `tests/e2e/admin-app.cdp.js` 60/60. `npm test` 297/297. Commit `85c1cb3`.
12. Admin modules — 8 placeholders converted (workforce ×3, audit ×2, access-control ×3) by extraction from pages (42-point HEAD parity, 0 diffs)
   + permission presets wired into the role editor. Tests: `admin-modules.test.js` (8); Admin browser 69/69. `npm test` 305/305.

## Completed batches (2026-11-14, "Final frontend engineering completion")
13. Visual refresh: logo-aligned palette and intro. Commit `e75650e`.
14. Marketplace rules, role isolation, legacy migration. Commit `cb3789f`.
    - Zero-value quotes are refused in the store, the Provider UI and on approve.
    - Free-service workflow: `MP.proposeFree/respondFree/completeFree`, Provider form `pv-free-form`, Customer accept/decline.
    - Provider `#/join` onboarding and profile editing.
    - Customer Admin/role switching removed; "انضم كمقدم خدمة" now links to Provider onboarding.
    - Legacy `portal-compat.js` and `provider-workspace.js` deleted after their Admin console capabilities moved to the
      new `apps/admin/pages/marketplace.page.js` (live MP).
    - Admin picker 320px overflow fixed (body margin).
    - Tests: `marketplace-rules` and `legacy-migration`. SW `-16`.
15. Backend-ready mock adapters. Commit `bcf2f89`.
    - `services/api-client.js` + 11 `*-api.js` + `realtime-client.js`: 50 routes, envelope, role and ownership checks,
      `setTransport` seam, no network.
    - `docs/API_CONTRACTS.md`; tests in `api-adapters.test.js` (14).
16. Provider screen change resets scroll (logout from a scrolled page left the register form off-screen at 768px).
    Dead `.role-bar`/`role-mode` CSS removed; the manual Playwright sweep was updated; SW `-18`. Commit `67a316a`.
    - Verified: `npm test` 326/326.
    - Browser runs: Customer 145/145, Provider 261/261, Admin 124/124 at 1280/768/430/390/320.

## Current task
Customer Addresses + Support keyboard & accessibility (Phase 5 item 4).

## Remaining queue (priority order)
1. Customer Addresses + Support a11y.
2. Optional: migrate screens from direct `MP` calls onto the mock adapters, one screen per batch, with parity tests.
3. Console/network smoke across entries; Admin keyboard traversal; Guest-specific CDP runner (Guest is currently checked
   inside the Customer runner's isolation loop).
4. Deferred by decision: split design-system CSS (pinned empty by `design-token-audit.test.js`).

## Resolved decisions (2026-11-14 directive)
- Customer → Provider is the onboarding invitation to `apps/provider/index.html#/join` (no role switch, no auto-grant).
- The legacy Admin console was migrated to `apps/admin/pages/marketplace.page.js`, then removed.
- Zero-value quotes are forbidden; free service is its own workflow. Provider profile editing is enabled.

## Pending user decisions
- `test-write.tmp` is ignored locally but listed in the inventory (a clean clone reports it missing).
- Approving a quote while the request is in `quote` completes the job immediately (existing store semantics, pinned by
  `api-adapters.test.js`). Confirm whether a separate "provider marks done" step is wanted.

## Exact next action
Read `apps/customer/pages/addresses.page.js` and `support.page.js` handlers/forms; reuse `tests/helpers/customer-app-harness.js`.
