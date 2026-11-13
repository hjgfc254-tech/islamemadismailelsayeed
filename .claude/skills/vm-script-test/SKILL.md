---
name: vm-script-test
description: Write or extend HANSALEHLAK V8 Node unit/behavior tests that load the project's classic browser scripts (IIFE + globalThis globals, order-dependent) into a node:vm sandbox. Use when adding tests under tests/unit/, especially Provider action/route tests, store mutations, or renderer contracts. No jsdom, no packages, no source changes for testability.
---

# VM Script Tests — HANSALEHLAK V8

The app has no modules or bundler. Each file is a classic script that registers globals
(`MP`, `CAT`, `ic`, `HSProvider*`, `HSAdmin*` …) and depends on the scripts loaded before it.
Tests reproduce that by running the real files, in production order, inside one `vm` context.

## Rules
- Location/name: `tests/unit/<area>-<topic>.test.js` (`npm test` globs only `tests/unit/*.test.js`).
- Use `node:test` + `node:assert/strict`. Built-ins only; do not add jsdom or any dependency.
- Load scripts in the exact order of the entry HTML (`apps/<app>/index.html`). Include only the prefix you need.
- Do not modify application source to make it testable (no new exports/hooks) without explicit approval.
- Assert behavior — state transitions in `MP.db()`, storage writes, rendered markup/attributes,
  rejected invalid input — not source text. Cover success, invalid, boundary and unknown-ID cases.
- Fresh context per test (or per `describe`) so localStorage state never leaks between cases.
- Before writing, read the nearest existing test for the same area and match its harness:
  `provider-pages.test.js` / `provider-request-domain.test.js` (node:test style),
  `home.test.js` (full Customer bootstrap with DOM stubs and DOMContentLoaded).

## Minimal harness
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');

function storage() { const m = new Map(); return {
  getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
  removeItem: k => m.delete(k), clear: () => m.clear(), _map: m }; }

function sandbox(files, extra = {}) {
  const ctx = vm.createContext({ console, setTimeout: () => 0, clearTimeout() {},
    localStorage: storage(), sessionStorage: storage(), location: { hash: '' }, ...extra });
  ctx.globalThis = ctx;
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
```

## Gotchas
- Top-level `const`/`let`/`class` in a script are NOT properties of the context; read them with
  `vm.runInContext('name', ctx)`. IIFE modules that assign `root.X` are reachable as `ctx.X`.
- Some legacy Customer harnesses strip a leading `'use strict';` before loading — copy the neighbour test's loader rather than inventing one.
- Storage contracts: `MP` persists to localStorage key `hs_mp_db`; Provider demo session uses
  sessionStorage key `hs_provider_demo_session`. Assert on these, never rename them.
- Entry scripts that boot on load check `document.readyState`; set it to `'loading'`, capture the
  `DOMContentLoaded` listener, then fire it — this tests deferred start (see `home.test.js`).
- Provider `apps/provider/app.js` exposes no API. Actions run through delegated `click`/`submit`
  listeners on the host returned by `HSProviderShell.mount()`. Read `onClick`/`onSubmit` first, then
  stub the DOM so you can capture those listeners and dispatch a synthetic event whose
  `target.closest('[data-pv-action]')` returns an element with the right `dataset`. Assert the effect on `MP.db()`.
- Add a script-order assertion against the real HTML when the test depends on order (pattern in `provider-pages.test.js`).

## Run
`node --test tests/unit/<file>.test.js`, then `npm test`. Finish with the `finish-gate` skill.
