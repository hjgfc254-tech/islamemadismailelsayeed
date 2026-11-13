# FRONTEND IMPLEMENTATION ORDER — HANSALEHLAK V8

## بوابة بيئة العمل (تم تجهيزها)
- اقرأ `CLAUDE.md` ثم `docs/AI_CONTEXT/START_HERE.md`.
- استخدم خرائط المجال والفهرس المختصر بدل قراءة كل التوثيق.
- شغّل `npm run audit:inventory` بعد أي تغيير في الملفات/التوثيق.
- لا تبدأ صفحة جديدة قبل فحص حالة الكود والاختبارات.

هذه قائمة ترتيب عمل واجهات فقط. لا تنفذ Backend/Database/API/Auth في هذه المرحلة.

## المرحلة 0 — توحيد الأساس
1. اقرأ Frontend Master وملفات الكتالوج.
2. تحقق من entry points والـ script order والـ legacy globals.
3. ثبت design tokens الحالية واستخرج inventory للقيم المتكررة/المتناقضة.
4. ✅ **منجز جزئيًا (2026-11-13):** تم تنفيذ 16 ملف Shared كانت توثيقًا فقط (utilities/config/types/render primitives) واختبارها. لا تزال غير موصولة بكل الصفحات؛ المطلوب لاحقًا دمج تدريجي بعقود واختبارات. تبقى CSS extraction files مؤجلة حتى اعتماد خطة ترحيل تمنع ازدواج مصدر التصميم.

### Shared Foundation follow-through (بعد تأسيس الملفات)
1. ربط utilities بمستهلك واحد في كل مرة بعد مقارنة السلوك القديم واختبارات parity.
2. دمج buttons/forms/tables/notification-center في صفحة واحدة تجريبية ثم توسيع الاستخدام بعد regression.
3. عدم تحويل `routes.js` إلى router قبل فحص deep links وlegacy navigation.
4. عدم استخدام permission contracts كبديل عن backend authorization.

## المرحلة 1 — تثبيت تجربة العميل
1. اختبار كامل للصفحة الرئيسية والاكتشاف والبحث.
2. تدقيق Request Wizard: الخطوات، validation، draft، attachments، review.
3. تدقيق السوق/طلبات العميل/تفاصيل الطلب والتتبع.
4. تدقيق الحساب والعناوين والدعم.
5. توحيد حالات التحميل/الفراغ/الخطأ/النجاح.
6. إصلاح responsive وRTL والوصولية دون تغيير غير مطلوب للهوية.

## المرحلة 2 — فصل وحدات العميل تدريجيًا
1. فصل home rendering من app.js بعد حصر العقود.
2. فصل orders/order-details/providers من market-ui.page.js بوظيفة واحدة في كل مرة.
3. تنفيذ router/session boundaries فقط كسلوك Frontend تجريبي واضح.
4. تحديث اختبارات regression بعد كل خطوة.

## المرحلة 3 — مقدم الخدمة
1. رسم runtime الحالي وتوثيق portal compatibility bridge.
2. تثبيت smoke tests لمسار المزود القديم.
3. اعتماد provider shell/navigation/route contract.
4. فصل dashboard ثم incoming requests ثم details/quotes/jobs تدريجيًا.
5. استكمال schedule/services/profile/reviews/notifications/earnings/transactions ببيانات fixtures محلية.
6. لا تحذف legacy bridge قبل إثبات التكافؤ.

## المرحلة 4 — مركز الإدارة (Frontend فقط)
1. ✅ **منجز (2026-11-08)** اعتماد shell وsidebar/header/breadcrumbs/mobile drawer — `apps/admin/admin-shell.js`.
2. تنفيذ shared admin components: buttons, forms, dialogs, tables/data-grid, status badges. — ✅ `status-badge.js` و`data-grid.js` منجزان (2026-11-08)؛ ✅ كل المكونات المشتركة اللازمة للصفحات جاهزة (dialogs.js منجز؛ forms/buttons المشتركة ما زالت Placeholders وتُستخدم أنماط `adm-*` الحالية).
3. بناء dashboard ثم workforce/departments/roles/permissions كواجهات تجريبية. — ✅ dashboard منجز (`admin-dashboard.page.js`)؛ ✅ workforce منجز (`workforce.page.js`، 2026-11-08)؛ ✅ departments منجز (`departments.page.js` + `shared/utils/tree.js`، 2026-11-08)؛ ✅ roles وpermissions وemployee-details منجزة (2026-11-08، مع `apps/admin/rbac-store.js` ملف جديد) — البند 3 مكتمل ضمن العرض التجريبي.
4. بناء الطلبات/العملاء/المزودين/الخدمات/التصنيفات. — ✅ الطلبات والعملاء منجزان (`orders-management.page.js`, `customers-management.page.js`, 2026-11-08)؛ ✅ المزودون منجز (`providers-management.page.js` + `shared/components/dialogs.js`، 2026-11-08)؛ ✅ الخدمات منجزة (`services-management.page.js`، 2026-11-08)؛ ✅ التصنيفات منجزة (`categories-management.page.js`، 2026-11-08) — البند 4 مكتمل.
5. بناء الشكاوى/التقييمات/الإشعارات. ✅ الشكاوى منجزة (`complaints-management.page.js`، 2026-11-08)؛ ✅ التقييمات منجزة (`reviews-management.page.js`، 2026-11-08)؛ ✅ الإشعارات منجزة جزئيًا (`notifications-management.page.js`: القوالب + سجل إرسال تجريبي للقراءة فقط؛ الحملات والجدولة والإرسال غير منفذة، 2026-11-08) — البند 5 مكتمل ضمن نطاق العرض التجريبي. (البنود 6 وما بعده استُكملت لاحقًا — انظر أدناه.)
6. بناء finance/commissions/settlements/reports كعرض بيانات تجريبية. ✅ `finance-dashboard.page.js` منجز (2026-11-09). ✅ `commissions.page.js` منجز (2026-11-09، مع `shared/utils/money.js`). ✅ `settlements.page.js` منجز (2026-11-09، محاكاة محلية بلا تحويل مالي). ✅ `reports.page.js` منجز (2026-11-09، عرض بيانات تجريبية + تصدير CSV محلي) — البند 6 مكتمل. البند 7: ✅ `audit-log.page.js` منجز (2026-11-09، عرض للقراءة فقط). ✅ `security.page.js` منجز (2026-11-09، تنبيهات/جلسات/محاولات دخول بمحاكاة محلية بلا إنفاذ). ✅ `system-settings.page.js` منجز (2026-11-09، إعدادات محاكاة محلية بلا حفظ ولا أثر) — البند 7 مكتمل. ✅ `quotes-management.page.js` منجز (2026-11-09، عروض مشتقة من الطلبات وقرارات محاكاة).
7. بناء audit/security/settings كواجهات عرض/محاكاة فقط، مع توضيح عدم وجود enforcement حقيقي.
8. ✅ `super-dashboard.page.js` منجز (2026-11-10، لوحة المالك للقراءة فقط مشتقة من الصفحات المنفذة) — **المرحلة 4 مكتملة ضمن العرض التجريبي**: كل عناصر قائمة الإدارة لها صفحة مسجّلة.

## المرحلة 5 — توحيد التجربة والجودة
1. ✅ **منجز (2026-11-10)** — تدقيق نظام التصميم عبر التطبيقات: `docs/DESIGN_SYSTEM_AUDIT.md` + `tests/helpers/design-token-audit.js` + `tests/unit/design-token-audit.test.js`. تم تأكيد `shared/design-system/design-system.css` كمصدر tokens الفعلي، وجرد 5 ملفات CSS. خط أساس Admin = 163 قيمة حرفية؛ اختبار الحارس يمنع الزيادة. لم تتغير CSS الإنتاجية.
2. ✅ **منجز (2026-11-10)** — Icon and Asset Audit: `docs/ICON_ASSET_AUDIT.md` + `tests/unit/icon-asset-audit.test.js`. تم فحص 188 تعريفًا و23 alias و6 أصول. إصلاح مرجع ديناميكي مفقود `inbox` في مساحة المزود؛ رُفع إصدار Service Worker cache إلى `hansalhlak-v8-architecture-2`. لا حذف أصول.
3. ✅ **منجز (2026-11-13)** — Responsive browser sweep: فحص Chromium/Playwright لـCustomer وProvider (عبر الجسر) وAdmin (كل الصفحات) عند 1280/768/390/320؛ 5 عيوب أُصلحت بجذورها مع اختبارات Regression (`tests/unit/responsive-sweep-regression.test.js`, `tests/e2e/responsive-sweep.browser.js`). لم يُتحقق من خط Cairo (محجوب) ولا WebKit/Firefox. التقرير: `docs/RESPONSIVE_AUDIT.md`.
4. 🟡 **قيد التنفيذ (2026-11-13)** — Keyboard & Accessibility Sweep: أُنجز Bottom Sheet focus management (25 Chromium checks لكل 1280/768/390/320)، home + dedicated Search keyboard/ARIA، carousel tab relationships، Request Wizard step focus + validation announcement/first-invalid focus + labels/required semantics، وإصلاح labels في Account. النتائج الحالية: search/carousel 28/28، Wizard/account 24/24، Bottom Sheet regression 100/100. هذا لا يغلق التدقيق الشامل. التالي: تدقيق بقية Customer flows (addresses/orders/tracking/support/details)، ثم Provider عبر legacy bridge، ثم Admin page/dialog keyboard traversal، مع اختبار قارئات الشاشة والمتصفحات الإضافية عندما تتاح.
5. console/network smoke checks.
6. تحديث docs وAI_PROJECT_MAP بعد كل batch.

## قاعدة ترتيب الأولوية
الأولوية = تأثير المستخدم × عدد الصفحات المتأثرة × خطورة regression، مع تقديم إصلاح العوائق على إضافة صفحات جديدة. لا تبدأ لوحة الإدارة كاملة قبل تثبيت shell والمكونات المشتركة.


## حالة التقدم الحالية
انظر `docs/HANDOFF_NEXT_AI.md` للملف التالي وطريقة المتابعة.

### Accessibility progress note — 2026-11-13
A focused shared keyboard-tabs helper is now implemented and tested: `shared/components/accessible-tabs.js`. It is wired to Admin Notifications/Permissions/Security and the Customer guide carousel. This is a useful subtask within Phase 5 item 4, but it does **not** close the full keyboard/accessibility sweep. See `docs/KEYBOARD_ACCESSIBILITY_AUDIT.md`.


### TASK 04 — Customer Bottom Sheet focus management (2026-11-13)
- Implemented in `apps/customer/app.js`; `apps/customer/index.html` adds `tabindex=-1` to the dialog container. No CSS, Provider, Admin, Shared Design System, Service Worker, backend or auth changes.
- `origin` remains the problem-list return context; the invoking element is stored separately. Existing in-sheet transitions preserve the original opener.
- Chromium/Playwright browser checks: 25/25 at each of 1280/768/390/320px (100 assertions total). Manual script: `tests/e2e/customer-sheet-focus.browser.py`; uses the environment Python Playwright install and inlines project assets into `about:blank` because direct local navigation is blocked.
- `npm test` and serial Node test run both pass 149 tests. Previous reported timeout was not reproducible; no test concurrency/config changes were made.
- Remaining: full accessibility sweep, screen-reader verification, Firefox/WebKit.


## تحديث 2026-11-13 — Provider standalone frontend

- أُنجز standalone demo entry/runtime والـ shell/router و12 renderer. هذا لا يثبت تكافؤ legacy bridge ولا يبرر حذف `portal-compat.js` أو `provider-workspace.js`.
- **P0 التالي:** اختبارات سلوكية لأفعال الطلبات ومسارات deep-link في `apps/provider/app.js` و`provider-router.js` و`provider-session.js`، مع تغطية الحدود والحالات غير الصالحة. ابدأ بقراءة `docs/AI_CONTEXT/DOMAIN_MAPS/PROVIDER.md`.
- **P1:** keyboard/focus/accessibility sweep للـ Provider standalone.
- **P2:** Browser QA للـ Provider standalone عند 1280/768/430/390/320px؛ لا تستخدم نتيجة Responsive Sweep القديمة عبر legacy bridge كدليل على standalone.
- **P3:** parity audit منفصل لـ`legacy/portal-compat.js` و`provider-workspace.js` قبل أي إزالة أو دمج.
- البروتوكول الإلزامي لاستلام أي وكيل جديد: `docs/AI_AGENT_CONTINUATION_PROTOCOL.md`.
