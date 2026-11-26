'use strict';
/**
 * Service catalogue managed from the Admin Center, published as one static file.
 *
 * Purpose: the owner adds / removes / pauses categories, services (items) and problems, picks each one's questions from
 *   the question bank, and chooses the governorates the platform serves. «انشر» freezes the draft into one JSON
 *   document that customers download through the CDN (GET /catalog-feed, Firebase Hosting rewrite → catalogFeed), so
 *   customers never read Firestore for the catalogue.
 * Admin routes (callable `api`, code-unlocked owner / admin role; wired in service.js):
 *   GET  /admin/catalog            → { draft: <catalogue|null>, published: { rev, publishedAt, by } | null }
 *   PUT  /admin/catalog  {catalog} → validates and saves the draft            → { savedAt }
 *   POST /admin/catalog/publish    → validates the draft, rev + 1, publishes   → { rev, publishedAt }
 *   POST /admin/catalog/unpublish  → customers fall back to the built-in catalogue (services/local-catalog.js seed)
 * Public: feed(backend) → { status, body, headers } for exports.catalogFeed (functions/index.js).
 * Collections: system/catalogDraft { json, savedAt, by }, system/catalogPub { json, rev, publishedAt, by } — the
 *   catalogue is stored as a JSON string (Firestore forbids nested arrays; one string is also the cheapest read).
 * Shape (v3): { v:3, rev, publishedAt, govs:[...]|null, bank:[{id,label,type,options?}],
 *   categories:[{id,name,icon,art,kind,safety[],active,order}], items:[{id,cat,slug,name,specialty,kind,qset,needsVisit,
 *   active,order,image,safety[],qs:[{id,required}]}], problems:[{id,item,cat,slug,name,warn,needsVisit,active,order,
 *   attachments,isOther?,extraQuestions:[],qs:[{id,required}]}] }.
 */

const PATH_RE = /^\/admin\/catalog(\/|$)/;
const DRAFT = 'system/catalogDraft', PUB = 'system/catalogPub';
const MAX_JSON = 900000;   // Firestore document limit is 1 MiB

const env = (status, code, message, fields) => ({ ok: false, status, error: { code, message, ...(fields ? { fields } : {}) } });
const okEnv = data => ({ ok: true, status: 200, data });
const isRole = (adm, ...roles) => !!(adm && roles.includes(adm.role));

const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f‪-‮⁦-⁩]/g, ' ').trim().slice(0, max);
const bool = v => v === true;
const int = (v, d) => (Number.isFinite(+v) ? Math.max(0, Math.min(9999, Math.round(+v))) : d);
const strs = (a, n, max) => (Array.isArray(a) ? a.slice(0, n).map(s => str(s, max)).filter(Boolean) : []);
const ID_Q = /^[a-z][a-z0-9_]{0,31}$/, ID_SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const Q_TYPES = ['select', 'number', 'input'], ATT = ['optional', 'required', 'none'];

/** cleanCatalog(input) → { value, errors } — only known fields survive; every reference must resolve. */
function cleanCatalog(c) {
  const errors = [];
  const err = m => { if (errors.length < 20) errors.push(m); };
  if (!c || typeof c !== 'object') return { value: null, errors: ['الكتالوج فاضي'] };
  const bank = [];
  for (const q of (Array.isArray(c.bank) ? c.bank : []).slice(0, 600)) {
    const id = str(q && q.id, 32), type = Q_TYPES.includes(q && q.type) ? q.type : 'select';
    if (!ID_Q.test(id)) { err(`معرّف سؤال غير صالح: ${id || '(فاضي)'}`); continue; }
    if (bank.some(b => b.id === id)) { err(`سؤال مكرر: ${id}`); continue; }
    const label = str(q.label, 140); if (!label) { err(`السؤال ${id} من غير نص`); continue; }
    const out = { id, label, type };
    if (type === 'select') {
      out.options = strs(q.options, 12, 50).filter((o, i, a) => a.indexOf(o) === i);
      if (out.options.length < 2) { err(`السؤال «${label}» محتاج اختيارين على الأقل`); continue; }
    }
    bank.push(out);
  }
  const bankIds = new Set(bank.map(b => b.id));
  const refs = (a, n, where) => (Array.isArray(a) ? a : []).slice(0, n).map(r => ({ id: str(r && r.id, 32), required: bool(r && r.required) }))
    .filter((r, i, all) => { if (!bankIds.has(r.id)) { err(`${where}: سؤال مش موجود في البنك (${r.id})`); return false; } return all.findIndex(x => x.id === r.id) === i; });
  const categories = [];
  for (const k of (Array.isArray(c.categories) ? c.categories : []).slice(0, 60)) {
    const id = str(k && k.id, 40); if (!ID_SLUG.test(id) || categories.some(x => x.id === id)) { err(`قسم غير صالح أو مكرر: ${id}`); continue; }
    const name = str(k.name, 60); if (!name) { err(`القسم ${id} من غير اسم`); continue; }
    categories.push({ id, name, icon: str(k.icon, 40), art: str(k.art, 40), kind: str(k.kind, 20) || 'fault', safety: strs(k.safety, 6, 240), active: k.active !== false, order: int(k.order, categories.length) });
  }
  const catIds = new Set(categories.map(x => x.id));
  const items = [];
  for (const i of (Array.isArray(c.items) ? c.items : []).slice(0, 800)) {
    const cat = str(i && i.cat, 40), slug = str(i && i.slug, 40), id = cat + '/' + slug;
    if (!catIds.has(cat) || !ID_SLUG.test(slug) || items.some(x => x.id === id)) { err(`خدمة غير صالحة أو مكررة: ${str(i && i.id, 80)}`); continue; }
    const name = str(i.name, 80); if (!name) { err(`الخدمة ${id} من غير اسم`); continue; }
    const image = str(i.image, 300);
    items.push({ id, cat, slug, name, specialty: str(i.specialty, 60) || cat, kind: str(i.kind, 20) || 'fault', qset: i.qset ? str(i.qset, 20) : null,
      needsVisit: i.needsVisit !== false, active: i.active !== false, order: int(i.order, items.length), image: /^(https:\/\/|\.\.\/|\/)/.test(image) ? image : '',
      safety: strs(i.safety, 6, 240), qs: refs(i.qs, 6, `الخدمة «${name}»`) });
  }
  const itemById = new Map(items.map(x => [x.id, x]));
  const problems = [];
  for (const p of (Array.isArray(c.problems) ? c.problems : []).slice(0, 5000)) {
    const item = str(p && p.item, 81), slug = str(p && p.slug, 40), it = itemById.get(item), id = item + '/' + slug;
    if (!it || !ID_SLUG.test(slug) || problems.some(x => x.id === id)) { err(`مشكلة غير صالحة أو مكررة: ${str(p && p.id, 120)}`); continue; }
    const name = str(p.name, 80); if (!name) { err(`مشكلة في ${it.name} من غير اسم`); continue; }
    const att = p.attachments || {};
    problems.push({ id, item, cat: it.cat, slug, name, warn: str(p.warn, 240), needsVisit: p.needsVisit !== false, active: p.active !== false, order: int(p.order, 0),
      attachments: { photos: ATT.includes(att.photos) ? att.photos : 'optional', video: ATT.includes(att.video) ? att.video : 'optional' },
      ...(p.isOther || slug === 'other' ? { isOther: true } : {}), extraQuestions: [], qs: refs(p.qs, 4, `المشكلة «${name}»`) });
  }
  /* every service keeps its «مشكلة أخرى» (the free-text path of the request) */
  for (const it of items) if (!problems.some(p => p.item === it.id && p.isOther)) problems.push({ id: it.id + '/other', item: it.id, cat: it.cat, slug: 'other', name: 'مشكلة أخرى', warn: '', needsVisit: true, active: true, order: 99, attachments: { photos: 'optional', video: 'optional' }, isOther: true, extraQuestions: [], qs: [] });
  const govs = Array.isArray(c.govs) ? strs(c.govs, 40, 40).filter((g, i, a) => a.indexOf(g) === i) : null;
  if (!categories.some(x => x.active)) err('لازم قسم واحد شغال على الأقل');
  if (!items.some(x => x.active)) err('لازم خدمة واحدة شغالة على الأقل');
  if (govs && !govs.length) err('اختار محافظة واحدة على الأقل');
  return { value: { v: 3, govs: govs && govs.length ? govs : null, bank, categories, items, problems }, errors };
}

const parse = doc => { try { return doc && doc.json ? JSON.parse(doc.json) : null; } catch { return null; } };

async function handle({ backend, tx, method, path, body, admin }) {
  if (!isRole(admin, 'owner', 'admin')) return env(403, 'FORBIDDEN', 'ليست لديك صلاحية لهذا الإجراء');
  const a = backend.adapter;
  const seg = path.split('/').filter(Boolean);   // ['admin', 'catalog', action?]
  const by = admin.employeeId || null, now = new Date().toISOString();
  if (seg.length === 2 && method === 'GET') {
    const [d, p] = [await a.get(tx, DRAFT), await a.get(tx, PUB)];
    return okEnv({ draft: parse(d), savedAt: d ? d.savedAt : null, published: p ? { rev: p.rev, publishedAt: p.publishedAt, by: p.by || null } : null });
  }
  if (seg.length === 2 && method === 'PUT') {
    const { value, errors } = cleanCatalog(body && body.catalog);
    if (!value) return env(422, 'VALIDATION', errors[0] || 'الكتالوج غير صالح', errors);
    const json = JSON.stringify(value);
    if (json.length > MAX_JSON) return env(413, 'TOO_LARGE', 'الكتالوج كبير جدًا');
    a.set(tx, DRAFT, { json, savedAt: now, by });
    return okEnv({ savedAt: now, warnings: errors });
  }
  if (seg[2] === 'publish' && method === 'POST') {
    const [d, p] = [await a.get(tx, DRAFT), await a.get(tx, PUB)];   // all reads before writes
    const { value, errors } = cleanCatalog(parse(d));
    if (!value) return env(409, 'NO_DRAFT', 'احفظ الكتالوج الأول قبل النشر');
    if (errors.length) return env(422, 'VALIDATION', 'صلّح الأخطاء دي الأول: ' + errors[0], errors);
    const rev = ((p && +p.rev) || 0) + 1;
    a.set(tx, PUB, { json: JSON.stringify({ ...value, rev, publishedAt: now }), rev, publishedAt: now, by });
    return okEnv({ rev, publishedAt: now });
  }
  if (seg[2] === 'unpublish' && method === 'POST') {
    const p = await a.get(tx, PUB);
    const rev = ((p && +p.rev) || 0) + 1;
    a.set(tx, PUB, { json: '', rev, publishedAt: now, by, off: true });
    return okEnv({ rev, off: true });
  }
  return env(404, 'NOT_FOUND', 'مسار غير معروف');
}

/** GET /catalog-feed: the published catalogue, cached by the CDN (one Firestore read per edge every few minutes). */
async function feed(backend) {
  const headers = { 'Cache-Control': 'public, max-age=120, s-maxage=300', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
  const p = await backend.getDoc(PUB);
  if (!p || p.off || !p.json) return { status: 200, headers, body: JSON.stringify({ v: 3, rev: p ? +p.rev || 0 : 0, off: true }) };
  return { status: 200, headers, body: p.json };
}

module.exports = { PATH_RE, handle, feed, cleanCatalog, DRAFT, PUB };
