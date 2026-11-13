/**
 * MODULE: tree (HSTree)
 * RESPONSIBILITY: Pure helpers for flat parent/child lists ({ id, parentId, order, ... }): siblings, descendants, depth, subtree height,
 *   and the parents an item may be moved under without creating a cycle or exceeding a depth limit. No DOM, no state, never mutates its input.
 * STATUS: IMPLEMENTED (DEMO). First consumer: admin departments page. NOT yet used by the categories page, which still carries an
 *   equivalent copy of this logic (migration is a recorded follow-up with its own regression test).
 * All walks are guarded against corrupt data (cycles) with a step limit instead of looping forever.
 */
'use strict';
(function (root) {
  const GUARD = 100;
  const byId = (list, id) => list.find((x) => x.id === id) || null;
  const siblings = (list, parentId) => list.filter((x) => (x.parentId || null) === (parentId || null)).sort((a, b) => (a.order || 0) - (b.order || 0));
  const descendantIds = (list, id) => {
    const out = [], seen = new Set([id]); const walk = (p, n) => { if (n > GUARD) return; list.filter((x) => x.parentId === p).forEach((x) => { if (seen.has(x.id)) return; seen.add(x.id); out.push(x.id); walk(x.id, n + 1); }); };
    walk(id, 0); return out;
  };
  /** Number of levels from the root down to (and including) this item: a root = 1. Unknown id → 0. */
  const depthOf = (list, id) => { let d = 0, c = byId(list, id), g = 0; while (c && g++ < GUARD) { d++; c = c.parentId ? byId(list, c.parentId) : null; } return d; };
  /** Levels in the subtree starting at this item (a leaf = 1). */
  const height = (list, id, n) => { if ((n || 0) > GUARD) return 1; const kids = list.filter((x) => x.parentId === id); return 1 + (kids.length ? Math.max(...kids.map((k) => height(list, k.id, (n || 0) + 1))) : 0); };
  const pathOf = (list, id, nameKey) => { const p = []; let c = byId(list, id), g = 0; while (c && g++ < GUARD) { p.unshift(c[nameKey || 'name']); c = c.parentId ? byId(list, c.parentId) : null; } return p; };
  /** Items `id` may be placed under: never itself or its own descendants (cycle); resulting depth must stay ≤ maxDepth. id=null means a new item (height 1). */
  const validParents = (list, id, maxDepth) => {
    const banned = id ? [id].concat(descendantIds(list, id)) : [], h = id ? height(list, id) : 1;
    return list.filter((x) => !banned.includes(x.id) && depthOf(list, x.id) + h <= maxDepth);
  };
  /** Depth-first flat list with a `level` property, siblings in `order`. */
  const flatten = (list) => { const out = []; const walk = (p, lvl, n) => { if (n > GUARD) return; siblings(list, p).forEach((x) => { out.push(Object.assign({ level: lvl }, x)); walk(x.id, lvl + 1, n + 1); }); }; walk(null, 1, 0); return out; };
  const api = { byId, siblings, descendantIds, depthOf, height, pathOf, validParents, flatten };
  root.HSTree = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
