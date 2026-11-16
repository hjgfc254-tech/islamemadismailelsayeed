# HANSALEHLAK — Design Map (which file to edit for which look)

Quick rule: **markup** (what appears, texts, order) lives in the page's `*.page.js` / `app.js`; **look** (colors, sizes,
spacing, layout) lives in CSS. Never hard-code colors — use the tokens in `shared/design-system/design-system.css`.

## 1. Global look (all three apps)
| I want to change… | Edit |
|---|---|
| Brand colors, backgrounds, text colors, radii, shadows, spacing scale, fonts (tokens `--brand-primary`, `--accent`, `--bg-primary`, `--r-*`, `--sp-*`, `--fs-*`) | `shared/design-system/design-system.css` (`:root` block at the top) |
| Shared component look (buttons `.cta`, chips, cards `.glass`, inputs, bottom tab bar `#tabbar`, sheet `#sheet`, desktop top nav) | `shared/design-system/design-system.css` |
| Icons (shapes, names) | `shared/icons/icon-registry.js` (`X('name', …)`) |
| Category / service photo icons | `assets/icons/…webp` (or upload from Admin → إعدادات النظام → واجهة الموقع) |
| Logo / favicon / app icon | `assets/brand/logo-v10-*.webp`, `assets/app-icon-192.png`, `assets/app-icon-512.png`, `manifest.json` |
| PWA name, theme color, splash background | `manifest.json` |

**Load order matters.** Customer: `apps/customer/styles/customer.css` loads **before** `design-system.css`, so a rule
in design-system wins at equal specificity — in customer.css use a more specific selector (e.g. prefix `#view`).
Provider: `design-system.css` then `apps/provider/styles/provider.css`. Admin: `design-system.css`, then
`apps/admin/styles/admin.css`, `admin-components.css`, `admin-responsive.css`.

## 2. Customer app (`apps/customer/`)
| Screen / element | Markup (JS) | Style (CSS) |
|---|---|---|
| Page shell, `<head>`, script order | `index.html` | — |
| Top bar, tab bar, navigation, toasts, sheets, help button, offline banner | `app.js` (`topbar`, `renderTabs`, `toast`, `sheet`, `mountHelpAndNet`) | `styles/customer.css` + `design-system.css` |
| **Home** (hero, trust strip, how it works, categories, reviews, packages, invite, banner) | `pages/home.page.js` (layout) + `app.js` (`home()` context, `tile`, `discover`, `homeAddressBar`, `homeTrending`, `homePackages`, `homeInvite`) | `customer.css` (`.hero`, `.trust-strip`, `.how`, `.reviews-strip`, `.pkg-*`, `.invite-card`, `.site-banner`, `.addr-bar`, `.trend`) + `design-system.css` (`.hero` desktop/mobile sizes) |
| Hero texts / image | Admin → إعدادات النظام → واجهة الموقع (no code) — defaults in `shared/content/site-content.js` | `.hero*` rules |
| Services page («الخدمات») + filters | `app.js` (`sections()`, `sectionsTiles`) | `.sec-filters`, `.grid`, `.tile` |
| Search | `pages/search.page.js` / `app.js` (`search`) | `.sr-*` |
| **Request wizard** (steps, map, schedule, price card, promo, summary column) | `pages/request-wizard.page.js` | `.wz-*`, `.price-card`, `.cat-hero`, `.quick-when`, `.promo-field`, `.wz-map` |
| Orders list | `pages/orders.page.js` | `.prow`, `.mj`, `.rb` |
| **Order tracking** (journey, provider card, chat, ETA, receipt, actions) | `pages/order-details.page.js` (+ actions in `pages/market-ui.page.js`) | `.journey`, `.prov-card`, `.chat-*`, `.cm`, `.eta-card`, `.receipt` |
| Rating / complaint / cancel sheets | `pages/market-ui.page.js` | `.stars-in`, `.rv-tags`, `.ask-chips` |
| Provider profile | `pages/providers.page.js` | `.provider-hero`, `.rating-break` |
| Account, sign-in card, font size | `pages/account.page.js` | `.auth-card`, `.seg` |
| Addresses | `pages/addresses.page.js` | `.addr-*` |
| Support center, FAQ, policies (privacy / terms / cancel texts) | `pages/support.page.js` (`FAQ`, `POLICIES`) | `.card2`, `.need` |
| Discover slides | `pages/discover.page.js` + Admin content | `.slides` |

## 3. Provider app (`apps/provider/`)
| Element | Markup | Style |
|---|---|---|
| Top bar / nav / shell | `provider-shell.js` | `styles/provider.css` (`.pv-topbar`, `.pv-nav`) |
| Dashboard hero, today card, level, week, demand, KPIs | `app.js` → `summary()` | `.pv-hero`, `.pv-today`, `.pv-level`, `.pv-week`, `.pv-demand`, `.pv-kpis` |
| Request cards (buttons, ETA chips, notes, swipe) | `app.js` → `requestCard()` | `.pv-request`, `.pv-actions`, `.pv-chip`, `.pv-eta-pick` |
| Request details + chat | `pages/request-details.page.js` + `app.js` → `chatPanel()` | `.pv-chat*` |
| Inline forms (reject, quote, complete, rate customer) | `app.js` → `openForm()` | `.pv-inline-form` |
| Other pages | `pages/<name>.page.js` (earnings, reviews, schedule, profile, services, notifications…) | `provider.css` |

## 4. Admin center (`apps/admin/`)
| Element | Markup | Style |
|---|---|---|
| Header, sidebar, navigation list, quick-search button | `admin-shell.js` (`NAV`) | `styles/admin.css`, `admin-components.css`, `admin-responsive.css` |
| Dashboard (KPIs, charts) | `pages/admin-dashboard.page.js`, charts in `modules/mini-charts.js` | `.dash-*`, `.mc-*` |
| Quick search (Ctrl+K) | `modules/command-palette.js` | `.cp*` |
| Live server panels (settings, audit, departments, security) | `modules/admin-live-panels.js` | `.adm-live-panel` |
| Site content editor (hero, slides, icons, banner) | `modules/site-content-editor.js` | inline + `.adm-live-panel` |
| Promos / invite / packages | `modules/marketing-editor.js` | `.mk-row` |
| Each management page | `pages/<name>.page.js` | `admin-components.css` |

## 5. Text (copy) changes
UI texts are Egyptian Arabic strings inside the page files above. Status names: `STATUS_LABEL` in
`services/local-market-store.js`. Catalogue names (categories, devices, problems): `shared/config/legacy-data.js` and
`services/local-catalog.js` (or Admin → الخدمات / التصنيفات).

## 6. After any design change
1. `npm test` (some tests pin class names and the admin hard-coded-values baseline in `tests/unit/design-token-audit.test.js`).
2. Bump `CACHE` in `service-worker.js` (and the 4 tests that pin it) so installed apps get the new files.
3. `npm run audit:refresh && npm run audit:inventory` if files were added or removed.
