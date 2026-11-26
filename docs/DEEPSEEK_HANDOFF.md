> **Historical — frontend-only phase (2026-11-13/19).** This document describes the platform before it went live on Firebase. The real backend, payments, catalogue, call centre and security model are in `docs/MAINTENANCE_GUIDE.md`, and the current state is in `docs/AI_CONTEXT/START_HERE.md`. Source code wins over this file.

# Handoff for a temporary agent (DeepSeek) while Claude's limit resets

Read first: `CLAUDE.md`, `docs/AI_CONTEXT/START_HERE.md` (verified baseline + open decisions), the top entry of
`docs/HANDOFF_NEXT_AI.md`.

## Hard rules
1. Work ONLY on the branch `deepseek-work` (the start script creates it). Never commit to `main`, never merge, never
   `git push --force`, never `git reset --hard`.
2. Never deploy (`firebase deploy` is forbidden for you) and never touch production data.
3. Do not edit security-critical code: `functions/src/admin-code.js`, `functions/src/service.js` auth/rate-limit parts,
   `functions/src/scope.js`, `firestore.rules`, `database.rules.json`, `apps/admin/permission-guard.js`,
   `apps/admin/rbac-store.js`, `services/api-client.js` (controls gate).
4. One task = one commit with a clear English message. After every change:
   - `npm test` must be 100 % green;
   - UI file changed → `npm run sw:bump`;
   - anything in `services/` changed → `npm run functions:sync`;
   - files added/removed → `npm run audit:refresh`.
5. Never delete a file unless you proved it is unused (scripts, routes, tests, docs).
6. Chat with the owner in Egyptian Arabic; code, commits and docs in English.

## Method — follow it for EVERY task (this is how Claude works; it compensates for a weaker model)
1. **Restate** the task in one sentence and list what «done» means (observable result).
2. **Locate before reading**: `graphify query "<question>"` or a precise search (rg/Grep) for the exact identifiers;
   never guess file names. Read only the lines you need, then the whole function you will change.
3. **Plan** in 3–6 bullets: files to touch, the minimal change, which test proves it. If the plan touches a protected
   file or more than ~4 files, STOP and tell the owner it is a Claude task.
4. **Edit minimally**: smallest diff that solves it; keep existing style, names, data attributes, Arabic copy tone;
   no new dependencies; no refactors «while you are there».
5. **Verify immediately**: run the most related test file (`node --test tests/unit/<file>.test.js`), then `npm test`.
   For UI, look at the result (the owner can screenshot) — never claim a visual result you did not see.
6. **Bump/sync** as required (sw:bump / functions:sync / audit:refresh), `git add` the generated files.
7. **Commit** one task per commit (the git hook re-checks branch, protected files, cache, domain copy and tests and
   will refuse a bad commit — read its message and fix the cause, never bypass it with --no-verify).
8. **Report** to the owner in 3 lines: what changed, how it was verified, anything uncertain.
If you are unsure about intent, ask ONE short question instead of guessing. If a step fails twice, stop and report.

## Good tasks for you
- Copy / wording polish in Arabic (keep data attributes and test-matched texts).
- Extra unit tests under `tests/unit/` (node:test, no new dependencies).
- Small visual fixes using the existing design tokens (`shared/design-system/design-system.css`).
- Entering catalogue prices / caps the owner gives you (through the existing data files / admin flows).

## Leave for Claude
Security, the 8-digit admin code, payments, merges, deploys, large refactors, performance bundling.

## When you finish
Write a short list of your commits at the top of this file under «## DeepSeek log» so Claude can review them.

## DeepSeek log
(empty)
