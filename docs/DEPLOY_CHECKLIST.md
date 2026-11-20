# Deploy checklist — Cloud Functions / Firestore (pending owner approval)

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

Until the deploy, the live site's new screens call routes the server does not have yet: the error reporter's calls fail
quietly (by design), and offers / bonus actions return the server's «route not found» envelope.

## Before deploying
1. `npm run functions:check` — the server's copy of the domain (`functions/domain`) matches `services/`.
2. `npm test` — all unit tests pass.
3. Emulators (JDK 21, already at `%USERPROFILE%\.tools\jdk-21.0.13+9`):
   ```
   $env:JAVA_HOME="$env:USERPROFILE\.tools\jdk-21.0.13+9"; $env:Path="$env:JAVA_HOME\bin;$env:Path"
   npm run test:emulators
   npm run test:emulators:e2e
   ```
4. `cd functions; npm audit --omit=dev` — 0 vulnerabilities.
5. Note the commit being deployed: `git rev-parse --short HEAD`.

## Console steps (one time)
- **Firestore → TTL policies:** field `expiresAt` on collection groups `idempotency`, `rateLimits` and **`clientErrors`**
  (error groups expire after 30 days).
- Authentication providers Anonymous and Email/Password enabled (customer quick / email sign-in).

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

## Roll back
Functions keep no data migrations in this batch, so rolling back is a redeploy of the previous server code:
```
git switch --detach <commit>       # the commit noted in step 5 of the previous deploy. For the 2026-11-15 deploy the docs
                                   # name e721417 as deployed; confirm the deploy time in Console › Functions first.
firebase deploy --only functions --project hansalahlak
git switch main
```
New Firestore collections (`clientErrors`) are harmless to the old code and can stay.
