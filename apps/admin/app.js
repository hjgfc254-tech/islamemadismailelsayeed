/**
 * MODULE: app — HSAdminApp (Admin Center bootstrap)
 * Starts the Admin Center demo: without a demo session it shows the demo account picker (fictional RBAC roster);
 * with one it mounts the shell, installs the presentation-only permission guard for that employee and shows the
 * account in the header with a "switch account" control. The URL hash is kept, so a deep link opens after selection.
 * NOT authentication or authorization.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const deps = () => ({ shell: root.HSAdminShell, session: root.HSAdminSession, auth: root.HSAdminAuth, guard: root.HSAdminPermissionGuard });

  function pickerHtml(accounts) {
    return `<main class="adm-login" id="adm-login" tabindex="-1" aria-labelledby="adm-login-t">
  <span class="adm-chip" role="note">واجهة تجريبية</span>
  <h1 id="adm-login-t">مركز الإدارة — اختر حساب العرض</h1>
  <p class="adm-login-note">لا توجد مصادقة فعلية في هذه النسخة. اختر موظفًا تجريبيًا لفتح مركز الإدارة بصلاحيات دوره (للعرض فقط، وليست حماية حقيقية).</p>
  <ul class="adm-login-list" aria-label="حسابات العرض">${accounts.map((a) => `<li><button type="button" class="adm-login-acc" data-adm-login="${esc(a.id)}"><b>${esc(a.name)}</b><small>${esc(a.roleName)} · ${esc(a.departmentName)}</small></button></li>`).join('')}</ul>
  <a class="adm-btn" href="../customer/index.html">العودة للموقع</a>
</main>`;
  }

  function accountHtml(e, roleName) {
    return `<span class="adm-acc-name"><b>${esc(e.name)}</b><small>${esc(roleName)}</small></span><button type="button" class="adm-btn" data-adm-switch>تبديل الحساب</button>`;
  }

  /** Mount the shell for the signed-in demo employee. */
  function startShell(host, employee) {
    const { shell, guard } = deps();
    shell.mount(host);
    shell.setAccess((id) => guard.canView(id, employee));
    const role = root.HSAdminRbac ? root.HSAdminRbac.roleById(root.HSAdminRbac.state.roles, employee.role) : null;
    shell.setAccount(accountHtml(employee, role ? role.name : employee.role));
  }

  function showPicker(host) {
    const { auth } = deps();
    host.innerHTML = pickerHtml(auth.listDemoAccounts());
    root.document.title = 'اختيار حساب العرض | مركز الإدارة | هنصلحلك';
  }

  function onHostClick(e) {
    const { session } = deps();
    const host = e.currentTarget;
    const pick = e.target.closest('[data-adm-login]');
    if (pick) {
      const emp = session.select(pick.getAttribute('data-adm-login'));
      if (emp) startShell(host, emp);
      return;
    }
    if (e.target.closest('[data-adm-switch]')) {
      session.clear();
      root.location.reload(); // the shell mounts once per page load; a reload returns to the picker cleanly
    }
  }

  function start() {
    const host = root.document.querySelector('#admin-app[data-admin-shell]');
    const d = deps();
    if (!host || !d.shell || !d.session || !d.auth || !d.guard) return;
    host.addEventListener('click', onHostClick);
    if (root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase') return startFirebase(host, d);
    const emp = d.session.current();
    if (emp) startShell(host, emp); else showPicker(host);
  }

  /* Firebase backend: the employee comes from the server (verified email → admins/{uid} → employees/{id}); the local
     demo roster/picker is never used. The shell starts after the bridge has synced the server workforce. */
  function startFirebase(host, d) {
    host.innerHTML = '<div class="adm-state" data-adm-fb-wait><h2>جارٍ التحقق من حساب الإدارة…</h2><p>يتم الاتصال بالخادم.</p></div>';
    let started = false;
    root.document.addEventListener('hs:backend-sync', (e) => {
      const a = e.detail && e.detail.actor;
      if (started) return;
      if (a && a.role === 'admin' && a.employeeId) {
        const emp = d.session.select(a.employeeId);
        if (emp) { started = true; host.innerHTML = ''; startShell(host, emp); return; }
      }
      host.innerHTML = '<div class="adm-state" data-adm-fb-signin><h2>دخول مركز الإدارة</h2><p>سجّل الدخول ببريدك الإلكتروني المؤكَّد. الصلاحيات يحددها الخادم وحده.</p><button type="button" class="adm-btn adm-btn-p" data-adm-fb-login>تسجيل الدخول</button></div>';
      const b = host.querySelector('[data-adm-fb-login]');
      if (b) b.addEventListener('click', () => { if (root.HSBackend) root.HSBackend.signInAdmin().catch(() => {}); });
    });
  }

  root.HSAdminApp = Object.freeze({ start, pickerHtml, accountHtml });
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start); else start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
