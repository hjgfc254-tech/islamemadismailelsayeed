> **Historical — frontend-only phase (2026-11-13/19).** This document describes the platform before it went live on Firebase. The real backend, payments, catalogue, call centre and security model are in `docs/MAINTENANCE_GUIDE.md`, and the current state is in `docs/AI_CONTEXT/START_HERE.md`. Source code wins over this file.

# Architecture

## System shape

The repository is organized into Customer, Provider, Admin and Guest application boundaries; a shared UI/design/configuration layer; a services layer; and future backend/database boundaries.

## Current runtime reality

*(Current as of 2026-11-14.)* Three bootable frontend demos share one local marketplace store (`services/local-market-store.js`, `MP`, localStorage `hs_mp_db`), each loading classic scripts in an intentional order:
- **Customer** (`apps/customer/`). Guest is a restricted mode of it (`apps/guest/guest-policy.js` + `guest-entry.js`). Its only route to providers is the onboarding link `apps/provider/index.html#/join`; there is no role switching.
- **Provider** (`apps/provider/`), the standalone app. The former in-Customer workspace (`provider-workspace.js`) and the role bridge (`legacy/portal-compat.js`) were removed after capability migration.
- **Admin** (`apps/admin/`), isolated and reachable only from its own entry. The former legacy console's live operations are `pages/marketplace.page.js`.

All marketplace writes go through the mock API adapters (`services/api-client.js` + `*-api.js`, in-process over `MP`, no network). Reads use `MP` as the local read model, refreshed across tabs by `services/realtime-client.js`. See `docs/API_CONTRACTS.md`. Nothing here is a production backend, authentication or authorization.

## Dependency direction

Applications may consume Shared and Services. Shared must not import application modules. Services currently include local/demo stores. API adapters and backend modules are placeholders. Backend must own authentication, authorization, validation, business rules and durable data access when implemented.

## Migration strategy

This pass relocates source modules while preserving classic script loading order. A later pass must split the mixed legacy portal by function and convert global dependencies to explicit module interfaces, with regression tests at each step.
