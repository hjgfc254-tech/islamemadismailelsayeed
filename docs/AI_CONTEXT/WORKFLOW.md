# AI Work Protocol — Low-Token Handoff

## For every new session
1. Read `CLAUDE.md`.
2. Read `docs/AI_CONTEXT/START_HERE.md`.
3. Read `docs/AI_AGENT_CONTINUATION_PROTOCOL.md` (mandatory cross-agent contract).
4. Read only the relevant domain map.
5. Use `docs/AI_CONTEXT/FILE_INDEX.json` to locate source/tests; do not load the full map by default.
6. Read `docs/HANDOFF_NEXT_AI.md` and `docs/AI_NEXT_IMPLEMENTATION_ORDER.md`.
7. Inspect the exact source, direct dependencies, callers, script/import order and tests.
8. Run `npm test` before editing to establish the actual baseline.

## Before coding
- Verify the target is still incomplete.
- Search for equivalent existing behavior.
- Identify the smallest safe change set.
- Record assumptions instead of inventing product rules.

## After coding
- Add/update tests for the behavior.
- Run targeted tests and `npm test`.
- After file/doc changes, run `npm run audit:refresh` then `npm run audit:inventory`. The refresh command preserves existing metadata and marks new files `NEEDS_REVIEW` until classified.
- Update the relevant catalog, status, next-task order, and handoff.
- Update the compact start brief if the next task changes.
- Handoff must include exact files, preserved contracts, test counts, browser viewports, inventory counts, unresolved risks and one precise next task.
- Report only tests actually executed.

## Do not
- Bulk-read every documentation file at session start.
- Rebuild a completed page.
- delete legacy code without reference/runtime proof and regression parity.
- treat mock data as production data.
- change backend/database scaffolding during Frontend phase.
