# Deploy checklist — Cloud Functions / Firestore / Hosting

> **Current (2026-11-27):** production is `45e90b2`, deployed with `firebase deploy --only "functions,hosting,firestore:indexes"`.
> Standing owner approval: push + deploy after each finished change.
> Functions live: `api`, `session`, `agentApi`, `catalogFeed` (Hosting rewrite `/catalog-feed`), `paymobWebhook`, and the clocks
> `offersClock`, `healthClock`, `digestClock`, `alertsClock`, `paymentsClock`, `callLogsClock`.
>
> **Daily flow:**
> 1. `npm run functions:sync` (if `services/` changed);
> 2. `npm run sw:bump` (if served files changed);
> 3. `npm test`;
> 4. runners;
> 5. `npm run audit:refresh`;
> 6. commit + push;
> 7. `firebase deploy --only "functions,hosting"`. Add `firestore:indexes` / `firestore:rules` when those files changed.
>
> Once the staging project exists, run `npm run deploy:staging` first and `npm run deploy:prod` after (guide §4.11).
>
> **Owner switches / keys** (names only, values in `functions/.env`):
> - `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_IDS`. Set the Paymob callback to `https://me-central1-hansalahlak.cloudfunctions.net/paymobWebhook`.
> - `RESEND_API_KEY` + `MAIL_FROM` (digests and critical-alert e-mails).
> - `AGENT_API_KEYS` (AI voice agents).
> - `ENFORCE_APP_CHECK` + the site key.
>
> After the TTL deploy, confirm in Console › Firestore › TTL that the `audit` and `digests` policies are «Serving».
> The sections below are the history of earlier deploys, kept for reference.

> **Deployed 2026-11-20 (`42f420a`, owner approval):** functions `api`, `session`, `offersClock` (new, every 5 min), Firestore rules + indexes (incl. the `clientErrors` TTL), RTDB rules and Firebase Hosting. Daily Firestore backups were already scheduled (98-day retention). Smoke test: anonymous sync OK, admin route without sign-in → 401. Still manual: App Check site key (Console › App Check), the Arabic «reset password» email template (Console › Authentication › Templates) used for staff invitations.

The frontend is served by GitHub Pages and goes live on every push to `main`. The **server** (Cloud Functions in
`me-central1`, Firestore rules / indexes, RTDB rules) changes only with `firebase deploy`. Nothing below has been
deployed; the last Functions deploy was 2026-11-15 (`docs/FIREBASE_BACKEND.md`).

## What changes on the server
| Area | Commits | Effect once deployed |
|---|---|---|
| Offers round, inspection, price caps, warranty | `1c0f4a4` | `POST /requests/:id/bid`, `/choose`, `/inspection-only`; admin caps enforced server-side |
| Owner rules | `acf91aa` | wider search, flagged price jumps + visit fee, late-cancel travel fee, warranty settlement, two-sided cash confirmation, `POST /admin/providers/:id/warn` |
| Provider bonus, price-trust cues | `0af63c8` | tiers, offer priority, lower platform share, weekly target, anti-farming |
| AI routing | `0c36edf` | server-side «اكتب مشكلتك» / «صوّر المشكلة» with admin-managed providers |
| Dead code removal | `755eff5` | none at runtime |
| firebase-admin 14.5.1 + firebase-functions 7.4.0 | `c190cb7` | modular Admin API (`getFirestore` …); production audit 0 vulnerabilities |
| Client error reports | `9eca31b` | `POST /telemetry/errors`, `GET /admin/client-errors`, `POST /admin/client-errors/clear` |
| Owner emergency switches | `4df9d24` | `GET/POST /admin/controls` (owner only); maintenance / paused requests / paused sign-ups refuse customer and provider changes with 503; `controls` added to the public settings |
| Admin access code (8 digits) | this round | every admin must enter a personal 8-digit code after email + password (`session.adminCode`); 5 wrong codes lock 15 minutes; `POST /admin/security/reset-code/:uid` (owner); the audit log becomes owner-only |

**Right after this deploy every admin, the owner included, is asked to create an 8-digit code at the next sign-in.**
The owner should sign in first, create the code, then tell the staff.

Until the deploy, the live site's new screens call routes the server does not have yet: the error reporter's calls fail
quietly (by design), and offers / bonus actions return the server's «route not found» envelope.

## Before deploying
1. `npm run functions:check` — the server's copy of the domain (`functions/domain`) matches `services/`.
2. `npm test` — all unit tests pass.
3. Emulators (JDK 21: `C:\Program Files\Microsoft\jdk-21.0.13.102-hotspot`, or `%USERPROFILE%\.tools\jdk-21.0.13+9`).
   Last run 2026-11-20 at `23f893e` (firebase-admin 14): `test:emulators` 3/3, `test:emulators:e2e` 58/58.
   ```
   $env:JAVA_HOME="C:\Program Files\Microsoft\jdk-21.0.13.102-hotspot"; $env:Path="$env:JAVA_HOME\bin;$env:Path"
   npm run test:emulators
   npm run test:emulators:e2e
   ```
4. `cd functions; npm audit --omit=dev` — 0 vulnerabilities.
5. Note the commit being deployed: `git rev-parse --short HEAD`.

## Console steps (one time)
- **Firestore → TTL policies:** field `expiresAt` on collection groups `idempotency`, `rateLimits` and **`clientErrors`**
  (error groups expire after 30 days).
- Authentication providers Anonymous and Email/Password enabled (customer quick / email sign-in).
- **E-mail digests (optional, owner input):** put ONE transport in `functions/.env` (git-ignored) or as Firebase secrets
  bound to `digestClock` / `api` — never in the repository:
  - Resend: `RESEND_API_KEY`, `MAIL_FROM` (a verified sender, e.g. `HANSALEHLAK <digest@your-domain>`).
  - SMTP: `SMTP_HOST`, `SMTP_PORT` (465 = TLS), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
  Without them the digests are generated and stored but not sent; Admin › الإعدادات › الملخصات lists what is missing.
  Digests are OFF by default — the owner turns daily / weekly on there.

## Deploy
```
firebase deploy --only functions,firestore,database --project hansalahlak
```

## Verify right after
1. Customer: create a request with a priced problem → providers receive it; a provider sends an offer; the customer
   sees «وصلك عرض جديد» and chooses.
2. Admin › سجل التدقيق: «أخطاء عند المستخدمين» loads (empty is fine).
3. Functions logs: no `internal` errors in the first 15 minutes
   (`firebase functions:log --project hansalahlak`).

## Tech Center («مركز التقنية»)
- After every `firebase deploy` run `npm run deploy:record` (needs `gcloud auth application-default login` once, or GOOGLE_APPLICATION_CREDENTIALS): it writes `system/deploy.release` {commit, cache, at}. The functions also record the deployed function revision and when it was first seen (`healthClock`), so a deploy time shows even without the script.
- New scheduled function `healthClock` (every 10 min) and collection `usage` (one counter document per instance and day, 45-day TTL — `firestore.indexes.json` carries the TTL override; deploy with `--only firestore`). Docs `system/health`, `system/clocks`, `system/deploy`, `system/tech` are server-only.
- Alerts: `functions/src/alerts-adapter.js` calls `notifyTeam('tech', level, payload)` from the team alerts engine when it exists, otherwise pushes to the owner.

## Roll back
Functions keep no data migrations in this batch, so rolling back is a redeploy of the previous server code:
```
git switch --detach <commit>       # the commit noted in step 5 of the previous deploy. For the 2026-11-15 deploy the docs
                                   # name e721417 as deployed; confirm the deploy time in Console › Functions first.
firebase deploy --only functions --project hansalahlak
git switch main
```
New Firestore collections (`clientErrors`) are harmless to the old code and can stay.
