> **تنبيه النطاق — Frontend Only:** لا يوجد Backend أو HTTP API حقيقي في هذه الحزمة. ملفات `services/*-api.js` محوّلات **وهمية (Mock adapters)** تعمل داخل المتصفح على المخزن المحلي `MP` (`hs_mp_db`) ولا ترسل أي طلب شبكة. هذه الوثيقة تحدد العقد الذي يجب أن يلتزم به Backend المستقبلي؛ لا تنفّذ خادمًا أو قاعدة بيانات أو مصادقة حقيقية بناءً عليها في المرحلة الحالية.

---

# API Contracts (mock adapters — backend-ready boundary)

**Status:** implemented as in-process mock adapters (2026-11-14). Source of truth: `services/api-client.js` and the route
definitions in `services/*-api.js`. `tests/unit/api-adapters.test.js` fails if any registered route is missing from the
table below.

## Load order (classic scripts)
`shared/config/legacy-data.js` → `services/local-catalog.js` → `services/local-market-store.js` → `services/api-client.js`
→ `services/auth-api.js` → `services/orders-api.js` → `services/quotes-api.js` → (`catalog`, `provider`, `customer`,
`notifications`, `support`, `finance`, `admin`, `uploads`)-api → `services/realtime-client.js`.
Each file also works with CommonJS `require`.

## UI integration (2026-11-14): writes through adapters, reads from the local read model
| Entry | Adapters loaded | Mutations routed through them |
|---|---|---|
| Customer `apps/customer/index.html` | api-client, auth, orders, quotes, customer, support, notifications, realtime | request creation (wizard), choose provider / expand search, confirm time, cancel, close, review, quote approve/reject, free-service accept/decline, favorites, addresses (add/edit/default/remove), complaints + provider reports, notifications mark-read |
| Provider `apps/provider/index.html` | api-client, auth, orders, quotes, provider, realtime | registration, profile edit, availability, accept/decline, propose/confirm time, advance, quote, complete, free-service propose/complete |
| Admin `apps/admin/index.html` | api-client, auth, orders, support, finance, admin, realtime | «تشغيل السوق»: provider approve/reject/suspend, special rate, assign/auto-match, cancel, customer suspend, complaint resolve, commission rates, collection status |

- **Writes** are async. Each UI action allows one in-flight request per key (repeat clicks and double Enter are
  ignored), marks the control `disabled` + `aria-busy`, and shows the envelope's `error.message`. A 401 maps to a
  sign-in prompt.
- **Reads** stay synchronous on `MP`, which acts as the client-side read model/cache. `realtime-client` re-reads the
  store (`MP.reload()`) on cross-tab `storage` events and publishes `market:changed`.
  - Customer refreshes the tracking and orders screens in place (scroll kept, focus not lost, polite toast), never
    while a sheet is open.
  - Provider re-renders unless an inline form is open.
  - The Admin marketplace page repaints and announces.
- **Backend hook-up:** `setTransport()` sends every write to a server unchanged. The single remaining integration point
  is hydrating the read model from the `GET` routes after each `market:changed`; screens do not change.
- **Documented direct-`MP` exceptions** (device-local or presentation-only, not marketplace entities), pinned by
  `tests/unit/ui-adapter-integration.test.js`:
  - wizard drafts (`saveDraft`/`clearDraft`) and the link to the device-local attachment store;
  - recent searches (`addSearch`) and "repeat request" prefill;
  - account UI preferences (`save`);
  - review quality/photo extras on the local review record;
  - the Admin «استعادة البيانات التجريبية» demo reset;
  - `customerFor` inside the demo sign-in.
- Actor: each app calls `HSAuthApi.useApp('customer'|'provider'|'admin')` at boot, so an actor never comes from another
  app's session.

## Envelope (every call resolves, never throws)
```
{ ok: true,  status: 200 | 201, data }
{ ok: false, status, error: { code, message, details? } }
```
| code | status | meaning |
|---|---|---|
| BAD_REQUEST | 400 | malformed request |
| UNAUTHENTICATED | 401 | no actor for a non-public route |
| FORBIDDEN | 403 | wrong role, demo RBAC denial, or non-writable field |
| NOT_FOUND | 404 | unknown route, missing record, **or a record the actor may not see** (no existence leak) |
| CONFLICT | 409 | state does not allow the action (e.g. approving a zero quote, completing a paid job on the free path) |
| VALIDATION | 422 | field errors in `details` (`{ field: message }`) |
| INTERNAL | 500 | handler threw |
| UNAVAILABLE | 503 | local store not loaded, or the remote transport failed |

`HSApiClient.viewState(result)` maps a result to the UI state every screen must render: `loading` (no result yet) ·
`ready` · `empty` · `error` · `denied` (401/403).

## Actor and permission boundary
`services/auth-api.js` derives the actor from the **existing** demo sessions, for the app that is running only:
- customer: localStorage `hs_user` → MP customer by phone (a suspended customer has no actor);
- provider: sessionStorage `hs_provider_demo_session` → MP provider with status `approved`. A pending, rejected or
  suspended registration has **no** provider role, because registering never grants it;
- admin: sessionStorage `hs_admin_demo_session` → active `HSAdminRbac` roster employee. When
  `HSAdminPermissionGuard` is loaded, admin routes also check the employee's module permission.

Each route declares its roles. The mock returns 401 when there is no actor and 403 when the role is wrong. Ownership is
checked per record: a customer only reaches their own requests, addresses and complaints; a provider only reaches
requests offered or assigned to them. **This is a demo boundary.** A real backend must enforce all of it server-side.

## Business rules at the boundary (also enforced in the store)
- **Upfront pricing (Uber model):** the admin sets a base price per service key (catalog item id or service id) = the provider amount. At booking the request gets `pricing = {base, rate, customerPrice = round(base × (1 + markupRate/100)), providerAmount, platformFee}`, which is fixed (`agreedValue = customerPrice`). Completion records `value = customerPrice`, `net = providerAmount − deductions`, `commission = platformFee`. A price adjustment after inspection is a quote whose total is the new provider amount; the customer approves `customerTotal` (same markup). Payment today: the customer pays the provider; the platform share is collected from the provider (`collection: pending`). Customers never see the provider amount, platform fee or quote breakdown of priced requests. No configured price → the previous flow (value at completion, commission rate). `markupRate` defaults to `defaultRate`.
- A quote total must be **> 0**. It is refused on submit (422) and on approve (409).
- A job done without charge uses the **free-service** routes (propose → customer accepts or declines → provider
  completes). The result has value 0, no commission, and a transaction with `free:true, collection:'none'`. Collection
  cannot be set on it.
- **Paid order lifecycle (corrected 2026-11-14):**
  ```
  received → searching → sent ─respond(accept)→ accepted ─confirmTime→ scheduled ─advance→ enroute ─advance→ arrived ─advance→ started
  started ─quotes (provider)→ quote ─quote/approve (customer)→ started [agreedValue = quote total]
                              quote ─quote/reject (customer)→ started (provider may send a new quote)
  started ─complete (provider; agreed price, or value > 0 when no quote)→ completed [finalValue, one transaction]
  completed ─close (customer confirms)→ closed ─review (customer, once)
  cancel: customer/admin before `started` · free service: started ─free→ proposed ─free/respond→ accepted ─free/complete→ completed (value 0)
  ```
  - Approving a quote **does not** complete the job.
  - Only a `pending` quote can be approved or rejected, once. An approved quote cannot be replaced or rejected.
    Sending a new quote while one is pending marks the old one `superseded`.
  - Completion is refused while a quote awaits the customer, and at any amount other than the agreed price.
  - `advance` only performs `enroute`, `arrived` and `started`; the other states go through their own validated routes.
  - Exactly one transaction is created, at completion. Tests: `tests/unit/order-lifecycle.test.js` and
    `api-adapters.test.js`.
- A provider edits only `name, phone, type, cats, govs, areas, years, bio, docs`. `status`, `specialRate` and rating are
  rejected (403).
- The public catalogue lists only approved providers and never returns `phone`, `docs`, `specialRate` or `status`.

## Routes
| Route | Roles | Module | Summary |
|---|---|---|---|
| `GET /auth/me` | public | auth-api.js | Current demo actor for the running app, or null. |
| `POST /requests` | customer | orders-api.js | Create a service request for the signed-in customer. Optional `geo {lat,lng}`: finite and in range or 422 `geo`; stored rounded to 5 decimals, nothing else kept. Phone, address and geo reach a provider only after they accept. |
| `GET /requests` | customer, provider, admin | orders-api.js | List requests visible to the actor (?status=). |
| `GET /requests/:id` | customer, provider, admin | orders-api.js | One request (with current quote). |
| `POST /requests/:id/cancel` | customer, admin | orders-api.js | Cancel before work starts. |
| `POST /requests/:id/provider` | customer | orders-api.js | Customer picks a provider for an own unassigned request {providerId}. |
| `POST /requests/:id/respond` | provider | orders-api.js | Accept or decline an offered assignment. |
| `POST /requests/:id/schedule` | provider, customer | orders-api.js | Provider proposes {at}; either side confirms. |
| `POST /requests/:id/advance` | provider | orders-api.js | Move to the next FLOW status {to}. |
| `POST /requests/:id/complete` | provider | orders-api.js | Complete a paid job: {value>0, deductions} or the approved quote. |
| `POST /requests/:id/close` | customer | orders-api.js | Customer confirms completion. |
| `POST /requests/:id/attachments` | customer | orders-api.js | Link uploaded attachment ids to an own open request {ids[]}. |
| `POST /requests/:id/repeat` | customer | orders-api.js | Create a new request from an own previous one. |
| `POST /requests/:id/review` | customer | orders-api.js | Rate the provider once {stars 1–5, comment}. |
| `POST /requests/:id/messages` | customer, provider | orders-api.js | Message the other side of an accepted job {text ≤ 500}. |
| `POST /requests/:id/rate-customer` | provider | orders-api.js | Provider rates the customer once after the job {stars 1–5, comment}. |
| `POST /requests/:id/widen` | customer | orders-api.js | No offers after the window: invite providers from other areas (once). |
| `POST /requests/:id/cash` | customer, provider | orders-api.js | Cash after completion: did the money change hands {paid}. A mismatch opens a complaint. |
| `POST /admin/providers/:id/warn` | admin | admin-api.js | Warn a provider (e.g. off-platform deals) {reason}; the second warning suspends. |
| `POST /requests/:id/bid` | provider | orders-api.js | Send or update an offer {kind: quote or inspection, labor + parts or fee, note, eta}. |
| `POST /requests/:id/choose` | customer | orders-api.js | Choose one of the offers {providerId}. |
| `POST /requests/:id/inspection-only` | provider | orders-api.js | Close an inspection the customer did not continue: the visit fee is the job. |
| `POST /requests/:id/warranty` | customer | orders-api.js | «المشكلة رجعت» within the warranty: a linked request to the same provider {desc}. |
| `POST /requests/:id/tip` | customer | orders-api.js | Tip for the provider, paid in cash with the bill {amount 5–1000}. |
| `POST /requests/:id/chat-seen` | customer, provider | orders-api.js | Read receipt: the caller saw the conversation. |
| `GET /requests/:id/photos` | customer, provider, admin | orders-api.js | Before / after photos of the job. |
| `POST /requests/:id/photos` | provider | orders-api.js | Provider uploads the before / after photo {kind, data (compressed data URL)}. |
| `POST /requests/:id/photos/share` | customer | orders-api.js | Customer allows (or not) the photos in the provider portfolio {share}. |
| `GET /customers/me/devices` | customer | customer-api.js | «بيتي»: own appliances with the next maintenance date. |
| `POST /customers/me/devices` | customer | customer-api.js | Add an appliance {item, brand, year}. |
| `DELETE /customers/me/devices/:id` | customer | customer-api.js | Remove an appliance. |
| `GET /providers/:id/portfolio` | public | catalog-api.js | Before / after photos the customers allowed the provider to show. |
| `POST /requests/:id/quotes` | provider | quotes-api.js | Submit a quote (total > 0). |
| `POST /requests/:id/quote/approve` | customer | quotes-api.js | Approve the current quote (refused when total is 0). |
| `POST /requests/:id/quote/reject` | customer | quotes-api.js | Reject the current quote {reason}. |
| `GET /free-reasons` | public | quotes-api.js | Free-service reason catalogue. |
| `POST /requests/:id/free` | provider | quotes-api.js | Propose doing the job free of charge {reason}. |
| `POST /requests/:id/free/respond` | customer | quotes-api.js | Accept or decline a free-service proposal {accept}. |
| `POST /requests/:id/free/complete` | provider | quotes-api.js | Complete an accepted free service (value 0, no commission). |
| `GET /categories` | public | catalog-api.js | Active categories. |
| `GET /services` | public | catalog-api.js | Services (?cat=). |
| `GET /providers` | public | catalog-api.js | Approved provider directory (?cat=&gov=&q=). |
| `GET /providers/:id` | public | catalog-api.js | Public provider profile + recent reviews. |
| `POST /providers/register` | public | provider-api.js | Onboarding: create a pending provider registration. |
| `GET /providers/me` | provider | provider-api.js | Own full profile. |
| `PATCH /providers/me` | provider | provider-api.js | Edit allow-listed own profile fields. |
| `DELETE /providers/me` | provider | provider-api.js | Delete own account (anonymise; refused with open jobs). |
| `PATCH /providers/me/availability` | provider | provider-api.js | Toggle availability for new requests. |
| `GET /customers/me` | customer | customer-api.js | Own customer profile. |
| `PATCH /customers/me` | customer | customer-api.js | Edit own profile {name, phone, email, prefs}. On the Firebase backend the phone must stay the verified one. |
| `DELETE /customers/me` | customer | customer-api.js | Delete own account (profile, addresses, favorites; past requests are kept for the record). |
| `GET /customers/me/addresses` | customer | customer-api.js | Saved addresses. |
| `POST /customers/me/addresses` | customer | customer-api.js | Add an address. |
| `PATCH /customers/me/addresses/:id` | customer | customer-api.js | Edit an own address. |
| `DELETE /customers/me/addresses/:id` | customer | customer-api.js | Remove an own address. |
| `GET /customers/me/favorites` | customer | customer-api.js | Favorites. |
| `POST /customers/me/favorites/toggle` | customer | customer-api.js | Toggle a favorite {kind, refId}. |
| `POST /customers/me/ref-code` | customer | customer-api.js | Own invite code (created on first use) + current credit and the invite reward. |
| `GET /notifications` | customer, provider, admin | notifications-api.js | Own inbox and unread count. |
| `POST /notifications/read` | customer, provider, admin | notifications-api.js | Mark own inbox as read. |
| `POST /complaints` | customer, provider | support-api.js | File a complaint {reqId?, text, kind?}. |
| `GET /complaints` | customer, provider, admin | support-api.js | Own complaints; admin sees all (?status=). |
| `POST /complaints/:id/resolve` | admin | support-api.js | Resolve a complaint {resolution}. |
| `GET /providers/me/earnings` | provider | finance-api.js | Own transactions and totals. |
| `GET /admin/transactions` | admin | finance-api.js | All transactions (?collection=). |
| `POST /admin/transactions/:id/collection` | admin | finance-api.js | Set a commission collection status. |
| `GET /admin/commission` | admin | finance-api.js | Commission settings. |
| `POST /admin/commission` | admin | finance-api.js | Update default or per-category rate (0–100 %). |
| `GET /pricing` | public | finance-api.js | Customer prices per service key (upfront, platform share included) and the markup rate. |
| `GET /admin/pricing` | admin | finance-api.js | Base prices (provider amounts) per service key and the markup rate (RBAC `services.view`). |
| `POST /admin/pricing` | admin | finance-api.js | Set or clear a base price {key, base>0\|null} or the markup {markupRate 0–100} (RBAC `services.edit`). |
| `GET /admin/summary` | admin | admin-api.js | Operations counts. |
| `GET /admin/providers` | admin | admin-api.js | All providers (?status=). |
| `POST /admin/providers/:id/status` | admin | admin-api.js | Approve / reject / suspend a provider. |
| `POST /admin/providers/:id/rate` | admin | admin-api.js | Set or clear a special commission rate. |
| `GET /admin/requests/:id/candidates` | admin | admin-api.js | Providers matching a request. |
| `POST /admin/requests/:id/assign` | admin | admin-api.js | Assign manually {providerId} or auto-match. |
| `POST /admin/customers/:id/status` | admin | admin-api.js | Suspend / reactivate a customer. |
| `POST /admin/reviews/:id/visibility` | admin | admin-api.js | Hide or re-publish a review {hidden, reason}. |
| `GET /admin/controls` | admin | admin-api.js | Emergency switches (maintenance, pause new requests, pause provider sign-ups). |
| `POST /admin/controls` | admin | admin-api.js | Owner only: turn a switch on/off {key, on, message?}. Customers / providers get 503 on blocked mutations. |
| `GET /admin/marketing` | admin | admin-api.js | Promo codes, invite reward and packages. |
| `PATCH /admin/marketing` | admin | admin-api.js | Replace promo codes / invite reward / packages {promos?, referral?, packages?}. |

Route matching prefers the most specific pattern, so `GET /providers/me` wins over `GET /providers/:id`.

## Non-JSON adapters
- **`services/uploads-api.js`**: `limits()`, `validate(files, existing)` and `upload(reqId, files)` delegate to the
  local attachment store (`AT`, IndexedDB `hs_attachments_v1`). Files never leave the device. It uses the same envelope.
- **`services/realtime-client.js`**: `subscribe('market:changed', fn)` fires after successful API mutations in the same
  tab, and on `storage` events for `hs_mp_db` from other tabs. There are no sockets yet. A backend replaces `connect()`
  with WebSocket or SSE and keeps the same `subscribe` contract.

## Swapping in a real backend
`HSApiClient.setTransport(async ({ method, path, query, body, actor }) => envelope)` routes every call to the transport
instead of the mock handlers; callers do not change. Before doing that, the backend phase must still define:
authentication (tokens, not demo sessions), server-side authorization for every route above, idempotency keys for
mutating routes, pagination for list routes, rate limits, versioning, and the migration of the `MP` data model (see
`docs/AI_CONTEXT/DOMAIN_MAPS/FUTURE_BACKEND_BOUNDARY.md`).
