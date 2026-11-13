# FRONTEND TEAM & AI COLLABORATION PROTOCOL

> **المرجع التشغيلي الموحد لكل وكيل/محادثة:** `docs/AI_AGENT_CONTINUATION_PROTOCOL.md`. هذا الملف يكمل قواعد التعاون أدناه ولا يلغي `CLAUDE.md`.\n\n## 1. الهدف
تمكين عدة مهندسين ووكلاء AI من العمل بالتوازي دون تضارب ملفات أو تغيير عقود غير معلن.

## 2. قبل قبول المهمة
يجب أن تتضمن كل مهمة: النتيجة التي يراها المستخدم، الصفحة/التطبيق، نطاق التغيير، الملفات المرجعية، الملفات المسموح تعديلها، السلوك المطلوب، responsive/accessibility، ومعايير القبول. إذا كانت التفاصيل غير كافية، يسجل الوكيل أسئلة محددة ولا يخترع قرار منتج.

## 3. بروتوكول قراءة إلزامي
1. `README.md`
2. `docs/HANSALEHLAK_MASTER_FUNCTIONAL_ARCHITECTURE.md`
3. `docs/FRONTEND_PAGE_CATALOG.md` أو `FRONTEND_COMPONENT_CATALOG.md` حسب المهمة
4. ملف التنفيذ نفسه وكل اعتمادياته المباشرة
5. `docs/AI_PROJECT_MAP.json` لمعرفة الحالة والملكية والمستهلكين

## 4. Ownership and parallel work
- لكل مهمة Owner واحد مسؤول عن دمج التغيير.
- لا تعدل مهمتان نفس الملف في نفس الوقت دون تنسيق صريح.
- يمكن تقسيم العمل حسب app/page بشرط عدم تعديل shared tokens/components بالتوازي دون owner مشترك.
- أي تغيير في `shared/` أو entry point أو legacy bridge يحتاج إخطار أصحاب التطبيقات المتأثرة.
- لا تعمل على ملفات خارج قائمة النطاق إلا لإصلاح blocker موثق وبعد إخطار صاحب المهمة.

## 5. قواعد الوكيل AI
- اقرأ الملف الفعلي؛ لا تعتمد على اسم الملف وحده.
- لا تعتبر Placeholder تنفيذًا موجودًا.
- لا تستبدل تصميمًا معتمدًا برؤية شخصية.
- لا تضف backend/database/API/auth حقيقيًا.
- لا تنشئ بيانات حقيقية أو تدّع نجاح عمليات خارجية.
- لا تحذف legacy أو ملفات تبدو غير مستخدمة قبل فحص المراجع.
- لا تكرر component أو CSS token موجودًا.
- لا تغيّر أسماء globals/selectors/storage keys دون inventory.
- لا تنفذ refactor واسعًا داخل مهمة UI صغيرة.
- اذكر الافتراضات والأسئلة المفتوحة بوضوح.

## 6. تسليم العمل
كل PR/تسليم يتضمن: summary، user-visible changes، files changed، dependencies/contracts affected، tests run/results، viewport checks، screenshots عند توفرها، known issues، docs/map updates.

## 7. Conflict resolution
إذا اختلف مهندسان/وكلاء: لا تختَر الأكثر إقناعًا لغويًا. ارجع للكود، هذه المواصفة، قرار المالك، ومعايير القبول. سجل القرار في `docs/DECISIONS/` عند تأثيره على أكثر من صفحة أو تطبيق.

## 8. Definition of ready
- هدف المستخدم واضح.
- صفحة/مكوّن محدد.
- الملفات المرجعية معروفة.
- الحالة الحالية مفحوصة.
- معايير القبول قابلة للاختبار.

## 9. Definition of done
راجع `FRONTEND_QA_ACCEPTANCE.md` و`AI_AGENT_CONTINUATION_PROTOCOL.md`، حدث الكتالوج وخريطة الملفات، وتأكد أن التسليم لا يحتوي ادعاءات غير متحققة.

## 10. قالب Prompt جاهز للمهندس/AI

```text
You are working on HANSALEHLAK V8 in the FRONTEND-ONLY phase.
Read README.md and the frontend master specification before changing code.
Inspect the actual implementation and all direct dependencies. Do not infer behavior from filenames or placeholders.
Scope: [specific page/component and user outcome]
Allowed files: [explicit list]
Do not modify: [explicit list]
Expected behavior: [interaction and UI states]
Responsive requirements: mobile 360–430px, tablet 768–1024px, desktop 1280px+; preserve RTL.
Use existing design tokens and shared components. Do not add backend, database, API, production auth, or external integrations.
Keep mock/local behavior explicitly identified. Do not claim a simulated action is a real external operation.
Run relevant tests and npm test. Report exact files changed, tests/results, responsive checks, assumptions, and remaining issues. Update frontend documentation and AI_PROJECT_MAP.
```
