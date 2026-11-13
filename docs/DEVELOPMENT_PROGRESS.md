# DEVELOPMENT_PROGRESS — V5 (المرحلة 1 و2)

## V5 — المرحلة 1: الكتالوج الهرمي (منجزة)
- **ملف جديد `catalog.js`**: كائن `CAT` — 7 أقسام ← 71 جهازًا/نوع عمل ← 411 مشكلة، كل عنصر بمعرّف ثابت إنجليزي (`appliances/washer-auto/motor-failure`)، ولكل جهاز قائمة مشكلات مستقلة (الغسالة ≠ الثلاجة ≠ التكييف).
- يحتوي: أسئلة إضافية ديناميكية حسب القسم/الجهاز (`CAT.questionsFor`)، تنبيهات أمان (`safetyFor`)، التخصص المطلوب للفني (`specialty`)، خاصية «تحتاج معاينة»، مرفقات مطلوبة/اختيارية، بحث موحد (`search`)، `valid()` لإبطال الاختيارات غير المتسقة، `breadcrumb()`.
- واجهة إدارة جاهزة في البيانات (لم تُبنَ شاشتها بعد): `upsert/setActive/move/remove/reset`، تُحفظ في `localStorage` (`hs_catalog_v1`) والتعطيل ينعكس فورًا على شاشات العميل.

## V5 — المرحلة 2: رحلة العميل (منجزة)
- **ملف جديد `wizard.js`** يستبدل نموذج الـ4 خطوات: القسم ← الجهاز ← المشكلة ← التفاصيل ← الموقع ← الموعد والتواصل ← المراجعة ← التأكيد (مؤشر تقدم 7 + شاشة تأكيد).
- زر «مش عارف تحدد المشكلة؟ خلي الفني يشخصها» (لا يُجبر على عطل ويتجاوز الوصف الإلزامي).
- Breadcrumb قابل للنقر، تعديل من شاشة المراجعة، زر رجوع المتصفح يعود لخطوة سابقة دون فقد البيانات.
- تغيير القسم يصفّر الجهاز والمشكلة والإجابات؛ تغيير الجهاز يصفّر المشكلة والإجابات؛ الوصف والصور والموقع تبقى.
- الطلب يحفظ لقطة (القسم/الجهاز/المشكلة/الإجابات/التخصص) داخل `market.js › createRequest` حتى لا تتأثر الطلبات القديمة بتعديل الكتالوج.
- شاشة القسم `details` أصبحت قائمة أجهزة (بطاقات) مع بحث داخلي.
- **الملفات المعدلة:** `index.html`, `sw.js` (كاش v5-1), `market.js`, `styles.css` (إضافات في الآخر). **الجديدة:** `catalog.js`, `wizard.js`, `tests/catalog-wizard.test.js`.

## اختبارات (تشغيل: `node tests/catalog-wizard.test.js`) — 91/91 ناجحة
المسارات الستة الإلزامية حتى إرسال الطلب (غسالة أوتوماتيك/عطل موتور، ثلاجة/لا تبرد، لوحة توزيع/القاطع يفصل، حنفيات/تسريب، محرك/صوت غير طبيعي، تنظيف بعد التشطيب)، إعادة الضبط عند تغيير القسم/الجهاز، مسار «الفني يشخصها»، الأسئلة الديناميكية، البحث، تعطيل/إضافة عنصر من الإدارة.

## غير منجز بعد (المراحل 3–7)
- حساب العميل (عناوين محفوظة، مفضلة، إعدادات)، «طلباتي» بالتصفية وإعادة الطلب، تفاصيل الطلب الموسعة.
- بوابة الفني: عرض القسم/الجهاز/المشكلة منفصلة، الجدول، الملف المهني، الأرباح، إشعارات.
- شاشة إدارة الكتالوج في لوحة الإدارة، مركز الإشعارات.
- ربط بحث الصفحة الرئيسية بـ`CAT.search` (يستخدم حاليًا بيانات `data.js` القديمة)، وأيقونات/SVG مستقلة لكل جهاز (حاليًا أيقونة القسم).
- **لم يُجرَّب في متصفح حقيقي**: الاختبارات منطقية بمحاكاة Node فقط؛ يلزم فحص بصري على 320/360/375/390/430px.

---

# DEVELOPMENT_PROGRESS — هنصلحلك (منصة وسيطة)

## 1. الوصف والنموذج التجاري
منصة وسيطة تربط **العميل** بـ**مقدم الخدمة** (7 أقسام: كهرباء، سباكة، نجارة، دهانات، سيارات، تنظيف، أجهزة منزلية).
تُدير الطلب (استلام ← إسناد ← متابعة ← اكتمال ← تقييم) وتحصل **عمولة** = قيمة الخدمة × النسبة. صافي الفني = القيمة − العمولة − الخصومات المعلنة.
التقنية: HTML/CSS/Vanilla JS + localStorage + PWA. **لا Backend** → كل شيء "وضع عرض تجريبي" على جهاز واحد.

## 2. الملفات
**جديدة:** `market.js` (طبقة البيانات MP: الكيانات، المطابقة، الحالات، العمولة) • `market-ui.js` (واجهة العميل: كتالوج، نموذج 4 خطوات، متابعة، تقييم، شكوى) • `portal.js` (بوابة الفني + لوحة الإدارة).
**معدّلة:** `app.js` (الرئيسية، البحث، التبويبات، القائمة، الشرائح، ربط «اطلب متخصصًا») • `data.js` (محتوى الشرائح الثلاث) • `styles.css` (إضافات في آخر الملف فقط) • `index.html` (ترتيب السكربتات) • `sw.js` (كاش v4 + الملفات الجديدة) • `manifest.json` (الوصف).

## 3. ما نُفّذ فعليًا (مختبر بمحاكاة Node: 20 اختبار منطق + رسم كل الشاشات)
- الرئيسية: Hero جديد + زر «اطلب خدمتك الآن» + بحث «بتدور على فني أو خدمة؟» (يبحث في الخدمات والتخصصات والفنيين) + الأقسام السبعة + 3 شرائح تؤدي لوظائف حقيقية + دعوة انضمام الفنيين.
- رحلة العميل: قسم ← أنواع الخدمة ← نموذج متدرج (وصف، حتى 3 صور مضغوطة، فيديو اختياري [الاسم فقط]، محافظة/منطقة/عنوان، موقع بإذن المستخدم، موعد، هاتف) ← ملخص ← «تأكيد وإرسال الطلب».
- المتابعة: 9 حالات حقيقية، إلغاء قبل بدء الخدمة، شكوى، موافقة على موعد مقترح، تأكيد الإتمام، تقييم 5 نجوم + جودة + تعليق.
- الإسناد: تلقائي (تخصص + محافظة + توفر + تقييم + معدل قبول) أو يدوي من الإدارة؛ رفض الفني يعيد الطلب للبحث/إسناد آخر. لا تظهر «تم الإرسال لفني» إلا عند إسناد فعلي (محاكاة موسومة).
- بوابة الفني: تسجيل (يحتاج موافقة الإدارة)، لوحة إحصاءات، قبول/رفض بسبب، اقتراح/تأكيد موعد، تحديث الحالة، تسجيل القيمة النهائية مع معاينة العمولة. **بيانات العميل الحساسة والعنوان التفصيلي لا تظهر قبل القبول.**
- الإدارة: الطلبات (7 فلاتر + إسناد/إلغاء) • مقدمو الخدمة (إضافة/موافقة/رفض/تعليق/تخصصات ومناطق/عمولة خاصة) • العملاء (تعليق/تفعيل) • العمولات (افتراضية + لكل قسم + خاصة + نموذج تحصيل قابل للتغيير + حاسبة + حالة تحصيل لكل معاملة) • التقارير • الشكاوى.
- لا بيانات مالية أو تقييمات أو أرباح مبدئية؛ الفنيون المبدئيون موسومون «(تجريبي)».
- الدخول للوحة الإدارة وبوابة الفني من **القائمة ☰ ← أدوات العرض التجريبي**.

## 4. غير مكتمل / قيد الاستكمال
- لا مصادقة ولا صلاحيات حقيقية (الدخول للأدوار تجريبي).
- رفع الفيديو والمستندات: أسماء فقط.
- الإشعارات للعميل داخل التطبيق فقط؛ للفني/الإدارة تُخزَّن ولا تُعرض في جرس.
- لا دفع إلكتروني؛ التحصيل حالة يدوية.
- جاهزية الربط الخلفي: كل دالة تُنشئ/تغيّر بيانات في `market.js` عليها `@API` أو تقابل endpoint (requests, assignments, transactions…).

## 5. أخطاء معروفة
- لم يُجرَّب على متصفح/جهاز حقيقي (بيئة بلا متصفح): يلزم اختبار بصري لـ RTL والتمرير وبوابة الفني على الجوال.
- كيانات `Commissions` و`ServiceAreas` موجودة كإعدادات/قوائم (`settings`, `serviceAreas`) لا كجداول مستقلة.
- خط Cairo يتطلب إنترنت أول مرة.

## 6. الخطوة التالية
1. اختبار يدوي كامل على الجوال: طلب ← إسناد ← قبول ← موعد ← تنفيذ ← قيمة ← إغلاق ← تقييم، ثم الإدارة والتقارير.
2. إصلاح ما يظهر بصريًا (خصوصًا جداول المعاملات وعناصر النموذج).
3. إشعارات للفني/الإدارة (جرس)، وتصدير تقارير CSV.
4. تصميم واجهة Backend (REST) ثم استبدال `localStorage` داخل `market.js` فقط.

## 7. اختبارات لم تُنفّذ بعد
RTL على iOS/Android • ضغط الصور بحجم تخزين كبير • تثبيت PWA وعمل offline بعد تحديث الكاش • سلوك زر الرجوع داخل الأدوار • حدود localStorage مع طلبات كثيرة.

## 2026-11-08 — Admin shell
- Implemented `apps/admin/admin-shell.js`; wired `apps/admin/index.html`; shell styles in `apps/admin/styles/admin.css`, `admin-components.css`, `admin-responsive.css`; added `tests/unit/admin-shell.test.js`.
- Shared files (`shared/`, customer, provider) were not modified. `package.json` unchanged.
- Remaining: all 23 admin pages are placeholders; shared admin components (forms/dialogs) are placeholders (status-badge: see 2026-11-08 entry below); `admin-router.js`, `navigation-builder.js`, `permission-guard.js`, `admin-session.js`, `admin-auth.js`, `app.js` remain placeholders.

## 2026-11-08 — Admin dashboard page
- Implemented `apps/admin/pages/admin-dashboard.page.js`; added a script tag in `apps/admin/index.html`; page styles appended to `apps/admin/styles/admin-components.css`; new `tests/unit/admin-dashboard.test.js`.
- Decision: KPI details are an inline expandable region (no modal) because `shared/components/dialogs.js` is still a placeholder; the page does not create a shared component.
- Remaining: 21 other admin pages; shared admin components.


## 2026-11-08 — Shared status badge
- Implemented `shared/components/status-badge.js` (`HSStatusBadge`). Added `.hs-badge` styles to `apps/admin/styles/admin-components.css` and a script tag (before `admin-shell.js`) in `apps/admin/index.html`. New `tests/unit/status-badge.test.js`.
- Contract: `render(domain,key,opts)` → HTML string; `element()`; `register(domain,map)` (new domains only); `label/tone/known/domains/keys`. Domains: order (13, identical to `STATUS_LABEL`), provider, quote, collection.
- Not changed: customer/provider/legacy modules (they keep their own `.tag` rendering); no data, storage or global renamed.
- Defect found and fixed during browser testing: `ic` is a top-level `const` (not `window.ic`), so icons were missing until it was resolved by bare name.
- Remaining: `data-grid.js`, forms/dialogs/buttons shared components, then `orders-management.page.js`. Migrating legacy `.tag` status rendering to the badge is a separate, unscheduled task (needs consumer inventory).


## 2026-11-08 — Shared data grid
- Implemented `shared/components/data-grid.js` (`HSDataGrid`). Added `.hs-grid*` styles to `apps/admin/styles/admin-components.css` and a script tag (after `status-badge.js`, before `admin-shell.js`) in `apps/admin/index.html`. New `tests/unit/data-grid.test.js`.
- Contract: `create(host,{caption,columns,rows,filters?,rowActions?,pageSize?,pageSizes?,onRetry?,emptyTitle?,emptyText?})` → `{setRows,setState,reset,getView,getState,destroy}`. Status columns render through `HSStatusBadge` when loaded. Empty values sort last in both directions. Any search/filter/sort/page-size change returns to page 1. Search resets nothing else; sort cycles asc → desc → none.
- Interaction decisions: sorting on narrow screens moves to a «ترتيب» select (headers are visually hidden in card layout); row buttons exist only when `onClick` is supplied; focus is restored after every re-render (sort button, page-size select, search field stay focused).
- Defects found by browser/screenshot review and fixed: (1) card-layout cells were clipped on mobile (missing `box-sizing:border-box`), (2) empty values sorted first in descending order, (3) status-badge icons rendered black — now follow the tone colour. Not caught by the unit tests, so a clipping check was added to the ad hoc browser script.
- Not done: server-side paging/sorting, column resizing/visibility, row selection and bulk actions, virtualisation, export. `tables.js` untouched.
- Remaining: forms/dialogs/buttons shared components, then `orders-management.page.js`.


## 2026-11-08 — Admin orders page
- Implemented `apps/admin/pages/orders-management.page.js`; script tag added to `apps/admin/index.html` after the dashboard page; `.ord*` styles appended to `admin-components.css`; new `tests/unit/orders-management.test.js`.
- Behaviour: 30 deterministic local fixtures; summary counts by group; grid (search, status/category/area filters, sort, pagination, mobile cards); «التفاصيل» opens a native `<dialog>` with facts, status timeline, simulated status change (only `NEXT` transitions), internal notes (max 500 chars). A visible note states changes are local and nobody is notified.
- Decision: details use a page-local `<dialog>` because `shared/components/dialogs.js` is still a placeholder; extracting a shared dialog is a separate task when a second page needs it.
- Defect found in browser testing and fixed: focus was lost after closing the dialog following a simulated change (grid repaint detached the opener) — focus now returns to the same row's button.
- Not done: bulk actions, export, assigning/reassigning a provider, date-range filter, permission-based action hiding.
- Remaining: customers, providers, services, categories pages, then the rest of Phase 4.


## 2026-11-08 — Admin customers page
- Implemented `apps/admin/pages/customers-management.page.js`; script tag added after the orders page in `apps/admin/index.html`; new `tests/unit/customers-management.test.js`. Reuses `HSDataGrid`, `HSStatusBadge` and the `.ord*` dialog/summary styles; registers a new `customer` badge domain (active / inactive / suspended) from the page via the public `register()` (no change to `status-badge.js`).
- Defect found in browser testing and fixed (affected the orders page too): horizontal page overflow at 768–1024px because the `.hs-grid` grid track sized to the table's min-content. Fixed with `.hs-grid{grid-template-columns:minmax(0,1fr)}` plus `min-width:0` on `.ord` in `admin-components.css`.
- Decision: the details dialog is duplicated page-locally (second use). Extract to `shared/components/dialogs.js` before or with the third page that needs it.
- Not done: customer addresses/order links, export, bulk actions, permission-based action hiding.


## 2026-11-09 — Admin finance dashboard
- Verified first: the file was a PLACEHOLDER (no logic), `money.js` also a placeholder, and the previous task (RBAC pages) matched the docs (27/27 tests before this change).
- Implemented `apps/admin/pages/finance-dashboard.page.js` (page `finance`); script tag added before the orders page in `apps/admin/index.html`; `.fin-*` styles appended to `admin-components.css`; new `tests/unit/finance-dashboard.test.js`. Reuses `HSStatusBadge` (new `discrepancy` domain) and the existing `.dash-*` styles; no new shared component.
- Decision: local money formatter (same `ar-EG` + «ج.م» as the admin dashboard) instead of creating `HSMoney` now; extract it with `commissions`/`settlements` so those do not add copies.
- Not done: real data, export, commission rates editing (belongs to `commissions.page.js`), settlement actions (belongs to `settlements.page.js`).


## 2026-11-09 — Shared money util + admin commissions page
- Verified first: `commissions.page.js` and `shared/utils/money.js` were placeholders; the finance dashboard from the previous step was in place (28/28).
- Implemented `shared/utils/money.js` (HSMoney, as recorded in the previous handoff) and migrated the finance dashboard's formatter to it; implemented `apps/admin/pages/commissions.page.js`; script tags added to `apps/admin/index.html`; `.cm-*` styles appended; new `tests/unit/commissions.test.js`.
- Decision: rules edited on the commissions page do not change the finance dashboard numbers (separate local fixtures); a live link needs a recorded decision in `docs/DECISIONS/` before any wiring.
- Not done: rule deletion (intentionally absent), per-order application, export, permission-based hiding of the edit action.


## 2026-11-09 — Admin reports page
- Verified first: restored the ZIP, `npm test` = 65/65 on the received code; `reports.page.js` was a placeholder (no logic); handoff/order/status docs matched the code (settlements, commissions, finance dashboard in place).
- Implemented `apps/admin/pages/reports.page.js` (page `reports`); script tag added after the settlements page in `apps/admin/index.html`; `.rep-*` styles appended to `admin-components.css`; new `tests/unit/reports.test.js`; `frontend-contracts.test.js` updated (script-order list, handoff now points to `audit-log.page.js`, new reports contract test); new optional `tests/e2e/reports.browser.js`.
- Defect found in browser testing and fixed: the `.dash` grid track grew to the table width (page overflow at 768/390px) → `.rep{grid-template-columns:minmax(0,1fr)}`; also added a gap between result cards (`#rep-result` grid).
- Decision: reports are derived from the finance/settlements demo data (no copy); local edits on those pages do not flow in; CSV export only, local; assumptions in `docs/DECISIONS/2026-11-09-reports-demo-assumptions.md`.
- Doc fix: `IMPLEMENTATION_STATUS.md` said 7 placeholder admin pages remained; the real count before this task was 6 (now 5).
- Not done: real data, PDF/Excel export, scheduled/emailed reports, report reuse by the finance dashboard shortcut tile beyond the existing link, permission-based export hiding.


## 2026-11-09 — Admin audit log page
- Verified first: previous deliverable (reports) at 67/67; `audit-log.page.js` was a placeholder.
- Implemented `apps/admin/pages/audit-log.page.js` (page `audit`, read-only); script tag after reports in `index.html`; `.aud*` styles; `tests/unit/audit-log.test.js`; `tests/e2e/audit-log.browser.js` (manual); contract tests updated (script order; handoff now points to `security.page.js`).
- Decision: fixed demo events, no live link to other pages' local logs; assumptions in `docs/DECISIONS/2026-11-09-audit-log-demo-assumptions.md`.
- Not done: export, real event feed, before/after diffs, date-range filter, permission-based visibility.

## 2026-11-09 — Admin security page
- Verified first: baseline 68/68 and inventory clean; `security.page.js` was a 250-byte placeholder (map + source agree), not registered in `index.html`.
- Implemented `apps/admin/pages/security.page.js` (page `security`: alerts / sessions / login attempts, simulated actions with mandatory confirm + reason); script tag after audit-log in `index.html`; `.sec` styles; `tests/unit/security.test.js` (7); `tests/e2e/security.browser.js` (manual); `frontend-contracts.test.js` updated (script order; handoff now points to `system-settings.page.js`). `npm test` = 69/69.
- Decision: fixed demo data, no live link to the audit log or RBAC; assumptions in `docs/DECISIONS/2026-11-09-security-demo-assumptions.md`.
- Not done: real enforcement (needs backend), account lock / address block, escalation recipients, alert thresholds, live feed.

## 2026-11-09 — Admin system settings page
- Verified first: baseline 69/69 and inventory clean; `system-settings.page.js` was a 264-byte placeholder (map + source agree), not registered.
- Implemented `apps/admin/pages/system-settings.page.js` (page `settings`: 12 validated settings, reviewed + reasoned simulated save, restore defaults, local log); script tag after security in `index.html`; `.set*` styles; `tests/unit/system-settings.test.js` (7); `tests/e2e/system-settings.browser.js` (manual); `frontend-contracts.test.js` updated (script order; handoff now points to `quotes-management.page.js`). `npm test` = 70/70.
- Decision: nothing persisted or enforced; ranges/defaults are assumptions in `docs/DECISIONS/2026-11-09-system-settings-demo-assumptions.md`; commission stays in commissions page.
- Not done: persistence, real enforcement, per-setting permissions, live link to other pages, change-log retention.

## 2026-11-09 — Admin quotes management page
- Verified first: baseline 70/70 and inventory clean; `quotes-management.page.js` was a 268-byte placeholder (map + source agree), not registered.
- Implemented `apps/admin/pages/quotes-management.page.js` (page `quotes`; 9 quotes derived from the orders fixtures; simulated approve / return / reject with confirm + reason); script tag after `orders-management.page.js` in `index.html` (it reads that page at load); `.qt` styles; `tests/unit/quotes-management.test.js` (8); `tests/e2e/quotes-management.browser.js` (manual); `frontend-contracts.test.js` updated (script order incl. orders→quotes; handoff now points to `super-dashboard.page.js`). `npm test` = 71/71.
- Found while testing: first draft placed the script before the orders page (would have failed at load) and made both pending quotes expire (alternation counter) — both fixed before the final run.
- Decision: derived data, nothing persisted/notified; assumptions in `docs/DECISIONS/2026-11-09-quotes-demo-assumptions.md`.
- Not done: provider-side resubmission, reasons for derived "returned" quotes, quote line items, live link back to orders.

## 2026-11-10 — Admin owner dashboard (last placeholder admin page)
- Verified first: baseline 71/71 and inventory clean (321 files); `super-dashboard.page.js` was a 264-byte placeholder (map + source agree), not registered; handoff, order file and code agreed on the next task.
- Implemented `apps/admin/pages/super-dashboard.page.js` (page `super-dashboard`; read-only; 8 KPIs, attention list, operating status, platform state, module links — all derived at render time from the implemented pages' state, nothing copied); script tag LAST in `index.html`; `.sd*` styles in `admin-components.css`; `tests/unit/super-dashboard.test.js` (10); `tests/e2e/super-dashboard.browser.js` (manual, passed at 1280/768/390px); `frontend-contracts.test.js` updated (script order, new «every menu item has a registered page» test, handoff test → Phase 5 audit).
- Decision: no data of its own and no controls; the private `_xxx()` accessors are read as a temporary assumption; assumptions in `docs/DECISIONS/2026-11-10-super-dashboard-demo-assumptions.md`. The catalog's «time filters / drill-down» were intentionally not built.
- Found while testing: first contract-test edit produced a JS syntax error (a mis-escaped regex line) that `static-audit.test.js` caught; fixed before the final run. The first e2e server died with the shell call and was restarted.
- Docs updated: handoff, start-here, implementation order, admin domain map, implementation status, test results, placeholder register (140 → 139), page catalog, environment report, testing strategy/map, e2e README, project maps/indexes/tree and hashes.
- Not done: live link through a shared store, time comparison, owner-specific permissions, real data (all need a backend); stale `docs/FRONTEND_FILE_CATALOG.md` left as is (not the reference; noted in the handoff).


## 2026-11-10 — Keyboard navigation improvement
Implemented a shared accessible tabs helper for three Admin tab groups and the Customer guide carousel; improved the non-native dialog fallback to trap keyboard focus and close on Escape. Added roving tabindex, RTL-aware arrow navigation, Home/End activation, tabpanel focusability, regression tests and Service Worker precache integration. Full page-by-page accessibility and browser QA remain open.


## 2026-11-13 — PHASE 5 / TASK 04: Customer Bottom Sheet focus management
- Verified current behavior first: `sheet()` replaced content and toggled `.open`; `closeSheet()` only removed `.open`, cleared `state.sheet` and reset `origin`. `origin` is the problem-list return context used by `openProblem`, not the opener element. Reviewed every `sheet()`/`closeSheet()` consumer in Customer app modules before changing behavior.
- Implemented focus handling in `apps/customer/app.js`: stores the opener only on first open; retains it across in-sheet content transitions; asynchronously focuses the first visible interactive element or the heading; filters controls inside collapsed `<details>`; contains Tab/Shift+Tab; closes on Escape; restores focus on ordinary close; falls back to `#view` when the opener is gone/hidden; isolates sibling app content with `inert` and `aria-hidden`, restoring prior values on close. `closeSheet(true)` retains its route-transition meaning and suppresses focus restoration while navigation proceeds.
- Updated `apps/customer/index.html` with `tabindex="-1"` on the dialog container for the no-focusable-content fallback. No CSS was required. No Provider/Admin/Shared/Service Worker/backend/auth changes.
- Added `tests/e2e/customer-sheet-focus.browser.py`, a manual Chromium + Python Playwright behavior suite. 25/25 checks passed at each of 1280, 768, 390 and 320px (100 assertions): initial focus, heading fallback, Tab/Shift+Tab wrap, forms/multiple controls, Escape, backdrop and action close, restoration/fallback, nested content/back transitions, background inertness, no page errors. The runner inlines local project assets into `about:blank` because browser navigation to local URLs is blocked in this environment; no project dependency was added.
- `npm test`: 149/149 passed (45 test files). `node --test --test-concurrency=1 tests/unit/*.test.js`: 149/149 passed. The previously reported `npm test` timeout was not reproducible here; default `npm test` completed successfully, so no test configuration was changed.
- `HANSALEHLAK_CONTROLLED_FRONTEND_FILE_IMPLEMENTATION_PROTOCOL` was searched for and not found in the repository; no content was invented. Execution followed `CLAUDE.md`, `WORKFLOW.md` and `FRONTEND_TEAM_AI_PROTOCOL.md`.
- Accessibility remains partial: no screen-reader test, no Firefox/WebKit test, and no claim of WCAG conformance. Next: continue the Phase 5 keyboard/accessibility sweep across remaining Customer/Provider/Admin flows.


## 2026-11-13 — PHASE 5 / TASK 04 continuation: Customer home-search keyboard behavior
- Verified the home search combobox was incomplete: it did not synchronize `aria-expanded`, had no active-descendant/selected-option state, did not support ArrowUp/ArrowDown selection, and Enter always submitted the raw query.
- Updated `apps/customer/app.js`: programmatic accessible name; `aria-autocomplete=list`; synchronized listbox expanded state; stable per-render option IDs; ArrowUp/ArrowDown with wrapping; `aria-activedescendant`/`aria-selected`; Enter activates the highlighted suggestion while preserving direct-search Enter when none is active; Escape closes and clears state. Suggestion options are removed from the sequential Tab order. Existing click delegation and `go('search')` behavior remain in place.
- Added `tests/e2e/customer-search-keyboard.browser.py`; Chromium + Python Playwright at 390×844: 14/14 behavior checks passed, no uncaught page errors. No dependency added.
- `npm test`: 149/149 passed. Full four-viewport Customer sheet browser suite rerun is still pending for this continuation; this change is scoped to home search.
- Next: audit Customer Request Wizard keyboard flow, field labels/validation errors, step transitions and focus placement; then continue Customer market/account and Provider/Admin flows.


## 2026-11-13 — PHASE 5 / TASK 04 continuation: Customer keyboard & form accessibility
- Verified the supplied TASK 04 baseline against source and tests: Bottom Sheet focus management and home-search combobox were present; the separate Search screen, Request Wizard validation/focus behavior, carousel tab relationships, and account login labels still had gaps.
- Updated `apps/customer/pages/request-wizard.page.js`: focusable step heading in each wizard state; explicit labels and native required semantics for dynamic questions, address and contact fields; `aria-pressed` state for category/item/problem/date/period choices; accessible group names; inline assertive validation message; first-invalid control focus, `aria-invalid` and `aria-describedby`; stale validation feedback clears when the user edits. Attachment removal controls now identify the file.
- Updated `apps/customer/app.js`: focus current Request Wizard step heading after rendering; explicit `aria-controls`/IDs/label relationships for guide carousel tabs/slides; accessible name for the dedicated Search input.
- Updated `apps/customer/pages/search.page.js`: dedicated Search results now expose listbox/option semantics and ArrowUp/ArrowDown active result navigation, active-descendant/selected state, Enter activation through the existing details flow, and Escape reset. Existing home search flow remains separate.
- Updated `apps/customer/pages/account.page.js`: explicit label associations for login name/phone and preferred contact selection.
- Updated Customer CSS with visually-hidden wizard step headings and visible inline validation feedback.
- Added `tests/e2e/customer-request-wizard-accessibility.browser.py` (24/24 Chromium checks) and expanded `tests/e2e/customer-search-keyboard.browser.py` (28/28 Chromium checks). No project dependency added.
- Verification: `npm test` = 149/149 passed. Bottom Sheet regression = 25/25 at each of 1280/768/390/320px (100 checks). Search/carousel = 28/28; Wizard/account = 24/24. No uncaught JavaScript errors in those browser runs.
- The Node responsive browser runner was attempted but could not start because `playwright` is not installed in Node's module path. Python Playwright + system Chromium were available. Do not mark the responsive runner as passed in this pass.
- Scope is a substantial Customer keyboard/accessibility batch, not completion of Phase 5 item 4. Provider/Admin exhaustive traversal, remaining Customer screens, screen-reader testing, Firefox/WebKit/Safari, and real-device testing remain open. No WCAG conformance claim.


---

## 2026-11-13 — Shared Foundation: تنفيذ ملفات كانت توثيقًا فقط

تم فحص سجل `docs/EMPTY_PLACEHOLDERS.md` مقابل محتوى الملفات الفعلي، ثم تنفيذ 16 ملفًا كانت تحتوي تعليقات Placeholder فقط:

- **Utilities:** `dates.js`, `errors.js`, `formatting.js`, `sanitization.js`, `validation.js`.
- **Configuration:** `app-config.js`, `routes.js`, `feature-flags.js` (إعدادات واجهة عامة فقط؛ لا أسرار ولا صلاحيات).
- **Runtime contracts:** `order.types.js`, `account.types.js`, `provider.types.js`, `permission.types.js` (تحقق بنيوي لبيانات Demo؛ ليست مخططات قاعدة بيانات أو حدود ثقة).
- **Shared render primitives:** `buttons.js`, `forms.js`, `tables.js`, `notification-center.js`. المكونات مولدات عرض/HTML؛ لا تدير حالة التطبيق أو التخزين ولا تُعتبر موصولة بكل الصفحات بعد.

أضيف اختباران: `tests/unit/shared-foundations.test.js` و`tests/unit/shared-components.test.js`، بعدد 16 assertion groups. الاختبارات المستهدفة 16/16، و`npm test` = 165/165 دون فشل.

تم تحديث سجل الـ placeholders من 139 إلى 123 بعد تنفيذ الملفات الستة عشر. لم يتم تعديل `backend/` أو `database/` أو `services/*-api.js` لأن المشروع ما زال Frontend-only ولا يوجد Backend/API contract معتمد. لم يتم استخراج ملفات التصميم المنفصلة من `design-system.css` لأن المصدر الحالي حي ومحمّل؛ إنشاء نسخ CSS مكررة دون خطة ترحيل سيخلق مصدرين للحقيقة.

**الحدود:** الملفات المشتركة أصبحت ذات وظائف واختبارات، لكنها لم تُربط تلقائيًا بكل التطبيقات؛ الربط يحتاج مهام تكامل مستقلة واختبارات للمستهلكين. لم يُدّعَ اكتمال أي صفحة Provider مستقلة أو Customer extraction أو Backend.


## 2026-11-13 — Customer Page Extraction Batch 01

تم فصل صفحتي الرئيسية العميل وطلباتي إلى render modules مستقلة، دون نقل مصادر البيانات أو تغيير منطق الأحداث القديم:

- `apps/customer/pages/home.page.js`: renderer مستقل بحقن dependencies صريح. نقلنا تركيب الصفحة (greeting/draft/hero/search/quick actions/active requests/tiles/common problems/recent/addresses/favorites/discover/service areas/provider CTA) من `screens.home` في `app.js`. بقيت مصادر البيانات، منطق carousel، keyboard search، navigation والتفاعل داخل app runtime كما هي.
- `apps/customer/pages/orders.page.js`: renderer مستقل يستقبل customer/orders/filter ومساعدات العرض. نقلنا حالات الزائر/الفراغ، تقسيم الطلبات حسب الحالة، filter bar، empty filtered state، وترتيب الأحدث أولًا من `market-ui.page.js`. بقيت قراءة MP وإدارة filter state ومعالج النقر في `market-ui.page.js`.
- ترتيب التحميل: `home.page.js` قبل `app.js`، و`orders.page.js` بعد `app.js` وقبل `market-ui.page.js`.
- لا يوجد backend/auth/API؛ البيانات لا تزال محلية وتجريبية.
- الاختبارات الجديدة `tests/unit/customer-page-renderers.test.js` (6/6). تم تحديث VM harnesses في `home.test.js` و`discover.test.js` لتطابق ترتيب التحميل الحقيقي، وتم تحديث `customer-workflow.test.js` ليقرأ عقد الطلبات من الملف المستقل.
- **Full suite:** `npm test` = 171/171، 0 failures.

**ما لم يُفصل بعد:** tracking/order details, provider discovery/details, match/quotes, and request-create route wrapper. لا نعتبر Customer app مستقلاً بالكامل بعد؛ هذه دفعة استخراج محدودة ومثبتة.


### Customer Page Extraction Batch 01 — تكملة تفاصيل الطلب

تم استخراج `tracking(id)` من `market-ui.page.js` إلى `apps/customer/pages/order-details.page.js` باسم `HSCustomerOrderDetailsPage.render(ctx)`. نُقلت واجهة الحالة الحالية، الخطوة التالية، مقدم الخدمة/البحث، عرض السعر، الموعد المقترح، ملخص الطلب، أزرار الإجراءات، وشريط المحاكاة. بقيت قراءات MP والأحداث وتغييرات الحالة في `market-ui.page.js`، لذلك لا يوجد تغيير في حدود الثقة أو سلوك الإنتاج. أضيفت 3 اختبارات: الطلب غير الموجود، حالة البحث والإجراءات المحلية، وحالة الإغلاق والتقييم. إجمالي اختبارات الصفحة الآن 9/9.


## 2026-11-13 — Provider standalone frontend batch

- Activated `apps/provider/index.html` as a standalone frontend demo entry with explicit local script dependency order; it no longer requires Customer shell scripts or the legacy portal bridge.
- Replaced the Provider page stubs with twelve actual dependency-injected renderers: dashboard, incoming requests, active jobs, quotes, schedule, reviews, transactions, earnings, profile, services/coverage, notifications and request details.
- Refactored `apps/provider/app.js` to dispatch to those page renderers while retaining the existing MP local demo mutations and event handling. Added deep-link request details and expanded Provider navigation.
- Rebuilt `apps/provider/styles/provider.css` with responsive shell, navigation, KPI, request, profile, forms, table, notification and coverage styles.
- Kept the legacy customer-integrated Provider workspace and portal bridge untouched. No Backend, Database, API or production authentication work was performed.
- Service Worker cache bumped to `hansalhlak-v8-architecture-5`; standalone Provider entry, stylesheet and all twelve page modules added to precache.\n- Validation: `npm test` — 179/179 passed. Static local browser navigation was attempted but blocked by the execution environment (`ERR_BLOCKED_BY_ADMINISTRATOR`), so no browser-pass claim is made.


## 2026-11-13 — Cross-agent continuation maps and protocol

- Created `docs/AI_AGENT_CONTINUATION_PROTOCOL.md` as the canonical handoff contract for ChatGPT, Claude/Claude Code and other contributors.
- Rewrote `docs/AI_CONTEXT/START_HERE.md` as a compact, current entrypoint with the mandatory read order, verified project reality and one exact next task.
- Expanded `docs/AI_CONTEXT/DOMAIN_MAPS/PROVIDER.md` with exact script order, file ownership, renderer list, demo-only boundaries, legacy bridge constraints and P0–P3 queue.
- Corrected stale `apps/provider/README.md` and root `README.md` statements that implied the standalone Provider runtime was still only a scaffold.
- Aligned `WORKFLOW.md`, `FRONTEND_TEAM_AI_PROTOCOL.md`, `AI_NEXT_IMPLEMENTATION_ORDER.md`, `TESTING_STRATEGY.md`, `IMPLEMENTATION_STATUS.md` and `HANDOFF_NEXT_AI.md`.
- Baseline before documentation changes: `npm test` 179/179. After changes: `npm test` 179/179.
- Inventory: `npm run audit:refresh` and `npm run audit:inventory` → 350/350, 0 missing, 0 untracked, 0 SHA-256 mismatches.
- Next: Provider P0 behavioral tests for request actions and deep-link workflows. No runtime code or backend/database/API/auth implementation was changed.
