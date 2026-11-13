/**
 * Accessible tabs helper — roving tabindex and arrow/Home/End keyboard support.
 * Activation is delegated to the existing click handler so each feature keeps
 * ownership of its panel/state logic. Horizontal direction respects RTL.
 */
'use strict';
(function (root) {
  const attach = (tablist, options) => {
    if (!tablist || typeof tablist.querySelectorAll !== 'function') return { destroy() {} };
    const opts = options || {};
    const selector = opts.selector || '[role="tab"]';
    const tabs = () => Array.from(tablist.querySelectorAll(selector)).filter((tab) => !tab.disabled && tab.getAttribute('aria-disabled') !== 'true');
    const selected = (items) => items.find((tab) => tab.getAttribute('aria-selected') === 'true') || items.find((tab) => tab.tabIndex === 0) || items[0];
    const sync = () => {
      const items = tabs();
      const current = selected(items);
      items.forEach((tab) => { tab.tabIndex = tab === current ? 0 : -1; });
      items.forEach((tab) => {
        const id = tab.getAttribute('aria-controls');
        const panel = id && tablist.ownerDocument && tablist.ownerDocument.getElementById(id);
        if (panel) {
          if (!panel.hasAttribute('role')) panel.setAttribute('role', 'tabpanel');
          if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '0');
        }
      });
    };
    const onClick = (event) => {
      const tab = event.target && event.target.closest ? event.target.closest(selector) : null;
      if (!tab || !tablist.contains(tab) || tab.disabled || tab.getAttribute('aria-disabled') === 'true') return;
      tabs().forEach((item) => { item.tabIndex = item === tab ? 0 : -1; });
    };
    const onKeyDown = (event) => {
      const items = tabs();
      if (items.length < 2) return;
      const current = event.target && event.target.closest ? event.target.closest(selector) : null;
      const index = items.indexOf(current);
      if (index < 0) return;
      const rtl = (tablist.getAttribute('dir') || (tablist.ownerDocument && tablist.ownerDocument.documentElement && tablist.ownerDocument.documentElement.dir) || '') === 'rtl';
      let next = index;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = items.length - 1;
      else if (event.key === 'ArrowRight') next = (index + (rtl ? -1 : 1) + items.length) % items.length;
      else if (event.key === 'ArrowLeft') next = (index + (rtl ? 1 : -1) + items.length) % items.length;
      else return;
      event.preventDefault();
      const target = items[next];
      items.forEach((tab) => { tab.tabIndex = tab === target ? 0 : -1; });
      target.focus();
      target.click();
    };
    sync();
    tablist.addEventListener('click', onClick);
    tablist.addEventListener('keydown', onKeyDown);
    return { sync, destroy() { tablist.removeEventListener('click', onClick); tablist.removeEventListener('keydown', onKeyDown); } };
  };
  const api = { attach };
  root.HSA11yTabs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
