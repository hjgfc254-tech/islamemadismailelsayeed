# Brief: «مركز التقنية» — FINISH the saved partial work

Worktree: `.claude/worktrees/agent-a7c624f5107c436b3` (branch `worktree-agent-a7c624f5107c436b3`, last commit is a WIP
save). Inspect `git log -3` / `git show --stat HEAD` there, then finish.

Goal: a page for engineers/maintenance that NEVER shows customer/provider/order/personal data — system info only.
- Route GET /admin/tech/status (`functions/src/tech-status.js`, owner + future `tech` role; no PII): health
  (Firestore/RTDB/Auth reachability + latency, region/node/version, offersClock last tick, last deploy from
  `system/deploy` written by `scripts/record-deploy.cjs`), grouped errors from `clientErrors` with resolve/ignore,
  cheap usage counters (`system/usage_YYYY-MM-DD`, flushed ≤1/min/instance) + monthly cost estimate vs a budget setting,
  latency p50/p95 per route group, error rate, App Check / maintenance state (read-only).
- `healthClock` onSchedule every 10 min → `system/health`; on problems notify via `functions/src/alerts-adapter.js`
  (uses `notifyTeam` if it exists, else `owner-alerts.notifyOwner`).
- Admin page `apps/admin/pages/tech-center.page.js` (route id `tech`, owner always allowed): status lights, error
  table with resolve/ignore + «انسخ تقرير الخطأ» (no PII), usage/cost bars, latency table, deploy info,
  «تشغيل فحص الآن», auto-refresh 60 s; demo mode shows «غير متصل بالسيرفر», not fake numbers.
Tests: recursive scan that the status response has no phone/email/address/name fields, counters, thresholds.
Document the route in docs/API_CONTRACTS.md. Follow docs/agent-briefs/README.md rules.
