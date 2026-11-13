# Provider Legacy Parity Audit (P3)

**Date:** 2026-11-13 · **Scope:** frontend only · **Outcome:** evidence + recommendation. Nothing was removed, renamed or unloaded.
**Executable evidence:** `tests/unit/provider-legacy-parity.test.js` (6 tests).

## 1. What the legacy path actually is
Loaded by the **Customer** entry (`apps/customer/index.html`), after the Customer runtime, as classic scripts sharing its globals:

| File | Provides | Depends on (Customer globals) |
|---|---|---|
| `apps/provider/legacy/portal-compat.js` (660 lines) | `enterRole`/`exitRole` role mode; **legacy Provider screen** (`screens.provider`, `data-pa` actions, sheets for reject/propose/quote/finish, `providerForm` registration/edit); **legacy Admin console** (`screens.admin`: orders, providers, customers, commissions, quotes, reports, complaints; `data-ad` actions) | `screens`, `show`, `go`, `sheet`, `closeSheet`, `toast`, `store`, `state`, `esc`, `money`, `ic`, `SERVICE_TYPES`, `MP` |
| `apps/provider/provider-workspace.js` (96 lines) | `PW` workspace that **replaces** `screens.provider` (tabs: home/new/accepted/progress/quote/done/cancelled/schedule/reviews/profile; profile edit via `providerForm`) | same + `portal-compat.js` helpers (`provRequests`, `provCard`, `myProvider`, `roleBar`) |

**Entry points into the legacy path (runtime consumers):**
- Customer side menu: `data-act="role" data-r="provider"` («بوابة مقدم الخدمة») and `data-r="admin"` («لوحة الإدارة») → `apps/customer/app.js:944` `enterRole(d.r)`.
- Customer home CTA «انضم الآن» → `data-r="provider"` (`apps/customer/pages/home.page.js:35`).
- Tests: `tests/unit/home.test.js` (drives `show('provider')`), `tests/unit/provider-workspace.test.js` (static), `tests/e2e/responsive-sweep.browser.js` (`enterRole('provider')`).

## 2. Behavior matrix — legacy Provider vs standalone (`apps/provider/index.html`)

| Capability | Legacy (Customer role mode) | Standalone | Parity |
|---|---|---|---|
| Data store | `MP` / localStorage `hs_mp_db` | same file, same key | ✅ shared (test) |
| Request grouping (6 groups) | `providerGroupOf` | `HSProviderRequestDomain.getRequestGroup` | ✅ identical for 105 combinations (test) |
| Demo identity | localStorage `hs_provId` (persists across tabs) | sessionStorage `hs_provider_demo_session` (per tab) | ⚠️ divergent by design — signing in on one path does not sign in the other |
| Account selection / switch | `login` / `logout` | `select` / `logout` | ✅ |
| Availability | `avail` → `MP.updateProvider` | `availability` → same | ✅ |
| Accept / reject with reason | `MP.respond` (reason select, not required) | same + reason required, stale-safe | ✅ standalone stricter |
| Propose / confirm time | `MP.propose` / `MP.confirmTime` | same + past-time refusal, stale-safe | ✅ standalone stricter |
| Enroute / arrived / started | `MP.advance` | `advance` + group routing | ✅ |
| Quote | `MP.createQuote` (`+x||0`, no validation) | same + amount validation | ✅ standalone stricter |
| Complete | `MP.complete` + **live commission/net preview** (`#finPrev`) | `MP.complete`, bounds validated, live preview `#pv-complete-preview` (same `MP.rateFor`/`MP.calc`) | ✅ **G3 closed 2026-11-13** |
| **Self-registration** | `register` → `providerForm` → `MP.registerProvider` (status `pending`) | none (account picker only; `login.html` is a placeholder) | ❌ **G1** |
| **Profile edit** | `data-pw-edit-profile` → `providerForm(p)` | read-only by explicit decision ("تعديل الملف … غير متاحين") | ❌ **G2** (decision) |
| Schedule / reviews / earnings / transactions / notifications | workspace tabs | dedicated renderers | ✅ (standalone broader) |
| Accessibility | none audited | P1 focus/titles/forms + real-browser QA (170/170) | ✅ standalone ahead |

Legacy also contains the defects fixed in the standalone app by P0 (success toasts on stale actions, unvalidated quote amounts); they were **not** changed here.

## 3. Legacy Admin console
`screens.admin` in `portal-compat.js` is a second, older Admin UI reachable from the Customer menu. The standalone Admin app (`apps/admin/`) is far broader (23 pages). Parity between them is a **separate audit**; nothing in this task touches it.

## 4. Gaps and recommendation
| Id | Gap | Recommendation |
|---|---|---|
| G1 | No self-registration in standalone; Customer «انضم الآن» still leads into legacy | Implement a standalone registration form reusing the legacy field set and validation (name, phone `[0-9+ ]{8,15}`, ≥1 specialty, ≥1 governorate, optional areas/years/bio/docs) → `MP.registerProvider` (status `pending`) → select the new demo identity → existing gate screen. Demo-labelled. |
| G2 | Profile editing disabled in standalone | Keep as is until a product decision; recorded. |
| G3 | ~~No commission/net preview when completing~~ | ✅ Closed 2026-11-13: live preview in the standalone completion form (unit + real-browser typing check). |
| G4 | ~~`apps/provider/login.html` placeholder~~ | ✅ Closed 2026-11-13: demo-labelled hand-off to `index.html` (no credential fields; real-browser check). |
| — | Customer menu/CTA still enter legacy role mode | **Do not switch or remove** until G1 (and G3) exist and a decision is recorded; then route the Customer entries to `apps/provider/index.html` and keep the bridge loaded until the legacy Admin console decision (§3) is made. |

**Retirement of `portal-compat.js` / `provider-workspace.js` is not recommended yet**: G1 is a real user-facing gap, and `portal-compat.js` also hosts the legacy Admin console.
