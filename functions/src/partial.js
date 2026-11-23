/**
 * Operation-scoped data access. A PartialDb loads ONLY the documents an operation needs (by id or by filtered,
 * bounded query), de-duplicates repeated loads (no repeated reads, no N+1: id lists are fetched with chunked `in`
 * queries), hands the domain runtime a regular MP-shaped database, and commits only the documents that changed.
 *
 * adapter: {
 *   get(tx, path) → data|null
 *   query(tx, col, { where:[[field, op, value]], orderBy:[field, 'asc'|'desc'], limit, startAfter:[value, id] }) → [{id, data}]
 *   count(col, where) → number            (aggregation, non-transactional)
 *   set(tx, path, data), del(tx, path)
 * }
 * tx is null for read-only operations (plain reads, no transaction).
 */
'use strict';
const { keyOf, colName, KNOWN_ARRAYS } = require('./store');

/** Collections whose app order is newest-first (the domain prepends to them). */
const NEWEST_FIRST = new Set(['notifications', 'serviceRequests', 'quotes', 'complaints']);
const IN_CHUNK = 30;
const strip = d => { const c = { ...d }; delete c._k; delete c._u; return c; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const withoutU = d => { if (!d || d._u === undefined) return d; const c = { ...d }; delete c._u; return c; };

/* Short-lived per-instance cache for PUBLIC data that every sync re-reads (system docs, service areas, approved
   providers). Used only outside transactions (writes always read fresh inside their transaction); any commit that
   touches these collections clears it on this instance; other instances converge within SHARED_TTL_MS.
   Keyed per adapter so separate backends (tests, emulator) never share entries. Cuts guest/customer sync reads from
   ~200 per call to ~0 while warm. */
const SHARED_TTL_MS = 30000;
const SHARED_KEYS = new Set(['providers', 'serviceAreas', 'meta', 'settings', 'reviews']);
const PUBLIC_KEYS = ['providers', 'serviceAreas', 'reviews'];   // summarised in system/public
const PUBLIC_TTL_MS = 10 * 60 * 1000;
const shared = new WeakMap();
const sharedFor = adapter => { let m = shared.get(adapter); if (!m) { m = new Map(); shared.set(adapter, m); } return m; };
function invalidateShared(adapter) { shared.delete(adapter); }

class PartialDb {
  constructor(adapter, tx) {
    this.adapter = adapter; this.tx = tx;
    this.maps = Object.fromEntries(KNOWN_ARRAYS.map(k => [k, new Map()]));
    this.system = null;
    this.reads = 0;
    this.pages = {};
    this.missing = new Set();
  }
  _put(key, id, data) { if (data) this.maps[key].set(id, data); }
  async loadSystem() {
    if (this.system) return this.system;
    const cache = !this.tx && sharedFor(this.adapter), hit = cache && cache.get('system');
    if (hit && Date.now() - hit.at < SHARED_TTL_MS) { this.system = JSON.parse(JSON.stringify(hit.value)); return this.system; }
    const [meta, settings] = await Promise.all([this.adapter.get(this.tx, 'system/meta'), this.adapter.get(this.tx, 'system/settings')]);
    this.reads += 2;
    this.system = { meta, settings };
    if (cache) cache.set('system', { at: Date.now(), value: JSON.parse(JSON.stringify(this.system)) });
    return this.system;
  }
  /* Public summary snapshot (system/public): approved providers, service areas and the latest reviews in ONE document,
     so a sync costs 1 read instead of one read per provider / area / review. It is server-only (rules deny clients;
     scope.js still filters what each actor receives). Freshness: any commit touching these collections deletes it in
     the same transaction (rebuilt by the next sync), and it is rebuilt anyway after PUBLIC_TTL_MS. Write paths never use
     it — business rules keep reading the real documents inside their transaction. */
  async loadPublic() {
    if (this.tx) { await this._publicFromCollections(); return; }
    const cache = sharedFor(this.adapter), hit = cache.get('public');
    let snap = hit && Date.now() - hit.at < SHARED_TTL_MS ? hit.value : null;
    if (!snap) {
      const d = await this.adapter.get(null, 'system/public');
      this.reads++;
      if (d && Array.isArray(d.providers) && Date.now() - (Number(d.atMs) || 0) < PUBLIC_TTL_MS) snap = d;
      else { snap = await this._publicFromCollections(); if (PUBLIC_KEYS.some(k => snap[k].length)) this.publicToSave = snap; }   // nothing to summarise yet → write nothing
      cache.set('public', { at: Date.now(), value: JSON.parse(JSON.stringify(snap)) });
    }
    for (const k of PUBLIC_KEYS) for (const r of snap[k] || []) this._put(k, r.id, JSON.parse(JSON.stringify(r.data)));
  }
  async _publicFromCollections() {
    const q = async (key, query) => { const rows = await this.adapter.query(this.tx, colName(key), query); this.reads += Math.max(1, rows.length); for (const r of rows) this._put(key, r.id, r.data); return rows; };
    const [providers, serviceAreas, reviews] = await Promise.all([
      q('providers', { where: [['status', '==', 'approved']], limit: 200 }),
      q('serviceAreas', { where: [] }),
      q('reviews', { where: [], orderBy: ['at', 'desc'], limit: 20 })   // a few extra so hidden ones (filtered in scope) still leave ~12
    ]);
    return { atMs: Date.now(), providers, serviceAreas, reviews };
  }
  /** where() through the shared instance cache (public data only; never inside a transaction). */
  async whereShared(key, filters, opts = {}) {
    if (this.tx) return this.where(key, filters, opts);
    const cache = sharedFor(this.adapter), ck = key + '|' + JSON.stringify(filters) + '|' + JSON.stringify(opts), hit = cache.get(ck);
    if (hit && Date.now() - hit.at < SHARED_TTL_MS) {
      for (const r of hit.rows) this._put(key, r.id, JSON.parse(JSON.stringify(r.data)));
      return hit.rows.map(r => strip(r.data));
    }
    const q = { where: filters }; if (opts.orderBy) q.orderBy = opts.orderBy; if (opts.limit) q.limit = opts.limit;
    const rows = await this.adapter.query(null, colName(key), q);
    this.reads += Math.max(1, rows.length);
    for (const r of rows) this._put(key, r.id, r.data);
    cache.set(ck, { at: Date.now(), rows: JSON.parse(JSON.stringify(rows)) });
    return rows.map(r => strip(r.data));
  }
  /** One document by id (cached; misses are remembered too). */
  async doc(key, id) {
    if (!id) return null;
    const sid = String(id);
    if (this.maps[key].has(sid)) return strip(this.maps[key].get(sid));
    if (this.missing.has(key + '/' + sid)) return null;
    const d = await this.adapter.get(this.tx, `${colName(key)}/${sid.replace(/\//g, '%2F')}`);
    this.reads++;
    if (!d) { this.missing.add(key + '/' + sid); return null; }
    this._put(key, sid, d);
    return strip(d);
  }
  /** Documents by a list of ids — chunked `in` queries on the document id field `id` (no N+1). */
  async docsIn(key, ids) {
    const want = [...new Set(ids.filter(Boolean).map(String))].filter(id => !this.maps[key].has(id) && !this.missing.has(key + '/' + id));
    for (let i = 0; i < want.length; i += IN_CHUNK) {
      const chunk = want.slice(i, i + IN_CHUNK);
      const rows = await this.adapter.query(this.tx, colName(key), { where: [['id', 'in', chunk]] });
      this.reads += Math.max(1, rows.length);
      for (const r of rows) this._put(key, r.id, r.data);
      for (const id of chunk) if (!this.maps[key].has(id)) this.missing.add(key + '/' + id);
    }
    return ids.map(id => this.maps[key].get(String(id))).filter(Boolean).map(strip);
  }
  /** Filtered, bounded query. opts: {orderBy, limit, cursor, pageKey}. Values in an `in` filter are chunked. */
  async where(key, filters, opts = {}) {
    const inF = filters.find(f => f[1] === 'in');
    if (inF && inF[2].length > IN_CHUNK) {
      const out = [];
      for (let i = 0; i < inF[2].length; i += IN_CHUNK) out.push(...await this.where(key, filters.map(f => (f === inF ? [f[0], 'in', inF[2].slice(i, i + IN_CHUNK)] : f)), { ...opts, pageKey: null }));
      return out;
    }
    if (inF && !inF[2].length) return [];
    const q = { where: filters };
    if (opts.orderBy) q.orderBy = opts.orderBy;
    if (opts.limit) q.limit = opts.limit;
    if (opts.cursor) q.startAfter = opts.cursor;
    const rows = await this.adapter.query(this.tx, colName(key), q);
    this.reads += Math.max(1, rows.length);
    for (const r of rows) this._put(key, r.id, r.data);
    if (opts.pageKey && opts.limit && rows.length === opts.limit && opts.orderBy) {
      const last = rows[rows.length - 1];
      this.pages[opts.pageKey] = encodeCursor([last.data[opts.orderBy[0]], last.id]);
    }
    return rows.map(r => strip(r.data));
  }
  count(key, filters) { return this.adapter.count(colName(key), filters); }

  /** MP-shaped database from the loaded documents (null when the backend has never been written to). */
  toDb() {
    const { meta, settings } = this.system || {};
    const anyDoc = KNOWN_ARRAYS.some(k => this.maps[k].size);
    if (!meta && !anyDoc) return null;
    const db = { v: (meta && meta.v) || 2, meta: meta ? (({ v, ...m }) => m)(meta) : { lastReqNo: 1000 }, settings: settings || undefined };
    for (const k of KNOWN_ARRAYS) {
      const rows = [...this.maps[k].values()];
      rows.sort((a, b) => (NEWEST_FIRST.has(k) ? (b._k || 0) - (a._k || 0) : (a._k || 0) - (b._k || 0)));
      db[k] = rows.map(strip);
    }
    if (!db.settings) delete db.settings;
    return db;
  }

  /** Writes only changed/new documents and deletions among the loaded ones. Returns {changes, writes}. */
  commit(next) {
    const changes = {}; let writes = 0;
    let publicStale = false;
    const note = (k, t, id) => { (changes[k] = changes[k] || { set: [], del: [] })[t].push(id); writes++; if (SHARED_KEYS.has(k)) invalidateShared(this.adapter); if (PUBLIC_KEYS.includes(k)) publicStale = true; };
    const tx = this.tx, a = this.adapter;
    const prevMeta = this.system && this.system.meta;
    const nextMeta = { ...(next.meta || {}), v: next.v || 2 };
    if (!prevMeta || !same(prevMeta, nextMeta)) { a.set(tx, 'system/meta', nextMeta); note('meta', 'set', 'meta'); }
    const prevSettings = this.system && this.system.settings;
    if (next.settings && (!prevSettings || !same(prevSettings, next.settings))) { a.set(tx, 'system/settings', next.settings); note('settings', 'set', 'settings'); }
    let seq = 0;
    const base = Date.now() * 1000, stamp = Date.now();
    for (const k of KNOWN_ARRAYS) {
      const prev = this.maps[k];
      const items = Array.isArray(next[k]) ? next[k] : [];
      const seen = new Set();
      /* walk oldest → newest so new keys keep the app's relative order */
      const ordered = NEWEST_FIRST.has(k) ? items.slice().reverse() : items;
      for (const it of ordered) {
        const id = keyOf(k, it);
        if (seen.has(id)) continue;
        seen.add(id);
        const old = prev.get(id);
        const data = { ...JSON.parse(JSON.stringify(it)), _k: old && old._k !== undefined ? old._k : base + (++seq) };
        delete data._u;
        /* _u = last change (ms): the Admin delta sync reads only documents changed since its previous sync */
        if (!old || !same(withoutU(old), data)) { data._u = stamp; a.set(tx, `${colName(k)}/${id}`, data); note(k, 'set', id); }
      }
      for (const id of prev.keys()) if (!seen.has(id)) { a.del(tx, `${colName(k)}/${id}`); note(k, 'del', id); }
    }
    if (publicStale) { a.del(tx, 'system/public'); writes++; }   // public summary is rebuilt by the next sync
    return { changes, writes };
  }
}

const encodeCursor = v => Buffer.from(JSON.stringify(v)).toString('base64url');
function decodeCursor(s) {
  if (!s) return null;
  try { const v = JSON.parse(Buffer.from(String(s), 'base64url').toString('utf8')); return Array.isArray(v) && v.length === 2 ? v : null; } catch { return null; }
}

/** Admin SDK adapter. */
function firestoreAdapter(fs, FieldPath) {
  const build = (col, q) => {
    let ref = fs.collection(col);
    for (const [f, op, v] of q.where || []) ref = ref.where(f === 'id' && op === 'in' ? FieldPath.documentId() : f, op, v);
    if (q.orderBy) ref = ref.orderBy(q.orderBy[0], q.orderBy[1] || 'asc').orderBy(FieldPath.documentId(), q.orderBy[1] || 'asc');
    if (q.startAfter) ref = ref.startAfter(...q.startAfter);
    if (q.limit) ref = ref.limit(q.limit);
    return ref;
  };
  return {
    async get(tx, p) { const s = tx ? await tx.get(fs.doc(p)) : await fs.doc(p).get(); return s.exists ? s.data() : null; },
    async query(tx, col, q) { const ref = build(col, q); const s = tx ? await tx.get(ref) : await ref.get(); return s.docs.map(d => ({ id: d.id, data: d.data() })); },
    async count(col, where) { const s = await build(col, { where }).count().get(); return s.data().count; },
    set(tx, p, data) { tx.set(fs.doc(p), data); },
    del(tx, p) { tx.delete(fs.doc(p)); }
  };
}

module.exports = { PartialDb, firestoreAdapter, encodeCursor, decodeCursor, NEWEST_FIRST, invalidateShared, SHARED_TTL_MS };
