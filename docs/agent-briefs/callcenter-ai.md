# Brief: call-centre infrastructure for human and AI agents

Owner request (2026-11-25): «جهّز البنية إنها تعمل مع موظفين كول سنتر AI». No telephony / AI vendor is chosen yet:
build a vendor-neutral gateway that a human call-centre employee (admin app) and an AI voice agent (server-to-server)
both use, with the same rules, audit and data separation. Follow `docs/agent-briefs/README.md` (worktree, tests, commit
trailer — use `Claude-Session: https://claude.ai/code/session_01W3TuWCKWoe3KxU6igeoy12`, never push/deploy).

Code map: `functions/src/service.js` (api/session, admin routes, audit), `functions/src/scope.js` (ROLE_VIEW /
scrubForRole data separation), `apps/admin/rbac-store.js` (roles, presets, mergePresets), `apps/admin/permission-guard.js`
(API gate), `functions/src/alerts.js` (notifyTeam, tickets), `services/local-market-store.js` (MP.createRequest, the
domain; synced to functions/domain by `npm run functions:sync`), tests helper `tests/helpers/memory-backend.js`.
Use `graphify query "<question>"` before broad searching (graphify-out/ exists).

## Build
1. **Role** `callcenter` «خدمة العملاء (كول سنتر)» in rbac-store presets: view/create requests for a caller, view the
   caller's own requests, create complaints, use tickets/alerts; sees the caller's phone (needed) but NOT other customers'
   addresses/phones; no finance, no settings. Data view in scope.js (only customers/requests reached through a lookup).
2. **Gateway** `functions/src/agent-gateway.js`, routes (same envelope/audit as other routes):
   - `POST /agent/lookup {phone}` → customer (name, masked phone) + their open/recent requests (status, no address of others).
   - `GET /agent/catalog` → categories/items/problems + public prices (for mapping speech to the catalog).
   - `POST /agent/requests {phone, name, cat, item, problem?, desc, gov, area, addr, when?, period?}` → creates the request
     for that caller through the domain (source:'callcenter', createdBy agent id); validation identical to the app.
   - `GET /agent/requests/:id` → status label, ETA, provider first name, next step (caller must own it — check phone).
   - `POST /agent/requests/:id/cancel {reason, confirmFee?}` → same cancel rules; if a travel fee applies return it and
     require `confirmFee:true` (the agent must read it to the caller first).
   - `POST /agent/complaints {requestId, kind, text}`.
   - `POST /agent/handoff {callId, phone?, requestId?, summary, reason}` → ticket + alert to team `ops` («محتاج موظف»).
   - `POST /agent/calls {callId, from, startedAt, endedAt, channel:'ai'|'human', summary, outcome, transcript?}` → `callLogs`
     collection; transcripts kept 30 days then deleted by a clock tick (document retention in docs).
3. **Auth**: (a) human employees with role `callcenter` through the existing admin session (code unlock etc.);
   (b) AI agents through a NEW https function `agentApi` (functions/index.js) authenticated by `Authorization: Bearer <key>`
   checked against `AGENT_API_KEYS` (functions env: `id:secret:scopes` list; compare with timingSafeEqual on a SHA-256);
   per-key rate limit (reuse functions/src/limits.js), every call audited with the key id; keys never in client code.
   `functions/.env.example` documents the variable (no real values).
4. **Admin page** `#/callcenter` (nav only for owner/admin/callcenter): phone search → caller card + requests; «طلب جديد
   للمتصل» form (category → item → problem, address, time) calling `/agent/requests`; recent call logs; handoff tickets.
   Arabic UI in the admin style (tokens only — the admin CSS hard-coded audit must stay green).
5. **Docs** `docs/AI_CALLCENTER.md`: flow diagram (caller → telephony → AI agent → agentApi → platform), tool definitions
   in JSON Schema for the AI agent (lookup_customer, list_catalog, create_request, get_request_status, cancel_request,
   file_complaint, handoff_to_human, log_call) matching the routes, a system-prompt template in Egyptian Arabic for the
   voice agent (safety: emergencies → tell 180/123/129/121 first; never invent prices; confirm address + time; read any
   fee before cancelling; hand off when unsure), how to connect a provider later (webhook shape), retention, privacy notes.
   Add routes to `docs/API_CONTRACTS.md`.
6. **Tests** (in-memory backend): role permissions and data separation (callcenter cannot list all customers or read
   finance), create-on-behalf validation, cancel fee confirmation, ownership check on status, bad/missing key → 401,
   scope check → 403, rate limit, audit entries, handoff creates ticket + alert, transcript retention tick.

Do not edit `apps/customer/pages/home.page.js`, `apps/customer/styles/brand-2026.css` or `apps/customer/app.js`
(the lead is changing them). Final reply in Arabic: branch, commit, what is done, what is left, env vars to set.
