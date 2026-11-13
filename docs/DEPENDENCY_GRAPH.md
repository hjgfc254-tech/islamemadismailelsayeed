# Current Frontend Dependency Graph

This graph reflects observed entry-point wiring in the supplied archive. It is not a target architecture.

```mermaid
flowchart TB
  subgraph Customer["Customer Runtime — active entry"]
    CI["apps/customer/index.html"]
    CAPP["apps/customer/app.js"]
    CMARKET["market-ui.page.js"]
    CWIZ["request-wizard.page.js"]
    CSEARCH["search.page.js"]
    CDISC["discover.page.js"]
    CACCOUNT["account / addresses / support"]
    CI --> CAPP
    CI --> CMARKET
    CI --> CWIZ
    CI --> CSEARCH
    CI --> CDISC
    CI --> CACCOUNT
  end

  subgraph Provider["Provider — legacy-coupled"]
    COMPAT["portal-compat.js"]
    PWORK["provider-workspace.js"]
    PAGES["Provider page scaffolds"]
    COMPAT --> PWORK
    PAGES -. "not yet independent runtime" .-> PWORK
  end
  CI --> COMPAT

  subgraph Admin["Admin — demo runtime"]
    AI["apps/admin/index.html"]
    SHELL["admin-shell.js"]
    RBAC["rbac-store.js"]
    GRID["HSDataGrid"]
    DIALOG["HSDialog / dialogs.js"]
    BADGE["HSStatusBadge"]
    MONEY["HSMoney"]
    APAGES["Registered admin pages"]
    AI --> SHELL
    AI --> RBAC
    AI --> GRID
    AI --> DIALOG
    AI --> BADGE
    AI --> MONEY
    SHELL --> APAGES
  end

  subgraph Shared["Shared Frontend Foundation"]
    DS["shared/design-system"]
    ICONS["shared/icons/icon-registry.js"]
    UTILS["shared/utils"]
    LOCAL["services/local-*"]
  end
  Customer --> Shared
  Provider --> Shared
  Admin --> Shared

  subgraph Future["Future only — not active in current phase"]
    BE["backend/ scaffolding"]
    DB["database/ scaffolding"]
  end
  Future -. "later integration after approval" .-> Shared
```

## Verified facts
- Customer is loaded through `apps/customer/index.html` using ordered classic scripts.
- Customer entry currently loads Provider compatibility and workspace scripts.
- `apps/provider/index.html` has no equivalent independent script chain in this archive.
- Admin is loaded through `apps/admin/index.html`; its page modules are registered after shared dependencies and the shell.
- Provider and Admin behavior must not be described as production backend-connected.
- `backend/` and `database/` are preserved future scaffolding, outside the current Frontend implementation scope.

## Change safety
Classic script order, globals, and legacy bridges are runtime contracts. Any reordering or extraction requires tests and browser verification before old wiring is removed.
