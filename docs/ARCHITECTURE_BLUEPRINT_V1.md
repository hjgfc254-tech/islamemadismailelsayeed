HANSALEHLAK — Project Architecture & File Responsibility Map

وثيقة البنية المعمارية وخريطة الملفات الحالية والمستهدفة

الإصدار: Architecture Blueprint v1.0
تاريخ الفحص: 8 نوفمبر 2026
المصدر: HANSALEHLAK-V8-C8-RESPONSIVE-QA(2).zip
نطاق الوثيقة: توصيف الوضع الفعلي للحزمة، رسم بنية النظام، جرد كل ملف
موجود، وتحديد الملفات/الوحدات المقترحة للمنظومة الكاملة مستقبلًا.

────────

1. الغرض من الوثيقة

هذه الوثيقة هي المرجع المعماري قبل بدء بناء واجهات الإدارة الحقيقية. وهي
تفصل بوضوح بين:

1. الوضع الحالي (AS-IS): ما هو موجود فعلًا داخل ملف ZIP الذي تم
فحصه.
2. البنية المستهدفة (TO-BE): ما يجب إضافته لبناء منظومة متكاملة
تشمل العميل، مقدم الخدمة، الزائر، والإدارة المركزية.
3. الملفات المقترحة: أسماء ومسؤوليات الملفات التي لم تُنشأ بعد.
وجودها في هذه الوثيقة لا يعني أنها موجودة حاليًا.

لا تعتبر هذه الوثيقة ادعاءً بأن Backend أو قاعدة بيانات إنتاجية أو نظام
مصادقة حقيقي موجود بالفعل. الحزمة الحالية Frontend تجريبي يعتمد أساسًا
على JavaScript وlocalStorage وIndexedDB.

────────

2. القرار المعماري الأساسي

هنصلحلك ليست واجهة واحدة بها أدوار مخفية. إنها منظومة واحدة بأربع
تجارب استخدام مستقلة، تتصل بخدمات وبيانات مركزية:

• Guest: زائر يستطيع تصفح الأجزاء العامة المسموح بها دون حساب.
• Customer: عميل يستخدم واجهة السوق الحالية لإنشاء الطلبات
ومتابعتها.
• Provider: مقدم خدمة معتمد، له بوابة ومساحة عمل مختلفة تمامًا.
• Admin Workforce: موظفون ومديرون يدخلون من بوابة إدارية منفصلة.
• Super Admin: المالك وصاحب السلطة الأعلى، يدير الموظفين والإدارات
والأدوار والصلاحيات وإعدادات النظام.

كل وظيفة إدارية تخص أي نطاق — مثل الخدمات أو مقدمي الخدمة أو الطلبات
أو عروض الأسعار أو الشكاوى أو الماليات — تكون ضمن Admin Center. لا
تُنشأ لوحات إدارية متفرقة داخل واجهة العميل أو بوابة مقدم الخدمة. قد تعرض
واجهات العميل والمزود وظائف تخص حسابيهما فقط، لكنها لا تمتلك صلاحيات
إدارة المنصة.

2.1 مخطط المنظومة العام

flowchart TB
    PLATFORM["HANSALEHLAK PLATFORM"]
    PLATFORM --> ENTRY["Public Entry / Role Selection"]
    ENTRY --> GUEST["Guest Experience"]
    ENTRY --> CUSTOMER["Customer Application"]
    ENTRY --> PROVIDER["Provider Workspace"]
    ENTRY --> ADMINPORTAL["Separate Admin Portal"]

    ADMINPORTAL --> AUTH["Identity & Authentication"]
    AUTH --> SUPER["Super Admin"]
    AUTH --> STAFF["Admin / Staff"]
    SUPER --> IAM["Workforce, Roles & Permissions"]
    STAFF --> POLICY["Permission Enforcement"]

    GUEST --> PUBLICAPI["Public / Customer APIs"]
    CUSTOMER --> PUBLICAPI
    PROVIDER --> PROVIDERAPI["Provider APIs"]
    SUPER --> ADMINAPI["Admin APIs"]
    STAFF --> ADMINAPI

    PUBLICAPI --> DOMAIN["Central Domain Services"]
    PROVIDERAPI --> DOMAIN
    ADMINAPI --> DOMAIN

    DOMAIN --> DB[("Central Database")]
    DOMAIN --> FILES[("Object Storage")]
    DOMAIN --> AUDIT[("Audit & Security Logs")]
    DOMAIN --> EVENTS["Notifications / Events"]

قراءة المخطط: الواجهات مستقلة، لكن مصادر الحقيقة والخدمات التجارية
مشتركة ومركزية. فصل الواجهات لا يعني تكرار البيانات أو بناء قواعد بيانات
منفصلة لكل دور.

2.2 مخطط اختيار نوع الاستخدام

flowchart TD
    A["فتح هنصلحلك"] --> B{"هل المستخدم اختار نوع الدخول؟"}
    B -->|زائر| G["Guest: تصفح عام"]
    B -->|عميل| C["Customer Sign-in / Registration"]
    B -->|مقدم خدمة| P["Provider Sign-in"]
    B -->|إدارة| X["Admin Portal منفصل"]

    C --> C1["Customer App"]
    P --> P1["Email + Provider Code + Authentication"]
    P1 --> P2{"الحساب موجود ومفعّل؟"}
    P2 -->|نعم| P3["Provider Workspace"]
    P2 -->|لا| P4["رفض الدخول / مراجعة / إيقاف"]

    X --> X1["Email + Password + Employee Number"]
    X1 --> X2{"هوية صحيحة والحساب نشط؟"}
    X2 -->|نعم| X3["تحميل الصلاحيات من الخادم"]
    X3 --> X4{"Super Admin أم موظف؟"}
    X4 -->|Super Admin| S["Super Admin Console"]
    X4 -->|موظف| R["Staff Workspace حسب الصلاحيات"]
    X2 -->|لا| X5["رفض الدخول وتسجيل المحاولة"]

> **ملاحظة أمنية:** اختيار الدور في الواجهة ليس إثباتًا للهوية. لا يسمح
> للمستخدم أن يرفع نفسه إلى Provider أو Admin بتغيير قيمة JavaScript أو
> URL. يحدد الخادم نوع الحساب وصلاحياته بعد التحقق من الجلسة.

────────

3. الوضع الحالي بعد فحص ZIP

3.1 ملخص تقني

────────

البند                               الموجود حاليًا

────────

شكل التطبيق                         تطبيق Frontend واحد

لغة الواجهة                         HTML + CSS + JavaScript

نمط JavaScript                      ملفات تقليدية محمّلة عبر script
وترتيب تحميل معتمد على globals

واجهة العميل                        موجودة

بوابة مقدم الخدمة                   موجودة كتجربة Frontend تجريبية

واجهة الإدارة                       موجودة داخل portal.js كتجربة/لوحة
تشغيل تجريبية

Super Admin حقيقي                   غير موجود

إدارة الموظفين                      غير موجودة

نظام RBAC/Permissions حقيقي         غير موجود

تسجيل دخول حقيقي                    غير موجود

Backend API                         غير موجود في الحزمة

قاعدة بيانات إنتاجية                غير موجودة؛ توجد طبقة بيانات محلية

التخزين المحلي                      localStorage

تخزين المرفقات                      IndexedDB عبر attachments.js

PWA / Offline                       manifest.json وsw.js

الاختبارات                          مجموعة اختبارات Node.js للوظائف
والتدقيق البنيوي

اختبار متصفح بصري فعلي              غير معتمد في تقارير المشروع بسبب تعذر Chromium في بيئة التطوير

3.2 حدود يجب عدم الخلط بينها

• portal.js يحتوي على شاشة إدارة فعلية من ناحية العرض والمنطق
التجريبي، لكنه ليس Admin Center إنتاجيًا.
• provider-workspace.js يبني واجهة عمل لمقدم الخدمة، لكنه يستخدم
بيانات MP المحلية وحسابات تجريبية.
• market.js هو طبقة بيانات محلية وليس Backend.
• localStorage لا يصلح ليكون مصدر الحقيقة لطلبات أو حسابات أو
صلاحيات إنتاجية.
• إخفاء التبويبات أو الأزرار في الواجهة لا يفرض صلاحيات أمنية.
• لا يوجد حاليًا مسار مصادقة حقيقي بالبريد وكلمة المرور ورقم الموظف أو
بكود مقدم الخدمة.

────────

4. خريطة تدفق الملفات الحالية

4.1 تحميل الملفات في index.html

ترتيب التحميل الحالي مقصود، وبعض الملفات تعتمد على globals أنشأتها ملفات
سابقة:

flowchart TD
    HTML["index.html"] --> ICONS["icons.js"]
    ICONS --> DATA["data.js"]
    DATA --> CATALOG["catalog.js"]
    CATALOG --> MARKET["market.js"]
    MARKET --> APP["app.js"]
    APP --> UIKIT["ui-kit.js"]
    UIKIT --> MARKETUI["market-ui.js"]
    MARKETUI --> WIZARD["wizard.js"]
    WIZARD --> PORTAL["portal.js"]
    PORTAL --> PW["provider-workspace.js"]
    PW --> ATTACH["attachments.js"]
    ATTACH --> SEARCH["search.js"]
    SEARCH --> DISCOVER["discover.js"]
    DISCOVER --> ADDR["addresses.js"]
    ADDR --> ACCOUNT["account.js"]
    ACCOUNT --> SUPPORT["support.js"]

تحذير: لا يُعاد ترتيب هذه الملفات عشوائيًا قبل تحويل المشروع إلى وحدات
ES Modules أو بناء نظام تحميل واعتماديات صريح.

4.2 العلاقات الوظيفية الحالية

flowchart LR
    UI["app.js + styles.css"] --> MP["market.js / MP"]
    MP --> DB[("localStorage: hs_mp_db")]
    UI --> CAT["catalog.js / CAT"]
    CAT --> DB2[("localStorage: hs_catalog_v1")]
    WZ["wizard.js"] --> CAT
    WZ --> MP
    WZ --> AT["attachments.js / IndexedDB"]
    MUI["market-ui.js"] --> MP
    PORTAL["portal.js"] --> MP
    PW["provider-workspace.js"] --> PORTAL
    PW --> MP
    DISC["discover.js"] --> CAT
    SEARCH["search.js"] --> CAT
    SEARCH --> DISC
    ACCOUNT["account.js"] --> MP
    ACCOUNT --> ADDR["addresses.js"]
    SUPPORT["support.js"] --> MP
    ICONS["icons.js"] --> ALL["معظم الواجهات"]
    UIKIT["ui-kit.js"] --> ALL

────────

5. جرد جميع الملفات الموجودة حاليًا

المجلد الجذري داخل ZIP هو hansalhlak-v5/. جميع الملفات التالية موجودة
بالفعل في الحزمة التي تم فحصها.

5.1 ملفات التشغيل الأساسية والواجهات

────────

الملف                     الحالة                  الوظيفة الفعلية

────────

index.html              موجود                   نقطة دخول التطبيق
الحالية. يحتوي هيكل
الصفحة، #app و#view
و#tabbar والنوافذ
المنبثقة والافتتاحية،
ويربط ملفات CSS
وJavaScript بالترتيب
الحرج.

app.js                  موجود                   محرك واجهة العميل
والتنقل الداخلي وعرض
الشاشات الرئيسية، الصفحة
الرئيسية، التبويبات،
القوائم، النوافذ
المنبثقة، الافتتاحية،
وربط أحداث الواجهة.

market-ui.js            موجود                   واجهات السوق الخاصة
بالعميل: عرض مقدمي
الخدمة، تفاصيل الطلب،
التتبع، التقييم،
الشكاوى، اختيار مقدم
الخدمة يدويًا، وعرض
الحالات.

portal.js               موجود                   البوابة الحالية للأدوار،
واجهة مقدم الخدمة
القديمة، شاشة الإدارة
التجريبية، تعريف تبويبات
الإدارة، نماذج مقدم
الخدمة، عروض الأسعار
وبعض أدوات
الحسابات/العمولات.

provider-workspace.js   موجود                   طبقة مساحة عمل مقدم
الخدمة V8؛ تستبدل
screens.provider وتعرض
لوحة مقدم الخدمة والتنقل
الداخلي والطلبات
والمواعيد والتقييمات
والملف والمعاملات من
بيانات MP التجريبية.

wizard.js               موجود                   معالج إنشاء طلب الخدمة
متعدد الخطوات، التحقق من
المدخلات، حفظ واستعادة
المسودات، رفع/إرفاق
الملفات، وتقديم الطلب.

discover.js             موجود                   صفحات استكشاف الأقسام
والأجهزة والمشكلات، وصف
المشكلة والخطوات
والتنبيهات والاحتياجات،
والانتقال إلى إنشاء طلب.

search.js               موجود                   محرك البحث الموحد في
الكتالوج؛ تطبيع الكلمات
العربية والمرادفات
والتقريب والنتائج
والاقتراحات وربط نتائج
البحث.

account.js              موجود                   واجهة حساب العميل:
الطلبات، المفضلة،
الإشعارات، التقييمات،
الملف الشخصي، الإعدادات،
وبعض إجراءات الحساب.

addresses.js            موجود                   واجهة إدارة عناوين
العميل:
إضافة/تعديل/حذف/اختيار
العنوان الافتراضي ومناطق
المحافظات.

support.js              موجود                   مركز الدعم والأسئلة الشائعة والسياسات وتقديم الشكاوى والبلاغات وسجل الدعم والتواصل.

5.2 ملفات البيانات والمنطق

────────

الملف                   الحالة                  الوظيفة الفعلية

────────

market.js             موجود                   طبقة بيانات السوق MP،
بذور البيانات
التجريبية، الطلبات،
مقدمو الخدمة، العملاء،
الإسناد، الحالات، عروض
الأسعار، العمولات،
المعاملات، الإشعارات،
التقييمات، الشكاوى،
العناوين والمفضلة.
التخزين الحالي في
localStorage بمفتاح
hs_mp_db.

catalog.js            موجود                   الكتالوج الهرمي CAT:
أقسام الخدمة
والأجهزة/أنواع العمل
والمشكلات والأسئلة
والسلامة والتخصصات
والبحث وإدارة عناصر
الكتالوج. يحفظ محليًا
بمفتاح hs_catalog_v1.

data.js               موجود                   بيانات وتعريفات ثابتة
قديمة/أساسية، منها
DEVICES وترتيب
الأقسام وأدلة إرشادية؛
يستخدمه التوافق مع
أجزاء أقدم من التطبيق.

icons.js              موجود                   تعريفات SVG للأيقونات
وأسماءها البديلة وبناء
HTML للأيقونات وأيقونات
الأقسام والحالات.

attachments.js        موجود                   طبقة المرفقات AT
باستخدام IndexedDB، حفظ
الملفات والتحقق من
أنواعها وأحجامها
واسترجاعها وحذفها وربط
معرّفاتها بالطلبات.

ui-kit.js             موجود                   مكونات حالات الواجهة الموحدة: Loading / Skeleton / Empty / Error / Success / Offline، Toast، وحوار التأكيد.

5.3 ملفات التصميم والأصول

────────

الملف                        الحالة                  الوظيفة الفعلية

────────

styles.css                 موجود                   ملف التنسيق الأساسي
الكبير للواجهة الحالية،
مكونات العميل والبوابة
والحالات والتخطيطات
والاستجابة.

design-system.css          موجود                   طبقة نظام التصميم V8:
المتغيرات البصرية،
الأسطح، الألوان،
المسافات، الظلال،
الحركة، وتحسينات
الاستجابة وإتاحة
الاستخدام.

icon.svg                   موجود                   أيقونة PWA / favicon
الحالية.

assets/logo-mark.webp      موجود                   علامة الشعار المصورة
المستخدمة في الافتتاحية
والهوية.

assets/logo-word.webp      موجود                   الاسم/الكتابة المصورة
للشعار.

assets/slide-guide.svg     موجود                   رسم/شريحة إرشادية في
الواجهة.

assets/slide-latest.svg    موجود                   رسم/شريحة لأحدث المحتوى
أو الخدمات.

assets/slide-popular.svg   موجود                   رسم/شريحة للمحتوى أو
الخدمات الشائعة.

manifest.json              موجود                   تعريف تطبيق الويب
التقدمي PWA: الاسم،
الاتجاه، الألوان، وضع
العرض، نقطة البدء
والأيقونات.

sw.js                      موجود                   Service Worker للتخزين المؤقت والعمل دون اتصال، Cache First للأصول وNetwork First للتنقل، وإدارة إصدارات الكاش.

5.4 ملفات الاختبارات

────────

الملف                                الحالة                  الوظيفة الفعلية

────────

tests/catalog-wizard.test.js       موجود                   اختبار الكتالوج ومسارات
إنشاء الطلب والأسئلة
والتحقق وتغيير
الاختيارات وإدارة عناصر
الكتالوج.

tests/customer-workflow.test.js    موجود                   اختبارات تدفق العميل
ومركز الطلبات والتتبع
وبعض حالات الواجهة.

tests/design-system.test.js        موجود                   اختبارات وجود رموز
التصميم وقواعد
الاستجابة وتقليل الحركة
وترتيب CSS والكاش.

tests/discover.test.js             موجود                   اختبارات صفحات
الاستكشاف ومخرجاتها
وروابطها ومحتواها.

tests/home.test.js                 موجود                   اختبارات الصفحة
الرئيسية ومكوناتها
وتدفقاتها الأساسية.

tests/provider-workspace.test.js   موجود                   اختبارات حدود مساحة عمل
مقدم الخدمة ووجود وظائف
العرض الأساسية.

tests/responsive-audit.test.js     موجود                   اختبارات بنيوية
للاستجابة ومقاسات العرض
وخصائص CSS.

tests/static-audit.test.js         موجود                   فحوصات ثابتة لمراجع
الملفات وIDs وصحة
JavaScript وService
Worker.

tests/ui-kit.test.js               موجود                   اختبارات مكونات UI Kit الموحدة.

5.5 ملفات التوثيق والتقارير الموجودة

────────

الملف                         الحالة                  الوظيفة الفعلية

────────

DEVELOPMENT_PROGRESS.md     موجود                   سجل مراحل التطوير
الأقدم V5 والكتالوج
ورحلة العميل
والاختبارات وما لم
يكتمل.

HANSALHLAK_V8_PROGRESS.md   موجود                   سجل تقدم V8، ما تم وما
لم يتم، نتائج
الاختبارات وحدود
التنفيذ وخطوات
الاستكمال.

PROMPT_LOG_V8.md            موجود                   سجل توجيهات/برومبتات
التطوير السابقة وقرارات
التنفيذ.

ICON_SYSTEM_REPORT.md       موجود                   تقرير نظام الأيقونات
وحالته.

INTRO_V2_REPORT.md          موجود                   تقرير تطوير الافتتاحية
V2.

P1_PROVIDER_AUDIT.md        موجود                   تدقيق سابق لبوابة مقدم الخدمة وملاحظاتها.

إجمالي الحزمة: 45 مدخلًا تشمل المجلدات والملفات؛ منها ملفات المصدر
والاختبارات والتوثيق والأصول المذكورة أعلاه.

────────

6. الوظائف الموجودة حاليًا داخل portal.js وما يجب التعامل معه

portal.js ملف مزدحم نسبيًا لأنه يجمع حاليًا أكثر من نطاق:

• بوابة الأدوار enterRole() وexitRole().
• شاشة مقدم الخدمة القديمة screens.provider.
• تجميع الطلبات حسب مقدم الخدمة provRequests().
• بطاقة الطلب للمقدم provCard().
• نموذج بيانات مقدم الخدمة providerForm().
• تعريف تبويبات الإدارة ADM_TABS.
• فلاتر الطلبات والحالات.
• شاشة الإدارة الحالية screens.admin.
• فتح نموذج عرض السعر openQuoteForm().
• حسابات العمولة وصافي مقدم الخدمة.

ثم يأتي provider-workspace.js ويعيد تعريف screens.provider ليستخدم
مساحة العمل الجديدة. هذا يعني أن بوابة مقدم الخدمة الحالية ليست وحدة
مستقلة تمامًا بعد، وأن الإدارة والمزود ما زالا مرتبطين بملف
portal.js.

التوصية

عند تنفيذ البنية الجديدة، نفصل المسؤوليات تدريجيًا إلى وحدات مستقلة، مع
المحافظة على عقود البيانات والوظائف التي تعمل حاليًا. لا يتم حذف
portal.js أو إعادة كتابته دفعة واحدة قبل نقل الوظائف واختبارها.

────────

7. البنية المستهدفة المقترحة للملفات

7.1 مبدأ التنظيم

الهيكل التالي هو Target Structure مقترح وليس وصفًا لما هو موجود.
الهدف هو فصل:

• تطبيق العميل.
• تطبيق مقدم الخدمة.
• تطبيق الإدارة.
• الخدمات المشتركة.
• طبقة API.
• Backend والمصادقة والصلاحيات.
• الاختبارات والتوثيق.

لا يلزم تنفيذ كل الملفات مرة واحدة. يتم إنشاء الملفات عند بدء الوحدة
التي تحتاجها، لكن أسماءها ومسؤولياتها تكون معتمدة مسبقًا حتى لا تتكرر
الوظائف أو تتضارب.

7.2 شجرة الملفات المقترحة

hansalhlak/
│
├── apps/
│   ├── customer/                         # تجربة العميل العامة
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── customer-router.js
│   │   ├── customer-session.js
│   │   ├── pages/
│   │   │   ├── home.page.js
│   │   │   ├── discover.page.js
│   │   │   ├── search.page.js
│   │   │   ├── request-create.page.js
│   │   │   ├── orders.page.js
│   │   │   ├── order-details.page.js
│   │   │   ├── providers.page.js
│   │   │   ├── account.page.js
│   │   │   ├── addresses.page.js
│   │   │   └── support.page.js
│   │   └── styles/
│   │       └── customer.css
│   │
│   ├── provider/                          # بوابة مقدم الخدمة المستقلة
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── provider-router.js
│   │   ├── provider-auth.js
│   │   ├── provider-session.js
│   │   ├── provider-shell.js
│   │   ├── pages/
│   │   │   ├── dashboard.page.js
│   │   │   ├── incoming-requests.page.js
│   │   │   ├── request-details.page.js
│   │   │   ├── active-jobs.page.js
│   │   │   ├── quotes.page.js
│   │   │   ├── schedule.page.js
│   │   │   ├── services.page.js
│   │   │   ├── earnings.page.js
│   │   │   ├── transactions.page.js
│   │   │   ├── reviews.page.js
│   │   │   ├── notifications.page.js
│   │   │   └── profile.page.js
│   │   └── styles/
│   │       └── provider.css
│   │
│   ├── admin/                             # مركز الإدارة المستقل
│   │   ├── index.html
│   │   ├── login.html
│   │   ├── app.js
│   │   ├── admin-router.js
│   │   ├── admin-auth.js
│   │   ├── admin-session.js
│   │   ├── admin-shell.js
│   │   ├── permission-guard.js
│   │   ├── navigation-builder.js
│   │   ├── pages/
│   │   │   ├── super-dashboard.page.js
│   │   │   ├── admin-dashboard.page.js
│   │   │   ├── workforce.page.js
│   │   │   ├── employee-details.page.js
│   │   │   ├── roles.page.js
│   │   │   ├── permissions.page.js
│   │   │   ├── departments.page.js
│   │   │   ├── services-management.page.js
│   │   │   ├── categories-management.page.js
│   │   │   ├── providers-management.page.js
│   │   │   ├── customers-management.page.js
│   │   │   ├── orders-management.page.js
│   │   │   ├── quotes-management.page.js
│   │   │   ├── complaints-management.page.js
│   │   │   ├── reviews-management.page.js
│   │   │   ├── finance-dashboard.page.js
│   │   │   ├── commissions.page.js
│   │   │   ├── settlements.page.js
│   │   │   ├── reports.page.js
│   │   │   ├── notifications-management.page.js
│   │   │   ├── audit-log.page.js
│   │   │   ├── security.page.js
│   │   │   └── system-settings.page.js
│   │   ├── modules/
│   │   │   ├── workforce/
│   │   │   │   ├── employee-form.js
│   │   │   │   ├── employee-status.js
│   │   │   │   └── employee-invitation.js
│   │   │   ├── access-control/
│   │   │   │   ├── role-editor.js
│   │   │   │   ├── permission-matrix.js
│   │   │   │   └── permission-presets.js
│   │   │   └── audit/
│   │   │       ├── audit-filters.js
│   │   │       └── audit-details.js
│   │   └── styles/
│   │       ├── admin.css
│   │       ├── admin-components.css
│   │       └── admin-responsive.css
│   │
│   └── guest/                             # تجربة الزائر العامة
│       ├── guest-entry.js
│       └── guest-policy.js
│
├── shared/
│   ├── components/
│   │   ├── buttons.js
│   │   ├── forms.js
│   │   ├── tables.js
│   │   ├── dialogs.js
│   │   ├── data-grid.js
│   │   ├── status-badge.js
│   │   └── notification-center.js
│   ├── design-system/
│   │   ├── tokens.css
│   │   ├── typography.css
│   │   ├── layout.css
│   │   └── components.css
│   ├── icons/
│   │   └── icon-registry.js
│   ├── config/
│   │   ├── app-config.js
│   │   ├── routes.js
│   │   └── feature-flags.js
│   ├── utils/
│   │   ├── validation.js
│   │   ├── sanitization.js
│   │   ├── formatting.js
│   │   ├── dates.js
│   │   ├── money.js
│   │   └── errors.js
│   └── types/
│       ├── account.types.js
│       ├── order.types.js
│       ├── provider.types.js
│       └── permission.types.js
│
├── services/
│   ├── api-client.js
│   ├── auth-api.js
│   ├── customer-api.js
│   ├── provider-api.js
│   ├── admin-api.js
│   ├── catalog-api.js
│   ├── orders-api.js
│   ├── quotes-api.js
│   ├── finance-api.js
│   ├── support-api.js
│   ├── notifications-api.js
│   ├── uploads-api.js
│   └── realtime-client.js
│
├── backend/                              # يضاف إذا لم يكن موجودًا في المستودع الأساسي
│   ├── src/
│   │   ├── server.js
│   │   ├── app.js
│   │   ├── config/
│   │   │   ├── env.js
│   │   │   ├── database.js
│   │   │   └── storage.js
│   │   ├── middleware/
│   │   │   ├── authenticate.js
│   │   │   ├── require-account-status.js
│   │   │   ├── require-permission.js
│   │   │   ├── rate-limit.js
│   │   │   ├── validate-request.js
│   │   │   └── error-handler.js
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── auth.routes.js
│   │   │   │   ├── auth.controller.js
│   │   │   │   ├── auth.service.js
│   │   │   │   └── session.repository.js
│   │   │   ├── workforce/
│   │   │   │   ├── workforce.routes.js
│   │   │   │   ├── workforce.controller.js
│   │   │   │   ├── workforce.service.js
│   │   │   │   └── workforce.repository.js
│   │   │   ├── access-control/
│   │   │   │   ├── roles.routes.js
│   │   │   │   ├── permissions.routes.js
│   │   │   │   ├── access.service.js
│   │   │   │   └── policy.repository.js
│   │   │   ├── customers/
│   │   │   ├── providers/
│   │   │   ├── catalog/
│   │   │   ├── orders/
│   │   │   ├── quotes/
│   │   │   ├── complaints/
│   │   │   ├── reviews/
│   │   │   ├── finance/
│   │   │   ├── notifications/
│   │   │   ├── reports/
│   │   │   ├── audit/
│   │   │   └── settings/
│   │   └── jobs/
│   │       ├── notification-worker.js
│   │       └── scheduled-tasks.js
│   └── tests/
│       ├── auth.test.js
│       ├── authorization.test.js
│       ├── workforce.test.js
│       └── audit.test.js
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   ├── schema/
│   │   ├── accounts.schema.js
│   │   ├── employees.schema.js
│   │   ├── roles.schema.js
│   │   ├── permissions.schema.js
│   │   ├── departments.schema.js
│   │   ├── providers.schema.js
│   │   ├── customers.schema.js
│   │   ├── services.schema.js
│   │   ├── orders.schema.js
│   │   ├── quotes.schema.js
│   │   ├── transactions.schema.js
│   │   ├── complaints.schema.js
│   │   ├── notifications.schema.js
│   │   └── audit-events.schema.js
│   └── policies/
│       ├── access-matrix.md
│       └── data-access-policy.md
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   └── fixtures/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── FILE_MAP.md
│   ├── DATA_MODEL.md
│   ├── AUTHENTICATION.md
│   ├── PERMISSIONS.md
│   ├── API_CONTRACTS.md
│   ├── ADMIN_MODULES.md
│   ├── MIGRATION_PLAN.md
│   └── SECURITY_MODEL.md
│
├── assets/
├── manifest.json
├── service-worker.js
└── README.md

7.3 ملاحظات على الشجرة المقترحة

1. apps/customer يحافظ على تجربة المستخدم الحالية ولا يضم أدوات إدارة
المنصة.
2. apps/provider بوابة مستقلة، لا تعتمد على تغيير ROLE في واجهة
العميل لإثبات هوية المزود.
3. apps/admin تطبيق مستقل بمدخل دخول منفصل وتخطيط وصلاحيات وتنقل خاص.
4. apps/guest يحدد ما يستطيع الزائر رؤيته دون جلسة مستخدم.
5. shared يحتوي المكونات المشتركة فقط، ولا يحتوي منطق صلاحيات أو
أعمالًا خاصة بدور واحد.
6. services طبقة اتصال الواجهات بالـ API، ولا تنفذ قرارات الصلاحية
الحساسة محليًا.
7. backend هو موضع فرض المصادقة والصلاحيات وقواعد العمل.
8. database يصف مخطط البيانات والترحيلات والسياسات، ولا ينبغي أن يكون
بديلًا عن التحقق في Backend.
9. يمكن أن يكون Backend في مستودع منفصل أو Cloudflare Workers/Firebase
أو غيرهما؛ هذه الشجرة منطقية وليست فرضًا على مزود تقني بعينه.
10. لا ننشئ ملفات فارغة لمجرد مطابقة الشجرة؛ ينشأ كل ملف مع تنفيذ
واختبار وظيفته.

────────

8. وحدات Admin Center ومسؤولية كل وحدة

كل إدارة هي نطاق عمل داخل Admin Center، وليست تطبيقًا مستقلًا أو مصدر
بيانات منفصلًا.

────────

الوحدة                  المسؤولية               أمثلة للصلاحيات

────────

Super Admin             السيطرة الكاملة         إدارة كل الإدارات، تعيين Super Admin آخر وفق سياسة آمنة،
والتهيئة العليا         الإعدادات الحساسة

Workforce Management    الموظفون والمديرون      إنشاء موظف، تعديل ملفه، تفعيل/تعطيل، إعادة تعيين دعوة
والحسابات

Departments             إنشاء الإدارات وربط     إنشاء إدارة، تعيين رئيس، ربط الوحدات
الموظفين بها

Roles                   تعريف الأدوار الوظيفية  مدير خدمات، مشرف طلبات، مسؤول دعم

Permissions             التحكم الدقيق في        view/create/update/delete/approve/reject/export/assign
الأفعال

Providers               مقدمو الخدمة            مراجعة طلبات الانضمام، اعتماد، تعليق، تعديل

Customers               العملاء                 عرض الحسابات، التعامل مع البلاغات، تقييد الحساب وفق
السياسة

Catalog & Services      الكتالوج والخدمات       إضافة، تعديل، ترتيب، تفعيل، نشر
والتصنيفات

Orders                  الطلبات                 عرض، إسناد، تغيير حالة وفق انتقالات مسموحة، إلغاء وفق
سياسة

Quotes                  عروض الأسعار            مراجعة، متابعة، تصعيد، إلغاء وفق السياسة

Finance                 الماليات والعمولات      عرض، إعداد نسب، مراجعة، تسوية، تصدير

Complaints & Support    الشكاوى والدعم          إسناد، رد، تصعيد، إغلاق

Reviews                 التقييمات               مراجعة، إخفاء وفق سياسة موثقة

Notifications           الإشعارات               قوالب، إرسال، جدولة، مراجعة سجل

Reports & Analytics     التقارير                عرض تقارير محددة، تصدير، نطاقات زمنية

Audit & Security        سجل العمليات والأمن     مراجعة من فعل ماذا ومتى وعلى أي سجل

System Settings         إعدادات المنصة          إعدادات عامة، تكاملات، سياسات، مفاتيح عبر Secret Manager فقط

8.1 مثال على نموذج الصلاحيات

يجب أن تكون الصلاحية مرتبطة بـ المورد + الفعل + النطاق وليس باسم
التبويب فقط.

مثال مفاهيمي:

resource: providers
actions:
  - providers.view
  - providers.create
  - providers.update
  - providers.approve
  - providers.reject
  - providers.suspend
  - providers.export

resource: services
actions:
  - services.view
  - services.create
  - services.update
  - services.archive
  - services.publish

resource: finance
actions:
  - finance.dashboard.view
  - finance.commissions.view
  - finance.commissions.update
  - finance.settlements.approve
  - finance.reports.export

ويجب دعم نطاق البيانات (scope)، مثل: - كل السجلات. - سجلات إدارة
محددة. - سجلات محافظة أو منطقة محددة. - السجلات المسندة إلى الموظف
نفسه. - السجلات التي أنشأها الموظف نفسه.

لا يكفي إخفاء الزر. كل Endpoint وكل عملية كتابة يجب أن تتحقق من
الصلاحية والنطاق في Backend.

────────

9. نموذج الحسابات والهوية

9.1 لا نخلط بين نوع الحساب والدور الوظيفي

نموذج مقترح:

• account_type: customer | provider | staff | super_admin
• account_status:
invited | pending | active | suspended | rejected | disabled
• employee_number: رقم الموظف الفريد، خاص بحسابات الموظفين.
• provider_code: كود مقدم الخدمة الفريد، خاص بحسابات المزودين.
• role_ids: الأدوار الوظيفية المسندة.
• department_ids: الإدارات التي ينتمي إليها الموظف.
• permission_overrides: استثناءات مباشرة محدودة، إن سمحت سياسة
النظام.
• created_by, updated_by, created_at, updated_at.

9.2 دخول الموظف

الحقول التي طلبها المالك: - البريد الإلكتروني. - كلمة المرور. - رقم
الموظف.

التوصية الأمنية: - البريد وكلمة المرور هما بيانات المصادقة الأساسية. -
رقم الموظف يُستخدم كمعرف إضافي للحساب والتحقق من ارتباط المستخدم بسجل
الموظف. - لا يتم اعتبار رقم الموظف سرًا أو بديلًا عن كلمة المرور. - لا
تُخزن كلمة المرور كنص صريح. - يفضل MFA للحسابات ذات الامتيازات العالية. -
تُدار الجلسات وتدوير/إبطال Refresh Tokens من الخادم. - تُسجل محاولات
الدخول الفاشلة والتنبيهات الأمنية.

9.3 دخول مقدم الخدمة

• كود مقدم الخدمة يصدره النظام أو الإدارة، ولا يكون قابلًا للتخمين
بسهولة.
• يرتبط الكود بحساب Provider محدد وحالة تفعيله.
• البريد الإلكتروني يتحقق من ارتباط المستخدم بالحساب.
• يلزم إثبات هوية/مصادقة حقيقية، وليس مجرد مطابقة كود في JavaScript.
• حساب Pending أو Suspended أو Rejected لا يصل إلى مساحة الطلبات.

────────

10. الكيانات الأساسية المقترحة في قاعدة البيانات

هذه قائمة نطاقات بيانات أولية يجب تثبيتها قبل بناء Backend. الأسماء
نهائية مبدئيًا ويمكن ضبطها أثناء تصميم المخطط:

────────

الكيان                              الغرض

────────

accounts                          هوية الحساب ونوعه وحالته

customer_profiles                 ملف العميل

provider_profiles                 ملف مقدم الخدمة

employees                         بيانات الموظف والرقم الوظيفي

departments                       الإدارات الداخلية

roles                             الأدوار الوظيفية

permissions                       الصلاحيات الذرية

role_permissions                  ربط الدور بالصلاحيات

employee_roles                    ربط الموظف بالأدوار

employee_departments              ربط الموظف بالإدارات

permission_overrides              الاستثناءات الفردية المحدودة

provider_codes                    أكواد انضمام/دخول مقدمي الخدمة

service_categories                أقسام الكتالوج

service_items                     الأجهزة/أنواع العمل

service_problems                  المشكلات

services                          الخدمات المنشورة

service_requests                  طلبات العملاء

assignments                       إسناد الطلبات

quotes                            عروض الأسعار

transactions                      الحركات المالية

commission_rules                  قواعد العمولات

settlements                       التسويات

reviews                           التقييمات

complaints                        الشكاوى

addresses                         عناوين العملاء

attachments                       بيانات الملفات المخزنة

notifications                     الإشعارات

audit_events                      سجل العمليات الإدارية والأمنية

system_settings                   إعدادات النظام غير السرية

secrets references                مراجع أسرار خارجية؛ لا تخزن الأسرار الحساسة كنص داخل إعدادات عامة

10.1 العلاقات الرئيسية

erDiagram
    ACCOUNTS ||--o| CUSTOMER_PROFILES : has
    ACCOUNTS ||--o| PROVIDER_PROFILES : has
    ACCOUNTS ||--o| EMPLOYEES : has
    EMPLOYEES }o--o{ DEPARTMENTS : belongs_to
    EMPLOYEES }o--o{ ROLES : assigned
    ROLES }o--o{ PERMISSIONS : grants
    PROVIDER_PROFILES ||--o{ SERVICE_REQUESTS : receives
    CUSTOMER_PROFILES ||--o{ SERVICE_REQUESTS : creates
    SERVICE_REQUESTS ||--o{ QUOTES : has
    SERVICE_REQUESTS ||--o{ ASSIGNMENTS : has
    SERVICE_REQUESTS ||--o{ COMPLAINTS : may_have
    SERVICE_REQUESTS ||--o{ REVIEWS : may_have
    PROVIDER_PROFILES ||--o{ TRANSACTIONS : earns
    EMPLOYEES ||--o{ AUDIT_EVENTS : performs
    ACCOUNTS ||--o{ NOTIFICATIONS : receives

────────

11. ضوابط أمنية ومعمارية إلزامية

1. Server-side authorization: كل صلاحية تُفحص في Backend لكل طلب،
وليس في المتصفح فقط.
2. Deny by default: الحساب الجديد لا يحصل على صلاحيات حتى تُسند له
أدوار صريحة.
3. Least privilege: أقل صلاحية لازمة لإنجاز العمل.
4. Separation of duties: لا يُمنح موظف صلاحيات مالية حساسة وإدارية
عليا تلقائيًا.
5. Immutable audit trail: سجل تدقيق لا يستطيع الموظف العادي تعديله
أو حذفه.
6. Super Admin protection: حماية قوية للحساب الأعلى، مع MFA وسياسة
استرداد آمنة.
7. Employee lifecycle: دعوة، تفعيل، تعليق، إنهاء خدمة، وإبطال
الجلسات.
8. Provider lifecycle: طلب انضمام، مراجعة، اعتماد، تعليق، وإعادة
تفعيل.
9. Session isolation: جلسة العميل لا تتحول إلى جلسة موظف أو مزود
بتغيير URL أو localStorage.
10. Input validation: التحقق من كل مدخل على الخادم، مع حماية من XSS
وCSRF حسب آلية الجلسات.
11. Rate limiting: على تسجيل الدخول والعمليات الحساسة وواجهات API.
12. Secrets management: مفاتيح API وأسرار التكامل لا تُخزن في ملفات
Frontend أو مستندات عامة أو Firestore settings مكشوفة.
13. Financial integrity: العمليات المالية الحساسة تكون ذرية ومراجعة
ولا تعتمد على حسابات Frontend.
14. Audit sensitive actions: تسجيل من أنشأ أو عدّل أو اعتمد أو رفض أو
حذف أو صدّر.
15. No client-side trust: لا تُقبل role, employee_number,
provider_code أو permission list من العميل كدليل موثوق دون تحقق
الخادم.

────────

12. خطة فصل تدريجي من المشروع الحالي إلى البنية المستهدفة

لا ننفذ إعادة كتابة شاملة دفعة واحدة. نستخدم Strangler Migration: ننقل
نطاقًا في كل مرة ونحافظ على عمل التجربة الحالية.

المرحلة 0 — تثبيت المرجع

• حفظ نسخة المشروع الحالية كما هي.
• اعتماد هذه الوثيقة.
• تحديد نقطة تشغيل المشروع وطريقة نشره الفعلية.
• تحديد ما إذا كان هناك Backend أو مستودع آخر غير مرفق؛ الحزمة الحالية
لا تحتويه.
• تثبيت عقود البيانات الحالية في MP وCAT قبل نقلها.

المرحلة 1 — فصل تجارب الاستخدام على مستوى Frontend

• تثبيت واجهة العميل الحالية.
• إنشاء مدخل مستقل لمقدم الخدمة.
• إنشاء مدخل مستقل للإدارة.
• إنشاء مدخل/سياسة للزائر.
• نقل provider-workspace.js من مجرد override إلى تطبيق منظم تدريجيًا.
• عزل portal.js وعدم استخدامه كحاوية دائمة لكل الأدوار.

المرحلة 2 — بناء Admin Shell وSuper Admin UI

• Admin Login UI.
• Super Admin Dashboard.
• Workforce Management.
• Departments.
• Roles.
• Permission Matrix.
• Audit Log UI.
• بناء Navigation ديناميكي من صلاحيات الخادم.

مهم: يمكن بناء الواجهات والبيانات الوهمية للاختبار، لكن لا توصف
بأنها نظام دخول أو حماية إنتاجي قبل Backend.

المرحلة 3 — المصادقة والصلاحيات الحقيقية

• إنشاء Backend/Auth.
• دعوات الموظفين وإدارة كلمة المرور.
• التحقق من رقم الموظف.
• جلسات آمنة.
• أدوار وصلاحيات مخزنة مركزيًا.
• فرض الصلاحيات في Middleware/Services.
• اختبارات تجاوز الصلاحيات.

المرحلة 4 — نقل الإدارات التجارية إلى Admin Center

• مقدمو الخدمة.
• العملاء.
• الكتالوج والخدمات.
• الطلبات.
• عروض الأسعار.
• الشكاوى والتقييمات.
• الماليات والعمولات والتسويات.
• التقارير والإعدادات.

المرحلة 5 — ربط Provider Workspace وCustomer App بالـ API

• استبدال عمليات MP المحلية بطبقة API تدريجيًا.
• نقل بيانات العملاء والمزودين والطلبات إلى قاعدة بيانات مركزية.
• تخزين المرفقات في Object Storage.
• الإبقاء على Offline Cache للقراءة/المسودات حيث يكون آمنًا.
• عدم تخزين بيانات صلاحيات حساسة كمرجع موثوق في المتصفح.

المرحلة 6 — الاختبار والإطلاق

• Unit / Integration / E2E.
• اختبار كل دور وكل صلاحية.
• اختبار الوصول المباشر إلى URL.
• اختبار API بدون صلاحية.
• اختبار حساب موظف موقوف.
• اختبار كود مزود غير صالح أو موقوف.
• اختبار الفصل بين بيانات العملاء والمزودين.
• اختبار الأداء والاستجابة على الهاتف والكمبيوتر.
• مراجعة أمنية قبل الإطلاق.

────────

13. قرارات يجب تثبيتها قبل كتابة برومبت التنفيذ

────────

القرار                              التوصية

────────

هل الإدارة داخل واجهة العميل؟       لا، بوابة مستقلة

هل إدارة المزود داخل بوابة المزود؟  لا، المزود يدير ملفه وعملياته فقط؛
إدارة المنصة مركزية

هل لكل إدارة تطبيق مستقل؟           لا؛ وحدات داخل Admin Center موحد

هل يمكن إنشاء إدارات جديدة؟         نعم، من Super Admin ضمن حدود
الوحدات التي يدعمها النظام

هل يمكن إنشاء صلاحيات جديدة بحرية؟  تُدار الصلاحيات من قاموس صلاحيات
معتمد؛ لا ننشئ مفاتيح عشوائية بلا
Backend handlers

هل يمكن منح موظف أكثر من دور؟       نعم، مع قواعد تعارض للصلاحيات
الحساسة

هل يمكن تقييد الموظف بإدارة أو      نعم
نطاق؟

هل رقم الموظف كلمة مرور؟            لا، هو معرف إضافي

هل كود المزود وحده يكفي؟            لا، يجب ربطه بمصادقة وحساب نشط

هل نخزن البيانات في localStorage    لا؛ يمكن استخدامه لتفضيلات غير
للإنتاج؟                            حساسة أو Cache محدود

هل نبني كل شيء مرة واحدة؟           لا؛ نقل تدريجي مع اختبارات

────────

14. ما الذي لا ينبغي تغييره أثناء بناء Admin Center؟

• لا تُحذف واجهة العميل الحالية أو يعاد تصميمها دون طلب مستقل.
• لا تتغير رحلة إنشاء الطلب لمجرد بناء الإدارة.
• لا تتغير حالات الطلبات أو أسماء الحقول دون خطة Migration.
• لا يتم حذف MP قبل توثيق كل دوالها وعقودها واستبدالها.
• لا يتم حذف CAT أو DEVICES قبل حسم التوافق بين الكتالوج الجديد
والقديم.
• لا يتم تغيير provider-workspace.js إلى لوحة إدارية؛ هي مساحة مقدم
الخدمة.
• لا يتم اعتماد أي بيانات Demo على أنها بيانات حقيقية.
• لا يتم إعلان اكتمال المصادقة أو الصلاحيات قبل اختبار Backend.

────────

15. قائمة تحقق لاستخدام الوثيقة مع أدوات البرمجة

عند تسليم هذا الملف لأداة برمجة، يجب أن تلتزم بما يلي:

☐ قراءة المشروع الحالي كاملًا قبل التعديل.
☐ اعتبار جرد الملفات في القسم 5 هو خط الأساس للحزمة المرفقة.
☐ التمييز بين Current Files وProposed Files.
☐ عدم افتراض وجود ملفات أو Backend غير موجودة في ZIP.
☐ إنشاء تقرير يوضح كل ملف جديد أو معدل أو محذوف وسبب ذلك.
☐ عدم إعادة كتابة ملفات العميل دون ضرورة مثبتة.
☐ عدم وضع منطق Admin في app.js أو portal.js بشكل متضخم.
☐ بناء Admin Center كتطبيق مستقل.
☐ بناء نظام الصلاحيات من مصدر مركزي.
☐ عدم اعتبار إخفاء عناصر الواجهة حماية أمنية.
☐ إضافة اختبارات لكل صلاحية وكل Endpoint حساس.
☐ تحديث هذه الوثيقة عند تغير البنية أو إضافة ملفات.
☐ عدم إعلان أي وظيفة مكتملة قبل تنفيذها واختبارها.

────────

16. الخلاصة التنفيذية

المشروع الحالي يحتوي على أساس Frontend جيد لتجربة العميل، وكتالوج خدمات،
ورحلة طلب، وطبقة بيانات تجريبية، وبوابة مقدم خدمة تجريبية، وشاشة إدارة
تجريبية. لكنه لا يحتوي في الحزمة المرفقة على Backend إنتاجي أو مصادقة أو
Workforce Management أو RBAC حقيقي.

المسار الصحيح هو:

1. الحفاظ على Customer App الحالي.
2. فصل Provider Workspace كتجربة مستقلة.
3. إنشاء Admin Center مستقل تمامًا.
4. جعل Super Admin هو المتحكم في الإدارات والموظفين والأدوار
والصلاحيات.
5. جعل كل الإدارات التجارية تعمل من مركز الإدارة الموحد.
6. ربط الجميع بخدمات Backend وقاعدة بيانات مركزية، مع فرض الصلاحيات
في الخادم.

هذه الوثيقة هي المرجع الأولي لبنية هنصلحلك، وتسبق كتابة أي برومبت تنفيذ
لواجهات الإدارة.