/**
 * Admin access code — the third factor for the Admin Center (owner request): verified email + password (Firebase
 * Auth) + an 8-digit personal code checked here on the server.
 *   • Each admin sets the code on first sign-in (8 digits, not a trivial sequence such as 12345678 / 11111111).
 *   • admins/{uid}: codeHash (scrypt, per-admin random salt), codeSalt, codeSetAt, codeFails, codeLockUntil,
 *     unlockedUntil. The code itself is never stored or returned.
 *   • A correct code unlocks the console for UNLOCK_MS; 5 wrong codes lock it for LOCK_MS. Every set / unlock /
 *     failure / lock / reset is written to the audit log.
 *   • The owner can reset another admin's code (they set a new one at their next sign-in); the owner changes their
 *     own code with the current one.
 * Until unlocked, the admin's token resolves to no actor: every admin API call is refused and sync returns only
 * { adminGate } (service.js).
 * Two-step verification (optional, owner request 2026-11-26): an authenticator-app code (RFC 6238 TOTP: HMAC-SHA1,
 *   30 s step, 6 digits, ±1 step) on top of the 8-digit code. admins/{uid}: totpPending / totpPendingAt (setup in
 *   progress), totpSecret (base32, server-only, never returned once enabled), totpOn, totpLastStep (a time-step is
 *   accepted once — no replay). When totpOn, unlock AND set/change of the 8-digit code need a valid app code; wrong
 *   app codes count toward the same 5-tries lock. A missing app code fails with details.reason 'TOTP_REQUIRED'.
 * Called by: service.js (session op `adminCode` {action: set | unlock | lock | totpStatus | totpSetup | totpEnable |
 * totpDisable}; isUnlocked() before every admin route) and admin-extra.js (POST /admin/security/reset-code/:uid,
 * POST /admin/security/reset-totp/:uid). Collections: admins/{uid}, audit.
 */
'use strict';
const crypto = require('crypto');

const UNLOCK_MS = 12 * 3600000, LOCK_MS = 15 * 60000, MAX_FAILS = 5;
const CODE_RE = /^\d{8}$/;
const err = (code, message) => { const e = new Error(message); e.code = code; e.isServiceError = true; return e; };

function weak(code) {
  if (/^(\d)\1{7}$/.test(code)) return true;                                   // 11111111
  const asc = '0123456789012', desc = '9876543210987';
  return asc.includes(code) || desc.includes(code);                            // 12345678, 87654321, 90123456 …
}
const hashOf = (code, salt) => crypto.scryptSync(String(code), Buffer.from(salt, 'hex'), 32, { N: 16384, r: 8, p: 1 }).toString('hex');
const same = (a, b) => { const x = Buffer.from(String(a), 'hex'), y = Buffer.from(String(b), 'hex'); return x.length === y.length && crypto.timingSafeEqual(x, y); };

const isUnlocked = (admin, now = Date.now()) => !!(admin && admin.codeHash && +admin.unlockedUntil > now);
function gateOf(admin, now = Date.now()) {
  return { needsCode: !isUnlocked(admin, now), hasCode: !!(admin && admin.codeHash), totp: !!(admin && admin.totpOn), lockedUntil: admin && +admin.codeLockUntil > now ? new Date(+admin.codeLockUntil).toISOString() : null };
}

/* ── TOTP (RFC 4226 / RFC 6238) with Node crypto only ── */
const TOTP_STEP_S = 30, TOTP_DIGITS = 6, TOTP_WINDOW = 1, TOTP_PENDING_MS = 15 * 60000;
const TOTP_RE = /^\d{6}$/;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const byte of buf) { val = (val << 8) | byte; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function base32Decode(s) {
  const clean = String(s || '').toUpperCase().replace(/[\s=-]/g, ''); const out = []; let bits = 0, val = 0;
  for (const ch of clean) { const i = B32.indexOf(ch); if (i < 0) throw new Error('bad base32'); val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function hotp(key, counter, digits = TOTP_DIGITS, algo = 'sha1') {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac(algo, key).update(c).digest(), o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}
const stepOf = (now) => Math.floor(now / 1000 / TOTP_STEP_S);
const totpAt = (key, now, digits = TOTP_DIGITS, algo = 'sha1') => hotp(key, stepOf(now), digits, algo);
const sameText = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
/** The matched time-step (newer than lastStep, within ±1 step of now), or -1. */
function totpMatch(secretB32, code, now = Date.now(), lastStep = 0) {
  code = String(code == null ? '' : code).trim();
  if (!secretB32 || !TOTP_RE.test(code)) return -1;
  const key = base32Decode(secretB32), t = stepOf(now), floor = +lastStep || 0;
  for (let s = t - TOTP_WINDOW; s <= t + TOTP_WINDOW; s++) if (s > floor && sameText(hotp(key, s), code)) return s;
  return -1;
}
const LOCKED_MSG = 'محاولات كتير غلط — الحساب مقفول 15 دقيقة';
function totpRequired() { const e = err('failed-precondition', 'اكتب كود التطبيق (6 أرقام) من Google Authenticator أو Microsoft Authenticator'); e.details = { reason: 'TOTP_REQUIRED' }; return e; }
/** When 2FA is on: the valid app code's step (wrong / replayed codes count toward the lock); null when 2FA is off. */
async function secondFactor(backend, uid, admin, totp, now, action) {
  if (!admin.totpOn) return null;
  if (totp == null || String(totp).trim() === '') throw totpRequired();
  const step = totpMatch(admin.totpSecret, totp, now, admin.totpLastStep);
  if (step < 0) {
    const r = await fail(backend, uid, admin, now, action);
    throw err(r.lock ? 'resource-exhausted' : 'permission-denied', r.lock ? LOCKED_MSG : `كود التطبيق غلط أو اتستخدم قبل كده — فاضل ${MAX_FAILS - r.fails} محاولات`);
  }
  return step;
}

async function audit(backend, uid, action, status) {
  try { await backend.addDoc('audit', require('./retention').auditRow({ at: new Date().toISOString(), uid, app: 'admin', action, status })); } catch (e) { /* audit failure never blocks sign-in */ }
}

/** set: first code (no current needed) or change (current required). Unlocks on success. */
async function setCode(backend, uid, admin, code, current, now = Date.now(), totp) {
  if (!admin || admin.status !== 'active') throw err('permission-denied', 'هذا الحساب ليس له صلاحية إدارة');
  code = String(code || '');
  if (!CODE_RE.test(code)) throw err('invalid-argument', 'الكود لازم يكون 8 أرقام');
  if (weak(code)) throw err('invalid-argument', 'الكود سهل التخمين — اختار 8 أرقام مش متتالية ولا متكررة');
  if (+admin.codeLockUntil > now && (admin.codeHash || admin.totpOn)) throw err('resource-exhausted', 'محاولات كتير — جرّب بعد شوية');
  if (admin.codeHash) {
    if (!same(hashOf(current || '', admin.codeSalt), admin.codeHash)) { await fail(backend, uid, admin, now); throw err('permission-denied', 'الكود الحالي غلط'); }
  }
  /* setting the code also unlocks the console, so with 2FA on it needs the app code too (also after an owner reset) */
  const step = await secondFactor(backend, uid, admin, totp, now, 'admin.code.set');
  const salt = crypto.randomBytes(16).toString('hex');
  await backend.setDoc(`admins/${uid}`, { codeHash: hashOf(code, salt), codeSalt: salt, codeSetAt: new Date(now).toISOString(), codeFails: 0, codeLockUntil: 0, unlockedUntil: now + UNLOCK_MS, ...(step != null ? { totpLastStep: step } : {}) }, true);
  await audit(backend, uid, admin.codeHash ? 'admin.code.change' : 'admin.code.set', 'ok');
  return { ok: true, unlockedUntil: new Date(now + UNLOCK_MS).toISOString() };
}

/* security (round 2): the attempt counter is read and written in ONE transaction, so parallel guesses cannot all
   read «0 failures» and never reach the lock (Firestore serialises / retries concurrent transactions). */
async function fail(backend, uid, admin, now, action = 'admin.code.unlock') {
  const { fails, lock, already } = await backend.runTransaction(async (tx) => {
    const cur = (await backend.adapter.get(tx, `admins/${uid}`)) || admin;
    if (+cur.codeLockUntil > now) return { fails: MAX_FAILS, lock: true, already: true };
    const n = (+cur.codeFails || 0) + 1, l = n >= MAX_FAILS;
    backend.adapter.set(tx, `admins/${uid}`, { ...cur, codeFails: l ? 0 : n, codeLockUntil: l ? now + LOCK_MS : (+cur.codeLockUntil || 0) });
    return { fails: n, lock: l };
  });
  if (already) return { fails, lock };
  await audit(backend, uid, action, lock ? 'locked' : 'failed');
  if (lock) await require('./owner-alerts').notifyOwner(backend, `حساب إداري (${admin.name || admin.email || uid}) اتقفل 15 دقيقة بعد ${MAX_FAILS} محاولات كود غلط`, 'apps/admin/index.html#/audit');
  return { fails, lock };
}

async function unlock(backend, uid, admin, code, now = Date.now(), totp) {
  if (!admin || admin.status !== 'active') throw err('permission-denied', 'هذا الحساب ليس له صلاحية إدارة');
  if (!admin.codeHash) throw err('failed-precondition', 'اعمل كود الدخول الأول');
  if (+admin.codeLockUntil > now) throw err('resource-exhausted', LOCKED_MSG);
  if (!CODE_RE.test(String(code || '')) || !same(hashOf(code, admin.codeSalt), admin.codeHash)) {
    const r = await fail(backend, uid, admin, now);
    throw err(r.lock ? 'resource-exhausted' : 'permission-denied', r.lock ? LOCKED_MSG : `الكود غلط — فاضل ${MAX_FAILS - r.fails} محاولات`);
  }
  const step = await secondFactor(backend, uid, admin, totp, now, 'admin.code.unlock');
  /* the right code is honoured only if the account is not locked at commit time (a parallel guess may have locked it),
     and an app code's time-step only once (a parallel request with the same code loses) */
  const granted = await backend.runTransaction(async (tx) => {
    const cur = (await backend.adapter.get(tx, `admins/${uid}`)) || admin;
    if (+cur.codeLockUntil > now) return 'locked';
    if (step != null && (+cur.totpLastStep || 0) >= step) return 'replay';
    backend.adapter.set(tx, `admins/${uid}`, { ...cur, codeFails: 0, codeLockUntil: 0, unlockedUntil: now + UNLOCK_MS, lastUnlockAt: new Date(now).toISOString(), ...(step != null ? { totpLastStep: step } : {}) });
    return 'ok';
  });
  if (granted === 'replay') {
    const r = await fail(backend, uid, admin, now);
    throw err(r.lock ? 'resource-exhausted' : 'permission-denied', r.lock ? LOCKED_MSG : `كود التطبيق اتستخدم قبل كده — استنى الكود الجاي (فاضل ${MAX_FAILS - r.fails} محاولات)`);
  }
  if (granted !== 'ok') throw err('resource-exhausted', LOCKED_MSG);
  await audit(backend, uid, 'admin.code.unlock', 'ok');
  return { ok: true, unlockedUntil: new Date(now + UNLOCK_MS).toISOString() };
}

/** Owner resets another admin's code: they choose a new one at their next sign-in. */
async function reset(backend, ownerUid, owner, targetUid) {
  if (!owner || owner.role !== 'owner' || !isUnlocked(owner)) throw err('permission-denied', 'إعادة ضبط الكود للمالك فقط');
  if (targetUid === ownerUid) throw err('invalid-argument', 'غيّر كودك من «تغيير الكود» بالكود الحالي');
  const t = await backend.getDoc(`admins/${targetUid}`);
  if (!t) throw err('not-found', 'الحساب غير موجود');
  await backend.setDoc(`admins/${targetUid}`, { codeHash: null, codeSalt: null, codeFails: 0, codeLockUntil: 0, unlockedUntil: 0, codeResetAt: new Date().toISOString(), codeResetBy: ownerUid }, true);
  await audit(backend, ownerUid, 'admin.code.reset:' + targetUid, 'ok');
  return { ok: true };
}

/** sign out everywhere also ends the code unlock */
async function lockNow(backend, uid) { await backend.setDoc(`admins/${uid}`, { unlockedUntil: 0 }, true); }

/* ── two-step verification management (an unlocked admin, for their own account) ── */
const TOTP_OFF = { totpOn: false, totpSecret: null, totpPending: null, totpPendingAt: null, totpLastStep: null };
function needUnlocked(admin, now) {
  if (!admin || admin.status !== 'active') throw err('permission-denied', 'هذا الحساب ليس له صلاحية إدارة');
  if (!isUnlocked(admin, now)) throw err('permission-denied', 'ادخل بكود الدخول الأول');
}
function totpStatus(admin, now = Date.now()) {
  needUnlocked(admin, now);
  return { ok: true, on: !!admin.totpOn, pending: !admin.totpOn && !!admin.totpPending && now - +admin.totpPendingAt < TOTP_PENDING_MS };
}
/** New pending secret (20 random bytes, base32). The secret is returned only here, before enabling. */
async function totpSetup(backend, uid, admin, email, now = Date.now()) {
  needUnlocked(admin, now);
  if (admin.totpOn) throw err('failed-precondition', 'التحقق بخطوتين شغّال بالفعل — اقفله الأول لو عايز تربطه بموبايل تاني');
  const secret = base32Encode(crypto.randomBytes(20));
  await backend.setDoc(`admins/${uid}`, { totpPending: secret, totpPendingAt: now }, true);
  await audit(backend, uid, 'admin.totp.setup', 'ok');
  const label = 'Hansalehlak:' + encodeURIComponent(String(email || admin.email || uid));
  return { ok: true, secret, otpauth: `otpauth://totp/${label}?secret=${secret}&issuer=Hansalehlak&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_S}` };
}
async function totpEnable(backend, uid, admin, code, now = Date.now()) {
  needUnlocked(admin, now);
  if (admin.totpOn) throw err('failed-precondition', 'التحقق بخطوتين شغّال بالفعل');
  if (!admin.totpPending || !(now - +admin.totpPendingAt < TOTP_PENDING_MS)) throw err('failed-precondition', 'ابدأ الإعداد من جديد (المفتاح القديم انتهى)');
  const step = totpMatch(admin.totpPending, code, now, 0);
  if (step < 0) { await audit(backend, uid, 'admin.totp.enable', 'failed'); throw err('permission-denied', 'كود التطبيق غلط — اتأكد إن ساعة الموبايل مظبوطة واكتب الكود اللي ظاهر دلوقتي'); }
  await backend.setDoc(`admins/${uid}`, { totpOn: true, totpSecret: admin.totpPending, totpPending: null, totpPendingAt: null, totpLastStep: step, totpEnabledAt: new Date(now).toISOString() }, true);
  await audit(backend, uid, 'admin.totp.enable', 'ok');
  return { ok: true, on: true };
}
/** Turning it off needs a valid app code (wrong codes count toward the lock). */
async function totpDisable(backend, uid, admin, code, now = Date.now()) {
  needUnlocked(admin, now);
  if (!admin.totpOn) throw err('failed-precondition', 'التحقق بخطوتين مش شغّال');
  if (+admin.codeLockUntil > now) throw err('resource-exhausted', LOCKED_MSG);
  await secondFactor(backend, uid, admin, code, now, 'admin.totp.disable');
  await backend.setDoc(`admins/${uid}`, { ...TOTP_OFF, totpDisabledAt: new Date(now).toISOString() }, true);
  await audit(backend, uid, 'admin.totp.disable', 'ok');
  return { ok: true, on: false };
}
/** Owner turns off an employee's 2FA (lost phone): they can sign in with the 8-digit code and enroll again. */
async function resetTotp(backend, ownerUid, owner, targetUid) {
  if (!owner || owner.role !== 'owner' || !isUnlocked(owner)) throw err('permission-denied', 'إلغاء التحقق بخطوتين للمالك فقط');
  if (targetUid === ownerUid) throw err('invalid-argument', 'اقفل التحقق بخطوتين لحسابك من «التحقق بخطوتين» بكود التطبيق');
  const t = await backend.getDoc(`admins/${targetUid}`);
  if (!t) throw err('not-found', 'الحساب غير موجود');
  await backend.setDoc(`admins/${targetUid}`, { ...TOTP_OFF, totpResetAt: new Date().toISOString(), totpResetBy: ownerUid }, true);
  await audit(backend, ownerUid, 'admin.totp.reset:' + targetUid, 'ok');
  return { ok: true };
}

module.exports = { setCode, unlock, reset, lockNow, isUnlocked, gateOf, weak, UNLOCK_MS, LOCK_MS, MAX_FAILS,
  totpStatus, totpSetup, totpEnable, totpDisable, resetTotp, totpMatch, hotp, totpAt, base32Encode, base32Decode };
