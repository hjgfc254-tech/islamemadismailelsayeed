/**
 * E-mail for critical Tech Center alerts (functions failing, server error spike, cost / quota spike, the offers clock
 * not running). tech-status.healthTick() calls mailAlerts() with the alerts it has just raised to the tech team.
 *
 *   Transport   mailer.js (the digest transport: RESEND_API_KEY or SMTP_* + MAIL_FROM).
 *               Not configured → nothing is sent; a single log line per instance says so.
 *   Recipients  the digest recipients of the owner / tech teams (active admins with those roles + the digest's extra
 *               recipients for those teams); none → ADMIN_BOOTSTRAP_EMAILS. The digest opt-out does not apply
 *               (critical alerts are not digests).
 *   Dedupe      at most one e-mail per alert key per hour, across instances: system/alertMail { sent: { key: ms } },
 *               claimed in a transaction before sending. Keys older than a day are dropped.
 * The alert texts are already masked by tech-status.safeText(); nothing personal goes into the e-mail.
 */
'use strict';

const MAIL_EVERY_MS = 3600000, FORGET_MS = 24 * 3600000, STATE = 'system/alertMail';
const TEAMS = ['owner', 'tech'];
const MAIL_KEYS = new Set(['clock:offers']);   // «not running» is a normal-level bell alert but worth an e-mail
const mailWorthy = (a) => !!a && (a.level === 'critical' || MAIL_KEYS.has(a.key));

let warned = false;
const _resetWarned = () => { warned = false; };
const log = (deps, ...a) => { const l = (deps && deps.log) || console.warn; try { l(...a); } catch (e) { /* never break the clock */ } };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function recipients(backend, deps) {
  const mailer = require('./mailer'), seen = new Set(), out = [];
  const add = (e) => { const x = String(e || '').trim().toLowerCase(); if (mailer.isEmail(x) && !seen.has(x)) { seen.add(x); out.push(x); } };
  try {
    const da = require('./digest-admin'), cfg = await da.getConfig(backend);
    for (const r of await da.listRecipients(backend, cfg)) if (TEAMS.includes(r.team)) add(r.email);
  } catch (e) { /* fall back below */ }
  if (!out.length) {
    const boot = (deps && deps.bootstrapEmails) || (backend.env && backend.env.bootstrapEmails) || String(process.env.ADMIN_BOOTSTRAP_EMAILS || '').split(',');
    (Array.isArray(boot) ? boot : String(boot).split(',')).forEach(add);
  }
  return out;
}

/** claims the keys that may be mailed now (≥ 1 h since the last e-mail for that key) → [keys] */
async function claim(backend, keys, now) {
  return backend.runTransaction(async (tx) => {
    const st = (await backend.adapter.get(tx, STATE)) || {}, sent = { ...(st.sent || {}) };
    const due = keys.filter((k) => !(+sent[k] > 0) || now - sent[k] >= MAIL_EVERY_MS);
    for (const k of Object.keys(sent)) if (now - sent[k] > FORGET_MS) delete sent[k];
    if (!due.length) return [];
    due.forEach((k) => { sent[k] = now; });
    backend.adapter.set(tx, STATE, { sent, at: new Date(now).toISOString() });
    return due;
  });
}

function render(a, now) {
  const when = new Date(now).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const subject = `[هنصلحلك — تنبيه حرج] ${String(a.text || '').slice(0, 120)}`;
  const text = `${a.text}\n\nالوقت: ${when}\nافتح مركز التقنية: ${a.link || 'apps/admin/index.html#/tech'}\n\nالرسالة دي بتتبعت مرة واحدة كل ساعة على الأكثر لنفس المشكلة.`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body style="font-family:Tahoma,Arial,sans-serif;line-height:1.6">` +
    `<h2 style="color:#b42318;margin:0 0 8px">تنبيه حرج</h2><p>${esc(a.text)}</p><p style="color:#555">الوقت: ${esc(when)}<br>افتح مركز التقنية: ${esc(a.link || 'apps/admin/index.html#/tech')}</p>` +
    `<p style="color:#777;font-size:12px">الرسالة دي بتتبعت مرة واحدة كل ساعة على الأكثر لنفس المشكلة.</p></body></html>`;
  return { subject, text, html };
}

/**
 * mailAlerts(backend, alerts, now, deps?) → { sent, skipped, reason? }
 * deps (tests): { mailer, env, log, bootstrapEmails } — env / fetch / smtpFactory are passed through to mailer.send.
 */
async function mailAlerts(backend, alerts, now = Date.now(), deps = {}) {
  const list = (alerts || []).filter(mailWorthy);
  if (!list.length) return { sent: 0, skipped: 0 };
  const mailer = deps.mailer || require('./mailer'), st = mailer.status(deps.env);
  if (!st.configured) {
    if (!warned) { warned = true; log(deps, 'alert-mail: no mail transport configured, critical alerts are not e-mailed (missing: ' + st.missing.join(' / ') + ')'); }
    return { sent: 0, skipped: list.length, reason: 'transport-missing' };
  }
  const to = await recipients(backend, deps);
  if (!to.length) { if (!warned) { warned = true; log(deps, 'alert-mail: no recipients (digest owner / tech or ADMIN_BOOTSTRAP_EMAILS)'); } return { sent: 0, skipped: list.length, reason: 'no-recipients' }; }
  const due = new Set(await claim(backend, [...new Set(list.map((a) => a.key))], now));
  let sent = 0;
  for (const a of list) {
    if (!due.has(a.key)) continue;
    due.delete(a.key);   // one e-mail per key even if two alerts share it
    try { await mailer.send({ to, ...render(a, now) }, deps); sent++; }
    catch (e) { log(deps, 'alert-mail: send failed for ' + a.key + ': ' + String((e && e.message) || e).slice(0, 160)); }
  }
  return { sent, skipped: list.length - sent };
}

module.exports = { MAIL_EVERY_MS, mailWorthy, mailAlerts, recipients, render, _resetWarned };
