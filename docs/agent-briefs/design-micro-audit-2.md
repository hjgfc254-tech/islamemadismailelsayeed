# Brief: design micro-audit, part 2 (continue)

Same task and rules as `docs/agent-briefs/design-micro-audit.md` — read it first and follow it exactly. That brief's
`Claude-Session` override applies. A first agent was stopped part-way. Its fixes are already on main (commit 401be64..f917381,
section «round 9 — design micro-audit» at the end of `apps/customer/styles/brand-2026.css`):
- order numbers wrapped in `<bdi class="code">` everywhere;
- the request-sent number pill;
- `.sec-more` links;
- the guide-bubble tail and 44 px buttons;
- the gov-banner arrow;
- the provider avatar initials;
- the tracking-chat heading gap;
- the FAQ / complaint copy in Egyptian Arabic;
- «طلبات» plural.

Do not redo those. Continue with everything not yet covered, in this order:
1. **Customer:**
   - the wizard steps 2–5 and the done screen;
   - order details in several statuses (create a demo order through the wizard in local mode);
   - Account signed in, Addresses, every Support sheet, the emergency and diagnose sheets, the chat (`#hs-chat`);
   - the side menu, notifications, search results, at 320 / 390 / 768 / 1280.
2. **Provider app** (`apps/provider/index.html` + `#/join`) — every screen and state.
3. **Admin** (`apps/admin/index.html`, local demo account picker → every nav page) — tokens only in admin CSS.

Another agent is restructuring code in parallel (functions/, services/, admin JS modules, docs):
- **do not edit `functions/`, `services/`, `docs/`** (except nothing);
- in `apps/admin/**/*.js` change class names / markup only when CSS cannot fix it;
- put new CSS in a new section «round 10 — design micro-audit 2» at the end of each app's `brand-2026.css`.

Commit early and often on your branch (every ~10 fixes), so work is never lost if you are stopped.
