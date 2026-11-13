/* ═══════════════════════════════════════════════════════════════
   هنصلحلك — ui-kit.js — V8 / C2 (Customer Design Foundation)
   مكونات حالات واجهة موحدة (تحميل / هيكل / فراغ / خطأ / نجاح / غير متصل)
   + حوار تأكيد + Toast بأنواع. لا يغيّر منطقًا ولا بيانات.
   يعتمد على: ic(), esc() من app.js. يُحمَّل بعد app.js وقبل market-ui.js.
   الدوال القديمة uiLoading/uiEmpty/... في market-ui.js صارت أغلفة تستدعي UIK.
   ═══════════════════════════════════════════════════════════════ */
'use strict';
const UIK = (() => {
  const _esc = (typeof esc === 'function') ? esc : (s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));
  const _ic = (n) => (typeof ic === 'function') ? ic(n) : '';

  const loading = (txt) => `<div class="empty is-loading" role="status" aria-live="polite"><div class="spinner" aria-hidden="true"></div><p>${_esc(txt || 'جارٍ التحميل…')}</p></div>`;

  /* هيكل تحميل: type = 'card' | 'row' | 'text' */
  const skeleton = (n = 3, type = 'card') =>
    `<div class="skel-wrap" aria-busy="true" aria-label="جارٍ التحميل">${Array.from({length: Math.max(1, n | 0)}, () => `<div class="skel skel-${type}" aria-hidden="true"></div>`).join('')}</div>`;

  /* txt و sub يُمرَّران كنص HTML موثوق (كما كانا) — المستدعون القدامى يمررون <br> أحيانًا */
  const empty = (icon, txt, sub) => `<div class="empty">${_ic(icon || 'list')}<p>${txt}${sub ? `<br><small>${sub}</small>` : ''}</p></div>`;

  /* retryAct (اختياري): اسم data-act لزر «حاول مرة أخرى» — لا يُرسم الزر بلا مستمع معروف */
  const error = (txt, retryAct) => `<div class="empty is-error" role="alert">${_ic('warn')}<p>${txt}</p>${retryAct ? `<button type="button" class="cta ghost" data-act="${_esc(retryAct)}">حاول مرة أخرى</button>` : ''}</div>`;

  const success = (icon, txt) => `<div class="need ok">${_ic(icon || 'check')}<span>${txt}</span></div>`;

  const offline = () => `<div class="demo-banner is-offline" role="status">${_ic('warn')}<span>أنت غير متصل بالإنترنت — بعض الميزات لن تعمل. البيانات المحفوظة على جهازك متاحة.</span></div>`;

  /* Toast بأنواع: kind = 'ok' | 'err' | 'info' (يُضبط على #toast كـ data-kind ويُزال بعد الإخفاء) */
  const toastKind = (msg, kind) => {
    const t = document.getElementById('toast');
    if (t) t.dataset.kind = kind || 'info';
    if (typeof toast === 'function') toast(msg);
    if (t) setTimeout(() => { try { delete t.dataset.kind; } catch {} }, 2600);
  };

  /* حوار تأكيد: يُرجع Promise<boolean>. لا يستخدم #sheet فلا يتعارض مع النوافذ المفتوحة. */
  let openDlg = null;
  const confirmDialog = ({ title, message, okText, cancelText, danger } = {}) => new Promise(resolve => {
    if (openDlg) { try { openDlg.finish(false); } catch {} }
    const prevFocus = document.activeElement;
    const root = document.createElement('div');
    root.className = 'uik-dlg';
    root.innerHTML = `<div class="uik-dlg-bk" data-uik="no"></div>
      <div class="uik-dlg-box glass" role="alertdialog" aria-modal="true" aria-labelledby="uikT" aria-describedby="uikM">
        <h3 id="uikT">${_esc(title || 'تأكيد')}</h3>
        <p id="uikM">${_esc(message || '')}</p>
        <div class="row2">
          <button type="button" class="cta ghost" data-uik="no">${_esc(cancelText || 'إلغاء')}</button>
          <button type="button" class="cta ${danger ? 'danger' : ''}" data-uik="yes">${_esc(okText || 'تأكيد')}</button>
        </div></div>`;
    const finish = (v) => {
      document.removeEventListener('keydown', onKey, true);
      root.remove(); openDlg = null;
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch {}
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(false); } };
    root.addEventListener('click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('[data-uik]') : null;
      if (b) finish(b.dataset.uik === 'yes');
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(root);
    openDlg = { finish };
    const first = root.querySelector('[data-uik="no"].cta') || root.querySelector('button');
    if (first && first.focus) first.focus();
  });

  return { loading, skeleton, empty, error, success, offline, toastKind, confirmDialog };
})();
