# Execution Checkpoint

Compact resume state for autonomous sessions. Update after every committed batch. Commit hashes: `git log --oneline`.

## Last completed batch — Provider P0 behavior tests (2026-11-13)
- Files: `apps/provider/app.js`, `service-worker.js` (cache `-6`), `tests/helpers/provider-app-harness.js` (new),
  `tests/unit/provider-app-actions.test.js` (new), `tests/unit/provider-app-routing.test.js` (new),
  cache-literal updates in `design-system.test.js`, `accessible-tabs-contract.test.js`, `provider-pages.test.js`, `static-audit.test.js`; docs.
- Tests: `npm test` 216/216. Browser: headless Edge load smoke of `apps/provider/index.html` only (picker rendered, 7 accounts).
- Inventory: run `npm run audit:inventory` — expected 0 missing / 0 untracked / 0 mismatches.

## Current task
Provider P1 — standalone accessibility (keyboard, focus after route change/forms, names/labels, live feedback).

## Remaining queue (priority order)
1. Provider P1 accessibility (`apps/provider/app.js`, `provider-shell.js`, `styles/provider.css`).
2. Provider P2 interactive browser QA — needs a browser runner (Playwright not installed; decision required before installing).
3. Service Worker precache gap: `apps/customer/pages/home.page.js`, `orders.page.js`, `order-details.page.js`, `apps/admin/index.html` not precached — verify and fix with tests.
4. Provider P3 legacy parity audit (no removal without approval).
5. Then `docs/AI_NEXT_IMPLEMENTATION_ORDER.md` phases (Customer extraction, Admin modules, design-system split, Guest).

## Open decisions
- Zero-total Provider quotes are accepted (no documented rule).
- Deep link opened without a session lands on `#/home` after account selection.
- `test-write.tmp` is ignored locally but listed in the inventory (a clean clone reports it missing).
- Inventory statuses for `.claude/skills/*` and Provider domain files remain `NEEDS_REVIEW`.

## Exact next action
Read `apps/provider/app.js`, `provider-shell.js`, `styles/provider.css`; audit focus management after route change and inline-form open/close, then add behavior tests in a new `tests/unit/provider-app-a11y.test.js` using the existing harness.
