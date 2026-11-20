/**
 * MODULE: api-client
 * RESPONSIBILITY: The single request boundary between the frontend and a future backend. Today it runs in MOCK mode:
 *   requests are dispatched to in-process route handlers (registered by services/*-api.js) that operate on the local
 *   demo store (services/local-market-store.js → `MP`, localStorage `hs_mp_db`). NO network request is ever made in
 *   mock mode. A later backend phase plugs an HTTP transport in with `setTransport(fn)` — callers do not change.
 * CONTRACT (every call resolves, never throws):
 *   { ok:true,  status:200|201, data }
 *   { ok:false, status, error:{ code, message, details? } }   code ∈ ERRORS (UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, …)
 * PERMISSION BOUNDARY: each route declares the roles allowed to call it ('public' | 'customer' | 'provider' | 'admin').
 *   The mock enforces it (401 without an actor, 403 for the wrong role) so the UI can be built against real failure
 *   modes. This is a DEMO boundary only — real authorization must be enforced server-side.
 * STATUS: IMPLEMENTED (MOCK ADAPTER — no backend, no network, no real authentication)
 */
'use strict';
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSApiClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const ERRORS = Object.freeze({
    BAD_REQUEST: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
    CONFLICT: 409, VALIDATION: 422, INTERNAL: 500, UNAVAILABLE: 503
  });
  const ROLES = Object.freeze(['public', 'customer', 'provider', 'admin']);
  const MESSAGES = {
    UNAUTHENTICATED: 'يلزم تسجيل الدخول لإتمام هذا الإجراء',
    FORBIDDEN: 'ليست لديك صلاحية لهذا الإجراء',
    NOT_FOUND: 'العنصر المطلوب غير موجود',
    UNAVAILABLE: 'الخدمة غير متاحة حاليًا — المخزن المحلي غير محمّل',
    INTERNAL: 'حدث خطأ غير متوقع'
  };

  const routes = [];
  const listeners = new Set();
  let transport = null;                 // future HTTP transport: async ({method, path, body, query, actor}) => envelope
  let latencyMs = 0;                    // optional simulated latency (lets the UI exercise loading states)
  let actorResolver = () => null;       // set by services/auth-api.js
  let storeOverride = null;

  /* ── envelopes ───────────────────────────────────────────── */
  const ok = (data, status = 200) => ({ ok: true, status, data });
  function fail(code, message, details) {
    const c = Object.prototype.hasOwnProperty.call(ERRORS, code) ? code : 'INTERNAL';
    const e = { code: c, message: message || MESSAGES[c] || MESSAGES.INTERNAL };
    if (details !== undefined) e.details = details;
    return { ok: false, status: ERRORS[c], error: e };
  }
  const isEnvelope = v => v && typeof v === 'object' && typeof v.ok === 'boolean' && typeof v.status === 'number';
  /** Normalizes anything a handler/transport returns into the contract envelope. */
  function normalize(v) {
    if (isEnvelope(v)) return v.ok ? v : fail(v.error && v.error.code, v.error && v.error.message, v.error && v.error.details);
    return ok(v === undefined ? null : v);
  }

  /* ── routing ─────────────────────────────────────────────── */
  function compile(pattern) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '$');
    return { re, keys };
  }
  /**
   * Registers a mock route. opts: { roles:[...], summary:'', idempotent?:bool }.
   * handler({ params, query, body, actor, store }) returns data, or an envelope from ok()/fail().
   */
  function define(method, pattern, opts, handler) {
    const m = String(method).toUpperCase();
    const roles = (opts && opts.roles) || [];
    if (!roles.length || roles.some(r => !ROLES.includes(r))) throw new Error('api-client: route ' + m + ' ' + pattern + ' needs roles from ' + ROLES.join('/'));
    if (routes.some(r => r.method === m && r.pattern === pattern)) throw new Error('api-client: duplicate route ' + m + ' ' + pattern);
    routes.push({ method: m, pattern, roles, summary: (opts && opts.summary) || '', ...compile(pattern), handler });
  }
  /** Most specific match wins: fewer :params first (so /providers/me beats /providers/:id regardless of load order). */
  function match(method, path) {
    let best = null;
    for (const r of routes) {
      if (r.method !== method) continue;
      const hit = r.re.exec(path);
      if (hit && (!best || r.keys.length < best.route.keys.length)) best = { route: r, hit };
    }
    return best && { route: best.route, params: Object.fromEntries(best.route.keys.map((k, i) => [k, decodeURIComponent(best.hit[i + 1])])) };
  }
  function splitQuery(path) {
    const i = path.indexOf('?');
    if (i < 0) return { path, query: {} };
    const query = {};
    for (const part of path.slice(i + 1).split('&')) {
      if (!part) continue;
      const [k, v = ''] = part.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    }
    return { path: path.slice(0, i), query };
  }

  /* ── store access (MP is a global lexical binding, not a globalThis property) ── */
  function store() {
    if (storeOverride) return storeOverride;
    try { return typeof MP !== 'undefined' ? MP : null; } catch { return null; }
  }

  const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function emit(evt) { for (const fn of listeners) { try { fn(evt); } catch {} } }

  /**
   * Performs a request. options: { body, query, actor }. `actor` overrides the session-derived actor (tests/tools).
   * Resolves with the contract envelope; never rejects.
   */
  /** Message when an owner switch blocks this non-admin mutation, else ''. */
  function controlsBlock(c, method, pattern) {
    if (!c || typeof c !== 'object') return '';
    if (c.maintenance && c.maintenance.on) return String(c.maintenance.message || '') || 'المنصة في صيانة دلوقتي — جرّب تاني بعد شوية';
    if (c.pauseOrders && c.pauseOrders.on && method === 'POST' && pattern === '/requests') return String(c.pauseOrders.message || '') || 'استقبال الطلبات الجديدة متوقف مؤقتًا — جرّب تاني بعد شوية';
    if (c.pauseSignups && c.pauseSignups.on && method === 'POST' && pattern === '/providers/register') return 'تسجيل مقدمي الخدمة الجدد متوقف مؤقتًا';
    return '';
  }

  async function request(method, rawPath, options = {}) {
    const m = String(method || 'GET').toUpperCase();
    const { path, query: q } = splitQuery(String(rawPath || ''));
    const query = { ...q, ...(options.query || {}) };
    const actor = options.actor !== undefined ? options.actor : actorResolver();
    if (transport) {
      try { return normalize(await transport({ method: m, path, query, body: options.body, actor })); }
      catch (e) { return fail('UNAVAILABLE', (e && e.message) || MESSAGES.UNAVAILABLE); }
    }
    if (latencyMs) await sleep(latencyMs);
    const hit = match(m, path);
    if (!hit) return fail('NOT_FOUND', 'لا يوجد مسار ' + m + ' ' + path);
    const { route, params } = hit;
    if (!route.roles.includes('public')) {
      if (!actor || !actor.role) return fail('UNAUTHENTICATED');
      if (!route.roles.includes(actor.role)) return fail('FORBIDDEN');
    }
    const s = store();
    if (!s) return fail('UNAVAILABLE');
    /* Owner emergency switches (settings.controls, set by POST /admin/controls): customers and providers cannot change
       anything while the platform is in maintenance; new requests / provider sign-ups can be paused on their own.
       Admin calls always pass, so the team can keep working during an incident. Same check on the server (synced domain). */
    if (m !== 'GET' && (!actor || actor.role !== 'admin')) {
      const blocked = controlsBlock(((s.db && s.db().settings) || {}).controls, m, route.pattern);
      if (blocked) return fail('UNAVAILABLE', blocked);
    }
    let out;
    try { out = normalize(route.handler({ params, query, body: clone(options.body) || {}, actor, store: s })); }
    catch (e) { return fail('INTERNAL', (e && e.message) || MESSAGES.INTERNAL); }
    if (out.ok) {
      out = { ...out, data: clone(out.data) };          // callers can never mutate store objects through a response
      if (m !== 'GET') emit({ type: 'mutation', method: m, path, route: route.pattern });
    }
    return out;
  }

  /** Maps a result to the UI state every screen must handle: loading is the caller's pending promise. */
  function viewState(result) {
    if (!result) return 'loading';
    if (!result.ok) return result.status === 401 || result.status === 403 ? 'denied' : 'error';
    const d = result.data;
    if (d == null || (Array.isArray(d) && !d.length) || (d && Array.isArray(d.items) && !d.items.length)) return 'empty';
    return 'ready';
  }

  return {
    ERRORS, ROLES, ok, fail, normalize, define, request, viewState, store, controlsBlock,
    get: (p, o) => request('GET', p, o),
    post: (p, body, o) => request('POST', p, { ...(o || {}), body }),
    patch: (p, body, o) => request('PATCH', p, { ...(o || {}), body }),
    del: (p, o) => request('DELETE', p, o),
    mode: () => (transport ? 'remote' : 'mock'),
    setTransport(fn) { transport = typeof fn === 'function' ? fn : null; },
    setLatency(ms) { latencyMs = Math.max(0, +ms || 0); },
    setActorResolver(fn) { actorResolver = typeof fn === 'function' ? fn : () => null; },
    setStore(s) { storeOverride = s || null; },
    onMutation(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** The registered contract (method, path, roles, summary) — used by docs/tests. */
    routes: () => routes.map(r => ({ method: r.method, path: r.pattern, roles: r.roles.slice(), summary: r.summary })),
    _reset() { routes.length = 0; listeners.clear(); transport = null; latencyMs = 0; actorResolver = () => null; storeOverride = null; }
  };
});
