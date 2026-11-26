/**
 * MODULE: data-grid
 * RESPONSIBILITY: Reusable client-side data grid for admin lists — search, select filters, sorting, pagination,
 *   loading / error / empty (no-data vs no-results) states, optional row actions, and a card layout on narrow screens.
 * STATUS: IMPLEMENTED (DEMO). Works only on rows handed to it in memory; it never fetches, stores or sends anything.
 *
 * Usage:  const g = HSDataGrid.create(hostEl, { caption, columns, rows, filters?, rowActions?, pageSize? });
 *   column:  { key, label, type?: 'text'|'number'|'date'|'status', sortable?: bool (default true), statusDomain?, align?,
 *              sortValue?(row), format?(row)->plain text (escaped), html?(row)->TRUSTED html (caller must escape) }
 *   filter:  { key, label, options?: [{value,label}] }   (options default to the distinct values of row[key])
 *   rowActions: [{ id, label, onClick(row) }]  (a button is rendered only when a handler exists — no dead controls)
 *   instance: setRows(rows) · setState('ready'|'loading'|'error', message?) · getView() · getState() · reset() · destroy()
 *   options: onRetry() (shows «حاول مرة أخرى» in the error state), emptyText, rowId(row), pageSizes, searchKeys.
 * Pure helpers (also exported for tests): normalize, computeView, applyQuery.
 * Status columns use HSStatusBadge when loaded (shared/components/status-badge.js); otherwise plain escaped text.
 * Styles: `.hs-grid*` in apps/admin/styles/admin-components.css.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG-u-nu-latn').format(n); } catch (e) { return String(n); } };
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const PAGE_SIZES = [10, 25, 50];

  /* Arabic-friendly search normalisation: lowercase, strip tashkeel/tatweel, unify alef/yaa/taa-marbuta/hamza forms, Arabic-Indic digits → ASCII. */
  const normalize = (v) => String(v == null ? '' : v).toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ؤئ]/g, 'ء')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6F0))
    .replace(/\s+/g, ' ').trim();

  const cellValue = (col, row) => (typeof col.sortValue === 'function' ? col.sortValue(row) : row[col.key]);
  const cellText = (col, row) => {
    const v = row[col.key];
    if (typeof col.format === 'function') return String(col.format(row) == null ? '' : col.format(row));
    if (col.type === 'status') {
      const B = root.HSStatusBadge;
      return B && col.statusDomain ? B.label(col.statusDomain, v) : String(v == null ? '' : v);
    }
    if (col.type === 'number') return Number.isFinite(Number(v)) && v !== '' && v != null ? nf(Number(v)) : '';
    if (col.type === 'date') { const t = Date.parse(v); if (!Number.isFinite(t)) return ''; try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' }).format(t); } catch (e) { return String(v); } }
    return String(v == null ? '' : v);
  };

  let collator; try { collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' }); } catch (e) { collator = { compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0) }; }
  const isEmpty = (col, r) => { const v = cellValue(col, r); return v == null || v === ''; }; /* empty values always sort last, in both directions */
  const compare = (col, a, b) => {
    const va = cellValue(col, a), vb = cellValue(col, b);
    if (col.type === 'number') return Number(va) - Number(vb);
    if (col.type === 'date') return Date.parse(va) - Date.parse(vb);
    return collator.compare(String(typeof col.sortValue === 'function' ? va : cellText(col, a)), String(typeof col.sortValue === 'function' ? vb : cellText(col, b)));
  };

  const defaultFilterOptions = (f, rows) => {
    const seen = []; rows.forEach((r) => { const v = r[f.key]; if (v != null && v !== '' && !seen.includes(v)) seen.push(v); });
    return seen.map((v) => ({ value: String(v), label: String(v) }));
  };

  /* Search → filters (AND) → sort (stable) → paginate. Pure: no DOM. */
  const applyQuery = (rows, cfg, st) => {
    const cols = cfg.columns;
    const keys = cfg.searchKeys || cols.filter((c) => c.type !== 'date').map((c) => c.key);
    const q = normalize(st.search);
    let out = rows.filter((r) => {
      for (const k of Object.keys(st.filters || {})) { const want = st.filters[k]; if (want !== '' && want != null && String(r[k]) !== String(want)) return false; }
      if (!q) return true;
      return keys.some((k) => { const col = cols.find((c) => c.key === k); return normalize(col ? cellText(col, r) : r[k]).includes(q) || normalize(r[k]).includes(q); });
    });
    const sc = st.sort && cols.find((c) => c.key === st.sort.key && c.sortable !== false);
    if (sc) { const dir = st.sort.dir === 'desc' ? -1 : 1; out = out.map((r, i) => [r, i]).sort((x, y) => { const ex = isEmpty(sc, x[0]), ey = isEmpty(sc, y[0]); if (ex || ey) return ex === ey ? x[1] - y[1] : (ex ? 1 : -1); return (compare(sc, x[0], y[0]) * dir) || (x[1] - y[1]); }).map((p) => p[0]); }
    return out;
  };
  const computeView = (rows, cfg, st) => {
    const all = applyQuery(rows, cfg, st);
    const size = Math.max(1, st.pageSize | 0 || 10);
    const pages = Math.max(1, Math.ceil(all.length / size));
    const page = Math.min(Math.max(1, st.page | 0 || 1), pages);
    const start = (page - 1) * size;
    return { total: rows.length, matched: all.length, page, pages, pageSize: size, from: all.length ? start + 1 : 0, to: Math.min(all.length, start + size), rows: all.slice(start, start + size),
      filtered: !!(normalize(st.search) || Object.values(st.filters || {}).some((v) => v !== '' && v != null)) };
  };

  let uid = 0;
  const create = (host, cfg) => {
    if (!host || !cfg || !Array.isArray(cfg.columns) || !cfg.columns.length) throw new Error('HSDataGrid.create: host and columns are required');
    const keys = cfg.columns.map((c) => c.key);
    if (new Set(keys).size !== keys.length) throw new Error('HSDataGrid.create: duplicate column keys');
    const id = 'hsg' + (++uid);
    const sizes = (cfg.pageSizes && cfg.pageSizes.length ? cfg.pageSizes : PAGE_SIZES).map(Number);
    const actions = (cfg.rowActions || []).filter((a) => a && typeof a.onClick === 'function' && a.label);
    const filters = (cfg.filters || []).filter((f) => f && f.key && f.label);
    let rows = Array.isArray(cfg.rows) ? cfg.rows.slice() : [];
    let mode = 'ready', message = '';
    const st = { search: '', filters: {}, sort: cfg.sort || null, page: 1, pageSize: sizes.includes(Number(cfg.pageSize)) ? Number(cfg.pageSize) : sizes[0] };
    filters.forEach((f) => { st.filters[f.key] = ''; });
    let view = computeView(rows, cfg, st);
    const rowKey = (r, i) => String(typeof cfg.rowId === 'function' ? cfg.rowId(r) : (r.id != null ? r.id : i));

    const sortOptions = [];
    cfg.columns.filter((c) => c.sortable !== false).forEach((c) => { sortOptions.push([c.key + ':asc', c.label + ' — تصاعدي'], [c.key + ':desc', c.label + ' — تنازلي']); });

    host.classList.add('hs-grid');
    host.innerHTML = `<div class="hs-grid-tools" role="search">
      <div class="hs-grid-field hs-grid-search"><label for="${id}-q">${esc(cfg.searchLabel || 'بحث')}</label><input id="${id}-q" type="search" autocomplete="off" placeholder="${esc(cfg.searchPlaceholder || 'ابحث في القائمة…')}" data-g="search"></div>
      ${filters.map((f) => { const opts = f.options || defaultFilterOptions(f, rows); return `<div class="hs-grid-field"><label for="${id}-f-${esc(f.key)}">${esc(f.label)}</label><select id="${id}-f-${esc(f.key)}" data-g="filter" data-key="${esc(f.key)}"><option value="">الكل</option>${opts.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></div>`; }).join('')}
      ${sortOptions.length ? `<div class="hs-grid-field hs-grid-sortsel"><label for="${id}-s">ترتيب</label><select id="${id}-s" data-g="sortsel"><option value="">الافتراضي</option>${sortOptions.map((o) => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select></div>` : ''}
      <button type="button" class="adm-btn hs-grid-clear" data-g="clear" disabled>مسح البحث والفلاتر</button>
    </div>
    <p class="hs-grid-count" id="${id}-c" role="status" aria-live="polite"></p>
    <div data-part="body"></div>`;
    const $ = (s) => host.querySelector(s);
    const body = $('[data-part="body"]');

    const th = (c) => {
      const sorted = st.sort && st.sort.key === c.key ? st.sort.dir : '';
      const ar = c.align === 'end' ? ' hs-grid-end' : '';
      if (c.sortable === false) return `<th scope="col" class="${ar.trim()}">${esc(c.label)}</th>`;
      return `<th scope="col" class="${ar.trim()}" aria-sort="${sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}"><button type="button" class="hs-grid-sort" data-g="sort" data-key="${esc(c.key)}">${esc(c.label)}<span class="hs-grid-arrow" aria-hidden="true">${sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕'}</span></button></th>`;
    };
    const td = (c, r) => {
      let inner;
      if (typeof c.html === 'function') inner = String(c.html(r) == null ? '' : c.html(r));
      else if (c.type === 'status' && root.HSStatusBadge && c.statusDomain) inner = root.HSStatusBadge.render(c.statusDomain, r[c.key], { size: 'sm' });
      else inner = esc(cellText(c, r)) || '<span class="hs-grid-dash" aria-label="لا توجد قيمة">—</span>';
      return `<td data-label="${esc(c.label)}"${c.align === 'end' ? ' class="hs-grid-end"' : ''}>${inner}</td>`;
    };
    const pager = () => {
      const v = view;
      return `<nav class="hs-grid-pager" aria-label="التنقل بين الصفحات">
        <div class="hs-grid-field hs-grid-size"><label for="${id}-ps">عدد الصفوف</label><select id="${id}-ps" data-g="size">${sizes.map((n) => `<option value="${n}"${n === st.pageSize ? ' selected' : ''}>${nf(n)}</option>`).join('')}</select></div>
        <div class="hs-grid-pages"><button type="button" class="adm-btn" data-g="prev"${v.page <= 1 ? ' disabled' : ''}>السابق</button>
        <span class="hs-grid-pos">صفحة ${nf(v.page)} من ${nf(v.pages)}</span>
        <button type="button" class="adm-btn" data-g="next"${v.page >= v.pages ? ' disabled' : ''}>التالي</button></div></nav>`;
    };

    const paint = () => {
      view = computeView(rows, cfg, st);
      st.page = view.page;
      const ae = host.contains(document.activeElement) ? document.activeElement : null;
      const refocus = ae && ae.dataset ? { g: ae.dataset.g, key: ae.dataset.key, id: ae.id } : null;
      const count = $('#' + id + '-c');
      $('[data-g="clear"]').disabled = !view.filtered;
      if (mode === 'loading') {
        count.textContent = 'جارٍ التحميل…';
        body.innerHTML = `<div class="adm-state" role="status" aria-busy="true"><div class="adm-spin" aria-hidden="true"></div><p>${esc(message || 'جارٍ تحميل البيانات…')}</p></div>`;
        return;
      }
      if (mode === 'error') {
        count.textContent = '';
        body.innerHTML = `<div class="adm-state is-error" role="alert">${icon('warn')}<h2>تعذر عرض البيانات</h2><p>${esc(message || 'حدث خطأ أثناء تجهيز القائمة.')}</p>${typeof cfg.onRetry === 'function' ? '<button type="button" class="adm-btn adm-btn-p" data-g="retry">حاول مرة أخرى</button>' : ''}</div>`;
        return;
      }
      count.textContent = view.matched
        ? `عرض ${nf(view.from)}–${nf(view.to)} من ${nf(view.matched)}${view.filtered ? ` (النتائج المطابقة، من أصل ${nf(view.total)})` : ''}`
        : (view.filtered ? 'لا توجد نتائج مطابقة' : '');
      if (!view.total) {
        body.innerHTML = `<div class="adm-state">${icon('list')}<h2>${esc(cfg.emptyTitle || 'لا توجد بيانات بعد')}</h2><p>${esc(cfg.emptyText || 'لم تُضف أي عناصر إلى هذه القائمة حتى الآن.')}</p></div>`;
        return;
      }
      if (!view.matched) {
        body.innerHTML = `<div class="adm-state">${icon('search')}<h2>لا توجد نتائج مطابقة</h2><p>جرّب كلمات بحث مختلفة أو أزل بعض الفلاتر.</p><button type="button" class="adm-btn" data-g="clear">مسح البحث والفلاتر</button></div>`;
        return;
      }
      body.innerHTML = `<div class="hs-grid-wrap" role="region" tabindex="0" aria-label="${esc(cfg.caption || 'جدول البيانات')}"><table class="hs-grid-table"><caption class="adm-sr">${esc(cfg.caption || 'جدول البيانات')}</caption>
        <thead><tr>${cfg.columns.map(th).join('')}${actions.length ? '<th scope="col">إجراءات</th>' : ''}</tr></thead>
        <tbody>${view.rows.map((r, i) => `<tr data-row="${esc(rowKey(r, i))}">${cfg.columns.map((c) => td(c, r)).join('')}${actions.length ? `<td data-label="إجراءات" class="hs-grid-acts">${actions.map((a) => `<button type="button" class="adm-btn" data-g="act" data-act="${esc(a.id || a.label)}" aria-label="${esc(a.label)}: ${esc(cfg.columns[0] ? cellText(cfg.columns[0], r) : '')}">${esc(a.label)}</button>`).join('')}</td>` : ''}</tr>`).join('')}</tbody></table></div>${pager()}`;
      if (refocus && refocus.g) {
        const sel = refocus.key ? `[data-g="${refocus.g}"][data-key="${refocus.key}"]` : (refocus.id ? '#' + refocus.id : `[data-g="${refocus.g}"]`);
        const el = body.querySelector(sel) || (refocus.g === 'prev' || refocus.g === 'next' ? body.querySelector('.hs-grid-wrap') : null);
        if (el && el.focus) el.focus();
      }
    };
    const syncControls = () => {
      const s = $('[data-g="sortsel"]'); if (s) s.value = st.sort ? st.sort.key + ':' + (st.sort.dir === 'desc' ? 'desc' : 'asc') : '';
    };

    const onClick = (e) => {
      const b = e.target.closest && e.target.closest('[data-g]'); if (!b || !host.contains(b) || b.disabled) return;
      const g = b.dataset.g;
      if (g === 'sort') { const k = b.dataset.key; st.sort = st.sort && st.sort.key === k ? (st.sort.dir === 'asc' ? { key: k, dir: 'desc' } : null) : { key: k, dir: 'asc' }; st.page = 1; syncControls(); paint(); }
      else if (g === 'prev') { st.page -= 1; paint(); }
      else if (g === 'next') { st.page += 1; paint(); }
      else if (g === 'clear') { api.reset(); $('[data-g="search"]').focus(); }
      else if (g === 'retry') { if (typeof cfg.onRetry === 'function') cfg.onRetry(); }
      else if (g === 'act') {
        const tr = b.closest('tr'); const r = view.rows.find((x, i) => rowKey(x, i) === tr.dataset.row); const a = actions.find((x) => (x.id || x.label) === b.dataset.act);
        if (r && a) a.onClick(r);
      }
    };
    const onInput = (e) => { if (e.target.dataset.g === 'search') { st.search = e.target.value; st.page = 1; paint(); } };
    const onChange = (e) => {
      const g = e.target.dataset.g;
      if (g === 'filter') { st.filters[e.target.dataset.key] = e.target.value; st.page = 1; paint(); }
      else if (g === 'size') { st.pageSize = Number(e.target.value) || sizes[0]; st.page = 1; paint(); }
      else if (g === 'sortsel') { const v = e.target.value.split(':'); st.sort = v[0] ? { key: v[0], dir: v[1] } : null; st.page = 1; paint(); }
    };
    host.addEventListener('click', onClick); host.addEventListener('input', onInput); host.addEventListener('change', onChange);

    const api = {
      setRows(next) { rows = Array.isArray(next) ? next.slice() : []; mode = 'ready'; message = ''; paint(); },
      setState(m, msg) { if (!['ready', 'loading', 'error'].includes(m)) throw new Error('HSDataGrid.setState: invalid state'); mode = m; message = msg || ''; paint(); },
      reset() { st.search = ''; Object.keys(st.filters).forEach((k) => { st.filters[k] = ''; }); st.page = 1; $('[data-g="search"]').value = ''; host.querySelectorAll('[data-g="filter"]').forEach((s) => { s.value = ''; }); paint(); },
      getView: () => view,
      getState: () => ({ mode, search: st.search, filters: Object.assign({}, st.filters), sort: st.sort && Object.assign({}, st.sort), page: st.page, pageSize: st.pageSize }),
      destroy() { host.removeEventListener('click', onClick); host.removeEventListener('input', onInput); host.removeEventListener('change', onChange); host.classList.remove('hs-grid'); host.innerHTML = ''; }
    };
    syncControls(); paint();
    return api;
  };

  const api = { create, normalize, computeView, applyQuery, PAGE_SIZES: PAGE_SIZES.slice() };
  root.HSDataGrid = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
