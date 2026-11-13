/**
 * MODULE: navigation-builder — HSAdminNavigationBuilder
 * Builds the Admin sidebar model from the shell NAV: each item is `ready` (a page is registered) and `allowed`
 * (permission guard for the demo employee). Disallowed items are removed; groups left empty are removed.
 * Pure (no DOM); the shell renders the model. Presentation only — not authorization.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  /**
   * build(nav, {isRegistered(id), canView(id)}) → [{id,label,items:[{id,label,icon,ready}]}]
   * Defaults: everything registered/allowed when a callback is not provided.
   */
  function build(nav, opts) {
    const o = opts || {};
    const isRegistered = typeof o.isRegistered === 'function' ? o.isRegistered : () => true;
    const canView = typeof o.canView === 'function' ? o.canView : () => true;
    return (nav || []).map((g) => ({
      id: g.id, label: g.label,
      items: g.items.filter((it) => canView(it.id)).map((it) => ({ id: it.id, label: it.label, icon: it.icon, ready: !!isRegistered(it.id) }))
    })).filter((g) => g.items.length > 0);
  }

  /** Number of navigable (ready + allowed) items in a built model. */
  const countReady = (model) => model.reduce((n, g) => n + g.items.filter((i) => i.ready).length, 0);

  const api = Object.freeze({ build, countReady });
  root.HSAdminNavigationBuilder = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
