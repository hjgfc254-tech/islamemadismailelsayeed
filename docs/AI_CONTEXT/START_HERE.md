# HANSALEHLAK V8 — START HERE

**Current phase:** FRONTEND ONLY  
**Latest verified baseline:** `npm test` → 246/246 passed (2026-11-13, after Provider G3+G4). Real-browser Provider QA: 186/186.  
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

## Exact next task — Provider G1 standalone self-registration
P0–P3, G3 and G4 are done (`docs/PROVIDER_LEGACY_PARITY_AUDIT.md`). Add a demo-labelled "register as a new provider" flow to the
standalone account picker (`apps/provider/app.js`), reusing the legacy field set and validation (`portal-compat.js` `providerForm` + `pvForm`
submit): name, phone `[0-9+ ]{8,15}`, type, ≥1 specialty (`SERVICE_TYPES` keys / `MP.catName`), ≥1 governorate (`MP.GOVS`), optional areas
(split on `،`/`,`), years 0–60, bio ≤300, docs names. Submit → `MP.registerProvider(v)` (status `pending`) → select the new demo identity →
existing gate screen. Accessible form (labels, focus, Escape), behavior tests with the harness, real-browser check with the CDP runner.
Do not reroute Customer menu entries or unload the legacy bridge.

## Required finish gate
Run targeted tests, then `npm test`; browser QA when available; update domain/page/status/handoff docs; run:
```bash
npm run audit:refresh
npm run audit:inventory
```
Report exact changed files, test counts, browser viewports actually checked, inventory result and remaining risks.

## Absolute constraints
Frontend only. No backend/database/API/production auth/authorization/payment work. Local demo actions must be labelled as such. Do not delete legacy code or change routes, globals, DOM hooks, storage keys, script order or product rules without tracing callers and adding regression tests.
