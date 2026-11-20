/**
 * Admin server routes that have no counterpart in the app's domain layer (server-native, like workforce.js):
 *   GET  /admin/audit                         audit log (admins' log), newest first            owner only
 *   GET  /admin/settings                      operational settings (autoAssign, customerFee, collectionModel, markupRate, defaultRate)
 *   POST /admin/settings                      {autoAssign?:bool, customerFee?:bool}             owner | admin role
 *   GET  /admin/departments                   departments                                       RBAC departments.view
 *   POST /admin/departments                   {name, parentId?}                                 RBAC departments.create|edit
 *   PATCH /admin/departments/:id              {name?, parentId?, status?, headId?}              RBAC departments.edit
 *   GET  /admin/security/admins               admin accounts + last sign-in (Auth)              owner | admin role
 *   POST /admin/security/reset-code/:uid      clear an admin's 8-digit access code (set again at next sign-in)  owner only, never self
 *   POST /admin/security/revoke/:uid          revoke refresh tokens (sign out everywhere)       owner only, never self
 *   GET  /admin/notifications/broadcasts      in-app broadcast history                          RBAC notifications.view
 *   POST /admin/notifications/broadcast       {audience: customers|providers, text}             RBAC notifications.create
 * Every mutation is audited by the caller (service.js) and runs inside its transaction.
 */
'use strict';
const workforce = require('./workforce');

const DEPT_NAME_MAX = 50, DEPT_MAX_DEPTH = 3, BROADCAST_MAX = 500, TEXT_MAX = 500;
const env = (status, code, message, details) => ({ ok: false, status, error: details ? { code, message, details } : { code, message } });
const okEnv = (data, status = 200) => ({ ok: true, status, data });
const deny = () => env(403, 'FORBIDDEN', 'ليست لديك صلاحية لهذا الإجراء');
const isRole = (admin, ...roles) => !!admin && roles.includes(admin.role);

async function can(adapter, tx, admin, module, action) {
  if (isRole(admin, 'owner')) return true;
  const st = await workforce.loadState(adapter, tx);
  const R = require('./runtime').createContext(null, [], st.rbac || null).ctx.HSAdminRbac;
  const me = { id: admin.employeeId || '-', role: admin.role };
  return R.employeeEffective(R.state.roles, R.state.overrides || {}, me).includes(module + '.' + action);
}

async function handle({ backend, tx, method, path, query, body, admin, token }) {
  const a = backend.adapter;
  const seg = path.split('/').filter(Boolean);   // ['admin', area, ...]
  const area = seg[1];

  if (area === 'audit' && method === 'GET') {
    if (!isRole(admin, 'owner')) return deny();   /* «سجل الإداريين» is the owner's view (2026-11-20) */
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
    const rows = await a.query(tx, 'audit', { orderBy: ['at', 'desc'], limit });
    return okEnv({ items: rows.map((r) => ({ id: r.id, ...r.data })) });
  }

  if (area === 'settings') {
    if (!isRole(admin, 'owner', 'admin')) return deny();
    const cur = (await a.get(tx, 'system/settings')) || {};
    const view = (s) => ({ autoAssign: s.autoAssign !== false, customerFee: !!s.customerFee, collectionModel: s.collectionModel || 'platform', markupRate: s.markupRate != null ? s.markupRate : s.defaultRate, defaultRate: s.defaultRate });
    if (method === 'GET') return okEnv(view(cur));
    if (method === 'POST') {
      const next = { ...cur };
      for (const k of ['autoAssign', 'customerFee']) {
        if (body[k] === undefined) continue;
        if (typeof body[k] !== 'boolean') return env(422, 'VALIDATION', 'قيمة غير صالحة', { [k]: 'boolean' });
        next[k] = body[k];
      }
      a.set(tx, 'system/settings', next);
      return okEnv(view(next));
    }
  }

  if (area === 'departments') {
    const list = (await a.query(tx, 'departments', { limit: 200 })).map((r) => r.data);
    if (method === 'GET') return (await can(a, tx, admin, 'departments', 'view')) ? okEnv({ items: list }) : deny();
    const depth = (id) => { let d = 0, cur = list.find((x) => x.id === id); while (cur) { d++; cur = cur.parentId ? list.find((x) => x.id === cur.parentId) : null; } return d; };
    const validName = (n) => typeof n === 'string' && n.trim().length >= 2 && n.trim().length <= DEPT_NAME_MAX;
    if (method === 'POST' && seg.length === 2) {
      if (!(await can(a, tx, admin, 'departments', 'edit'))) return deny();
      if (!validName(body.name)) return env(422, 'VALIDATION', 'اسم الإدارة مطلوب (2–50 حرفًا)', { name: '2–50' });
      const parentId = body.parentId || null;
      if (parentId && !list.some((x) => x.id === parentId)) return env(422, 'VALIDATION', 'الإدارة الأم غير موجودة', { parentId: 'unknown' });
      if (parentId && depth(parentId) >= DEPT_MAX_DEPTH) return env(422, 'VALIDATION', 'تجاوز الحد الأقصى للعمق', { parentId: 'depth' });
      if (list.some((x) => x.name === body.name.trim() && (x.parentId || null) === parentId)) return env(422, 'VALIDATION', 'الاسم مستخدم في نفس المستوى', { name: 'duplicate' });
      const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const doc = { id, name: body.name.trim(), parentId, status: 'active', headId: null, order: list.filter((x) => (x.parentId || null) === parentId).length + 1, createdAt: new Date().toISOString() };
      a.set(tx, `departments/${id}`, doc);
      return okEnv(doc, 201);
    }
    if (method === 'PATCH' && seg[2]) {
      if (!(await can(a, tx, admin, 'departments', 'edit'))) return deny();
      const cur = list.find((x) => x.id === seg[2]); if (!cur) return env(404, 'NOT_FOUND', 'الإدارة غير موجودة');
      const next = { ...cur };
      if (body.name !== undefined) { if (!validName(body.name)) return env(422, 'VALIDATION', 'اسم الإدارة مطلوب (2–50 حرفًا)', { name: '2–50' }); next.name = body.name.trim(); }
      if (body.status !== undefined) { if (!['active', 'inactive'].includes(body.status)) return env(422, 'VALIDATION', 'حالة غير صالحة', { status: 'active|inactive' }); next.status = body.status; }
      if (body.parentId !== undefined) {
        const p = body.parentId || null;
        if (p === cur.id) return env(422, 'VALIDATION', 'لا يمكن جعل الإدارة أمًا لنفسها', { parentId: 'self' });
        if (p && !list.some((x) => x.id === p)) return env(422, 'VALIDATION', 'الإدارة الأم غير موجودة', { parentId: 'unknown' });
        let up = p && list.find((x) => x.id === p); while (up) { if (up.id === cur.id) return env(422, 'VALIDATION', 'نقل يسبب حلقة', { parentId: 'cycle' }); up = up.parentId ? list.find((x) => x.id === up.parentId) : null; }
        next.parentId = p;
      }
      if (body.headId !== undefined) {
        const emps = (await workforce.loadState(a, tx)).employees;
        if (body.headId && !emps.some((e) => e.id === body.headId && e.status === 'active')) return env(422, 'VALIDATION', 'الموظف غير موجود أو غير مفعّل', { headId: 'unknown' });
        next.headId = body.headId || null;
      }
      a.set(tx, `departments/${cur.id}`, next);
      return okEnv(next);
    }
  }

  if (area === 'security') {
    if (seg[2] === 'admins' && method === 'GET') {
      if (!isRole(admin, 'owner', 'admin')) return deny();
      const emps = (await workforce.loadState(a, tx)).employees.filter((e) => e.uid);
      const info = backend.authUsers ? await backend.authUsers(emps.map((e) => e.uid)) : {};
      const codes = {}; for (const e of emps) codes[e.uid] = (await a.get(tx, `admins/${e.uid}`)) || {};   // code status only, never the hash
      return okEnv({ items: emps.map((e) => ({ employeeId: e.id, uid: e.uid, name: e.name, email: e.email, role: e.role, status: e.status, lastSignIn: (info[e.uid] || {}).lastSignIn || null, created: (info[e.uid] || {}).created || null, hasCode: !!(codes[e.uid] && codes[e.uid].codeHash), codeLocked: !!(codes[e.uid] && +codes[e.uid].codeLockUntil > Date.now()), lastUnlockAt: (codes[e.uid] || {}).lastUnlockAt || null })) });
    }
    if (seg[2] === 'reset-code' && seg[3] && method === 'POST') {   /* owner: the employee sets a new 8-digit code at next sign-in */
      if (!isRole(admin, 'owner')) return deny();
      try { await require('./admin-code').reset(backend, token.uid, admin, seg[3]); } catch (e) { if (e && e.isServiceError) return env(e.code === 'not-found' ? 404 : e.code === 'invalid-argument' ? 422 : 403, 'FORBIDDEN', e.message); throw e; }
      return okEnv({ uid: seg[3], codeReset: true });
    }
    if (seg[2] === 'revoke' && seg[3] && method === 'POST') {
      if (!isRole(admin, 'owner')) return deny();
      if (seg[3] === token.uid) return env(409, 'CONFLICT', 'لا يمكنك إنهاء جلساتك من هنا — استخدم تسجيل الخروج');
      if (!backend.revokeSessions) return env(503, 'UNAVAILABLE', 'غير متاح');
      await backend.revokeSessions(seg[3]);
      return okEnv({ uid: seg[3], revoked: true });
    }
  }

  if (area === 'notifications') {
    if (seg[2] === 'broadcasts' && method === 'GET') {
      if (!(await can(a, tx, admin, 'notifications', 'view'))) return deny();
      const rows = await a.query(tx, 'broadcasts', { orderBy: ['at', 'desc'], limit: 50 });
      return okEnv({ items: rows.map((r) => r.data) });
    }
    if (seg[2] === 'broadcast' && method === 'POST') {
      if (!(await can(a, tx, admin, 'notifications', 'create'))) return deny();
      if (!isRole(admin, 'owner')) {   /* rank: a broadcast to everyone needs «مدير» (rbac-store RISK) */
        const st = await workforce.loadState(a, tx); const R = require('./runtime').createContext(null, [], st.rbac || null).ctx.HSAdminRbac;
        if (R.levelOf(R.state.roles, admin.role) < R.riskNeed('notifications.broadcast')) return env(403, 'FORBIDDEN', '«إشعار جماعي» محتاج رتبة مدير أو أعلى');
      }
      const audience = body.audience, text = String(body.text || '').trim();
      if (!['customers', 'providers'].includes(audience)) return env(422, 'VALIDATION', 'اختر الجمهور', { audience: 'customers|providers' });
      if (text.length < 5 || text.length > TEXT_MAX) return env(422, 'VALIDATION', 'نص الإشعار من 5 إلى 500 حرف', { text: '5–500' });
      const col = audience === 'customers' ? 'customers' : 'providers';
      const where = audience === 'customers' ? [['status', '==', 'active']] : [['status', '==', 'approved']];
      const recips = await a.query(tx, col, { where, limit: BROADCAST_MAX });
      const at = new Date().toISOString(), id = 'b' + Date.now().toString(36);
      const prefix = audience === 'customers' ? 'customer:' : 'provider:';
      recips.forEach((r, i) => a.set(tx, `notifications/n_${id}_${i}`, { id: `n_${id}_${i}`, to: prefix + r.id, text, reqId: null, at, read: false, broadcast: id, _k: Date.now() * 1000 + i }));
      const rec = { id, audience, text, recipients: recips.length, capped: recips.length >= BROADCAST_MAX, at, by: admin.employeeId || null };
      a.set(tx, `broadcasts/${id}`, rec);
      return okEnv(rec, 201);
    }
  }
  return env(404, 'NOT_FOUND', 'مسار غير معروف');
}

const PATH_RE = /^\/admin\/(audit|settings|departments|security|notifications\/(broadcast|broadcasts))(\/|$)/;
module.exports = { handle, PATH_RE, BROADCAST_MAX };
