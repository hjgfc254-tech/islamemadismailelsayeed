> **تنبيه النطاق — Frontend Only:** هذه الوثيقة محفوظة كسياق تاريخي/تصوري للمراحل المستقبلية. لا تمثل تكليفًا أو تنفيذًا مطلوبًا حاليًا. لا تنفذ API أو قاعدة بيانات أو مصادقة أو صلاحيات خادمية بناءً عليها في المرحلة الحالية. المرجع التنفيذي هو `HANSALEHLAK_MASTER_FUNCTIONAL_ARCHITECTURE.md`.

---

# Authentication

No production authentication exists in the supplied frontend. Customer/provider role selection and provider demo login are client-side demo flows. Admin login is a non-functional explanatory placeholder. A production implementation requires server-side identity verification, secure session lifecycle, account status checks, revocation, rate limiting and secret management. Never trust a role, provider ID or employee number supplied by the browser.
