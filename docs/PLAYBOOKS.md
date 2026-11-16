# HANSALEHLAK — Playbooks (step-by-step plans for every big move)

Each playbook: **goal → prerequisites → steps → how to verify → how to roll back → cost/risk**. Commands run from the
repo root on Windows PowerShell. Firebase project: `hansalahlak` (`.firebaserc`), Functions region `me-central1`.
Related: `docs/PROJECT_REFERENCE.md` (what everything is), `docs/DESIGN_MAP.md` (which file styles what).

**Golden rules for every playbook**
1. `npm test` green before anything leaves your machine.
2. Commit and push to GitHub *before* deploying, so every deploy matches a commit.
3. Change one thing at a time; deploy the server (Functions) before the UI that needs it.
4. Never commit secrets (`.env`, service-account JSON, keystores, private keys).

---

## 1. Release checklist (use before any deploy)
1. `npm run functions:sync` (if `services/` or `shared/config/legacy-data.js` changed).
2. `npm test` → all pass.
3. If any shipped file (HTML/CSS/JS/images) changed: bump `CACHE` in `service-worker.js` (e.g. `-firebase-7` → `-firebase-8`)
   and update the 4 tests that pin it (`static-audit`, `design-system`, `provider-pages`, `accessible-tabs-contract`).
4. `npm run audit:refresh` then `npm run audit:inventory` (0 missing / 0 untracked / 0 mismatches).
5. `npm run docs:reference` if the data model or routes changed.
6. `git add -A; git commit -m "..."; git push`.
7. Deploy what changed (playbooks 2–3), then smoke-test (§2.5).

## 2. Publish the website on Firebase Hosting (first time)
**Status today:** `firebase.json` has **no `hosting` section** yet, and the site root has no `index.html` (the customer
app is `apps/customer/index.html`). `_redirects` is a Netlify-style file; Firebase ignores it.

**Steps**
1. Add a `hosting` block to `firebase.json` (public = repo root, but **exclude everything that is not the website**):
   ```json
   "hosting": {
     "public": ".",
     "ignore": ["firebase.json", "**/.*", "**/node_modules/**", "functions/**", "tests/**", "docs/**", "scripts/**",
                "backend/**", "database/**", "graphify-out/**", "ai-workforce/**", "design-reference/**",
                "firebase-*-backup-*/**", "**/*.md", "**/*.bak", "**/*.zip", "package*.json", "*.rules", "*.rules.json",
                "firestore.indexes.json", "_redirects"],
     "rewrites": [
       { "source": "/provider/**", "destination": "/apps/provider/index.html" },
       { "source": "/admin/**", "destination": "/apps/admin/index.html" }
     ],
     "redirects": [ { "source": "/", "destination": "/apps/customer/index.html", "type": 302 } ],
     "headers": [
       { "source": "/service-worker.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
       { "source": "**/*.@(js|css|html)", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
       { "source": "**/*.@(webp|png|jpg|svg|woff2)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=604800" }] }
     ]
   }
   ```
2. Preview without touching production: `firebase hosting:channel:deploy preview --expires 7d` → open the URL it prints,
   test customer / provider / admin on a phone.
3. Go live: `firebase deploy --only hosting`.
4. In Firebase Console → Authentication → Settings → **Authorized domains**: make sure `hansalahlak.web.app` (and later
   your own domain) is listed, otherwise sign-in fails.

**Verify:** open `https://hansalahlak.web.app` → lands on the customer app; sign in; create a request; open
`/provider` and `/admin`; DevTools → Application → Service Worker shows the new `CACHE` name. Confirm that
`https://hansalahlak.web.app/docs/PROJECT_REFERENCE.md` returns **404** (private files not published).
**Roll back:** Console → Hosting → release history → *Rollback*, or `firebase hosting:clone hansalahlak:live@<versionId> hansalahlak:live`.
**Cost:** free tier covers 10 GB storage / 360 MB/day transfer; above that pay-as-you-go.

## 3. Deploy only the server / rules
* Functions: `firebase deploy --only functions` (≈2–4 min). Verify: `firebase functions:log --only api` and a sync from the app.
* Firestore rules + indexes: `firebase deploy --only firestore:rules,firestore:indexes`.
* Realtime Database rules: `firebase deploy --only database`.
* Roll back Functions: check out the previous commit (`git checkout <sha> -- functions`), `firebase deploy --only functions`, then return to `main`.

## 4. Custom domain (e.g. hansalehlak.com)
1. Buy the domain (Namecheap / GoDaddy / Google-compatible registrar).
2. Console → Hosting → *Add custom domain* → follow the TXT verification, then the A records it gives.
3. Wait for SSL (minutes to 24 h). Add the domain to Authentication → Authorized domains.
4. Update `manifest.json` `start_url` only if paths change (they don't), and any links you shared.

## 5. Android app on Google Play
**Recommended path: Trusted Web Activity (TWA)** — the app is already a PWA, so Android wraps the live site with no code
fork; every website update reaches the app instantly.
1. Prerequisites: site live on HTTPS (playbook 2, ideally your own domain), `manifest.json` with 192 and 512 icons
   (exists), service worker (exists), Google Play developer account (one-time $25).
2. Install tools: Node + JDK 17 + Android SDK (or let Bubblewrap download them): `npm i -g @bubblewrap/cli`.
3. `bubblewrap init --manifest https://<domain>/manifest.json` → choose package id (e.g. `com.hansalehlak.app`), app
   name «هنصلحلك», colors from the manifest; it creates a **signing keystore** — back it up offline, never commit it.
4. `bubblewrap build` → produces `app-release-bundle.aab`.
5. Digital Asset Links: publish `/.well-known/assetlinks.json` on the site (Bubblewrap prints its content with your SHA-256
   fingerprint; when using Play App Signing take the fingerprint from Play Console → App integrity). Without it the app shows a URL bar.
6. Play Console: create app → upload the `.aab` to *Internal testing* → store listing (Arabic texts, screenshots,
   512 icon, feature graphic) → **privacy policy URL** (`/apps/customer/index.html#/support` policy or a dedicated page)
   → **Data safety** form (phone, name, address, approximate location if map used; stored on Google Firebase) →
   content rating → target audience → then promote to Production.
7. Push notifications work inside a TWA through the web push already implemented.
**Alternative: Capacitor** (`npx cap init`, `npx cap add android`) if you need native features (contacts, background
location, native payments SDKs). Costs a separate build per release; keep the web code as the single source.

## 6. iPhone app (App Store)
1. Apple Developer Program ($99/year) and a Mac with Xcode.
2. Use **Capacitor** (Apple does not accept TWAs): `npm i @capacitor/core @capacitor/cli`, `npx cap init`, set `webDir`
   to a build folder that copies `apps/`, `shared/`, `services/`, `assets/` (or point `server.url` at the live site).
3. `npx cap add ios`, open in Xcode, set bundle id, icons, signing → Archive → upload → TestFlight → review.
4. Web push on iOS works only for home-screen web apps (iOS 16.4+); for the native app add `@capacitor/push-notifications` + APNs key in Firebase.

## 7. Real SMS phone verification (OTP)
1. Console → Authentication → Sign-in method → enable **Phone**; project must be on **Blaze** (paid) plan.
2. Add Egypt in *SMS region policy* (allow list) to block abuse; set a budget alert (playbook 12).
3. The client code path for phone sign-in exists (`services/firebase-backend.js` / account page); re-enable it in the sign-in card and test with Firebase *test phone numbers* first.
4. Cost: per-SMS fee (check current Firebase pricing for Egypt). Keep email / guest sign-in as fallbacks.

## 8. Online payments (cards / wallets) — e.g. Paymob, Fawry, Kashier
1. Business: commercial register + bank account for the gateway contract; decide who is merchant of record.
2. Server: new Functions endpoints `POST /payments/intent` (creates order at the gateway, amount from the request's
   `agreedValue`/approved quote — never from the client) and an **HTTPS webhook** that verifies the gateway signature
   and marks `transactions.collection = 'paid'`.
3. Data: add `payments` collection `{id, reqId, customerId, amount, gateway, gatewayRef, status, at}`; settlement to
   providers stays in admin settlements.
4. UI: «ادفع أونلاين» button on the price card / completion screen; keep cash as an option.
5. Secrets: gateway keys in **Secret Manager** (`firebase functions:secrets:set PAYMOB_KEY`), never in the repo.
6. Tests: webhook signature, idempotency (same callback twice), amount mismatch rejection.

## 9. Upload request photos to the cloud (so the provider sees them)
Today attachments stay on the customer's device (IndexedDB). Plan:
1. Enable **Cloud Storage**; rules: deny all direct access, or allow `write` only to `uploads/{uid}/**` with size ≤ 5 MB and image content types.
2. Upload from the wizard after compression (reuse `site-content-editor.js` `compress`), save object paths in `requests.attachments`.
3. Serve to the provider through a Function that checks the provider accepted the job and returns a short-lived signed URL.
4. Add a cleanup job (scheduled Function) for files of requests closed > 180 days.

## 10. Live technician location (Uber-style map)
1. Provider app: when status is `enroute`, watch `navigator.geolocation` (needs permission; foreground only on the web).
2. Write to RTDB `live/{reqId}` `{lat,lng,at}` via a callable that checks the provider is the accepted one (or RTDB rules keyed by uid).
3. Customer tracking: Leaflet map (already vendored) subscribed to `live/{reqId}`; ETA from distance ÷ city speed.
4. Stop sharing automatically at `arrived`; delete the node at completion (privacy).

## 11. Staging environment (test before production)
1. Create a second Firebase project (e.g. `hansalahlak-staging`); `firebase use --add` → alias `staging`.
2. Put its web config in `services/firebase-config.js` behind a host check (staging domain → staging config).
3. `firebase deploy --only functions,hosting -P staging` → test → then deploy to `default`.

## 12. Costs, budgets and monitoring
* Console → Usage and billing → **Budgets & alerts** (e.g. alert at 25 / 50 / 100 USD).
* Functions logs: `firebase functions:log`; Cloud Console → Logging → filter `resource.type="cloud_run_revision"`.
* Firestore usage: Console → Firestore → Usage. The server already caches public data 30 s per instance (`partial.js`).
* Add **App Check** (reCAPTCHA Enterprise for web) to block scripted abuse of the callables; enforce after monitoring for a week.

## 13. Backups and restore
1. Enable daily **Firestore scheduled backups** (Console → Firestore → Disaster recovery) or
   `gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d`.
2. Export on demand before risky changes: `gcloud firestore export gs://<bucket>/backup-<date>`.
3. Restore into a new database and copy back only what is needed — never overwrite production blindly.

## 14. Everyday admin changes (no code)
* New category / device / problem, prices, commission per category, provider special rate → Admin center pages.
* Hero, slides, icons, announcement bar → Admin → إعدادات النظام → واجهة الموقع.
* Promo codes, invite reward, packages → Admin → إعدادات النظام → العروض والخصومات.
* Employees and permissions → Admin → فريق العمل / الأدوار.

## 15. Design changes / rebrand
Follow `docs/DESIGN_MAP.md`. Colors and fonts: tokens in `shared/design-system/design-system.css`. Logo/icons:
`assets/brand/`, `manifest.json`. Then release checklist (§1) — remember the `CACHE` bump.

## 16. Moving to another backend (Supabase, own Node server…)
The business rules are backend-agnostic (`services/*.js` run in the browser and in Functions). To move:
1. Implement the same storage adapter interface used by `functions/src/partial.js` (`get/set/del/query/list`).
2. Re-host `functions/src/service.js` behind an HTTP server (Express) with your auth verifying tokens.
3. Replace RTDB signals with WebSocket/Supabase Realtime; keep the envelope `{ok,status,data|error}` so clients do not change.
4. Migrate data collection by collection (`docs/PROJECT_REFERENCE.md` §4 lists every field); verify counts and sums.

## 17. Moving the frontend to a framework (React / Next.js)
Do it page by page: renderers in `pages/*.page.js` are pure functions `(ctx) → HTML`, so wrap one screen at a time, keep
`services/*` as-is (import them as modules), keep CSS tokens. Do not rewrite everything at once; keep tests green per screen.

## 18. Security review before public launch
* Owner account with 2-step verification on the Google account; at least two admins.
* App Check (§12), budgets (§12), backups (§13).
* Real support contacts in `apps/customer/pages/support.page.js` (live mode hides placeholders until then).
* Terms and privacy texts reviewed by a lawyer (`POLICIES` in `support.page.js`).
* Remove test accounts / test requests from production (Admin pages, or a one-off script with a backup first).

## 19. Incident / something broke after a deploy
1. Roll back Hosting (§2) or Functions (§3) first; investigate after.
2. Read `firebase functions:log --only api` for the failing route; reproduce with `npm test` / emulators
   (`firebase emulators:start`).
3. Fix on a branch, add a test that reproduces the bug, release checklist, redeploy.
