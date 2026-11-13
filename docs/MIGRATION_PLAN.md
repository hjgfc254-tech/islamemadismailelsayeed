> **تنبيه النطاق — Frontend Only:** هذه الوثيقة محفوظة كسياق تاريخي/تصوري للمراحل المستقبلية. لا تمثل تكليفًا أو تنفيذًا مطلوبًا حاليًا. لا تنفذ API أو قاعدة بيانات أو مصادقة أو صلاحيات خادمية بناءً عليها في المرحلة الحالية. المرجع التنفيذي هو `HANSALEHLAK_MASTER_FUNCTIONAL_ARCHITECTURE.md`.

---

# Migration Plan

1. Preserve the original ZIP separately; this archive was generated from a backup copy.
2. Relocate existing source modules into application/shared/services ownership while preserving their code and load order.
3. Keep `portal-compat.js` intact temporarily because it mixes provider and admin responsibilities and exposes legacy globals.
4. Next: extract provider-only functions and admin-demo functions into separate modules; replace global dependencies with explicit interfaces.
5. Next: independently boot Provider App and Admin App, with refresh-safe routing and route tests.
6. Only then implement backend APIs, server authentication, RBAC, database migrations and security tests.
7. Remove legacy compatibility code only after reference scans and regression tests prove it is unused.
