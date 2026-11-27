# HANSALEHLAK — Maintenance Guide (دليل الصيانة)

The single entry point for anyone who maintains the platform. Built from the source on 2026-11-25, last reviewed
against the source on 2026-11-27 (main `45e90b2`). **Source code wins** over this file; `tests/unit/wiring.test.js` fails when the
routes, functions exports, session ops, env vars, Admin pages, RBAC presets or Firestore indexes drift from it.

## نظرة عامة سريعة للمالك (بالعربي)

- **المنصة = 3 تطبيقات** (العميل، الفني، الإدارة) بتشتغل في المتصفح، وكلهم بيستخدموا **نفس قواعد الشغل** الموجودة في
  `services/` (الطلبات، الأسعار، العروض، الشكاوى…). نفس الملفات دي بتتنسخ للخادم في `functions/domain` بأمر
  `npm run functions:sync`، فالقاعدة بتتكتب مرة واحدة وتشتغل في الاتنين.
- **الخادم** = Firebase Cloud Functions في منطقة `me-central1`: دالة `api` لكل طلب من التطبيقات، ودالة `session`
  للمزامنة وتسجيل الدخول والشات والذكاء الاصطناعي، و`agentApi` للكول سنتر الآلي، و`catalogFeed` (ملف الكتالوج
  المنشور للعملاء عبر الـ CDN)، و`paymobWebhook` (تأكيد الدفع من Paymob)، و6 ساعات مجدولة (العروض، الصحة، الملخصات،
  التنبيهات، المدفوعات، حذف التسجيلات القديمة).
- **البيانات** في Firestore، ومحدش من المتصفح يقدر يقراها أو يكتبها مباشرة — كل حاجة بتعدّي على الخادم اللي بيتأكد
  مين اللي بيطلب وإيه المسموح له. الإشارات السريعة (فيه تحديث) بتعدّي على Realtime Database.
- **الإدارة** فيها أدوار جاهزة (المالك، مدير، عمليات ودعم، المالية، المحتوى والأسعار، التقنية، الكول سنتر…) وكل صفحة
  ليها صلاحية. كل موظف إدارة لازم يدخل بإيميل + باسورد + **كود من 8 أرقام**، ويقدر يشغّل **تحقق بخطوتين** بتطبيق
  Google Authenticator.
- **الكتالوج** (الأقسام، الخدمات، الأسئلة، المحافظات المتاحة) بيتعدّل وينشر من الإدارة › الخدمات، والعملاء بيحمّلوه
  ملف واحد ثابت (القسم 4.6b).
- **الدفع:** بعد الاتفاق على السعر العميل بيختار كاش للفني بعد الشغل، أو أونلاين (Paymob) — فلوس الأونلاين بتتحجز
  لحد ما العميل يأكد، ومعاها قسيمة ضمان 20 يوم، ونسبة المنصة على المصنعية بس (القسم 3.14). الأونلاين مقفول لحد ما
  مفاتيح `PAYMOB_*` تتحط.
- **أهم أوامر:** `npm test` (لازم يبقى كله أخضر) · `npm run functions:sync` بعد أي تعديل في `services/` ·
  `npm run sw:bump` بعد أي تعديل في ملفات الموقع · النشر بـ `firebase deploy` (القسم 4).
- **لو حاجة باظت:** القسم 5 (الأعراض → السبب → الحل). أهمها: العميل شايف شريط «نسخة تجريبية» = المتصفح ده متسجل عليه
  `hs_backend=local`؛ الصفحة قديمة = كاش الـ service worker.

## Contents
1. [System map](#1-system-map)
2. [Wiring tables](#2-wiring-tables) — routes, session ops, Admin pages, RBAC, clocks, env vars
3. [Feature dossiers](#3-feature-dossiers)
4. [Runbooks](#4-runbooks)
5. [Troubleshooting](#5-troubleshooting)
6. [Conventions](#6-conventions)
7. [Known gaps and proposed refactors](#7-known-gaps-and-proposed-refactors)

---

## 1. System map

### 1.1 The three apps and the shared domain

| Entry | Role | Boot |
|---|---|---|
| `index.html` | redirect → Customer app | — |
| `apps/customer/index.html` | Customer app; Guest is its restricted mode (`apps/guest/`) | `apps/customer/app.js`, router `customer-router.js` |
| `apps/provider/index.html` (+ `login.html`) | Provider app (the only provider UI) | `apps/provider/app.js`, `provider-router.js`, `provider-shell.js` |
| `apps/admin/index.html` (+ `login.html`) | Admin Center | `apps/admin/app.js`, `admin-shell.js` (NAV), `admin-router.js` |

All three are **classic scripts** linked through `globalThis` globals (`MP`, `CAT`, `HSApiClient`, `HSOrdersApi`,
`HSAdminRbac`, `HSAdminPermissionGuard`, …). **Script order in each `index.html` is load-bearing.**

The **shared domain** (business rules) is one set of files used in the browser *and* on the server:

```
shared/config/legacy-data.js → services/local-catalog.js (CAT) → services/local-market-store.js (MP, localStorage hs_mp_db)
→ services/api-client.js (HSApiClient: route table, envelope, role gate, owner switches)
→ auth / orders / quotes / catalog / provider / customer / notifications / support / finance / admin -api.js
→ apps/admin/modules/ops-core.js + ops-routes.js → services/ops-api.js
→ apps/admin/rbac-store.js → apps/admin/permission-guard.js → apps/admin/modules/workforce/employee-*.js
```

`npm run functions:sync` copies exactly these files (list: `functions/src/runtime.js` `ORDER`) into
`functions/domain/` and writes `functions/domain/manifest.json` (hashes). `npm run functions:check` (run by
`npm test`) fails when the copy is stale. **Never edit `functions/domain/` by hand.**

Backend mode (`services/firebase-config.js`): default **`firebase`** (production). `?backend=local` (remembered in
localStorage `hs_backend`) runs the offline demo over `MP` only — used by every automated test and runner.
`?emulators=1` targets the local Emulator Suite. In firebase mode `services/firebase-backend.js` (ES module):
sets the `HSApiClient` transport to the callable `api`, fills `MP` from `session.sync`, listens to RTDB
`signals/{uid}` and `public/content`, and runs sign-in dialogs (customer: quick/anonymous, email, SMS; provider: SMS;
admin: verified email + password + 8-digit code).

### 1.2 Request flow

```mermaid
flowchart LR
  UI[App screen] -->|HSOrdersApi.* / HSApiClient.request| AC[services/api-client.js]
  AC -->|firebase mode: transport| FB[services/firebase-backend.js]
  FB -->|httpsCallable api {app, method, path, query, body}| IDX[functions/index.js wrap]
  IDX -->|read/telemetry limits, usage, error report| SVC[functions/src/service.js api]
  SVC -->|server-native prefixes| NAT[telemetry / digest / agent / tech / alerts / ai / content / admin-extra / workforce]
  SVC -->|everything else| PLAN[plan.js: load only what the rules need]
  PLAN --> PDB[partial.js PartialDb]
  PDB --> RT[runtime.js: functions/domain in a vm, SERVER actor]
  RT -->|envelope + next db| COMMIT[PartialDb.commit in ONE transaction]
  COMMIT --> AUD[audit row]
  COMMIT --> SIG[RTDB signals/uid + FCM push]
  SIG -->|re-sync| FB
  FB -->|session.sync| MP[(MP read model)]
  MP --> UI
```

ASCII summary: `client → callable api / session → service.js → plan.js → PartialDb → runtime (domain) → commit →
audit + change signals (signals/{uid}, full flag on deletions) + push → clients re-sync (session.sync, Admin delta sync)`.

Key rules: identity comes **only** from the Firebase Auth token (`service.loadActor`); GETs run without a transaction;
a mutation runs in one Firestore transaction that reads only what `plan.js` loads and writes only changed documents
(`_u` stamp for the Admin delta sync); responses are redacted per actor (`redactForProvider`, `redactForCustomer`,
`scope.scrubForRole`).

### 1.3 Firebase functions (`functions/index.js`)

Global options: `region: 'me-central1'`, `maxInstances: 10`. Callables use `{ enforceAppCheck: ENFORCE_APP_CHECK === 'true', cors: true }`.

| Export | Trigger | Region | Schedule / limits | Timeout | Env / secrets | Code |
|---|---|---|---|---|---|---|
| `api` | callable (`onCall`) | me-central1 | read limiter 240/min per uid, 60/min per IP; writes 60/min (Firestore `rateLimits`) | default | `ENFORCE_APP_CHECK`, AI keys via `system/ai`, mail env (digest test) | `service.api` |
| `session` | callable (`onCall`) | me-central1 | sync read limiter; AI 40 / IP / day; chat 200 / IP / day | default | `ADMIN_BOOTSTRAP_EMAILS`, `CHAT_*`, `ANTHROPIC_API_KEY` | `service.session` |
| `offersClock` | Cloud Scheduler | me-central1 | `every 5 minutes` | 120 s | — | `service.tickOffers` (MP.tickBidding) |
| `healthClock` | Cloud Scheduler | me-central1 | `every 10 minutes` | 120 s | `K_REVISION` (set by the platform) | `tech-status.healthTick` |
| `digestClock` | Cloud Scheduler | me-central1 | `5 * * * *` (timeZone Africa/Cairo) | 300 s | `RESEND_API_KEY` or `SMTP_*`, `MAIL_FROM` | `digest-admin.tick` |
| `alertsClock` | Cloud Scheduler | me-central1 | `every 5 minutes` | 120 s | — | `alerts.tick` + `service.scanOps` (MP.opsScan) |
| `paymentsClock` | Cloud Scheduler | me-central1 | `every 30 minutes` | 120 s | `PAYMOB_*` | `payments.tick`: pending refunds → Paymob, held payments released after the hold time |
| `paymobWebhook` | HTTPS (`onRequest`, public POST, HMAC) | me-central1 | `maxInstances: 5` | 30 s | `PAYMOB_HMAC_SECRET` | `payments.webhook` → `MP.markPaid` / `MP.markRefunded` |
| `agentApi` | HTTPS (`onRequest`, `cors: false`) | me-central1 | `maxInstances: 5`; per key `AGENT_RATE_PER_MIN` (default 120); bad auth 20/min per IP | 30 s | `AGENT_API_KEYS`, `AGENT_RATE_PER_MIN` | `service.agentHttp` → `agent-gateway.http` |
| `catalogFeed` | HTTPS (`onRequest`, public GET) via the Hosting rewrite `/catalog-feed` | me-central1 | `maxInstances: 3`; CDN `s-maxage=300` (about one Firestore read per edge every 5 minutes) | 15 s | — | `catalog-admin.feed` (published `system/catalogPub`) |
| `callLogsClock` | Cloud Scheduler | me-central1 | `every 24 hours` | 120 s | — | `agent-gateway.retentionTick` + `support-chat.retentionTick` |

Unexpected errors inside `api` / `session` are logged, reported into «أخطاء عند المستخدمين» as app `server`
(`telemetry.report`) and returned as `internal` «حدث خطأ غير متوقع». `ServiceError` codes map to `HttpsError`.

### 1.4 `functions/src` modules

| File | Purpose | Called by |
|---|---|---|
| `service.js` | `api` dispatch, `session` ops, actor resolution, idempotency, rate limit, audit, change signals, push, `tickOffers`, `scanOps`, `domainOp` | `index.js` |
| `plan.js` | route → minimal reads (`plan`), sync windows (`syncPlan`), Admin delta (`deltaPlan`) | service, agent-gateway, support-chat |
| `partial.js` | `PartialDb` (bounded reads, `commit` of changed docs), Firestore adapter, shared 30 s cache, `system/public` summary | service, plan, agent-gateway, index |
| `runtime.js` | runs `functions/domain` in a `vm` per call (`request`, `operation`, `createContext`) | service, workforce, admin-extra, ai, agent-gateway |
| `store.js` | MP key ↔ Firestore collection names (`serviceRequests` → `requests`) | partial, service |
| `scope.js` | what each actor may receive (sync + responses); team scrubbing | service, agent-gateway |
| `identity.js` | `normalizePhone`, `APPS` | service, agent-gateway |
| `limits.js` | in-memory read / telemetry / agent limiters, client IP | index, agent-gateway |
| `provider-stats.js` | ranking stats kept on provider docs, exact deltas at commit | service |
| `workforce.js` | employees, `admins/{uid}`, `system/rbac`, invites, owner bootstrap | service, admin-extra |
| `admin-code.js` | the 8-digit admin access code (scrypt, lock after 5 wrong) | service, admin-extra |
| `admin-extra.js` | audit log, settings, departments, security, broadcasts | service |
| `alerts.js` / `alerts-adapter.js` / `owner-alerts.js` | team alerts + tickets, delivery (bell + FCM), owner escalation | service, index, tech-status, telemetry, admin-code |
| `telemetry.js` | client error reports (scrubbed, grouped, TTL) | service, index, tech-status |
| `tech-status.js` / `usage.js` | Tech Center: health, deploy, clocks, usage & cost | service, index |
| `alert-mail.js` | e-mail for critical health alerts (owner / tech digest recipients, else `ADMIN_BOOTSTRAP_EMAILS`; max one per key per hour in `system/alertMail`) | tech-status |
| `retention.js` | retention periods + `auditRow` (adds the audit `expiresAt`), `withoutTtl` | every audit writer, digest-admin, admin-extra |
| `content.js` | site hero / slides / icons + media docs | service |
| `ai.js` | AI routing «اكتب مشكلتك / صوّر المشكلة», provider config `system/ai` | service, support-chat |
| `support-chat.js` / `chat-llm.js` | AI chat «موظف خدمة العملاء» with 12 tools, provider-neutral LLM calls | service |
| `agent-gateway.js` | call-centre routes `/agent/*` for humans (api) and AI agents (agentApi) | service, index, support-chat |
| `payments.js` | Paymob: checkout (intention), HMAC webhook, refunds, auto release (owner model: cash after the job, or online held until the customer confirms + «ضمان هنصلحلك» voucher) | service, index |
| `catalog-admin.js` | service catalogue draft / publish (`/admin/catalog`, owner / admin) and the public CDN feed; the apps load it with `services/catalog-remote.js`, and the default questions come from `services/catalog-question-bank.js` | service, index |
| `digest.js` / `digest-admin.js` / `mailer.js` | e-mail digests (render, schedule, send via Resend / SMTP) | service, index |

### 1.5 Firestore collections

Clients have **no** Firestore access (`firestore.rules`: `allow read, write: if false` for every path); only the
Admin SDK in functions reads/writes. Names are Firestore names (`store.js`: MP `serviceRequests` → `requests`).

| Collection | Owner (writes) | Holds | Retention |
|---|---|---|---|
| `requests`, `assignments`, `quotes`, `transactions`, `reviews`, `complaints`, `notifications`, `addresses`, `favorites`, `serviceAreas`, `customers`, `providers`, `jobPhotos` | domain via `PartialDb.commit` (service `api`, `tickOffers`, `domainOp`, `registerCustomer`, `importLocal`); `admin-extra` writes broadcast `notifications` | marketplace records (`_k` order key, `_u` last change) | kept; account deletion anonymises (domain) |
| `system/meta`, `system/settings` | domain commit; `admin-extra` (`POST /admin/settings`) | counters; settings incl. `controls`, `support`, `markupRate`, `contentV`, `ai` flags | kept |
| `system/public` | service (sync rebuild) | summary: approved providers, areas, latest reviews | rebuilt after 10 min or any change |
| `system/rbac` | workforce | roles + per-employee overrides | kept |
| `system/ai` | ai.js (`PATCH /admin/ai`) | AI providers **with API keys**, features `{text, photo, chat}`, limits, `chatHandoff` | kept (server-only) |
| `system/content` | content.js | hero / slides / icons, version | kept |
| `system/digest`, `system/digestState` | digest-admin | digest config / run state | kept |
| `system/health`, `system/clocks`, `system/deploy`, `system/tech` | tech-status (`deploy:record` script writes `system/deploy.release`) | health, clock runs, deployed revision, budget | kept |
| `system/alertMail` | alert-mail | last e-mail time per critical alert key | one doc; keys older than 1 day dropped |
| `users/{uid}` | service | uid → actor tag link for signals | deleted with the account |
| `admins/{uid}` | workforce, admin-code | authorisation record, code hash, unlock window | kept |
| `employees` | workforce | Admin employees (+ invite log) | kept |
| `departments`, `broadcasts` | admin-extra | departments tree; broadcast history | kept |
| `audit` | service, admin-code, agent-gateway, support-chat, alerts, tech-status | one row per mutation (no live-tracking points) | **TTL `expiresAt`, 365 days** (`retention.auditRow`; rows written before 2026-11-26 have no `expiresAt` and stay; the one-off `audit/claimOwner_<uid>` row is kept) |
| `idempotency` | service | replayable envelopes | **TTL `expiresAt`, 24 h** |
| `rateLimits` | service | per-minute write counters | **TTL `expiresAt`, 2 min** |
| `clientErrors` | telemetry | grouped error reports | **TTL `expiresAt`, 30 days** |
| `usage` | usage.js | per instance / day counters | **TTL `expiresAt`, 45 days** |
| `pushTokens` | service (`registerPush`) | FCM tokens by uid | removed when dead / on sign-out / account deletion |
| `opsAlerts`, `opsTickets`, `alertSeen` | alerts.js (+ agent-gateway hand-offs as tickets `source: 'callcenter'`) | team alerts, tickets, bell state | resolved alerts listed 1 day, done tickets 30 days (kept in storage) |
| `media` | content.js | one compressed image per doc | deleted from Admin (refused while referenced) |
| `callLogs` | agent-gateway | call summaries + transcript | transcript cleared after 30 days (`callLogsClock`) |
| `supportChats`, `aiUsage` | support-chat, ai.js | chat state; AI quotas per day | chats deleted 30 days after last use (`callLogsClock`) |
| `digestPrefs`, `digests` | digest-admin | per-admin opt-out; rendered digests | `digests`: **TTL `expiresAt`, 90 days**; `digestPrefs` kept |
| `migrations` | service (`importLocal`) | import reports (`addedIds` rollback list) | kept |

**Realtime Database** (`database.rules.json`): `signals/{uid}` (read by that uid only, server writes `{at, full?}`),
`typing/{reqId}/{uid}` (chat typing indicator, the user writes its own `{r, at}`), `public/content` (read by
anyone, server writes `{v, at}`). Everything else is closed.

**Indexes** (`firestore.indexes.json`): 15 composite indexes + 6 TTL field overrides (`idempotency`, `rateLimits`,
`clientErrors`, `usage`, `audit`, `digests`; the last two with `indexes: []`). Retention periods live in
`functions/src/retention.js` (§4.9). `wiring.test.js` scans every query in `functions/src` and fails when a composite index is missing.

### 1.6 Hosting and the service worker

- Firebase Hosting serves the repo root (`firebase.json` `public: "."`) with an ignore list (docs, tests, functions,
  scripts, `*.md`, …). Redirects: `/` → Customer, `/provider` → Provider, `/admin` → Admin, `/privacy` → `legal/privacy.html`.
  Headers: `no-cache` for JS/CSS/HTML/JSON and `service-worker.js`; images 7 days; `X-Frame-Options: DENY`,
  `frame-ancestors 'none'`, `nosniff`, strict referrer.
- GitHub Pages also serves the frontend from `main` (see `docs/DEPLOY_CHECKLIST.md`).
- `service-worker.js`: navigations network-first; same-origin assets cache-first under `CACHE`
  (`hansalhlak-v11-firebase-<n>`); handles `push` (renders FCM data messages) and `notificationclick`.
  `npm run sw:check` (in `npm test` via `sw-cache-guard.test.js`) fails when a served file changed and `CACHE` did
  not; `npm run sw:bump` increments it and updates `service-worker.lock.json`.

---

## 2. Wiring tables

### 2.1 API routes (`services/*-api.js` → callable `api`)

Every route is defined once with `HSApiClient.define(method, path, {roles, summary}, handler)`. On the server the
same handler runs in `runtime.js` after `plan.js` loaded its data. **Server plan** = what `plan.js` loads (or who
answers instead). Roles are the domain gate; Admin routes additionally pass `permission-guard.apiDenied`
(team modules, `tech` / `callcenter` allow-lists). Tests = unit test files that name the path (heuristic; `—` means
only covered through adapter helpers such as `HSOrdersApi.*`, the domain tests or the browser runners).

| Method | Path | Roles | File | Server plan | Tests |
|---|---|---|---|---|---|
| GET | `/auth/me` | public | auth-api.js | static (catalogue) | api-adapters |
| POST | `/requests` | customer | orders-api.js | requests: candidates + open cap | admin-platform-controls, api-adapters |
| GET | `/requests` | customer, provider, admin | orders-api.js | requests: page | admin-platform-controls, api-adapters |
| GET | `/requests/:id` | customer, provider, admin | orders-api.js | requestBundle(:id) | callcenter-agent, firebase-backend |
| POST | `/requests/:id/cancel` | customer, admin | orders-api.js | requestBundle(:id) | callcenter-agent, firebase-mode-data |
| POST | `/requests/:id/provider` | customer | orders-api.js | requestBundle(:id) | — |
| POST | `/requests/:id/respond` | provider | orders-api.js | requestBundle(:id) | firebase-backend, ui-adapter-integration |
| POST | `/requests/:id/schedule` | provider, customer | orders-api.js | requestBundle(:id) | firebase-backend, ui-adapter-integration |
| POST | `/requests/:id/location` | provider | orders-api.js | requestBundle(:id) | live-tracking |
| POST | `/requests/:id/advance` | provider | orders-api.js | requestBundle(:id) | firebase-backend, ui-adapter-integration |
| POST | `/requests/:id/complete` | provider | orders-api.js | requestBundle(:id) | firebase-backend, ui-adapter-integration |
| POST | `/requests/:id/close` | customer | orders-api.js | requestBundle(:id) | firebase-backend |
| POST | `/requests/:id/attachments` | customer | orders-api.js | requestBundle(:id) | firebase-backend |
| POST | `/requests/:id/repeat` | customer | orders-api.js | requestBundle(:id) | firebase-backend |
| POST | `/requests/:id/review` | customer | orders-api.js | requestBundle(:id) | firebase-backend |
| POST | `/requests/:id/bid` | provider | orders-api.js | requestBundle(:id) | firebase-backend |
| POST | `/requests/:id/choose` | customer | orders-api.js | requestBundle(:id) | firebase-backend |
| POST | `/requests/:id/inspection-only` | provider | orders-api.js | requestBundle(:id) | — |
| POST | `/requests/:id/widen` | customer | orders-api.js | requestBundle(:id) | — |
| POST | `/requests/:id/cash` | customer, provider | orders-api.js | requestBundle(:id) | — |
| POST | `/requests/:id/pay` | customer | orders-api.js | requestBundle(:id) | payments.test.js |
| POST | `/requests/:id/pay/demo` | customer | orders-api.js | requestBundle(:id) | payments.test.js |
| POST | `/requests/:id/warranty` | customer | orders-api.js | requestBundle(:id) | firebase-backend |
| POST | `/requests/:id/tip` | customer | orders-api.js | requestBundle(:id) | — |
| POST | `/requests/:id/chat-seen` | customer, provider | orders-api.js | requestBundle(:id) | — |
| GET | `/requests/:id/photos` | customer, provider, admin | orders-api.js | requestBundle(:id) | firebase-backend |
| POST | `/requests/:id/photos` | provider | orders-api.js | requestBundle(:id) | firebase-backend |
| POST | `/requests/:id/photos/share` | customer | orders-api.js | requestBundle(:id) | — |
| POST | `/requests/:id/messages` | customer, provider | orders-api.js | requestBundle(:id) | firebase-backend |
| POST | `/requests/:id/rate-customer` | provider | orders-api.js | requestBundle(:id) | firebase-backend |
| POST | `/requests/:id/quotes` | provider | quotes-api.js | requestBundle(:id) | firebase-backend, ui-adapter-integration |
| POST | `/requests/:id/quote/approve` | customer | quotes-api.js | requestBundle(:id) | firebase-backend, ui-adapter-integration |
| POST | `/requests/:id/quote/reject` | customer | quotes-api.js | requestBundle(:id) | — |
| GET | `/free-reasons` | public | quotes-api.js | static (catalogue) | — |
| POST | `/requests/:id/free` | provider | quotes-api.js | requestBundle(:id) | — |
| POST | `/requests/:id/free/respond` | customer | quotes-api.js | requestBundle(:id) | — |
| POST | `/requests/:id/free/complete` | provider | quotes-api.js | requestBundle(:id) | — |
| GET | `/categories` | public | catalog-api.js | static (catalogue) | api-adapters |
| GET | `/services` | public | catalog-api.js | static (catalogue) | — |
| GET | `/providers` | public | catalog-api.js | providers: directory | — |
| GET | `/providers/:id` | public | catalog-api.js | providers/:id | admin-platform-controls, firebase-backend |
| GET | `/providers/:id/portfolio` | public | catalog-api.js | providers/:id | — |
| POST | `/providers/register` | public | provider-api.js | providers: phone | admin-platform-controls, firebase-backend |
| GET | `/providers/me` | provider | provider-api.js | actor doc | firebase-backend, security-audit-2026-11-23 |
| PATCH | `/providers/me` | provider | provider-api.js | actor doc | firebase-backend, security-audit-2026-11-23 |
| DELETE | `/providers/me` | provider | provider-api.js | actor doc | firebase-backend, security-audit-2026-11-23 |
| PATCH | `/providers/me/availability` | provider | provider-api.js | actor doc | ui-adapter-integration |
| GET | `/customers/me` | customer | customer-api.js | customers/me | firebase-backend, tech-center |
| PATCH | `/customers/me` | customer | customer-api.js | customers/me | firebase-backend, tech-center |
| DELETE | `/customers/me` | customer | customer-api.js | customers/me | firebase-backend, tech-center |
| GET | `/customers/me/addresses` | customer | customer-api.js | customers/me | firebase-backend |
| POST | `/customers/me/addresses` | customer | customer-api.js | customers/me | firebase-backend |
| PATCH | `/customers/me/addresses/:id` | customer | customer-api.js | customers/me | — |
| DELETE | `/customers/me/addresses/:id` | customer | customer-api.js | customers/me | — |
| GET | `/customers/me/favorites` | customer | customer-api.js | customers/me | — |
| POST | `/customers/me/favorites/toggle` | customer | customer-api.js | customers/me | firebase-backend |
| GET | `/customers/me/devices` | customer | customer-api.js | customers/me | — |
| POST | `/customers/me/devices` | customer | customer-api.js | customers/me | — |
| DELETE | `/customers/me/devices/:id` | customer | customer-api.js | customers/me | — |
| POST | `/customers/me/ref-code` | customer | customer-api.js | customers/me | firebase-backend |
| GET | `/notifications` | customer, provider, admin | notifications-api.js | notifications: inbox | callcenter-agent, firebase-backend |
| POST | `/notifications/read` | customer, provider, admin | notifications-api.js | notifications: inbox | — |
| POST | `/complaints` | customer, provider | support-api.js | complaints: requestBundle | admin-platform-controls, callcenter-agent |
| GET | `/complaints` | customer, provider, admin | support-api.js | complaints: page | admin-platform-controls, callcenter-agent |
| POST | `/complaints/:id/resolve` | admin | support-api.js | complaints/:id | firebase-mode-data |
| GET | `/providers/me/earnings` | provider | finance-api.js | providers/me: transactions page | — |
| GET | `/admin/transactions` | admin | finance-api.js | admin/transactions | callcenter-agent, teams-alerts |
| POST | `/admin/transactions/:id/collection` | admin | finance-api.js | admin/transactions | — |
| GET | `/admin/commission` | admin | finance-api.js | settings only | — |
| POST | `/admin/commission` | admin | finance-api.js | settings only | — |
| GET | `/pricing` | public | finance-api.js | settings only | firebase-backend, upfront-pricing |
| GET | `/admin/pricing` | admin | finance-api.js | settings only | firebase-backend, upfront-pricing |
| POST | `/admin/pricing` | admin | finance-api.js | settings only | firebase-backend, upfront-pricing |
| GET | `/admin/summary` | admin | admin-api.js | service.adminSummary (6 counts) | api-adapters, callcenter-agent |
| GET | `/admin/providers` | admin | admin-api.js | admin/providers | callcenter-agent, teams-alerts |
| POST | `/admin/providers/:id/warn` | admin | admin-api.js | admin/providers | — |
| POST | `/admin/providers/:id/status` | admin | admin-api.js | admin/providers | firebase-backend, firebase-mode-data |
| POST | `/admin/providers/:id/rate` | admin | admin-api.js | admin/providers | — |
| GET | `/admin/requests/:id/candidates` | admin | admin-api.js | admin/requests | — |
| POST | `/admin/requests/:id/assign` | admin | admin-api.js | admin/requests | firebase-backend, upfront-pricing |
| POST | `/admin/customers/:id/status` | admin | admin-api.js | admin/customers | firebase-mode-data, teams-alerts |
| POST | `/admin/reviews/:id/visibility` | admin | admin-api.js | admin/reviews | firebase-backend |
| GET | `/admin/controls` | admin | admin-api.js | settings only | admin-platform-controls |
| POST | `/admin/controls` | admin | admin-api.js | settings only | admin-platform-controls |
| GET | `/admin/support-contacts` | admin | admin-api.js | settings only | support-contacts-policy |
| PATCH | `/admin/support-contacts` | admin | admin-api.js | settings only | support-contacts-policy |
| GET | `/admin/data-policy` | admin | admin-api.js | settings only | support-contacts-policy |
| POST | `/admin/data-policy` | admin | admin-api.js | settings only | support-contacts-policy |
| GET | `/admin/marketing` | admin | admin-api.js | settings only | firebase-backend |
| PATCH | `/admin/marketing` | admin | admin-api.js | settings only | firebase-backend |
| GET | `/admin/payments` | admin (finance.view) | admin-api.js | plan admin `payments`: online requests (payment.status), pending refunds, payouts due | payments.test.js |
| PATCH | `/admin/payments/settings` | admin (finance.edit) | admin-api.js | plan admin `payments` | payments.test.js |
| POST | `/admin/payments/payouts` | admin (finance.edit) | admin-api.js | plan admin `payments` | payments.test.js |
| POST | `/admin/payments/:id/release` | admin (finance.edit) | admin-api.js | requestBundle(:id) | payments.test.js |
| POST | `/admin/payments/:id/refund` | admin (finance.edit) | admin-api.js | requestBundle(:id) | payments.test.js |
| GET | `/admin/alerts` | admin | ops-api.js | alerts.js (ops-routes) | callcenter-agent, teams-alerts |
| POST | `/admin/alerts/seen` | admin | ops-api.js | alerts.js (ops-routes) | teams-alerts |
| POST | `/admin/alerts/:id/claim` | admin | ops-api.js | alerts.js (ops-routes) | teams-alerts |
| POST | `/admin/alerts/:id/resolve` | admin | ops-api.js | alerts.js (ops-routes) | teams-alerts |
| POST | `/admin/alerts/:id/ticket` | admin | ops-api.js | alerts.js (ops-routes) | teams-alerts |
| GET | `/admin/tickets` | admin | ops-api.js | alerts.js (ops-routes) | teams-alerts |
| POST | `/admin/tickets` | admin | ops-api.js | alerts.js (ops-routes) | teams-alerts |
| PATCH | `/admin/tickets/:id` | admin | ops-api.js | alerts.js (ops-routes) | — |
| POST | `/admin/tickets/:id/notes` | admin | ops-api.js | alerts.js (ops-routes) | — |

**Server-native routes** (no domain counterpart; answered by `functions/src` before `plan.js`, in this order — see
the header of `service.js`):

| Prefix / routes | Module | Who |
|---|---|---|
| `POST /telemetry/errors`, `GET /admin/client-errors`, `POST /admin/client-errors/clear` | `telemetry.js` | anyone (reports); owner / admin role (list, clear) |
| `GET/POST /admin/digest/config`, `GET /admin/digest/preview`, `POST /admin/digest/test`, `GET/POST /admin/digest/me` | `digest-admin.js` | code-unlocked admin, not callcenter; config owner only |
| `POST /agent/lookup`, `GET /agent/catalog`, `POST /agent/requests`, `GET /agent/requests/:id`, `POST /agent/requests/:id/cancel`, `POST /agent/complaints`, `POST /agent/handoff`, `POST/GET /agent/calls`, `GET /agent/handoffs` | `agent-gateway.js` | admin with `callcenter.view/create/edit` (scope → permission `PERM_OF_SCOPE`); AI agents via `agentApi` + key scopes |
| `GET /admin/tech/status`, `POST /admin/tech/check`, `POST /admin/tech/errors/:id`, `POST /admin/tech/config` | `tech-status.js` | owner, `tech` role (config: owner) |
| `/admin/alerts*`, `/admin/tickets*` (domain table above) | `alerts.js` + shared `ops-routes.js` | code-unlocked admin; team rules in `ops-core.js` |
| `GET/PATCH /admin/ai`, `POST /admin/ai/test` | `ai.js` | owner / admin role |
| `GET/PATCH /admin/content`, `POST /admin/media`, `DELETE /admin/media/:id` | `content.js` | owner / admin role |
| `GET /admin/audit`, `GET/POST /admin/settings`, `GET/POST /admin/departments`, `PATCH /admin/departments/:id`, `GET /admin/security/admins`, `POST /admin/security/reset-code/:uid`, `POST /admin/security/revoke/:uid`, `GET /admin/notifications/broadcasts`, `POST /admin/notifications/broadcast` | `admin-extra.js` | see the file header (owner / admin role / RBAC module) |
| `GET/POST/PATCH /admin/employees…`, `GET /admin/rbac`, `POST /admin/rbac/roles`, `POST /admin/rbac/overrides/:employeeId` | `workforce.js` | RBAC `workforce.*`, `roles.*`, `permissions.edit`; grant limits |

The `callcenter` role is refused (403) on `/admin/ai`, `/admin/content|media`, admin-extra routes and
`/admin/summary|employees|rbac`; the `tech` role only reaches `/admin/security` inside admin-extra.

### 2.2 Session ops (callable `session`)

| Op | Who | What | Code |
|---|---|---|---|
| `sync` | anyone (signed in or not) | actor-scoped read model (`syncPlan`); Admin: delta since `since` (≤ 6 h, `deltaPlan`) or full + employees / RBAC; first sign-in of an invited employee accepts the invite; a locked admin gets only `adminGate` | `service.session` |
| `registerCustomer` | signed-in (phone OTP, email or anonymous) | one customer record per phone; verified phone wins over an unverified squatter; blocked in maintenance | `service.session` |
| `chat` | signed-in customer | AI chat («موظف خدمة العملاء»): `support-chat.chat`; owner switch `system/ai.features.chat` | `support-chat.js` |
| `ai` | signed-in (incl. anonymous) | AI routing: text or photo → catalogue item / problem | `ai.classify` |
| `content` | anyone | public site content when `settings.contentV` changes | `content.publicContent` |
| `registerPush` | signed-in | stores the device FCM token (`pushTokens/{sha256}`) | `service.session` |
| `unregisterPush` | signed-in | removes that token | `service.session` |
| `claimOwner` | verified email listed in `ADMIN_BOOTSTRAP_EMAILS` | creates the first owner employee | `workforce.createOwner` |
| `adminCode` | active admin | `{action: set | unlock | lock}` the 8-digit code (+ `totp` when 2FA is on); `totpStatus | totpSetup | totpEnable | totpDisable` the authenticator app (unlocked admin) | `admin-code.js` |
| `importLocal` | unlocked owner | additive import of a browser `hs_mp_db` (dry run first) | `service.importLocal` |

### 2.3 Admin pages

Nav model: `apps/admin/admin-shell.js` `NAV` + `HIDDEN_PAGES`; visibility: `permission-guard.canView` (owner-only
list `OWNER_ONLY`, `tech` = owner + tech role, `ROUTE_MODULE[id]` needs `<module>.view`, others open). In Firebase
mode the pages listed under *live* use real data: `modules/admin-live.js` maps actions to routes, and
`modules/admin-live-panels.js` replaces fixture pages with server panels (audit, settings, departments, security,
notifications, commissions, reports, super-dashboard, services).

**Sections (2026-11-27):** `SECTIONS` in `admin-shell.js` groups related pages under ONE menu entry and shows them as
tabs (`#adm-tabs`, links): «مهام اليوم» (dashboard, alerts, tickets), «الشكاوى والتقييمات» (complaints, reviews),
«الكتالوج والأسعار» (services, categories), «الفلوس» (commissions, settlements), «الفريق والصلاحيات» (workforce,
departments, roles, permissions, security, audit). Every page keeps its own route, permission and actions; a menu entry
shows when the admin may open any of its pages and links to the first one allowed. The Ctrl+K palette lists every
openable page (`HSAdminShell.openablePages()`). In live mode «الإعدادات» shows one section at a time, and both platform
rates (markup + fallback) are edited only in «نسب المنصة» (`#/commissions`).

| Page | Page file (+ modules) | Permission | Server routes / data |
|---|---|---|---|
| `#/dashboard` | `pages/admin-dashboard.page.js` (+ `ops-center.js` work box, `mini-charts.js`) | open to every employee | `GET /admin/summary`, `/admin/alerts`, `/admin/tickets`, sync read model |
| `#/alerts` | `pages/alerts.page.js` + `modules/ops-center.js` | `alerts.view` | `/admin/alerts*` |
| `#/tickets` | `pages/alerts.page.js` + `modules/ops-center.js` | `tickets.view` | `/admin/tickets*` |
| `#/callcenter` | `pages/callcenter.page.js` | `callcenter.view` (+ create / edit per action) | `/agent/*` |
| `#/marketplace` | `pages/marketplace.page.js` | `providers.view` (+ each tab's module) | `/admin/providers/:id/status|rate`, `/admin/requests/:id/assign`, `/admin/customers/:id/status`, `/admin/transactions/:id/collection`, `POST /admin/commission`, `/requests/:id/cancel`, `/complaints/:id/resolve` |
| `#/orders` | `pages/orders-management.page.js` (+ admin-live) | `orders.view` | sync; `POST /requests/:id/cancel` |
| `#/quotes` | `pages/quotes-management.page.js` (+ admin-live) | `orders.view` | sync (read-only) |
| `#/providers` | `pages/providers-management.page.js` (+ admin-live) | `providers.view` | `POST /admin/providers/:id/status|warn` |
| `#/customers` | `pages/customers-management.page.js` (+ admin-live) | `customers.view` | `POST /admin/customers/:id/status` |
| `#/complaints` | `pages/complaints-management.page.js` (+ admin-live) | `complaints.view` | `POST /complaints/:id/resolve` |
| `#/reviews` | `pages/reviews-management.page.js` (+ admin-live) | `reviews.view` | `POST /admin/reviews/:id/visibility` |
| `#/notifications` | `pages/notifications-management.page.js` (+ live panel) | `notifications.view` | `GET /admin/notifications/broadcasts`, `POST /admin/notifications/broadcast` |
| `#/categories` | `pages/categories-management.page.js` | `categories.view` | `GET/POST /admin/pricing` |
| `#/services` | `pages/services-management.page.js` (+ live panel) | `services.view` | `GET /admin/pricing` (panel), catalogue |
| `#/commissions` | `pages/commissions.page.js` (+ live panel «نسب المنصة») | `finance.view` | `GET/POST /admin/commission`, `GET/POST /admin/pricing` (markup) |
| `#/settlements` | `pages/settlements.page.js` (+ admin-live) | `finance.view` | `POST /admin/transactions/:id/collection` |
| `#/insights` | `pages/insights.page.js` (live: reports / owner tabs use the live panels) | `orders.view` | sync read model |
| `#/finance` (hidden, parent insights) | `pages/finance-dashboard.page.js` | `finance.view` | sync read model |
| `#/reports` (hidden) | `pages/reports.page.js` (+ live panel) | `finance.view` | sync read model |
| `#/super-dashboard` (hidden) | `pages/super-dashboard.page.js` (+ live panel) | owner only | `GET /admin/summary`, sync |
| `#/controls` | `pages/controls.page.js` | owner only | `GET/POST /admin/controls` |
| `#/tech` | `pages/tech-center.page.js` | owner + `tech` role | `/admin/tech/*` |
| `#/workforce` | `pages/workforce.page.js` | `workforce.view` | `/admin/employees*` |
| `#/employee-details` (hidden) | `pages/employee-details.page.js` | `workforce.view` | `/admin/employees/:id*`, `/admin/rbac/overrides/:id` |
| `#/departments` | `pages/departments.page.js` (+ live panel) | `departments.view` | `/admin/departments*` |
| `#/roles` | `pages/roles.page.js` | `roles.view` | `GET /admin/rbac`, `POST /admin/rbac/roles` |
| `#/permissions` | `pages/permissions.page.js` | `permissions.view` | `POST /admin/rbac/overrides/:employeeId` |
| `#/security` | `pages/security.page.js` (+ live panel) | owner only | `/admin/security/*` |
| `#/audit` | `pages/audit-log.page.js` (+ live panel, `client-errors.js`) | owner only | `GET /admin/audit`, `/admin/client-errors*` |
| `#/settings` | `pages/system-settings.page.js` (+ live panel, `site-content-editor.js`, `marketing-editor.js`, `support-settings.js`, `digest-settings.js`, `ai-settings.js`) | owner only | `/admin/settings`, `/admin/content`, `/admin/media`, `/admin/marketing`, `/admin/support-contacts`, `/admin/data-policy`, `/admin/digest/*`, `/admin/ai*` |

Header extras for every admin: «الملخصات» (`/admin/digest/me`), code change (`session.adminCode`), Ctrl+K palette
(`modules/command-palette.js`).

### 2.4 RBAC roles and presets (`apps/admin/rbac-store.js`)

Permission keys are `<module>.<action>`; actions `view`, `create`, `edit`, `decide`. Modules: `orders`, `customers`,
`providers`, `services`, `categories`, `complaints`, `reviews`, `notifications`, `workforce`, `departments`,
`roles`, `permissions`, `finance`, `marketing`, `pii`, `tech`, `alerts`, `tickets`, `callcenter`. Stored catalogues
(`system/rbac`) gain new presets / modules through `mergePresets` (`CATALOG_V` = 3). Nobody can grant a permission they
do not hold (`grantViolations`); the last active owner cannot be demoted. Risky actions also need a rank
(`RISK` → `LEVELS` 1 دعم · 2 مشرف · 3 مدير · 4 المالك).

| Role | Name | Rank | Permissions (summary) |
|---|---|---|---|
| `owner` | المالك | 4 | everything (system role, always the full catalogue) |
| `admin` | مدير | 3 | ops modules ×4, workforce view/create/edit, departments view/edit, roles/permissions/pii view, finance / marketing / alerts / tickets ×4, callcenter view/create/edit |
| `support` | دعم فني | 1 | view orders, customers, providers, complaints, reviews, pii; complaints edit / decide; alerts + tickets work set |
| `finance` | المالية | 2 | view orders, customers, providers, services; finance ×4; work set (phones / addresses masked) |
| `moderator` | مراقب محتوى | 2 | inherits support + reviews edit / decide, categories / services / notifications view |
| `ops` | عمليات ودعم | 2 | orders, customers, providers, complaints, reviews ×4; services / categories / notifications / pii view; work set |
| `content` | المحتوى والأسعار | 3 | services, categories, marketing, notifications ×4; reviews view; work set (no personal data — server `scope.js`) |
| `tech` | التقنية | 1 | tech ×4 + work set; server: no marketplace data, API allow-list `TECH_API` |
| `callcenter` | خدمة العملاء (كول سنتر) | 1 | callcenter view/create/edit + work set; server: no sync data, API allow-list `CALLCENTER_API`, `/agent/*` only |

"Work set" = `alerts.view`, `alerts.decide`, `tickets.view`, `tickets.create`, `tickets.edit`.
Server enforcement: `permission-guard.apiDenied` (runs in the domain on the server), `scope.js` (`scopeFor`,
`scrubForRole`), `plan.syncPlan` (what is read per team) and the explicit gates in `service.api`.

### 2.5 Scheduled clocks

| Clock | Schedule | Does | State it records |
|---|---|---|---|
| `offersClock` | `every 5 minutes` | offers rounds: remind the customer, widen the search, close empty rounds (`MP.tickBidding`) | `system/clocks.offers` |
| `healthClock` | `every 10 minutes` | health probes, deployed revision, thresholds → tech alerts; critical ones (+ offers clock not running) also by e-mail | `system/health`, `system/deploy`, `system/alertMail` |
| `digestClock` | `5 * * * *` Africa/Cairo | daily / weekly digests once per Cairo day at the configured hour | `system/digestState`, `digests` |
| `alertsClock` | `every 5 minutes` | time-based alerts (`MP.opsScan`: requests without a provider > 30 min, pending providers > 1 day hourly, uncollected commission > 7 days hourly) + escalation of unclaimed critical alerts | `opsAlerts` |
| `paymentsClock` | `every 30 minutes` | pending refunds sent to Paymob; held online payments of completed jobs released after `payments.autoReleaseHours` (default 48) unless a complaint is open | `serviceRequests` (payment), `transactions` (payout) |
| `callLogsClock` | `every 24 hours` | clear call transcripts after 30 days; delete AI chats 30 days after last use | `callLogs`, `supportChats` |

### 2.6 Environment variables and secrets (names only — never commit values)

Set in `functions/.env` (git-ignored by the root `.gitignore` `functions/.env*`; template `functions/.env.example`)
or as Firebase secrets bound to the function; they take effect on the next functions deploy.

| Name | Used by | Meaning |
|---|---|---|
| `ADMIN_BOOTSTRAP_EMAILS` | `index.js` → `session.claimOwner`, `alert-mail.js` | comma-separated verified e-mails allowed to become the first owner; also the fallback recipients of critical alert e-mails |
| `ENFORCE_APP_CHECK` | `index.js`, `tech-status.js` | `true` enforces App Check on `api` / `session` (needs the site key in `firebase-config.js`) |
| `AGENT_API_KEYS` | `agent-gateway.js` | `id:secret:scopes` list for AI voice agents (secret ≥ 24 chars; scopes `lookup catalog requests.create requests.read requests.cancel complaints handoff calls calls.read` or `*`) |
| `PAYMOB_SECRET_KEY` | `payments.js`, `runtime.js`, `scope.js` | Paymob secret key (Authorization: Token …); without it and the public key online payment is off and customers pay cash |
| `PAYMOB_PUBLIC_KEY` | `payments.js`, `runtime.js`, `scope.js` | Paymob public key (hosted checkout URL) |
| `PAYMOB_HMAC_SECRET` | `payments.js` | verifies the «transaction processed» callback |
| `PAYMOB_INTEGRATION_IDS` | `payments.js` | comma list of Paymob integration ids (card, mobile wallet …) |
| `PAYMOB_RETURN_URL` | `payments.js` | optional: where the customer returns after paying (default the customer app) |
| `AGENT_RATE_PER_MIN` | `agent-gateway.js` | requests per minute per key / employee (default 120, minimum 10) |
| `CHAT_KIND`, `CHAT_API_KEY`, `CHAT_BASE_URL`, `CHAT_MODEL` | `support-chat.js`, `ai.js` | optional server fallback provider for the AI chat |
| `ANTHROPIC_API_KEY` | `support-chat.js`, `ai.js` | optional Claude fallback key for the chat |
| `RESEND_API_KEY`, `MAIL_FROM` | `mailer.js` | Resend transport for digests and critical alert e-mails (none set → alerts stay in the bell, one log line) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | `mailer.js` | SMTP transport (with `MAIL_FROM`) |
| `K_REVISION` | `tech-status.js` | set by Cloud Run: the deployed revision (read only) |

Settings that live in Firestore and are edited from the Admin Center (not env): AI providers and their **API keys**
(`system/ai`, Admin › الإعدادات › التوجيه الذكي — keys are never returned, only the last 4 characters), digest
schedule (`system/digest`), emergency switches / support contacts / data policy / markup / commission
(`system/settings`), Tech Center budget (`system/tech`), RBAC (`system/rbac`), site content (`system/content`).
Public client config (not secret): `services/firebase-config.js` (web config, VAPID key, empty App Check key).

---

## 3. Feature dossiers

Each dossier: **where** · **flow** · **typical change** · **tests**. Domain rules live in `services/` (edit there,
then `npm run functions:sync`); server-only behaviour in `functions/src`.

### 3.1 Orders lifecycle
- **Where:** `services/local-market-store.js` (`MP.FLOW`, status labels, transitions, money), `services/orders-api.js`
  (routes + `canAccess`), `services/quotes-api.js` (quotes, free service); Customer `pages/request-wizard.page.js`,
  `request-create.page.js`, `orders.page.js`, `order-details.page.js`; Provider `pages/incoming-requests.page.js`,
  `request-details.page.js`, `active-jobs.page.js`, `provider-request-domain.js`; Admin `#/orders`, `#/marketplace`.
- **Flow:** `POST /requests` (received → searching; auto-assign or offers round) → provider `respond` → `schedule` →
  `advance` (enroute, arrived, started) → quote (`/quotes`, customer `quote/approve`) → `complete` (value > 0, or the
  approved quote) → customer `close` + `review`; cash confirmation `/cash`; warranty `/warranty`. Zero-value quotes are
  refused; free service is its own flow (`/free*`, value 0, no commission). Full diagram: `docs/API_CONTRACTS.md`.
- **Typical change:** a new step or rule → `local-market-store.js` + the route in `orders-api.js`; if the handler
  needs more records (e.g. another request), load them in `plan.js` (requests branch) — otherwise the rule silently
  weakens on the server. Then `functions:sync`, tests, functions deploy.
- **Tests:** `order-lifecycle`, `customer-workflow`, `marketplace-rules`, `provider-request-domain`,
  `provider-app-actions`, `ui-adapter-integration`, `firebase-backend`; runners `customer-orders.cdp.js`,
  `provider-standalone.cdp.js`.

### 3.2 Offers / bidding
- **Where:** `MP.tickBidding` + bid / choose / widen / inspection-only routes (`orders-api.js`), settings `bidding`,
  `autoPickMin`; server clock `offersClock` → `service.tickOffers`; Customer `pages/offers.js`, `offer-alerts.js`;
  Provider `pages/quotes.page.js`.
- **Flow:** request with `settings.bidding` → up to 3 candidates invited (`plan.candidates`) → providers `bid` →
  customer `choose` → normal lifecycle. The clock reminds, widens or closes rounds; «جولة العروض خلصت من غير عروض» raises
  an ops alert.
- **Typical change:** round timing / counts in `local-market-store.js` (domain) — no clock change needed.
- **Tests:** `offers-clock`, `offers-undo-timer`, `marketplace-mechanisms`, `cost-reductions` (tickOffers reads);
  runners `offers-cycle.cdp.js`, `offer-alerts.cdp.js`.

### 3.3 Pricing / commission
- **Where:** `services/finance-api.js` (`/pricing`, `/admin/pricing`, `/admin/commission`, collections), MP money
  helpers, `shared/utils/money.js`; settings `markupRate` (default 15 %), `defaultRate`, category rates, provider
  `specialRate`, bonus tiers; server redaction `scope.customerRequestView` / `customerQuote` (the customer never sees the
  provider amount or platform fee); Admin `#/categories`, `#/commissions`, `#/settlements`, `#/marketplace`.
- **Flow:** admin sets base prices (`POST /admin/pricing`) → customer price = base + markup, fixed at booking →
  completion creates the transaction (commission, collection `pending`) → finance marks it collected.
- **Labour-only share (2026-11-26):** offers / quotes carry `labor` + `parts`; `MP.quoteParts(labor, parts, rate)` puts
  the markup on the labour only, parts pass through at cost (bid, chooseBid, createQuote, approveQuote, complete).
- **Typical change:** a new fee → domain money code + `finance-api.js`; if it must stay hidden from customers, extend
  `scope.js` redaction; add a test in `upfront-pricing` / `commissions`.
- **Tests:** `upfront-pricing`, `commissions`, `settlements`, `settlements-edge-cases`, `provider-bonus`, `finance-dashboard`.

### 3.14 Payments (cash, or online held until the customer confirms)
- **Where:** domain `services/local-market-store.js` «round 12: payments» (`payConfig`, `choosePay`, `markPaid`,
  `payOnComplete`, `releasePay`, `refundOnCancel`, `markRefunded`, `autoRelease`, `payoutsDue`, `markPayoutPaid`);
  routes `POST /requests/:id/pay`, `/pay/demo` (local only), `/admin/payments*` (`services/admin-api.js`); server
  `functions/src/payments.js` (Paymob intention checkout, HMAC webhook, refunds, tick), exports `paymobWebhook`,
  `paymentsClock`; `runtime.js` sets `HS_PAY_GATEWAY` (`paymob` only with keys, never `demo` on the server);
  `scope.js` publishes `settings.payments.gatewayReady` to the apps.
- **Flow:** price agreed → customer picks `cash` or `online` → online: Paymob checkout → webhook `markPaid` (status
  `held`, idempotent per transaction) → provider may complete (blocked while unpaid) → transaction `collection: held`,
  payout `hold` → customer confirms (`close`) or 48 h pass without a complaint (`paymentsClock` → `autoRelease`) →
  payout `due` → admin records the weekly transfer (`POST /admin/payments/payouts`). Cancel / fail after paying →
  `refundOnCancel` (travel fee kept for the provider) → `paymentsClock` sends the refund to Paymob.
- **Warranty voucher:** `afterCompletion` sets `warrantyUntil` + `warrantyVoucher` only when `paidOnline(r)` (owner rule:
  the «ضمان هنصلحلك» voucher comes with online payment; days = admin warranty settings, default 20).
- **Not finished (2026-11-27):** the customer payment-choice card, provider payment status / payouts / `payoutWallet`
  field, and the Admin «المدفوعات» page — work in progress in worktrees `agent-a9037922572203278` and
  `agent-a42110a30883e0f98` (briefs `docs/agent-briefs/payments-ui-*.md`). Until they land, customers cannot pick
  online and every job is cash (no voucher).
- **Tests:** `payments.test.js` (domain + the full server path with Paymob faked), `upfront-pricing`, `round5-features`.

### 3.15 Service catalogue (admin-managed, CDN feed)
- **Where:** `services/catalog-question-bank.js` (default bank), `services/local-catalog.js` (CAT, v3 shape with `bank`,
  `qs` refs, `govs`), `services/catalog-remote.js` (apps fetch `/catalog-feed`), `functions/src/catalog-admin.js`
  (`/admin/catalog` draft / publish / unpublish, `feed`), `apps/admin/modules/catalog-editor.js`; `runtime.js` loads the
  published catalogue into every server context (5-minute cache) so the AI, call centre and governorate check match.
- **Typical change:** a new default question → the bank file + its test; anything per-service → the admin editor.
- **Tests:** `catalog-publish`, `catalog-question-bank`, `catalog-wizard`, `launch-hardening`.

### 3.4 Provider onboarding
- **Where:** `POST /providers/register` (`provider-api.js`), Provider `#/join` (`apps/provider/app.js`,
  `provider-auth.js`), Admin `#/providers`, `#/marketplace` (`POST /admin/providers/:id/status`); server binds the
  registration to the SMS-verified phone (`service.api`), `pauseSignups` switch.
- **Flow:** SMS sign-in → register (status `pending`, no provider role) → admin approves / rejects → the provider's
  token resolves to an actor only when `approved` (`service.loadActor`).
- **Typical change:** new registration field → `provider-api.js` allow-list + provider form; never trust a phone in
  the body (the server overwrites it).
- **Tests:** `provider-app-register`, `providers-management`, `admin-platform-controls`, `security-fixes`,
  `security-audit-2026-11-23`.

### 3.5 Workforce / invites (Admin staff)
- **Where:** `functions/src/workforce.js`, `admin-code.js`, domain `apps/admin/modules/workforce/employee-*.js`,
  `rbac-store.js`; Admin `#/workforce`, `#/employee-details`, `#/roles`, `#/permissions`, `#/security`;
  `services/firebase-backend.js` sends the «set your password» e-mail after an invite.
- **Flow:** owner invites (`POST /admin/employees`) → server ensures a Firebase Auth user (`ensureInviteUser`) → the
  app sends the password-reset e-mail → the employee signs in with a verified e-mail → `session.sync` accepts the invite
  (`acceptInvite`) → sets the 8-digit code (`session.adminCode set`) → every session unlocks with it (12 h).
- **Typical change:** a new team → a preset in `rbac-store.js buildRoles` (+ `ROLE_LEVEL`), new module → `MODULES`
  + a `V*_MODULES` bump in `mergePresets`, map its page in `permission-guard.ROUTE_MODULE`.
- **Tests:** `workforce`, `invite-expiry`, `rbac-store`, `rbac-pages`, `departments`, `admin-platform-controls`, `security-round2`.

### 3.6 Alerts / tickets
- **Where:** rules `apps/admin/modules/ops-core.js` + `ops-routes.js` (shared domain); server `functions/src/alerts.js`
  (storage, delivery, `tick`), `alerts-adapter.js`, `owner-alerts.js`; demo `services/ops-api.js`; UI
  `modules/ops-center.js`, `pages/alerts.page.js`.
- **Flow:** domain `MP.raiseAlert` (new complaint, cash dispute, …) → runtime `HS_ALERT_OUTBOX` → `alerts.ingest`
  after commit → bell + FCM push to the team; `alertsClock` raises time-based alerts and escalates unclaimed critical
  ones to the owner; staff claim / resolve / turn into tickets.
- **Typical change:** a new alert kind → raise it in the domain with a `dedupeKey` (no personal data in titles).
- **Tests:** `teams-alerts`, `cost-reductions` (scanOps), `tech-center` (tech alerts).

### 3.7 Call centre gateway
- **Where:** `functions/src/agent-gateway.js` (routes, scopes, rate limit, audit, retention), https `agentApi`,
  role `callcenter`, Admin `#/callcenter` (`pages/callcenter.page.js`), design + tool schemas `docs/AI_CALLCENTER.md`.
- **Flow:** human: Admin → `api` `/agent/*` (code-unlocked, `callcenter.*`); AI agent: `agentApi` with
  `Authorization: Bearer <secret>` from `AGENT_API_KEYS`. Both run the customer's own routes AS that caller through
  `service.domainOp` (same commit, alerts and signals). Hand-offs become `opsTickets` (`source: 'callcenter'`).
- **Typical change:** a new agent action → a route in `agent-gateway.js` `handle`, a scope in `SCOPES` +
  `PERM_OF_SCOPE`, `.env.example` scope list, `docs/AI_CALLCENTER.md`.
- **Tests:** `callcenter-agent`.

### 3.8 AI chat «موظف خدمة العملاء»
- **Where:** Customer `pages/support-chat.js` → `session` op `chat` → `functions/src/support-chat.js` (tools,
  confirm cards, limits, masking) + `chat-llm.js` (DeepSeek / OpenAI-compatible / Gemini / Claude, fail-over).
- **Flow:** the model proposes actions with `prepare_*` tools; writes happen only after the customer presses the
  confirm button, through `agent-gateway.handle` / customer routes as that customer. Never: phone / e-mail / password,
  delete account, money, prices. Human hand-off off until `system/ai.chatHandoff`.
- **Switches:** `system/ai.features.chat` (Admin › التوجيه الذكي) and a provider with the «شات» role (or the env
  fallback `CHAT_*` / `ANTHROPIC_API_KEY`); maintenance switch blocks it.
- **Tests:** `support-chat`.

### 3.9 AI routing («اكتب مشكلتك» / «صوّر المشكلة»)
- **Where:** `functions/src/ai.js` (`classify`, config `system/ai`, routes `/admin/ai*`), Customer `pages/ai-assist.js`
  (the wizard entry), Admin `modules/ai-settings.js`.
- **Flow:** `session` op `ai` → enabled providers with the role (`text` / `vision`) in priority order (8 s timeout,
  skip on failure) → answer validated against the real catalogue → wizard pre-filled. Quotas: per account per day
  (`dailyLimit`), platform per day, 40 per IP per day. Only the problem text / photo is sent.
- **Tests:** `support-chat` (provider config parts), `security-round2` (IP cap). See §7 (no dedicated classify test).

### 3.10 Content / site hero
- **Where:** `functions/src/content.js`, Admin `modules/site-content-editor.js` (in `#/settings`), Customer
  `shared/content/site-content.js`, `pages/home.page.js`, `discover.page.js`.
- **Flow:** admin uploads compressed images (`POST /admin/media`) and saves `PATCH /admin/content` → new version →
  RTDB `public/content {v}` → open pages fetch `session.content` with the media ids they already cache.
- **Tests:** `site-content`, `firebase-backend`, `admin-live-editors`.

### 3.11 Notifications / push
- **Where:** in-app inbox = `notifications` collection (domain), `GET /notifications`; web push:
  `services/firebase-backend.js` (`enablePush`, `registerPush`), `service.pushFresh` (new unread notifications < 2 min
  old → FCM data messages), `service-worker.js` `push` / `notificationclick`; broadcasts `POST /admin/notifications/broadcast`.
- **Typical change:** deep link of a push → `service.pushLink`.
- **Tests:** `notifications-management`, `firebase-backend`, `teams-alerts`.

### 3.12 Telemetry / client errors
- **Where:** `shared/utils/error-reporter.js` (first script of every app) → `POST /telemetry/errors` →
  `functions/src/telemetry.js` (scrub, group, TTL 30 days); Admin `modules/client-errors.js` (under `#/audit`) and the
  Tech Center (`#/tech`).
- **Tests:** `client-error-telemetry`, `tech-center`; runner `client-errors.cdp.js`.

### 3.13 Digests
- **Where:** `functions/src/digest.js` (collect + render, no personal data), `digest-admin.js` (schedule, routes),
  `mailer.js` (Resend / SMTP); Admin `modules/digest-settings.js`.
- **Flow:** `digestClock` hourly → at the configured Cairo hour, render per team → send to active admins (opt-out in
  `digestPrefs`) → state in `system/digestState`. Without a mail transport digests are rendered and stored only.
- **Tests:** `digest`, `digest-admin`, `mailer`.

---

## 4. Runbooks

All commands run from the repository root in PowerShell 5.1 (no `&&`; use `;` or `if ($?) { … }`).

### 4.1 Local setup, tests, runners, emulators
1. Node 24 (`functions/package.json` engines) and Python 3 (for the static server). `cd functions; npm ci; cd ..` (only for emulators / deploy).
2. Unit tests: `npm test` (must be 100 % green). One file: `node --test tests/unit/<name>.test.js`.
3. Browser runners (Chrome/Edge via CDP, local mode only — they refuse production hosts):
   ```
   python -m http.server 8099 --bind 127.0.0.1      # in a second terminal
   node tests/e2e/admin-app.cdp.js http://127.0.0.1:8099
   ```
   Core set: `admin-app`, `admin-controls`, `customer-orders`, `interaction`, `client-errors`, `provider-standalone`,
   `offers-cycle` (+ `guest`, `a11y`, `responsive-sweep`, `offer-alerts`, `perf`).
4. Emulators (JDK 21):
   ```
   $env:JAVA_HOME="C:\Program Files\Microsoft\jdk-21.0.13.102-hotspot"; $env:Path="$env:JAVA_HOME\bin;$env:Path"
   npm run test:emulators
   npm run test:emulators:e2e
   ```
5. After editing `services/` or the shared admin domain files: `npm run functions:sync` (tests run `functions:check`).

### 4.2 Deploy
Standing approval exists for push + deploy after each change (owner memory), but never deploy from an unreviewed branch.
Once the staging project exists (§4.11), deploy there first: `npm run deploy:staging`, check it, then
`npm run deploy:prod` (asks you to type the project id; it refuses without an interactive terminal). The per-target
commands below stay valid for a partial deploy.
1. `npm run functions:check`; `npm test`; `cd functions; npm audit --omit=dev; cd ..`; note `git rev-parse --short HEAD`.
2. Hosting (frontend): `npm run sw:bump` if a served file changed, commit, then `firebase deploy --only hosting --project hansalahlak`
   (GitHub Pages updates on push to `main`).
3. Functions: `firebase deploy --only functions --project hansalahlak` (one function: `--only functions:api`).
4. Rules / indexes: `firebase deploy --only firestore:rules,firestore:indexes,database --project hansalahlak`.
   New composite indexes build for minutes; queries needing them fail until `READY` (§5).
5. `npm run deploy:record` (writes `system/deploy.release` for the Tech Center).
6. Verify: open each app, sign in, create a request; `firebase functions:log --project hansalahlak` shows no
   `internal` errors for 15 minutes. Full checklist: `docs/DEPLOY_CHECKLIST.md`.

### 4.3 Rollback
- **Hosting:** Console › Hosting › Release history › *Rollback*, or
  `firebase hosting:clone hansalahlak:live@<versionId> hansalahlak:live`.
- **Functions:** redeploy the previous commit:
  ```
  git switch --detach <previous-deployed-commit>
  firebase deploy --only functions --project hansalahlak
  git switch main
  ```
- **Rules / indexes:** same pattern with `--only firestore:rules,firestore:indexes,database`.

### 4.4 Service-worker bump
Any change under `apps/`, `shared/`, `services/`, `assets/`, `index.html` or `manifest.json` →
`npm run sw:bump` → commit `service-worker.js` + `service-worker.lock.json`. Four tests pin the cache literal
(`sw-cache-guard`, `service-worker-precache`, …). Users get the new files on the next navigation after the new worker activates.

### 4.5 Rotate a key
- **AI providers (DeepSeek / Gemini / OpenAI-compatible / Claude):** Admin › الإعدادات › التوجيه الذكي → paste the new
  key in the provider row → save → the test button (`POST /admin/ai/test`). An empty key field keeps the old key. Revoke the
  old key at the vendor afterwards. Env fallback (`CHAT_API_KEY`, `ANTHROPIC_API_KEY`): edit `functions/.env`, redeploy functions.
- **`AGENT_API_KEYS`:** generate `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`; add a
  second entry with a new id (`voicebot2:<secret>:scopes`), deploy functions, switch the vendor, remove the old entry,
  deploy again (zero downtime).
- **Resend / SMTP:** update `RESEND_API_KEY` (or `SMTP_PASS`) in `functions/.env` or the bound secret → deploy
  functions → Admin › الإعدادات › الملخصات › «ابعت تجربة لإيميلي».

### 4.6 Admin staff
- **Add an employee:** owner → `#/workforce` → invite (name, e-mail, department, role) → the person gets the «set your
  password» e-mail → signs in at `/admin` → creates the 8-digit code. Expired invite: resend (`POST /admin/employees/:id/resend`).
- **Reset a password:** the admin sign-in dialog has a reset-password action (Firebase `sendPasswordResetEmail`); the owner
  can also resend the invite. **Reset the 8-digit code:** owner → `#/security` → the reset-code action
  (`POST /admin/security/reset-code/:uid`, never self). **Sign someone out everywhere:** `POST /admin/security/revoke/:uid`.
- **Disable:** `#/employee-details` → status disabled (`POST /admin/employees/:id/status`); takes effect on the next request.
- **Two-step verification (authenticator app, `functions/src/admin-code.js`):**
  - *Enable:* signed in and unlocked → header button «التحقق بخطوتين» → add the key in Google Authenticator /
    Microsoft Authenticator (copy the `otpauth://` link or type the secret, time-based) → type the 6-digit code → «تشغيل».
    From then on every unlock **and** every change of the 8-digit code asks for «كود التطبيق (٦ أرقام)». Wrong or
    re-used app codes count toward the same 5-tries / 15-minute lock. The secret is shown only during setup (15 minutes).
  - *Disable (phone still available):* «التحقق بخطوتين» → current app code → «اقفل التحقق بخطوتين».
  - *Lost phone — employee:* owner → `#/security` → «إلغاء التحقق بخطوتين» (`POST /admin/security/reset-totp/:uid`,
    never self); the employee unlocks with the 8-digit code and enrolls again.
  - *Lost phone — owner:* Firebase console → Firestore → `admins/{ownerUid}` → set `totpOn` to `false` and delete
    `totpSecret` and `totpLastStep` (the uid is in Authentication → Users). Then sign in with the 8-digit code and enroll a new phone
    right away. Write down who did it and when (console edits are not in the admins' log).

### 4.6b Edit and publish the service catalogue (services, questions, governorates)

1. Open Admin › الخدمات (Firebase mode). The «كتالوج الخدمات» editor starts from the catalogue the app runs on now.
2. Add, rename, pause or delete categories, services and problems.
3. Pick each service's and each problem's questions from «بنك الأسئلة» and mark them «إجباري» or not. Edit the bank itself if needed.
4. Choose the served governorates under «المحافظات».
5. Click «حفظ المسودة», then «انشر للعملاء» (`POST /admin/catalog/publish`, rev + 1). Customers get it within about 5 minutes: the CDN caches `/catalog-feed` with `s-maxage=300`, and the apps keep a device copy in `hs_catalog_pub`.
6. To roll back, publish an older draft again, or call `POST /admin/catalog/unpublish`; the apps then fall back to the built-in catalogue (`services/local-catalog.js` together with `services/catalog-question-bank.js`).
7. Old requests are not affected, because ids are stable. Never reuse a deleted service's id for something else.

### 4.7 Maintenance mode and the AI chat
- **Maintenance on/off:** owner → `#/controls` «الطوارئ والصيانة» → «وضع الصيانة» with an optional message
  (`POST /admin/controls {key: 'maintenance', on, message}`). Customer / provider writes get 503; admins keep working;
  sign-ups and chat stop; the owner gets an alert. Also `pauseOrders` and `pauseSignups`.
- **AI chat on/off:** Admin › الإعدادات › التوجيه الذكي → feature «الشات» (`system/ai.features.chat`) and at least one
  enabled provider with the «شات» role. Human hand-off: `chatHandoff` (off until a team exists).

### 4.8 Logs, failed functions, quota spikes
1. `firebase functions:log --project hansalahlak` (or `--only api`); Console › Functions › Logs for structured fields.
2. Admin `#/tech` (Tech Center): health, clocks, error groups, usage and cost vs budget, latency per route group.
   `#/audit` › «أخطاء عند المستخدمين» for client and `server` errors.
3. A failed clock shows in `system/clocks` / Tech Center; it reruns on its schedule (all clocks are idempotent).
4. Quota spike: check the Tech Center usage (reads / writes per day), the audit log for a looping client, and
   `rateLimits`. Short-term levers: maintenance mode, `pauseOrders`, lower AI limits in `system/ai`, rotate a leaked
   agent key. `npm run bench:cost` estimates reads per operation.

### 4.9 Data retention tasks
Retention table (source: `functions/src/retention.js` and the writers; TTL needs a Firestore Timestamp — the code
writes a JS `Date`, never a string):

| Data | Kept | How |
|---|---|---|
| `audit` | 365 days | TTL on `expiresAt` (`retention.auditRow`, all writers) |
| `digests` | 90 days | TTL on `expiresAt` (`digest-admin.js`) |
| `clientErrors` (telemetry / client and server errors) | 30 days | TTL on `expiresAt` (`telemetry.js`) |
| `usage` (Tech Center counters) | 45 days | TTL on `expiresAt` (`usage.js`; the month view needs the whole calendar month, so not 30) |
| `idempotency` | 24 hours | TTL on `expiresAt` (the replay window; shorter than the 2-day ceiling) |
| `rateLimits` | 2 minutes | TTL on `expiresAt` (one counter per key and minute; shorter than the 2-day ceiling) |
| `callLogs` transcripts, `supportChats` | 30 days | `callLogsClock` (chat `expiresAt` is an ISO string queried by the clock, not a TTL field) |
| `opsAlerts`, `opsTickets`, `aiUsage`, `alertSeen`, `migrations`, `digestPrefs` | kept | one doc per alert key / ticket / user; small. Owner decision before adding a TTL |

- Automatic: the six TTL policies — after a `firestore:indexes` deploy, verify once in Console › Firestore › TTL that
  each policy is **Serving** (TTL deletes usually within 24 h after `expiresAt`); `callLogsClock` (transcripts, chats).
- Rows written before 2026-11-26 in `audit` have no `expiresAt` and are never deleted by TTL. Manual (owner decision):
  those old `audit` rows and `migrations` reports. Use the Console or an Admin SDK script; export first
  (`gcloud firestore export gs://<bucket>/backup-<date>`).

### 4.10 PITR restore (owner approval only)
Point-in-time recovery and delete protection are on (7-day version window). Steps:
1. Owner approves in writing; turn maintenance mode on.
2. Note the target time `T` (UTC, any minute inside the window).
3. Console › Firestore › Disaster recovery › restore to a **new** database at `T` (safer than in place); compare.
4. If replacing production: follow the Console procedure, then redeploy rules and indexes
   (`firebase deploy --only firestore:rules,firestore:indexes`) and wait for indexes to be `READY`.
5. Maintenance off; verify sign-in, sync, a request; record the incident in `docs/HANDOFF_NEXT_AI.md`.
Daily scheduled backups (98-day retention) exist as a second line (`gcloud firestore backups schedules list`).

### 4.11 Staging
A separate Firebase project for testing before production. Code wiring: `.firebaserc` aliases `prod` (`hansalahlak`)
and `staging` (`hansalahlak-staging`); `services/firebase-config.js` uses the staging web config on any
`*-staging.web.app` / `*-staging.firebaseapp.com` host, or on `localhost` / `127.0.0.1` with `?env=staging`
(remembered in `hs_env`, `?env=prod` clears it). Every other host uses production, unchanged.

**One-time setup (owner):**
1. Console › Add project › id `hansalahlak-staging` (if that id is taken, use another and replace it in `.firebaserc`
   and in `stagingWeb` / `databaseURL` / `authDomain` of `services/firebase-config.js`).
2. Upgrade it to the **Blaze** plan (Functions and Cloud Scheduler need it); set a low budget alert in Cloud Billing.
3. Build › Authentication › enable Email/Password and Phone (same as production); add `localhost` and the
   `hansalahlak-staging.web.app` host to the authorised domains.
4. Build › Firestore › create the database in `me-central1` (production mode). Build › Realtime Database › create it in
   `europe-west1`.
5. Project settings › Your apps › add a Web app → copy `apiKey`, `appId`, `messagingSenderId` into `stagingWeb` in
   `services/firebase-config.js` (replace the `PASTE_…` values; check `databaseURL`). Cloud Messaging › Web Push
   certificates → generate a key pair → paste it as `STAGING_VAPID`.
6. `npm run functions:sync`; `npm run sw:bump`; `npm test`; commit.
7. Functions env for staging: `functions/.env.hansalahlak-staging` (git-ignored, overrides `functions/.env` for that
   project) — at least `ADMIN_BOOTSTRAP_EMAILS`; use test mail / AI keys, never the production ones.
8. `npm run deploy:staging`, then `firebase deploy -P staging --only database` (RTDB rules, once and after rule changes).
9. Open `https://hansalahlak-staging.web.app/apps/admin/`, claim the owner with the bootstrap e-mail, create the code.
   Optional: `$env:FIREBASE_PROJECT='hansalahlak-staging'; npm run deploy:record`.

**Daily flow:** change → `npm test` → `npm run deploy:staging` → check the three apps on the staging host (sign in,
create a request, Admin › مركز التقنية) → `npm run deploy:prod` (type `hansalahlak`) → `npm run deploy:record` → §4.2
step 6. Staging data is test data only; never copy production personal data into it.

---

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Customer sees the demo banner / data does not reach the team | that browser has `localStorage hs_backend = local` (a `?backend=local` link was opened) | open the app with `?backend=firebase` once (remembered) |
| UI is old after a deploy | service-worker cache (`CACHE` not bumped, or the old worker still controls the tab) | `npm run sw:bump` + redeploy; user: close all tabs or reload twice |
| «تعذّر الاتصال بالخادم» on every action | `firebase-backend.js` failed to start (offline, SDK blocked) — it never falls back to the demo | check network / console; reload online |
| Admin sees only the code screen / every admin call 401/403 | 8-digit code not unlocked (12 h window) or locked after 5 wrong codes (15 min) | enter the code; owner resets it in `#/security` |
| 401 from `agentApi` | missing / wrong `Authorization: Bearer`, key not in `AGENT_API_KEYS`, secret < 24 chars, or functions not redeployed after editing `.env` | fix the key entry, redeploy functions; 403 = missing scope |
| 429 from `agentApi` or `api` | per-key / per-user rate limit | wait a minute; raise `AGENT_RATE_PER_MIN` if legitimate |
| AI chat says it is unavailable | `system/ai.features.chat` off, no enabled provider with the «شات» role (OpenAI kind needs a base URL), quota reached, or maintenance on | Admin › التوجيه الذكي; check limits |
| «اكتب مشكلتك» hidden | public flag `settings.ai.text` false: feature off or no enabled provider with the `text` role | Admin › التوجيه الذكي |
| A list / sync fails right after a deploy with `FAILED_PRECONDITION` | a new composite index is still building | wait for `READY` (Console › Firestore › Indexes); Admin delta sync falls back to a full sync meanwhile |
| Pushes do not arrive | permission not granted, token dead (removed automatically), or the notification older than 2 minutes | re-enable notifications; check `pushTokens` |
| Provider cannot register | not signed in with SMS (phone required), or `pauseSignups` on | sign in with the phone; `#/controls` |
| Customer cannot change phone | phone is the identity (OTP) / contact number fixed for email & quick accounts | by design; support changes it |
| Digests not sent | no mail transport (`RESEND_API_KEY` / `SMTP_*` + `MAIL_FROM`) | Admin › الإعدادات › الملخصات lists what is missing |
| Tests fail with `functions:check` | `services/` changed without sync | `npm run functions:sync` |
| `sw-cache-guard` fails | served file changed without a cache bump | `npm run sw:bump` |
| `wiring.test.js` fails | a route / export / op / env var / page / query changed without the guide or an index | update this guide (and `firestore.indexes.json`) |

---

## 6. Conventions

- **Code style:** classic scripts in an IIFE exposing one `HS*` global (+ `module.exports` for Node tests); `'use strict'`;
  a header comment per file (MODULE, RESPONSIBILITY, routes / contract, STATUS). Every API call resolves to the envelope
  `{ok, status, data}` / `{ok: false, status, error: {code, message, details?}}` — never throws. Arabic UI copy, English code
  and docs. Do not change routes, globals, storage keys, DOM hooks, script order or collection names without tracing callers.
- **Server:** framework-free `functions/src` (testable without Firebase); identity only from the token; load what the
  rules read in `plan.js`; bound every query (`limit`) and add an index when it needs one; no personal data in alerts,
  digests, logs or telemetry.
- **CSS:** design tokens only (`shared/design-system/*.css`, `brand-2026-tokens.css`); owner overrides go in each app's
  `styles/overrides.css` (loaded last). Admin hard-coded literals are capped by `design-token-audit.test.js`
  (`ADMIN_HARDCODED_BASELINE`); every `pv-*` class the Provider runtime emits must have a rule in `provider.css`
  (`provider-pages.test.js`). RTL, responsive and focus behaviour must be preserved.
- **Tests:** Node built-in runner (`node --test`), no jsdom, no packages. Browser scripts load into a `node:vm`
  sandbox (skill `.claude/skills/vm-script-test`, `tests/helpers/domain-harness.js`, `customer-app-harness.js`,
  `provider-app-harness.js`); the server backend is faked with `tests/helpers/memory-backend.js` (documents by path,
  queries, transactions). CDP runners in `tests/e2e/*.cdp.js` (helper `tests/e2e/lib/cdp.js`).
- **Commits:** clear English message ending with the trailers
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: <session url>`. Agents work in
  their own worktree branch (`docs/agent-briefs/README.md`).
- **Finish gate** (`.claude/skills/finish-gate`): targeted tests → `npm test` → relevant CDP runners →
  `npm run audit:refresh` → `npm run audit:inventory` → update `docs/AI_CONTEXT/START_HERE.md` / `HANDOFF_NEXT_AI.md`.

---

## 7. Known gaps and proposed refactors

Not done in this pass (no behaviour change allowed, or a deploy / owner decision needed). Each with risk and steps.

1. ~~**`digests` never expire.**~~ Done 2026-11-26: TTL overrides for `digests` (90 days) and `audit` (365 days) in
   `firestore.indexes.json`; deploy `--only firestore:indexes` and confirm both policies are Serving (§4.9).
2. **Stale guard mapping `'content-studio': 'marketing'`** in `apps/admin/permission-guard.js` `ROUTE_MODULE`: no page
   or nav item uses it. *Risk:* none at runtime; the file is a synced domain file. *Steps:* remove the key,
   `npm run functions:sync`, `npm test`, functions deploy with the next server change.
3. **`services/README.md` is outdated** («no app entry loads them yet»). Fixed in this pass (doc only).
4. ~~**AI routing has no dedicated `ai.classify` unit test.**~~ Done 2026-11-26: `tests/unit/ai-classify.test.js`.
5. ~~**About 30 domain routes are not named by any unit test path literal.**~~ Done 2026-11-26: `tests/unit/routes-coverage.test.js` (fails when a new route has no test).
6. **`service.api` gates are a chain of `if` blocks.** Now documented as a numbered dispatch table in the header and
   de-duplicated helpers (`adminDocOf`, `isUnlockedAdmin`, `adminOnly`, `remember`). *Proposed:* a declarative
   `SERVER_HANDLERS = [{re, gate, inTransaction, handler}]` table. *Risk:* medium (order, rate-limit position and
   transaction boundaries matter). *Steps:* introduce the table behind the same order, keep the existing tests plus
   `wiring.test.js` shadowing check, compare envelopes for every native route in a parity test before switching.
7. **Admin page module names are not uniform** (`pages/*.page.js` vs `modules/ops-center.js` registering pages).
   *Proposed (do not move now):* keep files in place; any move must update `apps/admin/index.html` script order,
   `service-worker.js` precache, tests and `docs/UI_EDIT_GUIDE_AR.md` in one commit, then `npm run sw:bump`.
8. **Three maps of the same truth** (`docs/API_CONTRACTS.md`, this guide, `docs/PROJECT_REFERENCE.md`). *Proposed:*
   generate the §2.1 table from `HSApiClient.routes()` in `scripts/build-project-reference.cjs`; the wiring test already
   pins completeness.
9. **Performance budget open** (customer LCP ~5–6 s on Fast-3G): bundling / fewer scripts is unfinished — see
   `docs/AI_CONTEXT/START_HERE.md`. Any bundling must keep the classic-script globals and order.
10. **Owner decisions / actions pending (2026-11-27):** Paymob account + `PAYMOB_*` keys and the webhook URL;
    `RESEND_API_KEY` + `MAIL_FROM` (alert e-mails); the `hansalahlak-staging` Firebase project (§4.11); App Check
    site key + `ENFORCE_APP_CHECK`; support contact numbers; legal review of terms / refund / voucher wording; retention
    for `opsAlerts`, `opsTickets`, `aiUsage`; a paid geocoder at scale.
11. **Payments UI unfinished** (§3.14): merge the two payments worktrees after review, then deploy hosting.
12. **Old agent worktrees** under `.claude/worktrees/` (about 17): most are merged or abandoned. Review the two payments
    ones, then remove the rest with `git worktree remove` (never delete branches with unmerged work unreviewed).
13. **Storage for photos** is not used (photos stay on the customer's device); the owner plans Supabase Storage.
