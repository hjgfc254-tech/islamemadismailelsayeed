# Provider application — standalone frontend demo

## Entry and runtime
- Entry: `index.html` (RTL Arabic document).
- Runtime/orchestrator: `app.js`.
- Shell: `provider-shell.js`.
- Hash navigation: `provider-router.js`.
- Demo account selection: `provider-auth.js`.
- Demo session identifier: `provider-session.js`.
- Request grouping/domain: `provider-request-domain.js`, `provider-domain.js`.
- Local data: `services/local-market-store.js` (`MP`).
- Page renderers: `pages/*.page.js`.
- Styling: `styles/provider.css`.

## Important boundary
This is a standalone **frontend demo**, not a production provider portal. `MP` uses local demo storage. Account selection/session are not trusted authentication. All actions are local simulations; there is no server authorization, production API, database write, payment or payout.

## Runtime ownership
`app.js` owns data reads, route/render orchestration, event delegation and local demo mutations. Page modules render presentation using the context passed by the runtime. Do not put data writes or hidden global reads into page renderers.

## Script loading order
`index.html` loads shared icon/data/catalog/store dependencies first, then provider request/domain modules, demo identity/session/router/shell, all page renderers, and finally `app.js`. Preserve this order when adding a renderer or dependency. The standalone entry does not load Customer app scripts or the legacy bridge.

## Legacy compatibility — keep intact
The former in-Customer Provider experience (`legacy/portal-compat.js`, `provider-workspace.js`) was **removed on 2026-11-14** after the parity audit (`docs/PROVIDER_LEGACY_PARITY_AUDIT.md`) and capability migration. This standalone app is the only Provider UI. Customer reaches it only through the onboarding link `index.html#/join`, and `tests/unit/legacy-migration.test.js` guards against reintroduction. Do not restore those files.

## Next engineering work
Follow `docs/AI_AGENT_CONTINUATION_PROTOCOL.md`, section 6. The next task is behavioral coverage for request actions and route/deep-link workflows, not another visual rewrite.
