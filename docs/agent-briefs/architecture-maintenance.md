# Brief: tidy the architecture + write the complete maintenance guide

Owner request (2026-11-25): «يحسن هيكلية المشروع — يخلي الباك اند والإداريات كأنها أسلاك اصبحت مرتبة، ودليل صيانة شامل كامل».

Follow `docs/agent-briefs/README.md`, but:
- use `Claude-Session: https://claude.ai/code/session_01W3TuWCKWoe3KxU6igeoy12`;
- work in your own worktree, and never push or deploy.

A design agent works in parallel:
- **do not edit any `*.css` file or visual markup**;
- in `apps/admin/**/*.js`, avoid HTML template changes.

Commit early and often (each finished step), so work is never lost if you are stopped.

## Hard safety rules (this project is live in production)

- **No behaviour change.**
  - Every refactor must keep `npm test` 100 % green.
  - It must keep the CDP runners green: `admin-app`, `admin-controls`, `customer-orders`, `interaction`, `client-errors`, `provider-standalone`, `offers-cycle`.
  - Serve with `python -m http.server <free port> --bind 127.0.0.1`, then run `node tests/e2e/<r>.cdp.js http://127.0.0.1:<port>`.
- **Do NOT** do any of these:
  - rename or move files that are loaded by `<script>` tags, `service-worker.js` precache, `functions/index.js` exports, tests or docs paths;
  - change routes, API envelopes, globals, storage keys, Firestore collection names, function names or regions, or script order.
  - If a move is truly worth it, do not do it — propose it in the guide (section «Proposed refactors») with the exact steps.
- **Allowed and wanted:**
  - Inside `functions/src/*.js` and `apps/admin/modules/*.js`, make the wiring readable:
    - a clear header comment per file (purpose, inputs/outputs, who calls it, collections it touches);
    - a single route table per router where routes are scattered;
    - small extractions of duplicated helpers into an existing shared helper file *only with tests proving parity*;
    - consistent error envelopes;
    - removal of dead code *only when proven unused* (search HTML script tags, imports, dynamic loads, tests, docs — CLAUDE.md rule).
  - Add a machine-checkable wiring test, e.g. `tests/unit/wiring.test.js`, that pins:
    - every API route defined in `services/*-api.js` has a plan entry in `functions/src/plan.js` or is listed as client-only;
    - every `functions/index.js` export is documented in the guide;
    - every admin nav page has its module and permission;
    - every Firestore query in `functions/src` has an index in `firestore.indexes.json` or is single-field.
- After editing `services/`, run `npm run functions:sync`.
- Graph: use `graphify query "<question>"`, `graphify path` and `graphify explain` (graphify-out/ in the main folder) before broad searching. Classic scripts link through `globalThis`, so confirm cross-file use with a pattern search.

## The maintenance guide (main deliverable)

Create `docs/MAINTENANCE_GUIDE.md`, the single entry point for anyone maintaining the platform. Write it in English, and add a short Arabic overview section at the top for the owner. Link it from `docs/AI_CONTEXT/START_HERE.md` and `docs/README.md`.

**It must cover, accurately from the source code:**

1. **System map:**
   - the three apps, the shared domain (`services/local-market-store.js` → `functions/domain`);
   - the Firebase functions (each export: trigger, region, schedule, timeout, secrets/env);
   - the Firestore collections (owner, who writes, retention), `firestore.rules`, indexes, hosting, service worker;
   - an ASCII or Mermaid diagram of the request flow «client → callable `api`/`session` → service.js → plan.js → domain → commit → change signals → clients».
2. **Wiring tables:**
   - every API route (method, path, roles, file, server plan, test);
   - every session op;
   - every admin page (module file, permission keys, server routes it calls);
   - every RBAC role and preset;
   - every scheduled clock;
   - every env var / secret (name only, never values) and where it is set (`functions/.env`, Admin › settings `system/*` docs).
3. **Feature dossiers** — for each feature, where it lives, how it flows, what to edit for a typical change, and which tests cover it:
   - orders lifecycle, offers / bidding, pricing / commission;
   - provider onboarding, workforce / invites;
   - alerts / tickets, call centre gateway, AI chat «موظف خدمة العملاء», AI routing;
   - content / site hero, notifications / push, telemetry / client errors, digests.
4. **Runbooks** (step by step, with commands):
   - local setup, tests and runners, emulators;
   - deploy (hosting / functions / rules / indexes), rollback (hosting release rollback, functions redeploy of a previous commit);
   - the service-worker bump;
   - rotate an API key (AI providers, `AGENT_API_KEYS`, Resend), add an admin employee, reset an admin password;
   - turn maintenance mode on, enable or disable the AI chat;
   - read logs, handle a failed function or a quota spike;
   - data retention tasks;
   - PITR restore basics (owner-approval only).
5. **Troubleshooting:** common symptoms → cause → fix. Examples:
   - «customer sees demo banner» = `hs_backend=local`;
   - stale UI = service-worker cache;
   - 401 on agentApi;
   - chat disabled;
   - an index is still building.
6. **Conventions:**
   - code style and CSS rules (tokens; the admin hard-coded audit; `pv-*` rule);
   - the test helpers (`tests/helpers/memory-backend.js`, node:vm);
   - commit trailers, the finish gate.
7. **Known gaps and proposed refactors**, each with risk and steps.

## Final checks

1. `npm run functions:sync` (if needed), `npm run sw:bump` (only if served files changed), `npm test` green.
2. The runners listed above green.
3. `npm run audit:refresh`, then commit.

## Final reply (Arabic, short)

1. Branch and commit.
2. What was tidied (file → change).
3. The new tests.
4. The guide sections.
5. The proposed refactors not done.
6. Whether a functions deploy is needed.
