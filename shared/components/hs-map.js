/**
 * MODULE: hs-map (HSMap) — one fast map layer for the apps (free, no keys, no usage limits).
 *   • MapLibre GL 4.7.1 (vendored: assets/vendor/maplibre/4.7.1) + OpenFreeMap vector tiles (OpenStreetMap data,
 *     «liberty» style, CDN, no API key). Vector maps draw sharp at every zoom and pan/zoom smoothly; street and
 *     place names are shown in Arabic when OSM has them (name:ar), otherwise the local name.
 *   • The library (~220 KB gzip) is loaded only on screens that may open a map, PRE-loaded in the background there
 *     (HSMap.prefetch()), so «حدد مكانك» opens at once; the service worker caches it after first use.
 *   • HSMap.picker(el, {start, onChange}): Uber-style picker — the pin stays fixed in the centre while the map moves
 *     under it; «موقعي» jumps to a fast approximate position first, then refines it.
 *   • HSMap.view(el, points): read-only map with labelled markers (live tracking).
 *   • HSMap.locate(onFix): fast-then-accurate geolocation; remembers the last position on this device.
 */
'use strict';
(function (root) {
  const doc = root.document;
  if (!doc || root.HSMap) return;
  const ROOT = (function () { const s = doc.currentScript && doc.currentScript.src; return s ? s.replace(/shared\/components\/hs-map\.js.*$/, '') : '../../'; })();
  const LIB = ROOT + 'assets/vendor/maplibre/4.7.1/';
  const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  const LAST = 'hs_last_geo';
  const CAIRO = { lat: 30.0444, lng: 31.2357 };
  let loading = null, warmed = false;

  function warm() {
    if (warmed || !doc.head) return; warmed = true;
    const l = doc.createElement('link'); l.rel = 'preconnect'; l.href = 'https://tiles.openfreemap.org'; l.crossOrigin = ''; doc.head.appendChild(l);
  }
  function load() {
    if (root.maplibregl && root.maplibregl.Map) return Promise.resolve(root.maplibregl);
    if (loading) return loading;
    warm();
    loading = new Promise((resolve, reject) => {
      const css = doc.createElement('link'); css.rel = 'stylesheet'; css.href = LIB + 'maplibre-gl.css'; doc.head.appendChild(css);
      const s = doc.createElement('script'); s.src = LIB + 'maplibre-gl.js'; s.async = true;
      s.onload = () => {
        if (!root.maplibregl) return reject(new Error('maplibre'));
        /* Arabic shaping + right-to-left labels (mapbox-gl-rtl-text, vendored next to the library) */
        try { if (root.maplibregl.getRTLTextPluginStatus() === 'unavailable') root.maplibregl.setRTLTextPlugin(LIB + 'mapbox-gl-rtl-text.min.js', false); } catch (e) {}
        resolve(root.maplibregl);
      };
      s.onerror = () => { loading = null; reject(new Error('maplibre')); };
      doc.head.appendChild(s);
    });
    return loading;
  }
  /** start loading in the background (screens that may open a map call this) */
  function prefetch() { const go = () => { load().catch(() => {}); fetch(STYLE, { mode: 'cors' }).catch(() => {}); }; if (root.requestIdleCallback) root.requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 300); }

  const supported = () => { try { const c = doc.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } };
  const lastKnown = () => { try { const g = JSON.parse(root.localStorage.getItem(LAST) || 'null'); return g && Number.isFinite(g.lat) && Number.isFinite(g.lng) ? g : null; } catch (e) { return null; } };
  const remember = (g) => { try { root.localStorage.setItem(LAST, JSON.stringify({ lat: +g.lat.toFixed(5), lng: +g.lng.toFixed(5), at: Date.now() })); } catch (e) {} };
  const reduce = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /** Arabic names first (OSM name:ar), then the local name */
  function arabicLabels(map) {
    try {
      for (const layer of map.getStyle().layers || []) {
        if (layer.type !== 'symbol' || !layer.layout || !layer.layout['text-field']) continue;
        map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:ar'], ['get', 'name'], ['get', 'name_en']]);
      }
    } catch (e) { /* style still loading or custom layer */ }
  }
  function makeMap(gl, el, opts) {
    const map = new gl.Map({ container: el, style: STYLE, center: [opts.center.lng, opts.center.lat], zoom: opts.zoom, attributionControl: { compact: true },
      dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: reduce() ? 0 : 150, cooperativeGestures: !!opts.cooperative });
    map.touchZoomRotate.disableRotation();
    map.on('style.load', () => arabicLabels(map));
    /* attribution stays available behind the «i» button instead of covering the bottom of a small map */
    map.once('load', () => { const at = el.querySelector('.maplibregl-ctrl-attrib'); if (at) at.classList.remove('maplibregl-compact-show'); });
    if (opts.zoomControl) map.addControl(new gl.NavigationControl({ showCompass: false }), 'bottom-left');
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => map.resize()).observe(el);
    return map;
  }

  /** fast-then-accurate position: onFix(g, accurate) may be called twice; resolves with the best fix or rejects */
  function locate(onFix) {
    return new Promise((resolve, reject) => {
      const geo = root.navigator && root.navigator.geolocation;
      if (!geo) return reject(new Error('unsupported'));
      let best = null, done = false;
      const fix = (p, accurate) => { const g = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; if (!best || g.acc <= best.acc) { best = g; remember(g); if (onFix) onFix(g, accurate); } };
      geo.getCurrentPosition((p) => fix(p, false), () => {}, { enableHighAccuracy: false, maximumAge: 300000, timeout: 3500 });
      geo.getCurrentPosition((p) => { fix(p, true); done = true; resolve(best); }, (e) => { done = true; if (best) resolve(best); else reject(e); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
      setTimeout(() => { if (!done && best) { done = true; resolve(best); } }, 6000);
    });
  }

  /** Uber-style picker: fixed centre pin; returns {map, get()} */
  async function picker(el, opts = {}) {
    if (!supported()) throw new Error('webgl');
    const gl = await load();
    const start = opts.start || lastKnown() || CAIRO;
    const zoom = opts.start ? 17 : lastKnown() ? 15 : 11;
    el.classList.add('hs-map');
    el.innerHTML = '<div class="hs-map-canvas"></div><span class="hs-map-pin" aria-hidden="true"><i></i></span><button type="button" class="hs-map-locate" aria-label="موقعي الحالي">◎ <span>موقعي</span></button><p class="hs-map-hint" role="status" aria-live="polite"></p>';
    const canvas = el.querySelector('.hs-map-canvas'), hint = el.querySelector('.hs-map-hint'), btn = el.querySelector('.hs-map-locate');
    const map = makeMap(gl, canvas, { center: start, zoom, zoomControl: true });
    const centre = () => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; };
    map.on('movestart', () => el.classList.add('is-moving'));
    map.on('moveend', () => { el.classList.remove('is-moving'); if (opts.onChange) opts.onChange(centre()); });
    const go = (g, z) => map.flyTo({ center: [g.lng, g.lat], zoom: Math.max(map.getZoom(), z || 17), duration: reduce() ? 0 : 700, essential: true });
    let accEl = null;
    btn.addEventListener('click', () => {
      hint.textContent = 'بنحدد موقعك…'; btn.disabled = true;
      locate((g, accurate) => {
        go(g, accurate ? 18 : 16);
        if (accEl) accEl.remove();
        accEl = new gl.Marker({ element: Object.assign(doc.createElement('span'), { className: 'hs-map-me' }) }).setLngLat([g.lng, g.lat]).addTo(map);
        hint.textContent = accurate ? 'ده موقعك — حرّك الخريطة لو العلامة مش على الباب بالظبط' : 'موقع تقريبي — بندقّقه…';
      }).catch(() => { hint.textContent = 'مش قادرين نحدد موقعك — اسمح بالموقع أو حرّك الخريطة بإيدك'; })
        .finally(() => { btn.disabled = false; });
    });
    if (!opts.start && opts.autoLocate !== false && root.navigator && root.navigator.permissions) {
      try { const st = await root.navigator.permissions.query({ name: 'geolocation' }); if (st.state === 'granted') btn.click(); } catch (e) {}
    }
    return { map, get: centre };
  }

  /** a read-only map with labelled markers ({lat,lng,cls,label,key}); returns {map, set(points)} */
  async function view(el, points) {
    if (!supported()) throw new Error('webgl');
    const gl = await load();
    const first = (points || []).find((p) => p && Number.isFinite(+p.lat)) || CAIRO;
    const map = makeMap(gl, el, { center: first, zoom: 14, cooperative: true });
    const markers = new Map();
    const pin = (cls, label) => { const d = doc.createElement('div'); d.className = 'live-pin ' + (cls || ''); d.innerHTML = '<span aria-hidden="true"></span><b></b>'; d.querySelector('b').textContent = label || ''; return d; };
    function set(pts) {
      const list = (pts || []).filter((p) => p && Number.isFinite(+p.lat) && Number.isFinite(+p.lng));
      for (const p of list) { const k = p.key || p.cls; const m = markers.get(k); if (m) m.setLngLat([p.lng, p.lat]); else markers.set(k, new gl.Marker({ element: pin(p.cls, p.label) }).setLngLat([p.lng, p.lat]).addTo(map)); }
      if (list.length > 1) { const b = new gl.LngLatBounds(); list.forEach((p) => b.extend([p.lng, p.lat])); map.fitBounds(b, { padding: 48, maxZoom: 16, duration: reduce() ? 0 : 500 }); }
      else if (list.length) map.jumpTo({ center: [list[0].lng, list[0].lat], zoom: 15 });
    }
    set(points);
    return { map, set };
  }

  root.HSMap = Object.freeze({ load, prefetch, picker, view, locate, lastKnown, supported, STYLE });
})(typeof globalThis !== 'undefined' ? globalThis : this);
