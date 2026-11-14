# Services layer

- **Local data services (used by the apps today):** `local-market-store.js` (`MP`, localStorage `hs_mp_db`, which is
  the shared marketplace store for Customer, Provider and Admin), `local-catalog.js` (`CAT`) and `local-attachments.js`
  (`AT`, IndexedDB).
- **Backend-ready boundary (mock adapters):** `api-client.js` plus `auth-api.js`, `orders-api.js`, `quotes-api.js`,
  `catalog-api.js`, `provider-api.js`, `customer-api.js`, `notifications-api.js`, `support-api.js`, `finance-api.js`,
  `admin-api.js`, `uploads-api.js` and `realtime-client.js`. They run in-process over `MP` with one response envelope,
  role and ownership checks, and validation. They make **no network calls**, and no app entry loads them yet.
  The contract is in `docs/API_CONTRACTS.md` and the tests are in `tests/unit/api-adapters.test.js`.

Nothing here is a production backend, real authentication, real authorization or a payment system.
