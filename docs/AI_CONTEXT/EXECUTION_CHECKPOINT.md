# Execution Checkpoint

Compact resume state for autonomous sessions. Update after every committed batch. Commit hashes: `git log --oneline`.

## Completed batches (2026-11-13)
1. Provider P0 behavior tests + stale-action fixes — `854e281`.
2. Provider P1 accessibility — `5b25c44`.
3. Provider P2 real-browser QA + visual fixes — `b2003ae`.
4. Service Worker precache completeness — `c137eef`.
5. Provider P3 legacy parity audit — `7bbe4c8`.
6. Provider G3 commission preview + G4 login hand-off — `b85425c`.
7. Provider G1 demo self-registration — `apps/provider/app.js` (register action, `openRegisterForm`, `registrationFrom`, cancel on picker,
   field-targeted `invalid`), `styles/provider.css` (registration styles, `[hidden]` override, `scroll-margin-top`), harness (`getAll`,
   multi-class form regexes), `provider-app-register.test.js` (new, 9), parity/pages tests, CDP runner (+registration, nav visibility,
   occlusion), SW cache `-11`, docs. `npm test` 256/256; browser 231/231.

## Current task
Customer Orders / Order Details / Tracking keyboard & accessibility (Phase 5 item 4) — see `START_HERE.md`.

## Remaining queue (priority order)
1. Customer orders/details/tracking a11y + real-browser check.
2. Customer addresses and support a11y.
3. Phase 5 item 5 console/network smoke checks across Customer/Admin (Provider already covered).
4. Admin page/dialog keyboard traversal.

## Pending user decisions
- Reroute Customer «بوابة مقدم الخدمة»/«انضم الآن» to the standalone Provider app (separate demo identities).
- Legacy Admin console inside `portal-compat.js` vs `apps/admin/` (separate audit).
- Zero-total Provider quotes accepted (no documented rule); profile edit stays disabled (G2).
- `test-write.tmp` is ignored locally but listed in the inventory (a clean clone reports it missing).

## Exact next action
Read `apps/customer/pages/orders.page.js`, `order-details.page.js` and their callers; run the existing Customer harness tests; then build a CDP check for the orders → details → back journey.
