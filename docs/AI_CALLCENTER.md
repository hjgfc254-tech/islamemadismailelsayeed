# Call centre for human and AI agents (2026-11-25)

Vendor-neutral: no telephony or AI provider is chosen yet. The platform exposes ONE gateway that a human call-centre
employee (Admin app, page `#/callcenter`) and an AI voice agent (server-to-server) both use, with the same business
rules, the same rate limit, the same audit log and the same data separation.

Code: `functions/src/agent-gateway.js` (routes, keys, retention) · `functions/src/service.js` (`/agent/*` for employees
through the callable `api`; `domainOp` runs the customer's own route as the caller) · `functions/index.js`
(`agentApi` https function, `callLogsClock`) · `apps/admin/pages/callcenter.page.js` (employee screen) ·
`apps/admin/rbac-store.js` (role `callcenter`, module `callcenter`) · `functions/src/scope.js` (`ROLE_VIEW.callcenter =
'none'`) · tests `tests/unit/callcenter-agent.test.js`. Route table: `docs/API_CONTRACTS.md` «Call centre».

## Flow

```
 caller ──phone──▶ telephony provider (SIP / PSTN, any vendor)
                        │  audio stream
                        ▼
                 AI voice agent (STT → LLM with tools → TTS, any vendor)
                        │  tool calls = HTTPS + Authorization: Bearer <agent key>
                        ▼
      https function agentApi  ──▶  agent-gateway.js  ──▶  the app's own domain rules (functions/domain)
      (me-central1, key check,         (scopes, validation,        Firestore: requests, customers, complaints,
       rate limit, audit)               ownership by phone)          opsTickets, opsAlerts, callLogs
                        ▲
                        │  same routes through the callable `api` (code-unlocked admin session)
      call-centre employee ── Admin app #/callcenter
                        │
      handoff_to_human ──▶ ticket + alert «محتاج موظف» to team ops (bell + push) ──▶ an employee calls back
```

## Who can do what

| Principal | How it signs in | What it may call |
|---|---|---|
| Employee with role `callcenter` | Admin app: email + password + 8-digit code | `/agent/*` (view / create / edit), alerts + tickets of team ops. Sync carries **no** marketplace records; every other admin route answers 403. No finance, no settings, no customer list. |
| Owner / `admin` | same | everything above + the rest of the Admin Center |
| AI agent | `Authorization: Bearer <secret>` on `agentApi` | only the scopes listed for its key in `AGENT_API_KEYS` |

Scopes: `lookup`, `catalog`, `requests.create`, `requests.read`, `requests.cancel`, `complaints`, `handoff`, `calls`,
`calls.read` (`*` = all). Employee permissions map: view → lookup / catalog / requests.read / calls.read; create →
requests.create / complaints / handoff / calls; edit → requests.cancel.

### Keys (owner sets them; never in client code, never in the repo)
`AGENT_API_KEYS` (functions env or Firebase secret): comma-separated `id:secret:scope|scope`, secret ≥ 24 random
characters. Example shape: `voicebot1:<secret>:lookup|catalog|requests.create|requests.read|requests.cancel|complaints|handoff|calls`.
Only SHA-256 digests are kept in memory and compared with `timingSafeEqual`. Rotate by adding a new id, switching the
vendor, then removing the old entry. Every call is audited with the key id (`audit`, `app: 'agent'`).
Optional `AGENT_RATE_PER_MIN` (default 120 per key / employee per minute, per instance; wrong keys: 20 per IP per minute).

## Tool definitions for the AI agent (JSON Schema)

Base URL: `https://me-central1-<project>.cloudfunctions.net/agentApi` (or the Cloud Run URL of `agentApi`). Every tool
is one HTTPS call; the response is always `{ok, status, data | error: {code, message, details?}}`. Pass the caller ID
(`phone`) on every call that touches a customer — the gateway answers only for requests owned by that phone.

```json
[
  { "name": "lookup_customer", "description": "Find the caller by phone: name and their recent requests (status, area). Call first.",
    "http": "POST /agent/lookup",
    "input_schema": { "type": "object", "required": ["phone"], "properties": { "phone": { "type": "string", "description": "Caller ID, Egyptian mobile 01xxxxxxxxx or +201xxxxxxxxx" } } } },
  { "name": "list_catalog", "description": "Categories → items → problems with the customer price (null = priced after inspection), fees and governorates. Use it to map what the caller says to ids. Cache for the call.",
    "http": "GET /agent/catalog", "input_schema": { "type": "object", "properties": {} } },
  { "name": "create_request", "description": "Create a service request for the caller AFTER confirming the address and the time with them.",
    "http": "POST /agent/requests",
    "input_schema": { "type": "object", "required": ["phone", "name", "cat", "item", "gov", "addr"], "properties": {
      "phone": { "type": "string" }, "name": { "type": "string", "minLength": 2, "maxLength": 60 },
      "cat": { "type": "string", "description": "category id from list_catalog" }, "item": { "type": "string", "description": "item id, e.g. appliances/fridge" },
      "problem": { "type": "string", "description": "problem id; omit when unclear (diagnosis by visit)" },
      "desc": { "type": "string", "maxLength": 2000 }, "gov": { "type": "string", "description": "governorate from list_catalog.govs" },
      "area": { "type": "string", "maxLength": 60 }, "addr": { "type": "string", "minLength": 5, "maxLength": 300 },
      "when": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" }, "period": { "type": "string", "enum": ["morning", "noon", "evening"] },
      "callId": { "type": "string" } } } },
  { "name": "get_request_status", "description": "Status, next step, provider first name, arrival estimate and whether cancelling costs a travel fee.",
    "http": "GET /agent/requests/{id}?phone={phone}",
    "input_schema": { "type": "object", "required": ["id", "phone"], "properties": { "id": { "type": "string" }, "phone": { "type": "string" } } } },
  { "name": "cancel_request", "description": "Cancel a request. If the answer is FEE_CONFIRMATION_REQUIRED, read the fee to the caller and call again with confirmFee=true ONLY if they agree.",
    "http": "POST /agent/requests/{id}/cancel",
    "input_schema": { "type": "object", "required": ["id", "phone", "reason"], "properties": { "id": { "type": "string" }, "phone": { "type": "string" },
      "reason": { "type": "string", "minLength": 3, "maxLength": 200 }, "confirmFee": { "type": "boolean" } } } },
  { "name": "file_complaint", "description": "Register a complaint from the caller (optionally about one of their requests).",
    "http": "POST /agent/complaints",
    "input_schema": { "type": "object", "required": ["phone", "kind", "text"], "properties": { "phone": { "type": "string" }, "requestId": { "type": "string" },
      "kind": { "type": "string", "maxLength": 40, "description": "late | quality | price | behaviour | other" }, "text": { "type": "string", "minLength": 5, "maxLength": 1000 } } } },
  { "name": "handoff_to_human", "description": "Ask a human employee to take over (opens a ticket and alerts the ops team). Use whenever unsure, angry caller, emergency follow-up, payment dispute.",
    "http": "POST /agent/handoff",
    "input_schema": { "type": "object", "required": ["callId", "summary", "reason"], "properties": { "callId": { "type": "string" }, "phone": { "type": "string" },
      "requestId": { "type": "string" }, "summary": { "type": "string", "minLength": 3, "maxLength": 1000 }, "reason": { "type": "string", "minLength": 2, "maxLength": 200 } } } },
  { "name": "log_call", "description": "Store the call record at the end of every call (also dropped calls).",
    "http": "POST /agent/calls",
    "input_schema": { "type": "object", "required": ["callId", "from", "startedAt", "channel", "summary", "outcome"], "properties": {
      "callId": { "type": "string", "pattern": "^[\\w.:@-]{1,120}$" }, "from": { "type": "string" }, "startedAt": { "type": "string", "format": "date-time" },
      "endedAt": { "type": "string", "format": "date-time" }, "channel": { "type": "string", "enum": ["ai", "human"] },
      "summary": { "type": "string", "maxLength": 2000 }, "requestId": { "type": "string" },
      "outcome": { "type": "string", "enum": ["request_created", "status_given", "cancelled", "complaint", "handoff", "info", "dropped", "other"] },
      "transcript": { "type": "string", "maxLength": 100000, "description": "kept 30 days, then deleted" } } } }
]
```

## System prompt template for the voice agent (Egyptian Arabic)

```
إنت «مساعد هنصلحلك» على التليفون — منصة بتوصّل الناس بفنيين صيانة (أجهزة، كهربا، سباكة، نجارة، دهانات، عربيات، تنظيف).
اتكلم مصري بسيط ومؤدب وجمل قصيرة. اسأل سؤال واحد في المرة.

الأمان أولًا:
- لو المتصل قال حاجة فيها خطر (حريق، دخان، ريحة غاز قوية، حد اتكهرب، ماس، حادثة، حد مصاب): قوله فورًا
  «اقفل محبس الغاز / القاطع لو تقدر بأمان، واطلع برّه، وكلّم المطافي 180 أو الإسعاف 123 أو النجدة 122/الطوارئ،
   ولو غاز كلّم طوارئ الغاز 129، ولو كهربا كلّم طوارئ الكهرباء 121» — وبعدها بس كمّل الطلب أو حوّل لموظف.
- متدّيش أي تعليمات إصلاح خطيرة.

الشغل:
1. أول المكالمة: lookup_customer برقم المتصل. لو ليه طلبات مفتوحة اسأله لو بيكلم عشانها.
2. طلب جديد: list_catalog وطابق كلامه مع تصنيف وبند ومشكلة. لو المشكلة مش واضحة سيبها فاضية (تشخيص بالمعاينة).
3. قبل create_request لازم تأكد: الاسم، المحافظة والمنطقة والعنوان بالتفصيل، واليوم والفترة (الصبح/الضهر/بالليل) — اقرأهم
   عليه وخد «أيوه» صريحة.
4. الأسعار: قول بس السعر اللي راجع من list_catalog أو من الطلب. لو السعر null قول «السعر بيتحدد بعد المعاينة».
   ممنوع تخترع أو تقرّب أو توعد بخصم.
5. الحالة: get_request_status واقرأ nextStep واسم الفني الأول ووقت الوصول لو موجود.
6. الإلغاء: لو cancel_request رجّع FEE_CONFIRMATION_REQUIRED اقرأ المبلغ بالظبط: «الإلغاء دلوقتي عليه رسوم انتقال X جنيه
   لأن الفني في الطريق، موافق؟» — ولو وافق بس ابعت confirmFee=true.
7. الشكوى: file_complaint بكلامه هو، وقوله إن فريق العمليات هيتابع.
8. لو مش متأكد، أو المتصل متضايق، أو طلب موظف، أو فيه فلوس متنازع عليها، أو حصل خطأ مرتين: handoff_to_human
   بملخص واضح، وقوله «هنكلمك من موظف في أقرب وقت».
9. آخر كل مكالمة (حتى لو فصلت): log_call بالملخص والنتيجة.
متقولش أرقام تليفونات أو عناوين حد تاني أبدًا، ومتطلبش بيانات بطاقة أو دفع.
```

Emergency numbers used above (Egypt): 180 fire, 123 ambulance, 122 police, 129 gas emergency, 121 electricity
emergency. Check them with the owner before going live.

## Connecting a provider later

Any stack that can call HTTPS tools works (e.g. a SIP trunk + a realtime voice LLM, or a hosted voice-agent product).
1. Create a key: `AGENT_API_KEYS=vendor1:<random ≥24 chars>:lookup|catalog|requests.create|requests.read|requests.cancel|complaints|handoff|calls`
   in `functions/.env` (local) or as a Firebase secret / env for deploy; redeploy `agentApi`.
2. In the vendor console register the 8 tools above with the base URL and header `Authorization: Bearer <secret>`.
3. Paste the system prompt; pass the caller ID into the conversation as `phone`, the vendor's call id as `callId`.
4. End-of-call webhook → `POST /agent/calls`. Expected shape (map the vendor's fields to it):
   `{"callId":"<vendor call id>","from":"+2010…","startedAt":"…Z","endedAt":"…Z","channel":"ai","summary":"…","outcome":"request_created","requestId":"r_…","transcript":"…"}`.
   The call is stored once per key + callId (a retried webhook updates the same record).
5. Test with a dedicated key that has only `lookup|catalog`, then widen the scopes.

## Retention and privacy

- `callLogs/{id}`: call metadata, summary, outcome, the caller's number, optional transcript. The transcript gets
  `transcriptExpiresAt = logged + 30 days`; `callLogsClock` (daily) removes it (`transcript: null`,
  `transcriptDeletedAt`). The summary stays. Firestore rules deny every client (server-only collection).
- Audio is not stored by the platform. If a vendor records audio, its retention must be set to ≤ 30 days in the vendor
  console and mentioned in the privacy policy (`legal/privacy.html`: processor, purpose = handling the call, transfer
  outside Egypt if the vendor's servers are abroad — PDP Law 151/2020).
- Data minimisation: the AI agent gets masked phone numbers, area / governorate instead of addresses, provider first
  names only; no other customer is reachable; the audit log stores ids, never phone numbers.
- The caller should hear at the start that the call is handled by an automated assistant and may be recorded.

## Chat employee in the Customer app («مساعد هنصلحلك», 2026-11-25)

The same gateway also serves an AI **chat** employee inside the Customer app (Support centre → «اسأل مساعد هنصلحلك»).

- **Server:** `functions/src/support-chat.js`, session op `chat` (`history | send {text} | confirm {id, yes} | reset`).
- **Client:** `apps/customer/pages/support-chat.js` renders text only. Local demo mode gives fixed answers and is labelled as a demo.
- **Model:** Claude via `@anthropic-ai/sdk`, server-side only.
  - Default model `claude-opus-5-5` at effort `low`.
  - Server-side refusal fallback is on (`fallbacks: "default"`).
  - A manual tool loop of at most 6 rounds; the last round is forced to answer without tools.

### Turning it on

1. Admin → الإعدادات → التوجيه الذكي.
2. Add «Claude», paste the Anthropic API key, tick «شات».
3. Tick «مساعد هنصلحلك».
4. Set the daily limits (defaults: 60 messages per customer, 3000 for the platform).

Alternative: set `ANTHROPIC_API_KEY` (and optionally `CHAT_MODEL`) in `functions/.env`. The key is never sent to any client.

### Tools

The tools run AS the signed-in customer and go through `agent-gateway.handle()`, so they get the same validation, rate limit and audit:

| Tool | What it does |
|---|---|
| `get_my_requests` | Lists the customer's own requests |
| `get_request_status` | Status of one of the customer's requests |
| `search_services` | Searches the catalogue and prices |
| `prepare_new_request` | Prepares a new request (customer confirms) |
| `prepare_cancel` | Prepares a cancellation (customer confirms) |
| `prepare_complaint` | Prepares a complaint (customer confirms) |
| `handoff_to_human` | Opens an ops ticket and alert, at most 3 per day |
| `get_policy` | Returns fixed official facts |

### Security layers

1. **Identity binding.** Firebase token → the customer record (`users/{uid}` link, or `customers.uid`). The model never names a customer or a phone number; the server fills in the account phone.
2. **Switches.** The owner switch `system/ai.features.chat` (off by default) and the maintenance switch.
3. **Limits:**
   - per customer: 6 messages a minute and a daily quota;
   - platform daily quota;
   - per IP: 200 messages a day;
   - one message in flight per customer (busy lock);
   - 800 characters per message, 30 turns per chat, 6 tool rounds per message.
4. **Input masking.** Card numbers, national IDs, phone numbers and e-mails are masked, and invisible or bidi-override characters are stripped, before anything reaches the model.
5. **Strict tools.** 8 tools with strict schemas (`additionalProperties:false`). The server validates again with the app's rules. Ownership is checked on every request id; another customer's request returns 404, so its existence never leaks.
6. **Human confirmation.** Writes happen only when the customer presses the button on a card the **server** built from validated data. Action ids are random, single-use, bound to the account, and expire after 10 minutes.
7. **Output cleaning.** Links other than the platform's, digit runs of 8 or more, and markdown/HTML are removed, and replies are capped at 1500 characters. The client renders text only.
8. **Prompt-injection stance.** Customer text and tool results are data. Platform notes (confirm results, context) travel as mid-conversation `system` messages.
9. **Audit.** Every tool call and confirm writes an `audit` entry (`agent.*`, channel `chat`) without the message text.
10. **Retention.** `supportChats/{uid}` is deleted 30 days after the last message by `callLogsClock`. The privacy policy (§5, §6, §10) names Anthropic as the processor.
11. **Failure handling.** An API error, a refusal or exhausted tool rounds produce a fixed answer and the «كلّم موظف» button. The history is rolled back, so nothing is left half-done.

### Tests

`tests/unit/support-chat.test.js` covers the layers above with a scripted fake model.

### Not covered

- A live call against the real API has not been run, because no key is configured.
- There is no LLM-based content-moderation classifier.
- Abuse is bounded by quotas, not detected.