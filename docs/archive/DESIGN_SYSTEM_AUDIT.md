# HANSALEHLAK V8 — Design System Audit

**Date:** 2026-11-10  
**Scope:** Read-only audit of the live design tokens and the five application stylesheets present in the current archive.  
**Outcome:** Audit and regression guard added. No production CSS was changed.

## Executive summary

The live token source is `shared/design-system/design-system.css`. It is loaded by both `apps/admin/index.html` and `apps/customer/index.html`. The four split files under `shared/design-system/` (`tokens.css`, `typography.css`, `components.css`, `layout.css`) explicitly identify themselves as placeholders and are not competing runtime sources.

The CSS scan covers these five files:

- `apps/admin/styles/admin.css`
- `apps/admin/styles/admin-components.css`
- `apps/admin/styles/admin-responsive.css`
- `apps/customer/styles/customer.css`
- `apps/provider/styles/provider.css`

The scanner strips comments, parses declaration blocks (not `@media` conditions), ignores custom-property declarations, and counts literal values in selected declaration categories. It does not attempt to decide automatically whether every literal is a design defect.

| Application stylesheet | Colors | Layout dimensions | Radii | Font sizes | Shadow declarations | Numeric z-index | Total occurrences |
|---|---:|---:|---:|---:|---:|---:|---:|
| Admin `admin.css` | 5 | 26 | 2 | 4 | 2 | 0 | 39 |
| Admin `admin-components.css` | 30 | 70 | 3 | 11 | 5 | 0 | 119 |
| Admin `admin-responsive.css` | 1 | 2 | 0 | 1 | 1 | 0 | 5 |
| **Admin total / guard baseline** | **36** | **98** | **5** | **16** | **8** | **0** | **163** |
| Customer `customer.css` | 266 | 469 | 60 | 179 | 59 | 15 | 1,048 |
| Provider `provider.css` | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **All five files** | **302** | **567** | **65** | **195** | **67** | **15** | **1,211** |

“Layout dimensions” count pixel/rem/em/viewport dimensions in spacing and sizing properties such as margin, padding, gap, inset, width, height and flex-basis. Breakpoint conditions are excluded. Radius counts include pill values such as `999px`; these are not automatically defects. Font-size counts include responsive units. Shadow counts are declarations of `box-shadow` and `text-shadow`; `filter: drop-shadow()` is not included. Numeric z-index excludes values expressed through `var()` or `calc()`.

## Runtime findings

### 1. Shared token source

- Admin loads `shared/design-system/design-system.css` before its three Admin stylesheets.
- Customer loads its legacy `customer.css`, then the shared design-system stylesheet. The latter therefore overrides overlapping root aliases such as `--bg`, `--pink`, `--text`, and shared surface aliases for the live customer runtime.
- `shared/design-system/design-system.css` contains the active brand/semantic colors, spacing scale (`--sp-1` … `--sp-8`), radii, font-size scale, shadows, motion values and z-index layers.
- `tokens.css`, `typography.css`, `components.css`, and `layout.css` are extraction targets only; each is currently a placeholder.

### 2. Provider boundary

`apps/provider/styles/provider.css` is a 206-byte partial scaffold and contributes no counted literals. This does **not** mean the Provider workspace has no styles: its `.pw-*` workspace rules currently live inside `apps/customer/styles/customer.css`, and the Provider runtime remains coupled to the Customer entry/legacy bridge. Keep this distinction visible; do not claim the Provider design layer is independently extracted.

### 3. Admin hard-coded values

The Admin stylesheet baseline is **163 literal occurrences** across the categories defined above. `admin-components.css` accounts for most of them (119/163), followed by `admin.css` (39/163) and `admin-responsive.css` (5/163).

Existing tokens already cover much of the repeated structure. Remaining values include:

- Repeated semantic status tints and borders, including danger (`rgba(240,100,117,...)`), warning (`rgba(243,185,79,...)`) and info (`rgba(100,169,245,...)`). The solid semantic tokens exist (`--danger`, `--warning`, `--info`), but dedicated soft/border variants do not. These are good candidates for a later, deliberate token addition after checking all usages.
- Repeated pill radii (`99px` / `999px`) and compact font sizes such as `11px`, plus selected `20px` / `24px` heading or icon sizes. Some are component-specific and should not be replaced blindly.
- `44px` minimum control heights are intentional touch-target sizing, not spacing-scale drift.
- Layout constraints such as `320px`, `86vw`, viewport units, and responsive `clamp()` values are structural constraints and should remain explicit where they express behavior rather than a reusable design token.
- Active navigation inset markers and a small number of one-off shadows are component-state decoration, not necessarily global shadow tokens.

Admin currently uses tokenized z-index values and calculations; no raw numeric z-index declaration was found by this scan.

### 4. Customer migration debt

The Customer stylesheet contains the largest concentration of literal values. It also starts with a legacy `:root` token block (`--bg`, `--bg2`, `--pink`, `--pink2`, `--r-*`, `--gap`, `--pad`, etc.). Since the shared design system is loaded after it, overlapping aliases are overridden at runtime. This is a migration seam, not a reason to delete the legacy declarations without a selector-by-selector and browser regression review.

The `.pw-*` Provider workspace styles are mixed into this same Customer stylesheet. Extracting them belongs with the later Provider runtime separation task, not this read-only audit.

## Recommended tokenization order

1. Add semantic status surface/border tokens for repeated danger/warning/info tints only after checking contrast and all call sites.
2. Decide whether the Admin pill radius should use a dedicated `--r-pill` token or remain `999px`; preserve pill semantics either way.
3. Review Admin font literals against `--fs-xs` … `--fs-2xl`; retain icon sizes and intentionally compact labels where they are not text-scale roles.
4. Keep touch-target dimensions, breakpoints, viewport constraints, and responsive `clamp()` expressions explicit unless a genuine reusable component contract emerges.
5. Plan Customer legacy-token cleanup and Provider stylesheet extraction as separate behavior-preserving tasks with browser checks at 1280px, 768px and 390px.

## Regression guard

`tests/helpers/design-token-audit.js` implements the deterministic scanner. `tests/unit/design-token-audit.test.js` verifies the live stylesheet wiring and enforces that Admin CSS does not exceed **163** hard-coded literal occurrences. A reduction is allowed; a growth fails the test until the new values are reviewed and the baseline/report are intentionally updated. The test does not demand zero hard-coded values and does not police Customer CSS yet.

## Changes and limitations

- Added an audit report and a test-only scanner/guard.
- No production CSS, HTML, runtime JavaScript, or visual tokens were changed.
- This was a source-level inventory, not a full browser visual comparison. No claim is made that all five stylesheets were rendered and visually approved at 1280/768/390px in this audit.
- The scan is intentionally conservative and syntactic. It counts literal occurrences; it does not infer design intent or prove that a value should become a token.
