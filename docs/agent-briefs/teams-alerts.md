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
