'use strict';
/* Machine-checkable wiring of the platform (docs/MAINTENANCE_GUIDE.md):
 *   1. every API route of the shared domain (services/*-api.js + ops-api) is classified: loaded by a plan.js branch,
 *      settings-only, static, or served by a server-native handler — and no server-native handler shadows a domain
 *      route by accident;
 *   2. every functions/index.js export, session op, env var / secret and API route is documented in the guide;
 *   3. every Admin nav page has a registered page file and a permission rule (module, owner-only or explicitly open);
 *   4. every Firestore query shape in functions/src has a composite index in firestore.indexes.json or needs none.
 * No source changes for testability: source files are read as text, the domain runs through functions/src/runtime.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const GUIDE = read('docs/MAINTENANCE_GUIDE.md');
const runtime = require(path.join(ROOT, 'functions/src/runtime.js'));
const { plan } = require(path.join(ROOT, 'functions/src/plan.js'));
const { PartialDb } = require(path.join(ROOT, 'functions/src/partial.js'));
const { memoryBackend } = require('../helpers/memory-backend.js');

const ROUTES = JSON.parse(JSON.stringify(runtime.createContext(null, []).client.routes()));   // plain arrays (out of the vm realm)
const sig = (r) => r.method + ' ' + r.path;

/* ───────── 1. API routes → server data plan ───────── */
const PLAN_SEG0 = ['requests', 'providers', 'customers', 'notifications', 'complaints'];     // plan.js `seg[0] === …`
const PLAN_ADMIN_SEG1 = ['requests', 'providers', 'customers', 'reviews', 'transactions', 'payments'];   // plan.js admin `seg[1] === …`
/* routes whose handler reads only system/settings (loaded by plan.loadSystem) */
const SETTINGS_ONLY = ['GET /pricing', 'GET /admin/commission', 'POST /admin/commission', 'GET /admin/pricing', 'POST /admin/pricing',
  'GET /admin/controls', 'POST /admin/controls', 'GET /admin/support-contacts', 'PATCH /admin/support-contacts',
  'GET /admin/data-policy', 'POST /admin/data-policy', 'GET /admin/marketing', 'PATCH /admin/marketing'];
/* catalogue / static answers: nothing to load */
const STATIC = ['GET /auth/me', 'GET /categories', 'GET /services', 'GET /free-reasons'];
/* answered before plan.js by server code */
const SERVICE_NATIVE = { 'GET /admin/summary': 'service.js adminSummary (aggregation counts)' };
const ALERTS_RE = require(path.join(ROOT, 'functions/src/alerts.js')).PATH_RE;   // /admin/alerts*, /admin/tickets* (shared ops-routes)

function classify(r) {
  const s = sig(r), seg = r.path.split('/').filter(Boolean);
  if (STATIC.includes(s)) return 'static';
  if (SETTINGS_ONLY.includes(s)) return 'settings';
  if (SERVICE_NATIVE[s]) return 'service';
  if (ALERTS_RE.test(r.path.replace(/:\w+/g, 'x'))) return 'alerts';
  if (seg[0] === 'admin') return PLAN_ADMIN_SEG1.includes(seg[1]) ? 'plan' : null;
  return PLAN_SEG0.includes(seg[0]) ? 'plan' : null;
}

test('the domain exposes its full route table (sanity)', () => {
  assert.ok(ROUTES.length >= 90, 'expected the complete route table, got ' + ROUTES.length);
  assert.equal(new Set(ROUTES.map(sig)).size, ROUTES.length, 'duplicate routes');
});

test('every API route has a server data plan or is listed as settings-only / static / server-native', () => {
  const missing = ROUTES.filter((r) => !classify(r)).map(sig);
  assert.deepEqual(missing, [], 'classify these routes here and give them a plan.js branch if they read records');
  const all = new Set(ROUTES.map(sig));
  for (const s of [...SETTINGS_ONLY, ...STATIC, ...Object.keys(SERVICE_NATIVE)]) assert.ok(all.has(s), 'stale wiring entry (route no longer exists): ' + s);
});

test('plan.js has a branch for every plan prefix, and service.js answers /admin/summary itself', () => {
  const src = read('functions/src/plan.js');
  for (const s of PLAN_SEG0.concat('admin')) assert.ok(src.includes(`seg[0] === '${s}'`), 'plan.js branch for /' + s);
  for (const s of PLAN_ADMIN_SEG1) assert.ok(src.includes(`seg[1] === '${s}'`), 'plan.js admin branch for /admin/' + s);
  assert.ok(read('functions/src/service.js').includes("req.path === '/admin/summary'"));
});

function recorder(seed) {
  const b = memoryBackend(seed), log = [];
  const a = b.adapter, wrapped = {
    get: (tx, p) => { log.push('get ' + p); return a.get(tx, p); },
    query: (tx, col, q) => { log.push('query ' + col); return a.query(tx, col, q); },
    count: (col, w) => { log.push('count ' + col); return a.count(col, w); },
    set: a.set, del: a.del
  };
  return { adapter: wrapped, log };
}
const SEED = {
  'requests/r1': { id: 'r1', no: 1001, customerId: 'c1', cat: 'electric', status: 'received', createdAt: '2026-01-01T00:00:00Z' },
  'customers/c1': { id: 'c1', name: 'c', phone: '01000000000', status: 'active' },
  'providers/p1': { id: 'p1', name: 'p', phone: '01100000000', status: 'approved', cats: ['electric'] },
  'complaints/r1': { id: 'r1', by: 'customer:c1', status: 'open' }, 'reviews/r1': { id: 'r1', providerId: 'p1' }, 'transactions/r1': { id: 'r1', reqId: 'r1' }
};
const ACTOR = { customer: { role: 'customer', id: 'c1' }, provider: { role: 'provider', id: 'p1' }, admin: { role: 'admin', id: 'a1', adminRole: 'owner' }, public: null };
const fill = (p) => p.replace(/:\w+/g, 'r1');
const runPlan = async (r) => {
  const rec = recorder(SEED), role = r.roles.find((x) => x !== 'public') || 'public';
  await plan(new PartialDb(rec.adapter, {}), { method: r.method, path: fill(r.path), query: {}, body: { cat: 'electric', phone: '01100000000', providerId: 'p1', reqId: 'r1' }, actor: ACTOR[role] });
  return rec.log.filter((l) => !/^get system\//.test(l));
};

test('plan-branch routes load records; settings-only and static routes read nothing beyond the system documents', async () => {
  for (const r of ROUTES) {
    const kind = classify(r), reads = await runPlan(r);
    const own = reads.filter((l) => !(l === 'get customers/c1' || l === 'get providers/p1'));   // the actor's own document
    if (kind === 'plan') assert.ok(reads.length > 0, sig(r) + ' loads nothing in plan.js');
    if (kind === 'settings' || kind === 'static') assert.deepEqual(own, [], sig(r) + ' reads records — move it to a plan branch');
  }
});

test('no server-native handler shadows a domain route by accident (only alerts.js serves /admin/alerts|tickets)', () => {
  const src = (f) => require(path.join(ROOT, 'functions/src', f));
  const native = { telemetry: src('telemetry.js').PATH_RE, digest: src('digest-admin.js').PATH_RE, agent: src('agent-gateway.js').PATH_RE,
    tech: src('tech-status.js').PATH_RE, alerts: ALERTS_RE, ai: src('ai.js').PATH_RE, content: src('content.js').PATH_RE,
    adminExtra: src('admin-extra.js').PATH_RE, workforce: /^\/admin\/(employees|rbac)(\/|$)/ };
  assert.ok(read('functions/src/service.js').includes(String(native.workforce)), 'workforce prefix in service.js changed — update this test');
  for (const r of ROUTES) {
    const p = r.path.replace(/:\w+/g, 'x');
    const hits = Object.entries(native).filter(([, re]) => re.test(p)).map(([k]) => k);
    assert.deepEqual(hits, classify(r) === 'alerts' ? ['alerts'] : [], sig(r) + ' is shadowed by ' + hits.join(', '));
  }
});

/* ───────── 2. the guide documents the wiring ───────── */
test('the maintenance guide lists every API route', () => {
  const missing = ROUTES.filter((r) => !GUIDE.includes('| ' + r.method + ' | `' + r.path + '` |')).map(sig);
  assert.deepEqual(missing, [], 'add these rows to docs/MAINTENANCE_GUIDE.md §2.1 (node scripts from the guide regenerate the table)');
});

test('every functions/index.js export is documented with its schedule', () => {
  const src = read('functions/index.js');
  const parts = src.split(/\nexports\./).slice(1);
  assert.ok(parts.length >= 7);
  for (const part of parts) {
    const name = part.match(/^(\w+)\s*=/)[1];
    assert.ok(GUIDE.includes('| `' + name + '` |'), 'functions export not in the guide: ' + name);
    const sch = part.split('\n')[0].match(/schedule:\s*'([^']+)'/);
    if (sch) assert.ok(GUIDE.includes(sch[1]), name + ' schedule «' + sch[1] + '» not in the guide');
  }
});

test('every session op is documented', () => {
  const src = read('functions/src/service.js');
  const body = src.slice(src.indexOf('async function session('), src.indexOf('async function importLocal('));
  const ops = [...body.matchAll(/case '(\w+)':/g)].map((m) => m[1]);
  assert.ok(ops.length >= 10);
  for (const op of ops) assert.ok(GUIDE.includes('| `' + op + '` |'), 'session op not in the guide: ' + op);
});

test('every env var / secret the functions read is documented (names only)', () => {
  const files = ['functions/index.js', ...fs.readdirSync(path.join(ROOT, 'functions/src')).map((f) => 'functions/src/' + f)];
  const names = new Set();
  for (const f of files) {
    const s = read(f);
    for (const m of s.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) names.add(m[1]);
    if (f.endsWith('mailer.js')) for (const m of s.matchAll(/'((?:SMTP|RESEND|MAIL)_[A-Z_]+)'/g)) names.add(m[1]);
  }
  assert.ok(names.size >= 10);
  for (const n of names) assert.ok(GUIDE.includes('`' + n + '`'), 'env var not in the guide: ' + n);
});

/* ───────── 3. Admin navigation → page file + permission ───────── */
test('every Admin nav page has a registered page file, a permission rule and a row in the guide', () => {
  const shell = require(path.join(ROOT, 'apps/admin/admin-shell.js'));
  const rbac = require(path.join(ROOT, 'apps/admin/rbac-store.js'));
  const guard = require(path.join(ROOT, 'apps/admin/permission-guard.js'));
  const OPEN = ['dashboard'];   // open to every signed-in employee on purpose (the work of the day)
  const scripts = [...read('apps/admin/index.html').matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]).filter((s) => /^(pages|modules)\//.test(s));
  const code = scripts.map((s) => read('apps/admin/' + s)).join('\n');
  const ids = shell.NAV.flatMap((g) => g.items.map((i) => i.id)).concat(Object.keys(shell._internals.HIDDEN_PAGES));
  for (const id of ids) {
    assert.ok(code.includes(`registerPage('${id}'`), 'no loaded page file registers #/' + id);
    const mod = guard.ROUTE_MODULE[id];
    const rule = guard.OWNER_ONLY.includes(id) || id === 'tech' || (mod && rbac.MODULES[mod]) || OPEN.includes(id);
    assert.ok(rule, '#/' + id + ' has no permission rule (ROUTE_MODULE / OWNER_ONLY / OPEN)');
    assert.ok(GUIDE.includes('`#/' + id + '`'), 'admin page not in the guide: #/' + id);
  }
  for (const m of Object.keys(rbac.MODULES)) assert.ok(GUIDE.includes('`' + m + '`'), 'RBAC module not in the guide: ' + m);
  for (const r of rbac.buildRoles()) assert.ok(GUIDE.includes('| `' + r.id + '` |'), 'RBAC preset not in the guide: ' + r.id);
});

/* ───────── 4. Firestore queries → indexes ───────── */
const CALL_RE = /\.(where|whereShared|query|count)\(|\bqueryDocs\(|(?<![\w.])q\(/g;
function closing(s, i) {
  let d = 0, q = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c) && --d === 0) return j;
  }
  return -1;
}
function splitTop(s) {
  const out = []; let d = 0, q = null, cur = '';
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (q) { cur += c; if (c === '\\') { cur += s[++j]; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) d++; if (')]}'.includes(c)) d--;
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const lit = (s) => { const m = /^'([\w.]+)'$/.exec(String(s || '').trim()); return m ? m[1] : null; };
const COL = (c) => (c === 'serviceRequests' ? 'requests' : c);   // store.js RENAME
const OPS = /\[\s*'([\w.]+)'\s*,\s*'(==|!=|not-in|in|array-contains-any|array-contains|<=|>=|<|>)'/g;
function filtersOf(arg) {
  if (arg == null || arg === '[]') return [];
  const pairs = [...arg.matchAll(OPS)].map((m) => [m[1], m[2]]);
  return pairs.length ? pairs : null;                                       // null → not literal
}
function orderOf(opts) {
  if (!opts) return null;
  const m = /orderBy:\s*\[\s*'(\w+)'\s*(?:,\s*'(asc|desc)')?/.exec(opts) || /pageOpts\([^,]+,\s*'\w+',\s*\[\s*'(\w+)'\s*,\s*'(asc|desc)'\s*\]/.exec(opts);
  return m ? [m[1], m[2] || 'asc'] : undefined;                            // undefined → no orderBy found
}
function objProps(obj) {
  const inner = String(obj || '').trim().replace(/^\{|\}$/g, '');
  const props = {}; for (const p of splitTop(inner)) { const i = p.indexOf(':'); props[i < 0 ? p.trim() : p.slice(0, i).trim()] = i < 0 ? null : p.slice(i + 1).trim(); }
  return props;
}
/** Call sites whose shape is not literal: their real shapes (or [] for generic pass-through adapters fed by the callers above). */
const KNOWN = [
  { file: 'partial.js', snippet: 'colName(key)', shapes: [] }, { file: 'partial.js', snippet: 'key, filters', shapes: [] },
  { file: 'partial.js', snippet: "f === 'id'", shapes: [] }, { file: 'usage.js', snippet: 'col, q', shapes: [] }, { file: 'usage.js', snippet: 'col, where', shapes: [] },
  { file: 'service.js', snippet: 'col, field, op, value', shapes: [] },                                     // the header comment
  { file: 'plan.js', snippet: "k, [['_u', '>', since]]", shapes: ['requests', 'assignments', 'quotes', 'customers', 'providers', 'complaints', 'transactions', 'reviews'].map((col) => ({ col, where: [['_u', '>']], orderBy: ['_u', 'asc'] })) },
  { file: 'plan.js', snippet: "'complaints', f,", shapes: [[], [['by', '==']], [['status', '==']], [['by', '=='], ['status', '==']]].map((where) => ({ col: 'complaints', where, orderBy: ['at', 'desc'] })) },
  { file: 'admin-extra.js', snippet: 'tx, col, { where, limit: BROADCAST_MAX }', shapes: [{ col: 'customers', where: [['status', '==']] }, { col: 'providers', where: [['status', '==']] }] },
  { file: 'alerts.js', snippet: 'where: [where]', shapes: [{ col: 'opsAlerts', where: [['status', 'in']] }, { col: 'opsAlerts', where: [['resolvedAt', '>=']] }, { col: 'opsTickets', where: [['status', 'in']] }, { col: 'opsTickets', where: [['doneAt', '>=']] }] },
  { file: 'digest.js', snippet: "range('createdAt')", range: 'createdAt' }, { file: 'digest.js', snippet: "range('at')", range: 'at' }
];
function queryShapes() {
  const shapes = [], used = new Set(), dir = path.join(ROOT, 'functions/src');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of s.matchAll(CALL_RE)) {
      const open = m.index + m[0].length - 1, text = s.slice(open + 1, closing(s, open)).replace(/\s+/g, ' ').trim();
      if (!text) continue;                                                     // e.g. `.count().get()` inside the adapter
      const at = file + ':' + s.slice(0, m.index).split('\n').length;
      const args = splitTop(text);
      let col, where, orderBy;
      if (m[0] === 'queryDocs(') { col = lit(args[0]); const f = lit(args[1]), op = /^'([^']+)'$/.exec(args[2] || ''); where = f && op ? [[f, op[1]]] : null; orderBy = null; }
      else if (m[0] === '.query(' || /q\($/.test(m[0])) {
        const obj = m[0] === '.query(' ? args[2] : args[1]; col = lit(m[0] === '.query(' ? args[1] : args[0]);
        const props = objProps(obj);
        where = 'where' in props ? (props.where === null ? null : filtersOf(props.where)) : [];
        orderBy = orderOf(obj); if (orderBy === undefined) orderBy = null;
      } else { col = lit(args[0]); where = filtersOf(args[1]); orderBy = orderOf(args[2]); if (orderBy === undefined) orderBy = args[2] && /^[\w.]+$/.test(args[2]) ? 'unknown' : null; }
      const known = KNOWN.find((k) => k.file === file && text.includes(k.snippet));
      if (known) {
        used.add(known);
        if (known.range) shapes.push({ at, col: COL(col), where: [[known.range, '>='], [known.range, '<']], orderBy: null });
        else for (const sh of known.shapes) shapes.push({ at, col: COL(sh.col), where: sh.where, orderBy: sh.orderBy || null });
        continue;
      }
      assert.ok(col && where && orderBy !== 'unknown', `${at}: query shape is not literal — add it to KNOWN in this test: ${text.slice(0, 120)}`);
      shapes.push({ at, col: COL(col), where, orderBy });
    }
  }
  for (const k of KNOWN) assert.ok(used.has(k), 'stale KNOWN entry (call site gone): ' + k.file + ' ' + k.snippet);
  return shapes;
}
const INEQ = ['<', '<=', '>', '>=', '!=', 'not-in'];
function needsComposite({ where, orderBy }) {
  const fields = new Set(where.map((w) => w[0]).filter((f) => f !== 'id'));
  const ineq = new Set(where.filter((w) => INEQ.includes(w[1])).map((w) => w[0]));
  if (orderBy && [...fields].some((f) => f !== orderBy[0])) return true;
  if (ineq.size && [...fields].some((f) => !ineq.has(f))) return true;
  if (where.some((w) => w[1].startsWith('array-contains')) && fields.size > 1) return true;
  return false;
}
function hasIndex(shape, indexes) {
  const fields = new Set(shape.where.map((w) => w[0]));
  const last = shape.orderBy ? shape.orderBy[0] : shape.where.find((w) => INEQ.includes(w[1]))?.[0];
  if (last) fields.add(last);
  return indexes.some((ix) => {
    if (ix.collectionGroup !== shape.col || ix.fields.length !== fields.size) return false;
    if (!ix.fields.every((f) => fields.has(f.fieldPath))) return false;
    if (last && ix.fields[ix.fields.length - 1].fieldPath !== last) return false;
    return shape.where.filter((w) => w[1].startsWith('array-contains')).every((w) => ix.fields.find((f) => f.fieldPath === w[0]).arrayConfig === 'CONTAINS');
  });
}

test('the query scanner understands every Firestore call site in functions/src', () => {
  const shapes = queryShapes();
  assert.ok(shapes.length >= 100, 'expected the full set of query shapes, got ' + shapes.length);
  assert.ok(shapes.some((s) => s.col === 'requests' && s.orderBy && s.orderBy[0] === 'createdAt'));
  assert.ok(shapes.filter(needsComposite).length >= 15, 'the composite-needing shapes were not recognised');
});

test('every Firestore query in functions/src has a composite index or is single-field', () => {
  const { indexes } = JSON.parse(read('firestore.indexes.json'));
  const missing = queryShapes().filter((s) => needsComposite(s) && !hasIndex(s, indexes))
    .map((s) => `${s.at} ${s.col} where ${JSON.stringify(s.where)} orderBy ${JSON.stringify(s.orderBy)}`);
  assert.deepEqual(missing, [], 'add composite indexes to firestore.indexes.json (then deploy --only firestore:indexes)');
});

test('the index checker itself: composite needs are detected', () => {
  assert.equal(needsComposite({ where: [['status', '==']], orderBy: ['createdAt', 'desc'] }), true);
  assert.equal(needsComposite({ where: [['customerId', '=='], ['status', 'in']], orderBy: null }), false);
  assert.equal(needsComposite({ where: [['to', '=='], ['_u', '>']], orderBy: ['_u', 'asc'] }), true);
  assert.equal(needsComposite({ where: [['_u', '>']], orderBy: ['_u', 'asc'] }), false);
  assert.equal(needsComposite({ where: [['status', '=='], ['cats', 'array-contains']], orderBy: null }), true);
  assert.equal(hasIndex({ col: 'nowhere', where: [['a', '==']], orderBy: ['b', 'asc'] }, []), false);
});

/* ───────── service.js helper parity (refactor 2026-11-25: identical envelopes) ───────── */
test('service.js «admin only» envelope is unchanged: 401 without identity, 403 with the wrong one', async () => {
  const service = require(path.join(ROOT, 'functions/src/service.js'));
  assert.deepEqual(service._adminOnly(false), { ok: false, status: 401, error: { code: 'UNAUTHENTICATED', message: 'admin only' } });
  assert.deepEqual(service._adminOnly(true), { ok: false, status: 403, error: { code: 'FORBIDDEN', message: 'admin only' } });
  const b = memoryBackend({});
  const anon = await service.api(b, { auth: null, data: { app: 'admin', method: 'GET', path: '/admin/alerts' }, ip: '1.1.1.1' });
  assert.deepEqual(anon, service._adminOnly(false));
  const cust = await service.api(b, { auth: { uid: 'u1', token: {} }, data: { app: 'admin', method: 'GET', path: '/admin/tickets' }, ip: '1.1.1.1' });
  assert.deepEqual(cust, service._adminOnly(true));
  const ai = await service.api(b, { auth: null, data: { app: 'admin', method: 'GET', path: '/admin/ai' }, ip: '1.1.1.1' });
  assert.deepEqual(ai, service._adminOnly(false));
  const dg = await service.api(b, { auth: { uid: 'u1', token: {} }, data: { app: 'admin', method: 'GET', path: '/admin/digest/me' }, ip: '1.1.1.1' });
  assert.deepEqual(dg, service._adminOnly(true));
});
