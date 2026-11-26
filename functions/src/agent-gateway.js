/**
 * Call-centre gateway (2026-11-25) — ONE vendor-neutral set of routes used by
 *   • a human call-centre employee (Admin app, role `callcenter` / admin / owner) through the callable `api`
 *     (service.js: code-unlocked admin session, permission `callcenter.view|create|edit`), and
 *   • an AI voice agent (any telephony / AI vendor) server-to-server through the https function `agentApi`
 *     (functions/index.js), authenticated by `Authorization: Bearer <secret>` against AGENT_API_KEYS.
 * Both go through the same validation, the same domain rules (the customer's own routes, run AS that caller), the
 * same rate limit and the same audit log. See docs/AI_CALLCENTER.md.
 *
 * Routes (envelope {ok, status, data | error:{code, message, details?}}):
 *   POST /agent/lookup                 {phone}                                   scope lookup
 *   GET  /agent/catalog                                                          scope catalog
 *   POST /agent/requests               {phone, name, cat, item, problem?, desc, gov, area, addr, when?, period?, callId?}
 *                                                                                scope requests.create
 *   GET  /agent/requests/:id           ?phone=                                   scope requests.read
 *   POST /agent/requests/:id/cancel    {phone, reason, confirmFee?}              scope requests.cancel
 *   POST /agent/complaints             {phone, requestId?, kind, text}           scope complaints
 *   POST /agent/handoff                {callId, phone?, requestId?, summary, reason}   scope handoff
 *   POST /agent/calls                  {callId, from, startedAt, endedAt, channel, summary, outcome, transcript?}  scope calls
 *   GET  /agent/calls                  recent call logs (no transcripts)         scope calls.read
 *   GET  /agent/handoffs               recent hand-off tickets                   scope calls.read
 *
 * Data separation: nothing here lists customers. Every record is reached from the caller's phone, and a request is
 * answered only when it belongs to that phone (otherwise 404, existence is never leaked). Addresses of other people
 * never travel; the caller's own requests carry area / governorate only.
 * Storage (server-only, Firestore rules deny clients): callLogs/{id}; hand-offs are opsTickets with source 'callcenter'.
 * Retention: a call transcript is deleted 30 days after the call is logged (retentionTick, functions/index.js).
 */
'use strict';
const crypto = require('crypto');
const path = require('path');
const { createLimiter, clientIp } = require('./limits');
const { normalizePhone } = require('./identity');
const { maskPhone } = require('./scope');
const { PartialDb } = require('./partial');
const { plan } = require('./plan');
const runtime = require('./runtime');
const alerts = require('./alerts');

const PATH_RE = /^\/agent(\/|$)/;
const SCOPES = Object.freeze(['lookup', 'catalog', 'requests.create', 'requests.read', 'requests.cancel', 'complaints', 'handoff', 'calls', 'calls.read']);
/** scope → Admin RBAC permission for human employees */
const PERM_OF_SCOPE = Object.freeze({
  lookup: 'callcenter.view', catalog: 'callcenter.view', 'requests.read': 'callcenter.view', 'calls.read': 'callcenter.view',
  'requests.create': 'callcenter.create', complaints: 'callcenter.create', handoff: 'callcenter.create', calls: 'callcenter.create',
  'requests.cancel': 'callcenter.edit'
});
const TRANSCRIPT_KEEP_MS = 30 * 86400000;
const RATE = Object.freeze({ perPrincipalPerMin: Math.max(10, +process.env.AGENT_RATE_PER_MIN || 120), badAuthPerIpPerMin: 20 });
const PHONE_RE = /^01[0125]\d{8}$/;
const OPEN_CAP = 10;                                   // same cap as a verified customer account (orders-api M1)
const FINAL = new Set(['closed', 'cancelled', 'failed']);
const OUTCOMES = Object.freeze(['request_created', 'status_given', 'cancelled', 'complaint', 'handoff', 'info', 'dropped', 'other']);
const NEXT_STEP = Object.freeze({
  received: 'بندوّر على فني مناسب — هنبلغك أول ما حد يقبل', searching: 'بندوّر على فني مناسب — هنبلغك أول ما حد يقبل',
  sent: 'الطلب اتبعت لفني وبنستنى ردّه', accepted: 'الفني قبل الطلب وهيتواصل معاك لتأكيد الموعد',
  scheduled: 'الموعد متأكد — الفني هيبلغك وهو في الطريق', enroute: 'الفني في الطريق ليك', arrived: 'الفني وصل عندك',
  started: 'الشغل شغال دلوقتي', quote: 'الفني بعت سعر ومحتاج موافقتك',
  completed: 'الخدمة خلصت — أكّد الإتمام وقيّم الفني من التطبيق', closed: 'الطلب مقفول', cancelled: 'الطلب ملغي',
  failed: 'تعذّر تنفيذ الخدمة — ممكن نسجّل شكوى'
});

const env = (status, data) => ({ ok: true, status, data });
const bad = (status, code, message, details) => ({ ok: false, status, error: details ? { code, message, details } : { code, message } });
const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const iso = (ms) => new Date(ms).toISOString();
const phoneOf = (v) => normalizePhone(v);

/* ───────────── static domain facts (catalogue tree, status labels, governorates) — one context per instance ───────────── */
let staticEnv = null;
function domain() {
  if (!staticEnv) {
    const e = runtime.createContext(null, []);
    staticEnv = { CAT: e.run('CAT'), LABEL: JSON.parse(JSON.stringify(e.mp.STATUS_LABEL)), FLOW: e.mp.FLOW.map((f) => f[0]), GOVS: JSON.parse(JSON.stringify(e.mp.GOVS || [])) };
  }
  return staticEnv;
}
const labelOf = (s) => domain().LABEL[s] || s;
const cancellable = (status) => !FINAL.has(status) && domain().FLOW.indexOf(status) < domain().FLOW.indexOf('started');

/* ───────────── API keys (AI agents) ───────────── */
/** AGENT_API_KEYS = "id:secret:scope1|scope2, id2:secret2:*" — secrets ≥ 24 characters; '*' = every scope.
    Only SHA-256 digests are kept in memory; invalid entries are skipped (never logged with their secret). */
function parseKeys(raw) {
  const out = [];
  for (const entry of String(raw || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean)) {
    const a = entry.indexOf(':'), b = entry.lastIndexOf(':');
    if (a <= 0 || b <= a) continue;
    const id = entry.slice(0, a), secret = entry.slice(a + 1, b), scopes = entry.slice(b + 1).split('|').map((s) => s.trim()).filter(Boolean);
    if (!/^[\w-]{2,40}$/.test(id) || secret.length < 24 || !scopes.length) continue;
    const all = scopes.includes('*');
    out.push({ id, digest: crypto.createHash('sha256').update(secret).digest(), scopes: new Set(all ? SCOPES : scopes.filter((s) => SCOPES.includes(s))) });
  }
  return out;
}
let keyCache = { raw: null, keys: [] };
const keysFromEnv = () => { const raw = process.env.AGENT_API_KEYS || ''; if (keyCache.raw !== raw) keyCache = { raw, keys: parseKeys(raw) }; return keyCache.keys; };

/** The key presented in `Authorization: Bearer …`, or null. Constant-time digest comparison against every key. */
function authenticate(header, keys) {
  const m = /^Bearer\s+(\S{16,256})$/.exec(String(header || '').trim());
  if (!m) return null;
  const d = crypto.createHash('sha256').update(m[1]).digest();
  let hit = null;
  for (const k of keys || []) if (crypto.timingSafeEqual(d, k.digest) && !hit) hit = k;
  return hit;
}

/* ───────────── rate limit (in memory per instance, limits.js) ───────────── */
const defaultLimiter = createLimiter({ userReadsPerMin: RATE.perPrincipalPerMin, ipReadsPerMin: RATE.badAuthPerIpPerMin, anonymousReadsPerMinPerInstance: 600 });

/* ───────────── views ───────────── */
function requestSummary(r) {
  return { id: r.id, no: r.no, status: r.status, statusLabel: labelOf(r.status), serviceName: r.serviceName || '', catName: r.catName || '', itemName: r.itemName || '',
    createdAt: r.createdAt, when: r.when || '', period: r.preferredPeriod || '', gov: r.gov || '', area: r.area || '', open: !FINAL.has(r.status), source: r.source || 'app' };
}
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

/* ───────────── handlers ───────────── */
async function lookup({ backend, body, principal }) {
  const phone = phoneOf(body.phone);
  if (!PHONE_RE.test(phone)) return bad(400, 'VALIDATION', 'رقم موبايل مصري غير صحيح (01xxxxxxxxx)', { phone: '01xxxxxxxxx' });
  const ld = new PartialDb(backend.adapter, null);
  const [c] = await ld.where('customers', [['phone', '==', phone]], { limit: 1 });
  const shown = principal.channel === 'human' ? phone : maskPhone(phone);
  if (!c) return env(200, { found: false, phone: shown, requests: [] });
  const reqs = await ld.where('serviceRequests', [['customerId', '==', c.id]], { orderBy: ['createdAt', 'desc'], limit: 10 });
  return env(200, { found: true, customer: { id: c.id, name: c.name || '', phone: shown, status: c.status || 'active' }, requests: reqs.map(requestSummary), subject: c.id });
}

async function catalog({ backend }) {
  const ld = new PartialDb(backend.adapter, null);
  const sys = await ld.loadSystem();
  const db = ld.toDb() || (sys.settings ? { ...runtime.emptyDb(), settings: sys.settings } : null);
  const res = runtime.operation({ db, roster: [] }, (e) => {
    const CAT = e.run('CAT'), mp = e.mp;
    const visit = +((mp.db().settings || {}).visitFee) > 0 ? mp.quoteFor(+mp.db().settings.visitFee, mp.inspectionRate()).customerPrice : 0;
    return {
      categories: CAT.categories().map((c) => ({ id: c.id, name: c.name, safety: c.safety || [],
        items: CAT.items(c.id).map((i) => { const pr = mp.priceFor(i.id); return { id: i.id, name: i.name, price: pr ? pr.customerPrice : null,
          problems: CAT.problems(i.id).map((p) => ({ id: p.id, name: p.name, warn: p.warn || '' })) }; }) })),
      fees: { cancelFee: mp.cancelFee(), visitFee: visit },
      govs: mp.GOVS || [],
      note: 'price = السعر اللي العميل بيدفعه للبند (لو محدد). null = السعر بيتحدد بعد المعاينة — متقولش رقم من عندك.'
    };
  });
  return env(200, res.result);
}

function validateCreate(b) {
  const D = domain(), errors = {};
  const phone = phoneOf(b.phone);
  if (!PHONE_RE.test(phone)) errors.phone = '01xxxxxxxxx';
  const name = str(b.name, 60); if (name.length < 2) errors.name = 'اسم المتصل (2–60 حرف)';
  const sel = D.CAT.valid({ cat: String(b.cat || ''), item: String(b.item || ''), problem: String(b.problem || '') });
  if (!sel.cat) errors.cat = 'تصنيف غير معروف — استخدم /agent/catalog';
  else if (!sel.item) errors.item = 'بند غير معروف في التصنيف ده';
  if (b.problem && !sel.problem && sel.item) errors.problem = 'مشكلة غير معروفة للبند ده (سيبها فاضية لو مش واضحة)';
  const desc = String(b.desc == null ? '' : b.desc).trim(); if (desc.length > 2000) errors.desc = 'أطول من 2000 حرف';
  const gov = str(b.gov, 40); if (!gov) errors.gov = 'مطلوب'; else if (D.GOVS.length && !D.GOVS.includes(gov)) errors.gov = 'محافظة غير معروفة';
  const area = str(b.area, 60), addr = str(b.addr, 300); if (addr.length < 5) errors.addr = 'العنوان بالتفصيل (5 حروف على الأقل)';
  const when = str(b.when, 10); if (when && !/^\d{4}-\d{2}-\d{2}$/.test(when)) errors.when = 'YYYY-MM-DD';
  const period = str(b.period, 10); if (period && !['morning', 'noon', 'evening'].includes(period)) errors.period = 'morning | noon | evening';
  if (Object.keys(errors).length) return { errors };
  const c = D.CAT.category(sel.cat), it = D.CAT.item(sel.item), p = sel.problem ? D.CAT.problem(sel.problem) : null;
  const whenFull = when ? when + (period ? ' ' + { morning: '09:00', noon: '12:00', evening: '15:00' }[period] : '') : '';
  /* the same request shape the customer app's wizard sends (apps/customer/pages/request-wizard.page.js) */
  return { phone, name, payload: {
    cat: sel.cat, serviceId: sel.item, serviceName: it.name + (p ? ' — ' + p.name : ' — تشخيص بالمعاينة'), catName: c.name, itemId: sel.item, itemName: it.name,
    problemId: p ? p.id : '', problemName: p ? p.name : '', unknownProblem: !p, answers: {}, specialty: it.specialty,
    desc, note: '', notes: 'طلب عن طريق خدمة العملاء', photos: [], attachments: [], video: '',
    gov, area, addr, when: whenFull, preferredSlot: '', preferredPeriod: period, flexible: !whenFull, whenNote: '', contactMethod: 'call'
  } };
}

async function createRequest({ backend, body, principal, deps }) {
  const v = validateCreate(body || {});
  if (v.errors) return bad(400, 'VALIDATION', 'راجع بيانات الطلب', v.errors);
  const callId = str(body.callId, 120);
  const out = await deps.domain(backend, {
    async load(ld) {
      await ld.loadSystem();
      const [c] = await ld.where('customers', [['phone', '==', v.phone]], { limit: 1 });
      if (c && c.status === 'suspended') return { stop: bad(403, 'FORBIDDEN', 'الحساب ده موقوف — حوّل المكالمة لموظف') };
      const actor = c ? { role: 'customer', id: c.id, name: c.name } : null;
      await plan(ld, { method: 'POST', path: '/requests', query: {}, body: v.payload, actor });
      return { customerId: c ? c.id : null };
    },
    async run(e, ctx) {
      let cust = ctx.customerId ? e.mp.get('customers', ctx.customerId) : null;
      if (!cust) { cust = e.mp.customerFor(v.name, v.phone); cust.source = 'callcenter'; cust.createdBy = { channel: principal.channel, id: principal.id }; }
      const open = e.mp.reqs().filter((r) => r.customerId === cust.id && !FINAL.has(r.status) && r.status !== 'completed').length;
      if (open >= OPEN_CAP) return bad(409, 'CONFLICT', 'المتصل عنده طلبات مفتوحة كتير — خلّص أو الغي واحد الأول');
      const res = await e.client.request('POST', '/requests', { body: v.payload, actor: { role: 'customer', id: cust.id, name: cust.name } });
      if (!res.ok) return res;
      const r = e.mp.get('serviceRequests', res.data.id);
      r.source = 'callcenter'; r.createdBy = { channel: principal.channel, id: principal.id }; if (callId) r.callId = callId;
      return { ok: true, status: 201, data: { ...requestSummary(r), price: r.pricing ? r.pricing.customerPrice : null, customerId: cust.id }, subject: r.id };
    }
  });
  return out.result;
}

/** loads a request and checks it belongs to the caller's phone; null = not found for this caller */
async function ownedRequest(ld, id, phone) {
  const r = await ld.doc('serviceRequests', id);
  if (!r) return null;
  const c = await ld.doc('customers', r.customerId);
  const owner = phoneOf((c && c.phone) || r.phone);
  return owner && owner === phone ? { r, c } : null;
}

async function requestStatus({ backend, id, query, principal }) {
  void principal;
  const phone = phoneOf(query.phone);
  if (!PHONE_RE.test(phone)) return bad(400, 'VALIDATION', 'ابعت رقم المتصل (phone) للتحقق من ملكية الطلب', { phone: '01xxxxxxxxx' });
  const ld = new PartialDb(backend.adapter, null);
  const own = await ownedRequest(ld, id, phone);
  if (!own) return bad(404, 'NOT_FOUND', 'مفيش طلب بالرقم ده للمتصل ده');
  const r = own.r;
  const as = await ld.where('assignments', [['reqId', '==', r.id]]);
  const acc = as.find((a) => a.status === 'accepted');
  const p = acc ? await ld.doc('providers', acc.providerId) : null;
  let fee = 0;
  if (acc && ['enroute', 'arrived'].includes(r.status)) { const sys = await ld.loadSystem(); const s = (sys.settings || {}).cancelFee; fee = s != null && s !== '' ? Math.max(0, Math.round(+s)) : 50; }
  return env(200, { ...requestSummary(r), provider: p ? firstName(p.name) : null,
    eta: r.status === 'enroute' && r.etaAt ? { at: r.etaAt, minutes: r.etaMin || null } : null,
    nextStep: NEXT_STEP[r.status] || '', canCancel: cancellable(r.status), cancelFee: cancellable(r.status) ? fee : 0, subject: r.id });
}

async function cancelRequest({ backend, id, body, principal, deps }) {
  const phone = phoneOf(body.phone);
  if (!PHONE_RE.test(phone)) return bad(400, 'VALIDATION', 'ابعت رقم المتصل (phone)', { phone: '01xxxxxxxxx' });
  const reason = str(body.reason, 200);
  if (reason.length < 3) return bad(400, 'VALIDATION', 'اكتب سبب الإلغاء', { reason: 'مطلوب' });
  const out = await deps.domain(backend, {
    async load(ld) {
      const own = await ownedRequest(ld, id, phone);
      if (!own) return { stop: bad(404, 'NOT_FOUND', 'مفيش طلب بالرقم ده للمتصل ده') };
      const actor = { role: 'customer', id: own.r.customerId, name: own.c ? own.c.name : '' };
      await plan(ld, { method: 'POST', path: `/requests/${id}/cancel`, query: {}, body: {}, actor });
      return { actor };
    },
    async run(e, ctx) {
      const r = e.mp.get('serviceRequests', id), a = e.mp.activeAssignment(id);
      /* the same rule as MP.cancel: a travel fee once the accepted provider is on the way / arrived */
      const fee = a && a.status === 'accepted' && ['enroute', 'arrived'].includes(r.status) ? e.mp.cancelFee() : 0;
      /* confirmFee: true (voice / human agent who just read the amount) or the exact amount the customer agreed to (chat
         card) — an amount that no longer matches the current fee is asked again */
      const agreed = body.confirmFee === true || (typeof body.confirmFee === 'number' && body.confirmFee === fee);
      if (fee && !agreed) {
        return bad(409, 'FEE_CONFIRMATION_REQUIRED', 'فيه رسوم انتقال ' + fee + ' ج.م لأن الفني في الطريق — اقرأها للمتصل، ولو وافق ابعت confirmFee: true', { fee });
      }
      const by = principal.channel === 'ai' ? 'المساعد الصوتي' : principal.channel === 'chat' ? 'خدمة العملاء (شات)' : 'خدمة العملاء';
      const res = await e.client.request('POST', `/requests/${id}/cancel`, { body: { reason: 'إلغاء عن طريق ' + by + ': ' + reason }, actor: ctx.actor });
      if (!res.ok) return res;
      return { ok: true, status: 200, data: { ...requestSummary(e.mp.get('serviceRequests', id)), cancelFee: fee }, subject: id };
    }
  });
  return out.result;
}

async function complaint({ backend, body, principal, deps }) {
  const phone = phoneOf(body.phone);
  if (!PHONE_RE.test(phone)) return bad(400, 'VALIDATION', 'ابعت رقم المتصل (phone)', { phone: '01xxxxxxxxx' });
  const text = String(body.text == null ? '' : body.text).trim(), kind = str(body.kind, 40), reqId = str(body.requestId, 80);
  if (text.length < 5 || text.length > 1000) return bad(400, 'VALIDATION', 'اكتب تفاصيل الشكوى (5–1000 حرف)', { text: '5–1000' });
  const out = await deps.domain(backend, {
    async load(ld) {
      const [c] = await ld.where('customers', [['phone', '==', phone]], { limit: 1 });
      if (!c) return { stop: bad(404, 'NOT_FOUND', 'مفيش حساب بالرقم ده — اعمل طلب الأول أو حوّل لموظف') };
      if (reqId && !(await ownedRequest(ld, reqId, phone))) return { stop: bad(404, 'NOT_FOUND', 'مفيش طلب بالرقم ده للمتصل ده') };
      const actor = { role: 'customer', id: c.id, name: c.name };
      await plan(ld, { method: 'POST', path: '/complaints', query: {}, body: { reqId }, actor });
      return { actor };
    },
    async run(e, ctx) {
      const res = await e.client.request('POST', '/complaints', { body: { reqId: reqId || undefined, text, kind: kind || 'callcenter' }, actor: ctx.actor });
      if (!res.ok) return res;
      const k = (e.mp.db().complaints || []).find((x) => x.id === res.data.id);
      if (k) { k.source = 'callcenter'; k.createdBy = { channel: principal.channel, id: principal.id }; }
      return { ok: true, status: 201, data: { id: res.data.id, status: res.data.status || 'open', requestId: reqId || null }, subject: res.data.id };
    }
  });
  return out.result;
}

async function handoff({ backend, body, principal }) {
  const C = require(path.join(__dirname, '..', 'domain', 'apps', 'admin', 'modules', 'ops-core.js'));
  const callId = str(body.callId, 120), summary = String(body.summary == null ? '' : body.summary).trim().slice(0, 1000), reason = str(body.reason, 200);
  const phone = body.phone ? phoneOf(body.phone) : '';
  const errors = {};
  if (!callId) errors.callId = 'مطلوب';
  if (summary.length < 3) errors.summary = 'ملخص المكالمة مطلوب';
  if (reason.length < 2) errors.reason = 'مطلوب';
  if (phone && !PHONE_RE.test(phone)) errors.phone = '01xxxxxxxxx';
  if (Object.keys(errors).length) return bad(400, 'VALIDATION', 'راجع بيانات التحويل', errors);
  const requestId = str(body.requestId, 80);
  const now = Date.now(), id = 'tk_' + now.toString(36) + crypto.randomBytes(3).toString('hex');
  const t = C.createTicket({ title: 'محتاج موظف — ' + reason, description: summary + (phone ? '\nرقم المتصل: ' + phone : '') + (requestId ? '\nالطلب: ' + requestId : ''),
    team: 'ops', priority: 'high', link: '#/callcenter' }, { id: principal.id, name: principal.channel === 'ai' ? 'المساعد الصوتي (' + principal.id + ')' : principal.name || 'خدمة العملاء' }, now, id);
  if (!t.ok) return bad(400, 'VALIDATION', t.message, t.errors);
  const ticket = { ...t.ticket, source: 'callcenter', callId, phone, requestId, channel: principal.channel, agentId: principal.id };
  await backend.setDoc(`opsTickets/${id}`, ticket);
  const raised = await alerts.notifyTeam(backend, 'ops', 'normal', { title: 'محتاج موظف — ' + reason, text: summary.slice(0, 200), key: 'handoff:' + principal.id + ':' + callId, link: '#/callcenter', kind: 'handoff' });
  return env(201, { ticketId: id, alertRaised: raised > 0, subject: id });
}

async function logCall({ backend, body, principal }) {
  const callId = str(body.callId, 120), errors = {};
  if (!/^[\w.:@-]{1,120}$/.test(callId)) errors.callId = 'حروف وأرقام و . : @ - _ بس';
  const from = phoneOf(body.from);
  if (from && !/^\+?\d{6,15}$/.test(from)) errors.from = 'رقم غير صالح';
  const startedAt = Date.parse(body.startedAt), endedAt = body.endedAt ? Date.parse(body.endedAt) : NaN;
  if (!Number.isFinite(startedAt)) errors.startedAt = 'ISO 8601';
  if (body.endedAt && (!Number.isFinite(endedAt) || endedAt < startedAt)) errors.endedAt = 'ISO 8601 بعد startedAt';
  const channel = body.channel === 'human' ? 'human' : body.channel === 'ai' ? 'ai' : '';
  if (!channel) errors.channel = 'ai | human';
  const outcome = OUTCOMES.includes(body.outcome) ? body.outcome : '';
  if (!outcome) errors.outcome = OUTCOMES.join(' | ');
  const summary = String(body.summary == null ? '' : body.summary).trim().slice(0, 2000);
  const transcript = body.transcript == null ? null : String(body.transcript);
  if (transcript && transcript.length > 100000) errors.transcript = 'أطول من 100000 حرف';
  if (Object.keys(errors).length) return bad(400, 'VALIDATION', 'راجع بيانات المكالمة', errors);
  const now = Date.now();
  const id = 'cl_' + crypto.createHash('sha256').update(principal.id + '|' + callId).digest('hex').slice(0, 32);   // idempotent per agent + call
  const doc = { id, callId, from, startedAt: iso(startedAt), endedAt: Number.isFinite(endedAt) ? iso(endedAt) : null, channel, summary, outcome,
    requestId: str(body.requestId, 80) || null, agentId: principal.id, agentChannel: principal.channel, createdAt: iso(now),
    transcript: transcript || null, transcriptExpiresAt: transcript ? iso(now + TRANSCRIPT_KEEP_MS) : null };
  await backend.setDoc(`callLogs/${id}`, doc);
  return env(201, { id, transcriptExpiresAt: doc.transcriptExpiresAt, subject: id });
}

async function listCalls({ backend }) {
  const rows = await backend.adapter.query(null, 'callLogs', { where: [], orderBy: ['createdAt', 'desc'], limit: 50 });
  return env(200, { items: rows.map(({ data: d }) => ({ id: d.id, callId: d.callId, from: maskPhone(d.from), startedAt: d.startedAt, endedAt: d.endedAt, channel: d.channel,
    summary: d.summary, outcome: d.outcome, requestId: d.requestId, agentId: d.agentId, hasTranscript: !!d.transcript })) });
}

async function listHandoffs({ backend }) {
  const rows = await backend.adapter.query(null, 'opsTickets', { where: [['source', '==', 'callcenter']], orderBy: ['createdAt', 'desc'], limit: 30 });
  return env(200, { items: rows.map(({ data: t }) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, createdAt: t.createdAt, callId: t.callId,
    phone: maskPhone(t.phone), requestId: t.requestId || null, owner: t.owner ? t.owner.name : null })) });
}

const ROUTES = [
  ['POST', /^\/agent\/lookup$/, 'lookup', lookup],
  ['GET', /^\/agent\/catalog$/, 'catalog', catalog],
  ['POST', /^\/agent\/requests$/, 'requests.create', createRequest],
  ['GET', /^\/agent\/requests\/([\w-]{1,80})$/, 'requests.read', requestStatus],
  ['POST', /^\/agent\/requests\/([\w-]{1,80})\/cancel$/, 'requests.cancel', cancelRequest],
  ['POST', /^\/agent\/complaints$/, 'complaints', complaint],
  ['POST', /^\/agent\/handoff$/, 'handoff', handoff],
  ['POST', /^\/agent\/calls$/, 'calls', logCall],
  ['GET', /^\/agent\/calls$/, 'calls.read', listCalls],
  ['GET', /^\/agent\/handoffs$/, 'calls.read', listHandoffs]
];

/**
 * principal: { channel: 'ai' | 'human', id, name?, uid?, adminRole?, can(scope) → bool }
 * deps: { domain(backend, {load(ld), run(env, ctx)}) → {result} }   (service.js: transaction + commit + change signals)
 */
async function handle({ backend, principal, method, path: p, query, body, deps, limiter }) {
  const m = String(method || '').toUpperCase();
  const hit = ROUTES.find(([rm, re]) => rm === m && re.test(p));
  if (!hit) return bad(404, 'NOT_FOUND', 'لا يوجد مسار ' + m + ' ' + p);
  const [, re, scope, fn] = hit;
  if (!principal) return bad(401, 'UNAUTHENTICATED', 'مفتاح أو جلسة غير صالحة');
  if (!principal.can(scope)) return bad(403, 'FORBIDDEN', 'الصلاحية «' + scope + '» مش متاحة للحساب ده');
  if (!(limiter || defaultLimiter).allowRead({ uid: principal.channel + ':' + principal.id })) return bad(429, 'RATE_LIMITED', 'طلبات كثيرة — حاول بعد دقيقة');
  let out;
  try {
    out = await fn({ backend, principal, body: body && typeof body === 'object' ? body : {}, query: query || {}, id: (re.exec(p) || [])[1], deps });
  } catch (e) {
    if (e && e.code === 'resource-exhausted') out = bad(429, 'RATE_LIMITED', e.message);
    else throw e;
  }
  const subject = out && out.ok ? out.subject || (out.data && out.data.subject) || null : null;
  if (out) { delete out.subject; if (out.data && typeof out.data === 'object') delete out.data.subject; }
  try {
    await backend.addDoc('audit', { at: new Date().toISOString(), uid: principal.uid || null, actor: { role: 'agent', id: principal.id, channel: principal.channel, adminRole: principal.adminRole || null },
      app: 'agent', method: m, path: p, status: out ? out.status : 500, action: 'agent.' + scope, subject });
  } catch (e) { if (backend.log) backend.log('agent audit failed', e && e.message); }
  return out;
}

/** https entry (functions/index.js agentApi): Bearer key → principal → handle(). Returns {status, body}. */
async function http(backend, req, opts) {
  const o = opts || {}, limiter = o.limiter || defaultLimiter;
  let p = String(req.path || req.url || '/').split('?')[0];
  p = p.replace(/^\/agentApi(?=\/|$)/, '');
  if (!PATH_RE.test(p)) p = '/agent' + (p === '/' ? '' : p);
  const keys = o.keys || keysFromEnv();
  const key = authenticate(req.headers && (req.headers.authorization || req.headers.Authorization), keys);
  if (!key) {
    const ip = clientIp(req);
    if (!limiter.allowRead({ ip: 'badkey:' + (ip || 'unknown') })) return { status: 429, body: bad(429, 'RATE_LIMITED', 'طلبات كثيرة — حاول بعد دقيقة') };
    if (backend.log) backend.log('agentApi: rejected key', { ip, path: p });
    return { status: 401, body: bad(401, 'UNAUTHENTICATED', 'Authorization: Bearer <agent key> مطلوب أو غير صالح') };
  }
  const principal = { channel: 'ai', id: key.id, can: (s) => key.scopes.has(s) };
  const out = await handle({ backend, principal, method: req.method, path: p, query: req.query || {}, body: req.body, deps: o.deps, limiter });
  return { status: out.status || (out.ok ? 200 : 500), body: out };
}

/** callLogsClock: removes transcripts older than 30 days (the call summary stays). */
async function retentionTick(backend, now) {
  const t = now || Date.now();
  const rows = await backend.queryDocs('callLogs', 'transcriptExpiresAt', '<=', iso(t));
  let n = 0;
  for (const r of rows.slice(0, 500)) {
    await backend.setDoc(`callLogs/${r.id}`, { transcript: null, transcriptExpiresAt: null, transcriptDeletedAt: iso(t) }, true);
    n++;
  }
  return { deleted: n };
}

module.exports = { PATH_RE, SCOPES, PERM_OF_SCOPE, TRANSCRIPT_KEEP_MS, OUTCOMES, ROUTES, parseKeys, authenticate, handle, http, retentionTick, validateCreate, _domain: domain };
