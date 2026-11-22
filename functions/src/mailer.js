/**
 * Pluggable e-mail transport for the digests (functions/src/digest-admin.js). The transport is chosen by which
 * environment variables exist — secrets are never stored in the repository:
 *   Resend (HTTPS API, no extra dependency):  RESEND_API_KEY + MAIL_FROM
 *   SMTP (nodemailer):                         SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASS + MAIL_FROM
 * Values come from functions/.env (loaded at deploy) or from Firebase secrets bound to the function.
 * With neither configured, status() lists exactly what is missing and send() refuses with code 'transport-missing'.
 */
'use strict';

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const isEmail = (s) => typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s.trim());
const has = (env, k) => typeof env[k] === 'string' && env[k].trim() !== '';

/** { transport: 'resend' | 'smtp' | null, configured, missing: [names], from } — never returns secret values. */
function status(env = process.env) {
  const from = has(env, 'MAIL_FROM') ? env.MAIL_FROM.trim() : null;
  const smtpKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  if (has(env, 'RESEND_API_KEY')) {
    const missing = from ? [] : ['MAIL_FROM'];
    return { transport: 'resend', configured: !missing.length, missing, from };
  }
  if (smtpKeys.some((k) => has(env, k))) {
    const missing = smtpKeys.filter((k) => !has(env, k)).concat(from ? [] : ['MAIL_FROM']);
    return { transport: 'smtp', configured: !missing.length, missing, from };
  }
  return { transport: null, configured: false, missing: ['RESEND_API_KEY + MAIL_FROM', 'أو: SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASS + MAIL_FROM'], from };
}

const fail = (code, message) => { const e = new Error(message); e.code = code; return e; };

/**
 * send({to, subject, html, text}, deps?) → { ok: true, transport, id }  — throws Error{code} on failure.
 * deps (tests): { env, fetch, smtpFactory }
 */
async function send(msg, deps = {}) {
  const env = deps.env || process.env, st = status(env);
  if (!st.configured) throw fail('transport-missing', 'لا توجد إعدادات إرسال: ' + st.missing.join(' / '));
  const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).map((s) => String(s || '').trim()).filter(Boolean);
  if (!to.length || !to.every(isEmail)) throw fail('invalid-recipient', 'عنوان إيميل غير صالح');
  const subject = String(msg.subject || '').slice(0, 200);
  if (st.transport === 'resend') {
    const f = deps.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!f) throw fail('no-fetch', 'fetch غير متاح');
    const res = await f('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY.trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: st.from, to, subject, html: msg.html, text: msg.text })
    });
    let body = null; try { body = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) throw fail('send-failed', 'Resend ' + res.status + (body && body.message ? ': ' + String(body.message).slice(0, 160) : ''));
    return { ok: true, transport: 'resend', id: (body && body.id) || null };
  }
  const factory = deps.smtpFactory || ((cfg) => require('nodemailer').createTransport(cfg));
  const port = parseInt(env.SMTP_PORT, 10);
  const tx = factory({ host: env.SMTP_HOST.trim(), port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  try {
    const info = await tx.sendMail({ from: st.from, to: to.join(', '), subject, html: msg.html, text: msg.text });
    return { ok: true, transport: 'smtp', id: (info && info.messageId) || null };
  } catch (e) { throw fail('send-failed', 'SMTP: ' + String((e && e.message) || e).slice(0, 160)); }
}

module.exports = { status, send, isEmail };
