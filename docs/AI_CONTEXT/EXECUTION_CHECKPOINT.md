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
   `npm test` 265/265; Customer browser 60/60.

## Current task
Customer Addresses and Support keyboard & accessibility (Phase 5 item 4) — see `START_HERE.md`.

## Remaining queue (priority order)
1. Customer Addresses + Support a11y.
2. Phase 5 item 5: console/network smoke across Customer and Admin entries (reuse `lib/cdp.js` error collection).
3. Admin page/dialog keyboard traversal.

## Pending user decisions
- Reroute Customer «بوابة مقدم الخدمة»/«انضم الآن» to the standalone Provider app (separate demo identities).
- Legacy Admin console inside `portal-compat.js` vs `apps/admin/` (separate audit).
- Zero-total Provider quotes accepted (no documented rule); Provider profile edit stays disabled (G2).
- `test-write.tmp` is ignored locally but listed in the inventory (a clean clone reports it missing).

## Exact next action
Read `apps/customer/pages/addresses.page.js` and `support.page.js` (event handlers, sheets, forms); extend the
`customer-screen-focus.test.js` harness approach to those flows before changing code.
