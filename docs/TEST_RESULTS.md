# Test Results — Current Frontend Baseline

Last verified: 2026-11-13
Runtime: Node.js v22.23.4 (the previous baseline was recorded on v22.16.0)

## Commands

```bash
npm test
npm run test:coverage
```

## Latest `npm test`

- Test files: 45
- Node test cases reported: 149
- Passed: 149
- Failed: 0
- Skipped: 0

The older test files include a small custom assertion harness whose individual checks are printed as granular `✓` lines inside each Node test file. The 65 figure (an older baseline) is Node's top-level test count and does not count each of those printed legacy assertions separately.

## Last recorded coverage run (2026-11-10)

Command: `npm run test:coverage`

- Lines: 76.06%
- Branches: 90.37%
- Functions: 81.77%

These aggregate figures include test source files. They are diagnostic, not a production-only coverage score. Review the per-file report for uncovered page rendering and event-handler paths.

Selected financial module coverage:

| Module | Lines | Branches | Functions |
|---|---:|---:|---:|
| `finance-dashboard.page.js` | 59.79% | 79.17% | 62.86% |
| `commissions.page.js` | 63.25% | 84.25% | 66.67% |
| `settlements.page.js` | 71.01% | 92.72% | 75.38% |
| `reports.page.js` | 67.77% | 86.09% | 80.88% |
| `audit-log.page.js` | 74.62% | 69.23% | 54.17% |
| `security.page.js` | 66.79% | 78.26% | 63.08% |
| `system-settings.page.js` | 65.49% | 83.33% | 56.00% |
| `quotes-management.page.js` | 67.03% | 88.51% | 60.00% |
| `super-dashboard.page.js` | 94.70% | 93.59% | 95.35% |
| `shared/utils/money.js` | 100% | 75% | 100% |
| `shared/components/data-grid.js` | 67.91% | 72.45% | 43.14% |

## Newly added test coverage in this update

- `tests/unit/settlements-edge-cases.test.js`: 22 focused edge-case tests for malformed IDs/references, invalid money/date/status values, invalid status/data combinations, discrepancies, provider aggregation, note limits, immutability-related behavior, and reset determinism.
- `tests/unit/frontend-contracts.test.js`: 13 project-level contract tests for local script references, page registration, navigation IDs, CSS/script ordering, shared money utility usage, demo-only financial boundaries, RTL mount semantics, and handoff consistency.

## Added in the reports-page task (2026-11-09)

- `tests/unit/reports.test.js`: 17 checks — catalogue and unknown-report rejection; every report × period × category builds and passes its own reconciliation checks; totals equal column sums; tie-out with `finance-dashboard` (all periods) and `settlements` (30-day basis); period/category fallback and fixed-date ranges; empty-state reachability; `safeBuild` error path; fixture immutability/determinism; CSV (BOM, CRLF, demo disclosure, raw numbers, totals row), CSV escaping and formula-injection guard, file names, immutable export log, cell formatting, `resetState`, and source boundaries (no network/storage calls, shared `HSMoney`).
- `tests/unit/frontend-contracts.test.js`: script-order list now includes `pages/reports.page.js`; the handoff test now expects `audit-log.page.js` as the next file; new test for the reports registration and disclosures (13 → 14 tests).
- Manual browser run (NOT part of `npm test`): `node tests/e2e/reports.browser.js` against a static server, Chromium via Playwright, 2026-11-09, viewports 1280×800, 768×900, 390×800 — all 21 checks per viewport passed (RTL, default render, reconciliation checks, report/period/category switching, empty state, disabled export while empty, fixed-basis period lock, CSV download name/BOM/content, success message, export log, keyboard Enter, reset, no external requests other than fonts, no JS errors, no page-level horizontal overflow). Two layout defects were found by this run (grid track growing with the table; missing gap between result cards) and fixed before the final run. Screenshots were reviewed visually at 1280/768/390px.
- Previous baseline before this task: 32 files / 65 cases.

## Added in the audit-log task (2026-11-09)

- `tests/unit/audit-log.test.js`: 6 checks (fixture validity, validation failures, counts, ordering/immutability, grid search/filters, read-only and no-network/storage boundary). `frontend-contracts.test.js` updated (script order; handoff now expects `security.page.js`).
- Manual Chromium run `tests/e2e/audit-log.browser.js` (not part of `npm test`), 1280/768/390px: summary, banner, no overflow, search, details dialog, no write/export buttons, Escape closes, focus returns, no JS errors — all passed. Baseline now 34 files / 68 cases. Row-action/dialog paths of the page are covered only by this manual run.

## Added in the security-page task (2026-11-09)

- `tests/unit/security.test.js`: 7 checks (fixture validity + counter recount, validation failures, alert workflow incl. reason bounds/final state/immutability, session end rules, severity ordering, grid search/filters, no real-security surface/network/storage). `frontend-contracts.test.js` updated (script order; handoff test now expects `system-settings.page.js`). `npm test` = 69/69 (was 68/68); `npm run audit:inventory` re-run after the docs update.
- Manual Chromium run `tests/e2e/security.browser.js` (not part of `npm test`), 1280/768/390px: summary, banner, RTL, no overflow, tabs, read-only login details, Escape/focus return, escalate-without-reason rejected, simulated action + log + counter change, current session has no end action, session end simulated, no JS errors, no external requests — all passed. Not run: Firefox/Safari, real devices, screen readers.

## Added in the system-settings task (2026-11-09)

- `tests/unit/system-settings.test.js`: 7 checks (defaults validity, validation ranges/types, tax rate only while enabled, input coercion, diff, applyChange rules/immutability/log, no network/storage/real-effect surface). `frontend-contracts.test.js` updated (script order; handoff test now expects `quotes-management.page.js`). `npm test` = 70/70 (was 69/69).
- Manual Chromium run `tests/e2e/system-settings.browser.js` (not part of `npm test`), 1280/768/390px: banner, groups, RTL, no overflow, no-change submit, invalid value + aria-invalid + focus, review dialog, reason required, simulated save + log, Escape/focus return, restore defaults, Enter, no JS errors, no external requests — all passed. Not run: Firefox/Safari, real devices, screen readers.

## Added in the quotes-page task (2026-11-09)

- `tests/unit/quotes-management.test.js`: 8 checks (derivation tie-out against the orders fixtures, all demo states reachable, validation failures, effective/expired status, counts recount, decision rules/finality/immutability, grid search/filters, no real surface/network/storage). `frontend-contracts.test.js` updated (script order incl. orders before quotes; handoff test now expects `super-dashboard.page.js`). `npm test` = 71/71 (was 70/70).
- Manual Chromium run `tests/e2e/quotes-management.browser.js` (not part of `npm test`), 1280/768/390px: summary, banner, RTL, no overflow, 9 rows, expired has no approve, reject needs a reason, simulated approval + log + final, counter change, Escape/focus return, no JS errors, no external requests — all passed. Not run: Firefox/Safari, real devices, screen readers.

## Added in the super-dashboard task (2026-11-10)

- `tests/unit/super-dashboard.test.js`: 10 checks (every KPI equals the source page's own API; attention items equal the source counters and link to real NAV pages; severity ordering + platform state; all-zero sources ⇒ stable and no invented values; an unavailable source ⇒ «غير متاح» without an attention item; all sources failing ⇒ error state; the model follows injected sources and surfaces simulated maintenance; module links exclude self and disable unregistered pages; HTML escaping + demo/read-only disclosure; source boundary: no controls/network/storage/mutation of other pages, last page script in `index.html`). Uncovered lines of the page (125–131) are the DOM `render` wrapper/registration that need a browser.
- `tests/unit/frontend-contracts.test.js` (14 → 15 tests): script-order list now ends with `pages/super-dashboard.page.js`; new test that every admin menu item and the hidden page has a registered page module; the handoff test now expects the Phase 5 design-system audit as the next task.
- Manual Chromium run `tests/e2e/super-dashboard.browser.js` (NOT part of `npm test`; Playwright from `/opt/npm-tools` with `NODE_PATH`, static server `python3 -m http.server 8099` from the project root), 2026-11-10, 1280/768/390px, all 15 checks per viewport passed: RTL, 8 cards, read-only banner, no controls in the body, no overflow, KPI values equal the source pages, textual platform state, most severe item first, 21 live module links, attention link navigation, a simulated quote approval lowers «quotes awaiting» after returning (live read), refresh, no JS errors, no external requests. Not run: Firefox/Safari, real devices, screen readers.
- Baseline before this task: 37 files / 71 cases (all passing); now 38 files / 73 cases.

## Important limitations

- Browser E2E is not yet an automated part of `npm test`. The `tests/e2e/*.browser.js` scripts are manual, optional runners that depend on a Playwright install that is not declared in `package.json`.
- Not browser-tested: Firefox/Safari, real devices, screen readers, and the keyboard journey beyond Enter on report buttons.
- Historical Chromium checks recorded in `HANDOFF_NEXT_AI.md` were manual/ad hoc and must not be described as part of this automated test run.
- No automated screen-reader, Safari, Firefox, real-device, or full visual-regression run is included here.
- Backend, database, payment, and production authorization tests are outside the current Frontend-only phase.

See `docs/TESTING_STRATEGY.md` for the test layers, rules, completion gate, and next investments.


## Added in the design-system audit task (2026-11-10)

- `tests/helpers/design-token-audit.js`: deterministic CSS declaration scanner; excludes comments, custom-property declarations and media-query conditions; counts literal colors, layout dimensions, radii, font sizes, box/text-shadow declarations and numeric z-index values.
- `tests/unit/design-token-audit.test.js`: verifies live shared stylesheet wiring and placeholder split-file status; enforces that Admin CSS does not grow beyond the recorded 163-occurrence baseline. Reductions are allowed.
- `docs/DESIGN_SYSTEM_AUDIT.md`: full five-stylesheet inventory and recommendations. `npm test` baseline before this task was 73/73; expected current total is 74 top-level test files/cases.
- No production CSS/HTML/JS was changed. No browser visual sweep was run for this read-only audit.


## Added in the icon and asset audit task (2026-11-10)

- `tests/unit/icon-asset-audit.test.js`: checks all 188 icon definitions render, 23 aliases resolve, status/section/problem mappings target known icons, static references and Provider queue choices exist, all six shipped assets are referenced and precached, and no assets are byte-identical duplicates.
- Fixed one confirmed runtime gap: Provider priority queue requested the missing `inbox` icon; added the definition to `shared/icons/icon-registry.js`.
- Bumped Service Worker cache to `hansalhlak-v8-architecture-2` for the icon audit; it was subsequently advanced to `hansalhlak-v8-architecture-3` for shared keyboard tabs.; updated its cache-version assertions in `design-system.test.js` and `static-audit.test.js`.
- No image assets were deleted or replaced. This was not a full cross-browser visual audit.


## Responsive viewport source audit (2026-11-10 — partial)

- Extended `tests/unit/responsive-audit.test.js` with Admin shell drawer/desktop breakpoints, data-grid and summary collapse rules, shrink/wrap protections, and 44px control target assertions (12 source checks total).
- `docs/RESPONSIVE_AUDIT.md` records the responsive matrix and existing manual Chromium coverage.
- Attempted browser execution using the available Chromium/Playwright runtime; both localhost and file URLs were blocked by the environment (`ERR_BLOCKED_BY_ADMINISTRATOR`). No screenshots or visual QA claims are made. Customer/Provider full visual sweeps remain outstanding; do not proceed to Phase 5 keyboard/accessibility sweep yet.


## 2026-11-10 — Accessible tabs keyboard pass
- `npm test`: 93/93 passed after adding shared keyboard tabs, dialog fallback focus containment, and their integration contracts.
- `npm run audit:inventory`: 335 files; 0 missing, 0 untracked, 0 SHA-256 mismatches.
- `npm run test:coverage`: completed successfully. The aggregate coverage row includes test files; do not present it as production-source coverage.
- Browser visual QA remains unverified in this environment; see `docs/RESPONSIVE_AUDIT.md` and `docs/KEYBOARD_ACCESSIBILITY_AUDIT.md`.


## Responsive browser sweep (2026-11-13)
- Real Chromium sweep completed (see `docs/RESPONSIVE_AUDIT.md`); the earlier `ERR_BLOCKED_BY_ADMINISTRATOR` blocker no longer applied.
- Added `tests/unit/responsive-sweep-regression.test.js` (6 checks) and manual `tests/e2e/responsive-sweep.browser.js` (36 checks over 4 widths, all passing).


## 2026-11-13 — PHASE 5 / TASK 04: Customer Bottom Sheet focus
- `npm test`: 149/149 passed, 0 failed (45 test files; default Node test concurrency).
- `node --test --test-concurrency=1 tests/unit/*.test.js`: 149/149 passed, 0 failed.
- Browser: `SHEET_TEST_WIDTH=1280|768|390|320 /opt/pyvenv/bin/python tests/e2e/customer-sheet-focus.browser.py`; 25/25 passed at each width (100 assertions total). Chromium + Python Playwright; local project HTML/CSS/JS were inlined into `about:blank` because direct localhost/file navigation returned `ERR_BLOCKED_BY_ADMINISTRATOR`. No uncaught page errors.
- The earlier `npm test` timeout could not be reproduced: both the default command and serial command completed successfully in this environment. No concurrency setting was changed and no root cause is asserted without reproducible evidence.
- Browser suite covers initial focus, heading fallback, Tab/Shift+Tab wrap, form controls, Escape, backdrop/action close, focus restoration and missing-opener fallback, background isolation, and nested sheet content/back transitions.
- Not run: screen-reader validation, Firefox, WebKit/Safari, real-device testing. This focused Bottom Sheet work is not a full accessibility audit or WCAG conformance claim.


## 2026-11-13 — Customer home-search keyboard continuation

- `npm test`: 149 tests passed, 0 failed (45 test files).
- Manual Chromium + Python Playwright: `tests/e2e/customer-search-keyboard.browser.py` — 14/14 checks passed at 390×844, including accessible name/combobox semantics, popup state, ArrowUp/ArrowDown, active descendant, Enter selection, Escape and empty-query cleanup. No uncaught page errors.
- This browser test is not included in `npm test`; no project dependency was added.


## 2026-11-13 — Customer keyboard/accessibility continuation

- `npm test`: 149/149 passed, 0 failed (45 test files). One intermediate run exposed a missing `document.querySelector` guard in the VM test harness after adding validation UI; the guard was added and the full suite passed on rerun.
- `tests/e2e/customer-search-keyboard.browser.py`: 28/28 Chromium checks at 390×844. Covers home combobox, dedicated Search listbox/options and keyboard activation, and guide carousel tab relationships/roving focus.
- `tests/e2e/customer-request-wizard-accessibility.browser.py`: 24/24 Chromium checks at 390×844. Covers step-heading focus, progress value, dynamic-question/description/address/date/period/contact validation, error announcement/association/clearing, and account login label associations.
- Bottom Sheet regression: `SHEET_TEST_WIDTH=1280|768|390|320 /opt/pyvenv/bin/python tests/e2e/customer-sheet-focus.browser.py`: 25/25 at each viewport (100 total).
- All three Customer browser scripts used Python Playwright + system Chromium and inline assets; no project dependency was added. No uncaught page errors were reported.
- Attempted `NODE_PATH=/opt/npm-tools/node_modules node tests/e2e/responsive-sweep.browser.js http://127.0.0.1:8099`; it did not start because the Node `playwright` package was unavailable. This run is not a pass. The prior recorded responsive sweep result remains a historical TASK 03 result, not a rerun in this task.
- Not run: screen readers, Firefox/WebKit/Safari, real devices, full zoom/reflow and contrast audit. No WCAG conformance claim.
