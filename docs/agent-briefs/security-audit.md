# Brief: full-cycle audit + security review (find, prove, fix)

Goal: walk the whole product cycle and find anything that can break or be abused, then fix what is safe to fix.
Apps: customer / provider / admin (classic scripts, `globalThis` globals) + Firebase backend `functions/` (callables
`api`, `session`; scheduled clocks), Firestore + RTDB rules, hosting. Production project: hansalahlak (do NOT touch it).

## Cycle to walk (server path first: functions/src/service.js → plan.js → runtime.js → services/*.js domain)
guest browse → customer sign-up (phone OTP / email / quick) → new request (+photos, location) → offers round / auto-assign
→ provider accepts / bids / quote → customer approves → arrival PIN → chat → complete → cash / tip → review → complaint
→ admin actions (assign, suspend, controls, marketing, pricing, workforce / RBAC, access code, alerts, tickets, tech
center, digests) → account deletion. Also: provider registration + approval, admin invitation flow.

## Look for (with a concrete exploit path for each finding)
- Authorization: IDOR (other user's request / chat / photos / quote / address), role confusion between apps, admin
  routes reachable without the 8-digit code, RBAC bypass via overrides, data separation (tech / content / finance must
  get no raw PII — functions/src/scope.js scrubForRole, permission-guard apiDenied), provider seeing customer contact
  before accepting.
- Business logic: price / fee / commission tampering from the client, negative or huge numbers, promo / referral abuse,
  self-dealing (provider = customer phone), bonus farming, replay (idempotency), race conditions in transactions,
  status-flow skips (complete without accept, review twice, PIN brute force), cash disputes.
- Input: XSS in every innerHTML path (names, descriptions, chat, notes, error reports, alert titles, ticket notes),
  oversized payloads, path traversal in ids (`/`, `..`), prototype pollution (`__proto__` keys), CSV injection in
  exports, open redirects in push links / deep links.
- Rules: firestore.rules, database.rules.json (signals/{uid}, typing/*), storage if any — least privilege.
- Abuse / cost: rate limits, AI endpoints, telemetry endpoint, unauthenticated writes, enumeration (phone exists?),
  new delta sync (`since` param) and alerts / tickets routes.
- Secrets: nothing secret in the repo or served files (functions/.env is git-ignored — do not open or print it).

## Rules
- Work ONLY in your worktree. First `git merge main`. Read CLAUDE.md. graphify rule: when graphify-out/graph.json
  exists, run `graphify query "<question>"` before your first grep/search/source read for a codebase question; read raw
  files only for lines the graph or an earlier read located. Keep reads small.
- Fix confirmed issues that are low-risk and covered by a test you add (tests/unit/*.test.js, node:test, in-memory
  backends like tests/helpers/memory-backend.js). Do not redesign features. Anything risky / product-changing: report only.
- After changes: `npm run functions:sync` (if services/ changed), `npm run sw:bump` (if served files changed), `npm test`
  100 % green, `npm run audit:refresh`. Commit on your branch, message ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never push, never deploy, never call production, never print secrets.
- Write the report to `docs/SECURITY_AUDIT_2026-11-23.md` (in your worktree, committed): table of findings
  (id, severity critical/high/medium/low, area, exploit path, status fixed/open, file:line), then the cycle walk notes.
- Final reply (short, Arabic): branch, commit, counts by severity, what was fixed, what needs the owner's decision.
