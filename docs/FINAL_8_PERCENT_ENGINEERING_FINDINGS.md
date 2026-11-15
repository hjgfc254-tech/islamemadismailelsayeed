# Final 8% engineering pass — findings (2026-11-14)

**Scope:** this was a limited, focused inspection, not a full verification. It reuses this session's audit results
(the static integrity scan, the listener scan and the browser runners) and adds four targeted static checks:
service-worker precache existence, unescaped user-field interpolation, secret-like strings, and `eval`/`new Function`.
HEAD is `b150dc6`; all redesign work is uncommitted.

## 1. Critical defects discovered
**None open.** No runtime error, broken route or disconnected primary action was found in the inspected scope:

| Check | Result |
|---|---|
| Console errors | 0 in every runner and screenshot pass |
| JS files with syntax errors | 0 of 118 |
| Entry HTML references missing | 0 |
| Service-worker precache entries missing | 0 of 71 |
| Dynamic Three.js import | Resolves |

## 2. Verified defects fixed (this session, all retested)

| Defect | Fix |
|---|---|
| Customer bottom sheets were covered by the tab bar, so the "add address" and other sheet actions could not be reached on phones | `#sheet` / `#sheet-backdrop` moved above the navigation z-index (`design-system.css`) |
| The Admin marketplace page leaked its realtime subscription on navigation | Released on `ctx.signal` abort (`marketplace.page.js`) |
| The icon generator skipped direct `ICON_DEFS[...]` definitions, so plumbing and 3 problem icons drew legacy artwork | `scripts/build-lucide-icons.cjs`, registry regenerated |
| The Provider "available" toggle failed AA contrast (4.42:1) | `--success:#1A6B4A` |
| The screen entrance animation left a transform in place, which trapped the fixed desktop header | Opacity-only keyframes |
| Long status pills squeezed order titles | `.prow` wraps |
| No fix was needed in this final pass | The checks above found no new verified defect |

## 3. Files modified (this final pass)
- `docs/FINAL_8_PERCENT_ENGINEERING_FINDINGS.md` (new).
- No source changes were made in this final pass. The earlier redesign files are listed in `docs/DESIGN_SYSTEM_V9.md`.

## 4. Tests executed (actual results, after the last source change)

| Check | Result |
|---|---|
| `npm test` | 348/348 pass |
| `a11y.cdp.js` | 112/112 |
| `responsive-sweep.cdp.js` (1280 / 768 / 430 / 390 / 320) | 280/280 |
| `customer-orders.cdp.js` | 160/160 |
| `provider-standalone.cdp.js` | 261/261 |
| `admin-app.cdp.js` | 124/124 |
| `guest.cdp.js` | 165/165 |
| Intro lifecycle (390 and 1280 px) | Canvas and GSAP load; the intro removes itself; `#app` is not inert |
| Static checks | See section 1 |

**Not run:** the full `tests/e2e/interaction.cdp.js` (every-control campaign; paused by the owner), `audit:refresh`,
`audit:inventory`, and WebKit/Firefox, real devices and screen readers.

## 5. Broken workflows
- **Nothing is broken within the tested runners.**
- **Incomplete by design (demo):**
  - assignment, quotes, payments and notifications are local simulations;
  - there is no real OTP or login;
  - attachments are stored locally only.
- **Visual-only gaps** (documented in `docs/DESIGN_SYSTEM_V9.md`):
  - no category photography;
  - the Account board's desktop sidebar layout is not built;
  - the wizard, search and discovery screens are restyled, not rebuilt.

## 6. Backend dependencies (blockers for production)
1. **Authentication:** Customer, Provider and Admin sessions are demo identities in `sessionStorage` (`HSCustomerSession`, `hs_provider_demo_session`, `hs_admin_demo_session`). This needs real auth: OTP for customers, provider accounts, and admin SSO/MFA.
2. **Authorization:** Admin RBAC (`HSAdminRbac`) is evaluated in the browser. Every permission must be enforced server-side.
3. **Data store:** `MP` lives in localStorage (`hs_mp_db`). The `services/*-api.js` adapters are the integration seam: swap the mock transport in `services/api-client.js` for HTTP. Contracts are in `docs/API_CONTRACTS.md`.
4. **Realtime:** `services/realtime-client.js` is cross-tab only. It needs a server channel (WebSocket or SSE).
5. **Attachments:** `services/local-attachments.js` keeps files locally. It needs upload, malware scanning and signed URLs.
6. **Payments and commissions:** quote approval and collection status are state changes only. No payment provider is connected.
7. **Notifications:** in-app only. No SMS, email or push.

## 7. Security issues to address before backend integration
- **Trust boundary:** all business rules (status transitions, commission, quote approval) run in the client. The backend must re-validate every transition. The client is not a source of truth.
- **XSS:**
  - The heuristic scan found 16 unescaped `${…}` interpolations of name/text-like fields. All 16 were inspected: they render static catalog, guide or label data or form field names, not user input.
  - Once data comes from a server, every renderer must keep using `esc()`. A contract test that feeds markup through each API field is recommended.
  - Not a full audit: about 120 templates use `innerHTML`.
- **Session storage:** demo session ids in `sessionStorage` are trivially forgeable. Production tokens must be httpOnly cookies, never readable by JS.
- **Secrets:** none found in client code. `shared/config/app-config.js` explicitly forbids them.
- **No `eval`, `new Function` or `document.write`.**
- **CSP not configured:** Google Fonts and inline scripts in `index.html` (the intro pre-check) would need nonces or hashes.
- **Service-worker cache:** it caches app shell assets only. When APIs arrive, keep authenticated API responses out of the cache (the current fetch handler must be reviewed).
- **Untracked folders:** `.github/` and `ai-workforce/` (the DeepSeek MCP config) are untracked owner files. Never commit API keys from `ai-workforce/`.

## 8. Top 10 prioritized next actions
1. Run `npm run audit:refresh` and `npm run audit:inventory` in a clean worktree that excludes the owner's untracked folders, then report the change set for commit approval.
2. Re-run the paused `tests/e2e/interaction.cdp.js` (with owner approval) against the redesigned UI.
3. Define the backend auth model and replace the three demo session modules behind their existing interfaces.
4. Implement server-side enforcement for `HSAdminRbac` permissions and the request status machine (`docs/API_CONTRACTS.md`).
5. Swap `services/api-client.js` to an HTTP transport behind a flag, keeping the mock for tests.
6. Add an XSS contract test: inject `<img onerror>` through every API field and assert escaped output in all three apps.
7. Review the service-worker fetch strategy for API routes (network-only, no caching of authenticated responses), then add a CSP.
8. Replace the extracted brand assets with master files (vector logo) and add category photography.
9. Build the Account board's desktop layout and rebuild the wizard steps as board-style list rows.
10. Cross-browser and device pass: WebKit/Safari iOS, Firefox, a real Android device and a screen reader.

## 9. Exact starting point for the next Claude Code session
1. Read `docs/AI_CONTEXT/START_HERE.md`, then this file, then `docs/DESIGN_SYSTEM_V9.md`.
2. Run `git status`. Expect HEAD `b150dc6` plus the uncommitted redesign; do not commit `.github/`, `ai-workforce/`, `design-reference/` or `HANSALEHLAK-Approved-Design.zip.zip` without the owner's say-so.
3. Run `npm test` (expect 348/348). Then serve with `python -m http.server 8099 --bind 127.0.0.1` and run `node tests/e2e/a11y.cdp.js http://127.0.0.1:8099` (expect 112/112).
4. Begin with action 1 (inventory refresh in an isolated worktree), then report for commit approval.
