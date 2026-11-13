---
name: finish-gate
description: HANSALEHLAK V8 end-of-task gate. Use before declaring any frontend task done or writing a handoff — runs targeted tests, the full suite, inventory refresh/verification, required doc updates, and produces the evidence-based handoff report. Do not use mid-task.
---

# Finish Gate — HANSALEHLAK V8

Canonical sources (do not restate, follow them): `CLAUDE.md` › "Required checks"/"Handoff",
`docs/AI_AGENT_CONTINUATION_PROTOCOL.md` §4, §8, §9. This skill is the ordered checklist.
Shell is Windows PowerShell 5.1: no `&&`; chain with `;` or `if ($?) { ... }`.

## 1. Scope check
- `git status --short` — every changed path must belong to the bounded task.
- Nothing under `backend/` or `database/` changed. No package added to `package.json`.
- No renamed globals, routes, DOM hooks/`data-*` selectors, storage keys, or script order
  unless the task explicitly approved it and tests cover it.
- Local/demo actions are labelled as local/demo in the UI.

## 2. Tests (report only what actually ran)
1. Targeted: `node --test tests/unit/<file>.test.js` for each touched area.
2. Full: `npm test`. Compare the count with the baseline in `docs/AI_CONTEXT/START_HERE.md`.
   A drop in total count or any failure blocks handoff. If the baseline was already failing, say so with the exact output.
3. Browser: use the `browser-qa` skill. If it cannot run, write "browser QA not run — <reason>". Never imply a pass.

## 3. Documentation updates (only those affected)
- Relevant `docs/AI_CONTEXT/DOMAIN_MAPS/<domain>.md`
- `docs/IMPLEMENTATION_STATUS.md`, `docs/AI_NEXT_IMPLEMENTATION_ORDER.md`
- `docs/AI_CONTEXT/DOMAIN_MAPS/TESTING.md` when test counts or commands change
- `docs/HANDOFF_NEXT_AI.md` — append the protocol §9 report
- `docs/AI_CONTEXT/START_HERE.md` — baseline count and exact next task; keep it short

## 4. Inventory (after any file or doc change)
1. `npm run audit:refresh` — rewrites the generated files (`docs/AI_PROJECT_MAP.json/.csv/.md`,
   `docs/PROJECT_TREE.md`, `docs/AI_CONTEXT/FILE_INDEX.json`). Never hand-edit those except as in step 2.
2. New files arrive as `NEEDS_REVIEW`. After inspecting each one, set its `status` (and responsibility fields)
   in its `AI_PROJECT_MAP.json` entry — refresh preserves metadata — then run `npm run audit:refresh` again.
3. `npm run audit:inventory` must print `Missing 0 / Untracked 0 / SHA-256 mismatches 0`.
   Any doc edit after this step requires repeating 1–3.

## 5. Handoff report (to the user)
- Changed / created / deleted files (exact paths)
- Tests: command → pass/fail counts
- Browser: viewports actually checked, or "not run" + reason
- Inventory: file count, missing, untracked, mismatches
- Preserved contracts; unresolved risks and assumptions
- One exact next task with target files and acceptance criteria

Do not commit unless the user asks. Stop instead of guessing on any condition in protocol §11.
