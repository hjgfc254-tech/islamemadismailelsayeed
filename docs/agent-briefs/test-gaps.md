# Brief: close the test gaps (tests only)

Owner request (2026-11-26): before launch, important behaviour must be covered by tests. **Add tests only — do not change product code.** If a test reveals a real bug, do not fix it: mark the test `{ todo: 'bug: …' }` and list it in your reply.

Use `Claude-Session: https://claude.ai/code/session_01W3TuWCKWoe3KxU6igeoy12`. Work in your worktree, commit there, and never push or deploy.

**Stay narrow:**
- Use `graphify query "<question>"` first (graph in `C:\Users\dell\Desktop\Development\proj\graphify-out`).
- `docs/MAINTENANCE_GUIDE.md` §2 lists every route; §7 lists the gaps (about 32 routes without a path test, and no test for `ai.classify`).
- Reuse the existing helpers: `tests/helpers/memory-backend.js` for server code, and node:vm loaders for browser scripts (see existing tests such as `tests/unit/support-chat.test.js` and `tests/unit/wiring.test.js`).

## What to add

1. **`tests/unit/ai-classify.test.js`** — `functions/src/ai.js` `classify` with the provider faked (`ai.setFetch`):
   - valid item / problem chosen from the catalogue;
   - the provider returns garbage or an unknown id → a safe failure;
   - feature off → refused;
   - the daily quota;
   - an image that is too large is refused;
   - provider failover.
2. **`tests/unit/routes-coverage.test.js`** — for the API routes in `services/*-api.js` that no test calls today (compute the list by scanning `tests/` for each path):
   - one happy-path call and one forbidden-role call each, through the domain client in a vm context (as other tests do);
   - aim for every uncovered route; skip only routes that need real external services, and list them.
3. Keep every test fast (the whole new set under 20 s).

## Checks

- `npm test` (all green, apart from `todo` items).
- `npm run audit:refresh`.

## Finish

Commit with the message `test: ai.classify and uncovered API routes` plus the trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the Claude-Session line.

Reply in Arabic, 6 lines at most:
- the branch and commit;
- the number of tests added and routes covered;
- any bugs found (file:line, what goes wrong).
