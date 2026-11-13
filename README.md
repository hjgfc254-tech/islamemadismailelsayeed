# HANSALEHLAK V8 — Frontend Workspace

## المرحلة الحالية: Frontend Only

العمل الحالي يركز على بناء وتوثيق تجربة الواجهة فقط: HTML/CSS/JavaScript، الصفحات، المكونات، الهوية البصرية، التفاعلات، responsive، الوصولية، البيانات التجريبية، واختبارات الواجهة. لا تنفذ Backend أو Database أو API أو مصادقة إنتاجية ضمن هذه المرحلة.

## ابدأ من هنا
1. `docs/HANSALEHLAK_MASTER_FUNCTIONAL_ARCHITECTURE.md` — المرجع الحاكم ونطاق العمل.
2. `docs/FRONTEND_PAGE_CATALOG.md` — مواصفات صفحات العميل والمزود والإدارة والزائر.
3. `docs/FRONTEND_COMPONENT_CATALOG.md` — المكونات المشتركة وعقودها.
4. `docs/FRONTEND_DESIGN_SYSTEM.md` — الهوية ونظام التصميم وRTL.
5. `docs/FRONTEND_INTERACTION_SPEC.md` — التفاعلات والحالات والنماذج.
6. `docs/FRONTEND_ARCHITECTURE.md` — تقسيم الطبقات والاعتماديات والـ legacy contracts.
7. `docs/FRONTEND_QA_ACCEPTANCE.md` — الاختبارات ومعايير القبول.
8. `docs/AI_AGENT_CONTINUATION_PROTOCOL.md` — بروتوكول الاستلام الموحد لكل محادثة/وكيل.\n9. `docs/FRONTEND_TEAM_AI_PROTOCOL.md` — قواعد التعاون والتسليم للمهندسين والـ AI.
10. `docs/FRONTEND_FILE_CATALOG.md` — جرد مسؤوليات الملفات وحالاتها.
11. `docs/AI_PROJECT_MAP.json` — الخريطة الآلية للاعتماديات والحالة والمستهلكين.

## تشغيل الاختبارات
```bash
npm test
```

## حقائق يجب عدم تجاوزها
- تطبيق العميل هو الأكثر اكتمالًا.
- أجزاء من واجهة العميل ما زالت مجمعة في ملفات قائمة ولم تستقل بعد.
- تطبيق مقدم الخدمة لديه الآن entry وruntime مستقلان للعرض التجريبي (`apps/provider/index.html`)، بينما يحتفظ تطبيق العميل بمسار legacy bridge/workspace منفصل للتوافق. لا تحذف legacy قبل إثبات parity.
- تطبيق الإدارة يحتوي صفحات Demo منفذة، لكن أي صفحة/ميزة يجب التحقق من حالتها في `FILE_INDEX.json`؛ لا تعتبر كل ملفات scaffold منفذة.
- التخزين والبيانات الحالية محلية/تجريبية وليست Backend إنتاجيًا.
- أي عملية محاكاة يجب أن تُعرض للمستخدم على أنها محاكاة/حفظ محلي، لا كعملية خارجية حقيقية.

## الوثائق السابقة
الوثائق التي تحمل أسماء مثل `API_CONTRACTS.md`, `DATA_MODEL.md`, `AUTHENTICATION.md`, `SECURITY_MODEL.md`, `PERMISSIONS.md`, `MIGRATION_PLAN.md` وملفات backend/database محفوظة كسياق/مستقبل تاريخي فقط، وليست نطاق تنفيذ المرحلة الحالية. المرجع الحاكم هو وثيقة Frontend Master أعلاه.


## تعليمات Claude Code والعمل الموفر للتوكنز
- ابدأ من `CLAUDE.md` ثم `docs/AI_CONTEXT/START_HERE.md`.
- استخدم `docs/AI_CONTEXT/FILE_INDEX.json` للبحث عن الملفات والحالات.
- اقرأ خريطة المجال والملفات المصدرية المرتبطة بالمهمة فقط.
- لا تحمّل خرائط الجرد التفصيلية كاملة في كل جلسة.
- افحص المصدر والاختبارات قبل الاعتماد على وصف التوثيق.

## البنية المستقبلية
المجلدان `backend/` و`database/` محفوظان كمواد تأسيسية للمرحلة المستقبلية. لا يمثلان تكاملًا إنتاجيًا ولا يدخلان ضمن مهام Frontend الحالية. راجع `docs/AI_CONTEXT/DOMAIN_MAPS/FUTURE_BACKEND_BOUNDARY.md`.
