/**
 * MODULE: command-palette (HSAdminPalette) — Ctrl+K / ⌘K quick search in the Admin Center.
 * Searches the pages this admin can open (from the rendered, RBAC-filtered navigation) and the loaded read model:
 * request numbers / services, customers and providers (name or phone). Choosing a record opens its page and, when that
 * page has a search box, pre-fills it. Native <dialog>: focus is trapped, Esc closes, arrows + Enter navigate.
 */
'use strict';
(function (root) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
  let dlg = null, items = [], active = 0;

  function pages() {
    const shell = root.HSAdminShell; if (!shell || !shell.NAV) return [];
    const allowed = new Set([...root.document.querySelectorAll('a[href^="#/"]')].map(a => a.getAttribute('href').slice(2)));
    return shell.NAV.flatMap(g => g.items || []).filter(i => allowed.has(i.id)).map(i => ({ kind: 'صفحة', label: i.label, page: i.id, q: '' }));
  }
  function records(q) {
    if (typeof MP === 'undefined' || !q) return [];
    const d = MP.db(), out = [], n = norm(q);
    for (const r of d.serviceRequests || []) if (norm(r.no).includes(n) || norm(r.serviceName).includes(n)) out.push({ kind: 'طلب', label: `${r.no} — ${r.serviceName}`, page: 'orders', q: r.no });
    for (const c of d.customers || []) if (norm(c.name).includes(n) || String(c.phone || '').includes(q)) out.push({ kind: 'عميل', label: `${c.name} — ${c.phone || ''}`, page: 'customers', q: c.name });
    for (const p of d.providers || []) if (norm(p.name).includes(n) || String(p.phone || '').includes(q)) out.push({ kind: 'مقدم خدمة', label: p.name, page: 'providers', q: p.name });
    return out.slice(0, 20);
  }
  function paint(q) {
    const n = norm(q);
    items = [...pages().filter(p => !n || norm(p.label).includes(n)), ...records(q)].slice(0, 30);
    active = 0;
    const list = dlg.querySelector('[data-cp-list]');
    list.innerHTML = items.length ? items.map((it, i) => `<li role="option" id="cp-o${i}" aria-selected="${i === active}" data-cp-i="${i}"><small>${esc(it.kind)}</small><span>${esc(it.label)}</span></li>`).join('')
      : '<li class="cp-empty" role="presentation">مفيش نتائج</li>';
    dlg.querySelector('input').setAttribute('aria-activedescendant', items.length ? 'cp-o0' : '');
  }
  function move(d) {
    if (!items.length) return;
    active = (active + d + items.length) % items.length;
    dlg.querySelectorAll('[data-cp-i]').forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    dlg.querySelector('input').setAttribute('aria-activedescendant', 'cp-o' + active);
    const el = dlg.querySelector('#cp-o' + active); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }
  function choose(i) {
    const it = items[i]; if (!it) return;
    dlg.close();
    root.location.hash = '#/' + it.page;
    if (it.q) setTimeout(() => {
      const box = root.document.querySelector('main input[type="search"], .adm-main input[type="search"], input[type="search"]');
      if (box) { box.value = it.q; box.dispatchEvent(new Event('input', { bubbles: true })); box.focus(); }
    }, 350);
  }
  function open() {
    if (!dlg) {
      dlg = root.document.createElement('dialog');
      dlg.className = 'cp'; dlg.setAttribute('dir', 'rtl'); dlg.setAttribute('aria-label', 'بحث سريع');
      dlg.innerHTML = `<div class="cp-in"><input type="search" role="combobox" aria-expanded="true" aria-controls="cp-list" aria-autocomplete="list" placeholder="ابحث عن صفحة، رقم طلب، عميل أو مقدم خدمة…" autocomplete="off">
        <ul id="cp-list" role="listbox" data-cp-list></ul><p class="cp-hint">↑ ↓ للتنقل • Enter للفتح • Esc للإغلاق</p></div>`;
      root.document.body.appendChild(dlg);
      const input = dlg.querySelector('input');
      input.addEventListener('input', () => paint(input.value));
      input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
      });
      dlg.addEventListener('click', e => { const li = e.target.closest('[data-cp-i]'); if (li) choose(+li.dataset.cpI); else if (e.target === dlg) dlg.close(); });
    }
    const input = dlg.querySelector('input'); input.value = ''; paint('');
    if (!dlg.open) dlg.showModal();
    input.focus();
  }
  root.document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-adm-palette]')) open(); });
  root.document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) { e.preventDefault(); open(); }
  });
  const api = Object.freeze({ open });
  root.HSAdminPalette = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);