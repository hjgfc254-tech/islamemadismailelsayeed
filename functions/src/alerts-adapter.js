/**
 * Adapter between the Tech Center health probe and the team alerts engine.
 *   notifyTeam(backend, team, level, payload)   team 'tech' · level 'critical' | 'normal' · payload {text, link?, key?}
 * Uses `notifyTeam(backend, team, level, payload)` from the alerts engine (functions/src/alerts.js) when it exists;
 * until then falls back to the owner's push alert (owner-alerts.notifyOwner), so a critical problem is never silent.
 * Best effort: never throws.
 */
'use strict';

function engine() {
  for (const m of ['./alerts', './owner-alerts']) {
    try { const mod = require(m); if (mod && typeof mod.notifyTeam === 'function') return mod; } catch (e) { /* module not present yet */ }
  }
  return null;
}

async function notifyTeam(backend, team, level, payload) {
  try {
    const p = payload || {};
    const eng = engine();
    if (eng) return await eng.notifyTeam(backend, team, level, p);
    const prefix = level === 'critical' ? 'حرج — ' : 'تنبيه — ';
    return await require('./owner-alerts').notifyOwner(backend, prefix + String(p.text || ''), p.link || 'apps/admin/index.html#/tech');
  } catch (e) { if (backend && backend.log) backend.log('team alert failed', e && e.message); return 0; }
}

module.exports = { notifyTeam, _engine: engine };
