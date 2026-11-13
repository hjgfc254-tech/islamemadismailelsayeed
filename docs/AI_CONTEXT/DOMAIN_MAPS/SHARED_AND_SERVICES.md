# Shared Components and Local Services Map

## Shared design and UI
- `shared/design-system/design-system.css` is the live aggregate stylesheet and current token source (colors, spacing, radii, type scale, shadows, motion, z-index).
- `shared/design-system/tokens.css`, `typography.css`, `components.css`, and `layout.css` are documented extraction placeholders; do not treat them as runtime sources.
- Design-system source audit: `docs/DESIGN_SYSTEM_AUDIT.md`; Admin literal-count guard: `tests/unit/design-token-audit.test.js` (baseline 163).
- `shared/design-system/`: tokens, typography, components, layout, aggregate stylesheet.
- `shared/icons/icon-registry.js`: central icon registry (188 definitions + 23 aliases as of 2026-11-10); dynamic status/section/problem mappings must be validated as well as literal calls. Audit: `docs/ICON_ASSET_AUDIT.md`; regression test: `tests/unit/icon-asset-audit.test.js`.
- `shared/components/ui-kit.js`: general UI states/primitives.
- `shared/components/data-grid.js`: in-memory search/filter/sort/pagination grid.
- `shared/components/dialogs.js`: dialog primitive(s).
- `shared/components/status-badge.js`: centralized status labels/tones.
- `shared/utils/money.js`: `HSMoney`.
- `shared/utils/tree.js`: tree operations.
- `shared/utils/dates.js`, `errors.js`, `formatting.js`, `sanitization.js`, `validation.js`: shared pure helpers with Node tests; do not assume feature modules consume them until explicitly wired.
- `shared/config/app-config.js`, `routes.js`, `feature-flags.js`: public demo config, canonical route IDs and conservative UI flags; never use these for authorization.
- `shared/types/{order,account,provider,permission}.types.js`: runtime structural validators for demo objects; not database schemas or server trust boundaries.

## Other component files
`buttons.js`, `forms.js`, `tables.js`, and `notification-center.js` now expose tested render primitives. They are not globally wired into legacy pages yet; check each API and keep caller-owned state/actions outside these components.

## Local demo services
- `services/local-catalog.js`
- `services/local-market-store.js`
- `services/local-attachments.js`
- Other `*-api.js` files may be adapter/placeholders; inspect before use. Their names do not imply a live API.

## Reuse rule
Before building a UI primitive, inspect the current implementation and its API, then search for existing usage. Do not infer readiness from the filename.

- `shared/components/accessible-tabs.js`: shared horizontal tab keyboard behavior (roving tabindex, arrows, Home/End, RTL); currently wired to Admin notifications/permissions/security and Customer guide carousel. Tests: `tests/unit/accessible-tabs.test.js` and `tests/unit/accessible-tabs-contract.test.js`; report: `docs/KEYBOARD_ACCESSIBILITY_AUDIT.md`.
