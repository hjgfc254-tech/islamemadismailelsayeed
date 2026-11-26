# Services layer

- **Local data services (used by the apps today):** `local-market-store.js` (`MP`, localStorage `hs_mp_db`, which is
  the shared marketplace store for Customer, Provider and Admin), `local-catalog.js` (`CAT`) and `local-attachments.js`
  (`AT`, IndexedDB).
- **The shared domain (route table):** `api-client.js` plus `auth-api.js`, `orders-api.js`, `quotes-api.js`,
  `catalog-api.js`, `provider-api.js`, `customer-api.js`, `notifications-api.js`, `support-api.js`, `finance-api.js`,
  `admin-api.js` and `ops-api.js` define every API route once (one envelope, role and ownership checks, validation).
  All three apps load them. In local mode (`?backend=local`) they run in-process over `MP`; in Firebase mode
  (the default) `firebase-backend.js` sends every request to the callable `api`, and the server runs the **same files**
  (copied to `functions/domain` by `npm run functions:sync`). `uploads-api.js` / `local-attachments.js` keep
  attachments on the device; `realtime-client.js` refreshes `MP` across tabs.
- Contract: `docs/API_CONTRACTS.md`; full wiring (routes → server plan, tests): `docs/MAINTENANCE_GUIDE.md` §2.1;
  tests: `tests/unit/api-adapters.test.js`, `tests/unit/wiring.test.js`.
- **Catalogue:** `catalog-question-bank.js` (the default one-tap questions, loaded before `local-catalog.js`) and `catalog-remote.js` (the apps adopt the catalogue published from the Admin Center, `/catalog-feed`). Payments rules live in `local-market-store.js` («round 12: payments»); the Paymob calls are server-only (`functions/src/payments.js`). Guide §3.14–§3.15.
