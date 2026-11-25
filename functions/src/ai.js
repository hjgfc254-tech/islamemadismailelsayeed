/**
 * AI routing (server-only): maps a customer's own words — or a photo — to a catalogue item and problem.
 *
 * Providers are configured by the owner in the Admin Center and stored in `system/ai` (server-only document; Firestore
 * rules deny all client access; keys are never returned to any client — only the last 4 characters):
 *   { providers: [{ id, label, kind: deepseek|gemini|openai, model, baseUrl?, apiKey, roles: ['text','vision'], enabled }],
 *     features: { text, photo }, dailyLimit, globalDailyLimit }
 * Order = priority. A call tries the enabled providers that have the needed role, one after another (8 s timeout each);
 * a provider that fails is skipped for a while on this instance (60 s, or 10 min for an invalid key).
 * Only the problem text or the photo is sent — never names, phones or addresses. Photos are not stored.
 * The answer is ALWAYS validated against the real catalogue; anything else is dropped (the customer then picks manually).
 * Public flags `system/settings.ai = {text, photo}` tell the apps whether to show the features.
 *
 * Admin:  GET /admin/ai · PATCH /admin/ai · POST /admin/ai/test {id, kind?}          (owner | admin role)
 * Public: session op `ai` {kind: 'text', text} | {kind: 'photo', image: dataURL}      (signed-in, incl. anonymous)
 */
'use strict';
const crypto = require('crypto');
const runtime = require('./runtime');

const KINDS = ['deepseek', 'gemini', 'openai', 'anthropic'];
const DEFAULT_MODEL = { deepseek: 'deepseek-chat', gemini: 'gemini-2.5-flash', openai: 'gpt-4o-mini', anthropic: 'claude-opus-5-5' };
const TIMEOUT_MS = 8000;
const PATH_RE = /^\/admin\/ai(\/|$)/;

let fetchImpl = (...a) => globalThis.fetch(...a);
const setFetch = f => { fetchImpl = f; };                 // tests inject a fake network
let claudeOverride = null; const claudeClients = new Map();
const setClaude = c => { claudeOverride = c; };
function claudeClient(key) {
  if (claudeOverride) return claudeOverride;
  if (!claudeClients.has(key)) { const mod = require('@anthropic-ai/sdk'); const A = mod.Anthropic || mod.default || mod; claudeClients.clear(); claudeClients.set(key, new A({ apiKey: key })); }
  return claudeClients.get(key);
}
const down = new Map();                                    // providerId → time until which it is skipped
const resetHealth = () => down.clear();

const env = (status, code, message, details) => ({ ok: false, status, error: details ? { code, message, details } : { code, message } });
const okEnv = (data, status = 200) => ({ ok: true, status, data });
const isRole = (admin, ...roles) => !!admin && roles.includes(admin.role);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* ── catalogue (bundled with the domain) ── */
let catalogCache = null;
function catalog() {
  if (catalogCache) return catalogCache;
  const C = runtime.createContext(null, []).run('CAT');          // a global const of the classic scripts (not a globalThis property)
  const items = [], problems = {};
  for (const c of C.categories().filter(x => x.active !== false)) {
    for (const it of C.items(c.id).filter(x => x.active !== false)) {
      items.push({ id: it.id, name: it.name, cat: c.id, catName: c.name });
      problems[it.id] = C.problems(it.id).filter(p => p.active !== false).map(p => ({ id: p.id, name: p.name }));
    }
  }
  catalogCache = { items, problems };
  return catalogCache;
}

/* ── config ── */
async function loadConfig(adapter, tx) {
  const c = (await adapter.get(tx || null, 'system/ai')) || {};
  return { providers: Array.isArray(c.providers) ? c.providers : [], features: { text: !!(c.features && c.features.text), photo: !!(c.features && c.features.photo), chat: !!(c.features && c.features.chat) },
    chatDailyLimit: Number.isFinite(+c.chatDailyLimit) ? +c.chatDailyLimit : 60, chatGlobalDailyLimit: Number.isFinite(+c.chatGlobalDailyLimit) ? +c.chatGlobalDailyLimit : 3000,
    dailyLimit: Number.isFinite(+c.dailyLimit) ? +c.dailyLimit : 20, globalDailyLimit: Number.isFinite(+c.globalDailyLimit) ? +c.globalDailyLimit : 2000 };
}
const view = c => ({
  features: c.features, dailyLimit: c.dailyLimit, globalDailyLimit: c.globalDailyLimit, chatDailyLimit: c.chatDailyLimit, chatGlobalDailyLimit: c.chatGlobalDailyLimit, chatEnvKey: !!(process.env.CHAT_API_KEY || process.env.ANTHROPIC_API_KEY),
  providers: c.providers.map(p => ({ id: p.id, label: p.label, kind: p.kind, model: p.model, baseUrl: p.baseUrl || '', roles: p.roles, enabled: p.enabled !== false,
    hasKey: !!p.apiKey, keyLast4: p.apiKey ? String(p.apiKey).slice(-4) : '' }))
});
const publicFlags = c => ({
  text: c.features.text && c.providers.some(p => p.enabled !== false && p.apiKey && p.roles.includes('text')),
  photo: c.features.photo && c.providers.some(p => p.enabled !== false && p.apiKey && p.roles.includes('vision')),
  chat: !!c.features.chat && (c.providers.some(p => p.enabled !== false && p.apiKey && p.roles.includes('chat') && (p.kind !== 'openai' || !!p.baseUrl)) || !!(process.env.CHAT_API_KEY || process.env.ANTHROPIC_API_KEY))
});

function cleanConfig(cur, body) {
  const errors = {};
  const next = { ...cur, features: { ...cur.features }, providers: cur.providers.map(p => ({ ...p })) };
  if (body.features !== undefined) next.features = { text: !!(body.features && body.features.text), photo: !!(body.features && body.features.photo), chat: !!(body.features && body.features.chat) };
  for (const k of ['dailyLimit', 'globalDailyLimit', 'chatDailyLimit', 'chatGlobalDailyLimit']) {
    if (body[k] === undefined) continue;
    const n = Math.round(+body[k]);
    if (!(n >= 0 && n <= (k === 'dailyLimit' || k === 'chatDailyLimit' ? 500 : 100000))) errors[k] = 'رقم غير صالح'; else next[k] = n;
  }
  if (body.providers !== undefined) {
    if (!Array.isArray(body.providers) || body.providers.length > 10) errors.providers = 'حتى 10 مزوّدين';
    else {
      const prev = new Map(cur.providers.map(p => [p.id, p]));
      next.providers = body.providers.map(b => {
        const old = b && b.id && prev.get(String(b.id));
        const kind = KINDS.includes(b && b.kind) ? b.kind : null;
        if (!kind) errors.providers = 'نوع مزوّد غير معروف';
        const key = str(b && b.apiKey, 400);
        if (key && (/\s/.test(key) || key.length < 10)) errors.providers = 'المفتاح شكله غلط';
        const baseUrl = str(b && b.baseUrl, 200);
        if (baseUrl && !/^https:\/\/[^\s]+$/.test(baseUrl)) errors.providers = 'الرابط لازم يبدأ بـ https://';
        if (kind === 'openai' && !baseUrl) errors.providers = 'المزوّد المتوافق مع OpenAI محتاج رابط';
        const roles = (Array.isArray(b && b.roles) ? b.roles : []).filter(r => r === 'text' || r === 'vision' || r === 'chat');
        return { id: old ? old.id : 'ai' + crypto.randomBytes(5).toString('hex'), label: str(b && b.label, 40) || (kind || 'AI'), kind, model: str(b && b.model, 80) || DEFAULT_MODEL[kind] || '',
          baseUrl, apiKey: key || (old ? old.apiKey : ''), roles: roles.length ? roles : ['text'], enabled: !(b && b.enabled === false) };
      });
    }
  }
  return { next, errors };
}

/* ── provider calls ── */
async function postJson(url, headers, body) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ac.signal });
    const json = await res.json().catch(() => null);
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    return json;
  } finally { clearTimeout(t); }
}
async function askProvider(p, system, userText, image) {
  if (p.kind === 'anthropic') {                       // Claude through the official SDK
    const content = image ? [{ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } }, { type: 'text', text: userText }] : userText;
    const r = await claudeClient(p.apiKey).messages.create({ model: p.model || DEFAULT_MODEL.anthropic, max_tokens: 1000, output_config: { effort: 'low' },
      system: system + '\nAnswer with the JSON object only.', messages: [{ role: 'user', content }] }, { timeout: TIMEOUT_MS, maxRetries: 0 });
    return r && r.stop_reason !== 'refusal' ? (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('') : '';
  }
  if (p.kind === 'gemini') {
    const parts = [{ text: userText }];
    if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
    const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`, { 'x-goog-api-key': p.apiKey },
      { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 300 } });
    return (((j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [])[0] || {}).text || '';
  }
  const base = p.kind === 'deepseek' ? (p.baseUrl || 'https://api.deepseek.com') : p.baseUrl;
  const content = image ? [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.data}` } }] : userText;
  const j = await postJson(base.replace(/\/$/, '') + '/chat/completions', { authorization: 'Bearer ' + p.apiKey },
    { model: p.model, temperature: 0, max_tokens: 300, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content }] });
  return (((j && j.choices) || [])[0] || {}).message ? j.choices[0].message.content || '' : '';
}
const parseJson = s => { try { const m = String(s).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; } };

/** Tries the providers for a role in order; returns {json, provider} or throws when none answered. */
async function ask(config, role, system, userText, image, only) {
  const now = Date.now();
  const list = config.providers.filter(p => p.enabled !== false && p.apiKey && p.roles.includes(role) && (!only || p.id === only) && !((down.get(p.id) || 0) > now && !only));
  let lastErr = null;
  for (const p of list) {
    try {
      const json = parseJson(await askProvider(p, system, userText, image));
      if (json) return { json, provider: p };
      lastErr = new Error('bad answer');
    } catch (e) {
      lastErr = e;
      down.set(p.id, Date.now() + (e && (e.status === 401 || e.status === 403) ? 600000 : 60000));
    }
  }
  const err = new Error(list.length ? 'all providers failed' : 'no provider'); err.cause = lastErr; err.none = !list.length;
  throw err;
}

const SYS_ITEM = list => `You route home-maintenance requests in Egypt. The customer writes in Egyptian Arabic (or sends a photo).
Pick the ONE best matching item id from this list, or "" if none fits. Answer JSON only: {"item":"<id>","confidence":<0..1>,"summary":"<short Arabic description of the problem>","brand":"","model":"","code":""}.
brand/model/code: only if visible or stated (device brand, model, error code); else "".
Items (id | name | category):
${list.map(i => `${i.id} | ${i.name} | ${i.catName}`).join('\n')}`;
const SYS_PROBLEM = (item, list) => `The customer's device/job is "${item.name}". Pick the ONE best matching problem id, or "" if none fits.
Answer JSON only: {"problem":"<id>","confidence":<0..1>}.
Problems (id | name):
${list.map(p => `${p.id} | ${p.name}`).join('\n')}`;

/** text / photo → {cat, item, problem, names…} validated against the catalogue (null fields when unsure). */
async function route(config, { text, image, only }) {
  const cat = catalog();
  const role = image ? 'vision' : 'text';
  const r1 = await ask(config, role, SYS_ITEM(cat.items), text || 'حلّل الصورة وحدد الجهاز والمشكلة.', image, only);
  const it = cat.items.find(i => i.id === String(r1.json.item || ''));
  const out = { cat: it ? it.cat : '', catName: it ? it.catName : '', item: it ? it.id : '', itemName: it ? it.name : '', problem: '', problemName: '',
    confidence: Math.max(0, Math.min(1, +r1.json.confidence || 0)), summary: str(r1.json.summary, 200),
    brand: str(r1.json.brand, 40), model: str(r1.json.model, 60), code: str(r1.json.code, 20), provider: r1.provider.label };
  const probs = it ? cat.problems[it.id] : [];
  if (it && probs.length) {
    try {
      const r2 = await ask(config, 'text', SYS_PROBLEM(it, probs), text || out.summary || it.name, null, only && r1.provider.roles.includes('text') ? only : null);
      const p = probs.find(x => x.id === String(r2.json.problem || ''));
      if (p) { out.problem = p.id; out.problemName = p.name; }
    } catch { /* the item alone is still useful */ }
  }
  return out;
}

/* ── usage limits (per user per day + whole platform per day) ── */
async function countUse(backend, uid, config) {
  const day = new Date().toISOString().slice(0, 10);
  return backend.runTransaction(async tx => {
    const a = backend.adapter;
    const mine = (await a.get(tx, `aiUsage/${uid}`)) || {}, all = (await a.get(tx, `aiUsage/_all`)) || {};
    const n = mine.day === day ? +mine.n || 0 : 0, total = all.day === day ? +all.n || 0 : 0;
    if (n >= config.dailyLimit || total >= config.globalDailyLimit) return false;
    a.set(tx, `aiUsage/${uid}`, { day, n: n + 1 });
    a.set(tx, `aiUsage/_all`, { day, n: total + 1 });
    return true;
  });
}

const IMG_RE = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/;
/** session op `ai` */
async function classify(backend, token, d, fail) {
  if (!token) fail('unauthenticated', 'سجّل الدخول أولًا');
  const config = await loadConfig(backend.adapter);
  const kind = d && d.kind === 'photo' ? 'photo' : 'text';
  if (!config.features[kind]) fail('failed-precondition', 'الخدمة دي مش متاحة دلوقتي');
  let text = '', image = null;
  if (kind === 'text') { text = str(d.text, 300); if (text.length < 3) fail('invalid-argument', 'اكتب المشكلة في جملة'); }
  else {
    const m = IMG_RE.exec(String(d.image || ''));
    if (!m || d.image.length > 450000) fail('invalid-argument', 'الصورة غير صالحة أو كبيرة');
    image = { mime: m[1], data: m[2] }; text = str(d.text, 200);
  }
  if (!(await countUse(backend, token.uid, config))) fail('resource-exhausted', 'وصلت للحد اليومي — اختار المشكلة بنفسك');
  try { return await route(config, { text, image }); }
  catch (e) { if (backend.log) backend.log('ai route failed', e && (e.cause ? e.cause.message : e.message)); fail('unavailable', 'مش قادرين نحدد دلوقتي — اختار بنفسك'); }
}

/** admin routes */
async function handle({ backend, tx, method, path, body, admin }) {
  if (!isRole(admin, 'owner', 'admin')) return env(403, 'FORBIDDEN', 'ليست لديك صلاحية لهذا الإجراء');
  const a = backend.adapter;
  const cur = await loadConfig(a, tx);
  const seg = path.split('/').filter(Boolean);
  if (seg.length === 2 && method === 'GET') return okEnv(view(cur));
  if (seg.length === 2 && method === 'PATCH') {
    const { next, errors } = cleanConfig(cur, body || {});
    if (Object.keys(errors).length) return env(422, 'VALIDATION', 'راجع البيانات', errors);
    const settings = (await a.get(tx, 'system/settings')) || {};          // Firestore transactions: all reads before writes
    a.set(tx, 'system/ai', { ...next, updatedAt: new Date().toISOString(), by: admin.employeeId || null });
    a.set(tx, 'system/settings', { ...settings, ai: publicFlags(next) });
    resetHealth();
    return okEnv(view(next));
  }
  if (seg[2] === 'test' && method === 'POST') {
    const p = cur.providers.find(x => x.id === String(body && body.id || ''));
    if (!p) return env(404, 'NOT_FOUND', 'المزوّد غير موجود');
    const started = Date.now();
    try {
      const r = await route(cur, { text: 'التكييف بينقّط مية من جوه ومش بيبرّد', only: p.id });
      return okEnv({ ok: !!r.item, ms: Date.now() - started, result: r });
    } catch (e) { return okEnv({ ok: false, ms: Date.now() - started, error: (e.cause && e.cause.message) || e.message }); }
  }
  return env(404, 'NOT_FOUND', 'مسار غير معروف');
}

module.exports = { classify, handle, PATH_RE, setFetch, setClaude, resetHealth, catalog, KINDS, DEFAULT_MODEL, loadConfig, publicFlags };
