> **Historical — frontend-only phase (2026-11-13/19).** This document describes the platform before it went live on Firebase. The real backend, payments, catalogue, call centre and security model are in `docs/MAINTENANCE_GUIDE.md`, and the current state is in `docs/AI_CONTEXT/START_HERE.md`. Source code wins over this file.

# FRONTEND COMPONENT CATALOG

## 1. الغرض
توحيد العناصر المشتركة ومنع تكرار تنفيذ الأزرار والنوافذ والجداول والتنبيهات. هذا فهرس للعناصر الموجودة/المخططة، وليس تصريحًا بأن كل ملف Placeholder يحتوي component جاهزًا.

## 2. المكونات المشتركة المرصودة

| المكوّن/المجموعة | الملف | المسؤولية | متطلبات التوثيق والاختبار | الحالة حسب الجرد |
|---|---|---|---|---|
| UI Kit | `shared/components/ui-kit.js` | حالات التحميل والهيكل العظمي والفراغ والخطأ والنجاح/offline وtoast/confirm | variants، النصوص، إغلاق، focus، aria-live، عدم تكرار الرسائل | منفذ |
| Icon Registry | `shared/icons/icon-registry.js` | مصدر الأيقونات وطريقة إنتاج SVG/HTML | أسماء الرموز، fallback، أحجام، ألوان، accessibility، منع SVG غير موثوق | منفذ |
| Buttons | `shared/components/buttons.js` | مولّد HTML دلالي للأزرار؛ السلوك يملكه المستهلك | variants/sizes/type/loading/disabled/label escaping | Implemented (render primitive; not yet wired globally) |
| Dialogs | `shared/components/dialogs.js` | dialog/confirmation/sheet | focus trap، Escape، restore focus، scroll lock، mobile layout | Implemented — verify actual APIs before reuse |
| Forms | `shared/components/forms.js` | مولدات حقول مرتبطة بالتسمية والوصف والخطأ | label association، hint/error IDs، required، input types، escaping | Implemented (field primitives; not yet wired globally) |
| Data Grid | `shared/components/data-grid.js` | جداول/قوائم بيانات كثيفة للإدارة | sorting/filtering/pagination states، mobile alternative، empty | Implemented (demo) — `HSDataGrid` |
| Tables | `shared/components/tables.js` | جدول HTML دلالي لبيانات الذاكرة | headers, empty state, escaped cells, caller-trusted render callback | Implemented (render primitive; not yet wired globally) |
| Status Badge | `shared/components/status-badge.js` | تمثيل حالة الطلب/الحساب | mapping مركزي، نص + لون، unknown status fallback | Implemented (demo) — `HSStatusBadge`; domains: order, provider, quote, collection |
| Notification Center | `shared/components/notification-center.js` | عرض قائمة إشعارات محلية مع إجراء تحديد كمقروء اختياري | read/unread, empty state, escaped content, delegated callback binding | Implemented (presentation primitive; caller owns persistence) |

## 3. عقود المكونات

### Button
- مدخلات موثقة: `variant`, `size`, `disabled`, `loading`, `type`, `leadingIcon`, `trailingIcon`, `accessibleLabel`.
- الحالات: default, hover, focus-visible, active, disabled, loading.
- loading يمنع تكرار التفعيل ويحتفظ بعرض مفهوم.
- لا يستخدم `<a>` لإجراء محلي ولا `<button>` للتنقل إلى URL إذا كان رابطًا حقيقيًا.

### Dialog / Modal
- له عنوان واضح وسبب فتح مفهوم.
- يدعم إغلاقًا صريحًا، وEscape إن لم يكن الإغلاق سيؤدي لفقد غير مقصود.
- عند الفتح ينقل التركيز للداخل، وعند الإغلاق يعيده للمشغل.
- على الهاتف يتحول إلى نمط sheet/full-screen وفق مساحة المحتوى دون قص.

### Form Field
- label ظاهر ومربوط بالعنصر.
- وصف وخطأ بعلاقات `aria-describedby`.
- الخطأ يشرح طريقة التصحيح ولا يعتمد على اللون فقط.
- قيمة الحقل لا تضيع بسبب validation failure.

### Status Badge
- كل status key له label عربي موحد وtone/variant.
- حالة غير معروفة لا تكسر الواجهة؛ تعرض label محايدًا.
- لا تستخدم اللون وحده دون نص.

### Toast / Notification
- لا تظهر معلومات حساسة في التنبيه.
- مدة الظهور تناسب طول النص، مع إمكانية الإغلاق.
- رسائل النجاح لا تستخدم لعملية لم تحدث فعليًا.

## 4. سياسة إنشاء مكون جديد
1. ابحث في الملفات الموجودة عن تنفيذ مماثل.
2. حدد التطبيقات المستهلكة وحالات الاستخدام.
3. افصل presentation عن business/page flow.
4. صمم API صغيرًا واضحًا ولا تمرر global state بلا ضرورة.
5. أضف حالات واختبارات الوصولية والاستجابة.
6. وثق مثال استخدام واحدًا على الأقل.
7. حدّث الخريطة ولا تترك تنفيذين متنافسين.

## 5. مكونات خاصة بالتطبيق
المكوّن الخاص بتطبيق واحد يبقى داخل `apps/<app>/` ما لم يوجد استخدام حقيقي متكرر في تطبيق آخر. لا تنقل كل شيء إلى `shared/` لمجرد التوحيد الشكلي.
