/**
 * Provider-neutral chat completion with tool calling (support-chat.js). The owner chooses the provider in
 * Admin › التوجيه الذكي (system/ai providers with the «شات» role, in priority order); a provider that fails is skipped
 * for a while and the next one answers — the conversation is stored in a neutral form so it can move between providers.
 *
 * Kinds:  deepseek | openai (any OpenAI-compatible /chat/completions with `tools`) · gemini (generateContent with
 *         functionDeclarations) · anthropic (official @anthropic-ai/sdk).
 * Neutral history:
 *   {role:'user', text} · {role:'note', text}  (platform note — trusted)
 *   {role:'assistant', text, calls:[{id, name, args}], raw?:{kind, data}}  (raw = provider-native turn, replayed to the same kind)
 *   {role:'tool', results:[{id, name, content, error?}]}
 * Platform notes travel as `system` messages where the API allows it (OpenAI-compatible), otherwise inside the user turn
 * wrapped in <platform-note key="…"> with a per-chat random key that customer text can never contain.
 */
'use strict';

const TIMEOUT_MS = 30000;
const DEFAULT_MODEL = { deepseek: 'deepseek-chat', gemini: 'gemini-2.5-flash', openai: 'gpt-4o-mini', anthropic: 'claude-opus-5-5' };
const KINDS = Object.keys(DEFAULT_MODEL);

let fetchImpl = (...a) => globalThis.fetch(...a);
const setFetch = (f) => { fetchImpl = f || ((...a) => globalThis.fetch(...a)); };
let anthropicOverride = null; const anthropicClients = new Map();
const setAnthropic = (c) => { anthropicOverride = c; };
function anthropicClient(key) {
  if (anthropicOverride) return anthropicOverride;
  if (!anthropicClients.has(key)) { const mod = require('@anthropic-ai/sdk'); const A = mod.Anthropic || mod.default || mod; anthropicClients.clear(); anthropicClients.set(key, new A({ apiKey: key, timeout: 45000, maxRetries: 1 })); }
  return anthropicClients.get(key);
}

const down = new Map();                                  // providerId → skip until
const resetHealth = () => down.clear();
const wrapNote = (key, text) => `<platform-note key="${key}">\n${text}\n</platform-note>`;
let idSeq = 0;
const newId = () => 'tc_' + Date.now().toString(36) + (++idSeq).toString(36);

async function postJson(url, headers, body) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ac.signal });
    const json = await res.json().catch(() => null);
    if (!res.ok) { const e = new Error('HTTP ' + res.status + (json && json.error ? ' ' + String(json.error.message || json.error).slice(0, 200) : '')); e.status = res.status; throw e; }
    return json;
  } finally { clearTimeout(t); }
}
const parseArgs = (s) => { if (s && typeof s === 'object') return s; try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };

/* ───────────── OpenAI-compatible (DeepSeek, OpenAI, OpenRouter, Groq, local …) ───────────── */
async function openaiTurn(p, { system, tools, history, noTools }) {
  const messages = [{ role: 'system', content: system }];
  for (const h of history) {
    if (h.role === 'user') messages.push({ role: 'user', content: h.text });
    else if (h.role === 'note') messages.push({ role: 'system', content: h.text });
    else if (h.role === 'assistant') messages.push({ role: 'assistant', content: h.text || (h.calls.length ? null : ''), ...(h.calls.length ? { tool_calls: h.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })) } : {}) });
    else if (h.role === 'tool') for (const r of h.results) messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
  }
  const base = p.kind === 'deepseek' ? (p.baseUrl || 'https://api.deepseek.com') : p.baseUrl;
  const body = { model: p.model || DEFAULT_MODEL[p.kind], temperature: 0.3, max_tokens: 1200, messages };
  if (!noTools) { body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } })); body.tool_choice = 'auto'; }
  const j = await postJson(String(base).replace(/\/$/, '') + '/chat/completions', { authorization: 'Bearer ' + p.apiKey }, body);
  const ch = (j && j.choices && j.choices[0]) || {}, m = ch.message || {};
  if (ch.finish_reason === 'content_filter') return { refusal: true };
  const calls = (m.tool_calls || []).filter((c) => c && c.function).map((c) => ({ id: String(c.id || newId()).slice(0, 64), name: c.function.name, args: parseArgs(c.function.arguments) }));
  return { text: typeof m.content === 'string' ? m.content : '', calls };
}

/* ───────────── Google Gemini ───────────── */
function geminiSchema(s) {
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'additionalProperties' || k === 'strict') continue;
    out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, geminiSchema(pv)])) : (v && typeof v === 'object' && !Array.isArray(v) ? geminiSchema(v) : v);
  }
  return out;
}
async function geminiTurn(p, { system, tools, history, noTools, noteKey }) {
  const contents = [];
  const push = (role, parts) => { const last = contents[contents.length - 1]; if (last && last.role === role) last.parts.push(...parts); else contents.push({ role, parts: [...parts] }); };
  for (const h of history) {
    if (h.role === 'user') push('user', [{ text: h.text }]);
    else if (h.role === 'note') push('user', [{ text: wrapNote(noteKey, h.text) }]);
    else if (h.role === 'assistant') {
      if (h.raw && h.raw.kind === 'gemini') push('model', h.raw.data);
      else push('model', [...(h.text ? [{ text: h.text }] : []), ...h.calls.map((c) => ({ functionCall: { name: c.name, args: c.args || {} } }))]);
    } else if (h.role === 'tool') push('user', h.results.map((r) => ({ functionResponse: { name: r.name, response: { content: parseArgs(r.content) } } })));
  }
  const body = { systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.3, maxOutputTokens: 1200 } };
  if (!noTools) body.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, ...(Object.keys(t.schema.properties || {}).length ? { parameters: geminiSchema(t.schema) } : {}) })) }];
  const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model || DEFAULT_MODEL.gemini)}:generateContent`, { 'x-goog-api-key': p.apiKey }, body);
  if (j && j.promptFeedback && j.promptFeedback.blockReason) return { refusal: true };
  const cand = (j && j.candidates && j.candidates[0]) || {};
  if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(cand.finishReason)) return { refusal: true };
  const parts = (cand.content && cand.content.parts) || [];
  const calls = parts.filter((x) => x.functionCall).map((x) => ({ id: newId(), name: x.functionCall.name, args: x.functionCall.args || {} }));
  return { text: parts.filter((x) => typeof x.text === 'string' && !x.thought).map((x) => x.text).join(''), calls, raw: { kind: 'gemini', data: parts } };
}

/* ───────────── Anthropic (official SDK) ───────────── */
const CLAUDE_EFFORT = /claude-(opus-(4-[5-9]|5)|sonnet-(4-6|5)|fable|mythos|haiku-5)/;
const CLAUDE_FALLBACK = /^claude-(opus-5|sonnet-5-5|fable-5)/;
async function anthropicTurn(p, { system, tools, history, noTools, noteKey }) {
  const messages = [];
  const push = (role, blocks) => { const last = messages[messages.length - 1]; if (last && last.role === role) last.content.push(...blocks); else messages.push({ role, content: [...blocks] }); };
  for (const h of history) {
    if (h.role === 'user') push('user', [{ type: 'text', text: h.text }]);
    else if (h.role === 'note') push('user', [{ type: 'text', text: wrapNote(noteKey, h.text) }]);
    else if (h.role === 'assistant') {
      if (h.raw && h.raw.kind === 'anthropic') push('assistant', h.raw.data);
      else push('assistant', [...(h.text ? [{ type: 'text', text: h.text }] : []), ...h.calls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args || {} }))]);
    } else if (h.role === 'tool') push('user', h.results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, ...(r.error ? { is_error: true } : {}) })));
  }
  const model = p.model || DEFAULT_MODEL.anthropic;
  const req = { model, max_tokens: 4000, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages,
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema, strict: true })), tool_choice: noTools ? { type: 'none' } : { type: 'auto' } };
  if (CLAUDE_EFFORT.test(model)) req.output_config = { effort: 'low' };
  const fb = CLAUDE_FALLBACK.test(model);
  const client = anthropicClient(p.apiKey);
  const r = fb ? await client.beta.messages.create({ ...req, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }) : await client.messages.create(req);
  if (!r || r.stop_reason === 'refusal') return { refusal: true };
  const content = JSON.parse(JSON.stringify(r.content || []));
  return { text: content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'),
    calls: content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input || {} })), raw: { kind: 'anthropic', data: content } };
}

const TURN = { deepseek: openaiTurn, openai: openaiTurn, gemini: geminiTurn, anthropic: anthropicTurn };

/** One model turn, trying the chat providers in order. Returns {text, calls, raw, provider} | {refusal} ; throws when none answered. */
async function complete(providers, opts) {
  const now = Date.now();
  const list = providers.filter((p) => TURN[p.kind] && !((down.get(p.id) || 0) > now));
  const order = list.length ? list : providers.filter((p) => TURN[p.kind]);   // all resting → try anyway
  let lastErr = null;
  for (const p of order) {
    try {
      const out = await TURN[p.kind](p, opts);
      if (out.raw && out.raw.kind !== p.kind) out.raw = null;
      return { ...out, provider: { id: p.id, kind: p.kind, label: p.label || p.kind } };
    } catch (e) {
      lastErr = e;
      down.set(p.id, Date.now() + (e && (e.status === 401 || e.status === 403) ? 600000 : 60000));
    }
  }
  const err = new Error(order.length ? 'all chat providers failed' : 'no chat provider'); err.cause = lastErr; err.none = !order.length;
  throw err;
}

module.exports = { complete, setFetch, setAnthropic, resetHealth, geminiSchema, wrapNote, KINDS, DEFAULT_MODEL };
