> **Historical — frontend-only phase (2026-11-13/19).** This document describes the platform before it went live on Firebase. The real backend, payments, catalogue, call centre and security model are in `docs/MAINTENANCE_GUIDE.md`, and the current state is in `docs/AI_CONTEXT/START_HERE.md`. Source code wins over this file.

# HANSALEHLAK V8 — Frontend Testing Strategy

## Purpose

This document defines the test system for the current Frontend-only phase. Tests protect implemented behavior, shared components, navigation contracts, local demo workflows, responsive rules, and the boundary between simulated UI actions and real financial/network operations.

A passing test suite is evidence for the tested behaviors only. It is not proof that every page, browser, device, accessibility mode, or production integration is correct.

## Test layers

| Layer | What it proves | Current state | Command / location |
|---|---|---|---|
| Unit | Pure functions, calculations, validation, state transitions, fixtures | Active across implemented modules | `npm run test:unit` |
| Integration / contract | Script order, navigation registration, shared utilities, cross-page invariants | Active as Node-based contract checks | `tests/unit/frontend-contracts.test.js` and page-specific suites |
| Static audit | Local references, syntax, duplicate IDs, precache and frontend boundaries | Active | `tests/unit/static-audit.test.js` |
| Browser E2E | Real user journeys in an actual browser | Not part of `npm test`. Standalone Provider browser verification is pending; historical Provider checks were against the legacy bridge, not the standalone runtime. Six optional manual Playwright/Chromium scripts exist (`tests/e2e/reports.browser.js`, `tests/e2e/audit-log.browser.js`, `tests/e2e/security.browser.js`, `tests/e2e/system-settings.browser.js`, `tests/e2e/quotes-management.browser.js`, `tests/e2e/super-dashboard.browser.js`; last runs passed at 1280/768/390px); earlier Chromium checks were ad hoc | `tests/e2e/README.md` |
| Visual / responsive | Layout, overflow, responsive interactions at real viewport sizes | Partly covered by static CSS contracts and historical manual browser checks | `tests/e2e/README.md` |
| Accessibility | Keyboard, focus, semantics, screen-reader behavior | Partial unit coverage for dialogs/focus; no full automated accessibility runner | Future phase |
| Security-oriented frontend checks | Escaping, no accidental production API calls, demo-only boundaries | Partial static and unit coverage | Page-specific suites |

## Standard commands

```bash
npm test
npm run test:unit
npm run test:coverage
```

- `npm test` is the required fast regression gate.
- `npm run test:unit` runs the same Node test set explicitly.
- `npm run test:coverage` runs the suite with Node's built-in coverage report. Coverage is a diagnostic, not a quality score by itself.

## Current baseline (2026-11-09)

- Unit test files: 34.
- Node test cases reported: 68.
- Result: 68 passed, 0 failed, 0 skipped.
- Node coverage report: 75.48% lines, 90.53% branches, 80.86% functions across tracked JavaScript files (including test files).
- The financial demo pages (finance, commissions, settlements, reports) have additional targeted invariants; the reports tests also check tie-out with the finance and settlements figures and CSV escaping; `settlements.page.js` line coverage is 71.01%, branch coverage 92.72%, function coverage 75.38%.

Coverage includes test files themselves, so the aggregate percentage is not the production-code-only percentage. Review per-file rows, especially page render functions and event-handler branches. A high branch percentage does not replace browser testing.

## Rules for adding tests

1. Add tests with the feature, not after the feature is forgotten.
2. Test expected behavior and invalid behavior; do not merely assert that source text contains a label.
3. Prefer deterministic fixtures and fixed clocks for date-sensitive logic.
4. Test immutability where state transitions are intended to be immutable.
5. Test boundary values: empty, null, unknown IDs, duplicates, min/max, invalid dates, and unsupported transitions.
6. Test accounting and count invariants, not only individual example outputs.
7. For shared components, test the component once in isolation and verify each consuming page's contract.
8. For every page, cover initial render, empty/loading/error states, primary actions, cancellation/back paths, keyboard behavior, and responsive layout where applicable.
9. Never delete or weaken a failing test just to make the suite green. Fix the implementation or document a justified behavior change.
10. Never claim a browser, screen-reader, device, or accessibility test was run unless it actually was.

## Financial demo safety invariants

For finance, commissions, and settlements in this phase:

- All figures and state changes remain local demo data.
- No payment, collection, settlement, payout, or transfer is performed.
- A UI label such as “completed” must clearly retain its simulation meaning.
- Open discrepancies block the documented simulated approval/completion path.
- Totals must reconcile after every permitted local transition.
- Reasons and audit notes must be trimmed, length-limited, and recorded where specified.
- All money formatting must use `HSMoney`; do not create page-local formatters.
- Reports must derive every figure from the finance/settlements demo data (no second copy), disclose that the data is demo data, and export only local files (CSV cells guarded against formula injection); nothing is sent anywhere.

## Frontend completion gate

A page is not complete merely because it renders. Before marking it implemented:

- Its unit/logic tests pass.
- Its page registration and script dependencies are verified.
- Its key actions and failure paths are tested.
- Relevant shared-component contracts pass.
- Responsive behavior is checked at narrow, medium, and wide widths.
- Browser QA is performed when the environment supports it; otherwise the limitation is recorded.
- `npm test` passes after the final change.
- Status, map, handoff, and test result documentation are updated.

## Next testing investments

Priority order:

1. Turn the reports script into an automated Chromium runner (declare the Playwright version and CI setup) covering admin page load, route navigation, key interactions, and overflow checks.
2. Add browser journeys for orders, customers, providers, workforce/RBAC, commissions, and settlements.
3. Add accessibility automation (axe or equivalent) plus explicit keyboard/focus journeys.
4. Add visual regression baselines only after layout and font loading are deterministic.
5. Add performance budgets for startup, large grids, and route changes.
6. Add mutation testing for high-risk business rules after the browser baseline is stable.

Do not install a browser or test dependency without documenting its version, setup, CI/runtime requirements, and maintenance cost.


## Accessible tabs keyboard regression
`tests/unit/accessible-tabs.test.js` covers roving tabindex, LTR/RTL arrows, Home/End and teardown. `tests/unit/accessible-tabs-contract.test.js` ensures the shared helper is loaded before the app/page code, precached, and wired to the intended tablists. These tests do not replace full browser/screen-reader accessibility QA; see `docs/archive/KEYBOARD_ACCESSIBILITY_AUDIT.md`.


## Provider standalone verification status (2026-11-13)
- Unit/contract coverage exists for Provider domain, request grouping, page renderers, legacy workspace and script order.
- `npm test`: 179/179 passed at the latest baseline before this documentation-only update.
- The standalone Provider browser journey has not been verified in this environment; a prior local navigation attempt was blocked. Do not reuse the historical responsive sweep through the legacy bridge as proof for the standalone entry.
- Next tests: request-action behavior and deep links (P0), then keyboard/focus (P1), then standalone browser QA (P2), then legacy parity audit (P3).
