# Brand assets

| File | Source | Used by |
|---|---|---|
| `logo-v10-lockup.webp` | Owner logo (2026-11-15): white background removed; house mark beside the bilingual wordmark | Customer header (`app.js`, `home.page.js`), desktop bar (`design-system.css`), Provider and Admin brand |
| `logo-v10-lockup-light.webp` | Same lockup; wordmark recoloured light for dark sidebars | Admin sidebar (`admin-components.css`) |
| `logo-v10-mark.webp` | House mark only | Intro, favicon, account sign-in card |
| `logo-v10-word.webp` | Arabic and Latin wordmark lines | Intro |
| `hero-technician.jpg` | Approved board photography | Home hero |
| `trust-handshake.jpg` | Approved board photography | Home trust band |

App icons: `assets/app-icon-192.png` and `assets/app-icon-512.png`. They are the mark on white and are referenced by `manifest.json`.

Service icons: `assets/icons/svc/<group>/<name>.webp`. They are cut from the owner's icon sheets, with the gold recoloured to silver, and are mapped in `shared/icons/icon-registry.js` (`ICON_PHOTO_ITEMS`).

The service worker precaches the logos, the app icons and the home category icons. Item icons load lazily.

Replace a file in place to update it. The file names are referenced by the files listed above.