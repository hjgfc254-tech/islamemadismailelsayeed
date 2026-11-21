/**
 * MODULE: categories-management.page
 * RESPONSIBILITY: Admin categories management — a multi-level (max 3 levels) category tree with expand/collapse, and one dialog
 *   to create or edit a category (validated name, parent choice that cannot create a cycle or exceed the depth limit),
 *   simulated activate/deactivate and display-order moves among siblings.
 * STATUS: IMPLEMENTED (DEMO). 14 local fixtures; every change is in memory only and labelled as a local simulation
 *   (nothing is saved, published or applied to services). Service counts are static fixture numbers, not linked to the services page.
 * Depends on: HSAdminShell, HSStatusBadge (registers the «category» domain here if absent), HSDialog.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n) => (typeof ic === 'function' ? ic(n) : '');
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();

  const STATUS = { active: { label: 'مفعّل', tone: 'success', icon: 'check' }, inactive: { label: 'متوقف', tone: 'warning', icon: 'warn' } };
  const B = root.HSStatusBadge;
  if (B && B.domains().indexOf('category') === -1) B.register('category', STATUS);
  const badge = (s) => (B ? B.render('category', s) : esc((STATUS[s] || {}).label || 'غير محدد'));
  const MAX_DEPTH = 3, NAME_MAX = 50;

  /* ───── Fixtures (demo) ───── */
  const buildFixtures = () => {
    const rows = [
      ['k1', null, 'كهرباء', 'active', 12], ['k2', 'k1', 'إنارة', 'active', 5], ['k3', 'k2', 'لمبات LED', 'active', 3], ['k4', 'k1', 'تمديدات', 'active', 4],
      ['k5', null, 'سباكة', 'active', 14], ['k6', 'k5', 'تسريبات', 'active', 6], ['k7', 'k5', 'تركيبات', 'inactive', 0],
      ['k8', null, 'نجارة', 'active', 9], ['k9', null, 'تكييف', 'active', 11], ['k10', 'k9', 'تركيب', 'active', 4], ['k11', 'k9', 'صيانة', 'active', 7],
      ['k12', null, 'دهانات', 'active', 8], ['k13', 'k12', 'دهانات داخلية', 'active', 5], ['k14', 'k12', 'دهانات خارجية', 'inactive', 0]
    ];
    const seen = {};
    return rows.map(([id, parentId, name, status, services]) => { const key = String(parentId); seen[key] = (seen[key] || 0) + 1; return { id, parentId, name, status, services, order: seen[key] }; });
  };
  let cats = buildFixtures();
  let createHook = null;
  const resetState = () => { cats = buildFixtures(); };

  /* ───── Pure logic (unit-tested) ───── */
  const siblings = (list, parentId) => list.filter((c) => (c.parentId || null) === (parentId || null)).sort((a, b) => a.order - b.order);
  const byId = (list, id) => list.find((c) => c.id === id) || null;
  const descendantIds = (list, id) => { const out = []; const walk = (p) => list.filter((c) => c.parentId === p).forEach((c) => { out.push(c.id); walk(c.id); }); walk(id); return out; };
  const depthOf = (list, id) => { let d = 0, c = byId(list, id), guard = 0; while (c && guard++ < 50) { d++; c = c.parentId ? byId(list, c.parentId) : null; } return d; };
  const height = (list, id) => { const kids = list.filter((c) => c.parentId === id); return 1 + (kids.length ? Math.max(...kids.map((k) => height(list, k.id))) : 0); };
  const pathName = (list, id) => { const p = []; let c = byId(list, id), g = 0; while (c && g++ < 50) { p.unshift(c.name); c = c.parentId ? byId(list, c.parentId) : null; } return p.join(' › '); };
  /** Parents a category may be moved under: never itself or its own descendants (no cycles); resulting depth ≤ MAX_DEPTH. id=null → creating (height 1). */
  const validParents = (list, id) => {
    const banned = id ? [id].concat(descendantIds(list, id)) : [], h = id ? height(list, id) : 1;
    return list.filter((c) => !banned.includes(c.id) && depthOf(list, c.id) + h <= MAX_DEPTH);
  };
  const flatten = (list) => { const out = []; const walk = (p, lvl) => siblings(list, p).forEach((c) => { out.push(Object.assign({ level: lvl }, c)); walk(c.id, lvl + 1); }); walk(null, 1); return out; };
  const counts = (list) => ({ total: list.length, roots: siblings(list, null).length, active: list.filter((c) => c.status === 'active').length, inactive: list.filter((c) => c.status === 'inactive').length, depth: list.length ? Math.max(...list.map((c) => depthOf(list, c.id))) : 0 });
  const clean = (f) => ({ name: String((f && f.name) == null ? '' : f.name).replace(/\s+/g, ' ').trim(), parentId: f && f.parentId ? String(f.parentId) : null });
  const validate = (fields, list, selfId) => {
    const v = clean(fields), errors = {};
    if (!v.name) errors.name = 'اكتب اسم التصنيف.';
    else if (v.name.length < 2) errors.name = 'اسم التصنيف قصير جدًا.';
    else if (v.name.length > NAME_MAX) errors.name = 'اسم التصنيف أطول من ' + nf(NAME_MAX) + ' حرفًا.';
    if (v.parentId && !validParents(list, selfId || null).some((c) => c.id === v.parentId)) errors.parentId = 'لا يمكن اختيار هذا التصنيف أبًا (دورة أو تجاوز ' + nf(MAX_DEPTH) + ' مستويات).';
    else if (v.name && !errors.name && list.some((c) => c.id !== selfId && (c.parentId || null) === v.parentId && norm(c.name) === norm(v.name))) errors.name = 'يوجد تصنيف بنفس الاسم في هذا المستوى.';
    return { ok: !Object.keys(errors).length, errors, value: v };
  };
  const fail = (errors) => { const e = new RangeError('Invalid category'); e.errors = errors; return e; };
  const renumberSiblings = (list, parentId) => { const m = {}; siblings(list, parentId).forEach((c, i) => { m[c.id] = i + 1; }); return list.map((c) => (m[c.id] ? Object.assign({}, c, { order: m[c.id] }) : c)); };
  const nextId = (list) => 'k' + (Math.max(0, ...list.map((c) => Number(String(c.id).slice(1)) || 0)) + 1);
  const createCategory = (list, fields) => {
    const r = validate(fields, list); if (!r.ok) throw fail(r.errors);
    return list.concat([{ id: nextId(list), parentId: r.value.parentId, name: r.value.name, status: 'active', services: 0, order: siblings(list, r.value.parentId).length + 1 }]);
  };
  const updateCategory = (list, id, fields) => {
    const cur = byId(list, id); if (!cur) throw new RangeError('Unknown category: ' + id);
    const r = validate(fields, list, id); if (!r.ok) throw fail(r.errors);
    const moved = (cur.parentId || null) !== r.value.parentId;
    let out = list.map((c) => (c.id === id ? Object.assign({}, c, { name: r.value.name, parentId: r.value.parentId, order: moved ? siblings(list, r.value.parentId).length + 1 : c.order }) : c));
    if (moved) out = renumberSiblings(out, cur.parentId || null);
    return out;
  };
  const allowedNext = (s) => (s === 'active' ? ['inactive'] : s === 'inactive' ? ['active'] : []);
  const setStatus = (list, id, next) => {
    const c = byId(list, id); if (!c) throw new RangeError('Unknown category: ' + id);
    if (!allowedNext(c.status).includes(next)) throw new RangeError('Transition not allowed: ' + c.status + ' → ' + next);
    return list.map((x) => (x.id === id ? Object.assign({}, x, { status: next }) : x));
  };
  const move = (list, id, dir) => {
    const c = byId(list, id); if (!c) throw new RangeError('Unknown category: ' + id);
    const sib = siblings(list, c.parentId), i = sib.findIndex((x) => x.id === id), j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= sib.length) throw new RangeError('Already at the end');
    const a = sib[i].order, b = sib[j].order;
    return list.map((x) => (x.id === sib[i].id ? Object.assign({}, x, { order: b }) : x.id === sib[j].id ? Object.assign({}, x, { order: a }) : x));
  };

  /* ───── Rendering ───── */
  const summaryHtml = () => {
    const c = counts(cats); const s = (l, v) => `<div class="ord-stat"><span>${l}</span><b>${nf(v)}</b></div>`;
    return `<section class="ord-sum" aria-label="ملخص التصنيفات">${s('الإجمالي', c.total)}${s('رئيسية', c.roots)}${s('مفعّلة', c.active)}${s('متوقفة', c.inactive)}${s('أقصى عمق', c.depth)}</section>`;
  };
  const treeHtml = (collapsed) => {
    const walk = (parent, lvl) => {
      const sib = siblings(cats, parent); if (!sib.length) return '';
      return `<ul class="cat-ul">${sib.map((c) => {
        const kids = cats.some((x) => x.parentId === c.id), isC = collapsed.has(c.id);
        return `<li class="cat-li" data-lvl="${lvl}"><div class="cat-row">
          ${kids ? `<button type="button" class="adm-btn cat-tg" data-cat-toggle="${esc(c.id)}" aria-expanded="${isC ? 'false' : 'true'}" aria-label="${isC ? 'توسيع' : 'طي'} ${esc(c.name)}">${isC ? '＋' : '−'}</button>` : '<span class="cat-tg-sp" aria-hidden="true"></span>'}
          <span class="cat-name">${esc(c.name)}</span>${badge(c.status)}<span class="ord-muted">${nf(c.services)} خدمة</span>
          <button type="button" class="adm-btn" data-cat-open="${esc(c.id)}" aria-label="فتح التصنيف: ${esc(c.name)}">فتح</button></div>${kids && !isC ? walk(c.id, lvl + 1) : ''}</li>`;
      }).join('')}</ul>`;
    };
    return cats.length ? walk(null, 1) : '<p class="ord-muted">لا توجد تصنيفات في البيانات التجريبية.</p>';
  };
  const fErr = (e, k) => (e && e[k] ? `<small class="ord-err" id="cat-e-${k}" role="alert">${esc(e[k])}</small>` : '');
  let livePricing = null;   /* {markupRate, prices{itemId: base}} from GET /admin/pricing (server backend mode) */
  /* learned price library: what completed jobs for this item actually paid the provider, with one-click approval */
  const libraryHtml = (key, base) => {
    const r = livePricing && livePricing.library && livePricing.library[key];
    if (!r) return '<p class="ord-muted" data-cat-lib>لسه مفيش شغل مكتمل كفاية للخدمة دي عشان نقترح سعر من السوق.</p>';
    return `<div class="cat-lib" data-cat-lib><p><b>من السوق:</b> آخر الشغلانات المكتملة دفعت للفني غالبًا بين ${esc(String(r.low))} و${esc(String(r.high))} ج.م (الوسط ${esc(String(r.median))} — من ${esc(String(r.n))} شغلانة).</p>` +
      (r.median !== base ? `<p><button type="button" class="adm-btn" data-cat-price-lib="${esc(String(r.median))}">اعتمد ${esc(String(r.median))} ج.م كسعر أساسي</button></p>` : '<p class="ord-muted">السعر الأساسي الحالي هو وسط السوق.</p>') + '</div>';
  };
  const priceSection = (c) => {
    if (!c || !livePricing || String(c.id).indexOf('item:') !== 0) return '';
    const key = String(c.id).slice(5), base = livePricing.prices[key], m = +livePricing.markupRate || 0;
    const cust = base ? Math.round(base * (1 + m / 100)) : null;
    return `<section aria-labelledby="cat-h-price"><h3 id="cat-h-price">السعر (يُثبَّت للعميل عند الطلب)</h3>` +
      `<p class="ord-muted">${base ? 'مبلغ مقدم الخدمة: ' + esc(String(base)) + ' ج.م — يدفع العميل ' + esc(String(cust)) + ' ج.م (رسوم المنصة ' + esc(String(m)) + '%)' : 'لا يوجد سعر بعد — يُحدَّد السعر بعد المعاينة.'}</p>` +
      `<div class="hs-grid-field"><label for="cat-price">مبلغ مقدم الخدمة (ج.م)</label><input id="cat-price" type="number" min="1" step="1" inputmode="numeric" value="${base ? esc(String(base)) : ''}"></div>` +
      `<p><button type="button" class="adm-btn adm-btn-p" data-cat-price>حفظ السعر</button>${base ? ' <button type="button" class="adm-btn" data-cat-price-clear>إزالة السعر</button>' : ''}</p>` + libraryHtml(key, base) + `</section>`;
  };
  const dialogHtml = (c, st) => {
    const creating = !c, v = st.values || (c ? { name: c.name, parentId: c.parentId } : { name: '', parentId: null }), e = st.errors || {};
    const opts = validParents(cats, c ? c.id : null), inv = (k) => (e[k] ? ` aria-invalid="true" aria-describedby="cat-e-${k}"` : '');
    const sib = c ? siblings(cats, c.parentId) : [], idx = c ? sib.findIndex((x) => x.id === c.id) : -1;
    return `<form class="ord-dlg-in" novalidate>
      <header class="ord-dlg-h"><div><h2 id="ord-dlg-t">${creating ? 'إضافة تصنيف' : esc(c.name)}</h2>${creating ? '' : `<p>${badge(c.status)}</p>`}</div>
        <button type="button" class="adm-btn" data-ord-close aria-label="إغلاق">${icon('close')}</button></header>
      <p class="ord-sim" role="note">${icon('info')}<span>إجراءات تجريبية: التغييرات محلية في هذه الصفحة فقط ولا تؤثر على الخدمات ولا على تطبيقي العميل والمزود.</span></p>
      ${st.message ? `<p class="ord-muted" role="status">${esc(st.message)}</p>` : ''}
      <section aria-labelledby="ord-h-form"><h3 id="ord-h-form">${creating ? 'بيانات التصنيف' : 'تعديل البيانات'}</h3>
        <div class="hs-grid-field"><label for="cat-name">اسم التصنيف</label><input id="cat-name" type="text" value="${esc(v.name)}" required${inv('name')}>${fErr(e, 'name')}</div>
        <div class="hs-grid-field"><label for="cat-parent">التصنيف الأب</label><select id="cat-parent"${inv('parentId')}><option value="">بدون (تصنيف رئيسي)</option>${opts.map((o) => `<option value="${esc(o.id)}"${v.parentId === o.id ? ' selected' : ''}>${esc(pathName(cats, o.id))}</option>`).join('')}</select>${fErr(e, 'parentId')}</div>
        <p class="ord-muted">أقصى عمق للشجرة ${nf(MAX_DEPTH)} مستويات؛ لا تظهر هنا التصنيفات التي ستنتج دورة أو تتجاوز العمق.</p>
        <p><button type="button" class="adm-btn adm-btn-p" data-cat-save>${creating ? 'إضافة محليًا' : 'حفظ التعديلات محليًا'}</button></p></section>
      ${creating ? '' : `<section aria-labelledby="ord-h-act"><h3 id="ord-h-act">الحالة (محاكاة)</h3><div class="ord-act">${allowedNext(c.status).map((n) => `<button type="button" class="adm-btn ${n === 'inactive' ? 'adm-btn-d' : 'adm-btn-p'}" data-ord-status="${n}">${n === 'inactive' ? 'إيقاف التصنيف محليًا' : 'تفعيل التصنيف محليًا'}</button>`).join('')}</div></section>
      ${priceSection(c)}
      <section aria-labelledby="ord-h-ord"><h3 id="ord-h-ord">الترتيب بين الأشقاء</h3><p class="ord-muted">الموضع ${nf(idx + 1)} من ${nf(sib.length)}.</p>
        <div class="ord-act">${idx > 0 ? '<button type="button" class="adm-btn" data-cat-move="-1">تقديم</button>' : ''}${idx < sib.length - 1 ? '<button type="button" class="adm-btn" data-cat-move="1">تأخير</button>' : ''}</div></section>`}</form>`;
  };

  const render = () => {
    const L = root.HSAdminLive && root.HSAdminLive.enabled() ? root.HSAdminLive : null;   /* Firebase mode: the real catalogue, read-only */
    if (L) cats = L.rows('categories');
    if (L) root.HSApiClient.request('GET', '/admin/pricing').then((res) => { livePricing = res.ok ? res.data : null; });
    const wrap = root.document.createElement('div'); wrap.className = 'ord';
    wrap.innerHTML = `<p class="dash-note">بيانات تجريبية محلية — ليست شجرة التصنيفات الفعلية، وأي تغيير يُفقد عند إعادة التحميل.</p>
      <div id="ord-sum"></div><div class="cat-tools"><button type="button" class="adm-btn" data-cat-all="expand">توسيع الكل</button><button type="button" class="adm-btn" data-cat-all="collapse">طي الكل</button></div>
      <nav id="cat-tree" class="cat-tree" aria-label="شجرة التصنيفات"></nav><dialog class="ord-dlg" id="ord-dlg" aria-labelledby="ord-dlg-t"></dialog>`;
    const sum = wrap.querySelector('#ord-sum'), tree = wrap.querySelector('#cat-tree'), dlgEl = wrap.querySelector('#ord-dlg');
    const collapsed = new Set(); let openId = null, st = {};
    /* Expand/collapse-all reflect the current state (disabled when there is nothing to do) instead of silently doing nothing. */
  const paintTree = () => { tree.innerHTML = treeHtml(collapsed); const box = tree.parentElement, parents = cats.filter((c) => cats.some((x) => x.parentId === c.id)); const ex = box && box.querySelector('[data-cat-all="expand"]'), co = box && box.querySelector('[data-cat-all="collapse"]'); if (ex) ex.disabled = collapsed.size === 0; if (co) co.disabled = parents.every((c) => collapsed.has(c.id)); };
    const sync = () => { sum.innerHTML = summaryHtml(); paintTree(); };
    sync();
    const paintDlg = (sel) => { const c = openId ? byId(cats, openId) : null; if (openId && !c) return; dlgEl.innerHTML = dialogHtml(c, st); const f = sel && dlgEl.querySelector(sel); if (f) f.focus(); };
    const d = root.HSDialog.attach(dlgEl, {
      closeSelector: '[data-ord-close]',
      fallbackFocus: () => (openId && wrap.querySelector('[data-cat-open="' + openId + '"]')) || wrap.querySelector('[data-cat-open]'),
      onClose: () => { openId = null; st = {}; }
    });
    const openDlg = (id, from) => { openId = id; st = {}; paintDlg(); d.open(from); };
    createHook = () => { openDlg(null, root.document.activeElement); const f = dlgEl.querySelector('#cat-name'); if (f) f.focus(); };
    tree.addEventListener('click', (e) => {
      const t = e.target.closest('[data-cat-toggle]'), o = e.target.closest('[data-cat-open]');
      if (t) { const id = t.dataset.catToggle; if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id); paintTree(); const n = tree.querySelector('[data-cat-toggle="' + id + '"]'); if (n) n.focus(); }
      else if (o) openDlg(o.dataset.catOpen, o);
    });
    wrap.querySelector('.cat-tools').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat-all]'); if (!b) return;
      collapsed.clear(); if (b.dataset.catAll === 'collapse') cats.filter((c) => cats.some((x) => x.parentId === c.id)).forEach((c) => collapsed.add(c.id)); paintTree();
    });
    const save = () => {
      const values = { name: dlgEl.querySelector('#cat-name').value, parentId: dlgEl.querySelector('#cat-parent').value || null };
      if (L) { st = { values, errors: {}, message: L.UNSUPPORTED }; paintDlg(); return; }   /* catalogue editing has no server route yet */
      try {
        if (openId) { cats = updateCategory(cats, openId, values); st = { message: 'تم حفظ التعديلات محليًا.' }; sync(); paintDlg('#cat-name'); }
        else { cats = createCategory(cats, values); openId = cats[cats.length - 1].id; st = { message: 'أُضيف التصنيف محليًا.' }; sync(); paintDlg('[data-ord-close]'); }
      } catch (err) {
        if (!err.errors) { st = { values, errors: {}, message: 'تعذر تنفيذ الإجراء.' }; paintDlg(); return; }
        st = { values, errors: err.errors }; paintDlg(); const f = dlgEl.querySelector(err.errors.name ? '#cat-name' : '#cat-parent'); if (f) f.focus();
      }
    };
    dlgEl.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    d.onClick((b) => {
      if (L && (b.dataset.ordStatus || b.dataset.catMove)) { st = { message: L.UNSUPPORTED }; paintDlg(); return; }
      if (L && (b.hasAttribute('data-cat-price') || b.hasAttribute('data-cat-price-clear') || b.hasAttribute('data-cat-price-lib'))) {
        const key = String(openId).slice(5), clear = b.hasAttribute('data-cat-price-clear'), v = clear ? null : (b.hasAttribute('data-cat-price-lib') ? Number(b.getAttribute('data-cat-price-lib')) : Number(dlgEl.querySelector('#cat-price').value));
        if (!clear && !(v > 0)) { st = { message: 'اكتب مبلغًا أكبر من صفر.' }; paintDlg('#cat-price'); return; }
        const send = root.HSBackend && root.HSBackend.admin ? root.HSBackend.admin('POST', '/admin/pricing', { key, base: v }) : root.HSApiClient.request('POST', '/admin/pricing', { body: { key, base: v } });
        send.then((res) => { if (res.ok) { livePricing = res.data; st = { message: clear ? 'أُزيل السعر — يُحدَّد بعد المعاينة.' : 'تم حفظ السعر على الخادم.' }; } else st = { message: L.errorText(res) }; paintDlg('#cat-price'); });
        return;
      }
      try {
        if (b.hasAttribute('data-cat-save')) save();
        else if (b.dataset.ordStatus) { cats = setStatus(cats, openId, b.dataset.ordStatus); st = {}; sync(); paintDlg('[data-ord-close]'); }
        else if (b.dataset.catMove) { cats = move(cats, openId, Number(b.dataset.catMove)); st = { message: 'تم تغيير الترتيب محليًا.' }; sync(); paintDlg('[data-ord-close]'); }
      } catch (err) { st = { message: 'تعذر تنفيذ الإجراء على هذا التصنيف.' }; paintDlg(); }
    });
    return wrap;
  };

  const api = { STATUS, MAX_DEPTH, NAME_MAX, siblings, descendantIds, depthOf, height, validParents, flatten, counts, validate, createCategory, updateCategory, allowedNext, setStatus, move, buildFixtures, resetState, _cats: () => cats };
  root.HSAdminCategoriesPage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('categories', {
      title: 'التصنيفات',
      description: 'شجرة التصنيفات متعددة المستويات، مع إضافة وتعديل ونقل وترتيب وتفعيل تجريبي محلي ومنع الدوائر.',
      actions: [
        { id: 'create', label: 'إضافة تصنيف', kind: 'primary', onClick: () => { if (createHook) createHook(); } },
        { id: 'reset', label: 'استعادة البيانات التجريبية', onClick: (ctx) => { resetState(); ctx.shell.refresh(); } }
      ],
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
