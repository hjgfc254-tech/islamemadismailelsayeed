/**
 * Actor-scoped read model: what each actor may load into the app's local read model (MP).
 * Least privilege — a customer never receives other customers, provider private fields, or other people's requests;
 * a provider sees offered requests without the customer's phone/address until the job is assigned to them.
 */
'use strict';
const PROVIDER_PUBLIC = ['id', 'name', 'type', 'cats', 'subs', 'govs', 'areas', 'years', 'bio', 'rating', 'jobs', 'avatar', 'status', 'available', 'demo', 'createdAt'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const publicProvider = p => pick(p, PROVIDER_PUBLIC);
const PUBLIC_SETTINGS = ['customerFee', 'autoAssign', 'collectionModel', 'contentV'];

function base(db) {
  return { v: db.v || 2, meta: {}, serviceAreas: db.serviceAreas || [], customers: [], providers: [], serviceRequests: [],
    assignments: [], transactions: [], reviews: db.reviews || [], complaints: [], notifications: [], addresses: [], quotes: [],
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
  return out;
}
function scopeFor(db, actor) {
  if (!db) return null;
  if (actor && actor.role === 'admin') return JSON.parse(JSON.stringify(db));
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
    out.assignments = (db.assignments || []).filter(a => ids.has(a.reqId)).map(a => pick(a, ['id', 'reqId', 'providerId', 'status', 'at']));
    out.quotes = (db.quotes || []).filter(q => ids.has(q.reqId)).map(customerQuote);
    out.transactions = (db.transactions || []).filter(t => t.customerId === actor.id).map(t => pick(t, ['id', 'reqId', 'providerId', 'customerId', 'cat', 'value', 'free', 'at']));
    out.addresses = (db.addresses || []).filter(a => a.customerId === actor.id);
    out.favorites = (db.favorites || []).filter(f => f.customerId === actor.id);
  } else if (actor.role === 'provider') {
    const mine = (db.assignments || []).filter(a => a.providerId === actor.id);
    const offered = new Set(mine.map(a => a.reqId));
    const accepted = new Set(mine.filter(a => a.status === 'accepted').map(a => a.reqId));
    const reqs = (db.serviceRequests || []).filter(r => offered.has(r.id));
    const ids = new Set(reqs.map(r => r.id));
    /* the customer's phone/address/location are released only once this provider accepted the job */
    out.serviceRequests = reqs.map(r => (accepted.has(r.id) ? r : { ...r, phone: '', addr: '', geo: null }));
    const custIds = new Set(reqs.filter(r => accepted.has(r.id)).map(r => r.customerId));
    out.customers = (db.customers || []).filter(c => custIds.has(c.id)).map(c => pick(c, ['id', 'name', 'phone', 'status']));
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

module.exports = { scopeFor, publicProvider, PROVIDER_PUBLIC, customerRequestView, customerQuote };
