/**
 * Site content managed from the Admin Center (no Firebase Storage yet): Home hero, discover slides and
 * category/item icon overrides. Images are uploaded already resized/compressed by the browser and stored one per
 * document as data URLs (media/{id}, ≤ MEDIA_MAX chars, well under Firestore's 1 MiB document limit).
 *
 *   system/content  {v, hero, slides[], icons{name: mediaId}, updatedAt, by}      (small; text + media ids)
 *   media/{id}      {id, kind, data, bytes, w, h, at, by}                         (one image per document)
 *   system/settings.contentV = v   → every sync already reads settings, so clients learn about a new version for free
 *
 * Cost: clients fetch content only when contentV changes and send the media ids they already cache; the server keeps
 * the current version in instance memory, so a burst of clients after an update costs ~1 + images reads in total.
 *
 * Admin routes (owner | admin role):
 *   GET    /admin/content            content + media metadata (no image bytes)
 *   PATCH  /admin/content            {hero?, slides?, icons?}  → new version
 *   POST   /admin/media              {kind: hero|slide|icon, data: data:image/(webp|jpeg|png);base64,…, w, h}
 *   DELETE /admin/media/:id          refused (409) while the content references it
 * Public: session op `content` {have: [mediaId…]} → {v, hero, slides, icons, media{id: dataUrl} for missing ids}
 */
'use strict';
const crypto = require('crypto');

const MEDIA_MAX = 400000;                        // data-URL characters (~290 KB of image bytes)
const KINDS = ['hero', 'slide', 'icon'];
const SLIDE_MAX = 8;
const ACTIONS = ['wizard', 'services', 'orders', 'none'];
const ICON_KEY = /^[cd]-[a-z0-9-]{1,40}$/;
const MEDIA_ID = /^m[a-z0-9]{6,24}$/;
const CACHE_TTL = 10 * 60 * 1000;

const env = (status, code, message, details) => ({ ok: false, status, error: details ? { code, message, details } : { code, message } });
const okEnv = (data, status = 200) => ({ ok: true, status, data });
const isRole = (admin, ...roles) => !!admin && roles.includes(admin.role);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const instance = new WeakMap();                  // adapter → {v, at, content, media: Map}
function invalidate(adapter) { instance.delete(adapter); }

function cleanContent(cur, body, mediaIds) {
  const errors = {};
  const out = { hero: cur.hero || null, slides: Array.isArray(cur.slides) ? cur.slides : null, icons: cur.icons || {} };
  const media = id => (id == null || id === '' ? null : (MEDIA_ID.test(String(id)) && mediaIds.has(String(id)) ? String(id) : (errors.media = 'صورة غير موجودة', null)));
  if (body.hero !== undefined) {
    if (body.hero === null) out.hero = null;
    else {
      const h = body.hero || {};
      out.hero = { eyebrow: str(h.eyebrow, 60), title: str(h.title, 80), accent: str(h.accent, 60), sub: str(h.sub, 200), cta: str(h.cta, 30), media: media(h.media) };
      if (!out.hero.title) errors.hero = 'عنوان الهيرو مطلوب';
    }
  }
  if (body.slides !== undefined) {
    if (body.slides === null) out.slides = null;
    else if (!Array.isArray(body.slides) || body.slides.length > SLIDE_MAX) errors.slides = `حتى ${SLIDE_MAX} شرائح`;
    else {
      const seen = new Set();
      out.slides = body.slides.map((s, i) => {
        const id = /^[a-z0-9-]{2,24}$/.test(String(s && s.id)) ? String(s.id) : 's' + (i + 1);
        if (seen.has(id)) errors.slides = 'معرّف شريحة مكرر'; seen.add(id);
        const sl = { id, title: str(s && s.title, 60), desc: str(s && s.desc, 160), cta: str(s && s.cta, 30), action: ACTIONS.includes(s && s.action) ? s.action : 'none', media: media(s && s.media), active: !(s && s.active === false) };
        if (!sl.title) errors.slides = 'كل شريحة تحتاج عنوانًا';
        return sl;
      });
    }
  }
  if (body.icons !== undefined) {
    if (!body.icons || typeof body.icons !== 'object' || Array.isArray(body.icons)) errors.icons = 'قائمة غير صالحة';
    else {
      const icons = {};
      for (const [k, v] of Object.entries(body.icons)) {
        if (!ICON_KEY.test(k)) { errors.icons = 'اسم أيقونة غير صالح'; continue; }
        if (v === null || v === '') continue;            // removing an override restores the built-in artwork
        const id = media(v); if (id) icons[k] = id;
      }
      if (Object.keys(icons).length > 200) errors.icons = 'عدد كبير جدًا';
      out.icons = icons;
    }
  }
  return { out, errors };
}

function validImage(data) {
  const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!m || data.length > MEDIA_MAX) return null;
  const bytes = Buffer.from(m[2], 'base64');
  const sig = bytes.subarray(0, 12).toString('latin1');
  const ok = (m[1] === 'webp' && sig.startsWith('RIFF') && sig.slice(8, 12) === 'WEBP') || (m[1] === 'jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) || (m[1] === 'png' && sig.startsWith('\x89PNG'));
  return ok ? { mime: 'image/' + m[1], bytes: bytes.length } : null;
}
const referenced = c => new Set([c.hero && c.hero.media, ...((c.slides || []).map(s => s.media)), ...Object.values(c.icons || {})].filter(Boolean));

async function handle({ backend, tx, method, path, body, admin }) {
  if (!isRole(admin, 'owner', 'admin')) return env(403, 'FORBIDDEN', 'ليست لديك صلاحية لهذا الإجراء');
  const a = backend.adapter;
  const seg = path.split('/').filter(Boolean);           // ['admin', 'content'|'media', id?]
  const cur = (await a.get(tx, 'system/content')) || { v: 0 };
  if (seg[1] === 'content' && method === 'GET') {
    const rows = await a.query(tx, 'media', { limit: 300 });
    return okEnv({ ...cur, media: rows.map(r => ({ id: r.id, kind: r.data.kind, bytes: r.data.bytes, w: r.data.w, h: r.data.h, at: r.data.at })) });
  }
  if (seg[1] === 'content' && method === 'PATCH') {
    const ids = new Set((await a.query(tx, 'media', { limit: 300 })).map(r => r.id));
    const { out, errors } = cleanContent(cur, body || {}, ids);
    if (Object.keys(errors).length) return env(422, 'VALIDATION', 'راجع بيانات المحتوى', errors);
    const settings = (await a.get(tx, 'system/settings')) || {};          // Firestore transactions: all reads before writes
    const v = (Number(cur.v) || 0) + 1;
    const next = { ...out, v, updatedAt: new Date().toISOString(), by: admin.employeeId || null };
    a.set(tx, 'system/content', next);
    a.set(tx, 'system/settings', { ...settings, contentV: v });
    return okEnv(next);
  }
  if (seg[1] === 'media' && method === 'POST' && seg.length === 2) {
    const kind = KINDS.includes(body && body.kind) ? body.kind : null;
    if (!kind) return env(422, 'VALIDATION', 'نوع الصورة مطلوب', { kind: KINDS.join('|') });
    const img = validImage(body.data);
    if (!img) return env(422, 'VALIDATION', 'الصورة غير صالحة أو أكبر من المسموح', { data: 'webp/jpeg/png ≤ ' + Math.round(MEDIA_MAX * 0.73 / 1000) + ' KB' });
    const id = 'm' + crypto.randomBytes(8).toString('hex');
    const doc = { id, kind, data: body.data, bytes: img.bytes, w: Math.max(0, Math.min(4096, parseInt(body.w, 10) || 0)), h: Math.max(0, Math.min(4096, parseInt(body.h, 10) || 0)), at: new Date().toISOString(), by: admin.employeeId || null };
    a.set(tx, `media/${id}`, doc);
    return okEnv({ id, kind, bytes: doc.bytes, w: doc.w, h: doc.h }, 201);
  }
  if (seg[1] === 'media' && method === 'DELETE' && seg[2]) {
    if (!MEDIA_ID.test(seg[2])) return env(404, 'NOT_FOUND', 'الصورة غير موجودة');
    if (referenced(cur).has(seg[2])) return env(409, 'CONFLICT', 'الصورة مستخدمة في المحتوى — أزلها منه أولًا');
    a.del(tx, `media/${seg[2]}`);
    return okEnv({ id: seg[2], deleted: true });
  }
  return env(404, 'NOT_FOUND', 'مسار غير معروف');
}

/** Public read: the current content plus the image bytes this client does not have yet. */
async function publicContent(backend, have) {
  const a = backend.adapter;
  const settings = (await a.get(null, 'system/settings')) || {};
  const v = Number(settings.contentV) || 0;
  if (!v) return { v: 0 };
  let c = instance.get(a);
  if (!c || c.v !== v || Date.now() - c.at > CACHE_TTL) {
    const content = (await a.get(null, 'system/content')) || { v };
    c = { v, at: Date.now(), content, media: new Map() };
    instance.set(a, c);
  }
  const want = [...referenced(c.content)].filter(id => !(have || []).includes(id));
  const media = {};
  for (const id of want) {
    if (!c.media.has(id)) { const d = await a.get(null, `media/${id}`); if (d) c.media.set(id, d.data); }
    if (c.media.has(id)) media[id] = c.media.get(id);
  }
  const { hero = null, slides = null, icons = {} } = c.content;
  return { v, hero, slides, icons, media };
}

const PATH_RE = /^\/admin\/(content|media)(\/|$)/;
module.exports = { handle, publicContent, invalidate, PATH_RE, MEDIA_MAX, validImage };
