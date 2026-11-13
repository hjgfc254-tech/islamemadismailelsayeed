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
- Details/providers/request-create route modules are still grouped or not yet independently wired; do not infer completion from filenames.
- Styles: `apps/customer/styles/customer.css` plus `shared/design-system/`.
- Local services: `services/local-catalog.js`, `services/local-market-store.js`, `services/local-attachments.js`.
- Current concern: large files and behavior still grouped in legacy modules. Refactor only incrementally, preserving public globals/events/DOM contracts and adding regression tests.

- Bottom Sheet: rendered in `apps/customer/index.html` (`#sheet`, `role=dialog`, `aria-modal=true`) and managed by `apps/customer/app.js` (`sheet`, `closeSheet`). TASK 04 adds opener preservation, initial focus, Tab/Shift+Tab containment, Escape, focus restoration/fallback, and background inert/aria-hidden isolation. `origin` remains a separate problem-list return context. Browser coverage: `tests/e2e/customer-sheet-focus.browser.py`.

- Home search combobox (`#q` / `#home-sg`) in `apps/customer/app.js`: keyboard selection uses ArrowUp/ArrowDown, Enter activates the active suggestion, Escape closes, and ARIA expanded/active-descendant state is synchronized.
- Dedicated Search page (`HS_SEARCH.bind` in `apps/customer/pages/search.page.js`): result groups expose listboxes/options; ArrowUp/ArrowDown moves active option, `aria-activedescendant`/`aria-selected` synchronize, Enter activates through the existing detail-page route, and Escape clears active state.
- Guide carousel tabs (`#dots`): each tab controls and labels its slide, with shared roving tabindex and Arrow/Home/End support.
- Request Wizard (`apps/customer/pages/request-wizard.page.js`): step headings receive focus on render; progress exposes numeric state; required controls have labels/required semantics; validation errors are announced and associated with/focus the first invalid field or choice; date/period/category/item/problem choices expose pressed state. Browser test: `tests/e2e/customer-request-wizard-accessibility.browser.py`.
- Account login form and preferred contact select now have explicit label associations.
- Browser checks: `customer-search-keyboard.browser.py` 28/28; `customer-request-wizard-accessibility.browser.py` 24/24; Bottom Sheet checks remain 25/25 at each of 1280/768/390/320. These are focused Chromium checks, not a complete Customer accessibility audit.

- **2026-11-13 page extraction:** Home and Orders markup were extracted behind explicit dependency-injection contracts. `home.page.js` loads before `app.js`; `orders.page.js` loads before `market-ui.page.js`. Both are presentation-only and preserve existing globals/actions. Tests: `tests/unit/customer-page-renderers.test.js`; harnesses `home.test.js` and `discover.test.js` load the home module in the same order as production.

- **Customer extraction batch 01 (continued):** Tracking/order-details markup moved from `market-ui.page.js` to `order-details.page.js` as `HSCustomerOrderDetailsPage.render(ctx)`. It retains current status messages, provider/search/quote/proposal blocks, request summary, action data attributes, and simulated-progress banner. Data lookup and all click/submit handling remain in `market-ui.page.js`; no workflow behavior was reimplemented.
