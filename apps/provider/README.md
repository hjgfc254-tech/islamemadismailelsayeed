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
`legacy/portal-compat.js` and `provider-workspace.js` support the older Provider experience inside Customer. They are not loaded by the standalone entry. Do not remove or merge them until a separate parity audit documents all globals, DOM selectors, routes, actions, script dependencies and Customer consumers, with regression tests proving parity.

## Next engineering work
Follow `docs/AI_AGENT_CONTINUATION_PROTOCOL.md`, section 6. The next task is behavioral coverage for request actions and route/deep-link workflows, not another visual rewrite.
