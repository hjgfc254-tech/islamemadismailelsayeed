# Brief: real two-step verification (TOTP) for admin accounts

Owner request (2026-11-26): the admin center is protected only by a password plus the 8-digit access code (`functions/src/admin-code.js`). If the owner's account is stolen, everything is exposed. Add authenticator-app 2FA (Google Authenticator / Microsoft Authenticator, RFC 6238 TOTP).

Use `Claude-Session: https://claude.ai/code/session_01W3TuWCKWoe3KxU6igeoy12`. Work in your worktree, commit there, and never push or deploy.

**Stay narrow (token budget matters):**
- Start with `functions/src/admin-code.js`, the `case 'adminCode'` session op in `functions/src/service.js`, and the admin UI that calls it (search `adminCode` under `apps/admin` and `services/firebase-backend.js`).
- Use `graphify query "<question>"` before broad searches (graphify-out/ is in the main folder: `C:\Users\dell\Desktop\Development\proj\graphify-out`).
- No new npm packages: implement TOTP with Node `crypto` (HMAC-SHA1, 30 s step, 6 digits, ±1 step window, base32 secret of 20 random bytes).

## Behaviour

1. **Enroll:** an unlocked admin calls the session op `adminCode` with `{action:'totpSetup'}`.
   - The server creates a secret, stores it pending on the admin doc (server-only field, never sent back after enrollment), and returns `otpauth://totp/Hansalehlak:<email>?secret=…&issuer=Hansalehlak` plus the secret text.
   - `{action:'totpEnable', code}` verifies the code and enables 2FA.
   - `{action:'totpDisable', code}` disables it with a valid code. The owner can also reset an employee's 2FA from the employee screen, if a matching admin route exists; otherwise document how.
2. **Unlock:** when 2FA is enabled, `{action:'unlock', code, totp}` requires a valid TOTP besides the 8-digit code.
   - Reject replay of the same time-step: store the last used step.
   - Count failures with the existing lockout or rate limits, if any.
3. **UI:**
   - In the admin access-code dialog, add a «كود التطبيق (6 أرقام)» field, shown when the server says 2FA is on (e.g. an error code `TOTP_REQUIRED`).
   - A small «التحقق بخطوتين» section, on the security page or the account / settings area that fits best (Firebase mode only), with: setup (show the otpauth link as text plus a «انسخ» button and the secret; no QR library), enable, disable.
   - Egyptian Arabic copy.
   - Admin CSS: tokens only (the hard-coded-value audit test must stay green).
4. **Never** log or return the secret after enabling. Never weaken the existing code checks.

## Tests

- `tests/unit/admin-totp.test.js`:
  - TOTP against the RFC 6238 SHA-1 test vectors;
  - setup → enable → unlock requires totp → replay refused → disable;
  - the secret is never in responses after enabling.
- Then `npm test` (all green). Run `npm run functions:sync` if you touched `services/`, `npm run sw:bump` if served files changed, and `npm run audit:refresh`.
- Add a short runbook to `docs/MAINTENANCE_GUIDE.md` §4: enable 2FA, and recover a lost phone (the owner resets it, or the steps from the Firebase console).

## Finish

Commit with the message `feat(admin): authenticator-app two-step verification` plus the trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the Claude-Session line.

Reply in Arabic, 6 lines at most:
- the branch and commit;
- what changed;
- whether a functions deploy is needed;
- anything the owner must do.
