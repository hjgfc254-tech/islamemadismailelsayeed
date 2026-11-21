/**
 * MODULE: live-map (HSLiveMap) — the technician on a map while «في الطريق» (free: Leaflet 1.9.4 vendored + OpenStreetMap
 * tiles with attribution, no keys). The tracking screen renders <div data-live-map data-live data-home>; this module
 * lazy-loads Leaflet only when such a card is on screen, draws the technician (latest shared point) and the customer's
 * pin if set, and shows «آخر تحديث من X دقيقة» + straight-line distance and a rough ETA. Re-renders of the screen
 * (live refresh after each shared point) update the card in place. Tiles are third-party: the service worker never
 * caches them.
 */
'use strict';
(function (root) {
  const doc = root.document;
  if (!doc || root.HSLiveMap) return;
  const BASE = '../../assets/vendor/leaflet/1.9.4/';
  let loading = null;
  function loadLeaflet() {
    if (root.L && root.L.map) return Promise.resolve(root.L);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const css = doc.createElement('link'); css.rel = 'stylesheet'; css.href = BASE + 'leaflet.css'; doc.head.appendChild(css);
      const s = doc.createElement('script'); s.src = BASE + 'leaflet.js'; s.async = true;
      s.onload = () => resolve(root.L); s.onerror = () => { loading = null; reject(new Error('leaflet')); };
      doc.head.appendChild(s);
    });
    return loading;
  }
  const parse = (v) => { try { const g = JSON.parse(v || 'null'); return g && Number.isFinite(+g.lat) && Number.isFinite(+g.lng) ? g : null; } catch (e) { return null; } };
  const metres = (a, b) => { const R = 6371e3, r = (x) => x * Math.PI / 180, dl = r(b.lat - a.lat), dn = r(b.lng - a.lng); const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const nf = (n, d = 0) => (+n || 0).toLocaleString('ar-EG', { maximumFractionDigits: d });
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
  const icon = (L, cls, label) => L.divIcon({ className: 'live-pin ' + cls, html: `<span aria-hidden="true"></span><b>${label}</b>`, iconSize: [36, 36], iconAnchor: [18, 18] });
  async function hydrate(el) {
    const tech = parse(el.dataset.live), home = parse(el.dataset.home);
    const note = el.parentElement && el.parentElement.querySelector('[data-live-note]');
    if (note) note.textContent = noteText(tech, home);
    if (!tech && !home) { el.hidden = true; return; }
    el.hidden = false;
    let L; try { L = await loadLeaflet(); } catch (e) { el.hidden = true; return; }
    let st = maps.get(el);
    if (!st) {
      const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const map = L.map(el, { zoomControl: false, attributionControl: true, dragging: true, scrollWheelZoom: false, zoomAnimation: !reduce, fadeAnimation: !reduce });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
      st = { map, tech: null, home: null };
      maps.set(el, st);
    }
    if (home && !st.home) st.home = L.marker([home.lat, home.lng], { icon: icon(L, 'is-home', 'بيتك'), keyboard: false }).addTo(st.map);
    if (tech) { if (st.tech) st.tech.setLatLng([tech.lat, tech.lng]); else st.tech = L.marker([tech.lat, tech.lng], { icon: icon(L, 'is-tech', 'الفني'), keyboard: false }).addTo(st.map); }
    const pts = [tech, home].filter(Boolean).map((g) => [g.lat, g.lng]);
    if (pts.length === 2) st.map.fitBounds(pts, { padding: [36, 36], maxZoom: 16 }); else st.map.setView(pts[0], 15);
    setTimeout(() => { try { st.map.invalidateSize(); } catch (e) {} }, 60);
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
