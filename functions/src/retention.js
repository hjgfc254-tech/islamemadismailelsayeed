/**
 * Data retention: how long server-only collections are kept before Firestore TTL deletes them.
 * TTL policies (firestore.indexes.json fieldOverrides, `ttl: true`) delete a document some time (usually within 24 h)
 * after its `expiresAt` passes. Firestore TTL needs a Timestamp: the Admin SDK stores a JS Date as one (never a string).
 *
 *   audit         365 days   (this module, every addDoc('audit', …) writer)
 *   digests        90 days   (digest-admin.js)
 *   clientErrors   30 days   (telemetry.js)
 *   usage          45 days   (usage.js — the Tech Center sums the whole calendar month, so 30 days would be too short)
 *   idempotency    24 hours  (service.js — the replay window)
 *   rateLimits      2 min    (service.js — one counter per key and minute)
 * Collections cleaned by a clock instead: callLogs transcripts, supportChats (callLogsClock, 30 days).
 */
'use strict';

const DAY_MS = 86400000;
const RETENTION_DAYS = Object.freeze({ audit: 365, digests: 90, clientErrors: 30, usage: 45 });

/** a JS Date `days` after `now` — stored by the Admin SDK as a Firestore Timestamp */
const expiresIn = (days, now = Date.now()) => new Date(now + days * DAY_MS);

/** an audit row with its TTL field */
const auditRow = (row, now = Date.now()) => ({ ...row, expiresAt: expiresIn(RETENTION_DAYS.audit, now) });

/** strip the TTL field before a row is returned to a client (a Timestamp would not serialise cleanly) */
const withoutTtl = (data) => { const { expiresAt, ...rest } = data || {}; return rest; };

module.exports = { DAY_MS, RETENTION_DAYS, expiresIn, auditRow, withoutTtl };
