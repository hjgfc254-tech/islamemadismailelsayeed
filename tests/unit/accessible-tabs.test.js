'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { attach } = require('../../shared/components/accessible-tabs.js');

function fixture(dir = 'ltr') {
  const listeners = {};
  const panel = { attrs: {}, hasAttribute(k) { return k in this.attrs; }, setAttribute(k, v) { this.attrs[k] = String(v); } };
  const doc = { documentElement: { dir }, getElementById(id) { return id === 'panel' ? panel : null; } };
  const makeTab = (selected) => ({
    attrs: { role: 'tab', 'aria-selected': selected ? 'true' : 'false', 'aria-controls': 'panel' },
    tabIndex: selected ? 0 : -1, disabled: false, focused: false, clicked: false,
    getAttribute(k) { return this.attrs[k] ?? null; },
    hasAttribute(k) { return k in this.attrs; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    focus() { this.focused = true; }, click() { this.clicked = true; this.attrs['aria-selected'] = 'true'; tabs.forEach((t) => { if (t !== this) t.attrs['aria-selected'] = 'false'; }); },
    closest(sel) { return sel === '[role="tab"]' && this.attrs.role === 'tab' ? this : null; }
  });
  const tabs = [makeTab(true), makeTab(false), makeTab(false)];
  const list = {
    ownerDocument: doc,
    getAttribute(k) { return k === 'dir' ? null : null; },
    querySelectorAll(sel) { return sel === '[role="tab"]' ? tabs : []; },
    addEventListener(k, fn) { listeners[k] = fn; },
    removeEventListener(k) { delete listeners[k]; },
    contains(el) { return tabs.includes(el); }
  };
  return { list, tabs, panel, listeners };
}

test('roving tabindex leaves only the selected tab in the tab order and labels panels', () => {
  const f = fixture(); attach(f.list);
  assert.deepEqual(f.tabs.map((t) => t.tabIndex), [0, -1, -1]);
  assert.equal(f.panel.attrs.role, 'tabpanel');
  assert.equal(f.panel.attrs.tabindex, '0');
});

test('LTR arrow keys move focus and activate the next tab, wrapping at the end', () => {
  const f = fixture('ltr'); attach(f.list);
  let prevented = false;
  f.listeners.keydown({ target: f.tabs[0], key: 'ArrowRight', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(f.tabs[1].focused, true);
  assert.equal(f.tabs[1].clicked, true);
  assert.deepEqual(f.tabs.map((t) => t.tabIndex), [-1, 0, -1]);
});

test('RTL arrow keys follow reading direction', () => {
  const f = fixture('rtl'); attach(f.list);
  f.listeners.keydown({ target: f.tabs[0], key: 'ArrowLeft', preventDefault() {} });
  assert.equal(f.tabs[1].focused, true);
});

test('Home and End move to first and last enabled tabs', () => {
  const f = fixture(); attach(f.list);
  f.listeners.keydown({ target: f.tabs[1], key: 'End', preventDefault() {} });
  assert.equal(f.tabs[2].focused, true);
  f.listeners.keydown({ target: f.tabs[2], key: 'Home', preventDefault() {} });
  assert.equal(f.tabs[0].focused, true);
});

test('destroy removes delegated keyboard and click listeners', () => {
  const f = fixture(); const api = attach(f.list); api.destroy();
  assert.deepEqual(f.listeners, {});
});

test('clicking a tab updates the roving tabindex; non-tab clicks are ignored', () => {
  const f = fixture(); attach(f.list);
  f.listeners.click({ target: f.tabs[2] });
  assert.deepEqual(f.tabs.map((t) => t.tabIndex), [-1, -1, 0]);
  f.listeners.click({ target: {} });
  assert.deepEqual(f.tabs.map((t) => t.tabIndex), [-1, -1, 0]);
});

test('unsupported keys do not steal native keyboard behavior', () => {
  const f = fixture(); attach(f.list);
  let prevented = false;
  f.listeners.keydown({ target: f.tabs[0], key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
});

test('missing tablist is a safe no-op', () => {
  assert.doesNotThrow(() => attach(null).destroy());
});
