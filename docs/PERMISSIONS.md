> **Historical — frontend-only phase (2026-11-13/19).** This document describes the platform before it went live on Firebase. The real backend, payments, catalogue, call centre and security model are in `docs/MAINTENANCE_GUIDE.md`, and the current state is in `docs/AI_CONTEXT/START_HERE.md`. Source code wins over this file.

> **تنبيه النطاق — Frontend Only:** هذه الوثيقة محفوظة كسياق تاريخي/تصوري للمراحل المستقبلية. لا تمثل تكليفًا أو تنفيذًا مطلوبًا حاليًا. لا تنفذ API أو قاعدة بيانات أو مصادقة أو صلاحيات خادمية بناءً عليها في المرحلة الحالية. المرجع التنفيذي هو `HANSALEHLAK_MASTER_FUNCTIONAL_ARCHITECTURE.md`.

---

# Permissions

No production RBAC system exists. Hiding tabs or buttons in the browser is not authorization. The future backend must enforce permissions on every protected request, default-deny unknown permissions, apply least privilege, scope records by account/department, and log sensitive actions. See `database/policies/access-matrix.md`.
