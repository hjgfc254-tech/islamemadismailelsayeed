'use strict';
/* In-memory stand-in for the server backend (functions/index.js `backend`): documents by path, queries with
   ==, in, >=, >, <, <=, array-contains, orderBy / limit, count, and transactions that run one at a time (like the
   outcome of Firestore's optimistic retries). Used by the digest tests. */
function memoryBackend(seed = {}) {
  const docs = new Map(Object.entries(seed)); let auto = 0, chain = Promise.resolve();
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const rows = (col) => [...docs].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2).map(([p, d]) => ({ id: p.split('/')[1], data: clone(d) }));
  const ops = { '==': (x, v) => x === v, in: (x, v) => v.includes(x), '>=': (x, v) => x != null && x >= v, '>': (x, v) => x != null && x > v, '<': (x, v) => x != null && x < v, '<=': (x, v) => x != null && x <= v, 'array-contains': (x, v) => Array.isArray(x) && x.includes(v) };
  const match = (r, [f, op, v]) => ops[op](f === 'id' ? r.id : r.data[f], v);
  const adapter = {
    async get(tx, p) { return docs.has(p) ? clone(docs.get(p)) : null; },
    async query(tx, col, q = {}) {
      let out = rows(col).filter((r) => (q.where || []).every((w) => match(r, w)));
      if (q.orderBy) { const [f, dir] = q.orderBy, s = dir === 'desc' ? -1 : 1; out = out.filter((r) => r.data[f] !== undefined).sort((a, b) => (a.data[f] < b.data[f] ? -s : a.data[f] > b.data[f] ? s : 0)); }
      return q.limit ? out.slice(0, q.limit) : out;
    },
    async count(col, where) { return rows(col).filter((r) => (where || []).every((w) => match(r, w))).length; },
    set(tx, p, d) { docs.set(p, clone(d)); }, del(tx, p) { docs.delete(p); }
  };
  const backend = {
    docs, adapter, digestDeps: undefined,
    runTransaction(fn) { const run = chain.then(() => fn({})); chain = run.catch(() => {}); return run; },
    async getDoc(p) { return adapter.get(null, p); },
    async setDoc(p, d, merge) { docs.set(p, merge && docs.has(p) ? { ...docs.get(p), ...clone(d) } : clone(d)); },
    async addDoc(col, d) { docs.set(`${col}/auto${++auto}`, clone(d)); },
    async deleteDoc(p) { docs.delete(p); },
    async queryDocs(col, field, op, value) { return rows(col).filter((r) => match(r, [field, op, value])); },
    async signal() {}, env: { bootstrapEmails: [] }
  };
  return backend;
}
module.exports = { memoryBackend };
