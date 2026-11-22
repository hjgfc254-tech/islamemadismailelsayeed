/**
 * MODULE: rbac-store (HSAdminRbac)
 * RESPONSIBILITY: Shared DEMO data + pure logic for the admin roles, permissions and employee-details pages: permission catalog
 *   (module × action), roles with optional single inheritance, a static roster copy, per-employee extra permissions, an in-memory audit
 *   list, and the rules "no inheritance cycles", "review impact before saving" and "never grant above the acting user's own authority".
 * STATUS: IMPLEMENTED (DEMO). NEW file (not in the original inventory). In memory only. NOTHING HERE ENFORCES ACCESS: it only models and
 *   displays a policy; the pages say so. The roster is a static copy of the workforce page fixtures (a test checks they match); it is
 *   NOT live-linked to the workforce page.
 * Pure functions take their data as arguments and never mutate it; the mutable demo state lives only in HSAdminRbac.state / reset().
 */
'use strict';
(function (root) {
  const MODULES = { orders: 'الطلبات', customers: 'العملاء', providers: 'مقدمو الخدمة', services: 'الخدمات', categories: 'التصنيفات', complaints: 'الشكاوى', reviews: 'التقييمات',
    notifications: 'الإشعارات', workforce: 'فريق العمل', departments: 'الإدارات', roles: 'الأدوار', permissions: 'الصلاحيات',
    /* teams release (2026-11-22): money, offers/content, the privacy line, the tech centre, alerts and internal tickets */
    finance: 'المالية', marketing: 'العروض والمحتوى', pii: 'بيانات العملاء الشخصية', tech: 'التقنية', alerts: 'التنبيهات', tickets: 'البلاغات' };
  /* modules added after the first catalogue: stored catalogues (production) get them through mergePresets() */
  const NEW_MODULES = ['finance', 'marketing', 'pii', 'tech', 'alerts', 'tickets'];
  const ACTIONS = { view: 'عرض', create: 'إضافة', edit: 'تعديل', decide: 'قرار/تغيير حالة' };
  const DEPARTMENTS = { ops: 'العمليات', support: 'الدعم', finance: 'المالية', content: 'المحتوى', tech: 'التقنية', exec: 'الإدارة العليا' };
  const STATUS_LABEL = { active: 'مفعّل', invited: 'دعوة معلّقة', disabled: 'معطّل' };
  const LIMITS = { name: 40, description: 120 };
  const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
  const key = (m, a) => m + '.' + a;
  const ALL_KEYS = Object.keys(MODULES).reduce((acc, m) => acc.concat(Object.keys(ACTIONS).map((a) => key(m, a))), []);
  const isKey = (k) => ALL_KEYS.includes(k);
  const keyLabel = (k) => { const [m, a] = String(k).split('.'); return (MODULES[m] || m) + ' — ' + (ACTIONS[a] || a); };
  const uniq = (a) => Array.from(new Set(a));
  const sortKeys = (a) => uniq(a).sort((x, y) => ALL_KEYS.indexOf(x) - ALL_KEYS.indexOf(y));
  const GUARD = 50;

  /* ───── Fixtures (demo) ───── */
  const NAMES = ['سامي عبد الله', 'ريم حامد', 'طارق منصور', 'دينا يوسف', 'عمر شاكر', 'لمى ناصر', 'بسام قاسم', 'نهى فؤاد', 'زياد حمدي', 'مروة سعد', 'إياد رفعت', 'ليلى جابر'];
  const buildRoles = () => {
    const v = (...ms) => ms.map((m) => key(m, 'view'));
    const all = (ms, as) => ms.reduce((a, m) => a.concat(as.map((x) => key(m, x))), []);
    const ops = ['orders', 'customers', 'providers', 'services', 'categories', 'complaints', 'reviews', 'notifications'];
    const FOUR = ['view', 'create', 'edit', 'decide'];
    const work = [key('alerts', 'view'), key('alerts', 'decide'), key('tickets', 'view'), key('tickets', 'create'), key('tickets', 'edit')];   // every team: see its alerts, claim / resolve them, use tickets
    return [
      { id: 'owner', name: 'المالك', description: 'صلاحيات كاملة (دور نظام محمي).', inherits: null, system: true, permissions: ALL_KEYS.slice() },
      { id: 'admin', name: 'مدير', description: 'إدارة التشغيل والمحتوى والمالية مع عرض الفريق.', inherits: null, system: false,
        permissions: sortKeys(all(ops, FOUR).concat(all(['workforce'], ['view', 'create', 'edit']), [key('departments', 'view'), key('departments', 'edit')], v('roles', 'permissions', 'pii'), all(['finance', 'marketing', 'alerts', 'tickets'], FOUR))) },
      { id: 'support', name: 'دعم فني', description: 'متابعة العملاء والشكاوى.', inherits: null, system: false,
        permissions: sortKeys(v('orders', 'customers', 'providers', 'complaints', 'reviews', 'pii').concat([key('complaints', 'edit'), key('complaints', 'decide')], work)) },
      { id: 'finance', name: 'المالية', description: 'العمولات والتسويات والتحصيل — أرقام التليفونات والعناوين مخفية.', inherits: null, system: false, permissions: sortKeys(v('orders', 'customers', 'providers', 'services').concat(all(['finance'], FOUR), work)) },
      { id: 'moderator', name: 'مراقب محتوى', description: 'يرث الدعم الفني ويضيف إشراف التقييمات.', inherits: 'support', system: false,
        permissions: sortKeys([key('reviews', 'edit'), key('reviews', 'decide'), key('categories', 'view'), key('services', 'view'), key('notifications', 'view')]) },
      /* team presets (2026-11-22) — the owner + 4 staff: عمليات ودعم · المالية · المحتوى والأسعار · التقنية */
      { id: 'ops', name: 'عمليات ودعم', description: 'الطلبات، واعتماد مقدمي الخدمة وإسنادهم، والشكاوى، وإشراف التقييمات.', inherits: null, system: false,
        permissions: sortKeys(all(['orders', 'customers', 'providers', 'complaints', 'reviews'], FOUR).concat(v('services', 'categories', 'notifications', 'pii'), work)) },
      { id: 'content', name: 'المحتوى والأسعار', description: 'الكتالوج والأسعار والعروض والإشعارات الجماعية ومحتوى الواجهة — بدون بيانات عملاء شخصية.', inherits: null, system: false,
        permissions: sortKeys(all(['services', 'categories', 'marketing', 'notifications'], FOUR).concat(v('reviews'), work)) },
      { id: 'tech', name: 'التقنية', description: 'حالة النظام والأخطاء والتكلفة — بدون أي بيانات عملاء أو مقدمي خدمة أو طلبات (مفروض من السيرفر).', inherits: null, system: false,
        permissions: sortKeys(all(['tech'], FOUR).concat(work)) }
    ];
  };
  const buildRoster = () => [['exec', 'owner', 'active'], ['ops', 'admin', 'active'], ['support', 'support', 'active'], ['finance', 'finance', 'active'], ['content', 'moderator', 'active'], ['support', 'support', 'invited'],
    ['ops', 'admin', 'disabled'], ['finance', 'finance', 'invited'], ['content', 'moderator', 'active'], ['support', 'support', 'disabled'], ['ops', 'support', 'active'], ['exec', 'admin', 'active']]
    .map(([department, role, status], i) => ({ id: 'e' + (9001 + i), name: NAMES[i], email: 'staff' + String(i + 1).padStart(2, '0') + '@example.test', department, role, status }));

  /* ───── Pure logic ───── */
  const roleById = (roles, id) => roles.find((r) => r.id === id) || null;
  const chain = (roles, id) => { const out = []; let c = roleById(roles, id), g = 0; while (c && g++ < GUARD && !out.includes(c.id)) { out.push(c.id); c = c.inherits ? roleById(roles, c.inherits) : null; } return out; };
  /** All permissions a role has: its own plus everything inherited along its chain. */
  const effective = (roles, id) => (id === 'owner' ? ALL_KEYS.slice() : sortKeys(chain(roles, id).reduce((a, rid) => a.concat(roleById(roles, rid).permissions), [])));   /* the owner always holds the whole catalogue, even a stored one from before new modules existed */
  /** Permissions that come ONLY from ancestors (shown as «موروثة»). */
  const inherited = (roles, id) => { const r = roleById(roles, id); return r && r.inherits ? effective(roles, r.inherits) : []; };
  const descendants = (roles, id) => { const out = []; const walk = (p, n) => { if (n > GUARD) return; roles.filter((r) => r.inherits === p).forEach((r) => { if (r.id !== id && !out.includes(r.id)) { out.push(r.id); walk(r.id, n + 1); } }); }; walk(id, 0); return out; };
  /** Roles `id` may inherit from: never itself or its own descendants (cycle). id=null → a new role. */
  const validParents = (roles, id) => { const banned = id ? [id].concat(descendants(roles, id)) : []; return roles.filter((r) => !banned.includes(r.id)); };
  const roleEmployees = (roster, roleId) => roster.filter((e) => e.role === roleId);
  const clean = (f) => { const g = (k) => String((f && f[k]) == null ? '' : f[k]); return { name: g('name').replace(/\s+/g, ' ').trim(), description: g('description').trim(), inherits: f && f.inherits ? String(f.inherits) : null, permissions: sortKeys(Array.isArray(f && f.permissions) ? f.permissions.map(String) : []) }; };
  const validateRole = (fields, roles, selfId) => {
    const v = clean(fields), errors = {};
    if (!v.name) errors.name = 'اكتب اسم الدور.'; else if (v.name.length < 2) errors.name = 'اسم الدور قصير جدًا.'; else if (v.name.length > LIMITS.name) errors.name = 'اسم الدور أطول من ' + LIMITS.name + ' حرفًا.';
    else if (roles.some((r) => r.id !== selfId && norm(r.name) === norm(v.name))) errors.name = 'يوجد دور بنفس الاسم.';
    if (v.description.length > LIMITS.description) errors.description = 'الوصف أطول من ' + LIMITS.description + ' حرفًا.';
    if (v.inherits && !validParents(roles, selfId || null).some((r) => r.id === v.inherits)) errors.inherits = 'لا يمكن الوراثة من هذا الدور (دورة وراثة).';
    if (v.permissions.some((k) => !isKey(k))) errors.permissions = 'توجد صلاحية غير معروفة.';
    return { ok: !Object.keys(errors).length, errors, value: v };
  };
  const heldBy = (roles, actorRoleId) => new Set(effective(roles, actorRoleId));
  /** Keys in `keys` the acting role does NOT hold itself — the «no grant above your own authority» rule. */
  const grantViolations = (roles, actorRoleId, keys) => { const h = heldBy(roles, actorRoleId); return sortKeys(keys.filter((k) => !h.has(k))); };
  const fail = (msg, errors) => { const e = new RangeError(msg); e.errors = errors || {}; return e; };
  const nextRoleId = (roles) => 'r' + (Math.max(0, ...roles.map((r) => (/^r\d+$/.test(r.id) ? Number(r.id.slice(1)) : 0))) + 1);
  const gained = (before, after) => after.filter((k) => !before.includes(k));
  const lost = (before, after) => before.filter((k) => !after.includes(k));
  /** What saving would change: for the role and every role inheriting from it — added/removed effective permissions and employees affected. */
  const impact = (roles, roster, roleId, fields) => {
    const v = clean(fields), isNew = !roleId;
    const after = isNew ? roles.concat([{ id: '__new__', name: v.name || 'دور جديد', description: v.description, inherits: v.inherits, system: false, permissions: v.permissions }])
      : roles.map((r) => (r.id === roleId ? Object.assign({}, r, { name: v.name, description: v.description, inherits: v.inherits, permissions: v.permissions }) : r));
    const ids = isNew ? ['__new__'] : [roleId].concat(descendants(after, roleId));
    const perRole = ids.map((id) => {
      const b = isNew ? [] : effective(roles, id), a = effective(after, id), r = roleById(after, id);
      return { id: id === '__new__' ? null : id, name: r.name, added: gained(b, a), removed: lost(b, a), employees: id === '__new__' ? 0 : roleEmployees(roster, id).length };
    });
    return { perRole, employees: perRole.reduce((s, r) => s + r.employees, 0), added: perRole.reduce((s, r) => s + r.added.length, 0), removed: perRole.reduce((s, r) => s + r.removed.length, 0), changed: perRole.some((r) => r.added.length || r.removed.length) };
  };
  const createRole = (roles, actorRoleId, fields) => {
    const r = validateRole(fields, roles); if (!r.ok) throw fail('Invalid role', r.errors);
    const tmp = roles.concat([{ id: '__new__', name: r.value.name, inherits: r.value.inherits, permissions: r.value.permissions, system: false }]);
    const viol = grantViolations(roles, actorRoleId, effective(tmp, '__new__')); if (viol.length) throw fail('Exceeds authority', { permissions: 'لا يمكنك منح صلاحيات خارج سلطتك: ' + viol.map(keyLabel).join('، ') });
    return roles.concat([{ id: nextRoleId(roles), name: r.value.name, description: r.value.description, inherits: r.value.inherits, system: false, permissions: r.value.permissions }]);
  };
  const updateRole = (roles, actorRoleId, id, fields) => {
    const cur = roleById(roles, id); if (!cur) throw new RangeError('Unknown role: ' + id);
    if (cur.system) throw new RangeError('System role');
    const r = validateRole(fields, roles, id); if (!r.ok) throw fail('Invalid role', r.errors);
    const out = roles.map((x) => (x.id === id ? Object.assign({}, x, { name: r.value.name, description: r.value.description, inherits: r.value.inherits, permissions: r.value.permissions }) : x));
    const viol = grantViolations(roles, actorRoleId, gained(effective(roles, id), effective(out, id))); if (viol.length) throw fail('Exceeds authority', { permissions: 'لا يمكنك منح صلاحيات خارج سلطتك: ' + viol.map(keyLabel).join('، ') });
    return out;
  };
  const employeeEffective = (roles, overrides, emp) => sortKeys(effective(roles, emp.role).concat((overrides && overrides[emp.id]) || []));
  /** Replace an employee's EXTRA permissions. Newly added keys must be held by the acting role; keys already covered by the role are rejected (no redundant grants). */
  const setOverrides = (roles, overrides, roster, actorRoleId, empId, keys) => {
    const emp = roster.find((e) => e.id === empId); if (!emp) throw new RangeError('Unknown employee: ' + empId);
    const ks = sortKeys(keys.map(String)); if (ks.some((k) => !isKey(k))) throw fail('Invalid keys', { permissions: 'توجد صلاحية غير معروفة.' });
    const roleHas = new Set(effective(roles, emp.role)); if (ks.some((k) => roleHas.has(k))) throw fail('Redundant', { permissions: 'بعض الصلاحيات ممنوحة أصلًا عبر الدور.' });
    const prev = (overrides && overrides[empId]) || [], viol = grantViolations(roles, actorRoleId, gained(prev, ks));
    if (viol.length) throw fail('Exceeds authority', { permissions: 'لا يمكنك منح صلاحيات خارج سلطتك: ' + viol.map(keyLabel).join('، ') });
    if (!gained(prev, ks).length && !lost(prev, ks).length) throw new RangeError('No change');
    return Object.assign({}, overrides, { [empId]: ks });
  };
  const isLastActiveOwner = (roster, empId) => { const a = roster.filter((e) => e.role === 'owner' && e.status === 'active'); return a.length === 1 && a[0].id === empId; };
  /** Change an employee's role/department. Blocked when the target's authority exceeds the actor's, when the new role exceeds it, or for the last active owner. */
  const changeEmployee = (roles, roster, actorRoleId, empId, fields) => {
    const emp = roster.find((e) => e.id === empId); if (!emp) throw new RangeError('Unknown employee: ' + empId);
    const role = String((fields && fields.role) || ''), dep = String((fields && fields.department) || ''), errors = {};
    if (!roleById(roles, role)) errors.role = 'اختر دورًا من القائمة.'; if (!DEPARTMENTS[dep]) errors.department = 'اختر إدارة من القائمة.';
    if (Object.keys(errors).length) throw fail('Invalid employee', errors);
    if (emp.role === role && emp.department === dep) throw new RangeError('No change');
    if (grantViolations(roles, actorRoleId, effective(roles, emp.role)).length) throw fail('Target above authority', { role: 'لا يمكنك تعديل موظف سلطته أعلى من سلطتك.' });
    if (emp.role !== role && grantViolations(roles, actorRoleId, effective(roles, role)).length) throw fail('Exceeds authority', { role: 'لا يمكنك إسناد دور سلطته أعلى من سلطتك.' });
    if (emp.role !== role && isLastActiveOwner(roster, empId)) throw fail('Last owner', { role: 'لا يمكن تغيير دور آخر مالك مفعّل (قاعدة تجريبية).' });
    return roster.map((e) => (e.id === empId ? Object.assign({}, e, { role, department: dep }) : e));
  };

  /* ───── Mutable demo state (in memory only) ───── */
  const state = { roles: buildRoles(), roster: buildRoster(), overrides: {}, audit: [], actor: 'admin', selectedEmployee: null };
  const reset = () => { state.roles = buildRoles(); state.roster = buildRoster(); state.overrides = {}; state.audit = []; state.actor = 'admin'; state.selectedEmployee = null; };
  const addAudit = (subject, text, at) => { state.audit = state.audit.concat([{ subject, text, at: at || new Date().toISOString(), actor: state.actor }]); };
  const auditFor = (subject) => state.audit.filter((a) => a.subject === subject);

  /* ───── Rank: the riskier the action, the higher the rank it needs (owner request 2026-11-20) ─────
     1 دعم · 2 مشرف (مالية / مراقب محتوى) · 3 مدير · 4 المالك. A custom role may declare `level`; otherwise it takes the
     highest level along its inheritance chain, and never more than 3 (only the owner role is 4). */
  const LEVELS = { 1: 'دعم', 2: 'مشرف', 3: 'مدير', 4: 'المالك' };
  const ROLE_LEVEL = { owner: 4, admin: 3, content: 3, ops: 2, finance: 2, moderator: 2, support: 1, tech: 1 };
  const RISK = Object.freeze({
    'complaints.resolve': 1, 'requests.assign': 1,
    'providers.warn': 2, 'providers.approve': 2, 'providers.reject': 2, 'reviews.hide': 2, 'finance.collection': 2,
    'providers.suspend': 3, 'customers.suspend': 3, 'marketing.edit': 3, 'notifications.broadcast': 3,
    'providers.rate': 4, 'finance.commission': 4, 'finance.pricing': 4,
    'alerts.claim': 1, 'alerts.resolve': 1, 'tickets.create': 1, 'tickets.assign': 2
  });
  const RISK_LABEL = { 'complaints.resolve': 'حل شكوى', 'requests.assign': 'إسناد طلب يدويًا', 'providers.warn': 'إنذار مقدم خدمة', 'providers.approve': 'قبول مقدم خدمة',
    'providers.reject': 'رفض مقدم خدمة', 'reviews.hide': 'إخفاء تقييم', 'finance.collection': 'تسجيل تحصيل عمولة', 'providers.suspend': 'تعليق مقدم خدمة',
    'customers.suspend': 'إيقاف عميل', 'marketing.edit': 'العروض والخصومات', 'notifications.broadcast': 'إشعار جماعي', 'providers.rate': 'نسبة خاصة لمقدم خدمة',
    'finance.commission': 'نسبة العمولة', 'finance.pricing': 'أسعار الخدمات',
    'alerts.claim': 'استلام تنبيه', 'alerts.resolve': 'إغلاق تنبيه', 'tickets.create': 'فتح بلاغ', 'tickets.assign': 'إسناد بلاغ لزميل' };
  function levelOf(roles, roleId) {
    if (roleId === 'owner') return 4;
    let best = 0;
    for (const id of chain(roles, roleId)) { const r = roleById(roles, id); best = Math.max(best, r && +r.level ? +r.level : (ROLE_LEVEL[id] || 1)); }
    return Math.min(3, best || 1);
  }
  const riskNeed = (k) => RISK[k] || 1;

  /** A stored catalogue (production `system/rbac`) predates newer presets/modules. Adds missing preset roles, gives the owner the
      whole catalogue and, ONCE per stored preset role (marker catalogV), the permissions of the modules added since. */
  const mergePresets = (roles) => {
    const fresh = buildRoles(), list = (Array.isArray(roles) ? roles : []).map((r) => Object.assign({}, r, { permissions: (r.permissions || []).slice() }));
    for (const p of fresh) {
      const cur = list.find((r) => r.id === p.id);
      if (!cur) { list.push(Object.assign({}, p, { catalogV: 2 })); continue; }
      if (p.id === 'owner') { cur.permissions = ALL_KEYS.slice(); cur.catalogV = 2; continue; }
      if (!cur.catalogV) { cur.permissions = sortKeys(cur.permissions.concat(p.permissions.filter((k) => NEW_MODULES.includes(k.split('.')[0])))); cur.catalogV = 2; }
    }
    return list;
  };

  const api = { mergePresets, NEW_MODULES, LEVELS, ROLE_LEVEL, RISK, RISK_LABEL, levelOf, riskNeed, MODULES, ACTIONS, DEPARTMENTS, STATUS_LABEL, LIMITS, ALL_KEYS, key, keyLabel, isKey, sortKeys, buildRoles, buildRoster, roleById, chain, effective, inherited, descendants, validParents, roleEmployees,
    validateRole, grantViolations, impact, createRole, updateRole, employeeEffective, setOverrides, isLastActiveOwner, changeEmployee, state, reset, addAudit, auditFor };
  root.HSAdminRbac = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
