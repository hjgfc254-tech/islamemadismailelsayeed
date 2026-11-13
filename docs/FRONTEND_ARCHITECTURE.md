# FRONTEND ARCHITECTURE & MODULE BOUNDARIES

## 1. Repository map
- `apps/customer/`: تجربة العميل ونقطة الدخول والصفحات والأنماط.
- `apps/provider/`: تجربة مقدم الخدمة؛ بها توافق قديم وفصل مستهدف.
- `apps/admin/`: هيكل مركز الإدارة وصفحاته المستهدفة.
- `apps/guest/`: حدود تجربة الزائر.
- `shared/components/`: عناصر واجهة مشتركة أو حدود استخراج مستقبلية.
- `shared/design-system/`: CSS design system.
- `shared/icons/`: سجل الأيقونات.
- `shared/config/`: إعدادات وبيانات/مسارات/feature flags بحسب الحالة الفعلية.
- `shared/utils/`: أدوات عامة أو حدود استخراج مستقبلية.
- `shared/types/`: عقود/تعريفات بيانات Frontend وليست database schema.
- `services/`: محولات بيانات محلية أو حدود تكامل مستقبلية؛ تحقق من كل ملف.
- `assets/`: شعارات وأيقونات وصور ثابتة.
- `tests/`: اختبارات الواجهة والمنطق المحلي.

## 2. Current execution model
المشروع يستخدم HTML وCSS وJavaScript، وملفات entry قد تعتمد ترتيب تحميل scripts وواجهات global legacy. لا تغير نمط التحميل أو تنقل التنفيذ إلى modules/build system في مهمة تجميلية. أي ترحيل يجب أن يكون مشروعًا منفصلًا مع inventory للاعتماديات واختبارات regression.

## 3. Dependency rules
- shared code is app-agnostic.
- app pages depend on shared primitives and local feature/data modules.
- data fixtures/local stores do not render DOM.
- rendering modules should not own unrelated persistence.
- avoid circular imports and cross-app direct dependencies.
- legacy bridge dependencies must be mapped before extraction.

## 4. Runtime and DOM contracts
عند تعديل أي ملف قديم، ابحث عن: globals، selectors، IDs/classes، custom events، localStorage keys، IndexedDB database/store names، script load order، window callbacks، delegated event handlers. سجل كل عقد مستخدم من ملفات أخرى قبل إعادة التسمية أو الحذف.

## 5. State ownership
- ephemeral UI state: داخل الصفحة/المكون.
- cross-page demo state: في local store/session module المناسب.
- persistent demo state: localStorage/IndexedDB فقط وفق الاستخدام الحالي.
- derived state: احسبه من المصدر ولا تخزن نسخًا متضاربة.
- لا تضع كل state في global object.

## 6. Local data boundaries
ميّز بين: static fixture، local catalog، local marketplace store، local attachment storage، in-memory UI state. وثق shape/keys/side effects وerror behavior. لا تستحدث network client أو endpoints وهمية على أنها حقيقية.

## 7. Safe extraction procedure
1. احصر الوظائف والselectors/globals في الملف الحالي.
2. احصر كل المستهلكين والاعتماديات.
3. عرّف public interface صغيرًا للملف الجديد.
4. انقل وظيفة واحدة في كل مرة.
5. أبقِ compatibility adapter مؤقتًا إن لزم.
6. شغّل الاختبارات وافحص المسارات المتأثرة يدويًا.
7. احذف القديم فقط بعد إثبات عدم وجود مستهلكين.
8. حدث الخريطة والوثائق.

## 8. Files that require extra caution
- `apps/customer/app.js`: bootstrap/navigation/home behavior may still be concentrated here.
- `apps/customer/pages/market-ui.page.js`: several customer views remain grouped here.
- `apps/provider/provider-workspace.js`: provider runtime is not yet cleanly separated.
- `apps/provider/legacy/portal-compat.js`: compatibility bridge with legacy role behavior.
- `shared/design-system/design-system.css`: shared visual impact across apps.
- `shared/icons/icon-registry.js`: icon rendering contract.
- `services/local-market-store.js` and `services/local-catalog.js`: local demo data behavior.
- `services/local-attachments.js`: IndexedDB and browser storage lifecycle.

## 9. Frontend-only integration seam
إذا احتاجت صفحة مستقبلًا بيانات من Backend، يجب أن تعتمد على interface موثق وليس على تفاصيل الخادم. في المرحلة الحالية استخدم local adapter/fixture. لا تنفذ الاتصال الفعلي ولا تصمم schema.
