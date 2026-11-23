#!/usr/bin/env node
/**
 * Firestore cost benchmark — runs the REAL server code (functions/src) over an in-memory backend seeded with a
 * marketplace of ~1000 users and counts document reads / writes per scenario, then projects a day and a month.
 *   node scripts/bench-firestore-cost.cjs            (prints a table)
 *   node scripts/bench-firestore-cost.cjs --json     (machine-readable, used to compare before / after)
 * Prices: Firestore me-central1 ≈ $0.06 per 100k reads, $0.18 per 100k writes (check the current price list).
 * Nothing here touches production.
 */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const service = require(path.join(ROOT, 'functions/src/service.js'));
const tech = require(path.join(ROOT, 'functions/src/tech-status.js'));
const alerts = require(path.join(ROOT, 'functions/src/alerts.js'));
const { memoryBackend } = require(path.join(ROOT, 'tests/helpers/memory-backend.js'));

const N = { customers: 800, providers: 200, requests: 2400, open: 20, transactions: 2000, reviews: 1500, complaints: 150, usageDocs: 150, admins: 5 };
const T0 = Date.UTC(2026, 0, 1);
const iso = (i) => new Date(T0 + i * 600000).toISOString();
const phoneOf = (p, i) => p + String(i).padStart(8, '0');

function seed() {
  const s = { 'system/meta': { lastReqNo: N.requests, v: 2 }, 'system/settings': { defaultRate: 10, rates: {} } };
  for (let i = 0; i < N.admins; i++) s[`admins/u_admin${i}`] = { status: 'active', role: i ? 'ops' : 'owner', name: 'مدير ' + i, employeeId: 'e' + i, codeHash: 'x', unlockedUntil: 9e15 };
  for (let i = 0; i < N.admins; i++) s[`employees/e${i}`] = { id: 'e' + i, name: 'مدير ' + i, role: i ? 'ops' : 'owner', status: 'active' };
  for (let i = 0; i < N.customers; i++) { s[`customers/c${i}`] = { id: 'c' + i, name: 'عميل ' + i, phone: phoneOf('010', i), createdAt: iso(i), status: 'active', _k: i }; s[`users/uc${i}`] = { tag: 'customer:c' + i, role: 'customer', refId: 'c' + i }; }
  for (let i = 0; i < N.providers; i++) { s[`providers/p${i}`] = { id: 'p' + i, name: 'فني ' + i, phone: phoneOf('011', i), createdAt: iso(i), status: i < 180 ? 'approved' : 'pending', cats: ['electric'], govs: ['القاهرة'], areas: ['مدينة نصر'], type: 'individual', _k: i }; s[`users/up${i}`] = { tag: 'provider:p' + i, role: 'provider', refId: 'p' + i }; }
  let a = 0, q = 0;
  for (let i = 0; i < N.requests; i++) {
    const open = i >= N.requests - N.open;
    s[`requests/r${i}`] = { id: 'r' + i, no: i + 1, customerId: 'c' + (i % N.customers), createdAt: iso(i), status: open ? 'received' : 'completed', cat: 'electric', gov: 'القاهرة', area: 'مدينة نصر', phone: phoneOf('010', i % N.customers), addr: 'شارع ' + i, history: [], chat: [], _k: i };
    for (let k = 0; k < 3; k++) s[`assignments/a${a}`] = { id: 'a' + a++, reqId: 'r' + i, providerId: 'p' + ((i + k) % 180), status: open ? 'offered' : k === 0 ? 'accepted' : 'declined', at: iso(i), _k: a };
    if (!open) s[`quotes/q${q}`] = { id: 'q' + q++, reqId: 'r' + i, providerId: 'p' + (i % 180), status: 'approved', at: iso(i), _k: q };
  }
  for (let i = 0; i < N.transactions; i++) s[`transactions/t${i}`] = { id: 't' + i, reqId: 'r' + i, customerId: 'c' + (i % N.customers), providerId: 'p' + (i % 180), at: iso(i), value: 300, collection: i % 10 ? 'collected' : 'pending', _k: i };
  for (let i = 0; i < N.reviews; i++) s[`reviews/v${i}`] = { id: 'v' + i, reqId: 'r' + i, providerId: 'p' + (i % 180), at: iso(i), stars: 5, _k: i };
  for (let i = 0; i < N.complaints; i++) s[`complaints/k${i}`] = { id: 'k' + i, by: 'customer:c' + i, at: iso(i), status: 'open', _k: i };
  for (let i = 0; i < 300; i++) s[`notifications/n${i}`] = { id: 'n' + i, to: i % 2 ? 'admin' : 'customer:c' + (i % 50), at: iso(i), text: 'x', read: true, _k: i };
  const month = new Date().toISOString().slice(0, 7);
  for (let i = 0; i < N.usageDocs; i++) s[`usage/${month}-01_i${i}`] = { day: month + '-01', month, instance: 'i' + i, api: 10, session: 5, reads: 100, writes: 10, hist: {}, n: {} };
  return s;
}

function counted(b) {
  const n = { reads: 0, writes: 0, by: {} };
  const col = (p) => String(p).split('/')[0];
  const ad = b.adapter, get = ad.get, query = ad.query, set = ad.set, del = ad.del, count = ad.count;
  ad.get = async (tx, p) => { n.reads++; n.by[col(p)] = (n.by[col(p)] || 0) + 1; return get(tx, p); };
  ad.query = async (tx, c, q) => { const r = await query(tx, c, q); const k = Math.max(1, r.length); n.reads += k; n.by[c] = (n.by[c] || 0) + k; return r; };
  ad.count = async (col, w) => { n.reads++; return count(col, w); };
  ad.set = (tx, p, d) => { n.writes++; return set(tx, p, d); };
  ad.del = (tx, p) => { n.writes++; return del(tx, p); };
  const gd = b.getDoc, sd = b.setDoc, qd = b.queryDocs, add = b.addDoc, dd = b.deleteDoc;
  b.getDoc = async (p) => { n.reads++; n.by[col(p)] = (n.by[col(p)] || 0) + 1; return gd.call(b, p); };
  b.setDoc = async (p, d, m) => { n.writes++; return sd.call(b, p, d, m); };
  b.addDoc = async (c, d) => { n.writes++; return add.call(b, c, d); };
  b.deleteDoc = async (p) => { n.writes++; return dd.call(b, p); };
  b.queryDocs = async (...x) => { const r = await qd.apply(b, x); const k = Math.max(1, r.length); n.reads += k; n.by[x[0]] = (n.by[x[0]] || 0) + k; return r; };
  b.sendPush = async () => [];
  b.ping = async () => true;
  return n;
}
const ADMIN = { uid: 'u_admin0', token: { email: 'a@x.co', email_verified: true } };
const CUSTOMER = { uid: 'uc0', token: { phone_number: '+20' + phoneOf('010', 0).slice(1) } };
const PROVIDER = { uid: 'up0', token: { phone_number: '+20' + phoneOf('011', 0).slice(1) } };
const REQ = { cat: 'electric', serviceName: 'إصلاح انقطاع كهرباء', desc: 'الكهرباء مقطوعة في المطبخ', gov: 'القاهرة', area: 'مدينة نصر', addr: 'شارع 1' };

async function measure(label, fn, warm) {
  const b = memoryBackend(seed());
  b.env = { bootstrapEmails: [] };
  if (warm) await warm(b);
  const n = counted(b);
  await fn(b);
  return { label, reads: n.reads, writes: n.writes, by: n.by };
}
const sync = (b, auth, app, extra) => service.session(b, { auth, data: { op: 'sync', app, ...(extra || {}) } });

async function main() {
  const rows = [];
  /* each scenario: warm-up builds the one-time public summary and per-instance caches, like a running server */
  const warmAll = async (b) => { await sync(b, null, 'customer'); };
  rows.push(await measure('admin_signin', (b) => sync(b, ADMIN, 'admin'), warmAll));
  let since = 0;
  rows.push(await measure('admin_resync_after_change', async (b) => { await sync(b, ADMIN, 'admin', { since }); }, async (b) => {
    await warmAll(b); const first = await sync(b, ADMIN, 'admin'); since = first.serverTime;
    await new Promise((r) => setTimeout(r, 5));
    await service.api(b, { auth: CUSTOMER, data: { app: 'customer', method: 'POST', path: '/requests', body: REQ } });
  }));
  rows.push(await measure('customer_signin', (b) => sync(b, CUSTOMER, 'customer'), warmAll));
  rows.push(await measure('provider_signin', (b) => sync(b, PROVIDER, 'provider'), warmAll));
  rows.push(await measure('guest_open', (b) => sync(b, null, 'customer'), warmAll));
  rows.push(await measure('customer_new_request', (b) => service.api(b, { auth: CUSTOMER, data: { app: 'customer', method: 'POST', path: '/requests', body: REQ } }), async (b) => { await warmAll(b); await sync(b, CUSTOMER, 'customer'); }));
  rows.push(await measure('clock_offers_run', (b) => service.tickOffers(b)));
  rows.push(await measure('clock_ops_scan_run', async (b) => { const ev = await service.scanOps(b); await alerts.ingest(b, ev); }));
  rows.push(await measure('clock_escalate_run', (b) => alerts.escalate(b, Date.now())));
  rows.push(await measure('clock_health_run', (b) => tech.healthTick(b, Date.now() + Math.floor(Math.random() * 1000))));
  return rows;
}

/* daily model for ~1000 users (assumptions printed with the result) */
const DAY = { admin_signin: 50, admin_resync_after_change: 2400, customer_signin: 300, provider_signin: 150, guest_open: 500, customer_new_request: 100,
  clock_offers_run: 288, clock_ops_scan_run: 288, clock_escalate_run: 288, clock_health_run: 144 };
const PRICE = { read: 0.06 / 100000, write: 0.18 / 100000 };

main().then((rows) => {
  const day = rows.reduce((t, r) => { const k = DAY[r.label] || 0; t.reads += r.reads * k; t.writes += r.writes * k; return t; }, { reads: 0, writes: 0 });
  const month = { reads: day.reads * 30, writes: day.writes * 30, usd: +(30 * (day.reads * PRICE.read + day.writes * PRICE.write)).toFixed(2) };
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ rows, day, month, assumptions: DAY, dataset: N })); return; }
  console.log('scenario'.padEnd(28), 'reads'.padStart(7), 'writes'.padStart(7), 'per day ×'.padStart(10));
  for (const r of rows) console.log(r.label.padEnd(28), String(r.reads).padStart(7), String(r.writes).padStart(7), String(DAY[r.label] || 0).padStart(10), process.argv.includes('--by') ? JSON.stringify(r.by) : '');
  console.log('day total  reads', day.reads, 'writes', day.writes, '| month reads', month.reads, 'writes', month.writes, '≈ $' + month.usd);
}).catch((e) => { console.error(e); process.exit(1); });
