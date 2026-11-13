# Execution Checkpoint

Compact resume state for autonomous sessions. Update after every committed batch. Commit hashes: `git log --oneline`.

## Completed batches (2026-11-13)
1. Provider P0 behavior tests + stale-action fixes — `854e281`.
2. Provider P1 accessibility — `5b25c44`.
3. Provider P2 real-browser QA + visual fixes — `b2003ae` (runner `tests/e2e/provider-standalone.cdp.js`, 170/170).
4. Service Worker precache completeness — `service-worker.js` (+`home.page.js`, `orders.page.js`, `order-details.page.js`; cache `-9`),
   `tests/unit/service-worker-precache.test.js` (new, 5), 4 cache-literal tests, `DOMAIN_MAPS/FRONTEND_RUNTIME.md` (corrected stale
   Customer/Provider wiring + SW contract), docs. `npm test` 237/237. Real-browser evidence (Edge, server actually stopped):
   before the fix the Customer home failed to render offline after one visit; after, it renders.

## Current task
Provider P3 legacy parity audit (see `START_HERE.md`) — audit, matrix and parity tests only; no removal.

## Remaining queue (priority order)
1. Provider P3 legacy parity audit.
2. Then `docs/AI_NEXT_IMPLEMENTATION_ORDER.md` phases (Customer extraction, Admin modules, design-system split, Guest) — verify each target is still incomplete first.

## Open decisions
- Zero-total Provider quotes are accepted (no documented rule).
- Deep link opened without a session lands on `#/home` after account selection.
- `test-write.tmp` is ignored locally but listed in the inventory (a clean clone reports it missing).
- Admin is not an offline/PWA entry (no manifest, no SW registration) and is not precached.

## Exact next action
Grep the Customer entry, `apps/customer/*.js` and tests for globals/functions defined in `portal-compat.js` and `provider-workspace.js`; list consumers before writing the matrix.
