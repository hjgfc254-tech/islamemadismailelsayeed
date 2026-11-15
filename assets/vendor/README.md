# Vendored third-party libraries (pinned, no package manager)

| File | Library | Version | Licence | Used by |
|---|---|---|---|---|
| `three.module.min.js` | Three.js | 0.160.0 | MIT (`three.LICENSE.txt`) | `apps/customer/intro-3d.js` (dynamic `import()`; intro only) |
| `gsap.min.js` | GSAP | 3.12.5 | GreenSock Standard "no charge" licence (https://gsap.com/standard-license) | Customer intro choreography (global `gsap`) |
| (build-time only) | Lucide | 0.460.0 | ISC (`lucide.LICENSE.txt`) | Path data extracted into `shared/icons/icon-registry.js` by `scripts/build-lucide-icons.cjs` |

Sources: `https://cdn.jsdelivr.net/npm/<pkg>@<version>/…`, downloaded unchanged.

- Three.js is **not** precached by the service worker. Offline, the intro falls back to its CSS layer.
- GSAP and `intro-3d.js` are precached.
- To regenerate the icons, download `lucide@0.460.0/dist/umd/lucide.js`, then run
  `node scripts/build-lucide-icons.cjs <path-to-lucide.js> shared/icons/icon-registry.js`. The script replaces its own
  block idempotently and fails if any icon name lacks a Lucide mapping.
