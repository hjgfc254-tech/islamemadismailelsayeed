> **Current state (2026-11-27):** see `docs/AI_CONTEXT/START_HERE.md` and the newest entry of `docs/HANDOFF_NEXT_AI.md`. The batches below are the historical log of the frontend phase (2026-11-13/14).

# Execution Checkpoint

Compact resume state for autonomous sessions. Update after every committed batch. Commit hashes: `git log --oneline`.

## Completed batches (2026-11-13)
1. Provider P0 behavior tests + stale-action fixes â€” `854e281`.
2. Provider P1 accessibility â€” `5b25c44`.
3. Provider P2 real-browser QA + visual fixes â€” `b2003ae`.
4. Service Worker precache completeness â€” `c137eef`.
5. Provider P3 legacy parity audit â€” `7bbe4c8`.
6. Provider G3 commission preview + G4 login hand-off â€” `b85425c`.
7. Provider G1 demo self-registration (+ nav `[hidden]`, sticky-chrome, picker-cancel fixes) â€” `8e081d9`.
8. Customer Orders/Tracking focus â€” `apps/customer/app.js` (`renderTabs` keeps tab focus; `show()` restores lost focus via
   `requestFocusAfterShow`/heading/`#view`; `head()` heading `tabindex="-1"`), `market-ui.page.js` (filter focus request; timeline
   `aria-current="step"`), `tests/unit/customer-screen-focus.test.js` (new, 9), `tests/e2e/lib/cdp.js` (new, shared helpers),
   `tests/e2e/customer-orders.cdp.js` (new), Provider runner refactored onto lib (still 231/231), SW cache `-12`, docs.
   `npm test` 265/265; Customer browser 60/60. Commit `cf1e81c`.
9. Customer routing/session/guest â€” placeholders converted to real modules: `apps/customer/customer-session.js`, `customer-router.js`,
   `apps/guest/guest-policy.js`, `guest-entry.js` (+ `apps/guest/README.md`); wired into `index.html`, `app.js`, `account.page.js`, `market-ui.page.js`,
   `request-wizard.page.js`; SW cache `-13`. Tests: `customer-routing-session.test.js` (12; 0/12 on placeholders), shared `customer-app-harness.js`.
   `npm test` 277/277; Customer browser 68/68. Commit `e4c2f99`.
10. Customer providers + request-create â€” placeholders converted: `apps/customer/pages/providers.page.js` (extracted from market-ui,
   78 renders byte-identical), `pages/request-create.page.js` (`#/request[/<catalogId>]` â†’ existing wizard). Fixed: `hashchange` now reads
   `event.newURL` (Chromium popstate-before-hashchange clobbered typed links). Tests: `customer-providers-page` (6), `customer-request-create` (6),
   +1 routing regression; SW cache `-14`. `npm test` 290/290; Customer browser 75/75. Commit `f0c57c4`.
11. Admin runtime â€” 7 placeholders converted: `apps/admin/{admin-router,navigation-builder,permission-guard,admin-auth,admin-session,app}.js`,
   `login.html`; shell delegates routing/nav, gains `setAccess`/`setAccount`/denied state. Tests: `admin-runtime.test.js` (7), browser
   `tests/e2e/admin-app.cdp.js` 60/60. `npm test` 297/297. Commit `85c1cb3`.
12. Admin modules â€” 8 placeholders converted (workforce Ã—3, audit Ã—2, access-control Ã—3) by extraction from pages (42-point HEAD parity, 0 diffs)
   + permission presets wired into the role editor. Tests: `admin-modules.test.js` (8); Admin browser 69/69. `npm test` 305/305.

## Completed batches (2026-11-14, "Final frontend engineering completion")
13. Visual refresh: logo-aligned palette and intro. Commit `e75650e`.
14. Marketplace rules, role isolation, legacy migration. Commit `cb3789f`.
    - Zero-value quotes are refused in the store, the Provider UI and on approve.
    - Free-service workflow: `MP.proposeFree/respondFree/completeFree`, Provider form `pv-free-form`, Customer accept/decline.
    - Provider `#/join` onboarding and profile editing.
    - Customer Admin/role switching removed; "Ø§Ù†Ø¶Ù… ÙƒÙ…Ù‚Ø¯Ù… Ø®Ø¯Ù…Ø©" now links to Provider onboarding.
    - Legacy `portal-compat.js` and `provider-workspace.js` deleted after their Admin console capabilities moved to the
      new `apps/admin/pages/marketplace.page.js` (live MP).
    - Admin picker 320px overflow fixed (body margin).
    - Tests: `marketplace-rules` and `legacy-migration`. SW `-16`.
15. Backend-ready mock adapters. Commit `bcf2f89`.
    - `services/api-client.js` + 11 `*-api.js` + `realtime-client.js`: 50 routes, envelope, role and ownership checks,
      `setTransport` seam, no network.
    - `docs/API_CONTRACTS.md`; tests in `api-adapters.test.js` (14).
16. Provider screen change resets scroll (logout from a scrolled page left the register form off-screen at 768px).
    Dead `.role-bar`/`role-mode` CSS removed; the manual Playwright sweep was updated; SW `-18`. Commit `67a316a`.
    - Verified: `npm test` 326/326.
    - Browser runs: Customer 145/145, Provider 261/261, Admin 124/124 at 1280/768/430/390/320.

## Completed batches (2026-11-14, "Final completion sprint")
17. Inventory reproducibility: git-based file set, LF pinning, self-sizes nulled. Clean clone 0/0/0.
    Commits `ab49426`, `f3ac1dc`, `bc1b2f3`.
18. Paid order lifecycle corrected: approval no longer completes the job, transitions validated, customer-side
    simulation buttons removed. Commit `619b4cf`.
19. UI â†’ API adapters for every marketplace write (Customer, Provider, Admin); accessible confirmation sheet replaces
    `confirm()`/`prompt()`; fixed the wrong-request Â«Ø§Ø®ØªÙŠØ§Ø±Â» bug. Commit `f85be88`.
20. Guest CDP runner (165); logout via the confirmation sheet. Commit `5264c11`.
21. Accessibility: labels, contrast, a11y runner (112) and `a11y-markup` unit test. Commit `541edea`.
22. Responsive sweep ported to CDP (280/280). Fixed hidden focusable sort buttons in the phone layout of
    `HSDataGrid`. Commit `b150dc6`.
23. Interaction QA runner (206 controls, 0 inert). Fixes:
    - Customer Â«ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø·Ù„Ø¨Â» crashed on requests without a catalogue item;
    - an unknown account tab crashed the screen;
    - the Admin dashboard Â«ØªØ­Ø¯ÙŠØ«Â»/Â«Ø§Ø³ØªØ¹Ø§Ø¯Ø©Â» gave no feedback;
    - categories/departments Â«ØªÙˆØ³ÙŠØ¹/Ø·ÙŠ Ø§Ù„ÙƒÙ„Â» were silent no-ops (now disabled when there is nothing to do).
    Docs reconciled with source (Provider Workspace references). Commit pending owner review.

## Current task
None queued. Awaiting the product owner's next instruction (the visual redesign phase has been announced but not
started).

## Remaining queue (priority order)
1. Visual redesign: announced by the product owner, not started. Respect the boundaries in the latest
   `HANDOFF_NEXT_AI.md` entry.
2. Minor a11y: brand/breadcrumb links to the current page should carry `aria-current="page"` (Provider brand, Admin
   brand and breadcrumb).
3. Backend phase (future): implement `setTransport()` and hydrate the `MP` read model from the GET routes.
4. Deferred by decision: split design-system CSS (`tokens/typography/layout/components.css` are placeholders pinned
   empty by `design-token-audit.test.js`).

## Resolved decisions (2026-11-14)
- Customer â†’ Provider is the onboarding invitation to `apps/provider/index.html#/join` (no role switch, no auto-grant).
- The legacy Admin console was migrated to `apps/admin/pages/marketplace.page.js`, then removed with the legacy bridge.
- Zero-value quotes are forbidden; free service is its own workflow; Provider profile editing is enabled.
- Quote approval no longer completes the job: the provider completes and the customer confirms.
- `test-write.tmp` is excluded from the inventory: it is git-ignored, and the inventory is now the git file set.

## Pending user decisions
  were empty for non-trivial prompts (see the latest handoff).

## Exact next action
Wait for the product owner's redesign instructions. Before any redesign, read the "Safe visual redesign boundaries"
section of the latest handoff entry.
