# HANSALEHLAK V8 — Keyboard & Accessibility Audit

**Date:** 2026-11-13  
**Status:** PARTIAL — shared tabs, dialogs fallback, Customer Bottom Sheet focus, and Customer home-search combobox keyboard behavior have focused implementation/tests; full page-by-page assistive-technology and browser audit remains open.

## Implemented in this pass

- Added `shared/components/accessible-tabs.js` as a small shared behavior layer.
- Applied it to Admin Notifications, Permissions and Security tablists.
- Applied it to the Customer guide carousel's slide selector.
- Added roving `tabindex` (only the active tab remains in the normal Tab sequence).
- Added Left/Right arrow navigation, Home and End navigation, wrapping, and RTL-aware horizontal direction.
- Keyboard navigation focuses and activates the destination tab through its existing click handler; page-specific panel/state logic remains owned by each page.
- Tab panels referenced by `aria-controls` receive `role="tabpanel"` and `tabindex="0"` when missing.
- Strengthened `shared/components/dialogs.js`: its attribute-only fallback now handles Escape and traps Tab/Shift+Tab within visible, enabled dialog controls; native `<dialog>` continues to use browser-managed focus behavior.
- Added 8 focused Node unit tests for tabs, one additional dialog-fallback assertion in the existing dialog test suite, and 3 integration-contract checks.
- Added the shared helper to both entry points and the Service Worker precache; bumped cache version to `hansalhlak-v8-architecture-3`.

## Verified source contracts

- The three multi-panel Admin tablists use the shared helper.
- Customer guide carousel tabs use the helper and resynchronize roving tabindex when the active slide changes by scrolling.
- Existing dialogs declare `aria-labelledby` or `aria-label` at their host element; their focus-return behavior remains covered by `tests/unit/dialogs.test.js`.
- Existing data-grid controls provide labels and live result counts in `shared/components/data-grid.js`.

## Not yet verified

- Complete keyboard-only traversal of every Customer, Provider and Admin page in a real browser.
- Screen reader behavior with NVDA, VoiceOver or TalkBack.
- Contrast ratios, touch target dimensions across every page, zoom/reflow at 200–400%, and reduced-motion behavior through live interaction.
- Full responsive screenshot sweep remains blocked in this runtime because Chromium navigation does not complete; no visual QA claim is made.

## Regression tests

- `tests/unit/accessible-tabs.test.js`
- `tests/unit/accessible-tabs-contract.test.js`
- `tests/unit/dialogs.test.js`
- `tests/unit/data-grid.test.js`

This is a focused keyboard-navigation improvement, not a WCAG conformance claim.


## Customer home search combobox — 2026-11-13

- Verified the home search was missing live `aria-expanded` updates, active-option semantics, and ArrowUp/ArrowDown selection; Enter always submitted the raw query, even when a suggestion was visible.
- Added an accessible name, `aria-autocomplete="list"`, and explicit combobox/listbox state synchronization in `apps/customer/app.js`.
- ArrowDown/ArrowUp now move the active option with wrapping; `aria-activedescendant` and `aria-selected` track it. Enter activates the highlighted suggestion; without an active suggestion, existing direct-search navigation is preserved. Escape closes the popup and clears active state. Options use `tabindex="-1"` so the listbox does not add redundant stops to the page Tab sequence.
- Manual Chromium + Python Playwright checks: `tests/e2e/customer-search-keyboard.browser.py`, 14/14 passed at 390×844. No project dependency added.
- Scope is the Customer home search combobox only; the separate search-results screen and its distinct `HS_SEARCH.bind` behavior remain to be audited.


## Customer accessibility continuation — 2026-11-13

### Dedicated Search page
- The Search screen is distinct from the home-search combobox. `HS_SEARCH.bind` now exposes result groups as listboxes and result controls as options, and supports ArrowUp/ArrowDown navigation while keeping DOM focus in the search field.
- `aria-activedescendant` and `aria-selected` track the active result; Enter activates the selected result through the existing `HS_DISCOVER` detail-page flow; Escape clears active state. Existing direct-search behavior without an active option remains unchanged.

### Guide carousel and account controls
- Guide carousel tab buttons now have stable IDs, `aria-controls`, and matching slide IDs/`aria-labelledby`; the shared helper retains roving tabindex and Arrow/Home/End behavior.
- Customer account login fields and preferred-contact select have explicit label associations.

### Request Wizard
- Every wizard step now includes a programmatically focusable step heading; `show('wizard')` moves focus to it after each step/content render.
- Required dynamic questions and address/contact fields expose native required semantics. Previously unassociated labels now use explicit `for`/`id` relationships.
- Step validation now renders an inline `role=alert`/`aria-live=assertive` message, focuses the first actionable invalid field/choice, applies `aria-invalid`, and associates the error through `aria-describedby`. Editing clears stale validation feedback.
- Category/item/problem/date/period choices expose their selected state with `aria-pressed`; period/date groups have accessible names. Attachment remove buttons include the attachment name.
- Chromium behavior checks: `tests/e2e/customer-request-wizard-accessibility.browser.py`, 24/24 at 390×844.

### Combined verification and limits
- `npm test`: 149/149 passed after the implementation.
- Customer home/dedicated search + carousel: 28/28 Chromium checks.
- Customer Request Wizard + account labels: 24/24 Chromium checks.
- Bottom Sheet regression: 25/25 at each of 1280/768/390/320px (100 checks total).
- Existing responsive browser runner could not be run in this environment because Node's `playwright` package is unavailable; Python Playwright + Chromium were available for the Customer suites. No project dependency was added.
- Not verified: screen readers (NVDA/VoiceOver/TalkBack), Firefox/WebKit/Safari, real devices, zoom/reflow at 200–400%, full contrast/touch-target audit, and exhaustive keyboard traversal of every Customer/Provider/Admin screen. Phase 5 item 4 remains PARTIAL; no WCAG conformance claim.


## Customer Orders / Order Details / Tracking — focus management (2026-11-13)
- **Defect:** `show()` replaced `#view` and left keyboard focus on `<body>` for every screen except Wizard/Search; `renderTabs()` (called by both `go()` and `show()`) rebuilt `#tabbar` and destroyed the focused tab; the Orders filter re-render destroyed the pressed filter.
- **Fix (`apps/customer/app.js`):** `renderTabs()` refocuses the equivalent tab when a tab had focus; `show()` restores focus only when it was actually lost (never on the boot render, never for Wizard/Search, which keep their own handling) — to a caller-requested control (`requestFocusAfterShow(selector)`, used by the Orders filter) or else the screen heading (`head()` `<h2 tabindex="-1">`), else `#view`.
- **Semantics (`market-ui.page.js`):** the tracking timeline marks exactly one entry `aria-current="step"`.
- **Evidence:** `tests/unit/customer-screen-focus.test.js` (9; 6 fail on the previous code); real Edge `tests/e2e/customer-orders.cdp.js` 60/60 at 1280/768/390/320 (tab, filter, open request, action, back — all by keyboard).
- **Not covered yet:** Addresses and Support flows; screen readers; Firefox/WebKit.