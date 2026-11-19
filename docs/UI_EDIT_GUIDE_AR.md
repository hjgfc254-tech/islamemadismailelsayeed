# دليل تعديل الشكل (UI/UX) — أعدّل فين؟

> القاعدة: **المحتوى والترتيب** (الكلام، الأزرار، الأقسام) في ملف الـ JavaScript بتاع الصفحة.
> **الشكل** (ألوان، مسافات، أحجام، ترتيب على الشاشة) في الـ CSS.
> **تعديلاتك الشخصية في الشكل** حطها في ملف `overrides.css` بتاع التطبيق — بيتحمّل آخر حاجة فبيكسب على الكل، ومش هتبوّظ الملفات الأساسية.

---

## 1. الألوان والخطوط والهوية (كل التطبيقات)

| عايز أغيّر | الملف |
|---|---|
| الألوان الأساسية (البني `--brand-primary`، النحاسي `--accent`، البيج `--bg-primary`)، الخطوط، الحواف، المسافات | `shared/design-system/design-system.css` — أول الملف (`:root`) |
| شكل الأزرار `.cta`، الكروت، الحقول، شريط التنقل تحت، النوافذ اللي بتطلع من تحت | `shared/design-system/design-system.css` |
| الأيقونات المرسومة (السهم، الجرس، …) | `shared/icons/icon-registry.js` |
| صور الأقسام والخدمات | `assets/icons/svc/<القسم>/<الخدمة>.webp` — أو من لوحة الإدارة ← إعدادات النظام ← واجهة الموقع |
| اللوجو والأيقونة | `assets/brand/` و `manifest.json` |
| صورة الهيرو / شاشات الترحيب | `assets/brand/hero-tech-v2.webp` و `onboard-1..3.webp` |

**ترتيب تحميل الـ CSS** (اللي بعده بيكسب لو القاعدتين بنفس القوة):
- العميل: `customer.css` ← `design-system.css` ← **`overrides.css`**
- الفني: `design-system.css` ← `provider.css` ← **`overrides.css`**
- الإدارة: `design-system.css` ← `admin.css` ← `admin-components.css` ← `admin-responsive.css` ← **`overrides.css`**

> في تطبيق العميل ابدأ القاعدة بـ `#view` (مثال: `#view .hero h1{...}`) عشان تبقى أقوى من ملف الهوية.

---

## 2. تطبيق العميل — `apps/customer/`

| الصفحة / الجزء | المحتوى (JS) | الشكل (CSS) — الكلاسات |
|---|---|---|
| **الصفحة الرئيسية (index)** | `pages/home.page.js` (ترتيب الأقسام) + `app.js` (الهيرو `ART.hero`، الأقسام `tile`، العنوان، «امتى محتاج الفني؟»، الباقات، الدعوة) | `.hero`، `.trust-strip`، `.grid.fit .tile`، `.when-pick`، `.reviews-strip`، `.site-foot` |
| رأس الصفحة واللوجو والتنقل تحت | `app.js` (`topbar`, `renderTabs`) | `.topbar`، `#tabbar .tab` |
| شاشات الترحيب أول مرة | `pages/onboarding.js` (الصور والكلام في `SLIDES`) | `#onboard`، `.ob-copy`، `.ob-next`، `.ob-dots` |
| حركة اللوجو في الافتتاح | `index.html` (`#intro`) + `app.js` (`Intro`) | `#intro` |
| الخدمات | `app.js` (`sections`, `sectionsTiles`) | `.sec-filters` |
| البحث | `app.js` (`search`) | `.sr-*` |
| **طلب خدمة (5 خطوات)** | `pages/request-wizard.page.js` (`WZ_STAGES` = تقسيم الخطوات، `WZ_STAGE_NAMES` = أسماءها) | `.wz-*`، `.cgrid .icard`، `.wz-pricebar`، `.price-card`، `.quick-when` |
| طلباتي | `pages/orders.page.js` | `.prow`، `.mj` |
| **متابعة الطلب** | `pages/order-details.page.js` + `pages/trust-features.js` (كود الوصول، الضمان، البقشيش، قبل/بعد) + `pages/market-ui.page.js` (الأزرار والنوافذ) | `.journey`، `.arrive-card`، `.prov-card`، `.chat-box`، `.warranty-strip`، `.tip-card`، `.ba` |
| ملف الفني | `pages/providers.page.js` | `.provider-hero`، `.rating-break`، `.praise` |
| «وجّهني» تحت البحث + تحليل صورة الكاميرا | `pages/ai-assist.js` | `.ai-guide`، `.ai-pick`، `.ai-wait` |
| حسابي + «بيتي» | `pages/account.page.js` + `pages/trust-features.js` (`myHome`) | `.auth-card`، `.myhome`، `.mh-list` |
| العناوين | `pages/addresses.page.js` | `.addr-*` |
| الدعم والأسئلة والسياسات | `pages/support.page.js` (`FAQ`, `POLICIES`) | `.card2` |
| صفحة سياسة الخصوصية العامة | `legal/privacy.html` (الشكل جوه نفس الملف) | — |

## 3. تطبيق الفني — `apps/provider/`

| الجزء | المحتوى (JS) | الشكل (CSS) |
|---|---|---|
| الهيدر والتنقل | `provider-shell.js` | `styles/provider.css` — `.pv-topbar`، `.pv-nav` |
| اللوحة (المكسب، المستوى، الأسبوع، الطلب العالي) | `app.js` ← `summary()` | `.pv-today`، `.pv-level`، `.pv-praise`، `.pv-week`، `.pv-demand` |
| كارت الطلب (الأزرار، كود الوصول، الصور) | `app.js` ← `requestCard()` | `.pv-request`، `.pv-actions`، `.pv-chip`، `.pv-photos` |
| تفاصيل الطلب + المحادثة | `pages/request-details.page.js` + `app.js` ← `chatPanel()` | `.pv-chat` |
| النماذج (رفض، عرض سعر، إكمال، كود الوصول) | `app.js` ← `openForm()` | `.pv-inline-form` |
| باقي الصفحات | `pages/<الاسم>.page.js` | `styles/provider.css` |

## 4. لوحة الإدارة — `apps/admin/`

| الجزء | المحتوى (JS) | الشكل (CSS) |
|---|---|---|
| الهيدر والقائمة الجانبية | `admin-shell.js` (`NAV` = عناصر القائمة) | `styles/admin.css`، `admin-components.css` |
| لوحة الإدارة والرسوم | `pages/admin-dashboard.page.js` + `modules/mini-charts.js` | `.dash-*`، `.mc-*` |
| البحث السريع Ctrl+K | `modules/command-palette.js` | `.cp*` |
| واجهة الموقع (هيرو، شرائح، صور، شريط إعلانات) | `modules/site-content-editor.js` | — |
| الضمان، كود الوصول، الخصومات، الدعوة، الباقات | `modules/marketing-editor.js` | `.mk-*` |
| التوجيه الذكي (مفاتيح DeepSeek / Gemini، الترتيب، التشغيل) | `modules/ai-settings.js` | `.ai-row` |
| كل صفحة إدارة | `pages/<الاسم>.page.js` | `admin-components.css` |

> في الإدارة استخدم متغيرات الهوية (`var(--accent)`) بدل الألوان الثابتة — فيه اختبار بيعدّ القيم الثابتة.

---

## 5. حاجات من غير كود (لوحة الإدارة)
الهيرو والشرائح وصور الأقسام وشريط الإعلانات · الأسعار والعمولات · أيام الضمان وكود الوصول · أكواد الخصم والدعوة والباقات.

## 6. بعد أي تعديل في الشكل
1. `npm test` — لازم كله ينجح.
2. غيّر رقم `CACHE` في `service-worker.js` (مثال `-firebase-12` ← `-firebase-13`) وفي الـ 4 اختبارات اللي فيها نفس الرقم — عشان الموبايلات تاخد التعديل.
3. لو ضفت أو مسحت ملفات: `npm run audit:refresh` ثم `npm run audit:inventory`.
4. ارفع على GitHub.
