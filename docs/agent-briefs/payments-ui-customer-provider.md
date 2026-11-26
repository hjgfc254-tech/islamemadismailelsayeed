# Brief: payments UI — customer app + provider app

Owner model (2026-11-26):
- After the price is agreed, the customer chooses **«كاش بعد الشغل»** or **«ادفع أونلاين»** (card / mobile wallet through Paymob).
- **Online:**
  - the money is held by the platform until the customer confirms the job (or automatically after 48 h);
  - the customer gets a **«ضمان هنصلحلك» voucher of 20 days**.
- **Cash** is presented neutrally: never say it has no warranty. The voucher is shown as a *bonus* of online.
- The platform share is on the labour only.

The domain, routes and server are DONE (commit 0cbf99f). Build the screens only.

Use `Claude-Session: https://claude.ai/code/session_01W3TuWCKWoe3KxU6igeoy12`. Work in your worktree, commit there, never push or deploy.

**Stay narrow:**
- Read `services/local-market-store.js` section «round 12: payments» (search `choosePay`) and `services/orders-api.js` routes `/requests/:id/pay` and `/pay/demo`.
- Read `tests/unit/payments.test.js` to see the shapes: `r.payment = {method, status: cash|pending|topup|held|released|refunded, paid, due, refund}`, plus `r.warrantyVoucher = {code, days, until}`.
- Then read only the screens you change. Use `graphify query` (graph in `C:\Users\dell\Desktop\Development\proj\graphify-out`) before broad searches.
- No new packages.

## Customer (`apps/customer/`, order tracking / details screen — find where the quote approval and «السعر ثابت» seal render)

1. **Payment choice card.** When `r.agreedValue > 0`, `!r.payment` (or the payment is `pending`), and the status is not completed / closed / cancelled, show a card with two options:
   - **«ادفع أونلاين — فيزا أو محفظة»**, with the line «فلوسك محجوزة عندنا لحد ما تتأكد إن الشغل تمام + قسيمة ضمان هنصلحلك 20 يوم» (the days come from `MP.payConfig().warrantyDays`).
     - Shown only when `MP.payConfig().online && MP.payConfig().gateway` is truthy. In Firebase mode the gateway comes from `settings.payments.gatewayReady` in the sync.
   - **«كاش للفني بعد الشغل»**.
2. **Calling the route.** Both options call `POST /requests/:id/pay {method}` through `HSApiClient` / the existing orders API adapter (`services/orders-api.js` — add `pay(id, method)` and `payDemo(id)` adapters if missing).
   - **Online, Firebase mode:** the response has `data.checkoutUrl` → `location.href = checkoutUrl` (Paymob page). On return (`#/track/<id>`) the request updates by itself through the realtime sync. Show «بنأكد الدفع…» while the status is `pending`.
   - **Online, local demo:** `gateway === 'demo'` → show a small demo dialog «دفع تجريبي» that calls `/pay/demo`.
   - If `checkoutError` is returned, show it, and keep «كاش» available.
3. **Status lines on the order:**
   - `held` → «مدفوع ✓ — فلوسك محجوزة عندنا لحد ما تأكد إن الشغل تمام».
   - `released` → «اتحوّل للفني».
   - `refund.status==='pending'` → «هنرجّعلك X ج.م خلال أيام».
   - `refund.status==='done'` → «رجعتلك X ج.م».
   - `topup` (the price went up) → «فاضل X ج.م» with a pay button.
   - Cash → «هتدفع للفني كاش بعد الشغل».
4. **Voucher.**
   - When `r.warrantyVoucher` exists, the existing warranty certificate (`class="w-cert"`, see `tests/unit/trust-ui.test.js`) shows the title «قسيمة ضمان هنصلحلك» plus the code, the days and the end date.
   - Also show it in «بيتي» next to the device, if a natural place exists.
5. **Review screen of the request wizard** (`apps/customer/pages/request-wizard.page.js`, line with `wz-reassure`): change the text to «مش هتدفع أي حاجة دلوقتي — بعد ما تتفق على السعر تختار: كاش للفني بعد الشغل، أو أونلاين وفلوسك محجوزة عندنا لحد ما تتأكد + ضمان 20 يوم.»

## Provider (`apps/provider/`)

1. **Request page:**
   - show how the customer pays: «كاش بعد الشغل», or «أونلاين — مدفوع ✓ ومحجوز» / «أونلاين — مستني الدفع»;
   - while `MP.payBlocked(r)`, disable «سجّل الإكمال» with the hint «العميل اختار أونلاين ولسه ما دفعش».
2. **Earnings screen:** a «رصيدك من الدفع الأونلاين» block — on hold (payout `hold`), due in the next weekly transfer (payout `due`), and the last paid transfers (payout `paid`, with ref). Use the provider's own transactions.
3. **Profile edit:** a field «محفظة استلام الفلوس» → `payoutWallet` (accepted by `PATCH /providers/me`; hint: «رقم محفظة 01xxxxxxxxx أو عنوان إنستاباي أو IBAN»).
4. **Bid / quote forms:** the live preview (`customerTotalFor`) must now show that the parts are not commissioned. Read `MP.quoteParts(labor, parts, rate)`; the label says «العمولة على المصنعية بس».

## Rules

- CSS:
  - customer: new section «round 12 — payments» at the end of `apps/customer/styles/brand-2026.css`;
  - provider: `apps/provider/styles/brand-2026.css` — every `pv-*` class needs a rule in `provider.css` (there is a test).
- Egyptian Arabic copy, RTL, 44 px taps, the `esc()` helper for all data, and Latin digits (`ar-EG-u-nu-latn`).
- Tests:
  - add `tests/unit/payments-ui.test.js` (node:vm, see `tests/unit/trust-ui.test.js` for the customer harness, and the provider harness in the provider tests): choice card shown / hidden, demo pay → held line, cash line, voucher on the certificate, provider completion disabled while unpaid, payoutWallet in the profile form;
  - then run `npm test` (all green), `npm run sw:bump`, `npm run audit:refresh`;
  - runners: `customer-orders`, `provider-standalone`, `guest`, `a11y` (`python -m http.server <port> --bind 127.0.0.1`, then `node tests/e2e/<r>.cdp.js http://127.0.0.1:<port>`).

## Finish

Commit with the message `feat(payments-ui): customer payment choice, voucher, provider payment status and payouts` plus the trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the Claude-Session line.

Reply in Arabic, 6 lines at most:
- the branch and commit;
- what each screen shows;
- the tests run.
