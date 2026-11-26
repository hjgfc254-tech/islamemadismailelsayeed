> **Historical — frontend-only phase (2026-11-13/19).** This document describes the platform before it went live on Firebase. The real backend, payments, catalogue, call centre and security model are in `docs/MAINTENANCE_GUIDE.md`, and the current state is in `docs/AI_CONTEXT/START_HERE.md`. Source code wins over this file.

# FRONTEND QA & ACCEPTANCE PLAN

## 1. الهدف
التحقق من أن كل تغيير يحسن الواجهة المطلوبة دون كسر رحلة قائمة أو إنشاء سلوك مضلل.

## 2. Test layers
| المستوى | ما يختبر | أمثلة |
|---|---|---|
| Unit | دوال مستقلة | formatters, validators, search normalization, date/money helpers |
| Component | عنصر واجهة منفرد | button states, dialog focus, status mapping, empty/error views |
| Page | رحلة مستخدم داخل صفحة | wizard next/back, search selection, address CRUD |
| Integration (frontend) | تفاعل صفحة مع local store | إنشاء طلب محلي ثم ظهوره في قائمة الطلبات |
| Regression | المسارات الحالية الحساسة | customer home/discovery/request/market/account; provider legacy workspace |
| Responsive | تغير layout والسلوك | 360, 390, 768, 1024, 1440 px |
| Accessibility | keyboard/semantics/contrast | focus order, labels, dialogs, screen-reader names |

## 3. Smoke test لكل تطبيق
- Customer: تحميل index، الرئيسية، البحث، الاكتشاف، wizard، العناوين، الحساب، الدعم، السوق/الطلبات.
- Provider: تحقق من حالة التطبيق الحقيقية ومسار workspace القديم؛ لا تفترض أن shell المستقل مكتمل.
- Admin: تأكد من أن placeholders لا تظهر كصفحات مكتملة أو روابط مكسورة.
- Guest: تحقق من عدم عرض تجربة مصادقة وهمية.

## 4. Responsive matrix
| العرض | ما يجب مراجعته |
|---:|---|
| 360px | لا overflow، أهداف لمس مناسبة، لا تداخل للأزرار |
| 390px | baseline mobile، forms/dialogs/navigation |
| 768px | انتقال layout، أعمدة وبطاقات |
| 1024px | tablet/compact desktop، sidebar إذا وجدت |
| 1440px | عرض المحتوى، عدم تمدد الأسطر/البطاقات بشكل مفرط |

## 5. Manual acceptance checklist
- [ ] الصفحة تفتح دون exception.
- [ ] كل زر/رابط له نتيجة صحيحة.
- [ ] لا يوجد عنصر تفاعلي وهمي أو dead control.
- [ ] الحقول تعمل والتحقق مفهوم ويحفظ الإدخال.
- [ ] loading/empty/error/success states مناسبة.
- [ ] RTL والنصوص المختلطة صحيحة.
- [ ] لا يوجد horizontal overflow غير مقصود.
- [ ] التنقل والرجوع لا يفقدان بيانات دون تنبيه.
- [ ] الصور والأيقونات لا تفشل بصمت.
- [ ] keyboard/focus/labels تعمل.
- [ ] لا توجد أخطاء Console أو موارد 404.
- [ ] اختبارات `npm test` ناجحة.

## 6. Test evidence
لكل مهمة سجل: command، عدد الاختبارات، pass/fail، صفحات/viewport تم فحصها، console/network issues، وأي اختبار لم ينفذ وسببه. لا تكتب «QA passed» دون دليل.

## 7. Regression risk levels
- **Low:** نص/لون محلي لا يؤثر على contracts.
- **Medium:** مكون مشترك أو CSS مشترك أو navigation.
- **High:** entry point، global runtime، legacy bridge، local persistence، wizard، icon registry.

المستوى العالي يتطلب فحص جميع المستهلكين واختبار المسارات الأساسية قبل الدمج.
