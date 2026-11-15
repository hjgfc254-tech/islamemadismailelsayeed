> **Update 2026-11-14:** the sweep now runs on the dependency-free CDP runner `tests/e2e/responsive-sweep.cdp.js` (Customer, Guest, Provider, Admin; 1280/768/430/390/320; 280/280). It found and fixed focusable sort buttons hidden in the phone card layout of `HSDataGrid`. The method below is the original 2026-11-13 Playwright audit (historical).

# HANSALEHLAK V8 — Responsive Audit (Browser Sweep)

**Date:** 2026-11-13
**Status:** BROWSER SWEEP DONE (Chromium + Playwright, local static server) — defects fixed with regression tests. Keyboard/accessibility sweep (Phase 5 item 4) is **not** covered.
**Method:** `python3 -m http.server 8099` from the project root; Chromium via Playwright at 1280×800, 768×1024, 390×844, 320×640; Arabic RTL; Google Fonts blocked (see limits). Per screen: horizontal overflow (document + elements not clipped by a scroller), tap-target size, text spill/clipping, squeezed (letter-per-line) text, obscured controls, broken images, console/page errors, failed/4xx requests, `#app` displacement, plus screenshot review of key screens. The sweep driver scripts were throw-away (kept outside the project); the durable regression is `tests/e2e/responsive-sweep.browser.js` + `tests/unit/responsive-sweep-regression.test.js`.

## What was actually exercised
| App | Flows (each at all 4 widths) |
|---|---|
| Customer | home (+bottom, search suggestions, menu sheet, notifications sheet), services, search (results/empty), discover category, request wizard (every step incl. validation toast, attachments, address, schedule, contact, review, submit), orders, tracking, account, addresses, support |
| Provider (compat bridge) | role entry from home, account picker, register sheet, dashboard, all 10 tabs (home/new/accepted/progress/schedule/reviews/quote/done/cancelled/profile) with 8 seeded requests of mixed status created through the app's own `MP` API, profile-edit sheet, propose/reject/quote/finish sheets |
| Provider standalone | `apps/provider/index.html` loaded: confirmed it is a scaffold page (heading + paragraph + link), not the workspace |
| Admin | all 22 menu pages + hidden `employee-details`; tabs; up to 3 dialog openers per page (open → measure → Escape → focus return); mobile/tablet drawer (open, last link reachable, navigate closes, Escape returns focus to toggle); desktop collapse |

## Defects found and fixed
| # | Where / widths | Symptom | Root cause | Fix |
|---|---|---|---|---|
| D1 | Customer + Provider, all widths (keyboard) | After any bottom sheet was opened and closed, Tab landed on its invisible controls (14 stops in 80 Tabs) and the whole app jumped up to ~780px | `#sheet` was only translated off-screen (still visible/focusable); `#app{overflow:hidden}` is still programmatically scrollable (decorative `.bg-blob` at −80px, closed sheet) | `#sheet` now `visibility:hidden` when closed (transition-delayed); `#app` gets `overflow:clip` |
| D2 | Provider cards, 390/320 | Title column squeezed to ~1 word per line beside the status tag | `.card2 .top` flex row without wrap | `flex-wrap:wrap`; title `flex:1 1 180px;min-width:0` |
| D3 | Provider cards for flexible-schedule requests, all | «الموعد المطلوب: Invalid Date» | `fmtDT('')` returns the string "Invalid Date" (no throw, so the `catch` never ran) | `fmtDT` returns '' for empty/invalid; provider card shows «مرن — يُحدَّد بالاتفاق مع العميل» |
| D4 | Admin tables, 768 (9 pages: orders, customers, quotes, complaints, reviews, workforce, security, audit…) | Status badges broke one letter per line; columns collapsed | `.hs-badge-t{overflow-wrap:anywhere}` makes min-content one character, so auto table layout squeezes the column | `overflow-wrap:break-word`; the table now scrolls inside `.hs-grid-wrap` instead |
| D5 | Customer/Provider/Admin, mobile | Tap targets below 32px: wizard breadcrumb 28, chips/date chips 31, section links 26–30, carousel dots (hit area 16×28), join tag 31, admin dashboard «فتح» 23px wide, breadcrumb links 24 | Missing min sizes | Min-heights 36px / larger dot hit area / admin link padding |

## Checked and clean
- No horizontal overflow of the document at any width for any Customer, Provider or Admin screen (23 admin pages, 4 widths, incl. dialogs).
- No JavaScript errors, no failed or 4xx/5xx requests from the project (other than the blocked font host, below), no broken images, `dir=rtl` everywhere.
- Admin drawer: reachable last link, closes on navigate and on Escape with focus back on the toggle; dialogs fit the viewport (scroll internally when tall) and return focus on Escape.

## Known / accepted (not changed)
- Admin brand link in the header is 30px tall and the audit-log date cell spills 4px at 768 (WCAG 2.2 minimum 24px; cosmetic). Wizard/Provider hidden checkbox chips are covered by their labels.
- `#app` also had a latent 80px programmatic scroll range from `.bg-blob`; hardened by D1's `overflow:clip`, no separate visual defect reproduced.
- Admin tables at 768 now scroll horizontally inside the table container (actions column partly off-view until scrolled). That is the intended pattern for this grid; raising the card-mode breakpoint above 767px was **not** done (design decision).

## Limits of this run
- **Cairo font not verified**: the sandbox cannot reach fonts.googleapis.com, so text was measured with fallback fonts; Cairo widths differ, so re-check line wraps on a connected machine.
- Chromium only (no WebKit/Firefox, no real touch devices); no screen-reader pass; the intro animation was skipped (`sessionStorage` flag) and is not covered.
- Dialog sweep opened at most 3 openers per admin page, not every row action.
- Visual review was by screenshot for key screens only; automated heuristics cover the rest.
