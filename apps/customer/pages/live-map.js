/**
 * MODULE: live-map (HSLiveMap) — the technician on a map while «في الطريق» (free: MapLibre + OpenFreeMap vector tiles via
 * shared/components/hs-map.js, OpenStreetMap data credited, no keys). The tracking screen renders <div data-live-map data-live data-home>; this module
 * lazy-loads Leaflet only when such a card is on screen, draws the technician (latest shared point) and the customer's
 * pin if set, and shows «آخر تحديث من X دقيقة» + straight-line distance and a rough ETA. Re-renders of the screen
 * (live refresh after each shared point) update the card in place. Tiles are third-party: the service worker never
 * caches them.
 */
'use strict';
(function (root) {
  const doc = root.document;
  if (!doc || root.HSLiveMap) return;
  const parse = (v) => { try { const g = JSON.parse(v || 'null'); return g && Number.isFinite(+g.lat) && Number.isFinite(+g.lng) ? g : null; } catch (e) { return null; } };
  const metres = (a, b) => { const R = 6371e3, r = (x) => x * Math.PI / 180, dl = r(b.lat - a.lat), dn = r(b.lng - a.lng); const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const nf = (n, d = 0) => (+n || 0).toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: d });
  function noteText(tech, home) {
    if (!tech) return 'لما الفني يشارك موقعه هيظهر هنا على الخريطة.';
    const mins = Math.max(0, Math.round((Date.now() - Date.parse(tech.at)) / 60000));
    let s = mins < 1 ? 'آخر تحديث دلوقتي' : `آخر تحديث من ${nf(mins)} دقيقة`;
    if (home) {
      const m = metres(tech, home), km = m / 1000;
      const eta = Math.max(1, Math.round(km / 25 * 60));            // ~25 km/h city average, straight line
      s += m < 150 ? ' · الفني وصل تقريبًا' : ` · على بعد ${km < 1 ? nf(m, 0) + ' متر' : nf(km, 1) + ' كم'} (خط مستقيم) · حوالي ${nf(eta)} دقيقة`;
    }
    return s;
  }
  const maps = new WeakMap();
  /* drawn with the shared fast map (shared/components/hs-map.js: MapLibre + OpenFreeMap, Arabic labels) */
  async function hydrate(el) {
    const tech = parse(el.dataset.live), home = parse(el.dataset.home);
    const note = el.parentElement && el.parentElement.querySelector('[data-live-note]');
    if (note) note.textContent = noteText(tech, home);
    if (!tech && !home) { el.hidden = true; return; }
    el.hidden = false;
    const pts = [home && { ...home, cls: 'is-home', label: 'بيتك', key: 'home' }, tech && { ...tech, cls: 'is-tech', label: 'الفني', key: 'tech' }].filter(Boolean);
    let st = maps.get(el);
    try {
      if (!st) { if (!root.HSMap) throw new Error('map'); st = await root.HSMap.view(el, pts); maps.set(el, st); }
      else st.set(pts);
    } catch (e) { el.hidden = true; }
  }
  function scan() { for (const el of doc.querySelectorAll('[data-live-map]')) { const key = el.dataset.live + '|' + el.dataset.home; if (el.dataset.drawn !== key) { el.dataset.drawn = key; hydrate(el); } } }
  function start() {
    if (!doc.querySelectorAll || !doc.body) return;   /* minimal DOMs (unit tests) */
    scan();
    if (typeof MutationObserver === 'function') new MutationObserver(() => scan()).observe(doc.body, { childList: true, subtree: true });
    if (typeof setInterval === 'function') setInterval(() => { for (const el of doc.querySelectorAll('[data-live-map]')) { const n = el.parentElement && el.parentElement.querySelector('[data-live-note]'); if (n) n.textContent = noteText(parse(el.dataset.live), parse(el.dataset.home)); } }, 60000);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
  root.HSLiveMap = Object.freeze({ noteText, metres, scan });
})(typeof globalThis !== 'undefined' ? globalThis : this);
