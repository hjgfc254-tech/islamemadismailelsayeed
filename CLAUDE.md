# HANSALEHLAK (هنصلحلك) — Claude Code Project Rules

## Session start (token-efficient)
1. Read `docs/AI_CONTEXT/START_HERE.md`.
2. For server, route, clock or env work, read the relevant part of `docs/MAINTENANCE_GUIDE.md` (the system map, pinned to the code by `tests/unit/wiring.test.js`).
3. Read `docs/HANDOFF_NEXT_AI.md` only when resuming implementation or when the next task is unclear.
4. Use `docs/AI_CONTEXT/FILE_INDEX.json` to locate files and statuses. Do **not** load the full `docs/AI_PROJECT_MAP.json`, `AI_PROJECT_MAP.csv`, `AI_PROJECT_MAP.md`, `FRONTEND_FILE_CATALOG.md`, or `PROJECT_TREE.md` unless the task requires full detail.
5. Read the exact source files and tests that the task touches. Source code outranks stale documentation. Documents marked «Historical» describe the old frontend-only phase.

## Current phase
**Paused / archived (2026-11-27)** until the owner is ready to launch: the code is complete and pushed to GitHub, Firebase Hosting is **disabled** (the site is offline), Cloud Functions / Firestore / Auth stay in the Firebase project. To go live again: `firebase deploy --only functions,hosting` (see `docs/HANDOFF_NEXT_AI.md`, top entry). The apps default to the real backend; `?backend=local` is the offline demo used by tests and browser runners. Browser runners pin local mode and block production hosts — never point tests at production data.

- Shared business rules live in `services/*.js` and are copied to `functions/domain` with `npm run functions:sync` after every change there.
- Payments: cash today. Online payment (Paymob) is built on the server and stays off until the owner sets `PAYMOB_*`. The server never enables the simulated «demo» gateway.
- While paused: push to GitHub only; do **not** redeploy hosting until the owner says so. (Before the pause the standing approval was push + `firebase deploy` after each change.) Destructive data operations, installing tools and anything costing money need the owner first. Never commit secrets.
- The old `backend/` and `database/` scaffolding was removed on 2026-11-27 (owner request); the server is `functions/`.

## Change discipline
- Before creating a file/component, search for an existing implementation.
- Work on one task at a time; modify only the target and necessary dependencies.
- Do not rewrite legacy modules or remove compatibility bridges without proven parity and regression tests.
- Preserve existing visual identity, RTL, responsive behavior, and accessibility.
- Never claim a mock/local action is a production action.
- After editing served files run `npm run sw:bump` (a test fails otherwise). New routes, functions exports, env vars or Admin pages must be added to `docs/MAINTENANCE_GUIDE.md` / `docs/API_CONTRACTS.md` (tests fail otherwise).
- Do not delete files based only on name, age, size, or lack of static references. Prove they are unused across HTML script loading, imports, dynamic loading, routes, runtime globals, tests, and documentation first.

## Required checks
- Run the most relevant targeted tests.
- Run `npm test` before handoff.
- After adding/removing files or changing project docs, run `npm run audit:refresh` to regenerate the canonical map, compact index, exports and tree; newly discovered files are marked `NEEDS_REVIEW`.
- Then run `npm run audit:inventory` to verify tracked paths and SHA-256 hashes.
- Run browser checks when available; report unavailable checks honestly.
- Update implementation status, next-task order, handoff, and relevant domain docs.

## Handoff
At the end, report changed/created/deleted files, tests actually run, unresolved risks, and the exact next task. Keep `docs/AI_CONTEXT/START_HERE.md` concise and current.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- The graph is code-only: docs are not indexed. Exclusions live in `.graphifyignore`, which also honours `.gitignore`. Secrets, backups, vendored libraries and tool state are excluded.
- **No LLM calls.** Rebuild only with `graphify extract . --code-only` or `graphify update .`. Run `graphify cluster-only . --no-label`, and never `graphify label`, unless the owner approves. An LLM API key in the environment is auto-detected and would send code to that provider.
- The apps are classic scripts linked through `globalThis` globals, so `graphify path` often finds no edge between modules. Confirm cross-file usage with a pattern search.
- `graphify-out/` is local generated output. It is git-ignored and never committed.
