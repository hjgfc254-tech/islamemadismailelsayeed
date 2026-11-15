# HANSALEHLAK — approved identity design system (2026-11-14)

**Source of truth:** the 11 approved boards in `design-reference/approved/` (identity, logo, colours, design system,
customer homepage, service discovery, request journey, customer account, provider space, admin dashboard, integrated
experience). The boards define the look. The existing code defines behaviour, data and routes; the catalog, wizard
steps, validations, APIs and storage were not changed.

This file supersedes the earlier V9 «Souq Modern» palette (#176B50 / #F7F7F2 / #EF9D45 / rose / champagne). That
palette was the previous directive's, not the approved boards'.

## Colour tokens (`shared/design-system/design-system.css`)

Values were **sampled from the boards' pixels** (13×13 px averages of each swatch). Board names are in quotes.

**Brand**

| Token | Value | Board role |
|---|---|---|
| `--brand-primary` / `--emerald` | `#135049` | «الأخضر الرئيسي — للخلفيات»: brand, primary actions, hero shape (white text 9.2:1) |
| `--brand-primary-strong` / `--emerald-deep` / `--nav-dark-bg` | `#0B3E38` | Account/Provider sidebar; small white text (11.6:1) |
| `--brand-primary-hover` / `--emerald-mid` | `#1E6C60` | Design-system board «ابدأ الطلب» button tone |
| `--nav-dark-active` | `#2F6A61` | Active sidebar pill (board sample `#38766C`, darkened for AA) |

**Supporting colours**

| Token | Value | Board role |
|---|---|---|
| `--ivory` | `#F1EADD` | «البيج الفاتح — للخلفيات»: hero/trust/provider welcome bands |
| `--accent` / `--orange` | `#D17D32` | «البرتقالي الدافئ — للعناصر التفاعلية»: CTA fill with dark text (`--on-accent`). Never small text on light. |
| `--sage` | `#748F78` | «الأخضر الثاني — للعناصر المساندة»: supporting decoration |
| `--text-primary` / `--charcoal` | `#1E2A29` | «الرمادي الداكن — للنصوص» |

**Backgrounds, tints and states**

| Token | Value | Board role |
|---|---|---|
| `--lavender` → `--bg-primary` | `#E3EBFF` → `#F5F7FD` | Light periwinkle canvas (boards' `#8AADFF`→`#F3F6FF` sky, softened for UI) |
| `--tint-sand/sage/sky/lilac` | `#EFE6D9` `#E6EAE6` `#E5ECF1` `#E9E5EA` | Admin board panel tints: category cards, KPI plates |
| `--mint` / `--mint-strong` | `#E2F4EF` / `#AAF4E6` | Request board selected row (`#D6FBF4`) and step numerals |

**Estimates (not confirmed board values):**
- the typefaces (see below);
- `--text-secondary` and `--text-muted`;
- the border greys;
- the semantic success/warning/danger/info values, which were chosen for WCAG AA.

**Retired:** `--rose` and `--champagne` are aliased to the orange; legacy aliases (`--pink`, `--bg`, `--card`…) still
map onto the tokens.

## Typography
- **Display:** `Baloo Bhaijaan 2` 600–800. This is a visual estimate of the boards' heavy, rounded Arabic headline
  face, which the boards do not name.
- **UI and body:** `IBM Plex Sans Arabic` 400–700, also a visual estimate.
- Display is used for `h1`, `.sec-title` and `.dhead h2`. Other headings use `--font-ui-head`.

## Brand assets (`assets/brand/`, extracted from the approved boards; originals untouched)

| File | Source board | Use |
|---|---|---|
| `logo-wordmark.png` | Logo & Identity (laptop screen) | Customer app bar and footer, desktop header, Provider and Admin brand |
| `logo-wordmark-light.png` | Same | Cinematic intro, dark surfaces |
| `hero-technician.jpg` | Hansalehlak Identity | Customer homepage hero |
| `trust-handshake.jpg` | One Integrated Experience | Homepage trust band |

- The two logo files are dark-green and white versions with a transparent background, 517×162.
- Both photos are crops: 820×934 and 720×868.
- Scripts used: luminance-keyed alpha for the logo, a bicubic crop for the photos. The service worker precaches all four.

## Components and screens
| Board | Implementation |
|---|---|
| Customer Homepage | `.hero` text column on the organic primary-green shape (`--blob`) beside the photo on the periwinkle sky. Search with a square green action, orange «ابدأ الطلب». Category cards with pastel panels. Trust band and footer. Phone: photo on top, green text block, list rows with chevrons. |
| Desktop header | One white bar: wordmark at the start, text navigation with an underline (the existing `#tabbar`, restyled ≥1024 px), account actions at the end. Phones keep the bottom tab bar. |
| Service Discovery | Same category cards; `.ip` icon plates are light tints; list rows (`.prow`) wrap long status pills. |
| Request Journey | A focused 820 px column on desktop. Selected choice in mint with a green ring. Green progress segments. All 10 steps, rules and validations unchanged. |
| Customer Account / Orders | White rows, pastel status pills, mint active filter. |
| Provider Space | Wordmark, deep-green sidebar with a lighter active pill (≥1024 px), ivory welcome panel with the organic shape, white stat cards. Phones: bottom icon bar. |
| Admin Dashboard | Wordmark, deep-green sidebar, white KPI cards with sand/sage/sky/lilac plates. The data-dense layout is unchanged. |
| Cinematic intro | The white wordmark on deep green with mint/orange/beige light, the Three.js star dome and GSAP choreography, and the boards' tagline «خدماتك، في تجربة أسهل.». Once per session, skippable, reduced-motion safe. |

## Iconography
- Lucide 0.460.0 only, extracted at build time by `scripts/build-lucide-icons.cjs`.
- 188 registry names map to 146 Lucide icons.
- The script now also covers direct `ICON_DEFS['…']` definitions; before this, plumbing and 3 problem icons still drew
  the old artwork.

## Guardrails verified (2026-11-14)

| Check | Result |
|---|---|
| `npm test` | 348/348 |
| `a11y.cdp.js` (WCAG AA contrast on every audited screen) | 112/112 |
| `responsive-sweep.cdp.js` (1280 / 768 / 430 / 390 / 320) | 280/280 |
| Customer runner | 160/160 |
| Provider runner | 261/261 |
| Admin runner | 124/124 |
| Guest runner | 165/165 |

- No framework or build step was added.

## Known gaps
- Category and service cards use Lucide icons on pastel panels. The boards show photographs per category, but the
  project has no licensed category photography. The tiny laptop-screen thumbnails in the boards are too small and
  skewed to extract.
- The request wizard, search results and discovery detail screens received token, card and selection styling. Their
  structure is unchanged; it was not rebuilt screen by screen.
- The Customer Account board's desktop sidebar layout (profile panel beside the orders) is not implemented. Account
  keeps its existing tabbed structure.
- The web fonts load from Google Fonts. In the offline/test browser the system fallback is shown.
