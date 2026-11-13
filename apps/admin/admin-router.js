/**
 * MODULE: admin-router — HSAdminRouter
 * Hash routing for the Admin Center (frontend only): parse `#/<id>[/…]`, format ids, and build breadcrumb data from the
 * shell's NAV + hidden pages. Pure functions (unit-tested in Node); the shell owns rendering and the hashchange listener.
 * STATUS: IMPLEMENTED (FRONTEND DEMO) — extracted from admin-shell.js (same behavior).
 */
'use strict';
(function (root) {
  const DEFAULT_ROUTE = 'dashboard';

  /** '#/orders' | '#orders' | '#/orders/x' → 'orders'; anything else → DEFAULT_ROUTE. Ids are lower-cased. */
  const parse = (hash) => {
    const m = /^#\/?([a-z0-9-]+)(?:\/.*)?$/i.exec(hash || '');
    return m ? m[1].toLowerCase() : DEFAULT_ROUTE;
  };
  const format = (id) => '#/' + String(id || DEFAULT_ROUTE);

  /** Flatten NAV groups into items carrying their group. */
  const flatItems = (nav) => (nav || []).reduce((a, g) => a.concat(g.items.map((i) => Object.assign({ group: g }, i))), []);
  const findItem = (nav, id) => flatItems(nav).find((i) => i.id === id) || null;

  /** Breadcrumb trail as plain data: [{label, id?}] — last item is the current page. */
  const breadcrumbs = (nav, hiddenPages, id, titleOverride) => {
    const trail = [{ label: 'الإدارة', id: DEFAULT_ROUTE }];
    const hidden = (hiddenPages || {})[id];
    const it = findItem(nav, hidden ? hidden.parent : id);
    if (it) {
      trail.push({ label: it.group.label });
      if (hidden) { trail.push({ label: it.label, id: it.id }); trail.push({ label: titleOverride || hidden.label }); }
      else trail.push({ label: titleOverride || it.label });
    } else {
      trail.push({ label: titleOverride || 'صفحة غير معروفة' });
    }
    return trail;
  };

  const api = Object.freeze({ DEFAULT_ROUTE, parse, format, flatItems, findItem, breadcrumbs });
  root.HSAdminRouter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
