/**
 * Admin workforce + RBAC on the server.
 *   employees/{id}   the Admin Center employee records (same shape as the app's workforce module:
 *                    {id, name, email, department, role, status, created, log[], uid?})
 *   admins/{uid}     the authorization record derived from an ACCEPTED employee ({employeeId, role, status, name, email});
 *                    written only here, so a role/status change takes effect on the next request
 *   system/rbac      {roles, overrides} — the RBAC catalogue the Admin roles/permissions pages edit
 * Business rules are the app's own pure functions (functions/domain: employee-form/status/invitation, rbac-store):
 * validation, unique email, the last-active-owner guard, grant limits (no one grants permissions they do not hold).
 * Server-only additions: only an owner may give or take the owner role; nobody changes their own status.
 */
'use strict';
const runtime = require('./runtime');

const EMPLOYEE_LIMIT = 500;               // the Admin workforce is small and bounded; one bounded read per operation
class WfError extends Error { constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; } }
const env = (status, code, message, details) => ({ ok: false, status, error: details ? { code, message, details } : { code, message } });
const okEnv = (data, status = 200) => ({ ok: true, status, data });

async function loadState(adapter, tx) {
  const [rows, rbac] = await Promise.all([
    adapter.query(tx, 'employees', { limit: EMPLOYEE_LIMIT }),
    adapter.get(tx, 'system/rbac')
  ]);
  return { employees: rows.map(r => r.data), rbac };
}

/** Domain context with the RBAC catalogue (defaults from the app when nothing is stored yet). */
function domain(rbac) {
  const e = runtime.createContext(null, [], rbac || null);
  const R = e.ctx.HSAdminRbac;
  return { R, EF: e.ctx.HSAdminEmployeeForm, ST: e.ctx.HSAdminEmployeeStatus, INV: e.ctx.HSAdminEmployeeInvitation, roles: R.state.roles, overrides: R.state.overrides || {} };
}

function can(d, me, module, action) {
  if (!me) return false;
  const eff = d.R.employeeEffective(d.roles, d.overrides, { id: me.id, role: me.role });
  return eff.includes(module + '.' + action);
}

/** Diffs employee lists and keeps admins/{uid} in step with accepted employees. */
function writeEmployees(adapter, tx, before, after) {
  const prev = new Map(before.map(e => [e.id, e]));
  let changed = 0;
  for (const e of after) {
    const old = prev.get(e.id);
    if (old && JSON.stringify(old) === JSON.stringify(e)) continue;
    adapter.set(tx, `employees/${e.id}`, JSON.parse(JSON.stringify(e)));
    changed++;
    if (e.uid) adapter.set(tx, `admins/${e.uid}`, { employeeId: e.id, role: e.role, status: e.status, name: e.name, email: e.email, updatedAt: new Date().toISOString() });
  }
  return changed;
}

/**
 * Handles /admin/employees* and /admin/rbac*. `me` is the acting employee ({id, role}); `admin` the admins/{uid} doc.
 * Returns an API envelope; mutations run inside the caller's transaction.
 */
async function handle({ adapter, tx, method, path, body, admin }) {
  const seg = path.split('/').filter(Boolean);           // ['admin', 'employees'|'rbac', ...]
  const st = await loadState(adapter, tx);
  const d = domain(st.rbac);
  const me = st.employees.find(e => e.id === admin.employeeId) || (admin.role ? { id: admin.employeeId || '-', role: admin.role } : null);
  const isOwner = me && me.role === 'owner';
  const deny = () => env(403, 'FORBIDDEN', 'ليست لديك صلاحية لهذا الإجراء');
  /* grant limits for employees too (the rbac-store changeEmployee rule): nobody gives a role, or manages an employee,
     whose permissions they do not hold themselves — otherwise workforce.edit could hand out (or self-assign) more power */
  const held = new Set(me ? d.R.employeeEffective(d.roles, d.overrides, { id: me.id, role: me.role }) : []);
  const exceeds = keys => !isOwner && keys.some(k => !held.has(k));
  const roleAbove = role => exceeds(d.R.effective(d.roles, String(role || '')));
  const targetAbove = t => exceeds(d.R.employeeEffective(d.roles, d.overrides, { id: t.id, role: t.role }));
  const above = () => env(403, 'FORBIDDEN', 'لا يمكنك إسناد دور أو إدارة موظف سلطته أعلى من سلطتك');
  const notFound = () => env(404, 'NOT_FOUND', 'الموظف غير موجود');
  const catchDomain = fn => {
    try { return fn(); }
    catch (err) {
      if (err.errors) return env(422, 'VALIDATION', 'راجع بيانات الموظف', err.errors);
      if (err.message === 'No change') return env(409, 'CONFLICT', 'لا يوجد تغيير لحفظه');
      if (err.message === 'Last owner') return env(409, 'CONFLICT', 'لا يمكن تعطيل آخر مالك مفعّل');
      if (/^Unknown employee/.test(err.message)) return notFound();
      return env(409, 'CONFLICT', err.message || 'تعذر تنفيذ الإجراء');
    }
  };

  if (seg[1] === 'rbac') {
    if (method === 'GET') return can(d, me, 'roles', 'view') ? okEnv({ roles: d.roles, overrides: d.overrides }) : deny();
    if (seg[2] === 'roles' && method === 'POST') {
      const editing = !!body.id;
      if (!can(d, me, 'roles', editing ? 'edit' : 'create')) return deny();
      return catchDomain(() => {
        const roles = editing ? d.R.updateRole(d.roles, me.role, String(body.id), body.fields || {}) : d.R.createRole(d.roles, me.role, body.fields || {});
        adapter.set(tx, 'system/rbac', { roles, overrides: d.overrides });
        return okEnv({ roles, overrides: d.overrides }, editing ? 200 : 201);
      });
    }
    if (seg[2] === 'overrides' && seg[3] && method === 'POST') {
      if (!can(d, me, 'permissions', 'edit')) return deny();
      const roster = st.employees.map(e => ({ id: e.id, name: e.name, role: e.role, status: e.status }));
      return catchDomain(() => {
        const overrides = d.R.setOverrides(d.roles, d.overrides, roster, me.role, String(seg[3]), Array.isArray(body.keys) ? body.keys.map(String) : []);
        adapter.set(tx, 'system/rbac', { roles: d.roles, overrides });
        return okEnv({ roles: d.roles, overrides });
      });
    }
    return env(404, 'NOT_FOUND', 'مسار غير معروف');
  }

  /* employees */
  if (method === 'GET' && seg.length === 2) return can(d, me, 'workforce', 'view') ? okEnv({ items: withInviteState(st.employees) }) : deny();
  if (method === 'POST' && seg.length === 2) {
    if (!can(d, me, 'workforce', 'create')) return deny();
    if (body.role === 'owner' && !isOwner) return deny();
    if (roleAbove(body.role)) return above();
    return catchDomain(() => {
      const made = d.EF.createEmployee(st.employees, body);
      const next = stampInvite(made, made[made.length - 1].id);   // S9: the 7-day invitation window starts now
      writeEmployees(adapter, tx, st.employees, next);
      return okEnv(next[next.length - 1], 201);
    });
  }
  const target = st.employees.find(e => e.id === seg[2]);
  if (!target) return notFound();
  if (method === 'PATCH' && seg.length === 3) {
    if (!can(d, me, 'workforce', 'edit')) return deny();
    const fields = { name: target.name, email: target.email, department: target.department, role: target.role, ...body };
    if ((fields.role === 'owner' || target.role === 'owner') && fields.role !== target.role && !isOwner) return deny();
    if (targetAbove(target) || (fields.role !== target.role && roleAbove(fields.role))) return above();
    if (target.uid && fields.email !== undefined && String(fields.email).trim().toLowerCase() !== target.email) return env(409, 'CONFLICT', 'لا يمكن تغيير بريد موظف فعّل حسابه');
    return catchDomain(() => {
      const next = d.EF.updateEmployee(st.employees, target.id, fields);
      writeEmployees(adapter, tx, st.employees, next);
      return okEnv(next.find(e => e.id === target.id));
    });
  }
  if (method === 'POST' && seg[3] === 'status') {
    if (!can(d, me, 'workforce', 'decide')) return deny();
    if (me && target.id === me.id) return env(409, 'CONFLICT', 'لا يمكنك تغيير حالة حسابك');
    if (target.role === 'owner' && !isOwner) return deny();
    if (targetAbove(target)) return above();
    return catchDomain(() => {
      const next = d.ST.setStatus(st.employees, target.id, String(body.status || ''));
      writeEmployees(adapter, tx, st.employees, next);
      return okEnv(next.find(e => e.id === target.id));
    });
  }
  if (method === 'POST' && seg[3] === 'resend') {
    if (!can(d, me, 'workforce', 'edit')) return deny();
    return catchDomain(() => {
      const next = stampInvite(d.INV.resendInvite(st.employees, target.id), target.id);   // S9: re-sending opens a new 7-day window
      writeEmployees(adapter, tx, st.employees, next);
      return okEnv(next.find(e => e.id === target.id));
    });
  }
  return env(404, 'NOT_FOUND', 'مسار غير معروف');
}

/** First owner: creates the owner employee + admins/{uid} in one transaction (idempotent). */
async function createOwner(adapter, tx, token, name) {
  const st = await loadState(adapter, tx);
  const mine = st.employees.find(e => e.uid === token.uid);
  if (mine) return { replay: true, employee: mine };
  if (st.employees.some(e => e.role === 'owner' && e.status === 'active')) throw new WfError(409, 'failed-precondition', 'an owner already exists');
  const d = domain(st.rbac);
  const next = d.EF.createEmployee(st.employees, { name: String(name || token.email).slice(0, 60), email: token.email, department: 'exec', role: 'owner' });
  const emp = { ...next[next.length - 1], status: 'active', uid: token.uid };
  emp.log = (emp.log || []).concat([{ kind: 'status', text: 'تفعيل حساب المالك الأول (تحقق البريد)', at: new Date().toISOString() }]);
  writeEmployees(adapter, tx, st.employees, st.employees.concat([emp]));
  if (!st.rbac) adapter.set(tx, 'system/rbac', { roles: d.roles, overrides: {} });
  return { replay: false, employee: emp };
}

/* Security audit S9 (2026-11-24): a staff invitation expires INVITE_TTL_DAYS after it was sent (or re-sent). An old
   invitation can no longer be claimed by whoever later controls that mailbox; «إعادة إرسال الدعوة» starts a new window.
   When was it sent: inviteAt (stamped on create / resend), else the newest create/invite log entry, else `created`. */
const INVITE_TTL_DAYS = 7;
const DAY = 86400000;
function invitedAt(e) {
  if (e && e.inviteAt) return Date.parse(e.inviteAt);
  const ent = ((e && e.log) || []).filter(x => x && (x.kind === 'create' || x.kind === 'invite') && x.at).map(x => Date.parse(x.at)).filter(Number.isFinite);
  if (ent.length) return Math.max(...ent);
  return e && e.created ? Date.parse(e.created) : NaN;
}
/** true while an unclaimed invitation may still be accepted */
function inviteOpen(e, now = Date.now()) { const at = invitedAt(e); return Number.isFinite(at) && now - at <= INVITE_TTL_DAYS * DAY; }
const stampInvite = (list, id, at) => list.map(e => (e.id === id ? { ...e, inviteAt: at || new Date().toISOString() } : e));
/** employees for the admin list: invited rows say whether the invitation expired (computed, not stored) */
const withInviteState = (list, now) => list.map(e => (e.status === 'invited' && !e.uid ? { ...e, inviteExpired: !inviteOpen(e, now), inviteExpiresAt: Number.isFinite(invitedAt(e)) ? new Date(invitedAt(e) + INVITE_TTL_DAYS * DAY).toISOString() : null } : e));

/** Invitation acceptance: a verified email matching an invited employee activates that employee for this uid —
    only while the invitation is open (S9). */
async function acceptInvite(adapter, tx, token, now = Date.now()) {
  if (!token || !token.email || !token.email_verified) return null;
  const email = String(token.email).toLowerCase();
  const [row] = await adapter.query(tx, 'employees', { where: [['email', '==', email]], limit: 1 });
  if (!row || !['invited', 'active'].includes(row.data.status) || row.data.uid) return null;   // disabled invitations are never accepted
  if (!inviteOpen(row.data, now)) return null;   // expired: the owner re-sends it from «فريق العمل»
  const emp = { ...row.data, status: 'active', uid: token.uid, log: (row.data.log || []).concat([{ kind: 'status', text: 'قَبِل الدعوة وفعّل حسابه (تحقق البريد)', at: new Date().toISOString() }]) };
  writeEmployees(adapter, tx, [row.data], [emp]);
  return emp;
}

module.exports = { handle, createOwner, acceptInvite, loadState, WfError, EMPLOYEE_LIMIT, INVITE_TTL_DAYS, inviteOpen };
