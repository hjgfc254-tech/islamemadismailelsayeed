/**
 * MODULE: hs-dialog (HSUiDialog) — one in-app dialog for the three apps, replacing the browser's grey
 * alert() / confirm() / prompt() (unstyled, blocking, LTR on some phones).
 *   HSUiDialog.alert(message, {title?, ok?})                        → Promise<void>
 *   HSUiDialog.confirm(message, {title?, ok?, cancel?, danger?})    → Promise<boolean>
 *   HSUiDialog.prompt(message, {title?, ok?, cancel?, expect?, placeholder?, danger?}) → Promise<string|null>
 *       expect: the exact word the user must type (e.g. «حذف», «صيانة»); the confirm button stays disabled until it matches.
 * Accessible: role="alertdialog", aria-modal, labelled title + description, focus trap, Escape = cancel, the backdrop
 * click = cancel (alert: ok), focus returns to the element that opened it. RTL, design-system tokens, reduced motion.
 * One dialog at a time (later calls wait in a queue).
 */
'use strict';
(function (root) {
  const doc = root.document;
  if (!doc || root.HSUiDialog) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let chain = Promise.resolve();
  let seq = 0;

  function injectStyle() {
    if (doc.getElementById('hs-dialog-css')) return;
    const st = doc.createElement('style');
    st.id = 'hs-dialog-css';
    st.textContent = `
.hsd-back{position:fixed;inset:0;z-index:100500;display:grid;place-items:center;padding:16px;background:rgba(20,17,14,.48);animation:hsdIn .16s ease-out}
.hsd{width:min(420px,100%);display:grid;gap:12px;padding:20px;border-radius:20px;background:var(--surface-primary,#FFFDF9);color:var(--text-primary,#1F1B17);box-shadow:0 24px 60px rgba(31,27,23,.28);font-family:var(--font-body,'IBM Plex Sans Arabic',system-ui,sans-serif);text-align:start;direction:rtl}
.hsd h2{margin:0;font-size:19px;line-height:1.35;font-weight:700}
.hsd p{margin:0;font-size:15px;line-height:1.7;color:var(--text-secondary,#4A433C);white-space:pre-line}
.hsd input{min-height:48px;padding:0 14px;border:1.5px solid var(--border-input,#8C7F6C);border-radius:12px;background:var(--surface-primary,#fff);color:inherit;font:inherit;font-size:16px}
.hsd input:focus-visible{outline:none;border-color:var(--brand-primary,#1F1B17);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand-primary,#1F1B17) 18%,transparent)}
.hsd .hsd-row{display:flex;gap:8px;justify-content:flex-start;flex-wrap:wrap;margin-top:4px}
.hsd button{flex:1 1 0;min-height:48px;padding:0 16px;border-radius:14px;border:1.5px solid var(--border-default,#D6CBB9);background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}
.hsd button.hsd-ok{border-color:transparent;background:var(--brand-primary,#1F1B17);color:var(--on-brand,#fff)}
.hsd button.hsd-ok.is-danger{background:var(--danger,#A8261B)}
.hsd button:disabled{opacity:.45;cursor:not-allowed}
.hsd button:focus-visible{outline:3px solid var(--accent,#B4511C);outline-offset:2px}
@keyframes hsdIn{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.hsd-back{animation:none}}`;
    doc.head.appendChild(st);
  }

  function open(kind, message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      injectStyle();
      const id = 'hsd' + (++seq);
      const back = doc.createElement('div');
      back.className = 'hsd-back';
      const title = opts.title || (kind === 'alert' ? 'تنبيه' : 'تأكيد');
      const okText = opts.ok || (kind === 'alert' ? 'تمام' : 'تأكيد');
      const cancelText = opts.cancel || 'إلغاء';
      back.innerHTML = `<div class="hsd" role="alertdialog" aria-modal="true" aria-labelledby="${id}-t" aria-describedby="${id}-d">
        <h2 id="${id}-t">${esc(title)}</h2><p id="${id}-d">${esc(message)}</p>
        ${kind === 'prompt' ? `<input id="${id}-i" autocomplete="off" aria-labelledby="${id}-d" placeholder="${esc(opts.placeholder || opts.expect || '')}">` : ''}
        <div class="hsd-row"><button type="button" class="hsd-ok${opts.danger ? ' is-danger' : ''}" data-hsd="ok">${esc(okText)}</button>${kind === 'alert' ? '' : `<button type="button" data-hsd="cancel">${esc(cancelText)}</button>`}</div></div>`;
      const opener = doc.activeElement;
      doc.body.appendChild(back);
      const box = back.querySelector('.hsd'), ok = back.querySelector('[data-hsd="ok"]'), input = back.querySelector('input');
      const matches = () => !opts.expect || (input && input.value.trim() === String(opts.expect));
      if (input && opts.expect) { ok.disabled = true; input.addEventListener('input', () => { ok.disabled = !matches(); }); }
      const done = (value) => {
        back.remove();
        doc.removeEventListener('keydown', onKey, true);
        try { if (opener && opener.focus && doc.contains(opener)) opener.focus({ preventScroll: true }); } catch (e) {}
        resolve(value);
      };
      const cancelValue = kind === 'confirm' ? false : kind === 'prompt' ? null : undefined;
      const accept = () => { if (kind === 'prompt') { if (!matches()) return; done(input.value.trim()); } else done(kind === 'confirm' ? true : undefined); };
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); done(cancelValue); return; }
        if (e.key === 'Enter' && e.target === input) { e.preventDefault(); accept(); return; }
        if (e.key === 'Tab') {                                     // focus trap
          const f = [...box.querySelectorAll('input,button:not(:disabled)')];
          if (!f.length) return;
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      doc.addEventListener('keydown', onKey, true);
      back.addEventListener('click', (e) => {
        const b = e.target.closest('[data-hsd]');
        if (b) { if (b.dataset.hsd === 'ok') accept(); else done(cancelValue); return; }
        if (e.target === back) done(cancelValue);
      });
      setTimeout(() => { (input || ok).focus(); }, 20);
    });
  }
  const queued = (kind) => (message, opts) => { const p = chain.then(() => open(kind, message, opts)); chain = p.catch(() => {}); return p; };

  root.HSUiDialog = Object.freeze({ alert: queued('alert'), confirm: queued('confirm'), prompt: queued('prompt') });
})(typeof globalThis !== 'undefined' ? globalThis : this);
