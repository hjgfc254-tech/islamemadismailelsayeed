/**
 * Firestore persistence for the marketplace database.
 * One document per entity; collections are created by the first real write (no placeholder documents).
 *   MP key            → Firestore
 *   serviceRequests   → requests/{id}            (renamed for clarity)
 *   <array key>       → <key>/{id}               (customers, providers, assignments, transactions, reviews, complaints,
 *                                                  notifications, addresses, quotes, favorites, serviceAreas)
 *   meta, settings, v → system/meta, system/settings
 * Device-local collections (drafts, searchHistory) stay on the device and are never persisted server-side.
 * Order is preserved with a stable `_k` sort key so prepend/append do not rewrite whole collections.
 */
'use strict';
const crypto = require('crypto');

const RENAME = { serviceRequests: 'requests' };
const DEVICE_LOCAL = ['drafts', 'searchHistory', 'services'];
const SYSTEM_KEYS = ['meta', 'settings'];
const KNOWN_ARRAYS = ['customers', 'providers', 'serviceRequests', 'assignments', 'transactions', 'reviews', 'complaints',
  'notifications', 'addresses', 'quotes', 'favorites', 'serviceAreas'];

const colName = key => RENAME[key] || key;
const safeId = s => String(s).replace(/\//g, '%2F').slice(0, 700);
function keyOf(key, item) {
  if (item && item.id != null && item.id !== '') return safeId(item.id);
  if (key === 'favorites') return safeId(`${item.customerId}__${item.kind}__${item.refId}`);
  if (key === 'serviceAreas') return safeId(item.gov);
  return crypto.createHash('sha1').update(JSON.stringify(item)).digest('hex');
}
const strip = o => { const c = { ...o }; delete c._k; return c; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * adapter: { list(tx, col) → [{id, data}], get(tx, path) → data|null, set(tx, path, data), del(tx, path) }
 * Reads ALL marketplace collections (the domain rules need the full read model). Returns { db, index }.
 */
async function readAll(adapter, tx) {
  const db = { v: 2 };
  const index = {};
  const [meta, settings] = await Promise.all(SYSTEM_KEYS.map(k => adapter.get(tx, `system/${k}`)));
  let empty = !meta;
  if (meta) { db.v = meta.v || 2; db.meta = strip(meta); delete db.meta.v; }
  if (settings) db.settings = strip(settings);
  const lists = await Promise.all(KNOWN_ARRAYS.map(k => adapter.list(tx, colName(k))));
  KNOWN_ARRAYS.forEach((k, i) => {
    const docs = lists[i].slice().sort((a, b) => (a.data._k || 0) - (b.data._k || 0));
    index[k] = new Map(docs.map(d => [d.id, d.data]));
    db[k] = docs.map(d => strip(d.data));
    if (docs.length) empty = false;
  });
  return { db: empty ? null : db, index };
}

/** Writes the difference between the loaded state and `next`. Returns { changes: {key: {set:[ids], del:[ids]}}, writes }. */
function commit(adapter, tx, loaded, next) {
  const changes = {};
  let writes = 0;
  const note = (k, t, id) => { (changes[k] = changes[k] || { set: [], del: [] })[t].push(id); writes++; };
  const prevMeta = loaded.db ? { ...(loaded.db.meta || {}), v: loaded.db.v } : null;
  const nextMeta = { ...(next.meta || {}), v: next.v || 2 };
  if (!same(prevMeta, nextMeta)) { adapter.set(tx, 'system/meta', nextMeta); note('meta', 'set', 'meta'); }
  if (!loaded.db || !same(loaded.db.settings, next.settings)) { adapter.set(tx, 'system/settings', next.settings || {}); note('settings', 'set', 'settings'); }
  for (const k of KNOWN_ARRAYS) {
    const prev = loaded.index[k] || new Map();
    const items = Array.isArray(next[k]) ? next[k] : [];
    const ids = items.map(it => keyOf(k, it));
    /* stable order keys: keep existing; new items before the first known item get lower keys, others higher */
    const known = ids.map(id => prev.has(id));
    const firstKnown = known.indexOf(true);
    let lo = Infinity, hi = -Infinity;
    for (const d of prev.values()) { const kk = d._k || 0; if (kk < lo) lo = kk; if (kk > hi) hi = kk; }
    if (!isFinite(lo)) { lo = 0; hi = -1; }
    const order = new Array(ids.length);
    for (let i = (firstKnown < 0 ? ids.length : firstKnown) - 1; i >= 0; i--) order[i] = --lo;
    for (let i = 0; i < ids.length; i++) if (order[i] === undefined) order[i] = known[i] ? (prev.get(ids[i])._k || 0) : ++hi;
    const seen = new Set();
    items.forEach((it, i) => {
      const id = ids[i];
      if (seen.has(id)) return;
      seen.add(id);
      const data = { ...JSON.parse(JSON.stringify(it)), _k: order[i] };
      const old = prev.get(id);
      if (!old || !same(old, data)) { adapter.set(tx, `${colName(k)}/${id}`, data); note(k, 'set', id); }
    });
    for (const id of prev.keys()) if (!seen.has(id)) { adapter.del(tx, `${colName(k)}/${id}`); note(k, 'del', id); }
  }
  return { changes, writes };
}

/** Admin SDK adapter (transaction-bound). */
function firestoreAdapter(fs) {
  return {
    async list(tx, col) { const s = await tx.get(fs.collection(col)); return s.docs.map(d => ({ id: d.id, data: d.data() })); },
    async get(tx, p) { const s = await tx.get(fs.doc(p)); return s.exists ? s.data() : null; },
    set(tx, p, data) { tx.set(fs.doc(p), data); },
    del(tx, p) { tx.delete(fs.doc(p)); }
  };
}

module.exports = { readAll, commit, firestoreAdapter, keyOf, colName, KNOWN_ARRAYS, DEVICE_LOCAL, RENAME };
