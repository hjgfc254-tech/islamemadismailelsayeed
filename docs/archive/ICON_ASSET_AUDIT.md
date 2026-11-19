# HANSALEHLAK V8 — Icon and Asset Audit

**Date:** 2026-11-10  
**Scope:** Central icon registry, static icon references, shipped image assets, and Service Worker precache.  
**Outcome:** One confirmed missing dynamic icon fixed; regression checks added. No existing image asset was deleted or replaced.

## Executive summary

- `shared/icons/icon-registry.js` now contains **188 icon definitions** and **23 aliases**.
- Every definition builds non-empty SVG markup; every alias points to a registered definition.
- Status, section and problem-rule maps point only to registered icons.
- The scan found 59 unique statically declared icon names across direct `ic(...)` / `icon(...)` calls and `icon:` properties. All resolve through the registry.
- Six shipped image assets exist, are referenced by the current app/PWA paths, and are listed in the Service Worker precache. No two assets are byte-identical.
- A dynamic Provider queue branch requested `ic('inbox')`, but no such definition or alias existed. That branch rendered an empty SVG. Added a matching `inbox` definition and bumped the Service Worker cache from `hansalhlak-v8-architecture-1` to `hansalhlak-v8-architecture-2` so the updated icon registry and Provider workspace can be fetched after deployment.

## Icon registry findings

| Check | Result |
|---|---:|
| Icon definitions | 188 |
| Aliases | 23 |
| Unique static icon names in JS calls/properties | 59 |
| Definitions rendering non-empty SVG | 188 / 188 |
| Broken aliases | 0 |
| Broken status/section/problem map targets | 0 |
| Missing static references | 0 |

The registry is loaded before app modules in both `apps/customer/index.html` and `apps/admin/index.html`. Admin pages use the same `ic()` registry through their local `icon()` wrappers. Provider workspace uses the registry from the Customer runtime while the legacy compatibility bridge remains in place.

### Confirmed defect fixed

`apps/provider/provider-workspace.js` (removed 2026-11-14; historical finding) selected icons for priority queue rows using a runtime ternary. The `new` queue branch requested `inbox`, which was absent. The registry now defines `inbox` using the existing SVG layer conventions. No unrelated icon was renamed or removed.

## Image asset inventory

| Asset | Bytes | Usage / reference |
|---|---:|---|
| `assets/icon.svg` | 553 | Admin and Customer favicon; PWA manifest; Service Worker |
| `assets/logo-mark.webp` | 88,562 | Customer intro mark and CSS mask/preload |
| `assets/logo-word.webp` | 83,636 | Customer intro wordmark and CSS mask/preload |
| `assets/slide-guide.svg` | 6,527 | Customer intro/content slide data; Service Worker |
| `assets/slide-latest.svg` | 6,968 | Customer slide data; Service Worker |
| `assets/slide-popular.svg` | 5,228 | Customer slide data; Service Worker |

All three SVG files parse as XML, include an SVG root and `viewBox`, and all six assets are non-empty and precached. SHA-256 comparison found no byte-identical duplicates.

## Architecture notes

- Icons are predominantly inline SVG generated from JavaScript path definitions; they are not separate image files and should not be counted as missing assets.
- Several icon selections are dynamic (`icStatus`, `icCat`, `icItem`, `icProb`, `icSec`, Provider tab/queue mappings). Static string search alone is insufficient. The tests validate the registry's dynamic mapping tables and explicitly cover the Provider queue's conditional icon choices.
- The historical `docs/ICON_SYSTEM_REPORT.md` describes an earlier V6 icon count. It is historical documentation, not the current source of truth; the current registry and this audit report take precedence.
- `PROJECT_CONTROL_CENTER.html` contains an embedded historical file inventory and is not treated as a runtime asset reference source.

## Regression protection

`tests/unit/icon-asset-audit.test.js` verifies:

1. Every icon definition renders non-empty SVG and every alias resolves.
2. Status, section and problem-rule targets exist.
3. Static icon calls and declared icon properties resolve.
4. The dynamic Provider queue icon choices exist.
5. All six shipped image assets exist, are referenced, and are precached.
6. No shipped image assets are byte-identical duplicates.

`tests/unit/design-system.test.js` and `tests/unit/static-audit.test.js` were updated for Service Worker cache version `hansalhlak-v8-architecture-2`.

## Limitations

- This is a source-level icon and asset audit plus XML/SHA checks, not a complete visual review of every icon at every viewport.
- No assets were deleted. A file with no obvious static reference is not considered safe to remove until dynamic loading, runtime data, CSS masks/backgrounds, manifest usage and precache behavior are all ruled out.
- No real-device, Safari or Firefox verification was performed in this task.
