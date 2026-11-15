# Brand assets (from the approved design boards)

Extracted from `design-reference/approved/*.png`. The original boards are unchanged.

| File | Board | How |
|---|---|---|
| `logo-wordmark.png` | الشعار ونظام الهوية (laptop screen) | Crop 530×195 at (1195,540), luminance-keyed alpha, recoloured `#135049`, trimmed to 517×162 |
| `logo-wordmark-light.png` | Same | Same alpha, white |
| `hero-technician.jpg` | هوية هنسهّلك | Crop (1128,40) 1032×1175, resized to 820 px wide, JPEG q82 |
| `trust-handshake.jpg` | تجربة واحدة متكاملة | Crop (1218,80) 942×1135, resized to 720 px wide, JPEG q80 |

The service worker precaches all four files. If the client supplies master files (a vector logo or full-resolution
photography), replace these files in place; the file names are referenced by CSS, `app.js`, `home.page.js`,
`index.html` and `service-worker.js`.
