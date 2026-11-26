/**
 * MODULE: catalog-editor (HSCatalogEditor) — Admin › الخدمات (Firebase mode): the owner edits the service catalogue
 * the customers see, then publishes it.
 *   - categories → services (items) → problems: add, rename, pause / resume, delete;
 *   - each service and problem picks its questions from the question bank (required or optional);
 *   - the bank itself (add / edit questions with ready answers); the governorates the platform serves.
 * Routes (functions/src/catalog-admin.js): GET /admin/catalog · PUT /admin/catalog {catalog} · POST /admin/catalog/publish
 *   · POST /admin/catalog/unpublish. A first draft starts from the catalogue the app has now (CAT.db(), the built-in
 *   one + services/catalog-question-bank.js). Customers get the published file from the CDN (services/catalog-remote.js).
 * Mounted by admin-live-panels.js (services panel). Owner / admin roles only (the server checks again).
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = () => root.HSApiClient;
  const errText = (r) => (r && r.error && r.error.message) || 'تعذّر تنفيذ الإجراء';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const newSlug = (p) => p + Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 4);
  const TYPES = [['select', 'اختيارات جاهزة'], ['number', 'رقم'], ['input', 'كتابة']];
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return ''; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(t); } catch (e) { return iso; } };

  /* the catalogue the app runs on now → an editable v3 draft (bank questions referenced by id) */
  function fromApp() {
    const cat = root.CAT;
    const base = cat && cat.db ? clone(cat.db()) : null;
    const d = base && base.v === 3 ? base : (cat && cat.seed ? clone(cat.seed()) : base);
    if (!d) return null;
    delete d.rev; delete d.publishedAt;
    d.v = 3; d.bank = d.bank || []; d.govs = d.govs || null;
    d.items.forEach((i) => { if (!Array.isArray(i.qs)) i.qs = []; });
    d.problems.forEach((p) => { if (!Array.isArray(p.qs)) p.qs = []; p.extraQuestions = []; });
    return d;
  }

  async function mount(host) {
    if (!host || !C()) return;
    const res = await C().request('GET', '/admin/catalog');
    if (!res.ok) { host.innerHTML = `<p class="ord-muted">${esc(errText(res))}</p>`; return; }
    let pub = res.data.published, savedAt = res.data.savedAt;
    let work = res.data.draft || fromApp();
    let dirty = false;
    const ui = { cat: work && work.categories[0] ? work.categories[0].id : '', item: '', tab: 'services' };
    const setStatus = (m) => { const s = host.querySelector('[data-ce-status]'); if (s) s.textContent = m || ''; };
    const bankById = (id) => work.bank.find((q) => q.id === id);
    const govsAll = () => (root.MP && root.MP.GOVS) || [];

    function qsEditor(owner, kind) {
      const used = new Set(owner.qs.map((r) => r.id));
      return `<ul class="ce-qs">${owner.qs.map((r, k) => { const q = bankById(r.id); return `<li>${esc(q ? q.label : r.id)}${q && q.options ? ` <small class="ord-muted">(${esc(q.options.join(' / '))})</small>` : ''}
          <label><input type="checkbox" data-ce-qreq="${kind}|${esc(owner.id)}|${k}" ${r.required ? 'checked' : ''}> إجباري</label>
          <button type="button" class="adm-btn" data-ce-qdel="${kind}|${esc(owner.id)}|${k}" aria-label="شيل السؤال: ${esc(q ? q.label : r.id)}">شيل</button></li>`; }).join('') || '<li class="ord-muted">مفيش أسئلة</li>'}</ul>
        <label class="hs-grid-field"><span>أضف سؤال من البنك</span><select data-ce-qadd="${kind}|${esc(owner.id)}"><option value="">اختار سؤال…</option>${work.bank.filter((q) => !used.has(q.id)).map((q) => `<option value="${esc(q.id)}">${esc(q.label)}</option>`).join('')}</select></label>`;
    }

    function servicesTab() {
      const cats = work.categories.slice().sort((a, b) => a.order - b.order);
      const c = cats.find((x) => x.id === ui.cat) || cats[0];
      if (!c) return '<p class="ord-muted">مفيش أقسام.</p>';
      const items = work.items.filter((i) => i.cat === c.id).sort((a, b) => a.order - b.order);
      const it = items.find((i) => i.id === ui.item);
      const row = (kind, o, extra) => `<li class="ce-row"><input aria-label="الاسم" value="${esc(o.name)}" data-ce-name="${kind}|${esc(o.id)}">
          <label><input type="checkbox" data-ce-active="${kind}|${esc(o.id)}" ${o.active !== false ? 'checked' : ''}> شغال</label>${extra || ''}
          <button type="button" class="adm-btn" data-ce-del="${kind}|${esc(o.id)}" aria-label="احذف: ${esc(o.name)}">حذف</button></li>`;
      return `<label class="hs-grid-field"><span>القسم</span><select data-ce-cat>${cats.map((x) => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}${x.active === false ? ' (متوقف)' : ''}</option>`).join('')}</select></label>
        <ul class="ce-list">${row('cat', c)}</ul>
        <h4>الخدمات في «${esc(c.name)}»</h4>
        <ul class="ce-list">${items.map((i) => row('item', i, ` <button type="button" class="adm-btn${i.id === ui.item ? ' adm-btn-p' : ''}" data-ce-open="${esc(i.id)}">المشاكل والأسئلة</button>`)).join('')}</ul>
        <p><button type="button" class="adm-btn" data-ce-add="item">+ خدمة جديدة</button> <button type="button" class="adm-btn" data-ce-add="cat">+ قسم جديد</button></p>
        ${it ? `<section class="adm-live-panel" aria-label="${esc(it.name)}"><h4>${esc(it.name)}: الأسئلة اللي بتتسأل في كل طلب</h4>${qsEditor(it, 'item')}
          <h4>المشاكل / أنواع الشغل</h4>
          <ul class="ce-list">${work.problems.filter((p) => p.item === it.id && !p.isOther).sort((a, b) => a.order - b.order).map((p) => `${row('problem', p)}<li><details><summary>أسئلة «${esc(p.name)}» (${p.qs.length})</summary>${qsEditor(p, 'problem')}</details></li>`).join('')}</ul>
          <p><button type="button" class="adm-btn" data-ce-add="problem">+ مشكلة جديدة</button></p></section>` : ''}`;
    }

    function bankTab() {
      return `<p class="ord-muted">الأسئلة دي بتختار منها لكل خدمة. الاختيارات افصل بينها بـ «،» أو «,».</p>
        <ul class="ce-list">${work.bank.map((q) => `<li class="ce-row"><input aria-label="نص السؤال" value="${esc(q.label)}" data-ce-bq="${esc(q.id)}|label">
          <select aria-label="نوع الإجابة" data-ce-bq="${esc(q.id)}|type">${TYPES.map(([v, l]) => `<option value="${v}" ${q.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          ${q.type === 'select' ? `<input aria-label="الاختيارات" value="${esc((q.options || []).join('، '))}" data-ce-bq="${esc(q.id)}|options">` : ''}
          <button type="button" class="adm-btn" data-ce-bdel="${esc(q.id)}" aria-label="احذف السؤال: ${esc(q.label)}">حذف</button></li>`).join('')}</ul>
        <p><button type="button" class="adm-btn" data-ce-add="bank">+ سؤال جديد</button></p>`;
    }

    function govsTab() {
      const all = govsAll(), on = work.govs;
      return `<label class="hs-grid-field"><span>كل المحافظات</span><input type="checkbox" data-ce-govall ${on ? '' : 'checked'}></label>
        ${on ? `<fieldset class="ord-dlg-in"><legend>المحافظات اللي شغالين فيها</legend>${all.map((g) => `<label class="hs-grid-field"><span>${esc(g)}</span><input type="checkbox" data-ce-gov="${esc(g)}" ${on.includes(g) ? 'checked' : ''}></label>`).join('')}</fieldset>` : ''}`;
    }

    function render() {
      if (!work) { host.innerHTML = '<p class="ord-muted">مش قادرين نجهّز الكتالوج.</p>'; return; }
      const tabs = [['services', 'الأقسام والخدمات'], ['bank', `بنك الأسئلة (${work.bank.length})`], ['govs', 'المحافظات']];
      host.innerHTML = `<section class="adm-live-panel" aria-label="كتالوج الخدمات">
        <h3>كتالوج الخدمات (اللي العميل بيشوفه)</h3>
        <p class="ord-muted">${pub && !pub.off && pub.rev ? `منشور: نسخة ${esc(pub.rev)} — ${esc(dt(pub.publishedAt))}` : 'لسه ما اتنشرش — العملاء شايفين القايمة الأساسية اللي في التطبيق.'}${savedAt ? ` · آخر حفظ للمسودة: ${esc(dt(savedAt))}` : ''}</p>
        <p data-ce-status role="status" aria-live="polite" class="ord-muted"></p>
        <p><button type="button" class="adm-btn" data-ce-save>حفظ المسودة</button> <button type="button" class="adm-btn adm-btn-p" data-ce-publish>انشر للعملاء</button></p>
        <div role="tablist" aria-label="أجزاء الكتالوج">${tabs.map(([k, l]) => `<button type="button" role="tab" class="adm-btn${ui.tab === k ? ' adm-btn-p' : ''}" aria-selected="${ui.tab === k}" data-ce-tab="${k}">${esc(l)}</button>`).join(' ')}</div>
        <div role="tabpanel">${ui.tab === 'bank' ? bankTab() : ui.tab === 'govs' ? govsTab() : servicesTab()}</div>
      </section>`;
    }

    const find = (kind, id) => (kind === 'cat' ? work.categories : kind === 'item' ? work.items : work.problems).find((x) => x.id === id);
    const touch = (m) => { dirty = true; setStatus(m || 'فيه تعديلات مش محفوظة'); };

    host.addEventListener('change', (e) => {
      const t = e.target, d = t.dataset;
      if ('ceCat' in d) { ui.cat = t.value; ui.item = ''; return render(); }
      if (d.ceName) { const [k, id] = d.ceName.split('|'); const o = find(k, id); if (o && t.value.trim()) { o.name = t.value.trim().slice(0, 80); touch(); } return; }
      if (d.ceActive) { const [k, id] = d.ceActive.split('|'); const o = find(k, id); if (o) { o.active = t.checked; touch(); } return; }
      if (d.ceQreq) { const [k, id, n] = d.ceQreq.split('|'); const o = find(k, id); if (o && o.qs[+n]) { o.qs[+n].required = t.checked; touch(); } return; }
      if (d.ceQadd) { const [k, id] = d.ceQadd.split('|'); const o = find(k, id); if (o && t.value && !o.qs.some((r) => r.id === t.value)) { o.qs.push({ id: t.value, required: false }); touch(); render(); } return; }
      if (d.ceBq) {
        const [id, f] = d.ceBq.split('|'); const q = bankById(id); if (!q) return;
        if (f === 'label' && t.value.trim()) q.label = t.value.trim().slice(0, 140);
        if (f === 'type') { q.type = t.value; if (q.type === 'select' && !q.options) q.options = ['أيوه', 'لا', 'مش عارف']; if (q.type !== 'select') delete q.options; render(); }
        if (f === 'options') q.options = t.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
        return touch();
      }
      if ('ceGovall' in d) { work.govs = t.checked ? null : govsAll().slice(); touch(); return render(); }
      if (d.ceGov) { const g = d.ceGov; work.govs = (work.govs || []).filter((x) => x !== g).concat(t.checked ? [g] : []); touch(); }
    });

    host.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
      if (d.ceTab) { ui.tab = d.ceTab; return render(); }
      if (d.ceOpen) { ui.item = ui.item === d.ceOpen ? '' : d.ceOpen; return render(); }
      if (d.ceQdel) { const [k, id, n] = d.ceQdel.split('|'); const o = find(k, id); if (o) { o.qs.splice(+n, 1); touch(); render(); } return; }
      if (d.ceDel) {
        const [k, id] = d.ceDel.split('|'); const o = find(k, id); if (!o) return;
        if (!root.confirm(`حذف «${o.name}»؟ ${k === 'cat' ? 'كل خدماته هتتحذف معاه. ' : ''}(تقدر بدل الحذف تشيل علامة «شغال»)`)) return;
        if (k === 'cat') { const ids = work.items.filter((i) => i.cat === id).map((i) => i.id); work.items = work.items.filter((i) => i.cat !== id); work.problems = work.problems.filter((p) => !ids.includes(p.item)); work.categories = work.categories.filter((c) => c.id !== id); ui.cat = ''; }
        if (k === 'item') { work.items = work.items.filter((i) => i.id !== id); work.problems = work.problems.filter((p) => p.item !== id); if (ui.item === id) ui.item = ''; }
        if (k === 'problem') work.problems = work.problems.filter((p) => p.id !== id);
        touch(); return render();
      }
      if (d.ceBdel) {
        const id = d.ceBdel, q = bankById(id); if (!q || !root.confirm(`حذف السؤال «${q.label}» من البنك ومن كل الخدمات؟`)) return;
        work.bank = work.bank.filter((x) => x.id !== id); work.items.concat(work.problems).forEach((o) => { o.qs = o.qs.filter((r) => r.id !== id); }); touch(); return render();
      }
      if (d.ceAdd) {
        const what = d.ceAdd;
        const name = (root.prompt(what === 'bank' ? 'نص السؤال (مثلاً: حلق الباب متركب؟)' : what === 'cat' ? 'اسم القسم الجديد' : what === 'item' ? 'اسم الخدمة الجديدة' : 'اسم المشكلة أو نوع الشغل') || '').trim();
        if (!name) return;
        if (what === 'bank') work.bank.push({ id: newSlug('q_'), label: name.slice(0, 140), type: 'select', options: ['أيوه', 'لا', 'مش عارف'] });
        if (what === 'cat') { const id = newSlug('c'); work.categories.push({ id, name: name.slice(0, 60), icon: 'wrench', art: '', kind: 'fault', safety: [], active: true, order: work.categories.length }); ui.cat = id; ui.item = ''; }
        const cat = ui.cat || (work.categories[0] && work.categories[0].id);
        if (what === 'item' && cat) { const slug = newSlug('s'), id = cat + '/' + slug; work.items.push({ id, cat, slug, name: name.slice(0, 80), specialty: cat, kind: 'fault', qset: null, needsVisit: true, active: true, order: work.items.filter((i) => i.cat === cat).length, image: '', safety: [], qs: [] }); ui.item = id; }
        if (what === 'problem' && ui.item) { const it = find('item', ui.item), slug = newSlug('p'); work.problems.push({ id: it.id + '/' + slug, item: it.id, cat: it.cat, slug, name: name.slice(0, 80), warn: '', needsVisit: true, active: true, order: work.problems.filter((p) => p.item === it.id).length, attachments: { photos: 'optional', video: 'optional' }, extraQuestions: [], qs: [] }); }
        touch(); return render();
      }
      if ('ceSave' in d || 'cePublish' in d) {
        b.disabled = true;
        try {
          if (dirty || !savedAt || 'ceSave' in d) {
            setStatus('بنحفظ…');
            const r = await C().request('PUT', '/admin/catalog', { body: { catalog: work } });
            if (!r.ok) { setStatus(errText(r)); return; }
            savedAt = r.data.savedAt; dirty = false;
            setStatus(r.data.warnings && r.data.warnings.length ? 'اتحفظ، مع ملاحظات: ' + r.data.warnings.slice(0, 3).join(' — ') : 'اتحفظت المسودة');
          }
          if ('cePublish' in d) {
            if (!root.confirm('نشر الكتالوج للعملاء؟ هيوصلهم خلال دقايق.')) { setStatus('ما اتنشرش'); return; }
            const r = await C().request('POST', '/admin/catalog/publish', {});
            if (!r.ok) { setStatus(errText(r)); return; }
            pub = { rev: r.data.rev, publishedAt: r.data.publishedAt }; render(); setStatus(`اتنشر — نسخة ${r.data.rev}. العملاء هيشوفوه خلال دقايق.`);
          }
        } finally { b.disabled = false; }
      }
    });
    render();
  }

  const api = Object.freeze({ mount, _fromApp: fromApp });
  root.HSCatalogEditor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
