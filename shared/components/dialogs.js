/**
 * MODULE: dialogs
 * RESPONSIBILITY: Reusable native-<dialog> behaviour — open (showModal with fallback), close, backdrop-click close,
 *   close-button hook, and focus return to the opener (or a fallback element) after closing.
 * STATUS: IMPLEMENTED (DEMO). Behaviour only: the caller renders the dialog's content and owns its own actions.
 *   Extracted for the admin providers page; the orders and customers pages still carry their own copy of this logic
 *   (migration to this module is a recorded follow-up, not yet done).
 *
 * Usage:  const d = HSDialog.attach(dialogEl, { closeSelector: '[data-ord-close]', focusSelector?: '[data-ord-close]',
 *                                               fallbackFocus?: () => Element|null, onClose?: () => void });
 *         d.open(); d.close(); d.isOpen();   // d.open(opener?) — opener defaults to document.activeElement
 *         d.onClick(handler)                 // handler(button, event) for clicks on buttons inside the dialog (after close/backdrop handling)
 */
'use strict';
(function (root) {
  const attach = (dlg, opts) => {
    const o = opts || {};
    let opener = null;
    let fallbackMode = false;
    const isOpen = () => !!dlg.open;
    const focusFirst = () => { const el = o.focusSelector ? dlg.querySelector(o.focusSelector) : (o.closeSelector ? dlg.querySelector(o.closeSelector) : null); if (el && el.focus) el.focus(); };
    const open = (from) => {
      opener = from || (root.document ? root.document.activeElement : null);
      fallbackMode = typeof dlg.showModal !== 'function';
      if (!fallbackMode) dlg.showModal(); else dlg.setAttribute('open', '');
      focusFirst();
    };
    const close = () => {
      if (!isOpen()) return;
      if (!fallbackMode && typeof dlg.close === 'function') dlg.close(); else { dlg.removeAttribute('open'); fallbackMode = false; afterClose(); }
    };
    function afterClose() {
      const target = (opener && opener.isConnected && opener) || (typeof o.fallbackFocus === 'function' ? o.fallbackFocus() : null);
      opener = null;
      if (target && target.focus) target.focus();
      if (typeof o.onClose === 'function') o.onClose();
    }
    dlg.addEventListener('close', () => { fallbackMode = false; afterClose(); });
    // Native <dialog> supplies a focus trap and Escape handling. The attribute-only
    // fallback must provide both itself so keyboard users are not trapped outside it.
    dlg.addEventListener('keydown', (event) => {
      if (!fallbackMode || !isOpen()) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab' || typeof dlg.querySelectorAll !== 'function') return;
      const candidates = Array.from(dlg.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.disabled && !el.hidden && el.getAttribute('aria-hidden') !== 'true');
      if (!candidates.length) { event.preventDefault(); if (dlg.focus) dlg.focus(); return; }
      const first = candidates[0], last = candidates[candidates.length - 1];
      const active = root.document && root.document.activeElement;
      if (event.shiftKey && (active === first || !dlg.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !dlg.contains(active))) { event.preventDefault(); first.focus(); }
    });
    let handler = null;
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) { close(); return; }
      const b = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      if (o.closeSelector && b.matches(o.closeSelector)) { close(); return; }
      if (handler) handler(b, e);
    });
    return { open, close, isOpen, onClick: (fn) => { handler = fn; }, focusFirst };
  };
  const api = { attach };
  root.HSDialog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
