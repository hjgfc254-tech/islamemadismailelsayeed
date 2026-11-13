# FRONTEND DESIGN SYSTEM — HANSALEHLAK

## 1. مصدر الحقيقة
- CSS الحالي الأساسي: `shared/design-system/design-system.css`.
- أنماط العميل: `apps/customer/styles/customer.css`.
- أنماط المزود: `apps/provider/styles/provider.css` (حالة الملف حسب الخريطة).
- أنماط الإدارة: `apps/admin/styles/` (حدود مستقبلية/Placeholder حسب الجرد).
- الأصول: `assets/`، إضافة إلى أي صور/أيقونات مضمنة في الصفحات بعد التحقق.

لا تخترع قيمًا رقمية في هذا المستند. عند توثيق token، استخرج القيمة الفعلية من CSS واذكر الملف والسطر/المحدد. إذا لم يُحسم token، اكتب `TBD` ولا تنشئ قيمة بديلة سرًا.

## 2. جرد ما يجب توثيقه من tokens
| المجموعة | ما يجب حصره | قواعد الاستخدام |
|---|---|---|
| Color | brand, accent, text, surface, background, border, success, warning, danger, info | دلالات ثابتة، contrast، لا لون منفرد للحالة |
| Typography | font family, weights, sizes, line heights | scale موحد للعناوين والنصوص والأرقام |
| Spacing | page gutters, section gaps, component gaps | استخدام scale بدل قيم متفرقة |
| Radius | control/card/dialog/pill | لا تخلط أشكالًا غير متسقة |
| Elevation | shadows/layers | الظل يحدد العمق لا الزخرفة |
| Layout | container widths, columns, header/sidebar | نفس قواعد المحاذاة بين الصفحات |
| Motion | duration/easing/transitions | قصير وهادف مع reduced-motion |
| Z-index | overlay, dropdown, sticky header, toast | طبقات مركزية لا أرقام عشوائية |
| Iconography | registry, stroke/fill, size | وزن بصري موحد واسم accessible |

## 3. قواعد RTL والعربية
- استخدم خصائص CSS المنطقية (`margin-inline`, `padding-inline`, `inset-inline`) حيث يمكن.
- لا تفترض أن كل المحتوى RTL؛ البريد الإلكتروني، الروابط، أرقام الهواتف، الأكواد والمعرفات قد تحتاج اتجاهًا محايدًا أو LTR.
- الأرقام والأسعار والتواريخ يجب اختبارها في النص العربي المختلط.
- محاذاة الأيقونة والنص والمسافة بينهما يجب أن تنعكس بشكل صحيح.
- لا تعكس الأيقونات غير الاتجاهية؛ عكس السهم/الرجوع فقط عند معنى الاتجاه.

## 4. Typography
- حدد خط عربي أساسي وfallback متاحًا على أنظمة المستخدمين.
- لا تستخدم وزنًا غير موجود فعليًا في ملفات الخط.
- راقب line-height للنص العربي وعلامات التشكيل.
- لا تجعل النصوص الثانوية صغيرة لدرجة صعوبة القراءة على الهاتف.
- العناوين الطويلة يجب أن تلتف دون أن تكسر الأزرار أو البطاقات.

## 5. Responsive layout
اختبر عند 360، 390، 768، 1024، 1440px. لكل مكوّن حدد هل يتغير عدد الأعمدة أو الترتيب أو طريقة التفاعل. لا تعتمد على breakpoint واحد لكل شيء إذا اختلف المحتوى.

## 6. الأصول والصور
- احتفظ بأصول الشعار الأصلية ولا تعِد رسمها نصيًا داخل CSS.
- حدد أبعاد الصور ونسبة العرض/الارتفاع و`object-fit` المناسب.
- وفر alt للنمط المعلوماتي، وalt فارغ للزخرفي.
- ضع fallback عند فشل التحميل.
- راقب الحجم والأبعاد الفعلية قبل إضافة صور كبيرة.

## 7. الأيقونات
- استخدم `shared/icons/icon-registry.js` كمرجع أول.
- لا تستخدم emoji كبديل لأيقونة واجهة احترافية إلا إذا كان ذلك قرارًا تصميميًا صريحًا.
- الأيقونة الوظيفية المنفردة تحتاج accessible name؛ الزخرفية تخفى عن قارئ الشاشة.
- حافظ على viewBox وحجم stroke/fill متسقين.

## 8. Design QA checklist
- [ ] تباين النصوص والعناصر الأساسية.
- [ ] focus-visible واضح.
- [ ] لا يوجد قص/تداخل عند تكبير النص.
- [ ] كل الحالات تستخدم semantic color ثابتًا.
- [ ] الأزرار والحقول متسقة في الارتفاع والمحاذاة.
- [ ] لا يوجد overflow أفقي غير مقصود.
- [ ] RTL صحيح مع الأرقام والنص المختلط.
- [ ] الحركة تحترم reduced-motion.
- [ ] كل صورة لها أبعاد/fallback/alt مناسب.
