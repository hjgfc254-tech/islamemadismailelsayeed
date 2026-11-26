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
 * Called by: service.js (session op `adminCode` {action: set | unlock | lock}; isUnlocked() before every admin route) and
 * admin-extra.js (POST /admin/security/reset-code/:uid). Collections: admins/{uid}, audit.
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
  return { needsCode: !isUnlocked(admin, now), hasCode: !!(admin && admin.codeHash), lockedUntil: admin && +admin.codeLockUntil > now ? new Date(+admin.codeLockUntil).toISOString() : null };
}

async function audit(backend, uid, action, status) {
  try { await backend.addDoc('audit', require('./retention').auditRow({ at: new Date().toISOString(), uid, app: 'admin', action, status })); } catch (e) { /* audit failure never blocks sign-in */ }
}

/** set: first code (no current needed) or change (current required). Unlocks on success. */
async function setCode(backend, uid, admin, code, current, now = Date.now()) {
  if (!admin || admin.status !== 'active') throw err('permission-denied', 'هذا الحساب ليس له صلاحية إدارة');
  code = String(code || '');
  if (!CODE_RE.test(code)) throw err('invalid-argument', 'الكود لازم يكون ٨ أرقام');
  if (weak(code)) throw err('invalid-argument', 'الكود سهل التخمين — اختار ٨ أرقام مش متتالية ولا متكررة');
  if (admin.codeHash) {
    if (+admin.codeLockUntil > now) throw err('resource-exhausted', 'محاولات كتير — جرّب بعد شوية');
    if (!same(hashOf(current || '', admin.codeSalt), admin.codeHash)) { await fail(backend, uid, admin, now); throw err('permission-denied', 'الكود الحالي غلط'); }
  }
  const salt = crypto.randomBytes(16).toString('hex');
  await backend.setDoc(`admins/${uid}`, { codeHash: hashOf(code, salt), codeSalt: salt, codeSetAt: new Date(now).toISOString(), codeFails: 0, codeLockUntil: 0, unlockedUntil: now + UNLOCK_MS }, true);
  await audit(backend, uid, admin.codeHash ? 'admin.code.change' : 'admin.code.set', 'ok');
  return { ok: true, unlockedUntil: new Date(now + UNLOCK_MS).toISOString() };
}

/* security (round 2): the attempt counter is read and written in ONE transaction, so parallel guesses cannot all
   read «0 failures» and never reach the lock (Firestore serialises / retries concurrent transactions). */
async function fail(backend, uid, admin, now) {
  const { fails, lock, already } = await backend.runTransaction(async (tx) => {
    const cur = (await backend.adapter.get(tx, `admins/${uid}`)) || admin;
    if (+cur.codeLockUntil > now) return { fails: MAX_FAILS, lock: true, already: true };
    const n = (+cur.codeFails || 0) + 1, l = n >= MAX_FAILS;
    backend.adapter.set(tx, `admins/${uid}`, { ...cur, codeFails: l ? 0 : n, codeLockUntil: l ? now + LOCK_MS : (+cur.codeLockUntil || 0) });
    return { fails: n, lock: l };
  });
  if (already) return { fails, lock };
  await audit(backend, uid, 'admin.code.unlock', lock ? 'locked' : 'failed');
  if (lock) await require('./owner-alerts').notifyOwner(backend, `حساب إداري (${admin.name || admin.email || uid}) اتقفل ١٥ دقيقة بعد ${MAX_FAILS} محاولات كود غلط`, 'apps/admin/index.html#/audit');
  return { fails, lock };
}

async function unlock(backend, uid, admin, code, now = Date.now()) {
  if (!admin || admin.status !== 'active') throw err('permission-denied', 'هذا الحساب ليس له صلاحية إدارة');
  if (!admin.codeHash) throw err('failed-precondition', 'اعمل كود الدخول الأول');
  if (+admin.codeLockUntil > now) throw err('resource-exhausted', 'محاولات كتير غلط — الحساب مقفول ١٥ دقيقة');
  if (!CODE_RE.test(String(code || '')) || !same(hashOf(code, admin.codeSalt), admin.codeHash)) {
    const r = await fail(backend, uid, admin, now);
    throw err(r.lock ? 'resource-exhausted' : 'permission-denied', r.lock ? 'محاولات كتير غلط — الحساب مقفول ١٥ دقيقة' : `الكود غلط — فاضل ${MAX_FAILS - r.fails} محاولات`);
  }
  /* the right code is honoured only if the account is not locked at commit time (a parallel guess may have locked it) */
  const granted = await backend.runTransaction(async (tx) => {
    const cur = (await backend.adapter.get(tx, `admins/${uid}`)) || admin;
    if (+cur.codeLockUntil > now) return false;
    backend.adapter.set(tx, `admins/${uid}`, { ...cur, codeFails: 0, codeLockUntil: 0, unlockedUntil: now + UNLOCK_MS, lastUnlockAt: new Date(now).toISOString() });
    return true;
  });
  if (!granted) throw err('resource-exhausted', 'محاولات كتير غلط — الحساب مقفول ١٥ دقيقة');
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

module.exports = { setCode, unlock, reset, lockNow, isUnlocked, gateOf, weak, UNLOCK_MS, LOCK_MS, MAX_FAILS };
