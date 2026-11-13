> **تنبيه النطاق — Frontend Only:** هذه الوثيقة محفوظة كسياق تاريخي/تصوري للمراحل المستقبلية. لا تمثل تكليفًا أو تنفيذًا مطلوبًا حاليًا. لا تنفذ API أو قاعدة بيانات أو مصادقة أو صلاحيات خادمية بناءً عليها في المرحلة الحالية. المرجع التنفيذي هو `HANSALEHLAK_MASTER_FUNCTIONAL_ARCHITECTURE.md`.

---

# Data Model

## Existing local/demo model

The current market store persists a local demo database under `hs_mp_db`; the catalog persists under `hs_catalog_v1`; attachments are stored in IndexedDB through the local attachments service. Existing order states, fields, identifiers and demo fixtures must remain compatible during migration.

## Proposed central entities

Accounts, employees, roles, permissions, departments, providers, customers, services, orders, quotes, transactions, complaints, notifications and audit events are proposed entities only. Schema files under `database/schema/` are placeholders, not validated production schemas.

## Production boundary

Do not treat localStorage or IndexedDB as a source of truth for identities, permissions, financial records or production orders. Define migrations only after choosing a backend/database and validating all current data contracts.
