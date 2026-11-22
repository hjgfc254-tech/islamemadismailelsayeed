'use strict';
/* Digest e-mail transport (functions/src/mailer.js): provider chosen by environment variables, no network in tests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const mailer = require(path.resolve(__dirname, '../../functions/src/mailer.js'));
const MSG = { to: 'owner@example.com', subject: 'ملخص', html: '<p>x</p>', text: 'x' };

test('status: nothing configured → lists exactly what is missing; no secret value ever appears', () => {
  const s = mailer.status({});
  assert.equal(s.transport, null); assert.equal(s.configured, false);
  assert.match(s.missing.join(' '), /RESEND_API_KEY/); assert.match(s.missing.join(' '), /SMTP_HOST/);
  const withSecrets = mailer.status({ RESEND_API_KEY: 're_SECRET_VALUE', MAIL_FROM: 'a@b.co', SMTP_PASS: 'hunter2' });
  assert.ok(!JSON.stringify(withSecrets).includes('SECRET_VALUE') && !JSON.stringify(withSecrets).includes('hunter2'));
});

test('status: provider selection and the variables each one still needs', () => {
  assert.deepEqual(mailer.status({ RESEND_API_KEY: 'k' }), { transport: 'resend', configured: false, missing: ['MAIL_FROM'], from: null });
  assert.equal(mailer.status({ RESEND_API_KEY: 'k', MAIL_FROM: 'ملخص <d@x.co>' }).configured, true);
  const half = mailer.status({ SMTP_HOST: 'smtp.x.co', SMTP_USER: 'u' });
  assert.equal(half.transport, 'smtp'); assert.deepEqual(half.missing, ['SMTP_PORT', 'SMTP_PASS', 'MAIL_FROM']);
  const full = mailer.status({ SMTP_HOST: 'h', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'd@x.co' });
  assert.equal(full.transport, 'smtp'); assert.equal(full.configured, true);
  assert.equal(mailer.status({ RESEND_API_KEY: 'k', SMTP_HOST: 'h', MAIL_FROM: 'd@x.co' }).transport, 'resend', 'Resend wins when both exist');
});

test('send: not configured → transport-missing (nothing is attempted)', async () => {
  await assert.rejects(mailer.send(MSG, { env: {}, fetch: () => { throw new Error('must not be called'); } }), (e) => e.code === 'transport-missing');
});

test('send via Resend: request shape, bearer key, id returned; API error surfaces without the key', async () => {
  const calls = [];
  const env = { RESEND_API_KEY: 're_abc123', MAIL_FROM: 'هنصلحلك <digest@x.co>' };
  const ok = await mailer.send(MSG, { env, fetch: async (url, init) => { calls.push([url, init]); return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) }; } });
  assert.deepEqual(ok, { ok: true, transport: 'resend', id: 'em_1' });
  assert.equal(calls[0][0], 'https://api.resend.com/emails');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer re_abc123');
  const body = JSON.parse(calls[0][1].body);
  assert.deepEqual(body.to, ['owner@example.com']); assert.equal(body.from, env.MAIL_FROM); assert.equal(body.subject, 'ملخص'); assert.equal(body.html, '<p>x</p>');
  await assert.rejects(mailer.send(MSG, { env, fetch: async () => ({ ok: false, status: 422, json: async () => ({ message: 'invalid from' }) }) }), (e) => e.code === 'send-failed' && /422/.test(e.message) && !e.message.includes('re_abc123'));
});

test('send via SMTP: nodemailer config (secure on 465), message fields, errors mapped', async () => {
  let cfg = null, sent = null;
  const env = { SMTP_HOST: 'smtp.x.co', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p', MAIL_FROM: 'd@x.co' };
  const smtpFactory = (c) => { cfg = c; return { sendMail: async (m) => { sent = m; return { messageId: '<m1>' }; } }; };
  const r = await mailer.send({ ...MSG, to: ['a@x.co', 'b@x.co'] }, { env, smtpFactory });
  assert.deepEqual(r, { ok: true, transport: 'smtp', id: '<m1>' });
  assert.deepEqual({ host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.auth.user }, { host: 'smtp.x.co', port: 465, secure: true, user: 'u' });
  assert.equal(sent.to, 'a@x.co, b@x.co'); assert.equal(sent.from, 'd@x.co');
  await assert.rejects(mailer.send(MSG, { env: { ...env, SMTP_PORT: '587' }, smtpFactory: () => ({ sendMail: async () => { throw new Error('auth failed'); } }) }), (e) => e.code === 'send-failed' && /auth failed/.test(e.message));
});

test('send: invalid recipients are refused before any transport is used; nodemailer is installed for the real SMTP path', async () => {
  const env = { RESEND_API_KEY: 'k', MAIL_FROM: 'd@x.co' };
  for (const bad of ['', 'not-an-email', 'a@b', 'x@y.co, z@y.co']) await assert.rejects(mailer.send({ ...MSG, to: bad }, { env, fetch: () => { throw new Error('no'); } }), (e) => e.code === 'invalid-recipient');
  assert.ok(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../functions/package.json'), 'utf8')).dependencies.nodemailer, 'nodemailer is a functions dependency');
});
