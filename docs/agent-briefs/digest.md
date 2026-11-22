# Brief: daily / weekly email digests — FINISH the saved partial work

Worktree: `.claude/worktrees/agent-a0c5922f20c46419f` (branch `worktree-agent-a0c5922f20c46419f`, last commit is a WIP
save). Inspect `git log -3` and `git show --stat HEAD` there to see what exists, then finish it.

Goal: owner + staff receive a daily and a weekly summary by email, each person only the sections of their team
(owner all; finance money; ops orders/complaints/providers; content catalogue/prices/offers; tech system/errors/cost).
Counts and aggregates only — no personal data. Default OFF.

Pieces (keep what exists, complete what is missing):
- `functions/src/digest.js` pure renderer (RTL inline-CSS HTML + plain text, Arabic digits, brand colours) + tests.
- `functions/src/mailer.js` transport chosen by env: SMTP via nodemailer (SMTP_HOST/PORT/USER/PASS, MAIL_FROM) or
  Resend (RESEND_API_KEY); none configured → generate + store, do not send, UI says what is missing.
- `digestClock` hourly onSchedule in `functions/index.js`, idempotent via `system/digestState` (Africa/Cairo).
- Settings `digest = {daily:{on,hour}, weekly:{on,weekday,hour}, extraRecipients:[]}`; admin routes
  GET /admin/digest/preview?type&team, POST /admin/digest/test, settings save; per-admin opt-out `digestOff`.
- Admin UI module `apps/admin/modules/digest-settings.js` in Admin › الإعدادات (live panel): on/off, hour/weekday,
  recipients, preview iframe, send-test, last status, transport status.
- Document routes in `docs/API_CONTRACTS.md` and the secrets setup in `docs/DEPLOY_CHECKLIST.md`.
Tests: renderer, scheduler idempotency, preview/test routes (in-memory backend like tests/unit/security-fixes.test.js),
mailer selection with mocked network. Follow docs/agent-briefs/README.md rules.
