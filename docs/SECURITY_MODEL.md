> **تنبيه النطاق — Frontend Only:** هذه الوثيقة محفوظة كسياق تاريخي/تصوري للمراحل المستقبلية. لا تمثل تكليفًا أو تنفيذًا مطلوبًا حاليًا. لا تنفذ API أو قاعدة بيانات أو مصادقة أو صلاحيات خادمية بناءً عليها في المرحلة الحالية. المرجع التنفيذي هو `HANSALEHLAK_MASTER_FUNCTIONAL_ARCHITECTURE.md`.

---

# Security Model

Current status: frontend demo only. No trusted backend, authentication, authorization, API rate limiting, audit log, production storage or secrets manager exists. The browser must be treated as untrusted. Production requirements: server-side authorization on every request, deny-by-default, least privilege, separation of duties, immutable audit trail, MFA for super-admin, session revocation, input validation, output encoding, abuse controls and secure secret storage. Never place privileged API secrets in frontend files or Firestore-readable settings.
