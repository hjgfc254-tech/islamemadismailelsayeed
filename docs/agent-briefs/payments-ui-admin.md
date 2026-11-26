# Brief: payments UI — admin «المدفوعات» page

Owner model (2026-11-26):
- Customers pay cash to the provider after the job, or online (Paymob) up front.
- Online money is **held** by the platform until the customer confirms (or automatically after 48 h).
- Then the provider's net joins a **weekly transfer** to the provider's wallet / InstaPay.
- Refunds go back through Paymob automatically (paymentsClock).

The routes are DONE (commit 0cbf99f), in `services/admin-api.js` (search `round 12: payments`):
- `GET /admin/payments` → `{config, held[], refunds[], payouts[{providerId,name,phone,wallet,total,items[{id,reqId,amount,at}]}], totals{held,payouts}}`;
- `PATCH /admin/payments/settings {online, warrantyDays, autoReleaseHours, gatewayRate}`;
- `POST /admin/payments/payouts {providerId, ids[], ref}`;
- `POST /admin/payments/:id/release`;
- `POST /admin/payments/:id/refund {amount?}`.

`config.gateway` is `'paymob'` (keys set), `null` (no keys) or `'demo'` (local).

Use `Claude-Session: https://claude.ai/code/session_01W3TuWCKWoe3KxU6igeoy12`. Work in your worktree, commit there, never push or deploy.

**Stay narrow:**
- Follow an existing server-backed admin module, e.g. `apps/admin/modules/ai-settings.js` and `apps/admin/modules/catalog-editor.js` (mounted from `apps/admin/modules/admin-live-panels.js`). Copy their patterns: `esc`, `HSApiClient.request`, a status line, `confirm()` before money actions.
- Use `graphify query` before broad searches (graph in `C:\Users\dell\Desktop\Development\proj\graphify-out`). No new packages.

## Build `apps/admin/modules/payments-admin.js` (`HSPaymentsAdmin.mount(host)`)

1. **Gateway banner:**
   - `gateway === null` → «الدفع الأونلاين مقفول لحد ما مفاتيح Paymob تتحط في إعدادات السيرفر — العملاء بيدفعوا كاش بس»;
   - `'paymob'` → «Paymob شغال»;
   - `'demo'` → «وضع تجريبي».
2. **Totals:** «فلوس محجوزة دلوقتي», «مستحق للفنيين في التحويل الجاي».
3. **«تحويلات الفنيين الأسبوعية»:** one row per provider with name, phone, wallet (warn if empty: «الفني ما حطش محفظة»), total and the number of jobs. The button «اتحوّل» asks for the transfer reference (prompt) → `POST /admin/payments/payouts` with all item ids.
4. **«فلوس محجوزة»:** a table of held / pending payments — order number, provider, amount, status, completedAt. Actions per row, confirm first:
   - «حوّل للفني» → release;
   - «رجّع للعميل» → prompt for the amount (empty = all) → refund.
5. **«استرجاعات جارية»:** pending refunds (amount, order). They are sent to Paymob automatically every 30 min.
6. **Settings form:** online on/off, warranty days (default 20), auto-release hours (default 48), and the gateway fee % (absorbed by the platform). Save → PATCH. Validation errors are shown per field.

## Wiring

- Add a nav page «المدفوعات» to the admin shell (`apps/admin/admin-shell.js` NAV, finance group if present):
  - permission `finance.view` (see `apps/admin/permission-guard.js` and the wiring test `tests/unit/wiring.test.js` «every admin nav page has its module and permission»);
  - Firebase mode mounts the module. In local demo mode the same module works against the local store (`HSApiClient` routes run locally too).
- Add the `<script>` to `apps/admin/index.html` before `admin-live-panels.js`, and add it to the `service-worker.js` precache.
- **Admin CSS: tokens only** (the hard-coded-value audit test must stay green).
- Arabic copy, Latin digits (`ar-EG-u-nu-latn`), `esc()` for all data.

## Tests and checks

- Add `tests/unit/payments-admin.test.js` (node:vm, mount with a fake `HSApiClient`): the banner per gateway; the payouts table and «اتحوّل» calling the route with the ids and ref; release / refund calls; settings validation display; no unescaped data.
- `npm test` (all green), `npm run sw:bump`, `npm run audit:refresh`.
- Runners `admin-app` and `admin-controls` (`python -m http.server <port> --bind 127.0.0.1`, then `node tests/e2e/<r>.cdp.js http://127.0.0.1:<port>`).
- Add a short runbook to `docs/MAINTENANCE_GUIDE.md` §4: «Weekly provider transfers», «Refund a customer», «Turn on Paymob» (set the PAYMOB_* env vars in `functions/.env`, set the callback URL `https://me-central1-hansalahlak.cloudfunctions.net/paymobWebhook` in the Paymob dashboard, deploy functions).

## Finish

Commit with the message `feat(payments-admin): admin payments page — held money, refunds, weekly payouts, settings` plus the trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the Claude-Session line.

Reply in Arabic, 5 lines at most:
- the branch and commit;
- what the page shows;
- the tests run.
