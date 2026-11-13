# HANSALEHLAK V8 — START HERE

**Current phase:** FRONTEND ONLY  
**Latest verified baseline:** `npm test` → 290/290 passed (2026-11-13, after Customer providers/request-create). Real-browser QA: Provider 231/231, Customer 75/75.  
**Resume state:** `docs/AI_CONTEXT/EXECUTION_CHECKPOINT.md`  
**Current handoff:** `docs/HANDOFF_NEXT_AI.md`  
**Agent protocol:** `docs/AI_AGENT_CONTINUATION_PROTOCOL.md`  
**Project skills:** `.claude/skills/` — `finish-gate`, `vm-script-test`, `browser-qa`

## Mandatory first steps
1. Read `CLAUDE.md`.
2. Read this file and `docs/AI_CONTEXT/WORKFLOW.md`.
3. Read `docs/AI_AGENT_CONTINUATION_PROTOCOL.md`.
4. Read only the relevant `docs/AI_CONTEXT/DOMAIN_MAPS/<domain>.md`.
5. Use `docs/AI_CONTEXT/FILE_INDEX.json` to locate source/tests.
6. Read `docs/HANDOFF_NEXT_AI.md` and `docs/AI_NEXT_IMPLEMENTATION_ORDER.md`.
7. Inspect source, direct dependencies, script order, callers and tests. Source code wins over docs.
8. Run `npm test` before editing to establish the actual baseline.

## Project reality
- Customer: most mature user journey; some responsibilities remain grouped in legacy modules. Home, Orders and Order Details have extracted renderers.
- Provider: standalone frontend demo at `apps/provider/index.html` with its own runtime and 12 renderers. Legacy `portal-compat.js` and `provider-workspace.js` remain for Customer compatibility and must not be removed without a separate parity audit.
- Admin: demo shell and registered demo pages exist; no real authentication, authorization enforcement or server-backed operations.
- Guest: lightweight scaffold; inspect its domain map before implementation.
- Shared: design system, local stores, UI primitives and shared components; reuse actual APIs rather than duplicating them.
- `backend/` and `database/` are future scaffolding and OUT OF SCOPE.

## Exact next task — Admin placeholders as real frontend modules (extraction, no duplication)
All Customer and Guest placeholders are now real (`DOMAIN_MAPS/CUSTOMER.md`). Next: `apps/admin/admin-router.js`, `navigation-builder.js`,
`permission-guard.js`, `admin-session.js`, `admin-auth.js`, `app.js`, `login.html`, `modules/*`. Most logic already lives in
`admin-shell.js`/`rbac-store.js`/pages — first map what each placeholder should own, extract it with parity tests, and connect it in
`apps/admin/index.html`; demo-only (no real auth/authorization). Read `DOMAIN_MAPS/ADMIN.md` first.
Out of scope / deferred: `services/*-api.js` (future backend HTTP), split design-system CSS (pinned by `design-token-audit.test.js`).

## Previous next task — Customer Addresses and Support keyboard & accessibility (Phase 5 item 4)
Done: standalone Provider (P0–P3, G1, G3, G4) and Customer Orders/Tracking focus (`DOMAIN_MAPS/CUSTOMER.md` "Screen focus contract").
**Pending user decision:** reroute Customer «بوابة مقدم الخدمة»/«انضم الآن» to `apps/provider/index.html` — do not do it unasked.
Next: audit `apps/customer/pages/addresses.page.js` and `support.page.js` (forms, sheets, list actions) for keyboard operation, labels,
error association/announcement and focus after add/edit/delete/submit; reuse `show()`'s `requestFocusAfterShow(selector)` and the sheet
focus manager; tests in the `customer-screen-focus.test.js` harness style; real-browser runner on `tests/e2e/lib/cdp.js`.
Preserve Customer globals, script order and storage keys.

## Required finish gate
Run targeted tests, then `npm test`; browser QA when available; update domain/page/status/handoff docs; run:
```bash
npm run audit:refresh
npm run audit:inventory
```
Report exact changed files, test counts, browser viewports actually checked, inventory result and remaining risks.

## Absolute constraints
Frontend only. No backend/database/API/production auth/authorization/payment work. Local demo actions must be labelled as such. Do not delete legacy code or change routes, globals, DOM hooks, storage keys, script order or product rules without tracing callers and adding regression tests.
