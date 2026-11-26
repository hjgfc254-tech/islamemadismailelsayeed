/**
 * MODULE: client-errors (HSClientErrors) — «أخطاء عند المستخدمين»: crashes caught in real visitors' browsers by
 * shared/utils/error-reporter.js, grouped by (app, message, file) with a count, first/last time and affected users.
 *   Firebase mode: GET /admin/client-errors, «مسح السجل» → POST /admin/client-errors/clear (owner | admin role).
 *   Local demo:    the errors kept on this device (localStorage), clearable locally.
 * Mounted under the audit log (pages/audit-log.page.js in demo mode, admin-live-panels audit panel in Firebase mode).
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG-u-nu-latn').format(n); } catch (e) { return String(n); } };
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(t); } catch (e) { return iso; } };
  const APP = { customer: 'العميل', provider: 'مقدم الخدمة', admin: 'الإدارة', server: 'السيرفر' };
  const live = () => !!(root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase');
  const call = (method, path, body) => (root.HSBackend && root.HSBackend.admin ? root.HSBackend.admin(method, path, body) : root.HSApiClient.request(method, path, { body }));

  async function load() {
    if (live()) {
      const r = await root.HSApiClient.request('GET', '/admin/client-errors');
      if (!r.ok) throw new Error((r.error && r.error.message) || 'failed');
      return r.data.items || [];
    }
    return root.HSErrorReporter ? root.HSErrorReporter.local() : [];
  }

  function html(items) {
    const head = `<h3 id="cerr-h">أخطاء عند المستخدمين</h3>
      <p class="ord-muted">أعطال حصلت فعلًا في متصفحات الزوار، متجمّعة حسب الرسالة والملف. ${live() ? 'من كل الأجهزة (آخر 30 يوم).' : 'وضع العرض التجريبي: أخطاء هذا الجهاز فقط.'} الأرقام والإيميلات بتتشال قبل الحفظ.</p>`;
    if (!items.length) return head + '<p class="cerr-empty">' + (typeof ic === 'function' ? ic('check') + ' ' : '') + 'مفيش أخطاء متسجلة — كويس</p>';
    return head + `<div class="hs-grid-scroll"><table class="hs-grid-table" aria-labelledby="cerr-h"><thead><tr>
      <th scope="col">الرسالة</th><th scope="col">التطبيق</th><th scope="col">المكان</th><th scope="col">المرات</th><th scope="col">آخر مرة</th></tr></thead><tbody>${items.map((x) => `<tr>
      <td><details><summary>${esc(x.msg)}</summary><pre class="cerr-stack">${esc(x.stack || 'لا يوجد تتبع')}</pre><small class="ord-muted">${esc(x.route || '')} · ${esc(x.ua || '')} · أول مرة ${esc(dt(x.first))}</small></details></td>
      <td>${esc(APP[x.app] || x.app || '—')}</td><td dir="ltr"><code>${esc(x.src || '—')}</code></td>
      <td>${esc(nf(x.count || 1))}${x.userCount ? ` <small class="ord-muted">(${esc(nf(x.userCount))} مستخدم)</small>` : ''}</td><td>${esc(dt(x.last))}</td></tr>`).join('')}</tbody></table></div>
      <p><button type="button" class="adm-btn" data-cerr-clear>مسح السجل</button> <span role="status" aria-live="polite" class="ord-muted" data-cerr-status></span></p>`;
  }

  async function mount(host) {
    if (!host) return;
    host.innerHTML = '<div aria-busy="true" role="status" aria-label="جارٍ تحميل الأخطاء"><div class="sk sk-bar"></div></div>';
    let items;
    try { items = await load(); } catch (e) { host.innerHTML = '<h3>أخطاء عند المستخدمين</h3><p>تعذّر تحميل سجل الأخطاء.</p>'; return; }
    host.innerHTML = html(items);
    const btn = host.querySelector('[data-cerr-clear]');
    if (btn) btn.addEventListener('click', async () => {
      if (!(await (root.HSUiDialog ? root.HSUiDialog.confirm('مسح كل الأخطاء المتسجلة؟', { danger: true }) : Promise.resolve(root.confirm ? root.confirm('مسح كل الأخطاء المتسجلة؟') : true)))) return;
      if (live()) { const r = await call('POST', '/admin/client-errors/clear', {}); if (!r.ok) { const s = host.querySelector('[data-cerr-status]'); if (s) s.textContent = 'تعذّر المسح.'; return; } }
      else if (root.HSErrorReporter) root.HSErrorReporter.clearLocal();
      mount(host);
    });
  }

  const api = Object.freeze({ mount, html, load });
  root.HSClientErrors = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
