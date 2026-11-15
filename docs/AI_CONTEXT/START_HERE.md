# HANSALEHLAK V8 — START HERE

**Current phase:** FRONTEND ONLY (no backend, database, real auth, payments or network APIs).  
**Latest verified baseline (2026-11-14):**
- `npm test`: 348/348 passed.
- Real-browser CDP runners (`tests/e2e/*.cdp.js`):

  | Runner | Checks |
  |---|---|
  | Customer | 160 |
  | Guest | 165 |
  | Provider | 261 |
  | Admin | 124 |
  | Accessibility | 112 |
  | Responsive sweep (5 widths) | 280 |
  | Interaction QA | 206 distinct controls, 0 inert |

- Inventory reproduces from a clean clone (0/0/0).

**Resume state:** `docs/AI_CONTEXT/EXECUTION_CHECKPOINT.md` · **Handoff:** `docs/HANDOFF_NEXT_AI.md` (newest entry on top)  
**Agent protocol:** `docs/AI_AGENT_CONTINUATION_PROTOCOL.md` · **Project skills:** `.claude/skills/` (`finish-gate`, `vm-script-test`, `browser-qa`)

## Mandatory first steps
1. Read `CLAUDE.md`, this file and `docs/AI_CONTEXT/WORKFLOW.md`.
2. Read only the relevant `docs/AI_CONTEXT/DOMAIN_MAPS/<domain>.md`; locate files with `docs/AI_CONTEXT/FILE_INDEX.json`.
3. Inspect source, script order, callers and tests. **Source code wins over docs.**
4. Run `npm test` before editing to establish the baseline.

## Project reality: one marketplace, three apps, one shared local store
| Entry | What it is |
|---|---|
| `index.html` (root) | Redirect to the Customer app |
| `apps/customer/index.html` | Customer app; **Guest** is its restricted mode (`apps/guest/guest-policy.js`, `guest-entry.js`) |
| `apps/provider/index.html` (+ `login.html` hand-off) | Standalone Provider app (the only Provider UI) |
| `apps/admin/index.html` (+ `login.html` hand-off) | Isolated Admin Center (demo account picker → shell → RBAC-filtered nav) |
| `PROJECT_CONTROL_CENTER.html` | Project documentation viewer (not an app) |

- **Data:** `services/local-market-store.js` (`MP`, localStorage `hs_mp_db`) is shared by all apps.
  - **Writes** go through the mock API adapters `services/api-client.js` + `*-api.js`: one envelope, role and
    ownership checks, no network. The contract is `docs/API_CONTRACTS.md`.
  - **Reads** use `MP` as the local read model; `realtime-client.js` refreshes it across tabs.
- **Isolation:** Customer and Provider contain no Admin links, role switching or Admin code (enforced by
  `legacy-migration.test.js` and `guest.cdp.js`). Customer → Provider only via «عايز تقدم خدماتك؟ انضم كمقدم خدمة» →
  `apps/provider/index.html#/join`; a registration stays `pending` (no provider role) until Admin approves it.
- **Legacy:** `apps/provider/legacy/portal-compat.js` and `apps/provider/provider-workspace.js` were **removed**
  (2026-11-14) after capability migration. Do not restore them.
- **Order lifecycle:** quote → customer approves (agreed price, still in progress) → provider completes →
  customer confirms. Zero-value quotes are forbidden. Free service is a separate flow (value 0, no commission).
  Full state diagram: `docs/API_CONTRACTS.md`.
- `backend/` and `database/` are future scaffolding and OUT OF SCOPE.

## Next task
**Firebase backend (2026-11-15): DEPLOYED and ACTIVATED** — all three apps default to the production backend (`?backend=local` = offline demo for dev/tests); Functions `api`/`session` in `me-central1`; PITR + delete protection on. Super Admin verified and owner claimed (employees/e9001). Production data is clean (inventory: `docs/FIREBASE_DATA_INVENTORY.md`). Admin: 15 of 24 pages live on real data (dashboard, settlements, marketplace, workforce, employee details, roles, permissions, orders, customers, providers, complaints, reviews, categories, quotes, finance via `apps/admin/modules/admin-live.js`, 9 remain gated pending backend pieces or business rules (see `docs/ADMIN_BACKEND_STATUS.md`). Docs: `docs/FIREBASE_BACKEND.md`, `docs/FIREBASE_MIGRATION_PLAN.md` (migration NOT executed). Browser runners are pinned to local mode and block production hosts. After editing a domain file run `npm run functions:sync` and redeploy functions.

The approved visual identity (boards in `design-reference/approved/`) is implemented and uncommitted; see
`docs/DESIGN_SYSTEM_V9.md` (tokens sampled from the boards, brand assets in `assets/brand/`, known gaps). Open items:
- category photography, the Account board's desktop sidebar layout, and screen-by-screen rebuilds of the wizard/search/discovery;
- `audit:refresh` / `audit:inventory` before committing (exclude the owner's untracked folders);
- three minor a11y notes (brand/breadcrumb links to the current page lack `aria-current`);
- screen readers, WebKit/Firefox and real devices not verified.

## Required finish gate
Targeted tests → `npm test` → relevant CDP runners (`python -m http.server 8099 --bind 127.0.0.1`, then
`node tests/e2e/<runner>.cdp.js http://127.0.0.1:8099`) → `npm run audit:refresh` → `npm run audit:inventory`.
Bump `CACHE` in `service-worker.js` whenever a precached asset changes (now `hansalhlak-v11-firebase-1`; four tests
pin the literal). The inventory is the git file set (tracked + untracked-unignored); untracked files that should not be
committed will show as "untracked".

## Absolute constraints
Frontend only. Label every local demo action as such. Never put Admin into Customer or Provider. Do not delete code or
change routes, globals, DOM hooks, storage keys, script order or product rules without tracing callers and adding
regression tests.
