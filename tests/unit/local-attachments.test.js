'use strict';
/* Request attachments layer (services/local-attachments.js): validation limits, add / list / stats / remove, draft →
   request migration, summaries — on a tiny in-memory IndexedDB and in the no-IndexedDB fallback (memory mode). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FILE = 'services/local-attachments.js';
const SRC = fs.readFileSync(path.join(__dirname, '../..', FILE), 'utf8');

/* Minimal async IndexedDB: open → onupgradeneeded/onsuccess, transaction → objectStore put/get/delete/getAll/clear. */
function fakeIndexedDB() {
  const stores = new Map();
  const later = fn => setImmediate(fn);
  const request = run => { const r = {}; later(() => { try { r.result = run(); r.onsuccess && r.onsuccess(); } catch (e) { r.error = e; r.onerror && r.onerror(); } }); return r; };
  const db = {
    objectStoreNames: { contains: n => stores.has(n) },
    createObjectStore(n) { stores.set(n, new Map()); return { createIndex() {} }; },
    transaction(n) {
      const m = stores.get(n), tx = {};
      later(() => later(() => tx.oncomplete && tx.oncomplete()));
      tx.objectStore = () => ({
        put: rec => request(() => { m.set(rec.id, structuredClone({ ...rec, blob: null })); return rec.id; }),
        get: id => request(() => m.get(id)),
        delete: id => request(() => m.delete(id)),
        getAll: () => request(() => [...m.values()]),
        clear: () => request(() => m.clear())
      });
      return tx;
    }
  };
  return { open() { const r = {}; later(() => { r.result = db; r.onupgradeneeded && r.onupgradeneeded(); r.onsuccess && r.onsuccess(); }); return r; }, _stores: stores };
}

function load({ idb } = {}) {
  const ctx = { console, setImmediate, Promise, Date, Math, Map, Set, Array, Object, JSON, structuredClone,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Image: function () { const self = this; setImmediate(() => { self.width = 1200; self.height = 800; self.onload && self.onload(); }); },
    document: { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,AAAA' }) } };
  if (idb) ctx.indexedDB = idb;
  vm.createContext(ctx);
  vm.runInContext(SRC + '\n;globalThis.AT = AT;', ctx, { filename: FILE });
  return ctx.AT;
}
const plain = x => JSON.parse(JSON.stringify(x));   /* vm objects come from another realm */
const img = (name, mb = 1, type = 'image/jpeg') => ({ name, type, size: Math.round(mb * 1024 * 1024) });

for (const mode of ['indexeddb', 'memory']) {
  test(`attachments (${mode}): validation, add, list, stats, summary, remove`, async () => {
    const AT = load(mode === 'indexeddb' ? { idb: fakeIndexedDB() } : {});
    const L = AT.limits();
    assert.equal(L.maxFiles, 6); assert.equal(L.maxVideoCount, 1);
    /* validation: type, size, count */
    const v = AT.validateFiles([img('a.jpg'), img('big.jpg', 9), { name: 'x.pdf', type: 'application/pdf', size: 10 }, img('v.mp4', 41, 'video/mp4')], 0);
    assert.equal(v.ok, false); assert.equal(v.valid.length, 1);
    assert.deepEqual(plain(v.errors).map(e => e.name), ['big.jpg', 'x.pdf', 'v.mp4']);
    assert.equal(AT.validateFiles([img('a'), img('b')], 5).valid.length, 1, 'at most 6 per request');
    /* add: thumbnails for images, one video max */
    const res = await AT.addFiles('r1', [img('a.jpg'), img('b.png', 2, 'image/png'), img('v1.mp4', 5, 'video/mp4'), img('v2.mp4', 5, 'video/mp4')]);
    assert.equal(res.ok, true);
    assert.equal(res.added.length, 3); assert.match(res.errors[0].reason, /فيديو/);
    assert.equal(AT.isMemoryMode(), mode === 'memory');
    const list = await AT.listForReq('r1');
    assert.deepEqual(plain(list).map(x => x.kind), ['image', 'image', 'video']);
    assert.match(list[0].thumb, /^data:image\/jpeg/); assert.equal(list[2].thumb, '');
    assert.deepEqual(plain(await AT.stats('r1')), { count: 3, bytes: list.reduce((s, x) => s + x.size, 0) });
    const sum = AT.toSummary(list[0]);
    assert.deepEqual(plain(Object.keys(sum).sort()), ['createdAt', 'id', 'kind', 'mime', 'name', 'size', 'thumb']);
    assert.equal(AT.toSummary(null), null);
    assert.equal((await AT.get(list[0].id)).name, 'a.jpg');
    assert.equal(await AT.get('nope'), null);
    /* remove one, then all */
    assert.equal(await AT.remove(list[0].id), true);
    assert.equal((await AT.listForReq('r1')).length, 2);
    assert.equal(await AT.removeForReq('r1'), 2);
    assert.deepEqual(plain(await AT.stats('r1')), { count: 0, bytes: 0 });
  });

  test(`attachments (${mode}): draft files move to the request after sending; clearAll resets`, async () => {
    const AT = load(mode === 'indexeddb' ? { idb: fakeIndexedDB() } : {});
    await AT.addFiles('', [img('d1.jpg'), img('d2.jpg')], { draftId: 'dr1' });
    assert.equal(await AT.migrateDraftAttachments('', 'r9'), 0);
    assert.equal(await AT.migrateDraftAttachments('dr1', 'r9'), 2);
    const moved = await AT.listForReq('r9');
    assert.equal(moved.length, 2); assert.ok(moved.every(x => x.draftId === ''));
    assert.equal(await AT.migrateDraftAttachments('dr1', 'r10'), 0, 'already moved');
    await AT.clearAll();
    assert.equal((await AT.listForReq('r9')).length, 0);
  });
}

test('attachments: an IndexedDB that fails to open falls back to memory', async () => {
  const AT = load({ idb: { open() { const r = {}; setImmediate(() => r.onerror && r.onerror()); return r; } } });
  const res = await AT.addFiles('r1', [img('a.jpg')]);
  assert.equal(res.ok, true); assert.equal(AT.isMemoryMode(), true);
  assert.equal(await AT.getBlobUrl(res.added[0].id), 'blob:x');
});
