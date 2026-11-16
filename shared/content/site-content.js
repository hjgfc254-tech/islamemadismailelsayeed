/**
 * MODULE: site-content (HSSiteContent) — Home hero, discover slides and service-icon overrides managed from the Admin
 * Center (Firebase mode). Without published content every getter returns null and the apps use their built-in
 * defaults (DEFAULTS below, GUIDES, the bundled icons), so local/demo mode is unchanged.
 *
 * Cost model: the content JSON is kept in localStorage (`hs_site_content`) with its version; images are kept in the
 * Cache API (`hs-media-v1`, falls back to memory). services/firebase-backend.js asks the server for new content only
 * when the version announced by sync / the public RTDB signal is newer, sending the media ids already cached.
 * Renders: `hs:content` is dispatched whenever the displayed content changes.
 */
'use strict';
(function (root) {
  const KEY = 'hs_site_content';
  const CACHE = 'hs-media-v1';
  const MEDIA_URL = id => '/__hs_media/' + id;
  const DEFAULTS = Object.freeze({
    hero: Object.freeze({ eyebrow: 'منصة واحدة، خدمات أسهل', title: 'كل ما تحتاجه من خدمات،', accent: 'في مكان واحد', sub: 'اكتشف الخدمة المناسبة بسهولة، وهنوصلك بمقدم الخدمة المناسب لطلبك.', cta: 'ابدأ الطلب' })
  });
  let state = { v: 0, hero: null, slides: null, icons: {}, banner: null };
  const urls = {};                                  // mediaId → object/data URL usable in <img src>

  const read = () => { try { const s = JSON.parse(root.localStorage.getItem(KEY)); return s && typeof s === 'object' ? s : null; } catch (e) { return null; } };
  const write = s => { try { root.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const emit = () => { try { root.dispatchEvent(new CustomEvent('hs:content', { detail: { v: state.v } })); } catch (e) {} };
  const hasCaches = () => { try { return typeof root.caches !== 'undefined' && !!root.caches.open; } catch (e) { return false; } };
  const referenced = s => [s.hero && s.hero.media, ...((s.slides || []).map(x => x.media)), ...Object.values(s.icons || {})].filter(Boolean);

  async function storeMedia(id, dataUrl) {
    if (hasCaches()) {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const cache = await root.caches.open(CACHE);
        await cache.put(MEDIA_URL(id), new Response(blob, { headers: { 'content-type': blob.type || 'image/webp' } }));
        urls[id] = URL.createObjectURL(blob);
        return;
      } catch (e) { /* fall back to memory */ }
    }
    urls[id] = dataUrl;
  }
  async function resolveCached(ids) {
    if (!hasCaches()) return;
    try {
      const cache = await root.caches.open(CACHE);
      for (const id of ids) {
        if (urls[id]) continue;
        const res = await cache.match(MEDIA_URL(id));
        if (res) urls[id] = URL.createObjectURL(await res.blob());
      }
    } catch (e) {}
  }
  async function prune(keep) {
    if (!hasCaches()) return;
    try { const cache = await root.caches.open(CACHE); for (const req of await cache.keys()) { const id = req.url.split('/__hs_media/')[1]; if (id && !keep.includes(id)) await cache.delete(req); } } catch (e) {}
  }

  const api = {
    DEFAULTS,
    version: () => state.v || 0,
    /** media ids this device already holds (sent to the server so it skips them) */
    cachedIds: () => Object.keys(urls),
    /** published media this device cannot show yet (e.g. no Cache API): triggers a refetch even at the same version */
    missing: () => referenced(state).filter(id => !urls[id]),
    /** hero texts merged over the defaults, plus `img` when a custom image is published and available */
    hero() {
      const h = state.hero;
      if (!h) return null;
      return { eyebrow: h.eyebrow || '', title: h.title || DEFAULTS.hero.title, accent: h.accent || '', sub: h.sub || '', cta: h.cta || DEFAULTS.hero.cta, img: (h.media && urls[h.media]) || '' };
    },
    /** active published slides ({id,title,desc,cta,action,img}) or null to keep the built-in ones */
    slides() {
      if (!Array.isArray(state.slides)) return null;
      return state.slides.filter(s => s.active !== false).map(s => ({ id: s.id, title: s.title, desc: s.desc || '', cta: s.cta || '', action: s.action || 'none', img: (s.media && urls[s.media]) || '' }));
    },
    /** announcement bar {text, action} when the admin switched it on, else null */
    banner() { const b = state.banner; return b && b.on !== false && b.text ? { text: String(b.text), action: b.action || 'none' } : null; },
    /** custom image for a category ('c-…') or item ('d-…') icon, or '' */
    iconUrl: name => { const id = state.icons && state.icons[name]; return (id && urls[id]) || ''; },
    /** payload from session.content: {v, hero, slides, icons, media{id: dataUrl}} */
    async apply(p) {
      if (!p || !(Number(p.v) > 0)) return false;
      for (const [id, data] of Object.entries(p.media || {})) if (typeof data === 'string' && /^data:image\//.test(data)) await storeMedia(id, data);
      state = { v: Number(p.v), hero: p.hero || null, slides: Array.isArray(p.slides) ? p.slides : null, icons: p.icons || {}, banner: p.banner || null };
      write(state);
      const keep = referenced(state);
      await resolveCached(keep);
      prune(keep);
      emit();
      return true;
    },
    async init() {
      const s = read();
      if (!s || !(s.v > 0)) return;
      state = { v: s.v, hero: s.hero || null, slides: Array.isArray(s.slides) ? s.slides : null, icons: s.icons || {}, banner: s.banner || null };
      await resolveCached(referenced(state));
      emit();
    }
  };
  root.HSSiteContent = api;
  api.init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
