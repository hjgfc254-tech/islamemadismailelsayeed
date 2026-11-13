/**
 * MODULE: permission-presets — HSAdminPermissionPresets
 * Ready-made permission sets for the role editor, derived ONLY from data the RBAC demo store already defines:
 *   - "view only" — the `view` action of every catalog module;
 *   - one preset per seed role (except the protected owner) — that role's effective permissions in R.buildRoles().
 * `apply()` clamps a preset to the acting role's authority and drops keys already inherited, mirroring the editor rules.
 * No new permissions or product rules are introduced. Display/demo only — no enforcement.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  /** [{id, name, permissions:[key…]}] */
  const list = (R) => {
    const seed = R.buildRoles();
    const viewAll = { id: 'view-all', name: 'عرض فقط لكل الوحدات', permissions: R.sortKeys(Object.keys(R.MODULES).map((m) => R.key(m, 'view'))) };
    return [viewAll].concat(seed.filter((r) => !r.system).map((r) => ({ id: 'role:' + r.id, name: 'مثل دور «' + r.name + '» الافتراضي', permissions: R.effective(seed, r.id) })));
  };
  const find = (R, id) => list(R).find((p) => p.id === id) || null;

  /**
   * apply(R, presetId, actorRoleId, inheritedKeys) → {keys, skipped}
   * keys: preset keys the actor holds, minus keys already inherited (they are shown as inherited, not direct);
   * skipped: preset keys outside the actor's authority (not granted).
   */
  const apply = (R, presetId, actorRoleId, inheritedKeys) => {
    const p = find(R, presetId); if (!p) return { keys: [], skipped: [] };
    const held = new Set(R.effective(R.state.roles, actorRoleId)), inh = new Set(inheritedKeys || []);
    return { keys: R.sortKeys(p.permissions.filter((k) => held.has(k) && !inh.has(k))), skipped: p.permissions.filter((k) => !held.has(k)) };
  };

  const api = Object.freeze({ list, find, apply });
  root.HSAdminPermissionPresets = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
