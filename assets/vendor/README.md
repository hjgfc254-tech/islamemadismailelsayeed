# Vendored third-party libraries (pinned, no package manager)

| File | Library | Version | Licence | Used by |
|---|---|---|---|---|
| `firebase/13.1.0/*.js` | Firebase JS SDK (modular) | 13.1.0 | Apache-2.0 | `services/firebase-backend.js` (dynamic `import()`). `firebase-app-check.js` is kept for the optional App Check rollout. |
| (build-time only) | Lucide | 0.460.0 | ISC (`lucide.LICENSE.txt`) | Path data extracted into `shared/icons/icon-registry.js` by `scripts/build-lucide-icons.cjs` |

Sources: `https://cdn.jsdelivr.net/npm/<pkg>@<version>/…`, downloaded unchanged.

GSAP, Three.js and `apps/customer/intro-3d.js` were removed on 2026-11-15 when the intro became a pure-CSS logo reveal.

To regenerate the icons, download `lucide@0.460.0/dist/umd/lucide.js`, then run
`node scripts/build-lucide-icons.cjs <path-to-lucide.js> shared/icons/icon-registry.js`.