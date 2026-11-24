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
  /* the map never opens on the whole world: it starts on the customer's governorate (capital city) and stays inside Egypt */
  const GOV_CENTERS = {
    'القاهرة': [30.0444, 31.2357], 'الجيزة': [30.0131, 31.2089], 'الإسكندرية': [31.2001, 29.9187], 'القليوبية': [30.4660, 31.1848],
    'الشرقية': [30.5877, 31.5020], 'الدقهلية': [31.0409, 31.3785], 'الغربية': [30.7865, 31.0004], 'المنوفية': [30.5526, 31.0090],
    'البحيرة': [31.0341, 30.4682], 'كفر الشيخ': [31.1107, 30.9388], 'دمياط': [31.4165, 31.8133], 'بورسعيد': [31.2653, 32.3019],
    'الإسماعيلية': [30.5965, 32.2715], 'السويس': [29.9668, 32.5498], 'الفيوم': [29.3084, 30.8428], 'بني سويف': [29.0661, 31.0994],
    'المنيا': [28.0871, 30.7618], 'أسيوط': [27.1809, 31.1837], 'سوهاج': [26.5591, 31.6957], 'قنا': [26.1551, 32.7160],
    'الأقصر': [25.6872, 32.6396], 'أسوان': [24.0889, 32.8998], 'الوادي الجديد': [25.4390, 30.5586], 'مطروح': [31.3543, 27.2373],
    'شمال سيناء': [31.1313, 33.7984], 'جنوب سيناء': [28.2416, 33.6222], 'البحر الأحمر': [27.2579, 33.8116]
  };
  const EGYPT = [[24.0, 21.4], [37.3, 32.3]];   // [[west, south], [east, north]] — pan limit
  const centerFor = (gov) => { const c = GOV_CENTERS[String(gov || '').replace(/^محافظة\s+/, '').trim()]; return c ? { lat: c[0], lng: c[1] } : null; };
  /* OpenStreetMap Nominatim (free; fair use ≤ 1 request/s — callers debounce, results are cached per ~10 m) */
  const NOMI = 'https://nominatim.openstreetmap.org/';
  const revCache = new Map();
  function govOf(state) { const s = String(state || '').replace(/^محافظة\s+/, '').trim(); return Object.keys(GOV_CENTERS).find((g) => g === s || s.includes(g) || g.includes(s)) || ''; }
  /** {gov, area, street, label} for a point (Arabic), or null */
  async function reverse(g) {
    const k = g.lat.toFixed(4) + ',' + g.lng.toFixed(4);
    if (revCache.has(k)) return revCache.get(k);
    try {
      const r = await fetch(`${NOMI}reverse?format=jsonv2&lat=${g.lat}&lon=${g.lng}&zoom=18&addressdetails=1&accept-language=ar`, { headers: { Accept: 'application/json' } });
      if (!r.ok) return null;
      const j = await r.json(), a = j.address || {};
      const street = [a.road || a.pedestrian || a.footway || '', a.house_number || ''].filter(Boolean).join(' ');
      const area = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.town || a.village || a.city || '';
      const out = { gov: govOf(a.state || a.city), area, street, label: [street, area].filter(Boolean).join('، ') || (j.display_name || '').split(',').slice(0, 2).join('،') };
      revCache.set(k, out); return out;
    } catch (e) { return null; }
  }
  /** address search inside Egypt → [{lat,lng,label}] */
  async function search(q) {
    q = String(q || '').trim(); if (q.length < 2) return [];
    try {
      const r = await fetch(`${NOMI}search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=eg&limit=6&accept-language=ar`, { headers: { Accept: 'application/json' } });
      if (!r.ok) return [];
      return (await r.json()).map((x) => ({ lat: +x.lat, lng: +x.lon, label: String(x.display_name || '').split(',').slice(0, 3).join('،') }));
    } catch (e) { return []; }
  }
  /** what to tell the customer when the position cannot be read (permission off, GPS off, weak signal) */
  function geoHelp(e) {
    const code = e && e.code;
    if (code === 1) return { kind: 'denied', title: 'الموقع مقفول للموقع ده', steps: [
      'آيفون: الإعدادات ← الخصوصية والأمان ← خدمات الموقع ← شغّلها، وبعدين Safari ← «أثناء الاستخدام».',
      'وفي Safari نفسه: اضغط «aA» جنب العنوان ← إعدادات موقع الويب ← الموقع ← سماح.',
      'أندرويد (كروم): اضغط على القفل جنب العنوان ← الأذونات ← الموقع ← سماح، واتأكد إن الـGPS شغال.',
      'أو حرّك الخريطة بإيدك وحط العلامة على باب البيت.'] };
    if (code === 2) return { kind: 'off', title: 'مش قادرين نوصل لموقعك', steps: ['شغّل الـGPS / خدمات الموقع في الموبايل وجرّب تاني.', 'أو ابحث عن الشارع أو حرّك الخريطة بإيدك.'] };
    if (code === 3) return { kind: 'slow', title: 'الإشارة ضعيفة', steps: ['جرّب تاني بعد ثواني، أو قرّب من شباك.', 'أو حرّك الخريطة بإيدك.'] };
    return { kind: 'unsupported', title: 'المتصفح مش بيدعم تحديد الموقع', steps: ['ابحث عن الشارع أو حرّك الخريطة بإيدك.'] };
  }
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
      dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: reduce() ? 0 : 150, cooperativeGestures: !!opts.cooperative,
      maxBounds: EGYPT, minZoom: 5 });
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

  /** Uber-style picker: fixed centre pin, address search, the street name under the pin, «موقعي».
      opts: {start, gov, onChange(g), onAddress(addr)} → {map, get(), address()}.
      Opens on (1) the saved point, (2) the last fix on this device, (3) the chosen governorate — never the world map —
      and asks for the position straight away (the browser shows its permission prompt) unless it was refused before. */
  async function picker(el, opts = {}) {
    if (!supported()) throw new Error('webgl');
    const gl = await load();
    const govC = centerFor(opts.gov);
    const start = opts.start || lastKnown() || govC || CAIRO;
    const zoom = opts.start ? 17 : lastKnown() ? 15 : govC ? 12 : 11;
    el.classList.add('hs-map');
    el.innerHTML = '<div class="hs-map-canvas"></div><span class="hs-map-pin" aria-hidden="true"><i></i></span>'
      + '<form class="hs-map-search" role="search"><input type="search" placeholder="ابحث عن شارع، منطقة، أو معلم قريب" aria-label="ابحث عن العنوان" enterkeyhint="search" autocomplete="off"><ul class="hs-map-results" role="listbox" hidden></ul></form>'
      + '<button type="button" class="hs-map-locate" aria-label="موقعي الحالي">◎ <span>موقعي</span></button>'
      + '<p class="hs-map-addr" aria-live="polite"></p><p class="hs-map-hint" role="status" aria-live="polite"></p>';
    const canvas = el.querySelector('.hs-map-canvas'), hint = el.querySelector('.hs-map-hint'), btn = el.querySelector('.hs-map-locate');
    const addrEl = el.querySelector('.hs-map-addr'), form = el.querySelector('.hs-map-search'), qIn = form.querySelector('input'), list = form.querySelector('.hs-map-results');
    const map = makeMap(gl, canvas, { center: start, zoom, zoomControl: true });
    const centre = () => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; };
    let lastAddr = null, revT = 0, revSeq = 0;
    const lookup = () => {
      clearTimeout(revT);
      if (map.getZoom() < 14) { addrEl.textContent = ''; return; }
      addrEl.textContent = '…'; const seq = ++revSeq;
      revT = setTimeout(async () => { const a = await reverse(centre()); if (seq !== revSeq) return; lastAddr = a; addrEl.textContent = a && a.label ? '📍 ' + a.label : ''; if (a && opts.onAddress) opts.onAddress(a); }, 900);
    };
    map.on('movestart', () => { el.classList.add('is-moving'); list.hidden = true; });
    map.on('moveend', () => { el.classList.remove('is-moving'); if (opts.onChange) opts.onChange(centre()); lookup(); });
    const go = (g, z) => map.flyTo({ center: [g.lng, g.lat], zoom: Math.max(map.getZoom(), z || 17), duration: reduce() ? 0 : 700, essential: true });
    /* search */
    let sT = 0;
    const run = async () => {
      const res = await search(qIn.value);
      list.innerHTML = res.length ? res.map((r, i) => `<li><button type="button" data-i="${i}">${r.label.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</button></li>`).join('') : '<li class="none">مفيش نتايج — جرّب اسم المنطقة أو شارع رئيسي قريب</li>';
      list.hidden = false; list._res = res;
    };
    qIn.addEventListener('input', () => { clearTimeout(sT); if (qIn.value.trim().length < 3) { list.hidden = true; return; } sT = setTimeout(run, 650); });
    form.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(sT); run(); });
    list.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; const r = list._res[+b.dataset.i]; list.hidden = true; qIn.blur(); go(r, 17); });
    /* my position */
    let accEl = null;
    const ask = () => {
      hint.textContent = 'بنحدد موقعك… لو المتصفح سألك، اختار «سماح»'; hint.classList.remove('is-err'); btn.disabled = true;
      locate((g, accurate) => {
        go(g, accurate ? 18 : 16);
        if (accEl) accEl.remove();
        accEl = new gl.Marker({ element: Object.assign(doc.createElement('span'), { className: 'hs-map-me' }) }).setLngLat([g.lng, g.lat]).addTo(map);
        hint.textContent = accurate ? 'ده موقعك — حرّك الخريطة لو العلامة مش على الباب بالظبط' : 'موقع تقريبي — بندقّقه…';
      }).catch((e) => showErr(geoHelp(e)))
        .finally(() => { btn.disabled = false; });
    };
    /* the error line offers «إزاي أفعّله؟» (the caller shows the iPhone / Android steps) */
    function showErr(h) {
      hint.classList.add('is-err'); hint.textContent = h.title + ' — ابحث عن الشارع أو حرّك الخريطة بإيدك. ';
      if (opts.onHelp && h.kind !== 'unsupported') { const b = doc.createElement('button'); b.type = 'button'; b.className = 'hs-map-help'; b.textContent = 'إزاي أفعّله؟'; b.addEventListener('click', () => opts.onHelp(h)); hint.appendChild(b); }
    }
    btn.addEventListener('click', ask);
    if (!opts.start && opts.autoLocate !== false) {
      let state = 'prompt';
      try { if (root.navigator.permissions) state = (await root.navigator.permissions.query({ name: 'geolocation' })).state; } catch (e) {}
      if (state === 'denied') showErr(geoHelp({ code: 1 }));
      else ask();
    } else lookup();
    return { map, get: centre, address: () => lastAddr };
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

  root.HSMap = Object.freeze({ load, prefetch, picker, view, locate, lastKnown, supported, STYLE, reverse, search, geoHelp, centerFor, govOf, GOVS: Object.freeze(Object.keys(GOV_CENTERS)) });
})(typeof globalThis !== 'undefined' ? globalThis : this);
