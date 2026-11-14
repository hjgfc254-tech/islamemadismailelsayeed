/**
 * MODULE: realtime-client
 * RESPONSIBILITY: Topic-based change feed so screens can refresh when marketplace data changes, without knowing the
 *   transport. Mock implementation (no sockets, no network):
 *     • same tab  — every successful mutating request through services/api-client.js publishes `market:changed`;
 *     • other tabs — the browser `storage` event on the shared store key `hs_mp_db` publishes `market:changed`
 *       (e.g. Admin approves a provider in one tab → the Provider tab can refresh).
 *   A backend phase replaces `connect()` with a WebSocket/SSE transport keeping the same subscribe() contract.
 * CONTRACT: subscribe(topic, fn) → unsubscribe(); fn receives { topic, source: 'local'|'storage'|'manual', detail, at }.
 * STATUS: IMPLEMENTED (MOCK ADAPTER — in-browser events only, no network)
 */
'use strict';
(function (root, factory) {
  const client = root.HSApiClient || (typeof require === 'function' ? require('./api-client.js') : null);
  const api = factory(root, client);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSRealtimeClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, client) {
  const STORE_KEY = 'hs_mp_db';
  const TOPICS = ['market:changed'];
  const subs = new Map();          // topic → Set<fn>
  let connected = false;
  let offMutation = null;
  let onStorage = null;

  function publish(topic, source, detail) {
    const set = subs.get(topic);
    if (!set) return 0;
    const evt = { topic, source, detail: detail || null, at: new Date().toISOString() };
    for (const fn of Array.from(set)) { try { fn(evt); } catch {} }
    return set.size;
  }

  /** Starts listening (idempotent). Called lazily by the first subscribe(). */
  function connect() {
    if (connected) return;
    connected = true;
    if (client) offMutation = client.onMutation(e => publish('market:changed', 'local', { method: e.method, path: e.path }));
    if (root.addEventListener) {
      onStorage = e => {
        if (!e || e.key !== STORE_KEY) return;
        const s = client && client.store();                       // refresh the local read model first
        if (s && typeof s.reload === 'function') { try { s.reload(); } catch {} }
        publish('market:changed', 'storage', null);
      };
      root.addEventListener('storage', onStorage);
    }
  }
  function disconnect() {
    if (!connected) return;
    connected = false;
    if (offMutation) { offMutation(); offMutation = null; }
    if (onStorage && root.removeEventListener) root.removeEventListener('storage', onStorage);
    onStorage = null;
  }

  function subscribe(topic, fn) {
    if (!TOPICS.includes(topic)) throw new Error('realtime-client: unknown topic ' + topic);
    if (typeof fn !== 'function') throw new Error('realtime-client: listener must be a function');
    connect();
    if (!subs.has(topic)) subs.set(topic, new Set());
    subs.get(topic).add(fn);
    return () => { const s = subs.get(topic); if (s) s.delete(fn); };
  }

  return {
    TOPICS, STORE_KEY, subscribe, connect, disconnect,
    isConnected: () => connected,
    /** Manual publish (e.g. after a direct local-store write that bypassed api-client). */
    notify: detail => publish('market:changed', 'manual', detail),
    _reset() { disconnect(); subs.clear(); }
  };
});
