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
   `tests/e2e/admin-app.cdp.js` 60/60. `npm test` 297/297.

## Current task
Admin `modules/*` (8 placeholders) extracted from pages (see `START_HERE.md`).

## Remaining queue (priority order)
1. Admin `modules/*` (access-control ×3, audit ×2, workforce ×3): extract from pages with parity tests.
2. Customer Addresses + Support a11y; console/network smoke; Admin keyboard traversal.
3. Not implementable in this phase: `services/*-api.js` (backend HTTP); split design-system CSS (needs a migration decision).

## Pending user decisions
- Reroute Customer «بوابة مقدم الخدمة»/«انضم الآن» to the standalone Provider app (separate demo identities).
- Legacy Admin console inside `portal-compat.js` vs `apps/admin/` (separate audit).
- Zero-total Provider quotes accepted (no documented rule); Provider profile edit stays disabled (G2).
- `test-write.tmp` is ignored locally but listed in the inventory (a clean clone reports it missing).

## Exact next action
Grep `pages/permissions.page.js`, `roles.page.js`, `audit-log.page.js`, `workforce.page.js` for the matrix/presets/editor/details/filters/form/invitation/status functions; extract one module at a time.
