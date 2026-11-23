# NEXT SESSION — read this first (2026-11-22)

Owner writes Egyptian Arabic and wants replies in **Arabic**, simple words. Code/commits/docs in English.
**Do NOT spawn helper agents** (they burned the usage limit). Work yourself, one task at a time, keep reads small.

## Project in one paragraph
HANSALEHLAK home-services marketplace: customer / provider / admin web apps (classic scripts, `globalThis`
globals) + Firebase backend (`functions/`, region me-central1). Shared domain `services/*` is copied to
`functions/domain` by `npm run functions:sync`. Production: https://hansalahlak.web.app (also GitHub Pages).
Repo `main` is clean, pushed and deployed (last: 29f3941).

## Standing rules
- After every finished change: `npm run sw:bump` (if served files changed), `npm test` green,
  `npm run audit:refresh`, commit, push to GitHub and
  `firebase deploy --only "functions,firestore,database,hosting" --project hansalahlak --non-interactive`
  (pre-approved). Destructive data operations still need the owner's OK.
- Never commit secrets (.env, keys, service-account). Never force-push / reset --hard.
- Read only what the task needs: `docs/AI_CONTEXT/START_HERE.md`, then the exact files.

## Current task: admin responsibilities for owner + 4 staff
Owner decisions: 4 staff (internal or external) — sensitive data always separated; no regional managers;
alerts in-app + mobile push now (WhatsApp later); daily + weekly email digests.

Three parts, do in this order (task notes in `docs/agent-briefs/`):
1. **Email digests** — DONE 2026-11-22, merged into main and deployed (Admin › الإعدادات + header «الملخصات»).
   Default OFF; sending needs the owner's mail transport (RESEND_API_KEY or SMTP_* + MAIL_FROM, see DEPLOY_CHECKLIST).
2. **Tech center («مركز التقنية»)** — DONE 2026-11-22, merged into main and deployed (Admin route `#/tech`).
   Optional after each deploy: `npm run deploy:record` (needs `gcloud auth application-default login` once).
3. **Teams / data separation / alerts / tickets** — DONE 2026-11-23, merged and deployed: roles ops / finance /
   content / tech, alerts engine + bell + «التنبيهات» / «البلاغات» pages + «صندوق الشغل», alertsClock, per-role data
   separation. Not yet browser-checked; WhatsApp channel is a reserved slot only.
   Digests: Resend key is set in functions/.env with the TEST sender onboarding@resend.dev (delivers only to the
   Resend account's own e-mail) — needs a verified domain + MAIL_FROM change for staff addresses.

Merging tips: CSS conflicts → keep both sides; `service-worker.js`, `service-worker.lock.json` and generated docs →
take main's, then re-add new precache entries, `npm run sw:bump`, `npm run audit:refresh`.

## Owner inputs still pending (not code)
Email transport for digests (Resend API key or SMTP), support contact numbers in Admin › الإعدادات,
App Check site key, payment provider.
