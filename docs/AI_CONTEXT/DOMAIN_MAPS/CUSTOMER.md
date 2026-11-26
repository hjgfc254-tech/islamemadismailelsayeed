> **Historical — frontend-only phase (2026-11-13/19).** This document describes the platform before it went live on Firebase. The real backend, payments, catalogue, call centre and security model are in `docs/MAINTENANCE_GUIDE.md`, and the current state is in `docs/AI_CONTEXT/START_HERE.md`. Source code wins over this file.

# Customer Domain Map

- Entry: `apps/customer/index.html`
- Bootstrap/concentration: `apps/customer/app.js`
- Main grouped UI/actions: `apps/customer/pages/market-ui.page.js`
- Request flow: `apps/customer/pages/request-wizard.page.js`
- Search/discovery: `search.page.js`, `discover.page.js`
- Account/support: `account.page.js`, `addresses.page.js`, `support.page.js`
- Home renderer: `apps/customer/pages/home.page.js` (independent, dependency-injected renderer; `app.js` owns runtime data/events).
- Orders renderer: `apps/customer/pages/orders.page.js` (independent renderer; market-ui supplies MP data and filter event handling).
- Order details/tracking renderer: `apps/customer/pages/order-details.page.js` (dependency-injected renderer; `market-ui.page.js` supplies the local MP adapter and presentation helpers; events/state remain in market-ui/app).
- Providers (`pages/providers.page.js`) and request-create (`pages/request-create.page.js`, `#/request[/<catalogId>]`) are real modules since 2026-11-13; other screens may still live inside `market-ui.page.js`/`app.js`. Do not infer completion from filenames.
- Styles: `apps/customer/styles/customer.css` plus `shared/design-system/`.
- Local services: `services/local-catalog.js`, `services/local-market-store.js`, `services/local-attachments.js`.
- Current concern: large files and behavior still grouped in legacy modules. Refactor only incrementally, preserving public globals/events/DOM contracts and adding regression tests.
- **Role isolation (2026-11-14):** the Customer app has no Provider/Admin role switching (`enterRole`, `screens.admin` and
  `screens.provider` are gone, and the legacy bridge scripts are no longer loaded). The menu section «للمتخصصين» and the home
  CTA offer «عايز تقدم خدماتك؟ انضم كمقدم خدمة», a plain link to `../provider/index.html#/join`. It grants no permission.
  `tests/unit/legacy-migration.test.js` fails on any Admin trace in Customer sources or rendered screens.
- **Quotes and free service:**
  - `order-details.page.js` renders `freeBlock` between the proposal and quote blocks. A proposed free service shows
    `data-act="acceptFree"` / `"declineFree"` (handled in `market-ui.page.js` → `MP.respondFree`). Accepted, completed and
    declined states show notes.
  - Approving a quote toasts on failure; zero quotes are refused by `MP.approveQuote`.

- Bottom Sheet: rendered in `apps/customer/index.html` (`#sheet`, `role=dialog`, `aria-modal=true`) and managed by `apps/customer/app.js` (`sheet`, `closeSheet`). TASK 04 adds opener preservation, initial focus, Tab/Shift+Tab containment, Escape, focus restoration/fallback, and background inert/aria-hidden isolation. `origin` remains a separate problem-list return context. Browser coverage: `tests/e2e/customer-sheet-focus.browser.py`.

- Home search combobox (`#q` / `#home-sg`) in `apps/customer/app.js`: keyboard selection uses ArrowUp/ArrowDown, Enter activates the active suggestion, Escape closes, and ARIA expanded/active-descendant state is synchronized.
- Dedicated Search page (`HS_SEARCH.bind` in `apps/customer/pages/search.page.js`): result groups expose listboxes/options; ArrowUp/ArrowDown moves active option, `aria-activedescendant`/`aria-selected` synchronize, Enter activates through the existing detail-page route, and Escape clears active state.
- Guide carousel tabs (`#dots`): each tab controls and labels its slide, with shared roving tabindex and Arrow/Home/End support.
- Request Wizard (`apps/customer/pages/request-wizard.page.js`): step headings receive focus on render; progress exposes numeric state; required controls have labels/required semantics; validation errors are announced and associated with/focus the first invalid field or choice; date/period/category/item/problem choices expose pressed state. Browser test: `tests/e2e/customer-request-wizard-accessibility.browser.py`.
- Account login form and preferred contact select now have explicit label associations.
- Browser checks: `customer-search-keyboard.browser.py` 28/28; `customer-request-wizard-accessibility.browser.py` 24/24; Bottom Sheet checks remain 25/25 at each of 1280/768/390/320. These are focused Chromium checks, not a complete Customer accessibility audit.

- **2026-11-13 page extraction:** Home and Orders markup were extracted behind explicit dependency-injection contracts. `home.page.js` loads before `app.js`; `orders.page.js` loads before `market-ui.page.js`. Both are presentation-only and preserve existing globals/actions. Tests: `tests/unit/customer-page-renderers.test.js`; harnesses `home.test.js` and `discover.test.js` load the home module in the same order as production.

- **Customer extraction batch 01 (continued):** Tracking/order-details markup moved from `market-ui.page.js` to `order-details.page.js` as `HSCustomerOrderDetailsPage.render(ctx)`. It retains current status messages, provider/search/quote/proposal blocks, request summary, action data attributes, and simulated-progress banner. Data lookup and all click/submit handling remain in `market-ui.page.js`; no workflow behavior was reimplemented.


## Screen focus contract (2026-11-13)
- `show(name)` restores lost focus after rendering: `requestFocusAfterShow(selector)` target → `.dhead h2` (`head()` renders `tabindex="-1"`) → `#view`. Not on the first (boot) render; Wizard/Search manage their own focus.
- `renderTabs()` keeps focus on the equivalent tab after rebuilding `#tabbar`.
- New global: `requestFocusAfterShow(selector)` (app.js) — call before `show()` when a specific control should keep focus.
- Tests: `tests/unit/customer-screen-focus.test.js` (boots the full Customer script list from `index.html`); browser: `tests/e2e/customer-orders.cdp.js`.

## Routing, session and guest entry (2026-11-13) — implemented
- `customer-session.js` → `HSCustomerSession` (demo identity on existing key `hs_user`): `current/validate/signIn/update/signOut/customer`. Used by the account sign-in/logout/profile/delete paths, the legacy `#loginForm`, the wizard and `me()`.
- `customer-router.js` → `HSCustomerRouter`: `#/home|sections|search|orders|account`, `#/track/<id>`, `#/provider/<id>`; `show()` mirrors the screen into the URL (`replaceState`).
- `app.js`: `openRoute`, `applyEntry(hash)` (boot + `hashchange`), `afterSignIn()` (returns to a remembered link). Guest rules: `apps/guest/README.md`.
- Script order: `local-market-store.js` → `customer-session.js` → `customer-router.js` → `../guest/guest-policy.js` → `../guest/guest-entry.js` → `pages/home.page.js` → `app.js`.
- Gotcha: `MP`/`store` are top-level `const` (global lexical bindings), **not** `globalThis` properties — reference them directly (`typeof MP`), never `window.MP`.
- `pages/providers.page.js` → `HSCustomerProvidersPage.card/details/matches` (extracted verbatim from `market-ui.page.js`; 78 renders byte-identical at extraction). `market-ui` keeps `providerCard()` and the `providerDetails`/`matchProviders` screens as thin wrappers.
- `pages/request-create.page.js` → `HSCustomerRequestCreate.resolve/open`: `#/request[/<categoryId|itemId|problemId>]` opens the existing wizard via `startRequest()` (problem → step 3). The wizard screen mirrors to `#/request`.
- `hashchange` reads `event.newURL`: Chromium fires `popstate` before `hashchange`, and the popstate re-render + URL sync would otherwise overwrite the typed link.