# Brief: design micro-audit and fixes (look only, not technology)

Owner request (2026-11-25): «ايجنت بيعمل تدقيق بالغ في التصاميم — يمشي حتة حتة في كل حتة صغيرة في المنصة، ويصلح لو لقى مشكلة».
Follow `docs/agent-briefs/README.md`, but use `Claude-Session: https://claude.ai/code/session_01W3TuWCKWoe3KxU6igeoy12`.
You work in your own worktree; never push or deploy. Another agent is auditing the technology in parallel: **do not edit
`functions/`, `services/`, `firestore.rules`**, and keep JS edits to markup / class names only.

## What to audit (every screen, every state, piece by piece)

**Apps:**
- Customer (`apps/customer/index.html`):
  - the main pages: Home, Services, Search, wizard steps 1–5 and the done screen, Orders (empty / with orders / filters), order details in different statuses;
  - Account (signed out and signed in), Addresses, Support centre and every sheet (FAQ, complaint, contact, policies, emergency, diagnose);
  - the chat (`#hs-chat`), the side menu, notifications, toasts, the guide bubble.
- Provider (`apps/provider/index.html`), including `#/join`.
- Admin (`apps/admin/index.html`):
  - the demo account picker in local mode;
  - every page in the nav.

**Widths:** 320, 390, 430, 768, 1280 px. RTL. Light theme (the apps have no dark mode — do not invent one).

**Look for:**
- **Alignment and spacing:** misalignment, uneven spacing (use the spacing/radius/shadow tokens, e.g. `--hs-r-sm/md/lg`, `--hs-shadow`, `--sp-*`).
- **Text:** text overflow / clipping / ugly wraps, truncated buttons, colliding elements, horizontal scroll.
- **Contrast:** text below WCAG AA.
- **Tap targets:** smaller than 44 px.
- **Focus rings:** missing or invisible.
- **Consistency:**
  - inconsistent icons (one 40 px icon box, red icons only for urgency / section headings);
  - inconsistent headings (`.sec-title` style: red icon + display font);
  - inconsistent buttons (primary red «اطلب خدمة», navy for forms, ghost for secondary).
- **Empty, loading and error states:** missing or ugly.
- **Arabic typos / mixed tone:** customer copy is friendly Egyptian Arabic; legal pages are formal.
- **RTL bugs:** arrows pointing the wrong way, numbers/LTR bits breaking lines.
- **Images:** stretched or blurry.
- **Layering:** z-index clashes (sheets, chat, tab bar, toasts).

## How

- **Serve and run:**
  - serve with `python -m http.server <free port> --bind 127.0.0.1` from your worktree;
  - drive headless Edge with `tests/e2e/lib/cdp.js` (`withBrowser`, `setupPage`, `driver`);
  - `setupPage` forces local demo mode, which is fine.
- **Screenshots:** take screenshots with `Page.captureScreenshot` (use `clip` + `scale`). The page height lives in `#view` (scroll container), not `document`. Look at every screenshot yourself before and after a fix.
- **Where to fix:**
  - Fix in CSS first. Customer: the end of `apps/customer/styles/brand-2026.css` as a new section «round 9 — design micro-audit». Provider: `apps/provider/styles/brand-2026.css` (every `pv-*` class needs a rule in `provider.css`). Admin: `apps/admin/styles/brand-2026.css` — **tokens only**, the hard-coded-value audit test must stay green.
  - Change markup only when CSS cannot fix it; keep DOM hooks, ids, `data-*`, routes and script order.
- **Keep the 2026 identity** (navy #0B1F3A, red #E1251B) and everything the owner approved; do NOT redesign, remove sections or add features. Small, safe, many fixes.
- **Graph:** use `graphify query "<question>"` before broad searching (graphify-out/ exists in the main folder).
- **Final checks:**
  - `npm run sw:bump`, `npm test` (all green);
  - runners `a11y`, `responsive-sweep`, `guest`, `customer-orders`, `provider-standalone`, `admin-app`: `node tests/e2e/<r>.cdp.js http://127.0.0.1:<port>`;
  - `npm run audit:refresh`, commit.

## Final reply (Arabic, short)

1. Branch and commit.
2. A numbered list of every problem found → fixed (screen, width, what was wrong, what you changed).
3. Anything you saw but did not fix, and why.
4. Paths of 3–6 before/after screenshots in your worktree.
