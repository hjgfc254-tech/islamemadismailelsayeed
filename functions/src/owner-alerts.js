/**
 * Owner alerts: a push notification on the owner's devices (Admin app, after «تفعيل الإشعارات») when something needs
 * attention right away:
 *   • an emergency switch is turned on or off (service.js after POST /admin/controls);
 *   • an admin account is locked after wrong access codes (admin-code.js);
 *   • the same error keeps happening (telemetry.js: a group reaching 10, 100 or 1000 occurrences).
 * Best effort: an alert never blocks or fails the action that triggered it.
 */
'use strict';

async function notifyOwner(backend, body, link) {
  /* teams release: the owner alert is also a bell entry (team «owner», critical) — alerts.js stores it and pushes to the owners */
  try {
    const hash = String(link || '').replace(/^[^#]*/, '') || '#/alerts';
    const r = await require('./alerts').ingest(backend, [{ team: 'owner', severity: 'critical', kind: 'owner', title: String(body).slice(0, 120), body: '', link: hash, dedupeKey: 'owner:' + String(body).slice(0, 80) }]);
    if (r.length) return r.length;
  } catch (e) { if (backend.log) backend.log('owner alert ingest failed', e && e.message); }
  try {
    if (!backend.sendPush || !backend.queryDocs) return 0;
    const owners = await backend.queryDocs('admins', 'role', '==', 'owner');
    let sent = 0;
    for (const o of owners) {
      if (!o || (o.data && o.data.status && o.data.status !== 'active')) continue;
      const uid = o.id;
      const tokens = (await backend.queryDocs('pushTokens', 'uid', '==', uid)).map((x) => (x.data || x).token).filter(Boolean);
      if (!tokens.length) continue;
      await backend.sendPush(tokens, { title: 'هنصلحلك — تنبيه للمالك', body: String(body).slice(0, 180), link: link || 'apps/admin/index.html#/controls', tag: 'owner-alert' });
      sent += tokens.length;
    }
    return sent;
  } catch (e) { if (backend.log) backend.log('owner alert failed', e && e.message); return 0; }
}

module.exports = { notifyOwner };
