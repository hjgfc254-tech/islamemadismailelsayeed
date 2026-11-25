# Brief: technical micro-audit and fixes (code, not the look)

Owner request (2026-11-25): «ايجنت يعمل تدقيق في التقنيات نفسها — حتة حتة، ويصلح لو لقى مشكلة».

Follow `docs/agent-briefs/README.md`, but:
- use `Claude-Session: https://claude.ai/code/session_01W3TuWCKWoe3KxU6igeoy12`;
- work in your own worktree and never push or deploy;
- never touch production data.

Another agent is auditing the design in parallel, so **do not edit any `*.css` file** and do not change visual markup.

## What to audit, file by file

1. **Server** (`functions/index.js`, `functions/src/*.js`, especially the newest code):
   - `support-chat.js`, `chat-llm.js`, `agent-gateway.js`, `ai.js`, `service.js` session ops, `workforce.js`, `alerts.js`.
   - Look for: input validation gaps, authorization / ownership holes (another customer's data, admin roles, the `callcenter` role), missing rate limits, error paths that leak internals, unhandled promise rejections, races (busy locks, transactions: all reads before writes in Firestore transactions), Firestore rules vs code (`firestore.rules`, `firestore.indexes.json`: every query needs its index), retention clocks, secrets handling.
2. **Shared domain and services:**
   - Files: `services/local-market-store.js`, `services/*-api.js`, `services/firebase-backend.js`, `services/realtime-client.js`.
   - The domain is synced to `functions/domain` by `npm run functions:sync`; run it after editing `services/`.
   - Look for: state-machine bugs in the order lifecycle (see `docs/API_CONTRACTS.md`), money math (rounding, commission, zero-value quotes forbidden), ownership checks in every route, date / time-zone mistakes, double submissions.
3. **Customer, provider and admin JS** (`apps/*/**/*.js`):
   - XSS: every `innerHTML` / template with user or server data must be escaped (`esc`).
   - Event listeners added repeatedly on re-render (leaks / double handlers).
   - Timers never cleared, null/undefined crashes on missing data.
   - Broken `data-act` / `data-go` targets, wrong `aria-*`, forms without labels.
   - `localStorage` access without try/catch, service worker precache list vs files actually loaded (`service-worker.js`).
4. **Tests:** important behaviour with no test.

## Rules

- **Graph:** use `graphify query "<question>"` / `graphify explain` before broad searching (graphify-out/ exists in the main folder). Source code wins over docs.
- **Bug fixes:**
  - Fix real bugs only, each with a regression test (node:test, `tests/unit/`; server code with `tests/helpers/memory-backend.js`; browser scripts with node:vm, see the `vm-script-test` skill).
  - Do not refactor for taste, do not delete code you cannot prove unused, do not change product rules, routes, globals, storage keys or script order.
- **Security findings:** if a security finding needs an owner decision (e.g. a product rule), do not change it — list it.
- **Final checks:**
  - `npm run functions:sync` (if `services/` changed), `npm run sw:bump`, `npm test` (all green);
  - the most relevant CDP runners (serve with `python -m http.server <free port> --bind 127.0.0.1`, then `node tests/e2e/<r>.cdp.js http://127.0.0.1:<port>`: interaction, customer-orders, client-errors, admin-app, admin-controls, provider-standalone, offers-cycle);
  - `npm run audit:refresh`, then commit.

## Final reply (Arabic, short)

1. Branch and commit.
2. Fixed findings: a numbered list, each with severity (high / medium / low), the file:line, what could go wrong, the fix and its test.
3. Findings not fixed: why, and what decision is needed.
4. Whether a functions deploy is needed (server code changed).
