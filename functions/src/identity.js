/**
 * Server-side identity: maps a VERIFIED Firebase Auth token to the application's actor model
 * ({role, id, name, adminRole?}) — the same shape services/auth-api.js produces — following the app being used.
 *   customer → token.phone_number matches a customer (not suspended)
 *   provider → token.phone_number matches a provider whose status is 'approved' (registering never grants the role)
 *   admin    → admins/{uid} with status 'active' (role from that document, never from the client)
 */
'use strict';
const APPS = ['customer', 'provider', 'admin'];

function normalizePhone(p) {
  const s = String(p || '').replace(/[^\d+]/g, '');
  if (/^\+20\d{10}$/.test(s)) return '0' + s.slice(3);          // +201xxxxxxxxx → 01xxxxxxxxx (app format)
  if (/^20\d{10}$/.test(s)) return '0' + s.slice(2);
  return s;
}

function resolveActor({ db, token, app, admin }) {
  if (!token || !APPS.includes(app)) return null;
  if (app === 'admin') {
    if (!admin || admin.status !== 'active') return null;
    return { role: 'admin', id: token.uid, name: admin.name || '', adminRole: admin.role };
  }
  const phone = normalizePhone(token.phone_number);
  if (!phone || !db) return null;
  if (app === 'provider') {
    const p = (db.providers || []).find(x => normalizePhone(x.phone) === phone);
    return p && p.status === 'approved' ? { role: 'provider', id: p.id, name: p.name } : null;
  }
  const c = (db.customers || []).find(x => normalizePhone(x.phone) === phone);
  return c && c.status !== 'suspended' ? { role: 'customer', id: c.id, name: c.name } : null;
}

/** Why a signed-in provider has no provider role (for honest UI copy). */
function providerStatus(db, token) {
  const phone = normalizePhone(token && token.phone_number);
  const p = phone && db && (db.providers || []).find(x => normalizePhone(x.phone) === phone);
  return p ? { id: p.id, status: p.status } : { id: null, status: 'not-registered' };
}

module.exports = { resolveActor, providerStatus, normalizePhone, APPS };
