# HANSALEHLAK V8 — AI / HUMAN AGENT CONTINUATION PROTOCOL

**Protocol ID:** `HANSALEHLAK_FRONTEND_CONTINUATION_V1`  
**Applies to:** every ChatGPT conversation, Claude/Claude Code session, coding agent, and human contributor receiving this repository.  
**Current phase:** `FRONTEND_ONLY`  
**Language:** documentation may be Arabic/English; code identifiers and contracts remain exact.

> This file is the operational handoff contract. `CLAUDE.md` remains the project guardrail. In a conflict, obey the stricter scope boundary and verify source code before trusting any map.

## 1. Non-negotiable scope boundary

Allowed now:
- HTML, CSS, frontend JavaScript, page renderers, frontend routing/shells, local demo state, accessibility, responsive behavior, visual assets, frontend documentation and tests.
- Local fixtures and explicitly labelled local/demo interactions.
- Refactors limited to a named frontend task with contract and regression coverage.

Forbidden in this phase:
- Implementing or modifying `backend/`, `database/`, production API services, server authorization, real authentication/session security, payment, payout, collection, or money movement.
- Adding secrets, real customer/provider personal data, external integrations, or claiming a local action is a real operation.
- Removing legacy bridges or compatibility files without a dedicated parity audit and explicit approval.
- Broad refactors, renaming globals/storage keys/routes/DOM hooks, or changing product rules without evidence and an accepted decision.

If a request crosses the boundary: stop at the frontend contract/mock boundary, explain the blocker, and ask for scope authorization rather than silently expanding scope.

## 2. Session bootstrap — read in this exact order

1. `CLAUDE.md` — mandatory rules and phase boundary.
2. `docs/AI_CONTEXT/START_HERE.md` — current status and exact next task.
3. `docs/AI_CONTEXT/WORKFLOW.md` — short execution loop.
4. `docs/AI_CONTEXT/DOMAIN_MAPS/<target>.md` — only the relevant app/domain.
5. `docs/AI_CONTEXT/FILE_INDEX.json` — locate exact files and status; do not load the full generated map unless needed.
6. `docs/HANDOFF_NEXT_AI.md` — resume context, decisions, last verification and known blockers.
7. `docs/AI_NEXT_IMPLEMENTATION_ORDER.md` — confirm priority.
8. `docs/FRONTEND_TEAM_AI_PROTOCOL.md` and `docs/FRONTEND_QA_ACCEPTANCE.md` — collaboration and done criteria.
9. Read the exact target source, direct dependencies, HTML script/import order, relevant tests and callers. Source code wins over stale documentation.

Do not bulk-read every document or the entire `AI_PROJECT_MAP.json` at session start. Use targeted searches.

## 3. Verify reality before implementation

Before editing:
- Run `git status --short` when Git is available; otherwise record that it is unavailable.
- Confirm the current branch/archive/version and inspect actual file timestamps/content where useful.
- Run `npm test` to establish the baseline. If it fails before changes, record the exact failure; do not attribute it to your work.
- Verify the requested file is still a placeholder/incomplete. Search for equivalent behavior in other files, legacy modules, global registries, script tags, routes, dynamic loaders and tests.
- Trace each dependency and consumer. Check storage keys, global names, selectors, event delegation and script order before changing them.
- Identify the smallest change set and write down allowed/forbidden paths for this task.
- If two sources disagree, inspect source and tests; then correct the map. Never implement from a filename or a generated summary alone.

## 4. Required implementation loop

For each task, work in one bounded slice:
1. State the user-visible outcome and exact acceptance criteria.
2. Map current behavior, ownership, dependencies, callers and compatibility contracts.
3. Implement the smallest coherent change; preserve existing route, DOM, event, storage and RTL contracts unless explicitly approved otherwise.
4. Add behavior-focused tests for success, empty, invalid, boundary, cancellation/back and unsupported states as applicable. Avoid tests that only search source text.
5. Check mobile 360–430px, tablet 768–1024px, desktop 1280px+; include 320px when the existing audit requires it.
6. Check keyboard/focus/labels/semantics for interactive UI.
7. Run targeted tests, then `npm test`.
8. Update the domain map, page catalog, implementation status, next-task order and handoff.
9. Run `npm run audit:refresh`, then `npm run audit:inventory`.
10. Package the complete updated project only after all required checks pass; verify ZIP integrity and report any unavailable browser checks honestly.

Do not mark a page `IMPLEMENTED` because its file exists or renders a heading. It must satisfy behavior, error/empty states, tests, responsive and accessibility checks. Use `IMPLEMENTED (DEMO)` when it is local simulation.

## 5. Provider architecture contract (important)

Standalone demo entry:
- `apps/provider/index.html`
- `apps/provider/app.js`
- `apps/provider/provider-shell.js`
- `apps/provider/provider-router.js`
- `apps/provider/provider-auth.js` (demo account picker only)
- `apps/provider/provider-session.js` (demo session ID only)
- `apps/provider/provider-domain.js` / `provider-request-domain.js`
- `services/local-market-store.js` (`MP`, localStorage demo store)
- `apps/provider/pages/*.page.js`
- `apps/provider/styles/provider.css`

Runtime ownership:
- `app.js` owns data reads, orchestration, event delegation, route transitions and local demo actions.
- Page modules own presentation/rendering and receive explicit dependencies/context. Do not move data mutation into renderers.
- `provider-session.js` is not authentication. `provider-auth.js` does not verify trusted identity.
- `MP` is local demo storage, not a backend/API.
- The standalone entry must not load Customer app scripts or the legacy compatibility bridge.

Legacy compatibility:
- *(Updated 2026-11-14)* `portal-compat.js` and `provider-workspace.js` were removed after the parity audit and capability migration; do not restore them.
- Do not delete, rename, or merge them into the standalone app until a separate parity task inventories every route, state, action, global, selector, script dependency and consumer, then proves behavior parity with regression/browser tests.
- A standalone renderer does not prove legacy parity.

Current standalone renderer modules:
`dashboard`, `incoming-requests`, `request-details`, `quotes`, `active-jobs`, `schedule`, `services`, `earnings`, `transactions`, `reviews`, `notifications`, `profile`.

## 6. Provider next-task queue (do not skip order without evidence)

**P0 — behavioral regression coverage**
- Add tests for provider action workflows: select demo account, availability toggle, accept, reject with reason, propose date, confirm date, quote validation/submission, advance status (valid and invalid), complete service with deductions bounds, logout/session clearing.
- Add route/deep-link coverage for every supported route and request detail IDs: unknown/missing ID, refresh/deep link, back/forward and invalid route fallback.
- Test that actions mutate only the local demo store and preserve existing Customer/legacy behavior.

**P1 — standalone Provider accessibility**
- Audit tab order, visible focus, button names, form labels, validation association, live feedback, navigation semantics and focus after route changes.
- Add keyboard/focus tests for dialogs/forms and all main actions; preserve RTL behavior.

**P2 — standalone Provider browser verification**
- Browser-run at 1280, 768, 430, 390 and 320px when browser environment is available.
- Verify no horizontal overflow, hidden controls, broken sticky navigation, clipped tables/cards, console errors or failed local assets.
- Test refresh/deep links and demo session persistence/clear behavior.
- If browser navigation is blocked, record the exact limitation; do not report a browser pass.

**P3 — legacy bridge parity audit**
- *(Done 2026-11-14)* Legacy bridge inventoried, migrated and removed.
- Build a behavior matrix comparing legacy and standalone paths.
- Keep legacy code until every required behavior is covered and an explicit removal decision is recorded.

Only after these tasks should the next app/domain be selected using `AI_NEXT_IMPLEMENTATION_ORDER.md`.

## 7. File ownership and parallel agents

Every delegated task must specify:
- One owner/merger.
- One app/domain and one user-visible outcome.
- Exact allowed files and forbidden paths.
- Dependencies/callers that must be read.
- Contracts that must remain unchanged.
- Acceptance criteria and required tests.
- Files that another agent is editing.

Do not let two agents edit the same file concurrently. Shared components, design tokens, entry points, Service Worker and generated maps require one coordinating owner. A sub-agent must return a file list, behavior changes, contract changes, tests and unresolved questions; the owner integrates and runs the full suite.

## 8. Map and documentation integrity

Canonical generated inventory:
- `docs/AI_PROJECT_MAP.json` — full machine-readable inventory and contracts.
- `docs/AI_CONTEXT/FILE_INDEX.json` — compact lookup for agents.
- `docs/AI_PROJECT_MAP.md` / `.csv` — human/export views.
- `docs/PROJECT_TREE.md` — tree.
- `docs/archive/EMPTY_PLACEHOLDERS.md` — placeholder register.

After file or documentation changes:
```bash
npm run audit:refresh
npm run audit:inventory
```
Classify newly added files from `NEEDS_REVIEW` to the correct status only after inspecting the actual implementation. Never hand-edit generated files unless the generator explicitly supports it; edit source docs/code then refresh. Verify counts and zero missing/untracked/hash mismatches.

## 9. Mandatory handoff report

Every completed task must append/update `docs/HANDOFF_NEXT_AI.md` with:
1. Task goal and scope.
2. Starting state and baseline.
3. Exact files created/modified/deleted.
4. Behavior implemented and preserved contracts.
5. Dependencies and callers affected.
6. Tests run with exact pass/fail counts and commands.
7. Browser viewports/devices actually checked.
8. Inventory result (file count, missing, untracked, hash mismatches).
9. Known issues, unverified assumptions and blockers.
10. One exact next task, its target files and acceptance criteria.

The final response to the user must summarize the same facts and link the updated archive only after verifying the file exists and ZIP integrity passes.

## 10. Copy-ready instruction for a new AI agent

```text
You are continuing HANSALEHLAK V8. Do not start coding immediately.

MANDATORY BOOT:
1. Read CLAUDE.md.
2. Read docs/AI_CONTEXT/START_HERE.md.
3. Read docs/AI_CONTEXT/WORKFLOW.md.
4. Read docs/AI_AGENT_CONTINUATION_PROTOCOL.md in full.
5. Read the relevant docs/AI_CONTEXT/DOMAIN_MAPS/<domain>.md.
6. Read docs/HANDOFF_NEXT_AI.md and docs/AI_NEXT_IMPLEMENTATION_ORDER.md.
7. Use docs/AI_CONTEXT/FILE_INDEX.json to locate source and tests.
8. Inspect actual source, direct dependencies, callers, script/import order and tests. Source wins over docs.

SCOPE: FRONTEND ONLY. Do not modify backend/, database/, production API/auth/authorization, payment, or real money movement. Local/demo only. Do not remove legacy bridges without parity proof.

FIRST:
- Report the actual current state and any discrepancy with the docs.
- Run npm test for baseline.
- Confirm the exact next task and allowed file list.
- Do not ask the user to repeat information already in the repository.

THEN:
- Implement only the bounded task.
- Add behavioral tests; preserve route/DOM/event/storage/global/RTL contracts.
- Run targeted tests and npm test.
- Run browser checks if available and state exact viewports; never invent results.
- Update domain/page maps, status, implementation order, handoff.
- Run npm run audit:refresh then npm run audit:inventory.
- Package only after integrity verification.

NEXT PROVIDER TASK:
Add behavioral tests for Provider request actions and route/deep-link workflows first. Then perform keyboard/focus audit, responsive browser QA, and finally a separate legacy bridge parity audit. *(Done 2026-11-14: parity proven, capabilities migrated, both files removed — do not restore.)*
```

## 11. Stop conditions

Stop and report rather than guess if:
- A required file or dependency is missing from the supplied archive.
- The source conflicts with the requested behavior or product decision.
- A route/action's intended semantics are unclear.
- A task requires a backend/auth/API/DB decision in this Frontend-only phase.
- Tests fail at baseline and the failure cannot be isolated.
- A legacy change risks another app without a parity test.

A good continuation is small, evidenced, tested, mapped and easy for the next agent to resume. A large undocumented rewrite is not progress.
