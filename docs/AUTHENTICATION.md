> **Historical — frontend-only phase (2026-11-13/19).** This document describes the platform before it went live on Firebase. The real backend, payments, catalogue, call centre and security model are in `docs/MAINTENANCE_GUIDE.md`, and the current state is in `docs/AI_CONTEXT/START_HERE.md`. Source code wins over this file.

> **تنبيه النطاق — Frontend Only:** هذه الوثيقة محفوظة كسياق تاريخي/تصوري للمراحل المستقبلية. لا تمثل تكليفًا أو تنفيذًا مطلوبًا حاليًا. لا تنفذ API أو قاعدة بيانات أو مصادقة أو صلاحيات خادمية بناءً عليها في المرحلة الحالية. المرجع التنفيذي هو `HANSALEHLAK_MASTER_FUNCTIONAL_ARCHITECTURE.md`.

---

# Authentication

No production authentication exists in the supplied frontend. Customer/provider role selection and provider demo login are client-side demo flows. Admin login is a non-functional explanatory placeholder. A production implementation requires server-side identity verification, secure session lifecycle, account status checks, revocation, rate limiting and secret management. Never trust a role, provider ID or employee number supplied by the browser.
