# Future Backend / Database Boundary

`backend/` and `database/` are intentionally preserved as future scaffolding. They are not part of the active Frontend implementation phase.

## Current phase rules
- Do not implement backend routes, database schemas/migrations, production auth, server authorization, or external API calls while completing Frontend tasks.
- Frontend may use local stores, fixtures, mock APIs, and local browser storage. Clearly label all simulated behavior.
- Do not treat `services/*-api.js` as live backend integration. Since 2026-11-14 they are **mock adapters**: in-process
  routes over `MP`, no network, not loaded by any entry. They define the contract in `docs/API_CONTRACTS.md` (envelope,
  roles, ownership, validation, business rules). The backend phase plugs in `HSApiClient.setTransport()` and must
  re-enforce every rule server-side.
- Do not delete future backend/database scaffolding as unused. It is reserved for a later integration phase.

## Backend injection readiness
When the product owner starts the backend phase, first inventory and review:
- `backend/README.md`, `backend/src/`, `backend/modules/`, `backend/config/`, `backend/middleware/`, `backend/jobs/`, `backend/tests/`.
- `database/README.md`, `database/schema/`, `database/policies/`, `database/migrations/`, `database/seeds/`.
- Existing frontend local service contracts and mock fixtures.

Then produce an explicit migration map from each local service/fixture to the future API contract. Do not wire production APIs until the backend contract, auth model, error model, and migration plan are approved.
