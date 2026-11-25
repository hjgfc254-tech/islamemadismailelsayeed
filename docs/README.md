# خريطة المشروع والوثائق — HANSALEHLAK (هنصلحلك)

## الفولدرات

| الفولدر | فيه إيه |
|---|---|
| `apps/customer/` | تطبيق العميل (الصفحة الرئيسية، الطلب، المتابعة، الحساب) |
| `apps/provider/` | تطبيق الفني |
| `apps/admin/` | لوحة الإدارة |
| `apps/guest/` | قواعد دخول الزائر |
| `services/` | **منطق المنصة المشترك** (القواعد، الأسعار، الطلبات، الخصومات…) — بيشتغل في المتصفح وعلى الخادم |
| `shared/` | الهوية (CSS)، الأيقونات، المكوّنات المشتركة، بيانات الأقسام |
| `functions/` | الخادم (Firebase Cloud Functions): `src/` الكود، `domain/` نسخة تلقائية من `services/` (`npm run functions:sync`) |
| `assets/` | الصور واللوجو والأيقونات والمكتبات الخارجية (`vendor/`) |
| `legal/` | صفحات عامة (سياسة الخصوصية) |
| `tests/` | الاختبارات: `unit/` (`npm test`)، `e2e/` (متصفح)، `helpers/` |
| `scripts/` | سكربتات الجرد والوثائق والمزامنة |
| `docs/` | الوثائق (الجدول تحت) — `docs/archive/` تقارير قديمة للرجوع لها بس |
| `backend/`, `database/` | هيكل مستقبلي محفوظ — مش مستخدم دلوقتي، ما يتمسحش |
| `tools-lab/` | أدوات الفحص — التقارير بتتولد في `tools-lab/reports/` ومش بتترفع |
| `local-only/` | نسخ احتياطية وحاجات شخصية على جهازك بس — مش بتترفع |
| `graphify-out/`, `.serena/`, `.firebase/` | ملفات أدوات بتتولد لوحدها — مش بتترفع |

ملفات أول المشروع: `index.html` (بيحوّل للتطبيق) · `manifest.json` (التثبيت على الموبايل) · `service-worker.js` (الشغل من غير نت؛ رقم `CACHE`) · `firebase.json` + `*.rules` + `firestore.indexes.json` (إعدادات Firebase) · `CLAUDE.md` / `AGENTS.md` (تعليمات للذكاء الاصطناعي).

## الوثائق — تقرا إيه

| عايز | اقرا |
|---|---|
| **دليل الصيانة الشامل** (خريطة النظام، كل المسارات والصفحات والصلاحيات، خطوات النشر والطوارئ، حل المشاكل) | **`MAINTENANCE_GUIDE.md`** |
| أعدّل شكل صفحة (أعدّل في أنهي ملف) | **`UI_EDIT_GUIDE_AR.md`** |
| وصف كامل للمشروع وقاعدة البيانات وكل المفاتيح (لأي مبرمج / ذكاء اصطناعي) | **`PROJECT_REFERENCE.md`** (`npm run docs:reference` يحدّثه) |
| خطة لأي خطوة كبيرة (نشر، أندرويد، دفع، تخزين صور، نسخ احتياطي…) | **`PLAYBOOKS.md`** |
| كل مسارات الـ API | `API_CONTRACTS.md` |
| قاعدة البيانات (Firestore / RTDB) | `FIREBASE_SCHEMA.md` و `FIREBASE_BACKEND.md` |
| خريطة التصميم (إنجليزي) | `DESIGN_MAP.md` و `DESIGN_SYSTEM_V9.md` |
| بداية سريعة لأي ذكاء اصطناعي | `AI_CONTEXT/START_HERE.md` ثم `AI_CONTEXT/DOMAIN_MAPS/` |
| آخر حالة الشغل والخطوة الجاية | `HANDOFF_NEXT_AI.md` |
| قرارات اتاخدت وأسبابها | `DECISIONS/` |
| جرد كل الملفات (بيتولد تلقائيًا) | `AI_PROJECT_MAP.*`، `PROJECT_TREE.md`، `AI_CONTEXT/FILE_INDEX.json` |
| تقارير ومراجعات قديمة | `archive/` |
