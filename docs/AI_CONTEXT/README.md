# AI Context Pack

This folder is the compact, token-efficient entry point for engineers and AI agents.

## Read order
1. `START_HERE.md` — current project state and exact next task.
2. `docs/MAINTENANCE_GUIDE.md` — the current system map (`DOMAIN_MAPS/` are historical frontend-phase notes).
3. `FILE_INDEX.json` — compact inventory (path, status, size, SHA-256).
4. Exact source files, tests, and only the detailed specifications needed for the task.

## Do not bulk-load
The full `docs/AI_PROJECT_MAP.json`, its CSV/Markdown exports, the full file catalog, and the project tree are reference artifacts. Load them only for inventory reconciliation or a task requiring their detailed contracts.

## Source-of-truth order
1. Actual source and runtime wiring.
2. Tests that execute behavior.
3. Current handoff and implementation status.
4. Detailed specifications.
5. Generated inventory descriptions.

When sources disagree, report the conflict and verify it; do not guess.

### Accessibility and keyboard behavior
For shared horizontal tablists, read `shared/components/accessible-tabs.js` and `docs/archive/KEYBOARD_ACCESSIBILITY_AUDIT.md`. It is currently integrated into Admin notifications/permissions/security and the Customer guide carousel. This does not imply full WCAG or screen-reader verification.
