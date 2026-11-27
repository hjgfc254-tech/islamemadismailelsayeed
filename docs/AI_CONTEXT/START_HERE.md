# HANSALEHLAK (هنصلحلك) — START HERE

**Phase: LIVE on Firebase (production).** The three apps run against the real backend (Cloud Functions `me-central1`,
Firestore, RTDB signals, Firebase Auth). `?backend=local` / `hs_backend=local` is the offline demo used by tests and
browser runners. Real money: cash today; online payment (Paymob) is built on the server and off until the owner adds keys.

**Baseline (2026-11-27, deployed: functions + hosting):**
- `npm test` 694/694; browser runners `admin-app` and `admin-controls` green after the Admin work; the full set
  (customer-orders, guest, provider-standalone, a11y, responsive-sweep, interaction, client-errors) was green at its last full run.
- Service-worker cache: see `service-worker.js` (`npm run sw:bump` after any served-file change; a test fails otherwise).
- Functions: `api`, `session`, `agentApi`, `catalogFeed`, `paymobWebhook`, clocks `offersClock`, `healthClock`,
  `digestClock`, `alertsClock`, `paymentsClock`, `callLogsClock`.

## Read next (in this order)
1. **`docs/MAINTENANCE_GUIDE.md`**: the single source for the system map, every route, session op, Admin page, role,
   clock and env var, the feature dossiers, the runbooks, troubleshooting and the known gaps (§7). It is pinned to the
   code by `tests/unit/wiring.test.js`.
2. `docs/HANDOFF_NEXT_AI.md`: what changed most recently (newest on top).
3. `docs/API_CONTRACTS.md`: every API route (pinned by `api-adapters.test.js`).
4. The source and the tests you touch. **Source code wins over every document.**

Older documents written for the frontend-only phase (2026-11-13/14) carry a «Historical» banner. Use them only for
background.

## What exists (one marketplace, three apps, one shared domain)
| Entry | What it is |
|---|---|
| `apps/customer/index.html` | Customer app (Guest is its restricted mode) |
| `apps/provider/index.html` | Provider app (`#/join` onboarding) |
| `apps/admin/index.html` | Admin Center (RBAC, 8-digit code, optional TOTP 2FA) |
| `services/*.js` | Shared domain + route table (`MP`, `CAT`, `HSApiClient`), copied to `functions/domain` by `npm run functions:sync` |
| `functions/src/*.js` | Server: `service.js` (gates + transactions), `plan.js` (what to load), `scope.js` (what each actor sees), feature modules |

**Main features live:**
- Orders: offers / bidding, labour-only commission, fixed price, cancel fee.
- Warranty voucher, arrival code and before/after photos.
- Admin-managed catalogue with a question bank and served governorates, published as a CDN file.
- Shortened 4-screen request wizard.
- AI chat «موظف خدمة العملاء» (off until a provider key is set) and call-centre gateway for human / AI agents.
- Alerts / tickets, e-mail digests and critical-alert e-mails.
- Tech Center, client-error telemetry, Firestore TTL retention, 2FA, and staging wiring (the staging project is not created yet).
- Admin Center for a team (2026-11-27):
  - menu **sections with tabs** (`SECTIONS` in `admin-shell.js`);
  - **work inbox** on the home page (`modules/work-inbox.js`: items, «أنا هاخده», «حوّل لـ…», notes via `/admin/tickets`);
  - **full profiles** `#/customer|provider|order/<id>` (`modules/profile-360.js`) with internal notes (`/admin/notes`);
  - settings shown one section at a time; platform rates edited only in «نسب المنصة».

## Open work (details in the guide §7)
- **Payments go-live.** The screens are done (customer choice card + voucher, provider status / balance / wallet, Admin «المدفوعات»). Online stays off until the owner adds the Paymob keys; then test one real payment end to end.
- **Owner actions:**
  - Paymob keys + webhook URL;
  - `RESEND_API_KEY` / `MAIL_FROM`;
  - create the `hansalahlak-staging` project;
  - App Check key;
  - support numbers;
  - legal review;
  - retention for `opsAlerts` / `opsTickets` / `aiUsage` / `adminNotes`.
- **Performance:** customer LCP ~5 s on Fast-3G; bundling needs esbuild (ask before installing).
- **Photos:** stored on the device only; the owner plans Supabase Storage.
- **About 17 old agent worktrees** to review and remove.

## Working rules
- Owner language: simple Egyptian Arabic in chat. Code, commits and docs in English.
- Standing approval: push + `firebase deploy` after each finished change. Destructive data operations need the owner.
- After editing `services/`: `npm run functions:sync`. After served files: `npm run sw:bump`.
- Finish gate:
  1. targeted tests;
  2. `npm test`;
  3. relevant runners (`python -m http.server 8099 --bind 127.0.0.1`, then `node tests/e2e/<r>.cdp.js http://127.0.0.1:8099`);
  4. `npm run audit:refresh`;
  5. `npm run audit:inventory`.
- Never put Admin code into Customer / Provider. Never delete code without proving it unused (script tags, globals, tests, docs).
- Graph: `graphify query "<question>"` before broad searches (`graphify-out/`, local only).
- Agent briefs for parallel work live in `docs/agent-briefs/`. Give agents narrow tasks.

## Project map & UI editing
- `docs/README.md`: which document answers what.
- `docs/UI_EDIT_GUIDE_AR.md`: which JS renders and which CSS styles each page.
- `docs/DEPLOY_CHECKLIST.md`: deploy steps; `docs/MAINTENANCE_GUIDE.md` §4 runbooks.
