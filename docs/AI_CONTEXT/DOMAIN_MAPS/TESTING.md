# Testing Map

## Commands
- `npm test` — Node test suite (`tests/unit/*.test.js`).
- `npm run test:unit` — same suite explicitly.
- `npm run test:coverage` — Node built-in coverage report.
- `npm run audit:inventory` — file inventory/hash consistency check added in this environment pass.

## Current layers
- Unit and behavior-oriented Node tests: active.
- Static project audits/contracts: active.
- Integration-style contracts: active as Node tests; not equivalent to full browser integration.
- Browser scripts: optional manual Playwright/Chromium scripts under `tests/e2e/`; `customer-sheet-focus.browser.py` uses the environment Python Playwright package and is not part of `npm test`.
- Responsive QA: partly manual; do not call it automated E2E.
- Accessibility: partial; a complete automated accessibility runner is not currently established.

## Current baseline
- `npm test`: **348 passed, 0 failed** (2026-11-14, final completion sprint).
- CDP runners (`tests/e2e/*.cdp.js`, shared `tests/e2e/lib/cdp.js`; serve with `python -m http.server 8099 --bind 127.0.0.1`):

  | Runner | Result | Coverage |
  |---|---|---|
  | `customer-orders` | 160/160 | |
  | `guest` | 165/165 | |
  | `provider-standalone` | 261/261 | |
  | `admin-app` | 124/124 | |
  | `a11y` | 112/112 | 1280/390 |
  | `responsive-sweep` | 280/280 | All 4 modes |
  | `interaction` | 206 distinct controls clicked, 0 inert | |

  All runners except `a11y` use 1280/768/430/390/320.
- Async UI: marketplace writes go through the async API adapters. The vm harnesses expose `settle()`, and
  `click`/`submit`/`clickDoc`/`submitDoc` return promises, so tests must `await` them before asserting.
- Inventory reproducibility: `tests/unit/inventory-reproducibility.test.js`. The inventory is the git file set, LF is
  pinned by `.gitattributes`, and the result was verified from a clean clone.
- Contract suites added 2026-11-14:
  - `marketplace-rules.test.js`: business rules;
  - `legacy-migration.test.js`: role isolation and legacy capability parity;
  - `api-adapters.test.js`: mock API contract; it fails on any route missing from `docs/API_CONTRACTS.md`.
- The remaining manual Playwright scripts (`tests/e2e/*.browser.js`, Admin page checks) need Playwright, which is not installed; they are references only. The responsive sweep was ported to CDP.
- CDP lesson: `Page.navigate` to a fragment-only change is same-document — use `about:blank` first for a true fresh deep-link load.
- Customer full-app harness: `tests/helpers/customer-app-harness.js` (`boot({hash, local, session})`, `clickDoc`, `submitDoc`, `navigate`, history/focus recording).
- CDP lesson: assert what is *rendered*, not DOM state — `el.hidden === true` passed while CSS still displayed the element; use `getComputedStyle(...).display` and `document.elementFromPoint` for occlusion.
- Real-browser QA without packages: `tests/e2e/provider-standalone.cdp.js` (Edge over DevTools Protocol, Node built-in `WebSocket`); see `tests/e2e/README.md`. Last run 170/170.
- Provider app behavior harness: `tests/helpers/provider-app-harness.js` (see `DOMAIN_MAPS/PROVIDER.md` §6). Project skill: `.claude/skills/vm-script-test`.
- Windows browser smoke without packages: serve with `python -m http.server 8099`, then headless Edge `--dump-dom` via `Start-Process ... -RedirectStandardOutput` (direct `& msedge` returns no output under PowerShell). This proves load/render only, not interaction or viewports.

## Historical baseline (Shared Foundation batch)
- `npm test`: 174 tests (48 files) passed, 0 failed (2026-11-13).
- `npm run test:coverage`: passed.
- Coverage report includes test files in the all-files aggregate. Use application-only rows when discussing product-code coverage; do not quote the all-files percentage as product-code coverage.

## Test design rule
Prefer behavior assertions, invariants, state transitions, accessibility semantics, and browser user journeys over tests that merely search source text. Keep test names and fixtures aligned with actual UI behavior.

- TASK 04 Browser: `SHEET_TEST_WIDTH=1280|768|390|320 /opt/pyvenv/bin/python tests/e2e/customer-sheet-focus.browser.py`; 25/25 per viewport. Local URLs are blocked in this environment, so the runner inlines local HTML/CSS/JS into `about:blank`.

- Customer search keyboard behavior: `tests/e2e/customer-search-keyboard.browser.py` (manual Chromium + Python Playwright, 28 checks at 390×844; covers home combobox, dedicated Search results, and guide carousel tabs; not part of `npm test`, no project dependency).
- Customer Request Wizard accessibility behavior: `tests/e2e/customer-request-wizard-accessibility.browser.py` (manual Chromium + Python Playwright, 24 checks at 390×844; covers step focus, dynamic/address/schedule/contact validation, label association, inline error announcement and account login labels; not part of `npm test`, no project dependency).

- Shared Foundation behavior tests: `shared-foundations.test.js` and `shared-components.test.js` cover date/error/format/sanitize/validate/config/routes/flags/contracts and button/form/table/notification render primitives. 16/16 targeted tests; full suite 174/174.

- Customer extraction tests: `tests/unit/customer-page-renderers.test.js` covers Home, Orders and Order Details/Tracking render contracts (9/9); `home.test.js` and `discover.test.js` verify the production script order in their VM harnesses. Full suite 174/174.
- After extraction, manual Chromium checks were rerun: search keyboard 28/28, Bottom Sheet 25/25, Request Wizard accessibility 24/24. These do not replace a dedicated browser journey for Orders/Tracking.
