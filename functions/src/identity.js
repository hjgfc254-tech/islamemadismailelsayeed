/**
 * Server-side identity helpers (used by service.js): phone normalisation and the list of apps.
 * Actors are resolved in service.js from the verified Firebase Auth token and the database (role never from the client).
 * The former resolveActor / providerStatus were superseded there and removed (no runtime, test or documentation users).
 */
'use strict';
const APPS = ['customer', 'provider', 'admin'];

function normalizePhone(p) {
  const s = String(p || '').replace(/[^\d+]/g, '');
  if (/^\+20\d{10}$/.test(s)) return '0' + s.slice(3);          // +201xxxxxxxxx → 01xxxxxxxxx (app format)
  if (/^20\d{10}$/.test(s)) return '0' + s.slice(2);
  return s;
}

module.exports = { normalizePhone, APPS };
