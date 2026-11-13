---
name: browser-qa
description: Real-browser QA for HANSALEHLAK V8 (Customer, Provider, Admin static entries) — responsive viewports, RTL, overflow, keyboard/focus, console errors, deep links. Use after UI/behavior changes or for Provider P1/P2 tasks. Reports honestly when a browser runner is unavailable; never installs packages without approval.
---

# Browser QA — HANSALEHLAK V8

Browser checks are manual and are not part of `npm test`. Evidence or "not run" — nothing in between.

## 1. Check the runner first (this machine, Windows)
- `npx playwright --version` / `node -e "require('playwright')"` — Playwright is NOT a project dependency
  and was not installed at last audit. Microsoft Edge is installed; Chrome is not.
- Python e2e scripts (`tests/e2e/*.browser.py`) hardcode `/usr/bin/chromium` and `/opt/pyvenv` (Linux) — they will not run here unmodified.
- JS e2e scripts (`tests/e2e/*.browser.js`) need `require('playwright')` (global, or `NODE_PATH`).
- A Playwright MCP server, if configured, can drive the browser interactively instead.
- If no runner is available: stop, report "browser QA not run — <reason>", and ask before installing anything.

## 2. Serve the project (static, no build)
Run in the background from the project root: `python -m http.server 8099`
- Customer: `http://127.0.0.1:8099/apps/customer/index.html`
- Provider: `http://127.0.0.1:8099/apps/provider/index.html#/home` (deep link: `#/request/<id>`)
- Admin: `http://127.0.0.1:8099/apps/admin/index.html#/<page>`
`_redirects` is not applied by this server; use the file paths and hash routes above.

## 3. Context setup
- Skip the intro: init script `sessionStorage.setItem('hs_intro_v1','1')`.
- Block Google Fonts to stay deterministic: abort `fonts.googleapis.com` / `fonts.gstatic.com`.
- Use a fresh browser context per run; the service worker is cache-first and can serve stale JS.
- Locale `ar-EG`; documents are `dir="rtl"`.
- Demo data lives in localStorage `hs_mp_db`; Provider demo session in sessionStorage `hs_provider_demo_session`.

## 4. Viewports
- Provider (protocol §6 P2): 1280, 768, 430, 390, 320.
- General matrix (`docs/FRONTEND_QA_ACCEPTANCE.md` §4): 360, 390, 768, 1024, 1440.
- Existing sweep reference: `tests/e2e/responsive-sweep.browser.js` (1280/768/390/320).

## 5. Checks per viewport
- No horizontal overflow: `documentElement.scrollWidth <= clientWidth + 1`.
- Zero `pageerror`/console errors; zero failed local requests (404s).
- Keyboard: Tab order, visible focus, Escape closes dialogs/sheets and focus returns, no focus in hidden sheets.
- Accessible names on buttons/inputs; validation errors associated and announced.
- RTL layout and mixed Arabic/Latin text render correctly; nothing clipped or squeezed.
- Hash routes: refresh and deep link work; unknown route falls back to home.
- Local/demo actions are labelled as local/demo.

## 6. Report
Per entry: URL, viewports actually run, checks passed/failed with messages, console/network issues,
and anything skipped with the reason. Do not create screenshots or artifacts inside the repo
(`screenshots/`, `test-results/` are gitignored but still count in the inventory walk); use the scratchpad.
