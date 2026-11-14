# HANSALEHLAK V8 — START HERE

**Current phase:** FRONTEND ONLY  
**Latest verified baseline (2026-11-14, commit after `67a316a`):** `npm test` → 326/326 passed. Real-browser QA (CDP runners at
1280/768/430/390/320): Customer 145/145 (incl. Guest + isolation), Provider 261/261, Admin 124/124.  
**Resume state:** `docs/AI_CONTEXT/EXECUTION_CHECKPOINT.md`  
**Current handoff:** `docs/HANDOFF_NEXT_AI.md`  
**Agent protocol:** `docs/AI_AGENT_CONTINUATION_PROTOCOL.md`  
**Project skills:** `.claude/skills/`: `finish-gate`, `vm-script-test`, `browser-qa`

## Mandatory first steps
1. Read `CLAUDE.md`.
2. Read this file and `docs/AI_CONTEXT/WORKFLOW.md`.
3. Read `docs/AI_AGENT_CONTINUATION_PROTOCOL.md`.
4. Read only the relevant `docs/AI_CONTEXT/DOMAIN_MAPS/<domain>.md`.
5. Use `docs/AI_CONTEXT/FILE_INDEX.json` to locate source/tests.
6. Read `docs/HANDOFF_NEXT_AI.md` and `docs/AI_NEXT_IMPLEMENTATION_ORDER.md`.
7. Inspect source, direct dependencies, script order, callers and tests. Source code wins over docs.
8. Run `npm test` before editing to establish the actual baseline.

## Project reality: one marketplace, three apps, one shared local store
- **Shared store:** `services/local-market-store.js` (`MP`, localStorage `hs_mp_db`). Customer, Provider and Admin run on
  one origin, so a customer request reaches the provider and the Admin «تشغيل السوق» page through the same data.
- **Customer** (`apps/customer/`): browse, request, quotes, tracking and reviews. Guest is the same app in a restricted
  mode (HSGuestEntry). **No Admin links, switching or role buttons.** The only route to providers is the invitation
  «عايز تقدم خدماتك؟ انضم كمقدم خدمة» (menu and home) → `apps/provider/index.html#/join`. Registering grants nothing until
  Admin approves.
- **Provider** (`apps/provider/`): standalone app with onboarding (`#/join`), **profile editing (enabled)**, requests,
  quotes, status flow, earnings and the **free-service workflow**. The legacy in-Customer bridge (`portal-compat.js`,
  `provider-workspace.js`) was **removed** on 2026-11-14 after its capabilities were migrated.
- **Admin** (`apps/admin/`): demo account picker → shell → role-filtered nav and guard. All pages are registered.
  `pages/marketplace.page.js` runs live operations on `MP`: approvals, assignment, complaints and commissions (the
  former legacy console). Admin is reachable only from its own entry.
- **Business rules:** zero-value quotes are refused (on submit and approve, in the store and the UI). Free service is a
  separate flow (`MP.proposeFree/respondFree/completeFree`, value 0, no commission).
- **Backend-ready boundary:** `services/api-client.js` + 11 `*-api.js` + `realtime-client.js` are **mock adapters**
  (50 routes, envelope, role and ownership checks, no network). Contract: `docs/API_CONTRACTS.md`. Screens still call
  `MP` directly.
- `backend/` and `database/` are future scaffolding and OUT OF SCOPE.

## Exact next task: Customer Addresses and Support keyboard & accessibility (Phase 5 item 4)
Audit `apps/customer/pages/addresses.page.js` and `support.page.js` (forms, sheets, list actions) for keyboard operation,
labels, error association and announcement, and focus after add/edit/delete/submit. Reuse `show()`'s
`requestFocusAfterShow(selector)` and the sheet focus manager. Write tests in the `customer-screen-focus.test.js` harness
style and add a real-browser check on `tests/e2e/lib/cdp.js`. Preserve Customer globals, script order and storage keys.
After that, the optional track is migrating screens onto the mock adapters one at a time with parity tests (see
`HANDOFF_NEXT_AI.md`).

## Required finish gate
Run targeted tests, then `npm test`; browser QA when available; update domain/page/status/handoff docs; run:
```bash
npm run audit:refresh
npm run audit:inventory
```
Bump `CACHE` in `service-worker.js` whenever a precached asset changes (currently `hansalhlak-v8-architecture-18`; four
tests pin the literal). Report exact changed files, test counts, browser viewports actually checked, inventory result
and remaining risks.

## Absolute constraints
Frontend only. No backend/database/API/production auth/authorization/payment work. Local demo actions must be labelled
as such. Admin must never appear in Customer or Provider (`tests/unit/legacy-migration.test.js` enforces it). Do not delete
code or change routes, globals, DOM hooks, storage keys, script order or product rules without tracing callers and adding
regression tests.
