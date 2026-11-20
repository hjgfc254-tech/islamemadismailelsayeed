/**
 * MODULE: error-reporter (HSErrorReporter) — collects uncaught errors and unhandled promise rejections from the real
 * visitors' browsers so the team sees actual crashes instead of guessing.
 *   Firebase mode: batched to POST /telemetry/errors (server scrubs, groups and rate limits; functions/src/telemetry.js).
 *   Local demo:    kept on this device in localStorage 'hs_client_errors' (last 50) and shown in Admin › سجل التدقيق.
 * Privacy: only the message, the file path and line, a short stack, the route (hash without query) and a short browser
 * name are sent — emails, phone numbers, long digit runs and tokens are masked here and again on the server.
 * Noise filters: cross-origin «Script error.», browser-extension frames, ResizeObserver loop notices, and duplicates.
 * At most MAX_PER_PAGE reports per page load; reporting never throws and never retries.
 */
'use strict';
(function (root) {
  if (root.HSErrorReporter) return;
  const KEY = 'hs_client_errors', MAX_LOCAL = 50, MAX_PER_PAGE = 10, FLUSH_MS = 4000;
  const doc = root.document, loc = root.location || { pathname: '', hash: '', origin: '' };
  const appMatch = /\/apps\/(customer|provider|admin)\//.exec(loc.pathname || ''), app = appMatch ? appMatch[1] : 'customer';
  const seen = new Set(); let queue = [], sent = 0, timer = 0;

  const mask = (s, max) => String(s == null ? '' : s)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
        .replace(/\b(eyJ[\w-]{10,}\.[\w-]+\.[\w-]+|AIza[\w-]{20,}|[A-Za-z0-9_-]{32,})\b/g, '<token>')
    .replace(/\+?[\d\u0660-\u0669][\d\u0660-\u0669\s-]{7,}[\d\u0660-\u0669]/g, '<num>')
    .replace(/\?[^\s#)'":]*/g, '').slice(0, max);
  const rel = (u) => String(u || '').replace(loc.origin || '\u0000', '');
  const ua = () => { const n = (root.navigator && root.navigator.userAgent) || ''; const m = /(Edg|OPR|SamsungBrowser|Chrome|Firefox|Version)\/(\d+)/.exec(n); const os = ['Android', 'iPhone', 'iPad', 'Windows', 'Mac OS X', 'Linux'].find((x) => n.includes(x)); return (m ? (m[1] === 'Version' ? 'Safari' : m[1]) + ' ' + m[2] : 'other') + (os ? ' · ' + os : ''); };
  const noise = (msg, src, stack) => /^Script error\.?$/i.test(msg) || /ResizeObserver loop/i.test(msg) ||
    /(chrome|moz|safari)-extension:\/\//.test(String(src) + String(stack)) || (!!src && !!loc.origin && !String(src).startsWith(loc.origin));   // only this site's own scripts

  function capture(kind, msg, src, line, col, stack) {
    try {
      msg = String(msg || '').trim(); src = String(src || '');
      if (!msg || noise(msg, src, stack) || sent + queue.length >= MAX_PER_PAGE) return;
      const where = rel(src) + (line ? ':' + line + (col ? ':' + col : '') : '');
      const k = kind + '|' + msg + '|' + where; if (seen.has(k)) return; seen.add(k);
      queue.push({ kind, msg: mask(msg, 300), src: mask(where, 200), stack: mask(String(stack || '').split('\n').slice(0, 6).map(rel).join('\n'), 900),
        route: mask((loc.hash || '#').split('?')[0], 80), ua: ua(), at: new Date().toISOString() });
      clearTimeout(timer); timer = setTimeout(flush, FLUSH_MS);
    } catch (e) { /* reporting must never break the page */ }
  }

  const live = () => !!(root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase' && root.HSApiClient && root.HSBackend);
  function flush() {
    if (!queue.length) return;
    const batch = queue.splice(0, 5); sent += batch.length;
    if (live()) {
      try { Promise.resolve(root.HSApiClient.request('POST', '/telemetry/errors', { body: { reports: batch } })).catch(() => {}); } catch (e) {}
    } else {
      try {
        const cur = JSON.parse(root.localStorage.getItem(KEY) || '[]');
        batch.forEach((r) => { const g = cur.find((x) => x.app === app && x.msg === r.msg && x.src === r.src); if (g) { g.count++; g.last = r.at; } else cur.unshift({ app, ...r, first: r.at, last: r.at, count: 1 }); });
        root.localStorage.setItem(KEY, JSON.stringify(cur.sort((a, b) => (a.last < b.last ? 1 : -1)).slice(0, MAX_LOCAL)));
      } catch (e) {}
    }
    if (queue.length) timer = setTimeout(flush, 500);
  }

  if (root.addEventListener) {
    root.addEventListener('error', (e) => {
      if (e && e.target && e.target !== root && e.target.tagName) return;     // resource load errors (img/script) are not JS errors
      capture('error', e.message || (e.error && e.error.message), e.filename, e.lineno, e.colno, e.error && e.error.stack);
    });
    root.addEventListener('unhandledrejection', (e) => {
      const r = e && e.reason; const msg = r && r.message ? r.message : (typeof r === 'string' ? r : (r && r.code) || 'Unhandled rejection');
      const m = r && r.stack ? /\((https?:[^)]+?):(\d+):(\d+)\)|at (https?:\S+?):(\d+):(\d+)/.exec(r.stack) : null;
      capture('rejection', msg, m ? (m[1] || m[4]) : '', m ? (m[2] || m[5]) : 0, m ? (m[3] || m[6]) : 0, r && r.stack);
    });
    root.addEventListener('pagehide', flush);
  }
  if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'hidden') flush(); });

  root.HSErrorReporter = Object.freeze({
    capture, flush, mask, KEY,
    local: () => { try { return JSON.parse(root.localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } },
    clearLocal: () => { try { root.localStorage.removeItem(KEY); } catch (e) {} }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
