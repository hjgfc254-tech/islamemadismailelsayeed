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
