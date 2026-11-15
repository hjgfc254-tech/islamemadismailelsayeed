# HANSALEHLAK — Firebase backend (implementation status 2026-11-15)

**Project:** `hansalahlak` (`.firebaserc`).

**Production status (2026-11-15): DEPLOYED.**
- Functions `api` and `session` (v2 callable, Node.js 24, 256 MB) in **`me-central1`**.
- Firestore rules, 13 composite indexes and both TTL policies; Realtime Database rules.
- **Activated (2026-11-15):** `DEFAULT_MODE = 'firebase'`. All three apps use the production backend by default; `?backend=local` selects the offline demo (development and automated tests). In firebase mode the local store is only a cache marked `_source: 'firebase'`: it is never seeded with demo data, and local-mode data is kept as `hs_mp_db_backup_before_firebase` for migration. If the SDK cannot start, every request fails visibly (`UNAVAILABLE`); there is no silent local fallback.
- **Super Admin:** the Auth account for the bootstrap email was created through Firebase Auth's official flow (temporary password never shown or stored), and the verification and password-reset emails were sent. Owner privileges are granted only after the owner verifies the email and signs in (`claimOwner`).
- **Browser test runners** pin `local` mode and block production backend hosts (`tests/e2e/lib/cdp.js`). The emulator E2E opts in with `?backend=firebase&emulators=1`.
- Migration: see `docs/FIREBASE_MIGRATION_PLAN.md` (not executed).

**Regions:**
- Firestore `me-central2` (Dammam).
- Realtime Database `europe-west1`.
- Functions `me-central1` (Doha).

**Why Functions run in `me-central1`:** every call performs many Firestore reads and writes but at most one RTDB write (the change signal). Co-locating with Firestore was the goal, but `me-central2` is refused for Cloud Functions in this project (`Permission denied on 'locations/me-central2'`). `me-central1` is the nearest region that accepted the deployment.

**Schema:** `docs/FIREBASE_SCHEMA.md`.

## Architecture
```
Customer / Provider / Admin apps (unchanged UI)
   └─ HSApiClient.request(...) ── firebase mode ──► services/firebase-backend.js (ES module; Firebase JS SDK 13.1.0 vendored)
        │  callable api {app, method, path, query, body, idempotencyKey}
        │  callable session {op: sync | registerCustomer | claimOwner | importLocal}
        │                                  ▼  Cloud Functions (functions/index.js → src/service.js)
        │      verify Auth token → actor via indexed lookup (phone / admins/{uid})
        │      marketplace routes: plan.js loads ONLY what the route needs (PartialDb) → app domain rules → diff commit
        │      workforce/RBAC routes: src/workforce.js (app's employee-form/status/invitation + rbac-store rules)
        │      → audit → RTDB signals
        │◄──── actor-scoped read model (scope.js) + admin workforce/RBAC → local stores → screens
        └──── RTDB signals/{uid} (newer than the last sync) → one coalesced re-sync → HSRealtimeClient.notify
```
Business rules have one source: `functions/domain/` is a hash-verified copy of `services/*.js` plus the Admin RBAC and
workforce modules. Run `npm run functions:sync` after editing them; `npm run functions:check` and a unit test fail on
a stale copy.

## What runs on the backend (firebase mode)
| Area | Operations |
|---|---|
| Customer | Phone-OTP sign-in and registration; requests (create, list, track, cancel, pick provider, confirm schedule, approve or reject quote, free-service answer, close, review with quality and photo ids, repeat, attachment ids); addresses; favorites; profile and preferences (`PATCH /customers/me`, phone must stay the verified one); account deletion (`DELETE /customers/me`); complaints; notifications |
| Provider | Phone-OTP sign-in; registration bound to the verified phone; role only after approval; respond, schedule, advance, quotes, free service, complete; profile and availability; earnings; notifications; complaints |
| Admin | Email sign-in (verified email only); summary (aggregation counts); providers (approve, reject, suspend, special rate); customers status; assignment and candidates; transactions and collection; commission; complaints. **Workforce:** employees list, invite, edit, status, re-invite (`/admin/employees…`). **RBAC:** roles and per-employee overrides (`/admin/rbac…`), enforced on every admin route. |
| Device-local by design | Request-wizard drafts, recent searches, and attachment files and thumbnails: Storage is deferred, so only attachment ids reach the server |

## Admin workforce and the first administrator
- **Employees:** `employees/{id}` keeps the app's employee shape, and the server is the only writer. `admins/{uid}`
  is the authorization record derived from an **accepted** employee. A role or status change rewrites it in the same
  transaction, so a disabled employee is refused on their next request (tested).
- **Rules:** validation, unique email and the last-active-owner guard are the app's own functions. On top of them:
  - only an owner gives or takes the owner role;
  - nobody changes their own status;
  - an accepted employee's email cannot change.
- **RBAC:** the module permission check uses the stored `system/rbac` catalogue, so custom roles and overrides really
  grant or deny. Grant limits come from the app: nobody grants what they do not hold.
- **Invitation:** an admin adds an employee with status `invited`. No email is sent by the backend. The employee
  creates an Email/Password account with that address, verifies it, and signs in to the Admin app. `session.sync`
  then accepts the invitation and the employee becomes `active`. Unverified or disabled invitations are never
  accepted.
- **First owner:**
  1. `functions/.env` holds `ADMIN_BOOTSTRAP_EMAILS`. It is git-ignored and never reaches the frontend.
  2. The owner signs in with that email. An unverified email gets a verification link and no access.
  3. After verification, `claimOwner` (verified, allow-listed, and only while no active owner exists) creates the owner
     employee and `admins/{uid}` in one transaction. It is idempotent.

## Admin server routes (functions/src/admin-extra.js, deployed 2026-11-15)
`GET /admin/audit` (owner/admin), `GET|POST /admin/settings` (autoAssign, customerFee; owner/admin), `GET|POST /admin/departments`, `PATCH /admin/departments/:id` (RBAC departments), `GET /admin/security/admins` (owner/admin, Auth last sign-in), `POST /admin/security/revoke/:uid` (owner, never self), `GET /admin/notifications/broadcasts`, `POST /admin/notifications/broadcast` (RBAC notifications; in-app only, max 500 recipients). Upfront pricing routes: `GET /pricing`, `GET|POST /admin/pricing` (see API_CONTRACTS).

## Read/write cost per operation
| Operation | Reads | Writes | Transaction |
|---|---|---|---|
| Identity (every call) | 1 indexed query (phone) or 1 doc (`admins/{uid}`) | — | — |
| `GET /requests` | system 2 + one cursor page (≤50) + its quotes/assignments (chunked `in`) | — | no |
| Request actions | system 2 + the request + its quotes/assignments/transactions/reviews + customer + assigned providers (+ ≤100 candidates when re-matching) | Changed docs only (typically 2–4) | yes |
| `POST /requests` | system 2 + customer (+ ≤100 candidates with history when auto-assigning) | Request, counter, assignment, notifications | yes |
| Directory / provider profile | ≤100 providers + their reviews / 1 provider + ≤50 reviews | — | no |
| Admin summary | 6 count aggregations | — | no |
| Admin lists | One cursor page (≤100) | — | no |
| Workforce/RBAC | ≤500 employees (bounded workforce) + `system/rbac` | Changed employees, derived `admins/{uid}`, `system/rbac` | yes (mutations) |
| `session.sync` | Bounded windows (customer ≤50 requests, provider ≤100 assignments, admin ≤200–300 per collection; admin adds the workforce) | `users/{uid}` link | no |

**Techniques**
- **Bounded reads:** a test asserts that no query is unfiltered and unlimited.
- **No N+1:** chunked `in` lookups and a per-operation read cache.
- **Transactions only for mutations;** the request counter is transactional (5 concurrent creates give unique
  numbers, tested in the emulator).
- **Duplicate submissions and retries:**
  - the client merges identical in-flight mutations;
  - each mutation carries an `idempotencyKey`;
  - the server replays the first result for 24 hours.
- **Client sync efficiency (this pass):** previously each write caused two full syncs, one after the write and one
  from its own RTDB signal. Now syncs are debounced into one per burst, and a signal older than the last sync's
  `serverTime` is ignored.
- **Transient documents** (`idempotency`, `rateLimits`) carry `expiresAt` for a Firestore TTL policy. This is a
  console step; see below.
- 13 composite indexes; one RTDB listener per signed-in user, released on sign-out.

**Read-path rate limiting (production-verified):**
- `GET` api calls and `session.sync` are limited in memory per instance, with no database writes.
- Limits: 240/min per signed-in uid; 60/min per client IP; 600/min of anonymous reads per instance.
- The client IP is the rightmost `X-Forwarded-For` hop, appended by Google's front end, so it cannot be spoofed.
- Production burst test: 400 rapid anonymous calls gave 60 allowed and 340 refused.
- **This is NOT a global limit.** Each Functions instance counts on its own. One IP can get up to `maxInstances` (10) × 60 anonymous reads per minute when traffic spreads across instances. Observed in production: 70 rapid calls gave 57–70 allowed depending on instance spread, and a 400-call burst gave 60/340. A globally shared limit would need a shared counter (one write per request) or App Check. That is deferred deliberately to avoid a database write on every read.

**Remaining bounded hot spots**
- Candidate ranking reads candidate history (≤100 candidates). The next step is to denormalize `rating` and
  `acceptRate` onto the provider.
- The admin sync is a recent window; older data goes through paginated routes.

## Manual Firebase Console steps (exact)
1. **Authentication → Sign-in method:**
   - enable **Email/Password** (needed for Admin; leave "Email link" off);
   - enable **Phone** (Customer and Provider).
   - The public project config currently does not report Email/Password as enabled (read-only check).
2. **Authentication → Settings → SMS region policy:** allow **Egypt (+20)**. Optionally add test phone numbers for QA.
3. **Authentication → Settings → Authorized domains:** add the production hosting domain. `localhost`,
   `hansalahlak.firebaseapp.com` and `hansalahlak.web.app` are already present.
4. **Authentication → Templates:** set the verification email sender name and language (Arabic) for the admin email
   verification.
5. **Usage and billing:** confirm the **Blaze** plan (required for Cloud Functions; Phone Auth SMS is billed).
6. **Firestore → TTL policies:** add a TTL policy on field `expiresAt` for collection groups `idempotency` and
   `rateLimits`. This can only be done after the first deploy creates the collections, or ahead of time from the
   console.
7. **Optional, App Check:** register the web app with reCAPTCHA Enterprise, then set `ENFORCE_APP_CHECK=true` in
   `functions/.env`.

## Evidence (2026-11-15, after this pass)
| Suite | Result |
|---|---|
| `npm test` | **368/368** (`firebase-backend.test.js` 13 tests, `firebase-integration-contract.test.js` 7 tests) |
| `npm run test:emulators` | **3/3**: lifecycle with real tokens and project rules; concurrency; migration (owner-only, dry run writes nothing, re-import adds nothing, demo skipped) |
| `npm run test:emulators:e2e` | **33/33** in headless Edge against the emulators (Customer, Admin and Provider; details below) |
| Local-mode browser runners | Customer 160, Provider 261, Admin 124, Guest 165, accessibility 112: unchanged and passing |
| Real project (read-only) | CLI access and web app verified; rules and indexes compile (`--dry-run`); Auth public config inspected |
| Deployed | Nothing |

The browser end-to-end run covers:
- **Customer:** OTP sign-in, registration, request creation, server-fed read model, admin route denied.
- **Admin:** first owner through the app dialog, server roster, adding an employee through the real workforce page.
- **Provider:** OTP sign-in after approval, offered request without contact details, accepting, contact delivered by
  sync.

## Run locally (JDK 21+; firebase-tools 15 refuses older Java)
```
$env:JAVA_HOME="$env:USERPROFILE\.tools\jdk-21.0.13+9"; $env:Path="$env:JAVA_HOME\bin;$env:Path"
npm run functions:check
npm test
npm run test:emulators
npm run test:emulators:e2e
```

## Deploy (only after explicit owner approval and the console steps above)
```
firebase deploy --only functions,firestore,database --project hansalahlak
```
After deploying:
1. The owner signs in to the Admin app with `?backend=firebase` (first-owner flow).
2. Set `DEFAULT_MODE = 'firebase'` in `services/firebase-config.js` and bump the SW `CACHE`.
3. Migrate browser data: run `HSBackend.importLocal(true)` to review the dry-run report, then
   `HSBackend.importLocal(false)`.
