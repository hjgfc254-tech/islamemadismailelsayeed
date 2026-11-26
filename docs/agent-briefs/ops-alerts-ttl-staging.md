# Brief: ops — e-mail alerts, data retention (TTL), staging environment wiring

Owner request (2026-11-26): before launch, the platform must warn the owner by itself when something breaks, old data must clean itself up, and there must be a separate test environment.

Use `Claude-Session: https://claude.ai/code/session_01W3TuWCKWoe3KxU6igeoy12`. Work in your worktree, commit there, and never push or deploy.

**Stay narrow:**
- Use `graphify query "<question>"` first (graph in `C:\Users\dell\Desktop\Development\proj\graphify-out`).
- Read `docs/MAINTENANCE_GUIDE.md` §1–§4 for the map. Then read only the files named below and what they directly call.
- No new npm packages.

## 1. E-mail alerts for critical problems

- `functions/src/tech-status.js` `healthTick` already evaluates thresholds and raises team alerts (`functions/src/alerts-adapter.js`, `alerts.js`). `digest-admin.js` already sends e-mail (Resend or the configured mailer).
- When a **critical** health alert is raised (functions failing, error spike, quota spike, clock not running), also send one short e-mail to the owner / tech recipients. Use the digest mail settings and recipients if they exist; otherwise use `ADMIN_BOOTSTRAP_EMAILS`.
- **Dedupe:** at most one e-mail per alert key per hour, stored in Firestore.
- No mail credentials → skip quietly and log once.
- Write a test with the mailer faked.

## 2. Data retention (Firestore TTL)

- Find the collections that grow forever: `digests` (has `expiresAt`?), `audit`, `rateLimits`, `idempotency`, client error reports, usage, alert events, chat logs. Check each one's code for an existing cleanup.
- Where a document already has an expiry date, add a TTL field override in `firestore.indexes.json` (`fieldOverrides`: `{collectionGroup, fieldPath, ttl: true, indexes: []}`).
- Where it does not, add an `expiresAt` Timestamp on write (Firestore TTL needs a Timestamp, not a string).
- **Retention:** audit 365 days, rateLimits / idempotency 2 days, telemetry / client errors 30 days, digests 90 days. Never shorten something a test or doc says must be kept.
- Update the retention table in the guide.

## 3. Staging environment wiring (code only — the owner creates the Firebase project later)

- `.firebaserc`: add aliases `prod` (current project) and `staging` (placeholder project id `hansalahlak-staging`).
- `services/firebase-config.js`:
  - choose the Firebase web config by hostname (`*-staging.web.app` / `localhost?env=staging`, or a staging config object with placeholder values);
  - production must stay byte-for-byte identical in behaviour.
- npm scripts:
  - `deploy:staging` (`firebase deploy -P staging --only functions,hosting,firestore`);
  - `deploy:prod` (current behaviour; it asks for a typed confirmation, so do not auto-run anything).
- Add a guide section «Staging» with the exact steps the owner does once (create the project, upgrade it to Blaze, enable Auth / Firestore / RTDB, paste the web config, deploy) and the daily flow (staging first, then prod).

## Checks

- `npm test` (all green). Run `npm run functions:sync` if you touched `services/`, `npm run sw:bump` if served files changed, and `npm run audit:refresh`.

## Finish

Commit with the message `feat(ops): e-mail alerts, Firestore TTL retention, staging environment wiring` plus the trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the Claude-Session line.

Reply in Arabic, 8 lines at most:
- the branch and commit;
- what changed per part;
- the deploy needs (functions / indexes);
- the owner's steps.
