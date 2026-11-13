# Execution Checkpoint

Compact resume state for autonomous sessions. Update after every committed batch. Commit hashes: `git log --oneline`.

## Completed batches (2026-11-13)
1. Provider P0 behavior tests + stale-action fixes — `854e281`.
2. Provider P1 accessibility — `5b25c44`.
3. Provider P2 real-browser QA + visual fixes — `b2003ae` (runner `tests/e2e/provider-standalone.cdp.js`, 170/170).
4. Service Worker precache completeness — `c137eef` (offline Customer home proven broken before / working after).
5. Provider P3 legacy parity audit — `docs/PROVIDER_LEGACY_PARITY_AUDIT.md` (new), `tests/unit/provider-legacy-parity.test.js` (new, 6), docs.
   No runtime change. `npm test` 243/243.

## Current task
Provider parity gaps G3 (commission preview on completion) + G4 (`login.html` placeholder) — see `START_HERE.md`.

## Remaining queue (priority order)
1. G3 + G4.
2. G1 standalone self-registration (field set/validation in audit §4).
3. Decision needed before acting: reroute Customer «بوابة مقدم الخدمة»/«انضم الآن» to the standalone app; legacy Admin console in `portal-compat.js` vs `apps/admin/`.
4. Then `docs/AI_NEXT_IMPLEMENTATION_ORDER.md` phases (Customer extraction, Admin modules, design-system split, Guest) — verify each target first.

## Open decisions
- Zero-total Provider quotes are accepted (no documented rule).
- Deep link opened without a session lands on `#/home` after account selection.
- Standalone profile editing stays disabled (G2) until a product decision.
- `test-write.tmp` is ignored locally but listed in the inventory (a clean clone reports it missing).
- Admin is not an offline/PWA entry and is not precached.

## Exact next action
In `apps/provider/app.js`, extend `openForm('complete')` with a preview element and an `input` listener on the host for `#pv-complete-form`; test via harness.
