# CURRENT HANDOFF — 2026-11-14 — Final frontend engineering completion (Claude Code)

> The newest entry is at the top; everything below this section is a dated history log. Source code wins over any older statement below
> (in particular, entries that say the legacy bridge "must be kept" or that profile editing is "disabled" are superseded).

**Commits (on `main`):**
- `e75650e`: palette and intro.
- `cb3789f`: marketplace rules, role isolation, legacy migration.
- `bcf2f89`: mock API adapters.
- `67a316a`: Provider scroll reset and dead CSS removal.
- The docs commit follows.

**What is now true**
- **One marketplace:** Customer, Provider and Admin share `MP` (`hs_mp_db`).
  - A Customer request reaches the Provider; a Provider registration reaches the Admin «تشغيل السوق» page
    (`apps/admin/pages/marketplace.page.js`).
- **Admin isolation:** the Customer app has no Admin link, role switch or `enterRole`. Provider has no Admin trace.
  `tests/unit/legacy-migration.test.js` scans the sources and the rendered screens, and the CDP runners check it at 5 widths.
- **Legacy removed:** `apps/provider/legacy/portal-compat.js` and `apps/provider/provider-workspace.js` were deleted, with
  their two tests and SW entries.
  - Their unique Admin console capabilities (approve/reject/suspend providers, special rate, manual and auto
    assignment, cancel, customer suspension, complaint resolution, commission rates, collection status, demo reset)
    live in `marketplace.page.js`.
  - The legacy-migration test checks each capability.
- **Onboarding:** Customer menu and home → «عايز تقدم خدماتك؟ انضم كمقدم خدمة» → `apps/provider/index.html#/join`.
  Registration is `pending` and grants nothing until Admin approves.
- **Provider:** profile editing is enabled (shared form, `pv-profile-form`). A screen change resets the scroll.
- **Rules:** zero-value quotes are refused on submit and approve. Free service has its own flow:
  - `MP.proposeFree(reqId, reason)` → `respondFree(reqId, accept)` → `completeFree(reqId)`;
  - the result is value 0, no commission, `transaction.free = true`;
  - paid `complete()` is blocked while a free service is open.
- **Backend-ready:** `services/api-client.js` + `auth/orders/quotes/catalog/provider/customer/notifications/support/finance/admin/uploads-api.js`
  + `realtime-client.js`.
  - They are mock adapters: 50 routes, one envelope, 401/403/404/409/422/503, ownership checks, and
    `setTransport()` for a future HTTP layer.
  - They make **no network calls** and **no entry loads them yet**.
  - Contract: `docs/API_CONTRACTS.md`.

**Tests actually run (final state)**
- `npm test` 326/326.
- CDP runners (Edge via `tests/e2e/lib/cdp.js`, `python -m http.server 8099`) at 1280/768/430/390/320:
  - `customer-orders.cdp.js` 145/145 (includes the Guest/isolation loop);
  - `provider-standalone.cdp.js` 261/261;
  - `admin-app.cdp.js` 124/124.
- `audit:inventory` 0 missing / 0 untracked / 0 mismatches.

**Not verified / limits**
- Screen readers, Firefox/WebKit and physical devices were not tested.
- `tests/e2e/responsive-sweep.browser.js` (Playwright) was updated but not run, because Playwright is not installed.
- No dedicated Guest runner (Guest is covered inside the Customer runner).

**Risks**
- Approving a quote in the `quote` state completes the job immediately (existing semantics, now pinned).
- The adapters are not wired into screens: migrating a screen changes its error and empty states and needs parity tests.

**Exact next task:** Customer Addresses + Support keyboard & accessibility (see `docs/AI_CONTEXT/START_HERE.md`).

---
**آخر تحديث:** 2026-11-13 — PHASE 5 / TASK 03 مكتملة، وTASK 04: Customer Bottom Sheet + home/dedicated Search + guide carousel + Request Wizard + account-label accessibility دفعة واحدة منفذة ومختبرة جزئيًا.
- TASK 03 Responsive browser sweep مكتملة حسب `docs/archive/RESPONSIVE_AUDIT.md`؛ وصفها السابق في `START_HERE.md` وخريطة الملفات كان قديمًا وتمت تسويته.
- الحالة السابقة المؤكدة: `sheet()` لم تحفظ opener ولم تنقل التركيز؛ `closeSheet()` لم تستعده؛ `origin` كان سياق رجوع قائمة المشاكل فقط. تمت مراجعة كل مستهلكي `sheet()` و`closeSheet()` في ملفات Customer قبل التنفيذ.
- التنفيذ: حفظ opener عند أول فتح فقط؛ initial focus إلى أول عنصر تفاعلي ظاهر أو `h4`؛ احتواء Tab/Shift+Tab مع الالتفاف؛ Escape؛ استعادة التركيز بعد الإغلاق؛ fallback إلى `#view` إذا اختفى opener؛ عزل خلفية التطبيق بـ`inert` و`aria-hidden` مع استعادة قيمها الأصلية. انتقالات المحتوى داخل نفس النافذة تحتفظ بالـ opener الأصلي. `closeSheet(true)` يظل مخصصًا للإغلاق المصاحب للتنقل؛ يمنع التركيز على opener قديم ويركّز على `#view` بعد اكتمال العرض المتزامن للوجهة.
- `origin` لم يتغير معناه: يظل معرّف شريحة popular/latest لإظهار زر الرجوع في تفاصيل المشكلة.
- ملفات التنفيذ في دفعة Bottom Sheet الأصلية: `apps/customer/app.js`, `apps/customer/index.html`. (أُضيفت لاحقًا تعديلات Customer موضحة في ملحق 2026-11-13 أدناه؛ لا تغييرات Provider/Admin/Shared Design System/Backend/Auth.)
- اختبار المتصفح: `tests/e2e/customer-sheet-focus.browser.py` — 25/25 عند كل مقاس 1280/768/390/320 (100 assertion). Chromium + Python Playwright. تم تحميل ملفات المشروع inline في `about:blank` لأن التصفح المباشر إلى localhost/file محجوب في البيئة. لا أخطاء JavaScript غير ملتقطة.
- Node: `npm test` و`node --test --test-concurrency=1 tests/unit/*.test.js` كلاهما 149/149. Timeout السابق لم يتكرر؛ لا تغيير لإعدادات الاختبارات.
- **الحدود:** هذا يغلق مهمة Bottom Sheet فقط، وليس Accessibility Sweep كاملًا أو ادعاء WCAG. لم تُختبر قارئات الشاشة أو Firefox/WebKit أو أجهزة فعلية.
- البروتوكول `HANSALEHLAK_CONTROLLED_FRONTEND_FILE_IMPLEMENTATION_PROTOCOL` المشار إليه أدناه غير موجود في المستودع بعد البحث؛ لم يتم اختراع محتواه. اتُّبعت `CLAUDE.md` و`docs/AI_CONTEXT/WORKFLOW.md` و`docs/FRONTEND_TEAM_AI_PROTOCOL.md`.
- **التالي:** استكمال فحص Customer (addresses/orders/tracking/support/details)، ثم Provider عبر legacy bridge، ثم Admin page/dialog keyboard traversal. قارئات الشاشة وFirefox/WebKit/Safari والأجهزة الفعلية لم تُختبر. Phase 5 item 4 ما زال جزئيًا؛ لا يوجد ادعاء WCAG.


## 2026-11-19 — Test sweep: coverage map, screen/state sweeps, gaps (463 tests)
- **Measure:** `npm run coverage:map` → `coverage-map.txt` (git-ignored). Function-level V8 coverage of our own code (vm-loaded classic scripts included; `functions/domain` merged into `services`). Now **71 %** of named functions (was 65 %); 7 files never loaded by a unit test (was 10). Under Node 26 `static-audit` throws an internal `WeakRef: invalid target` only while coverage is on — the map is still written.
- **New tests:** `customer-screen-sweep` (every screen, guest + customer, missing / stale ids, tracking in 13 marketplace states), `provider-screen-sweep` (every route, request page per state, **clicks every action button in every state** — reproduces the TDZ class of bug), `local-attachments` (fake IndexedDB + memory fallback), `api-gaps` (customer self-service, admin marketing / candidates / customer status, provider choice, photos, attachment ids, failure path, commission collection / rates, drafts, searches), `admin-live-editors` (marketing editor on the real API, AI settings vs a recording fake server, mini charts).
- **Bugs found and fixed:** `details` screen crashed on a missing / stale device id; **marketing editor showed no per-category rows** (warranty / inspection / caps) because `root.CAT` is undefined — `CAT` is a top-level `const`, not a window property.
- **Browser:** `tests/e2e/offers-cycle.cdp.js` (direct price + inspection cycles, 390 px).
- **Harness additions:** customer `dispatchEvent`/`Event`; provider element `click()`/`remove()`.
- **Still not unit-loaded:** `services/firebase-backend.js`, `apps/admin/{admin-auth,admin-session,app}.js`, `admin-live-panels`, `command-palette`, `site-content-editor` (browser / emulator territory). Dead-code candidates (no runtime caller): `functions/src/store.js` `readAll`/`commit`/`firestoreAdapter`, `functions/src/identity.js` `resolveActor`/`providerStatus` — prove before removing.
## 2026-11-19 — Owner rules on top of the offers round (round 10)
- **No built-in price numbers:** inspection / price caps exist only when the admin sets them (`inspectionCap.default` 0 = no cap).
- **Window over, no offers:** customer button «دوّر على فنيين في مناطق تانية» → `POST /requests/:id/widen` (once): up to 3 same-specialty providers from other governorates + admin notice. Offers ready after the window → a «choose one» banner; after 60 min «اختارلي الأنسب» pulses. No server-side timer/push yet.
- **Revised price on site:** a quote > 150% of the agreed provider amount is `flagged` + admin notice. If the customer refuses → provider «سجّل الزيارة بس» charges `settings.visitFee` (admin; 0 = off), no warranty (`r.visitOnly`).
- **Cancel:** free until `enroute`; at `enroute`/`arrived` the customer pays `settings.cancelFee` (default 50) → `cancel-fee` transaction to the provider. Admin cancels are free.
- **Warranty (labor):** a claim is a free service (`freeService.reason = 'warranty'`). If the original provider declines → `warrantyPayer`, re-assigned; on completion the substitute gets the original labor (`warranty-payout`) and the original is charged (`warranty-charge`).
- **Cash:** `POST /requests/:id/cash {paid}` from both sides; both yes → `collection: 'collected'`; mismatch → automatic `payment` complaint.
- **Off-platform deals:** `POST /admin/providers/:id/warn` (`HSAdminApi.warnProvider`); the second warning suspends. API only — no Admin button yet.
- **Commission:** one rate (`markupRate`); visits use `settings.inspectionRate` (default 0).
- **Test:** `round5-features` «owner rules…».
## 2026-11-19 — Offers round, inspection path, price caps (round 9)
- **Switch:** Admin → live settings → «عروض الفنيين والمعاينة» (`settings.bidding`, off by default; old flow unchanged when off).
- **Flow:** new request → `MP.openBidding` invites up to 3 `candidates()` (`assignments[].bidding`) → each provider `POST /requests/:id/bid` (quote: labor + parts, or inspection: fee) → customer sees `offers` (totals with the platform share via `quoteFor(markupRate)`; the base `bid` never leaves the server) → `POST /requests/:id/choose` accepts one, the others become `withdrawn` + notified. A decline re-invites one more.
- **Inspection:** unknown / «other» problems, or admin marks `settings.inspection{cats,items,problems}`. Fee capped by `settings.inspectionCap` (default 300). Chosen → `r.inspection`; an approved repair quote replaces it (`inspection.waived` = fee deducted); a declined repair → `POST /requests/:id/inspection-only` charges the visit alone (no warranty).
- **Caps:** `settings.priceCaps{cats,items,problems}` — the server refuses higher quote offers (422).
- **Warranty:** defaults to 30 days when the admin never set it; zero for inspection-only.
- **UI:** customer `apps/customer/pages/offers.js` (`HSOffers`) in tracking; provider bid form `#pv-bid-form`; admin `marketing-editor.js` fieldset.
- **Tests:** `round5-features` «offers round…», `firebase-backend` «offers round on the server…».
- **Not done yet:** automatic closing when the 15-minute window ends (offers stay open until the customer chooses); a price library that learns from accepted quotes; per-item/problem caps UI (API accepts them); escrow (needs a payment gateway). Not deployed.
## Round 5 (2026-11-16) — marketplace features (Uber/DiDi/Talabat-style)
- Domain (shared, runs locally and on Functions): `MP.message/chatFor/rateCustomer/setEta/refCodeFor/cairoDay`, `applyDiscount` (promo/invite/credit, paid from the platform fee, capped at it — provider net unchanged), `bumpTrend` (per-day category/area counts in `settings.trend`), `createRequest` keeps `promo`, `packageId/packageName`, `preferProvider`.
- Routes: `POST /requests/:id/messages`, `POST /requests/:id/rate-customer`, `POST /customers/me/ref-code`, `GET|PATCH /admin/marketing`; `/requests` accepts `promo`, `packageId`; `/advance` accepts `eta`; `/repeat` accepts the previous `providerId`.
- Server: `plan.js` loads the customer's first request + invite-code owner for promo checks, and the inviter on completion; `scope.js` keeps promo codes admin-only, filters chat per provider, hides `customerReview` from customers.
- UI: customer chat/ETA/receipt/share/reorder/same provider/cancel reasons/quick times/promo field/address switcher/trending/packages/invite/services filters; provider ETA chips, chat, rate customer, level, 7-day summary, demand by area, swipe; admin `modules/marketing-editor.js` (in live settings).
- Tests: `tests/unit/round5-features.test.js`, server path in `firebase-backend.test.js`. NOT deployed (Functions + Hosting need owner approval).
## تقرير تسليم PHASE 5 / TASK 04 — البنود العشرة
1. **الهدف والسلوك:** إدارة تركيز Customer Bottom Sheet عند الفتح والإغلاق والانتقال بين محتوياته، مع عزل الخلفية عن لوحة المفاتيح وقارئ الشاشة.
2. **الحالة السابقة التي تم التحقق منها:** `sheet()` لم تحفظ عنصر الفتح ولم تنقل التركيز، و`closeSheet()` لم تستعده. `origin` كان سياق الرجوع من تفاصيل المشكلة إلى popular/latest، لذلك لم يُعد استخدامه لتخزين opener. تمت مراجعة جميع مستهلكي الدالتين في ملفات Customer.
3. **الملفات المعدلة:** `apps/customer/app.js`, `apps/customer/index.html`, `tests/unit/frontend-contracts.test.js`, `tests/e2e/README.md`, `docs/AI_CONTEXT/START_HERE.md`, `docs/AI_CONTEXT/DOMAIN_MAPS/CUSTOMER.md`, `docs/AI_CONTEXT/DOMAIN_MAPS/TESTING.md`, `docs/AI_NEXT_IMPLEMENTATION_ORDER.md`, `docs/archive/DEVELOPMENT_PROGRESS.md`, `docs/HANDOFF_NEXT_AI.md`, `docs/archive/IMPLEMENTATION_STATUS.md`, `docs/archive/TEST_RESULTS.md`, وملفات الخريطة/الفهرس المولّدة (`docs/AI_PROJECT_MAP.json`, `.csv`, `.md`, `docs/AI_CONTEXT/FILE_INDEX.json`, `docs/PROJECT_TREE.md`).
4. **الملفات الجديدة:** `tests/e2e/customer-sheet-focus.browser.py` فقط؛ اختبار Chromium سلوكي يدوي لا يضيف dependency للمشروع.
5. **العقود والاعتماديات:** بقيت واجهات `sheet(html)` و`closeSheet()` متوافقة؛ `closeSheet(true)` يوجّه التركيز إلى `#view` بعد انتقال الصفحة. `origin` يحتفظ بمعناه القديم. لا تعديل على Provider/Admin/Shared Design System/Service Worker/backend/database/auth أو API.
6. **اختبارات Node:** `npm test` = 149/149، و`node --test --test-concurrency=1 tests/unit/*.test.js` = 149/149. لم يُعدّل إعداد الاختبارات.
7. **فحص المتصفح:** Chromium + Python Playwright، 25/25 عند كل من 1280×844 و768×844 و390×844 و320×640 (100 assertion). شملت Tab وShift+Tab والالتفاف والنماذج وEscape وbackdrop والإغلاق من إجراء داخل النافذة والتركيز البديل والانتقالات. لا أخطاء JavaScript غير ملتقطة. جرى inline لأصول المشروع في `about:blank` لأن التنقل المباشر إلى localhost/file محجوب؛ لا توجد screenshots محفوظة.
8. **المشكلات المتبقية:** لم تُختبر قارئات الشاشة أو Firefox/WebKit/Safari أو أجهزة فعلية. TASK 04 لا تمثل تدقيق وصولية كاملًا ولا إثبات توافق WCAG. Timeout السابق لـ`npm test` لم يتكرر في هذه البيئة، لذلك لا يمكن الجزم بسبب غير مثبت.
9. **الخريطة والجرد:** `npm run audit:refresh` ثم `npm run audit:inventory`؛ 343 ملفًا على القرص و343 مدخلًا بالخريطة، 0 missing، 0 untracked، 0 SHA-256 mismatches. تم تصنيف ملف الاختبار الجديد كـ`TEST`، وصُححت حالة ملفات Responsive Sweep القديمة من `NEEDS_REVIEW` إلى `TEST` ووصف `archive/RESPONSIVE_AUDIT.md` في الخريطة.
10. **المهمة التالية:** استكمال Phase 5 item 4: تدقيق بقية تدفقات لوحة المفاتيح والوصولية في Customer ثم Provider/Admin، مع اختبارات سلوكية وفحص قارئات الشاشة عند توفرها.

**آخر تحديث:** 2026-11-10 — تنفيذ دعم لوحة المفاتيح للتبويبات المشتركة. المرحلة: Frontend فقط.

## آخر دفعة تنفيذية
- أُضيف `shared/components/accessible-tabs.js`: تنقّل لوحة المفاتيح داخل مجموعات التبويبات (أسهم يمين/يسار مع مراعاة RTL، Home/End، التفاف، roving tabindex)، مع تفعيل التبويب عبر click الحالي حتى تظل الصفحات مالكة لمنطقها.
- رُبطت الأداة بتبويبات Admin في الإشعارات والصلاحيات والأمان، وبمؤشرات شرائح Customer carousel. يتزامن tabindex مع الشريحة النشطة بعد التمرير.
- أضيفت 8 اختبارات سلوكية للتبويبات و3 اختبارات عقد، كما عُزّز `shared/components/dialogs.js` ليعالج Escape ويحصر Tab/Shift+Tab داخل الحوار في fallback غير المدعوم بـ native `<dialog>`، مع اختبار إضافي.
- أضيف السكربت إلى Customer/Admin entry points وService Worker precache؛ إصدار الكاش `hansalhlak-v8-architecture-3`.
- أضيف `scripts/refresh-project-inventory.mjs` وأمر `npm run audit:refresh` لتحديث الخريطة والفهرس المختصر وCSV/Markdown وشجرة المشروع تلقائيًا؛ أي ملف جديد يظهر `NEEDS_REVIEW` بدل إسقاطه بصمت. شغّل refresh ثم verify.
- التقرير: `docs/archive/KEYBOARD_ACCESSIBILITY_AUDIT.md`. هذا تحسين جزئي وليس ادعاء توافق WCAG أو اكتمال فحص قارئ الشاشة.


**آخر تحديث:** 2026-11-10 — بعد إكمال لوحة المالك وتدقيق نظام التصميم. المرحلة: Frontend فقط.

## بوابة الاستلام السريعة (موفرة للتوكنز)
1. اقرأ `CLAUDE.md`.
2. اقرأ `docs/AI_CONTEXT/START_HERE.md`.
3. اقرأ خريطة المجال المناسبة من `docs/AI_CONTEXT/DOMAIN_MAPS/`.
4. اقرأ هذا الملف فقط لاستعادة المهمة الحالية.
5. استخدم `docs/AI_CONTEXT/FILE_INDEX.json` للجرد السريع.
6. لا تحمّل `docs/AI_PROJECT_MAP.json` أو نسخ CSV/Markdown أو كتالوج الملفات كاملًا إلا عند الحاجة لتدقيق عقد ملف محدد.
7. افحص المصدر الفعلي والاختبارات قبل تغيير حالة أي ملف.

## القراءة التفصيلية عند الحاجة
لا تُحمّل كل الوثائق في بداية كل جلسة. ابدأ من `CLAUDE.md` و`docs/AI_CONTEXT/START_HERE.md`، ثم اقرأ المواصفة/الكتالوج المرتبط بالمهمة فقط. استخدم `docs/AI_CONTEXT/FILE_INDEX.json` للجرد السريع، وافتح `AI_PROJECT_MAP.json` فقط لعقد الملف التفصيلي.

## ما أُنجز
- **لوحة المالك** (2026-11-10): `apps/admin/pages/super-dashboard.page.js` (الصفحة `super-dashboard`، API: `HSAdminSuperDashboardPage`): ملخص **للقراءة فقط بلا أي زر أو نموذج** يجمع وقت العرض أرقامًا من حالة الصفحات المنفذة ولا يملك بيانات خاصة: 8 مؤشرات (الطلبات، المزودون المعتمدون، العملاء، العروض بانتظار المراجعة، الشكاوى المفتوحة، العمولات المحسوبة ٣٠ يومًا من الماليات، مستحقات المزودين المتبقية من التسويات، التنبيهات الأمنية المفتوحة) كل منها برابط لصفحته، قائمة «يحتاج انتباهك» (بنود العدد > 0 مرتبة خطر ← تحذير ← معلومة وكل بند برابط)، «حالة التشغيل» من الإعدادات المحاكاة (الصيانة، اعتماد المزود، الضريبة، الجلسات النشطة، محاولات الدخول الفاشلة)، حالة منصة نصية («مستقر/يحتاج انتباهًا/توجد تنبيهات حرجة/تعذّر قراءة البيانات»)، وروابط الوحدات الـ21 من `HSAdminShell.NAV` (الروابط للصفحات المسجلة فقط). **مصدر لا يُقرأ ⇒ «غير متاح» وتنبيه صريح ولا يُخترع رقم؛ فشل كل المصادر ⇒ حالة خطأ.** الفرق عن `admin-dashboard.page.js`: تلك لها بيانات فترة ومهام وتنبيهات قابلة للتجاهل؛ هذه ملخص حي بلا حالة. لا فلاتر زمنية ولا Drill-down (الاستكشاف بالروابط). الافتراضات: `docs/DECISIONS/2026-11-10-super-dashboard-demo-assumptions.md`. + `tests/unit/super-dashboard.test.js` (10 فحوص: اشتقاق كل مؤشر من الصفحات المصدر، بنود الانتباه والترتيب، كل الأصفار ⇒ مستقر، مصدر غير متاح، كل المصادر فاشلة، التبعية الحية عبر مصادر مُحقنة، روابط القائمة، هروب HTML، لا أدوات تحكم/شبكة/تخزين/تعديل لصفحات أخرى، آخر سكربت في `index.html`) + في `frontend-contracts.test.js`: ترتيب السكربتات محدّث، واختبار جديد يثبت أن **كل عنصر في القائمة له صفحة مسجّلة** + اختبار المهمة التالية مُحدَّث — `npm test` = 73/73. **فحص متصفح** `tests/e2e/super-dashboard.browser.js` (Playwright/Chromium، يدوي) نجح عند 1280/768/390px: 8 بطاقات، الأرقام تساوي واجهات الصفحات المصدر، بنية RTL، بلا أدوات تحكم في المحتوى، أول بند انتباه خطر، 21 رابطًا لا ميت منها، الرابط ينقل للصفحة، **اعتماد عرض محاكى في صفحة العروض ثم العودة يخفض «عروض بانتظار المراجعة»**، زر التحديث، بلا overflow ولا أخطاء JS ولا طلبات خارجية. أنماط `.sd*` في `admin-components.css` (تعيد استخدام `.dash-*` و`.fin-banner`). قيود: يعتمد على واجهات الحالة الخاصة `_orders()/_providers()/…` (افتراض مؤقت)، ويجب أن يبقى آخر سكربت صفحة في `index.html`؛ لا ينعكس تغيير صفحة أخرى إلا بإعادة العرض (تحديث/تنقل).
- **عروض الأسعار** (2026-11-09): `apps/admin/pages/quotes-management.page.js` (الصفحة `quotes`، API: `HSAdminQuotesPage`): **9 عروض مشتقة من طلبات `orders-management.page.js`** (كل طلب له مزود ومبلغ موجب وحالته quote/started/completed/closed — لا نسخة ثانية؛ يتحقق اختبار من تطابق المزود والمبلغ والعميل)، ملخص بـ5 عدادات، `HSDataGrid` (بحث برقم العرض/الطلب/العميل/المزود؛ فلاتر الحالة/المزود/الخدمة؛ فرز؛ ترقيم؛ تحميل/فراغ/خطأ)، حوار تفاصيل، وقرارات مراجعة **محاكاة بخطوتين**: اعتماد، إرجاع للمزود، رفض (الإرجاع والرفض بسبب 3–300 حرف؛ المنتهي لا يُعتمد؛ المعتمد والمرفوض نهائيان) وسجل قرارات محلي. نطاق شارات جديد `quote`. **لا تتغير حالة أي طلب ولا يُبلَّغ أحد ولا يتحرك مال.** الافتراضات: `docs/DECISIONS/2026-11-09-quotes-demo-assumptions.md`. + `tests/unit/quotes-management.test.js` (8 فحوص) + `frontend-contracts.test.js` محدّث (الصفحة تُحمَّل بعد `orders-management.page.js`) — `npm test` = 71/71. **فحص متصفح** `tests/e2e/quotes-management.browser.js` (Playwright/Chromium، يدوي) نجح عند 1280/768/390px: 9 صفوف، المنتهي بلا زر اعتماد، رفض بلا سبب مرفوض، الاعتماد المحاكى والسجل والنهائية وتغير العداد، Escape وعودة التركيز، بلا overflow ولا أخطاء JS ولا طلبات خارجية. أنماط `.qt` في `admin-components.css`. قيد: **يجب أن يبقى `orders-management.page.js` قبلها في `index.html`**؛ لا تنعكس القرارات على الطلبات.
- **إعدادات النظام** (2026-11-09): `apps/admin/pages/system-settings.page.js` (الصفحة `settings`، API: `HSAdminSystemSettingsPage`): 12 إعدادًا في 4 مجموعات (عام، التشغيل، الضريبة، الدخول والجلسات) بتحقق لكل حقل (نطاقات، أعداد صحيحة، بريد، قوائم، نسبة الضريبة تُتحقق عند التفعيل فقط)، **حفظ بخطوتين إلزاميتين**: مراجعة الفروقات الدقيقة ثم تأكيد بسبب مكتوب 3–300 حرف، لا حفظ بلا تغيير، «استعادة الافتراضيات» تحمّل القيم في النموذج وتحتاج المراجعة نفسها، سجل تغييرات محلي. شريط صريح: **لا يُحفظ شيء ولا يتأثر أي تطبيق** (الصيانة والضريبة والمهل والحدود غير مطبَّقة). لا نسخة ثانية من العمولة (تبقى في `commissions.page.js`). الافتراضات: `docs/DECISIONS/2026-11-09-system-settings-demo-assumptions.md`. + `tests/unit/system-settings.test.js` (7 فحوص) + `frontend-contracts.test.js` محدّث — `npm test` = 70/70. **فحص متصفح** `tests/e2e/system-settings.browser.js` (Playwright/Chromium، يدوي) نجح عند 1280/768/390px: التحقق وaria-invalid ونقل التركيز، حوار المراجعة، رفض التأكيد بلا سبب، الحفظ المحاكى والسجل، Escape وعودة التركيز، استعادة الافتراضيات، Enter، بلا overflow ولا أخطاء JS ولا طلبات خارجية. أنماط `.set*` في `admin-components.css`. قيد: لا ربط حي مع صفحة الأمان أو غيرها.
- **الأمان** (2026-11-09): `apps/admin/pages/security.page.js` (الصفحة `security`، API: `HSAdminSecurityPage`): ثلاثة أقسام بتبويبات: **التنبيهات** (6 ثابتة، بخطورة منخفضة/متوسطة/عالية/حرجة، `HSDataGrid` بفلاتر الخطورة/الحالة وبحث، حوار تفاصيل، إجراءات **محاكاة** بخطوتين: تم الاطلاع، تصعيد، مُعالَج — التصعيد والمعالجة يتطلبان سببًا 3–300 حرف، «مُعالَج» نهائي)، **الجلسات** (5، إنهاء محاكى للجلسة النشطة غير الحالية بسبب مكتوب؛ الجلسة الحالية لا تُنهى)، **محاولات الدخول** (8، للقراءة فقط بلا حظر/قفل). ملخص بـ4 عدادات، سجل محلي لكل تنبيه/جلسة، نطاقات شارات جديدة `securityalert` و`severity` و`sessionstatus` و`loginresult`. شريط صريح: **لا إنفاذ أمني حقيقي** (لا جلسات تُنهى ولا حسابات تُقفل ولا تصعيد يُرسل). الافتراضات: `docs/DECISIONS/2026-11-09-security-demo-assumptions.md`. + `tests/unit/security.test.js` (7 فحوص) + `frontend-contracts.test.js` محدّث (ترتيب السكربتات والتالي = system-settings) — `npm test` = 69/69. **فحص متصفح** `tests/e2e/security.browser.js` (Playwright/Chromium، يدوي وليس ضمن `npm test`) نجح عند 1280/768/390px: التبويبات، رفض التصعيد بلا سبب، الإجراء المحاكى والسجل وتغير العداد، الجلسة الحالية بلا إنهاء، قراءة فقط لمحاولات الدخول، عودة التركيز، بلا overflow ولا أخطاء JS ولا طلبات خارجية. أنماط `.sec` في `admin-components.css`. قيد: لا ربط حي بسجل التدقيق أو RBAC؛ قائمة المنفّذين ثابتة محلية.
- **سجل التدقيق** (2026-11-09): `apps/admin/pages/audit-log.page.js` (الصفحة `audit`، API: `HSAdminAuditLogPage`): عرض **للقراءة فقط** لـ18 حدثًا تجريبيًا ثابتًا (منفّذ/وحدة/إجراء/سجل/نتيجة)، ملخص بالعدادات، `HSDataGrid` (بحث، فلاتر الوحدة/النتيجة/المنفّذ، فرز، ترقيم، حالات تحميل/فراغ/خطأ)، حوار تفاصيل الحدث، نطاق شارات جديد `auditresult`. شريط صريح: ليس سجل تدقيق حقيقيًا ولا غير قابل للتلاعب؛ لا تعديل/حذف/تصدير؛ لا ربط بالصفحات الأخرى. الافتراضات: `docs/DECISIONS/2026-11-09-audit-log-demo-assumptions.md`. + `tests/unit/audit-log.test.js` (6 فحوص) + `tests/e2e/audit-log.browser.js` (Chromium يدوي، نجح عند 1280/768/390px: بحث، فتح/إغلاق الحوار بـ Escape، عودة التركيز، بلا overflow ولا أخطاء JS). أنماط `.aud*` في `admin-components.css`.
- **التقارير** (2026-11-09): `apps/admin/pages/reports.page.js` (الصفحة `reports`، API: `HSAdminReportsPage`): 4 تقارير مالية تجريبية (الملخص المالي حسب التصنيف، تحصيل العمولات، مستحقات مقدمي الخدمة بأساس ثابت 30 يومًا، الفروقات)، اختيار تقرير + فترة 7/30/90 (معطّلة للتقرير ذي الأساس الثابت مع توضيح) + فلتر تصنيف، بطاقة بيانات وصفية (التقرير، الفترة، التصنيف، المصدر، تاريخ العرض الثابت)، مخطط أعمدة، جدول بصف إجمالي (يتمرر داخل حاويته فقط)، فحوص تطابق (✓/✗ نصية)، حالات تحميل/فراغ/خطأ/نجاح، **تصدير CSV محلي** (BOM، أرقام خام، سطور إفصاح «بيانات تجريبية»، حماية من حقن الصيغ) وسجل تصدير في الذاكرة، استعادة الحالة. كل الأرقام مشتقة من `finance-dashboard.page.js` و`settlements.page.js` (لا نسخة ثانية) وتختبر الاختبارات التطابق. **لا دفع ولا تحصيل ولا تسوية، ولا يُرسل أي ملف لأي جهة.** الافتراضات مسجلة في `docs/DECISIONS/2026-11-09-reports-demo-assumptions.md`. + `tests/unit/reports.test.js` (17 فحصًا) + اختبارا عقد جديدان/محدّثان في `frontend-contracts.test.js` — `npm test` = 67/67 (انظر `docs/archive/TEST_RESULTS.md`). **فحص متصفح مؤتمت جزئيًا:** `tests/e2e/reports.browser.js` (Playwright/Chromium، يدوي وليس ضمن `npm test`) نجح عند 1280/768/390px: RTL، التبديل بين التقارير والفترات، حالة الفراغ، تعطيل الفترة، التصدير وتحميل CSV، سجل التصدير، لوحة المفاتيح (Enter)، عودة التركيز، بلا overflow على مستوى الصفحة، بلا أخطاء JS ولا طلبات خارجية غير الخطوط. إصلاح أثناء الفحص: عمود الشبكة `.dash` كان يتمدد بعرض الجدول (overflow عند 768/390) فأُضيف `.rep{grid-template-columns:minmax(0,1fr)}`. اختصار «التقارير» في لوحة الماليات صار فعّالًا (تحقق في Chromium: ينقل إلى `#/reports`). قيد: تعتمد الصفحة على `finance-dashboard.page.js` و`settlements.page.js` (يبقيان قبلها في `index.html`)؛ لا تنعكس تعديلات الصفحات المحلية على التقارير.
- **التسويات** (2026-11-09): `apps/admin/pages/settlements.page.js` (الصفحة `settlements`): ملخص (إجمالي/مسوّاة محاكاة/متبقية/معلّقة/اختلافات مفتوحة)، مستحقات كل مزوّد، `HSDataGrid` (بحث بالمرجع/المزوّد/السبب، فلاتر الحالة/التصنيف/المزوّد/الاختلاف، فرز، حالات تحميل/فراغ/خطأ)، حوار تفاصيل (مرجع `STL-DEMO-####`، فترة الاستحقاق، تاريخ تسوية تجريبي، سبب التعليق، الاختلاف)، **إجراءات محاكاة بخطوة تأكيد إلزامية** (بدء مراجعة، اعتماد، تعليم كمكتملة؛ التعليق ومراجعة الاختلاف يتطلبان سببًا 3–300 حرف) وسجل محلي. «مكتملة» نهائية (منع التكرار)؛ اختلاف مفتوح يمنع الاعتماد. نطاق شارات `settlement`. بيانات مشتقة من أرقام لوحة الماليات (٣٠ يومًا) ويتحقق اختبار من التطابق. **لا دفع ولا تحويل ولا بوابة** وكل النصوص تقول محاكاة. الافتراضات (الحالات، الانتقالات، حد السبب، التواريخ الثابتة، التقسيم 60/40) مسجلة كقرار مفتوح في `docs/DECISIONS/2026-11-09-settlements-demo-assumptions.md`. + `tests/unit/settlements.test.js` (اختبارات منطق التسوية) + `tests/unit/settlements-edge-cases.test.js` (22 اختبارًا حدّيًا إضافيًا). خط الأساس الحالي موثق في `docs/archive/TEST_RESULTS.md`. فُحص في Chromium عند 1280/768/390px. قيد: الصفحة تعتمد على `finance-dashboard.page.js` (يبقى قبلها في `index.html`)؛ وتعديلاتها المحلية لا تنعكس على لوحة الماليات؛ اختصار «التسويات» في لوحة الماليات صار فعّالًا.
- **العمولات** (2026-11-09): `apps/admin/pages/commissions.page.js` (الصفحة `commissions`): قواعد عمولة (نطاق: افتراضية أو تصنيف، نسبة 0–30٪ حد تجريبي، تاريخ سريان/انتهاء، تفعيل)، تحقق (اسم فريد، تواريخ صالحة، منع تداخل قاعدتين مفعّلتين لنفس النطاق)، جدول العمولات السارية بتاريخ عرض ثابت `2026-11-09` (قاعدة التصنيف تغلب الافتراضية)، **حفظ بخطوتين إلزاميتين: معاينة أثر افتراضي على عيّنة 30 يومًا من صفحة الماليات ثم تأكيد بسبب مكتوب 3–300 حرف**، وسجل تعديلات محلي (عام ولكل قاعدة). لا حذف ولا تطبيق على أي طلب. نطاق شارات `commissionrule`. **ملف مشترك جديد منفّذ:** `shared/utils/money.js` (`HSMoney`) استُخرج الآن وهاجرت إليه لوحة الماليات. + `tests/unit/commissions.test.js` (14 حالة) — `npm test` = 29/29. فُحص في Chromium عند 1280/768/390px: رفض نسبة 50، مراجعة الأثر، رفض الحفظ بلا سبب، الحفظ وظهوره في السجل والجدول، عودة التركيز لزر «تعديل»، رفض التداخل، بلا overflow ولا أخطاء JS. قيد: الصفحة تعتمد على `finance-dashboard.page.js` (قائمة التصنيفات وحجم العيّنة) فيجب إبقاؤها قبلها في `index.html`.
- **لوحة الماليات** (2026-11-09): `apps/admin/pages/finance-dashboard.page.js` (يسجل الصفحة `finance`): فلتر فترة (7/30/90) وتصنيف، 6 مؤشرات (قيمة الطلبات، العمولات المحسوبة/المحصّلة، مستحقات المزودين غير المسوّاة، المسوّاة محاكاة، الفروقات المفتوحة) مع تفصيل لكل تصنيف، شريط تحصيل، قائمة فروقات مع «تعليم كمُراجَع» محلي فقط، اختصارات إلى العمولات/التسويات/التقارير (معطلة «قريبًا» حتى تُسجَّل). نطاق شارات جديد `discrepancy`. أرقام تجريبية صريحة وشريط تنبيه أعلى الصفحة؛ لا دفع ولا تحصيل ولا تسوية. تنسيق المال يستخدم `HSMoney` من `shared/utils/money.js` بعد استخراجه وتنفيذه؛ لا تنشئ منسقًا محليًا بديلًا. أنماط `.fin-*` في `admin-components.css`. + `tests/unit/finance-dashboard.test.js` (12 اختبارًا: ثوابت محاسبية، مجاميع التصنيفات، فلترة الفروقات، لا واجهة عمليات حقيقية) — `npm test` = 28/28. فُحص في Chromium (Playwright يدوي) عند 1280/768/390px بلا overflow ولا أخطاء JS.
- **الأدوار والصلاحيات وتفاصيل الموظف** (2026-11-08): `roles.page.js` (شبكة، حوار إضافة/تعديل بوراثة مفردة بلا دوائر وقائمة صلاحيات وحدة×إجراء مع قفل الموروثة وتعطيل ما فوق سلطة المنفّذ، **حفظ بخطوتين إلزاميتين: مراجعة التأثير ثم التأكيد**، دور المالك محمي للقراءة فقط، سجل تغييرات)، `permissions.page.js` (تبويب مصفوفة الأدوار للقراءة + تبويب «حسب الموظف» لصلاحيات إضافية ضمن سلطة المنفّذ)، `employee-details.page.js` (صفحة مخفية `#/employee-details/<id>`: بيانات، تعديل الإدارة والدور بحراسات السلطة وآخر مالك، صلاحيات فعلية، سجل، ومُنتقٍ عند غياب المعرّف). **ملف جديد** `apps/admin/rbac-store.js` (`HSAdminRbac`) يتشاركه الثلاثة (تعديل دور في صفحة الأدوار يظهر في المصفوفة). منفّذ تجريبي قابل للاختيار يحدد «السلطة». لا إنفاذ فعليًا (والواجهات تقول ذلك). قوائم الموظفين نسخة ثابتة مطابقة لـ fixtures workforce (اختبار يتحقق) وغير مربوطة حيًا. `npm test` = 27/27؛ فُحصت الصفحات في Chromium (Playwright يدوي) عند 1280/768/390px بلا overflow ولا أخطاء JS (المصفوفة تتمرر داخل حاويتها فقط).
- `apps/admin/pages/departments.page.js` (ملخص، شجرة إدارات 3 مستويات بطي/توسيع، حوار إضافة/تعديل بتحقق: اسم فريد بين الأشقاء، قائمة الإدارات الأم تستبعد النفس والأحفاد (منع الدوائر) وما يتجاوز العمق، المسؤول يُختار من موظفي الإدارة المفعّلين فقط، قائمة الموظفين المرتبطين للعرض، تفعيل/إيقاف محاكى؛ يسجل نطاق `department`) + **ملف جديد** `shared/utils/tree.js` (`HSTree`: أشقاء/أحفاد/عمق/ارتفاع/آباء صالحون/تسطيح بحراسة ضد البيانات الدائرية) + `tests/unit/tree.test.js` و`departments.test.js` — `npm test` = 25/25. قواعد علاقات تجريبية (ليست من نص المواصفة): لا إيقاف لإدارة فيها فرعية مفعّلة؛ لا تفعيل لإدارة أمها متوقفة. قائمة الموظفين نسخة ثابتة مطابقة لـ fixtures صفحة فريق العمل (يتحقق اختبار من التطابق) وغير مربوطة بها حيًا. فُحص في Chromium (Playwright يدوي) عند 1280/768/390px بلا overflow ولا أخطاء JS.
- `apps/admin/pages/workforce.page.js` (ملخص، `HSDataGrid` بفلاتر الحالة/الإدارة/الدور، حوار إضافة+دعوة محاكاة وتعديل بتحقق: اسم، بريد فريد غير حساس لحالة الأحرف، إدارة ودور من قوائم محلية ثابتة؛ إعادة إرسال دعوة محاكاة؛ دعوة→مفعّل ومفعّل⇄معطّل محاكاة؛ سجل إجراءات لكل موظف؛ قاعدة تجريبية: لا يمكن تعطيل أو تغيير دور آخر مالك مفعّل؛ يسجل نطاق `employee`) + `tests/unit/workforce.test.js` — `npm test` = 23/23. لا صلاحيات فعلية ولا دعوات فعلية (والواجهة تقول ذلك). فُحص في Chromium (Playwright يدوي) عند 1280/768/390px بلا overflow ولا أخطاء JS. إصلاح مرافق: Enter لم يكن يرسل نماذج الموظفين والإشعارات (أكثر من حقل نصي وأزرار `type=button` فقط)؛ صار زر الحفظ `type=submit` ويُعالَج مرة واحدة عبر حدث `submit` (تحقق منه في الصفحات الأربع: workforce/notifications/services/categories).
- `apps/admin/pages/notifications-management.page.js` — جزئي بنطاق العرض التجريبي: تبويب «القوالب» (جدول بفلاتر، حوار إضافة/تعديل بتحقق: اسم فريد، قناة وجمهور من قوائم ثابتة، عنوان ≤60 ونص ≤200، متغيرات معروفة فقط `{{name}}` `{{order_no}}` `{{date}}`، معاينة محلية مُهرَّبة بعبارة «لم يُرسل شيء»، تفعيل/تعطيل محاكى) وتبويب «سجل الإرسال (تجريبي)» للقراءة فقط بحالات تسليم (تم/جزئي/فشل تُشتق من الأعداد) ونسبة تسليم؛ يسجل نطاقي `notification` و`delivery`. غير منفذ: الحملات، الجدولة، اختيار جمهور حقيقي، الإرسال، تفاصيل التسليم لكل مستلم. + `tests/unit/notifications-management.test.js` — `npm test` = 22/22 (يتضمن اختبار أن الوحدة لا تكشف أي دالة إرسال/جدولة). فُحص في Chromium (Playwright يدوي) عند 1280/768/390px بلا overflow ولا أخطاء JS.
- `apps/admin/pages/reviews-management.page.js` (ملخص مع متوسط المنشورة، `HSDataGrid` بفلاتر الحالة/التقييم/المزود، حوار: نص المراجعة والبلاغ وقرارات إشراف محاكاة تتطلب سببًا مكتوبًا (3–300 حرف) يُسجَّل في سجل القرارات، وملاحظات؛ يسجل نطاق `review`) + `tests/unit/reviews-management.test.js` — `npm test` = 21/21. إصلاح مرافق: عند خروج الصف من الجدول المفلتر بعد قرار كان التركيز يضيع؛ صار `fallbackFocus` يعود إلى حقل بحث الجدول (`.hs-grid-search input`) في صفحات المراجعات والمزودين والشكاوى والخدمات. فُحص في Chromium (Playwright يدوي) عند 1280/768/390px بلا overflow ولا أخطاء JS.
- `apps/admin/pages/complaints-management.page.js` (ملخص، `HSDataGrid` بفلاتر الحالة/الأولوية/التصنيف/المسؤول وفرز الأولوية بالرتبة، حوار: الطلب المرتبط، تصنيف وأولوية محاكاة (رفض عدم التغيير)، تعيين على قائمة موظفين تجريبية ثابتة، انتقالات حالة مسموحة، ملاحظات، وسجل معالجة يُضاف له سطر لكل إجراء؛ يسجل نطاقي `complaint` و`priority`) + `tests/unit/complaints-management.test.js` — `npm test` = 20/20. فُحص في Chromium (Playwright يدوي) عند 1280/768/390px بلا overflow ولا أخطاء JS.
- `apps/admin/pages/categories-management.page.js` (شجرة 3 مستويات بطي/توسيع، حوار إضافة/تعديل بتحقق: اسم مطلوب وفريد بين الأشقاء، قائمة الآباء تستبعد النفس والأحفاد (منع الدوائر) وما يتجاوز العمق، نقل التصنيف يعيد ترقيم الأشقاء، تفعيل/إيقاف محاكى، تقديم/تأخير بين الأشقاء؛ يسجل نطاق `category`) + أنماط `.cat-*` + `tests/unit/categories-management.test.js` — `npm test` = 19/19. فُحص في Chromium (Playwright يدوي) عند 1280/768/390px بلا overflow ولا أخطاء JS.
- `apps/admin/pages/services-management.page.js` (ملخص، `HSDataGrid` بفلاتر الحالة/التصنيف، حوار واحد للإضافة كمسودة والتعديل بتحقق (مطلوب/طول/اسم فريد/تصنيف من قائمة)، نشر/إيقاف محاكى draft→active وactive⇄inactive، ترتيب الظهور تقديم/تأخير؛ يسجل نطاق `service` في `HSStatusBadge`) + `tests/unit/services-management.test.js` — `npm test` = 18/18. فُحص في Chromium (Playwright يدوي) عند 1280/768/390px بلا overflow ولا أخطاء JS.
- `apps/admin/pages/providers-management.page.js` (ملخص 5 عدادات، `HSDataGrid` بفلاتر الحالة/التخصص/المنطقة، حوار ملف المزود: بيانات، قائمة مستندات، قرارات مراجعة محاكاة pending→approved/rejected وapproved⇄suspended وrejected→pending، ملاحظات) + `shared/components/dialogs.js` (`HSDialog.attach`، استُخرج بعد تكرار الحوار) + `tests/unit/providers-management.test.js` و`dialogs.test.js` — `npm test` = 17/17. فُحص في Chromium (Playwright يدوي) عند 1280/768/390px بلا overflow ولا أخطاء JS.
- `apps/admin/pages/customers-management.page.js` (ملخص، `HSDataGrid`، حوار تفاصيل، إيقاف/إعادة تفعيل محاكى، ملاحظات؛ يسجل نطاق `customer` في `HSStatusBadge`) + `tests/unit/customers-management.test.js` — `npm test` = 15/15. إصلاح overflow أفقي عند 768–1024px بـ `.hs-grid{grid-template-columns:minmax(0,1fr)}` (كان يؤثر على صفحة الطلبات أيضًا).
- `apps/admin/pages/orders-management.page.js` (صفحة الطلبات: ملخص، `HSDataGrid`، حوار تفاصيل، تغيير حالة محاكى ضمن انتقالات مسموحة، ملاحظات داخلية) + `tests/unit/orders-management.test.js` — `npm test` = 14/14. أنماط `.ord*` في `admin-components.css`.
- `shared/components/data-grid.js` (`HSDataGrid`) + أنماط `.hs-grid*` + `tests/unit/data-grid.test.js` — `npm test` = 13/13. تُحمَّل في `apps/admin/index.html` بعد `status-badge.js`.
- `shared/components/status-badge.js` (`HSStatusBadge`) + أنماط `.hs-badge` في `admin-components.css` + `tests/unit/status-badge.test.js` — `npm test` = 12/12.
- `apps/admin/admin-shell.js` + `index.html` + 3 ملفات CSS في `apps/admin/styles/`.
- `apps/admin/pages/admin-dashboard.page.js` (بيانات تجريبية).
- اختبارات: `tests/unit/admin-shell.test.js`, `admin-dashboard.test.js` — `npm test` = 11/11.
- فحوص المتصفح التاريخية كانت يدوية/مخصصة وليست جزءًا من `npm test`. طبقات الاختبار الحالية وحدودها وخطة أتمتة Chromium موثقة في `docs/TESTING_STRATEGY.md`.

## عقد إضافة صفحة إدارة
```js
HSAdminShell.registerPage('orders', { title, description, actions, render(ctx){ /* string | Node | Promise */ } });
```
- المعرّف يجب أن يكون من `HSAdminShell.NAV`. بعد التسجيل يُفعَّل عنصر القائمة تلقائيًا.
- أضف وسم `<script src="pages/<file>.page.js">` في `apps/admin/index.html` بعد `admin-shell.js`.
- لا تنشئ مكونًا مكررًا؛ ما لا يوجد في `shared/components` (باستثناء `status-badge.js` و`data-grid.js` و`ui-kit.js` فبقية الملفات Placeholders) ابنِه هناك أولًا.

## آخر مهمة مكتملة: Design System Audit (2026-11-10)

- التقرير: `docs/archive/DESIGN_SYSTEM_AUDIT.md`.
- تأكد أن `shared/design-system/design-system.css` هو مصدر الـtokens الحي؛ Admin وCustomer يحملانه. الملفات المنفصلة `tokens.css` و`typography.css` و`components.css` و`layout.css` Placeholders.
- تم فحص 5 ملفات CSS: Admin (3)، Customer (1)، Provider (1). Admin baseline = **163** literal occurrences: colors 36، layout dimensions 98، radii 5، font sizes 16، box/text-shadow declarations 8، numeric z-index 0. Customer = 1,048؛ Provider standalone CSS = 0 (لكن `.pw-*` styles ما زالت داخل Customer CSS).
- أضيف `tests/helpers/design-token-audit.js` و`tests/unit/design-token-audit.test.js`؛ الاختبار يمنع نمو عدد القيم الحرفية في Admin CSS فوق 163 ويسمح بتقليله.
- لم تتغير ملفات CSS الإنتاجية، ولم يُجرَ browser visual sweep؛ هذه مهمة جرد مصدرية فقط.

## آخر مهمتين مكتملتين في المرحلة 5

### البند 1 — Design System Audit
- التقرير: `docs/archive/DESIGN_SYSTEM_AUDIT.md`.
- `shared/design-system/design-system.css` هو مصدر الـtokens الحي؛ الملفات المنفصلة الأربعة Placeholders.
- تم فحص 5 ملفات CSS. Admin baseline = **163** literal occurrences؛ الاختبار `tests/unit/design-token-audit.test.js` يمنع الزيادة. Customer = 1,048؛ Provider standalone CSS = 0 لأن `.pw-*` styles لا تزال داخل Customer CSS.
- لا تغييرات على CSS الإنتاجي، ولا browser visual sweep ضمن المهمة.

### البند 2 — Icon and Asset Audit
- التقرير: `docs/archive/ICON_ASSET_AUDIT.md`.
- `shared/icons/icon-registry.js`: **188 تعريفًا + 23 alias**؛ كل التعريفات تبني SVG غير فارغ، والخرائط الديناميكية للحالات والأقسام والمشكلات سليمة.
- الأصول الستة في `assets/` موجودة ومستخدمة ومضافة إلى Service Worker precache؛ لا ملفات مكررة byte-for-byte ولا أصول محذوفة.
- اكتُشف مرجع ديناميكي مفقود `inbox` في `apps/provider/provider-workspace.js`؛ أُضيف تعريفه في registry. رُفع Service Worker cache إلى `hansalhlak-v8-architecture-2` لتفعيل التحديث.
- الاختبار الجديد: `tests/unit/icon-asset-audit.test.js`.

## سجل حالة سابق — 2026-11-10 (مرجع تاريخي متجاوز)
الملاحظات القديمة التي كانت تؤجل Responsive browser sweep بسبب `ERR_BLOCKED_BY_ADMINISTRATOR` تخص بيئة 2026-11-10 فقط، وقد تجاوزتها نتائج TASK 03 الموثقة في `docs/archive/RESPONSIVE_AUDIT.md` بتاريخ 2026-11-13. الحالة الحالية والمهمة التالية موضحتان في مقدمة هذا الملف؛ لا تستخدم هذا السجل التاريخي لتحديد حالة التنفيذ الحالية.

قواعد النماذج السابقة ما زالت مرجعًا عند العمل على النماذج: أي نموذج فيه أكثر من حقل نصي يجعل زر الحفظ `type="submit"` ويعتمد على حدث `submit` فقط. استخدم `fallbackFocus` → `.hs-grid-search input` في الصفحات ذات الجداول المفلترة.

القرارات المفتوحة قبل أي ربط حي بين الصفحات (سجّلها في `docs/DECISIONS/`): افتراضات التسويات والتقارير التجريبية؛ نسخ roster/departments/roles الثابتة؛ قائمة موظفي الشكاوى؛ قائمة تصنيفات الخدمات؛ حملات الإشعارات؛ نقل التصنيفات إلى `HSTree`؛ واستبدال واجهات الحالة الخاصة `_xxx()` في لوحة المالك بمخزن بيانات مشترك أو واجهات قراءة عامة عند الربط الحي.

متابعات مؤجلة: نقل منطق الحوار في صفحتي الطلبات والعملاء إلى `HSDialog` مع فحص التركيز وEnter؛ تحديث `docs/FRONTEND_FILE_CATALOG.md` (قديم ويعرض صفحات إدارة منفذة كـPLACEHOLDER؛ المرجع الحالي `docs/AI_PROJECT_MAP.json`)؛ مراجعة `docs/FRONTEND_PAGE_CATALOG.md` لبقية صفحات الإدارة.

## قيود لا تُخالَف
- لا تعتبر Placeholder منفذًا. لا تدّعِ عمليات حقيقية؛ كل شيء محلي/تجريبي ويُعرض كذلك.
- الصلاحيات في الواجهة عرض فقط وليست حماية.
- نفّذ ملفًا واحدًا، وحدّث التوثيق والخريطة والاختبارات، وأخرج التقرير (10 بنود) في البروتوكول.

## نص جاهز تلصقه في الشات الجديد
> اقرأ `CLAUDE.md` و`docs/AI_CONTEXT/START_HERE.md` و`docs/AI_CONTEXT/WORKFLOW.md` ثم الجزء الحالي من `docs/HANDOFF_NEXT_AI.md` وخريطة المجال ذات الصلة. البروتوكول `HANSALEHLAK_CONTROLLED_FRONTEND_FILE_IMPLEMENTATION_PROTOCOL` المشار إليه في سجلات handoff غير موجود في المستودع؛ لا تخترع محتواه، والتزم بالملفات المرجعية المتاحة.


## استكمال TASK 04 — Customer home search keyboard (2026-11-13)
- **الحالة السابقة:** `bindHomeSearch()` كان يعرض الاقتراحات بعد الكتابة، لكن لا يحدّث `aria-expanded`، ولا يوفّر active option semantics، ولا يدعم ArrowUp/ArrowDown. Enter كان يرسل البحث الخام دائمًا حتى مع وجود اقتراح محدد.
- **التنفيذ:** `apps/customer/app.js` فقط في الإنتاج. أضيف اسم قابل للوصول و`aria-autocomplete=list`؛ مزامنة `aria-expanded`؛ IDs و`aria-selected` و`aria-activedescendant`؛ ArrowUp/ArrowDown مع الالتفاف؛ Enter يفعّل الاقتراح النشط ويحافظ على direct search عند عدم وجود اختيار؛ Escape يغلق ويصفّر الحالة؛ عناصر الاقتراح `tabindex=-1` لتجنب محطات Tab زائدة. لا تغيير في CSS أو Shared أو Provider/Admin.
- **الاختبار الجديد:** `tests/e2e/customer-search-keyboard.browser.py` — 14/14 Chromium checks عند 390×844، بلا أخطاء JS. يستخدم Python Playwright الموجود في البيئة ولا يضيف dependency.
- **الاختبارات العامة:** `npm test` = 149/149.
- **الملفات المعدلة:** `apps/customer/app.js`, `tests/e2e/customer-search-keyboard.browser.py`, `tests/e2e/README.md`, `docs/archive/KEYBOARD_ACCESSIBILITY_AUDIT.md`, `docs/archive/DEVELOPMENT_PROGRESS.md`, `docs/archive/IMPLEMENTATION_STATUS.md`, `docs/archive/TEST_RESULTS.md`, `docs/AI_NEXT_IMPLEMENTATION_ORDER.md`, `docs/HANDOFF_NEXT_AI.md`, `docs/AI_CONTEXT/START_HERE.md`, `docs/AI_CONTEXT/DOMAIN_MAPS/CUSTOMER.md`, `docs/AI_CONTEXT/DOMAIN_MAPS/TESTING.md`, وملفات الجرد المولدة.
- **حدود:** تم اختبار home search فقط عند 390px؛ لم نختبر قارئ شاشة، ولا شاشة Search المستقلة `HS_SEARCH.bind`, ولا كل تدفقات Customer. هذا لا يعني اكتمال الوصولية أو WCAG.
- **التالي المحدد:** Customer Request Wizard keyboard/accessibility: labels، ترتيب Tab، validation/error announcement، focus placement بعد فشل التحقق وبعد الانتقال بين الخطوات، ثم regression للـ draft/attachments/review.


## ملحق تسليم 2026-11-13 — دفعة Customer Keyboard & Accessibility

1. **الهدف:** معالجة التدفقات التي بقيت بعد Bottom Sheet والبحث الرئيسي دون إعادة تصميم أو تغيير عقود المنتج.
2. **الحالة السابقة:** البحث المخصص `HS_SEARCH.bind` لم يكن يوفر تنقلًا بلوحة المفاتيح للنتائج؛ الـ Request Wizard لم يكن يركز عنوان الخطوة أو يعلن أخطاء التحقق ويركز أول حقل غير صالح؛ بعض labels وعلاقات تبويبات carousel كانت ناقصة.
3. **ملفات التنفيذ المعدلة:** `apps/customer/app.js`, `apps/customer/pages/search.page.js`, `apps/customer/pages/request-wizard.page.js`, `apps/customer/pages/account.page.js`, `apps/customer/styles/customer.css`.
4. **ملفات الاختبار:** تحديث `tests/e2e/customer-search-keyboard.browser.py`; إضافة `tests/e2e/customer-request-wizard-accessibility.browser.py`; تحديث `tests/e2e/README.md`.
5. **السلوك:** نتائج Search أصبحت listbox/options مع ArrowUp/ArrowDown وactive descendant وEnter عبر تدفق التفاصيل الحالي وEscape؛ carousel tabs مرتبطة بالشرائح وتستخدم roving tabindex؛ Wizard يركز عنوان كل خطوة ويعلن validation ويحدد أول invalid field/choice ويربط الخطأ بـ`aria-describedby`; إصلاح labels وrequired/pressed states؛ labels دخول الحساب ووسيلة التواصل صارت صريحة.
6. **العقود:** لم يتغير `HS_SEARCH.openResult` أو `startRequest` أو `show('wizard')` أو مسارات `HS_DISCOVER`; Enter يحافظ على تدفق فتح صفحة تفاصيل الخدمة، وليس فتح Wizard مباشرة. لم تتغير بيانات أو API أو backend.
7. **الاختبارات:** `npm test` 149/149؛ Search/carousel 28/28؛ Wizard/account 24/24؛ Bottom Sheet regression 25/25 عند كل من 1280/768/390/320 (100 assertion). لا أخطاء JS غير ملتقطة في هذه الجولات.
8. **Browser:** Chromium + Python Playwright عند 390×844 لتدفقات Search/Wizard، و1280/768/390/320 لـBottom Sheet. لم ينجح Node responsive runner في هذه البيئة لأن حزمة Node `playwright` غير متاحة؛ لا يُسجل كاختبار ناجح.
9. **المتبقي:** تدقيق باقي Customer (addresses/orders/tracking/support/details)، Provider عبر الجسر، Admin dialogs/pages، NVDA/VoiceOver/TalkBack، Firefox/WebKit/Safari، أجهزة فعلية، zoom/reflow وcontrast. لا يوجد ادعاء WCAG.
10. **التالي:** استمرار Phase 5 item 4 بتدقيق بقية Customer flows أولًا، ثم Provider، ثم Admin؛ لا تبدأ backend أو فصل Provider runtime ضمن هذه المهمة.


---

## Handoff — 2026-11-13 Shared Foundation batch

- **الهدف:** تحويل الملفات المشتركة التي كانت تحتوي تعليقات توثيق فقط إلى وحدات فعلية قابلة للاختبار، دون تجاوز Frontend-only.
- **النتيجة:** 16 ملفًا تنفذ الآن: 5 utilities، 3 config، 4 structural contracts، و4 component render primitives.
- **ملفات التنفيذ:** `shared/utils/{dates,errors,formatting,sanitization,validation}.js`; `shared/config/{app-config,routes,feature-flags}.js`; `shared/types/{order,account,provider,permission}.types.js`; `shared/components/{buttons,forms,tables,notification-center}.js`.
- **الاختبارات:** `tests/unit/shared-foundations.test.js` و`tests/unit/shared-components.test.js`; المستهدف 16/16. `npm test` = 165/165.
- **الحدود:** APIs العرض لا تدير state/persistence، ولا يوجد ربط شامل بالمستهلكين. Config/routes/flags ليست أمنًا أو authorization. Validators ليست DB schemas. CSS split placeholders مؤجلة لأن `design-system.css` هو مصدر الحقيقة الحالي.
- **الملفات التي لم تُنفذ:** Customer/Provider page extraction وGuest independent runtime وAdmin auth/router/session وBackend/Database/API scaffolds. Backend/database/services API ممنوعة في Frontend-only حسب `CLAUDE.md`.
- **الجرد:** تم تشغيل `audit:refresh` بعد إنشاء الملفات، ثم تصنيف الملفات المنفذة وتحديث placeholder register (139 → 123). يلزم `audit:inventory` بعد اكتمال التوثيق الحالي.
- **التالي:** دمج تدريجي لمكونات Shared في مستهلك Customer واحد بعد فحص API الحالي واختبارات regression؛ بالتوازي يستمر TASK 04 accessibility حسب ترتيب المشروع. لا تُعلن أن كل الملفات الـ123 قد نُفذت.


---

## Handoff — 2026-11-13 Customer Page Extraction Batch 01

- **Files created:** `apps/customer/pages/home.page.js`, `apps/customer/pages/orders.page.js`, `tests/unit/customer-page-renderers.test.js`.
- **Files modified:** `apps/customer/app.js`, `apps/customer/pages/market-ui.page.js`, `apps/customer/index.html`, `tests/unit/home.test.js`, `tests/unit/discover.test.js`, `tests/unit/customer-workflow.test.js`, plus page catalog/domain map/progress/status/start brief.
- **Contracts:** `HSCustomerHomePage.render(ctx)` is a pure renderer with explicit required dependencies. `HSCustomerOrdersPage.render(ctx)` receives customer/orders/filter and rendering helpers. Both return markup; callers retain state, data, navigation, persistence and events.
- **Script order:** Home module before `app.js`; Orders module after `app.js` and before `market-ui.page.js`.
- **Compatibility:** Existing DOM IDs, data attributes, tab names, filters and event delegation retained. The app boot remains DOMContentLoaded-deferred.
- **Tests:** `tests/unit/customer-page-renderers.test.js` 6/6; `home.test.js` 45 passed; `discover.test.js` 69 passed; `customer-workflow.test.js` 6 passed; full `npm test` 171/171.
- **Next:** extract the tracking/order-details view as a dependency-injected renderer, then provider discovery/details; do not create an independent Provider runtime until the legacy bridge dependencies and behavioral parity are mapped. No Backend/Database/API/Auth work.


### Customer extraction follow-up — Order Details / Tracking

- **Created:** `apps/customer/pages/order-details.page.js`.
- **Modified:** `apps/customer/pages/market-ui.page.js`, `apps/customer/index.html`, `tests/unit/customer-page-renderers.test.js`, `tests/unit/customer-workflow.test.js`, and Customer/page status documentation.
- `HSCustomerOrderDetailsPage.render(ctx)` receives the local MP adapter and render helpers explicitly. Tracking UI markup moved; MP data lookup, workflow state, event handlers and local simulation remain in the existing runtime.
- The module is loaded before `market-ui.page.js`. It preserves `data-act` actions and DOM structure. Added tests cover missing request, searching state/actions, and closed/rating state.
- **Next:** Provider discovery/details extraction; then consider a tested Customer route contract. Do not implement auth/session as if production auth existed.


## 2026-11-13 — Provider standalone frontend implementation

- `apps/provider/index.html` is now a real standalone frontend demo entry. It loads the local market store and provider domain/runtime dependencies in explicit order; it does not load Customer scripts or `legacy/portal-compat.js`.
- `apps/provider/app.js` mounts the Provider shell, chooses seeded demo accounts, routes via hash, renders dedicated pages, and delegates the existing local demo actions. `provider-session.js` remains a demo-only identity selector, not authentication.
- Implemented twelve renderers under `apps/provider/pages/`: dashboard, incoming requests, active jobs, quotes, schedule, reviews, transactions, earnings, profile, services, notifications and request details. Added request detail deep links and expanded route navigation.
- Rebuilt `apps/provider/styles/provider.css` for desktop/mobile shell, navigation, cards, KPIs, profile, tables, forms, notifications and service coverage.
- Kept `apps/provider/legacy/portal-compat.js` and `provider-workspace.js` unchanged for the existing Customer route. Do not remove them until behavior parity is audited. No Backend/Database/API/production Auth work.
- Service Worker cache bumped to `hansalhlak-v8-architecture-5`; Provider entry, CSS and all twelve page modules added to precache.\n- Tests: `tests/unit/provider-pages.test.js` (5 tests); full `npm test` = **179/179**. `npm run audit:inventory` = 349/349, no missing/untracked/hash mismatches. Browser run attempted but local navigation returned `ERR_BLOCKED_BY_ADMINISTRATOR`; do not claim browser verification.
- **Next:** add behavioral tests for Provider request action workflows and deep links, then run keyboard/focus and responsive browser checks.


---

# AGENT HANDOFF — 2026-11-13 — Continuation Maps & Protocol Update

**This section supersedes older "next task" instructions above where they conflict.** Historical execution notes remain for traceability; use `START_HERE.md` for the active next task.

## Purpose
Make the repository self-explanatory when transferred to a new ChatGPT conversation, Claude/Claude Code session, or another human/AI agent. A new agent must know the mandatory read order, frontend-only boundary, source-of-truth rules, Provider architecture, exact next task, test gates, map refresh steps and handoff requirements.

## Canonical protocol created
- `docs/AI_AGENT_CONTINUATION_PROTOCOL.md` — full operational protocol, hard scope boundaries, bootstrap order, implementation loop, ownership rules, Provider architecture, prioritized next tasks, inventory integrity, mandatory handoff template, stop conditions and a copy-ready new-agent prompt.
- `docs/AI_CONTEXT/START_HERE.md` — reduced to the current project reality and one exact next task.
- `docs/AI_CONTEXT/WORKFLOW.md` — now links the mandatory protocol and requires baseline tests.
- `docs/AI_CONTEXT/DOMAIN_MAPS/PROVIDER.md` — replaced the short summary with exact runtime ownership, script dependency order, renderer inventory, demo boundaries, legacy compatibility boundary and P0–P3 queue.
- `apps/provider/README.md` — corrected stale claim that standalone Provider is still scaffold-only.
- `README.md` — corrected Provider/Admin reality and linked existing protocol index.
- `docs/FRONTEND_TEAM_AI_PROTOCOL.md` — now points to the canonical cross-agent protocol.
- `docs/AI_NEXT_IMPLEMENTATION_ORDER.md` and `docs/TESTING_STRATEGY.md` — aligned Provider next tasks and distinguished standalone browser QA from historical legacy-bridge responsive checks.

## Verified baseline before documentation changes
- Command: `npm test`
- Result: **179 passed, 0 failed, 0 skipped** across 49 test files.
- This is the pre-documentation baseline. Documentation edits do not alter runtime, but the suite and inventory must be rerun after this update.

## Current Provider facts
- Standalone entry: `apps/provider/index.html`; script order is deliberate and documented in `docs/AI_CONTEXT/DOMAIN_MAPS/PROVIDER.md`.
- Runtime ownership: `app.js` handles data reads, route/render orchestration, delegated events and local demo mutations; renderers are presentation-only.
- Twelve page renderers exist.
- `MP` is localStorage demo state. `provider-auth.js` is demo account selection. `provider-session.js` is a demo ID pointer, not authentication.
- `legacy/portal-compat.js` and `provider-workspace.js` remain for Customer compatibility and must not be removed before a separate parity audit.
- Standalone Provider browser verification remains pending; historical Responsive Sweep via legacy bridge is not evidence for the standalone entry.

## Exact next implementation task
**P0: Add behavioral tests for Provider actions and deep links before further visual work.**

Target files to inspect first:
- `apps/provider/app.js`
- `apps/provider/provider-router.js`
- `apps/provider/provider-session.js`
- `apps/provider/provider-auth.js`
- `apps/provider/provider-request-domain.js`
- `apps/provider/provider-domain.js`
- `services/local-market-store.js`
- Existing tests: `provider-pages.test.js`, `provider-domain.test.js`, `provider-request-domain.test.js`, `provider-workspace.test.js`.

Acceptance:
1. Cover demo account selection/session clear and isolation.
2. Cover availability toggle.
3. Cover accept/reject including rejection reason.
4. Cover propose/confirm appointment.
5. Cover quote validation and local submission.
6. Cover valid and invalid request status advancement.
7. Cover completion amount/deduction boundaries.
8. Cover supported routes, invalid route fallback, missing/unknown request IDs and refresh/deep-link behavior.
9. Assert mutations remain local and do not call network/API or affect Customer legacy behavior.
10. Add focused behavior tests; do not merely assert source strings.
11. Run targeted tests and full `npm test`.
12. Then accessibility (P1), standalone browser QA (P2), legacy parity audit (P3).

## Scope and finish gate
Frontend only. Do not touch `backend/`, `database/`, production auth/API, payments or real money movement. After changes update docs and run `npm run audit:refresh` then `npm run audit:inventory`. Report browser checks only if actually executed.


---

# AGENT HANDOFF — 2026-11-13 — Provider P0 behavior tests (Claude Code)

**Goal:** P0 from protocol §6 — behavioral coverage of standalone Provider actions and routes.
**Baseline before work:** `npm test` 179/179; `audit:inventory` 353/353, 0/0/0. Git repo initialized locally (`main`).

**Created:** `tests/helpers/provider-app-harness.js`, `tests/unit/provider-app-actions.test.js` (25), `tests/unit/provider-app-routing.test.js` (12), `docs/AI_CONTEXT/EXECUTION_CHECKPOINT.md`.
**Modified:** `apps/provider/app.js`; `service-worker.js` (cache `hansalhlak-v8-architecture-6`, required because `app.js` is precached cache-first); cache literal in `design-system.test.js`, `accessible-tabs-contract.test.js`, `provider-pages.test.js`, `static-audit.test.js`; docs (Provider/Testing maps, START_HERE, implementation order/status, this handoff).

**Defects found by the new tests and fixed in `app.js`:**
1. accept/confirm/reject/propose ignored `MP` returning `false` and showed a success toast on stale views (e.g. offer withdrawn by customer). Now: re-render + `تعذر تنفيذ الإجراء…`, no route change.
2. Reject accepted an empty reason → now required (`select[required]` + runtime check).
3. Propose accepted past times when the input `min` was bypassed → refused.
4. Quote accepted empty/negative amounts when form constraints were bypassed → validated (labor required, all amounts finite and >= 0).
5. Completion let non-finite deductions through → refused.
6. `advance` left the card disappearing from the current group list → now follows the request to its new group (group routes only).

**Preserved:** all `data-pv-*` selectors, routes, storage keys (`hs_mp_db`, `hs_provider_demo_session`), script order, renderer contracts, existing success messages. Legacy `portal-compat.js` / `provider-workspace.js` untouched.

**Tests:** targeted 37/37 (3 repeated runs); `npm test` **216/216**.
**Browser:** headless Edge load smoke only (`--dump-dom`, local `python -m http.server`): Provider shell mounts and picker renders 7 accounts. No interactive, keyboard or viewport QA — Playwright is not installed.
**Open decisions:** zero-total quotes allowed; deep link without session lands on home after account select.
**Next:** Provider P1 accessibility (see `START_HERE.md`).
---

# AGENT HANDOFF — 2026-11-13 — Provider P1 accessibility (Claude Code)

**Goal:** protocol §6 P1 for the standalone Provider app. **Baseline:** `npm test` 216/216 (commit `854e281`).
**Created:** `tests/unit/provider-app-a11y.test.js` (14). **Modified:** `apps/provider/app.js`, `tests/helpers/provider-app-harness.js` (focus tracking, attribute/class selector lookup, `document.title`, `key()`), docs.

**Defects found and fixed:**
1. Every action re-render replaced `innerHTML` and dropped keyboard focus to `<body>` → same-route re-renders now restore focus (availability toggle; request's next step / details control; fallback `#provider-view`).
2. Route changes did not move focus or change `document.title` → focus `#provider-view` (not on initial load) and per-route titles.
3. Opening a second inline form duplicated element ids → previous form removed first.
4. Inline forms had no accessible name; Cancel did not return focus → `aria-label` with request number; Cancel/Escape return focus to the opening control.
5. Validation errors left focus on the submit button → focus first field; message announced via the polite toast.
6. Smooth scrolling ignored `prefers-reduced-motion` → `auto` when reduced.

**Preserved:** selectors, routes, storage keys, messages, script order. Service Worker cache bumped to `hansalhlak-v8-architecture-7` (precached `app.js` changed again; deployment state of the previous commit is unknown) and the four tests pinning it updated.
**Tests:** a11y 14/14, Provider suites 56/56; `npm test` **230/230**.
**Browser:** headless Edge load smoke only (picker + title). No screen reader, keyboard or viewport run.
**Next:** Provider P2 real-browser QA (see `START_HERE.md`).
---

# AGENT HANDOFF — 2026-11-13 — Provider P2 real-browser QA (Claude Code)

**Goal:** protocol §6 P2. **Baseline:** `npm test` 230/230 (`5b25c44`). Playwright not installed; no packages added.
**Created:** `tests/e2e/provider-standalone.cdp.js` — drives Microsoft Edge over the DevTools Protocol with Node's built-in `WebSocket`.
**Modified:** `apps/provider/styles/provider.css`, `apps/provider/index.html`, `tests/unit/provider-pages.test.js` (+2), `service-worker.js` (cache `hansalhlak-v8-architecture-8`) + 4 cache-literal tests, `tests/e2e/README.md`, `.claude/skills/browser-qa/SKILL.md`, docs.

**Defects found in the real browser and fixed:**
1. Every `ic()` icon rendered at container width with a black fill — `provider.css` had no `svg.i` rule (Customer/Admin define it in their own CSS). Added a scoped `.pv-app svg.i` contract using Provider tokens.
2. `.pv-availability` (incl. on-state), `.pv-toast`, `.pv-note`, `.pv-quote` had no CSS; the live toast text stayed in the page flow permanently. Added styles; toast is fixed, hidden with opacity (stays in the a11y tree), respects reduced motion.
3. No favicon link → `/favicon.ico` 404 on every load. Added `assets/icon.svg` link like Customer/Admin.

**Interruption note:** the first P2 run crashed (runner could not find a control because storage isolation silently failed: `Page.navigate` to a fragment-only change does not reload) and then hung because teardown was not in `finally`. The session was cut by a connection loss at that point. Fixed: guaranteed teardown, 180s watchdog, clear-storage + `Page.reload`, soft control lookup that reports on-screen state.

**Tests:** `npm test` **232/232**. Browser: `provider-standalone.cdp.js` **170/170**, run twice, at 1280/768/430/390/320 (real Edge, fonts blocked, fresh profile, SW bypassed). Not covered: WebKit/Firefox, screen readers, Cairo webfont rendering.
**Next:** Service Worker precache completeness (see `START_HERE.md`), then Provider P3 parity audit.
---

# AGENT HANDOFF — 2026-11-13 — Service Worker precache completeness (Claude Code)

**Goal:** close the precache gap recorded in the checkpoint. **Baseline:** `npm test` 232/232 (`b2003ae`).
**Created:** `tests/unit/service-worker-precache.test.js` (5) — derives every local script/stylesheet/icon/image from the Customer and Provider entry HTML and asserts it is precached; no duplicates; no stale paths; Admin boundary explicit.
**Modified:** `service-worker.js` (added `apps/customer/pages/home.page.js`, `orders.page.js`, `order-details.page.js`; cache `hansalhlak-v8-architecture-9`), 4 cache-literal tests, `DOMAIN_MAPS/FRONTEND_RUNTIME.md` (stale Customer order and "Provider has no script chain" corrected; SW contract added), `DOMAIN_MAPS/TESTING.md`, START_HERE, checkpoint.

**Defect and evidence:** the three page scripts extracted in the Customer batch were loaded by `index.html` but never precached. Because the worker does not control the first visit, they were never cached. Real Edge probe (first visit online, then python server stopped, HTTP cache disabled): before the fix the Customer home failed to render offline; after the fix it rendered. Note: CDP offline emulation alone is not sufficient evidence — it does not apply to the worker's own fetches.
**Decision:** Admin is not precached — it has no manifest and never registers the worker.
**Tests:** guard 5/5 (failed 1/5 before the fix on exactly the three files); `npm test` **237/237**.
**Next:** Provider P3 legacy parity audit (see `START_HERE.md`).
---

# AGENT HANDOFF — 2026-11-13 — Provider P3 legacy parity audit (Claude Code)

**Goal:** protocol §6 P3 — evidence and recommendation; no removal. **Baseline:** `npm test` 237/237 (`c137eef`).
**Created:** `docs/archive/PROVIDER_LEGACY_PARITY_AUDIT.md`, `tests/unit/provider-legacy-parity.test.js` (6). **Runtime files unchanged.**

**Findings:**
- Legacy path = `portal-compat.js` (role mode + legacy Provider screen + **legacy Admin console**) and `provider-workspace.js` (replaces `screens.provider`). Entry points: Customer side menu (provider/admin) and home «انضم الآن».
- Request grouping legacy vs standalone: identical across all 105 request × assignment status combinations (executable).
- Same `MP` store (`hs_mp_db`); **separate demo identities** (legacy localStorage `hs_provId` vs standalone sessionStorage `hs_provider_demo_session`).
- Every legacy request action has a standalone equivalent on the same `MP` method; standalone is stricter (P0 fixes not back-ported to legacy).
- Gaps: G1 self-registration, G2 profile edit (disabled by decision), G3 commission preview on completion, G4 `login.html` placeholder.
**Recommendation:** keep both legacy files loaded; implement G3/G4, then G1; record a decision before rerouting Customer entries; legacy Admin console parity is a separate audit.
**Tests:** parity 6/6; `npm test` **243/243**. Browser: not applicable (no UI change).
**Next:** G3 + G4 (see `START_HERE.md`).
---

# AGENT HANDOFF — 2026-11-13 — Provider parity gaps G3 + G4 (Claude Code)

**Goal:** close audit gaps G3 and G4. **Baseline:** `npm test` 243/243 (`7bbe4c8`).
**Modified:** `apps/provider/app.js` (`completionPreview`, `onInput`, `data-rate` + `#pv-complete-preview` in the completion form), `apps/provider/styles/provider.css` (`.pv-calc`), `apps/provider/login.html` (demo hand-off), `tests/helpers/provider-app-harness.js` (`input()`, stable id stubs), `provider-app-actions.test.js` (+1), `provider-pages.test.js` (+1 login, allowlist id), `provider-legacy-parity.test.js` (G3 now closed), `tests/e2e/provider-standalone.cdp.js` (+login hand-off, +typing preview per viewport), `service-worker.js` cache `-10` + 4 cache-literal tests, docs.

**Behavior:** completion form shows platform commission, deductions and net for the typed value using `MP.rateFor(category, provider)` (special rate wins) and `MP.calc`, same as legacy `#finPrev`; invalid deductions show a hint; preview never mutates. `/provider/login` now hands off to the standalone demo picker with a "no real authentication" notice and no credential fields.
**Caught by guards:** the class-coverage test flagged the new `.pv-calc` before its CSS existed.
**Tests:** `npm test` **246/246**. Browser (real Edge, CDP runner): **186/186** at 1280/768/430/390/320, including typing into the completion form.
**Next:** G1 standalone self-registration (see `START_HERE.md`).
---

# AGENT HANDOFF — 2026-11-13 — Provider G1 demo self-registration (Claude Code)

**Goal:** close audit gap G1. **Baseline:** `npm test` 246/246 (`b85425c`).
**Created:** `tests/unit/provider-app-register.test.js` (9).
**Modified:** `apps/provider/app.js`, `apps/provider/styles/provider.css`, `tests/helpers/provider-app-harness.js`, `provider-pages.test.js`, `provider-legacy-parity.test.js`, `tests/e2e/provider-standalone.cdp.js`, `service-worker.js` (cache `-11`) + 4 cache-literal tests, docs.

**Behavior:** the standalone account picker offers "تسجيل مقدم خدمة جديد". The inline form mirrors legacy `providerForm` (name, phone `[0-9+ ]{8,15}`, type, specialties from `SERVICE_TYPES`, governorates from `MP.GOVS`, areas, years, bio, docs) with fieldset/legend groups and a described phone hint; validation also rejects tampered specialties/governorates, years outside 0–60 and bio > 300. Submit → `MP.registerProvider` (pending, admin notified locally) → selects the new demo identity → pending gate. Escape/Cancel return focus to the register control.
**Defects found and fixed along the way:**
1. `.pv-nav{display:flex}` overrode the `hidden` attribute — the workspace nav was visible on the account picker and the pending gate (found from a screenshot; the earlier check read `.hidden`, not rendered style). Fixed with `.pv-app [hidden]{display:none!important}`; CDP now checks computed display.
2. Inline forms scrolled under the sticky top bar/nav — `scroll-margin-top`; CDP now checks occlusion via `elementFromPoint`.
3. Cancel did nothing on the picker (handler sat behind the "provider selected" guard).
4. Harness: form regexes did not match multi-class forms.
**Tests:** `npm test` **256/256**. Browser (real Edge): **231/231** at 1280/768/430/390/320.
**Pending user decision:** reroute Customer Provider entry points to the standalone app.
**Next:** Customer orders/details/tracking keyboard & accessibility (see `START_HERE.md`).
---

# AGENT HANDOFF — 2026-11-13 — Customer Orders/Tracking focus (Claude Code)

**Goal:** Phase 5 item 4 — Customer Orders / Order Details / Tracking keyboard & accessibility. **Baseline:** `npm test` 256/256 (`8e081d9`).
**Created:** `tests/unit/customer-screen-focus.test.js` (9), `tests/e2e/lib/cdp.js` (shared CDP helpers), `tests/e2e/customer-orders.cdp.js`.
**Modified:** `apps/customer/app.js`, `apps/customer/pages/market-ui.page.js`, `tests/e2e/provider-standalone.cdp.js` (now uses `lib/cdp.js`; behavior unchanged, 231/231), `service-worker.js` (cache `-12`) + 4 cache-literal tests, `.claude/skills/browser-qa`, docs (keyboard audit, Customer/Testing maps, order, README, START_HERE, checkpoint).

**Defects and fixes:**
1. Every screen change (except Wizard/Search) left keyboard focus on `<body>` → `show()` restores *lost* focus to a requested control, else the screen heading (`<h2 tabindex="-1">`), else `#view`; never on the boot render.
2. `renderTabs()` (called by `go()` before `show()`) rebuilt `#tabbar` and destroyed the focused tab → it now refocuses the equivalent tab. Found only in the real browser (unit stubs did not rebuild the bar).
3. Orders filter re-render destroyed the pressed filter → `requestFocusAfterShow('[data-order-filter="…"]')`.
4. Timeline had no current-step semantics → exactly one `aria-current="step"`.
**Preserved:** routes, globals (one new: `requestFocusAfterShow`), storage keys, script order, renderer contracts, existing tests (home/wizard/search/sheet).
**Tests:** unit 9/9 (6 fail on the previous code); `npm test` **265/265**. Browser (real Edge): Customer orders **60/60** at 1280/768/390/320; Provider runner re-verified **231/231** after the refactor.
**Next:** Customer Addresses and Support a11y (see `START_HERE.md`).
---

# AGENT HANDOFF — 2026-11-13 — Customer routing, session and guest entry: placeholders → real modules (Claude Code)

**Converted from documentation-only placeholders to real code:** `apps/customer/customer-session.js` (`HSCustomerSession`), `apps/customer/customer-router.js` (`HSCustomerRouter`), `apps/guest/guest-policy.js` (`HSGuestPolicy`), `apps/guest/guest-entry.js` (`HSGuestEntry`), `apps/guest/README.md`.
**Created:** `tests/helpers/customer-app-harness.js` (extracted from the focus test + hash/history/session/hashchange support), `tests/unit/customer-routing-session.test.js` (12).
**Modified (connections):** `apps/customer/index.html` (4 scripts), `app.js` (`show()` URL sync, `openRoute`, `applyEntry`, `afterSignIn`, `hashchange`, session sign-in/out), `account.page.js`, `market-ui.page.js` (`me()`), `request-wizard.page.js`, `service-worker.js` (precache + cache `-13`), 4 cache-literal tests, `customer-screen-focus.test.js` (uses shared harness), `tests/e2e/customer-orders.cdp.js` (+8 deep-link checks), docs.

**Features:** deep links `#/home|sections|search|orders|account`, `#/track/<id>`, `#/provider/<id>`; URL follows the screen; address-bar edits navigate; a guest opening a customer-only link signs in and is returned to it; a customer cannot open another customer's tracking link; one validated session module for every sign-in/out path.
**Regression caught during the batch:** the session first read `globalThis.MP` — `MP` is a top-level `const`, not a global property — so every user looked signed out; fixed before commit.
**Tests:** 12/12 (0/12 against the placeholder files); `npm test` **277/277**. Browser (real Edge): Customer runner **68/68** incl. typed sign-in-and-return.
**Next:** `providers.page.js` extraction + `request-create.page.js` route entry.
---

# AGENT HANDOFF — 2026-11-13 — Customer providers page + request-create route: placeholders → real (Claude Code)

**Converted to real code:** `apps/customer/pages/providers.page.js` (`HSCustomerProvidersPage.card/details/matches`, extracted verbatim from `market-ui.page.js`), `apps/customer/pages/request-create.page.js` (`HSCustomerRequestCreate.resolve/open`).
**Created:** `tests/unit/customer-providers-page.test.js` (6), `tests/unit/customer-request-create.test.js` (6).
**Modified:** `market-ui.page.js` (thin wrappers, global `providerCard` kept), `customer-router.js` (`#/request[/<catalogId>]`, wizard ↔ `#/request`), `guest-policy.js` (request-create public), `app.js` (`openRoute` request-create; `hashchange` uses `event.newURL`), `index.html` (2 scripts), `service-worker.js` (precache + cache `-14`), 4 cache-literal tests, harness (`override`, real `URL`, Chromium-order `navigate`), routing test, Customer CDP runner, docs.

**Evidence:** extraction parity HEAD vs new — 78 renders (7 providers × details/cards ×4 variants, 3 match states, signed in/out), 0 differences. Real Edge: `#/request/<problem>` opens the wizard at «الخطوة 4 من 10» with the problem preselected; `#/provider/<id>` renders details.
**Bug found in the real browser and fixed:** editing the address bar while a stacked screen (wizard) was open landed on home — Chromium fires `popstate` before `hashchange`; the popstate re-render synced `#/home` over the typed link. `hashchange` now reads `event.newURL`; unit test reproduces the browser event order and failed before the fix.
**Tests:** `npm test` **290/290**. Browser: Customer runner **75/75**.
**Next:** Admin placeholders (see `START_HERE.md`).
---

# AGENT HANDOFF — 2026-11-13 — Admin runtime: 7 placeholders → real modules (Claude Code)

**Converted to real code and connected in `apps/admin/index.html`:** `admin-router.js` (extracted from the shell), `navigation-builder.js`, `permission-guard.js`, `admin-auth.js`, `admin-session.js`, `app.js` (bootstrap), `login.html` (hand-off).
**Modified:** `admin-shell.js` (delegates parse/breadcrumbs/nav model; `setAccess`, `canView`, `setAccount`, denied state; auto-mount yields to `HSAdminApp`), `styles/admin-components.css` (picker/account, tokens only — literal count stays 161/163), docs (ADMIN map rewritten, START_HERE, testing, e2e README).
**Created:** `tests/unit/admin-runtime.test.js` (7), `tests/e2e/admin-app.cdp.js`.
**Behavior:** demo account picker (active roster) → shell for that employee; RBAC actor follows the employee; nav hides catalogued pages without `<module>.view`; guarded deep links render a denied state; switch account; session deep links; `/admin/login` hands off. Uncatalogued pages stay open (no invented rule).
**Bug avoided:** first draft called `employeeEffective(roles, emp, overrides)`; actual signature is `(roles, overrides, emp)` — checked before use.
**Tests:** `npm test` **297/297**. Browser (real Edge): Admin **60/60** at 1280/768/390.
**Note:** the older manual Playwright admin scripts now start on the picker.
**Next:** Admin `modules/*` (8).
---

# AGENT HANDOFF — 2026-11-13 — Admin modules/*: 8 placeholders → real modules (Claude Code)

**Converted (extracted from pages, connected in `apps/admin/index.html` before the pages):** `modules/workforce/employee-status.js`, `employee-form.js`, `employee-invitation.js` (from `workforce.page.js`); `modules/audit/audit-filters.js`, `audit-details.js` (from `audit-log.page.js`); `modules/access-control/permission-matrix.js` (from `permissions.page.js`), `role-editor.js` (from `roles.page.js`), `permission-presets.js` (new, derived from seed roles + view-only; wired as «ابدأ من قالب صلاحيات» in the role editor, clamped to the actor's authority).
**Modified:** the 4 pages (now thin over the modules; public `api` objects unchanged), `index.html`, docs. **Created:** `tests/unit/admin-modules.test.js` (8).
**Evidence:** HEAD vs new parity — 42 comparisons (matrix markup, audit grid config, workforce validate/create/update/status/invite incl. errors), 0 differences. Real Edge: preset applied in the real role editor, matrix, audit details, workforce grid — Admin runner **69/69**.
**Tests:** `npm test` **305/305**.
**Result:** no implementable placeholder remains. Deferred: `services/*-api.js`, `realtime-client.js` (backend), split design-system CSS (decision).
**Next:** Customer Addresses + Support a11y.