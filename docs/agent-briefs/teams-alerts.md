# Brief: teams, data separation, alerts, tickets

Worktree: `.claude/worktrees/agent-a89a53045aff8ab28` (branch `worktree-agent-a89a53045aff8ab28`; little was done —
check `git log -3`, keep anything useful). Owner decisions: owner + 4 staff, no regional managers, sensitive data
separated (internal or external staff), alerts in-app + mobile push now (WhatsApp later), email digests are a
separate task (do not build email).

1. Roles (keep old ids working; map sensibly): `ops` «عمليات ودعم», `finance` «المالية», `content` «المحتوى والأسعار»,
   `tech` «التقنية». Update `apps/admin/rbac-store.js` (catalogue, presets, RISK ranks), `apps/admin/permission-guard.js`
   (route map), nav visibility in `apps/admin/admin-shell.js`, a role-specific home (today queue filtered per team).
2. Data separation enforced on the server: generalise `adminDataPolicy` in `functions/src/scope.js` into a per-role
   policy — `tech` gets NO customers/providers/requests/transactions/chats/addresses/phones/emails (sync + every API
   response); `content` no PII; `finance` transactions with masked phones/addresses; `ops` what its work needs.
   Tests: a tech actor receives zero personal data via sync and every route.
3. Alerts engine: {team, severity critical|normal|info, kind, title, body, link, status open|claimed|resolved,
   claimedBy, dedupeKey, count}. Route existing signals (unassigned >30 min, empty bidding round, new complaint, cash
   dispute, overdue collection, pending provider, repeated errors, emergency switch, admin lockout). Channels
   [inApp, push] with a documented slot for WhatsApp; `notifyTeam(team, severity, payload)` exported (generalise
   `functions/src/owner-alerts.js`). Bell with unread count in the admin shell; claim «أنا هاخده» / resolve «تم»
   (audited); critical unclaimed after N min (setting, default 15) escalates to the owner (scheduled tick in
   `functions/index.js`).
4. Tickets «بلاغات»: {title, description, team, priority, status new|doing|done, owner, notes[], link}; create from an
   alert or manually; filter by team/status/mine; admin page + «صندوق الشغل» widget on each home. Audited.
Routes documented in docs/API_CONTRACTS.md. Tests for domain + server path (in-memory backend). Follow
docs/agent-briefs/README.md rules.

## Progress (2026-11-22, main merged into this branch, npm test green before alerts.js)
Done: roles/presets + mergePresets (rbac-store), apiDenied API gate (permission-guard + api-client), ops-core / ops-routes /
ops-api (demo), MP.raiseAlert + opsScan + events (local-market-store), runtime HS_ALERT_OUTBOX,
functions/src/alerts.js (storage, delivery inApp+push, notifyTeam, handle, tick/escalate) — NOT wired or tested yet.
Left, in order:
1. service.js: intercept alerts.PATH_RE like digest (unlocked admin) → alerts.handle; after runtime.request / tickOffers
   call alerts.ingest(res.alerts); runtime.createContext: roles = HSAdminRbac.mergePresets(stored roles).
2. index.js alertsClock every 5 min → alerts.tick(backend, op running MP.opsScan over open requests/pending providers/
   pending transactions); owner-alerts.notifyOwner also ingest an 'owner' alert; telemetry repeated errors → team tech.
3. scope.js adminView per role: tech → no customers/providers/requests/transactions/complaints/addresses/reviews;
   content → no PII; finance → masked phones/addresses; + response scrub in service.js for those roles;
   API_NEEDS add 'GET /admin/providers', 'GET /admin/requests/:id/candidates'.
4. Admin UI: index.html scripts (ops-core, ops-routes, ops-api) + SW precache; bell with unread in admin-shell header;
   pages alerts + tickets (NAV, LIVE_PAGES); work-box widget on home; role home route (tech→#/tech).
5. Tests (ops-core, ops-routes, alerts server via tests/helpers/memory-backend.js, tech gets zero PII), API_CONTRACTS docs.
