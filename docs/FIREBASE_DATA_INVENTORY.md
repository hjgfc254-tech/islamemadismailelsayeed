# HANSALEHLAK — production data inventory and real-data enforcement (2026-11-15)

Method: a read-only inventory of the production project `hansalahlak` (Firestore REST with the local Firebase CLI
credentials; RTDB shallow read; Auth user list with emails masked). **No document was written or deleted.**

## Production — before and after (identical: nothing needed removal)

**Firestore**

| Collection | Docs | Content | Classification | Action |
|---|---|---|---|---|
| `admins` | 1 | Owner authorization record (`role: owner`, `status: active`, `employeeId: e9001`) | Verified Super Admin | Keep |
| `employees` | 1 | `e9001`, owner, active, linked uid, log | Verified Super Admin | Keep |
| `audit` | 1 | `claimOwner_<uid>`, the bootstrap audit | System (genuine) | Keep |
| `system` | 1 | `rbac` (app RBAC catalogue + overrides) | System configuration | Keep |
| `users` | 1 | Identity link of the owner (`tag`, `role`, `refId`) | System | Keep |

- **Subcollections:** none.
- **`demo: true` documents:** 0.
- **Test or synthetic documents:** 0. All tests ran against the emulators only.

**Realtime Database**

| Path | Content | Classification |
|---|---|---|
| (root) | Empty | Valid: `signals/{uid}` is written on the first business change |

**Auth**

| Users | Detail | Classification |
|---|---|---|
| 1 | The owner email, verified, provider `password` | Verified Super Admin |

**Deletion manifest: empty.** No fake, demo, test, duplicate or obsolete records exist in production. No destructive
operation was needed or performed.

## Empty but valid collections
These collections appear on the first real write of their entity; no placeholder documents are created:
- **Requests and lifecycle:** `customers`, `providers`, `requests`, `assignments`, `quotes`, `transactions`.
- **Feedback and inbox:** `reviews`, `complaints`, `notifications`.
- **Customer data:** `addresses`, `favorites`.
- **Reference data:** `serviceAreas`.
- **Backend records:** `migrations`, `idempotency`, `rateLimits`.

**System documents:**
- `system/meta`, which holds the request counter, is created by the first marketplace write.
- `system/settings`, which holds commission and auto-assign, is also created by the first marketplace write. Until
  then the server applies the app's defaults, and `GET /admin/commission` returns them.
- Writing these defaults now would only duplicate the code defaults, so they are intentionally not pre-created.

## Non-production data sources (classified)
| Source | Content | Classification | Production behaviour |
|---|---|---|---|
| localStorage `hs_mp_db` | The app's local store | In firebase mode: **cache of the server read model** (marked `_source: 'firebase'`) | Local-mode data is never shown as server data |
| localStorage `hs_mp_db_backup_before_firebase` | A browser's previous local-mode database | Local user data, unverified | Kept on the device for the owner migration (`docs/FIREBASE_MIGRATION_PLAN.md`) |
| localStorage `hs_user`, `hs_fav`, `hs_reqs`, `hs_recent`, `hs_ver` | Session reflection and legacy device keys | Device-local | `hs_user` reflects the verified identity |
| localStorage `hs_backend`, `hs_emulators` | Mode selection | Configuration | `?backend=local` for dev and tests |
| sessionStorage `hs_intro_v1`, `hs_provider_demo_session`, `hs_admin_demo_session` | Intro flag; session keys | Device-local | In firebase mode the session keys are set **from the server actor** only |
| IndexedDB `hs_attachments_v1` / `files` | Attachment files and thumbnails | Device-local user data | Storage is deferred; only ids reach the server |
| `services/local-market-store.js` `PROVIDER_SEED`, `seed()` | 7 demo providers + defaults | Demo | **Disabled in firebase mode** (empty cache). The server strips demo providers on a fresh backend. |
| Admin page fixtures (19 pages: dashboard, orders, customers, providers, services, categories, complaints, reviews, notifications, finance, commissions, settlements, reports, quotes, audit, security, settings, departments, super-dashboard) | In-memory demo datasets | Demo | **Gated in firebase mode:** "not connected to the server yet", plus live counts from `/admin/summary` on the dashboard |
| RBAC demo roster (`rbac-store.js` `buildRoster`) and workforce fixtures | Demo employees | Demo | Replaced by the server workforce in firebase mode; the Admin shell starts only after the server identity is known |
| Provider demo account picker | List of providers to "log in" as | Demo | Replaced by phone sign-in in firebase mode |
| Customer demo notices ("وضع العرض التجريبي…", demo service areas) | Demo copy | Demo | Hidden in firebase mode; service areas come from the server only |
| `shared/config/legacy-data.js` (`DEVICES`, `GUIDES`), `services/local-catalog.js` (`CAT`) | Service catalogue, devices, problems, guide slides | **Genuine reference content** of the product | Used as is (catalogue, not business records) |
| `tests/**` fixtures, emulator data | Synthetic | Test data | Emulators only; browser runners pin local mode and block production hosts |

## Real-data enforcement in the applications (firebase mode)
| App | Status |
|---|---|
| Customer | All reads come from the server's scoped read model, and all writes go through the callable API (server-confirmed envelopes; failures shown as errors). Sign-in is OTP-only; no local identity fallback. |
| Provider | Phone sign-in only (the demo picker is removed); the workspace opens for the server-resolved provider; actions go through the API. |
| Admin | The shell opens only for the server-resolved employee. Live pages are marketplace, workforce, employee details, roles and permissions. The dashboard shows live server counts. The 19 fixture pages are gated until they are rebuilt on server data. |
| All | If the SDK cannot start, every request returns `UNAVAILABLE`; there is no silent local fallback. Idempotency keys and in-flight merging prevent duplicate writes. |

## Remaining work (not data cleanup)
- Rebuild the 19 fixture-based Admin pages on server data, one module at a time. The server routes for providers,
  requests, transactions, complaints and commission already exist and are used by the marketplace page.
- Run the owner's browser-data migration, if any, per `docs/FIREBASE_MIGRATION_PLAN.md`; it needs an explicit
  decision.
