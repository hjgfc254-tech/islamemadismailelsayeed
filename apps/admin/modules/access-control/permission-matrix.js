/**
 * MODULE: permission-matrix — HSAdminPermissionMatrix
 * Effective-permission matrix (module × role → allowed actions, direct + inherited) from the RBAC demo store.
 * `cells(R)` is the data; `render(R, {esc})` is the read-only table used by the permissions page.
 * Extracted from pages/permissions.page.js (same markup). Display only — no enforcement.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  /** [{module, label, byRole:{roleId:[actionKey…]}}] — action keys in R.ACTIONS order. */
  const cells = (R) => {
    const roles = R.state.roles, eff = {}; roles.forEach((r) => { eff[r.id] = new Set(R.effective(roles, r.id)); });
    return Object.keys(R.MODULES).map((m) => ({ module: m, label: R.MODULES[m],
      byRole: Object.fromEntries(roles.map((r) => [r.id, Object.keys(R.ACTIONS).filter((x) => eff[r.id].has(R.key(m, x)))])) }));
  };

  const render = (R, h) => {
    const esc = h && h.esc; if (typeof esc !== 'function') throw new Error('HSAdminPermissionMatrix.render: esc helper is required');
    const roles = R.state.roles, eff = {}; roles.forEach((r) => { eff[r.id] = new Set(R.effective(roles, r.id)); });
    return `<div class="rl-scroll" tabindex="0" role="region" aria-label="مصفوفة الصلاحيات الفعلية حسب الدور"><table class="rl-table"><caption>الصلاحيات الفعلية (المباشرة والموروثة) لكل دور حسب الوحدة</caption>
      <thead><tr><th scope="col">الوحدة</th>${roles.map((r) => `<th scope="col">${esc(r.name)}</th>`).join('')}</tr></thead>
      <tbody>${Object.keys(R.MODULES).map((m) => `<tr><th scope="row">${esc(R.MODULES[m])}</th>${roles.map((r) => { const a = Object.keys(R.ACTIONS).filter((x) => eff[r.id].has(R.key(m, x))); return `<td>${a.length ? esc(a.map((x) => R.ACTIONS[x]).join('، ')) : '<span aria-label="لا توجد صلاحيات">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="ord-muted">لتعديل صلاحيات دور افتح صفحة «الأدوار». هذه المصفوفة للعرض فقط.</p>`;
  };

  const api = Object.freeze({ cells, render });
  root.HSAdminPermissionMatrix = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
