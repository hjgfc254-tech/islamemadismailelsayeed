# HANSALEHLAK — Firestore / Realtime Database schema manifest (2026-11-15)

**Derived from the application, not invented.** The marketplace collections are exactly the entities of the app's
data layer (`services/local-market-store.js`, `MP.db()`) and keep their field names and identifiers. Documents are
written by `functions/src/store.js`.
- Every array entity is one document. The doc id is the entity's own `id`, so existing identifiers and relationships
  are preserved.
- `_k` is a server-maintained order key.
- Collections appear on their **first real write**; no placeholder documents are created.
- **Ownership** is the field the server uses to scope reads (`functions/src/scope.js`).
- Clients have **no direct access** (see `firestore.rules`); all access goes through the callable Functions.

## Marketplace collections

**Customers and providers**

| Collection | Doc id | Fields (types) | Owner / visibility |
|---|---|---|---|
| `customers` | `c_*` | id, name (str), phone (str `01xxxxxxxxx`), status (`active`\|`suspended`), createdAt (ISO str) | The customer (own record) and admin. A provider sees name and phone only for requests assigned to them. |
| `providers` | `p_*` | id, name, phone, type (`individual`\|`company`), cats[str], subs[str], govs[str], areas[str], years (num), bio, docs (str), status (`pending`\|`approved`\|`rejected`\|`suspended`), available (bool), specialRate (num\|null), rating (num), jobs (num), avatar, demo (bool), createdAt | Public projection (no phone, docs, specialRate) when approved. Full record for the provider and admin. |

**Requests and the order lifecycle**

| Collection | Doc id | Fields (types) | Owner / visibility |
|---|---|---|---|
| `requests` (MP `serviceRequests`) | `r_*` | id, no (`HS-YYYY-NNNN`), customerId→customers, providerId→providers, cat, serviceId, serviceName, catName, itemId, itemName, problemId, problemName, unknownProblem, answers{}, specialty, desc, photos[], attachments[ids], video, gov, area, addr, geo, when, whenNote, preferredSlot, preferredPeriod, flexible, phone, contactMethod, status (FLOW + `cancelled`/`failed`), history[{s, at, note}], proposal, schedule, agreedValue, finalValue, freeService{}, createdAt | Customer (customerId), the assigned provider (providerId), admin. An offered provider gets the request without phone, addr or geo. |
| `assignments` | `a_*` | id, reqId→requests, providerId, status (`offered`\|`accepted`\|`rejected`\|`withdrawn`), reason, at, manual (bool) | Provider (providerId), admin. The customer gets status only. |
| `quotes` | `q_*` | id, reqId, providerId, labor, parts, visitFee, discount, total (>0), status (`pending`\|`approved`\|`rejected`\|`superseded`), note, at | The request's customer, the quoting provider, admin |
| `transactions` | `t_*` | id, reqId, providerId, customerId, cat, value, rate, commission, deductions, net, free (bool), model, collection (`pending`\|`collected`\|`waived`\|`none`), at | Provider (full), customer (value only), admin |

**Feedback, support and inbox**

| Collection | Doc id | Fields (types) | Owner / visibility |
|---|---|---|---|
| `reviews` | `v_*` | id, reqId, providerId, customerId, stars 1–5, quality, comment, attachments[], at | Public |
| `complaints` | `k_*` | id, reqId, by (`customer:<id>`\|`provider:<id>`), text, status, resolution, kind, providerId?, attachments[], at | Filer (`by`), admin |
| `notifications` | `n_*` | id, to (`customer:<id>`\|`provider:<id>`\|`admin`), text, reqId, at, read (bool) | Recipient (`to`) |

**Customer data and reference data**

| Collection | Doc id | Fields (types) | Owner / visibility |
|---|---|---|---|
| `addresses` | `ad_*` | id, customerId, label, gov, area, addr, detail, type, default (bool) | Customer |
| `favorites` | `<customerId>__<kind>__<refId>` | customerId, kind (`provider`\|`service`), refId, at | Customer |
| `serviceAreas` | `<gov>` | gov, areas[str], demo | Public reference data |

**System documents**

| Document | Fields | Visibility |
|---|---|---|
| `system/meta` | v (schema 2), lastReqNo (num), created | Server |
| `system/settings` | defaultRate, rates{cat: num}, collectionModel, autoAssign, customerFee | Admin only (customers get `customerFee`, `autoAssign` and `collectionModel`) |

**Device-local, never stored server-side:** `drafts` and `searchHistory`; `services` is derived from the catalogue.

## Backend-only collections

- `system/public` — server-only public summary `{atMs, providers[{id,data}], serviceAreas[{id,data}], reviews[{id,data}]}` (approved providers ≤ 200, all areas, latest 12 reviews). Read by every sync (1 read instead of one per document); deleted in the same transaction by any commit that changes providers / serviceAreas / reviews, rebuilt by the next sync, and rebuilt anyway after 10 minutes. Never used by write paths.


| Collection | Doc id | Fields | Written by |
|---|---|---|---|
| `users` | Auth uid | tag (`customer:<id>`\|`provider:<id>`\|`admin:<uid>`), role, refId, app, updatedAt | `session.sync` / `registerCustomer`: the identity link used to route change signals |
| `employees` | `e9xxx` (app id scheme) | id, name, email (lowercase, unique), department, role, status (`invited`\|`active`\|`disabled`), created, log[{kind, text, at}], uid? | `src/workforce.js` only (Admin workforce routes, invitation acceptance, first owner) |
| `admins` | Auth uid | employeeId→employees, role, status, name, email, updatedAt: the authorization record derived from an accepted employee | `src/workforce.js` only, in the same transaction as the employee change |
| `system/rbac` | — | roles[] (app RBAC catalogue, incl. custom roles), overrides{employeeId: [permission keys]} | `/admin/rbac…` routes; created with the app defaults at the first owner |
| `audit` | auto | at, uid, actor{role, id, adminRole}, app, method, path, status, changes{collection: {set, del}} | Every successful mutation |
| `migrations` | auto | dryRun, added{}, skippedExisting{}, skippedDemo{}, invalid{}, uid, at | `session.importLocal` |
| `rateLimits` | uid | minute, count, expiresAt (TTL) | Write rate limiting (60/min per user) |

## Realtime Database
| Path | Value | Rules |
|---|---|---|
| `signals/{uid}` | `{ at: <ms> }`, bumped by Functions when a change affects that user, and for all active admins | Read: only that uid. Write: never from clients. |

The app has no presence or live-location feature, so none is stored. RTDB carries only change signals; data stays in
Firestore.

## Query patterns and indexes
- Every operation reads through `functions/src/plan.js`. The read/write cost per operation is in `docs/FIREBASE_BACKEND.md`.
- `firestore.indexes.json` defines 13 composite indexes: `requests (customerId, createdAt desc)`, `requests (status, createdAt desc)`, `assignments (providerId, at desc)`, `notifications (to, at desc)`, `complaints (by, at desc)`, `complaints (status, at desc)`, `complaints (by, status, at desc)`, `transactions (providerId|customerId|collection, at desc)`, `providers (status, createdAt desc)`, `providers (status, cats array-contains)` and `reviews (providerId, at desc)`.
- Additional backend collection `idempotency/{uid}__{key}` (`envelope`, `atMs`, `path`, `expiresAt`) stores mutation replays for 24 hours. A TTL policy on `expiresAt` (console) removes `idempotency` and `rateLimits` documents automatically.
- Customer records may carry `email` and `prefs` {notifyStatus, notifyQuotes, notifyReminders, preferredContact} (`PATCH /customers/me`).
