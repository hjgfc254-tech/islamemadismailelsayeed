/**
 * Actor-scoped read model: what each actor may load into the app's local read model (MP).
 * Least privilege — a customer never receives other customers, provider private fields, or other people's requests;
 * a provider sees offered requests without the customer's phone/address until the job is assigned to them.
 */
'use strict';
const PROVIDER_PUBLIC = ['id', 'name', 'type', 'cats', 'subs', 'govs', 'areas', 'years', 'bio', 'rating', 'jobs', 'avatar', 'status', 'available', 'demo', 'createdAt'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const publicProvider = p => pick(p, PROVIDER_PUBLIC);
const PUBLIC_SETTINGS = ['customerFee', 'autoAssign', 'collectionModel', 'contentV', 'trend', 'packages', 'referral', 'arrivalPin', 'ai', 'bidding', 'cancelFee', 'visitFee', 'bonus', 'markupRate', 'inspectionRate', 'autoPickMin', 'controls', 'support'];   // support = public contact fields set by the admin   // ai = {text, photo} flags only (keys live in system/ai)   // promo codes stay admin-only

function base(db) {
  return { v: db.v || 2, meta: {}, serviceAreas: db.serviceAreas || [], customers: [], providers: [], serviceRequests: [],
    assignments: [], transactions: [], reviews: (db.reviews || []).filter(r => !r.hidden), complaints: [], notifications: [], addresses: [], quotes: [],
    favorites: [], settings: pick(db.settings || {}, PUBLIC_SETTINGS) };
}

/* Uber model: a customer sees only the price they pay — never the provider amount, the platform fee or the provider's
   quote breakdown on priced requests. */
function customerPricing(pr) { return pr && pr.customerPrice != null ? { customerPrice: pr.customerPrice, rate: pr.rate } : pr; }
function customerQuote(q) {
  if (!q || q.customerTotal == null) return q;
  return { id: q.id, reqId: q.reqId, status: q.status, at: q.at, approvedAt: q.approvedAt, note: q.note || '', total: q.customerTotal, customerTotal: q.customerTotal };
}
function customerRequestView(r) {
  if (!r || typeof r !== 'object') return r;
  const out = { ...r };
  if (out.pricing) out.pricing = customerPricing(out.pricing);
  if (out.currentQuote) out.currentQuote = customerQuote(out.currentQuote);
  delete out.customerReview;                       // the provider's rating of the customer is not shown to them
  return out;
}
/* M3 (owner decision, OFF by default): data minimisation per admin rank. Enabled when system/settings has
   adminDataPolicy: 'minimal'. Low ranks (support, moderator) then get customers' phones masked (010•••••678), no saved
   addresses and no transactions; finance keeps transactions; admin / owner see everything (unchanged). */
const maskPhone = (p) => { const s = String(p || ''); return s.length >= 7 ? s.slice(0, 3) + '•'.repeat(s.length - 6) + s.slice(-3) : (s ? '•••' : ''); };
/* Teams release (2026-11-22): data separation by role, ALWAYS on (independent of adminDataPolicy):
     tech     → no customers / providers / requests / assignments / transactions / complaints / chats / addresses / reviews;
     content  → no personal data: providers' public profile, requests as anonymous facts (category, status, price), no money rows;
     finance  → money rows kept; phones masked, addresses / locations / chats removed.
   Other roles (owner, admin, ops, support, moderator, custom) keep the existing behaviour below. */
const REQ_FACTS = ['id', 'no', 'cat', 'sub', 'gov', 'area', 'status', 'createdAt', 'pricing', 'bidding', 'urgent', 'free'];
const ROLE_VIEW = Object.freeze({ tech: 'none', content: 'nopii', finance: 'masked' });
function maskRequest(r) { return { ...r, phone: maskPhone(r.phone), addr: r.addr ? '•••' : r.addr, geo: null, liveGeo: null, chat: [], name: r.name ? '•••' : r.name }; }
function roleView(db, mode) {
  if (mode === 'none') { const out = base(db); out.reviews = []; out.meta = {}; return out; }
  const full = JSON.parse(JSON.stringify(db));
  full.addresses = []; full.favorites = [];
  if (mode === 'nopii') {
    full.customers = [];
    full.providers = (full.providers || []).map(publicProvider);
    full.serviceRequests = (full.serviceRequests || []).map((r) => pick(r, REQ_FACTS));
    full.transactions = []; full.complaints = [];
    full.notifications = (full.notifications || []).filter((n) => n.to === 'admin');
    return full;
  }
  full.customers = (full.customers || []).map((c) => ({ ...c, phone: maskPhone(c.phone), email: c.email ? '•••' : c.email }));
  full.providers = (full.providers || []).map((p) => ({ ...p, phone: maskPhone(p.phone), email: p.email ? '•••' : p.email, nationalId: undefined, idPhoto: undefined }));
  full.serviceRequests = (full.serviceRequests || []).map(maskRequest);
  return full;
}
/** Recursive response scrub for the restricted admin roles (defence in depth on every API answer). */
const PII_KEYS = new Set(['phone', 'whatsapp', 'email', 'addr', 'address', 'geo', 'liveGeo', 'chat', 'nationalId', 'idPhoto']);
function scrubForRole(data, role) {
  if (!ROLE_VIEW[role]) return data;
  const walk = (v, d) => {
    if (d > 12 || v == null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, d + 1));
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (!PII_KEYS.has(k)) { out[k] = walk(x, d + 1); continue; }
      if (k === 'chat') out[k] = [];
      else if ((k === 'phone' || k === 'whatsapp') && role === 'finance') out[k] = maskPhone(x);
      else out[k] = x == null ? x : (k === 'geo' || k === 'liveGeo' ? null : '•••');
    }
    return out;
  };
  return walk(data, 0);
}
function adminView(db, actor) {
  const policy = db.settings && db.settings.adminDataPolicy;
  const rank = actor.adminRole || 'owner';
  if (ROLE_VIEW[rank]) return roleView(db, ROLE_VIEW[rank]);
  const full = JSON.parse(JSON.stringify(db));
  if (policy !== 'minimal' || ['owner', 'admin'].includes(rank)) return full;
  full.customers = (full.customers || []).map((c) => ({ ...c, phone: maskPhone(c.phone), email: c.email ? '•••' : c.email }));
  full.serviceRequests = (full.serviceRequests || []).map((r) => ({ ...r, phone: maskPhone(r.phone), addr: r.addr ? '•••' : r.addr, geo: null }));
  full.addresses = [];
  if (rank !== 'finance') full.transactions = [];
  return full;
}
function scopeFor(db, actor) {
  if (!db) return null;
  if (actor && actor.role === 'admin') return adminView(db, actor);
  const out = base(db);
  out.settings = { defaultRate: 0, rates: {}, ...out.settings };
  const approved = (db.providers || []).filter(p => p.status === 'approved').map(publicProvider);
  if (!actor) { out.providers = approved; return out; }
  const tag = actor.role + ':' + actor.id;
  if (actor.role === 'customer') {
    const reqs = (db.serviceRequests || []).filter(r => r.customerId === actor.id);
    const ids = new Set(reqs.map(r => r.id));
    /* requests carry no providerId: the provider link is the request's assignments */
    const linked = new Set((db.assignments || []).filter(a => ids.has(a.reqId)).map(a => a.providerId));
    out.customers = (db.customers || []).filter(c => c.id === actor.id);
    out.providers = (db.providers || []).filter(p => p.status === 'approved' || linked.has(p.id)).map(publicProvider);
    out.serviceRequests = reqs.map(customerRequestView);
    out.assignments = (db.assignments || []).filter(a => ids.has(a.reqId)).map(a => pick(a, ['id', 'reqId', 'providerId', 'status', 'at', 'bidding', 'offer']));   // offer = customer totals only (the provider's base stays private)
    out.quotes = (db.quotes || []).filter(q => ids.has(q.reqId)).map(customerQuote);
    out.transactions = (db.transactions || []).filter(t => t.customerId === actor.id).map(t => pick(t, ['id', 'reqId', 'providerId', 'customerId', 'cat', 'value', 'free', 'discount', 'at']));
    out.addresses = (db.addresses || []).filter(a => a.customerId === actor.id);
    out.favorites = (db.favorites || []).filter(f => f.customerId === actor.id);
  } else if (actor.role === 'provider') {
    /* learned price library (provider amounts per problem / item, no personal data) for the bid-form hint;
       customers never receive it (they only see what they pay). */
    out.settings.priceLib = (db.settings || {}).priceLib || {};
    const mine = (db.assignments || []).filter(a => a.providerId === actor.id);
    const offered = new Set(mine.map(a => a.reqId));
    const accepted = new Set(mine.filter(a => a.status === 'accepted').map(a => a.reqId));
    const reqs = (db.serviceRequests || []).filter(r => offered.has(r.id));
    const ids = new Set(reqs.map(r => r.id));
    /* the customer's phone/address/location are released only once this provider accepted the job */
    out.serviceRequests = reqs.map(r => {
      const chat = Array.isArray(r.chat) ? r.chat.filter(m => m.pid === actor.id) : [];   // only this provider's own conversation
      const { pin, ...rest } = r;            // the arrival code is shown to the customer only
      return accepted.has(r.id) ? { ...rest, chat } : { ...rest, phone: '', addr: '', geo: null, liveGeo: null, chat: [] };
    });
    const custIds = new Set(reqs.filter(r => accepted.has(r.id)).map(r => r.customerId));
    out.customers = (db.customers || []).filter(c => custIds.has(c.id)).map(c => pick(c, ['id', 'name', 'phone', 'status', 'rating', 'ratingCount']));
    out.providers = (db.providers || []).map(p => (p.id === actor.id ? p : (p.status === 'approved' ? publicProvider(p) : null))).filter(Boolean);
    out.assignments = (db.assignments || []).filter(a => a.providerId === actor.id);
    out.quotes = (db.quotes || []).filter(q => ids.has(q.reqId) && q.providerId === actor.id);
    out.transactions = (db.transactions || []).filter(t => t.providerId === actor.id);
  }
  out.complaints = (db.complaints || []).filter(k => k.by === tag);
  out.notifications = (db.notifications || []).filter(n => n.to === tag);
  out.meta = { lastReqNo: (db.meta || {}).lastReqNo };
  return out;
}

module.exports = { adminView, scrubForRole, ROLE_VIEW, maskPhone, scopeFor, publicProvider, PROVIDER_PUBLIC, customerRequestView, customerQuote };
