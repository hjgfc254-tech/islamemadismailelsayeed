# Architecture

## System shape

The repository is organized into Customer, Provider, Admin and Guest application boundaries; a shared UI/design/configuration layer; a services layer; and future backend/database boundaries.

## Current runtime reality

The customer application is the only fully bootable experience. It loads classic scripts in an intentional order and depends on browser globals. The provider workspace implementation was moved to `apps/provider/provider-workspace.js`, but it still depends on `MP`, `screens`, `show`, `ic`, `STATUS_LABEL`, `providerForm` and the portal compatibility module. The demo admin screen remains in `apps/provider/legacy/portal-compat.js` because its source file contained mixed provider/admin behavior. It is not represented as production Admin Center functionality.

## Dependency direction

Applications may consume Shared and Services. Shared must not import application modules. Services currently include local/demo stores. API adapters and backend modules are placeholders. Backend must own authentication, authorization, validation, business rules and durable data access when implemented.

## Migration strategy

This pass relocates source modules while preserving classic script loading order. A later pass must split the mixed legacy portal by function and convert global dependencies to explicit module interfaces, with regression tests at each step.
