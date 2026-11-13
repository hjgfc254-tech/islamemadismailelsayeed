/* ═══════════════════════════════════════════════════════════════
   هنصلحلك — صفحات اكتشاف الخدمة (V8-C4) — ملف جديد
   ───────────────────────────────────────────────────────────────
   الغرض: صفحة واضحة لكل قسم / جهاز (نوع عمل) / مشكلة، مبنية بالكامل من CAT (مصدر وحيد — لا بيانات مكررة).
   يصل إليها العميل من نتائج البحث ومن الروابط الداخلية بين الصفحات، ومنها يبدأ الطلب عبر الويزارد.

   كل صفحة تعرض بحسب نوعها: الاسم، وصفًا، أيقونة/رسمة، المشكلات الشائعة، الخدمات المرتبطة،
   خطوات الحصول على الخدمة، المعلومات المطلوبة قبل الطلب، تنبيهات الأمان، ومسار تنقل (قسم ← جهاز ← مشكلة).

   الواجهة العامة (HS_DISCOVER):
   • open(kind, id)       → يفتح الصفحة (kind: cat | item | problem) ويضيفها لمكدس الرجوع
   • render(kind, id)     → HTML الصفحة (يُستخدم من screens.disc)
   • order(kind, id)      → يبدأ الويزارد مع تحديد القسم/الجهاز/المشكلة مسبقًا (يعرض الخطوة الصحيحة فعلًا)
   • describe(kind, id)   → { desc, steps, needs, safety, questions } (بيانات بلا HTML — للاختبار)

   ملاحظات:
   • الأوصاف قوالب عامة بحسب نوع القسم (kind) — لا تذكر أسعارًا أو أوقاتًا أو ضمانات لا يدعمها النظام.
   • لا تعدّل CAT ولا MP؛ قراءة فقط.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const HS_DISCOVER = (() => {
  const E = (s) => (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const I = (n, cls) => (typeof ic === 'function') ? ic(n, cls) : '';
  const IP = (n, kind, cls) => (typeof icp === 'function') ? icp(n, kind, cls) : '';

  /* وصف عام بحسب نوع القسم (kind في CAT) */
  const KIND_DESC = {
    fault: 'تشخيص وإصلاح الأعطال: نربطك بفني متخصص يعاين المشكلة ويحدد السبب ثم يقترح الحل المناسب.',
    job:   'تنفيذ أعمال وتركيبات حسب طلبك: صف المطلوب وسيتواصل معك الفني لتحديد التفاصيل.',
    paint: 'أعمال دهان وتشطيب: حدّد المكان وحالته الحالية ليتواصل معك الفني المناسب.',
    clean: 'خدمات تنظيف: حدّد المكان والمساحة ليجهّز الفني الخدمة المناسبة لك.'
  };
  const kindDesc = (c) => KIND_DESC[c && c.kind] || KIND_DESC.fault;

  const realProblems = (itemId) => CAT.problems(itemId).filter(p => !p.isOther);

  /* خطوات الحصول على الخدمة (مطابقة لمسار الويزارد الفعلي) */
  const stepsFor = (needsVisit) => [
    'اختر الجهاز أو نوع العمل وحدّد المشكلة',
    'أجب عن أسئلة قصيرة وأضف وصفًا وصورًا إن أحببت',
    'حدّد العنوان والموعد المناسب لك',
    'راجع طلبك وأرسله' + (needsVisit ? ' — قد تتطلب الخدمة زيارة معاينة من الفني' : ''),
    'تابع حالة الطلب والخطوة التالية من «طلباتي»'
  ];

  /* بيانات الصفحة بدون HTML */
  const describe = (kind, id) => {
    let c, it, p;
    if (kind === 'cat') { c = CAT.category(id); }
    else if (kind === 'item') { it = CAT.item(id); c = it && CAT.category(it.cat); }
    else if (kind === 'problem') { p = CAT.problem(id); it = p && CAT.item(p.item); c = it && CAT.category(it.cat); }
    if (!c) return null;
    const itemId = it ? it.id : '', probId = p ? p.id : '';
    const needsVisit = it ? CAT.needsVisit(itemId, probId) : true;
    const qs = it ? CAT.questionsFor(itemId, probId) : [];
    const safety = it ? CAT.safetyFor(itemId, probId) : (c.safety || []).filter(Boolean);
    const photos = p && p.attachments ? p.attachments.photos : 'optional';
    const needs = [];
    qs.filter(q => q.required).forEach(q => needs.push('إجابة: ' + q.label));
    if (it) {
      needs.push('وصف مختصر لما يحدث (يُكتب في خطوة الوصف)');
      needs.push(photos === 'required' ? 'صور للمشكلة (مطلوبة لهذه المشكلة)' : 'صور أو فيديو للمشكلة (اختيارية وتساعد الفني)');
    }
    needs.push('العنوان الذي ستُنفَّذ فيه الخدمة', 'موعد مناسب لك', 'اسمك ورقم موبايل للتواصل');
    return { c, it, p, desc: kindDesc(c), steps: stepsFor(needsVisit), needs, safety, questions: qs, needsVisit };
  };

  /* ═════════ مكونات العرض ═════════ */
  const crumbs = (d) => {
    const link = (k, id, name) => `<button type="button" class="crumb" data-disc="${k}|${E(id)}">${E(name)}</button>`;
    const cur = (name) => `<span class="crumb on" aria-current="page">${E(name)}</span>`;
    const a = [];
    if (d.p) { a.push(link('cat', d.c.id, d.c.name), link('item', d.it.id, d.it.name), cur(d.p.name)); }
    else if (d.it) { a.push(link('cat', d.c.id, d.c.name), cur(d.it.name)); }
    else { a.push(cur(d.c.name)); }
    return `<nav class="crumbs" aria-label="مسار التنقل">${a.join(I('chev', 'crumb-sep'))}</nav>`;
  };

  const hero = (badge, title, desc, d) => {
    const art = (typeof ART !== 'undefined' && ART[d.c.art]) ? ART[d.c.art] : '';
    return `<section class="dcard neon disc-hero">
      <div class="info"><span class="badge">${I(typeof icSec === 'function' ? icSec(d.c.icon) : d.c.icon)} ${E(badge)}</span>
        <h3>${E(title)}</h3><p>${E(desc)}</p></div>
      <div class="art">${art}</div></section>`;
  };

  const tagsRow = (d) => {
    const t = [];
    if (d.p && d.p.warn) t.push(`<span class="tag warn">${I('warn')} يتطلب حذرًا</span>`);
    t.push(d.needsVisit ? `<span class="tag">${I('pin')} قد تتطلب زيارة فني</span>` : `<span class="tag">${I('check')} غالبًا بدون زيارة</span>`);
    if (d.it) t.push(`<span class="tag">${I('list')} ${realProblems(d.it.id).length} مشكلة معروفة</span>`);
    return `<div class="meta">${t.join('')}</div>`;
  };

  const cta = (kind, id, label) =>
    `<button type="button" class="cta disc-cta" data-disc-order="${kind}|${E(id)}">${I('wrench')} ${E(label)}</button>`;

  const safetyBox = (list) => list.length
    ? `<div class="safety">${I('shield')}<div><b>تنبيهات أمان مهمة</b><span>${list.map(E).join('<br>')}</span></div></div>` : '';

  const stepsBox = (steps) =>
    `<h2 class="sec-title">${I('clock')}خطوات الحصول على الخدمة</h2>
     <div class="steps3">${steps.map((s, i) => `<div><i>${i + 1}</i><span>${E(s)}</span></div>`).join('')}</div>`;

  const needsBox = (needs) =>
    `<h2 class="sec-title">${I('list')}جهّز قبل الطلب</h2>
     <div class="glass neon disc-box">${needs.map(n => `<div class="cause">${E(n)}</div>`).join('')}</div>`;

  const probRow = (p, it, c) =>
    `<button type="button" class="prow glass neon" data-disc="problem|${E(p.id)}">${IP(icProb(p, it, c.id), 'pr')}
      <span class="tx">${E(p.name)}${p.warn ? `<small>${E('يتطلب حذرًا')}</small>` : ''}</span>${I('chev', 'chev')}</button>`;
  const itemRow = (i, c) => {
    const n = realProblems(i.id).length;
    return `<button type="button" class="prow glass neon" data-disc="item|${E(i.id)}">${IP(icItem(i, c.id), 'dev')}
      <span class="tx">${E(i.name)}<small>${n} مشكلة معروفة</small></span>${I('chev', 'chev')}</button>`;
  };

  /* ═════════ الصفحات ═════════ */
  const pageCat = (d) => {
    const items = CAT.items(d.c.id);
    const legacy = (typeof DEVICES !== 'undefined' && DEVICES[d.c.id])
      ? `<button type="button" class="cta ghost" data-dev="${E(d.c.id)}">${I('bulb')} نصائح وحلول سريعة قبل طلب فني</button>` : '';
    return `<div class="screen">${head(d.c.name, true)}
      ${crumbs(d)}
      ${hero('قسم', d.c.name, d.desc, d)}
      ${cta('cat', d.c.id, 'ابدأ طلبك في ' + d.c.name)}
      ${safetyBox(d.safety)}
      <h2 class="sec-title">${I('grid')}اختر الجهاز أو نوع العمل</h2>
      ${items.length ? `<div class="plist">${items.map(i => itemRow(i, d.c)).join('')}</div>`
        : (typeof UIK !== 'undefined' ? UIK.empty('grid', 'لا توجد خدمات متاحة في هذا القسم حاليًا') : '')}
      ${stepsBox(d.steps)}
      ${legacy}
    </div>`;
  };

  const pageItem = (d) => {
    const ps = realProblems(d.it.id);
    const sib = CAT.items(d.c.id).filter(i => i.id !== d.it.id).slice(0, 8);
    return `<div class="screen">${head(d.it.name, true)}
      ${crumbs(d)}
      ${hero(d.c.name, d.it.name, d.desc, d)}
      ${tagsRow(d)}
      ${cta('item', d.it.id, 'اطلب خدمة ' + d.it.name)}
      ${safetyBox(d.safety)}
      <h2 class="sec-title">${I('wrench')}المشكلات الشائعة</h2>
      ${ps.length ? `<div class="plist">${ps.map(p => probRow(p, d.it, d.c)).join('')}</div>`
        : (typeof UIK !== 'undefined' ? UIK.empty('wrench', 'لا توجد مشكلات محددة لهذا النوع', 'يمكنك إرسال طلب ووصف ما تحتاجه') : '')}
      <button type="button" class="cta ghost" data-disc-order="item|${E(d.it.id)}">${I('p-diagnose')} مش لاقي مشكلتي — أكمل الطلب وأصف ما يحدث</button>
      ${stepsBox(d.steps)}
      ${needsBox(d.needs)}
      ${sib.length ? `<h2 class="sec-title">${I('grid')}خدمات مرتبطة في ${E(d.c.name)}</h2>
        <div class="chips">${sib.map(i => `<button type="button" class="chip" data-disc="item|${E(i.id)}">${E(i.name)}</button>`).join('')}</div>` : ''}
    </div>`;
  };

  const pageProblem = (d) => {
    const others = realProblems(d.it.id).filter(x => x.id !== d.p.id).slice(0, 6);
    const rel = CAT.items(d.c.id).filter(i => i.id !== d.it.id).slice(0, 6);
    const qLabels = d.questions.slice(0, 5);
    return `<div class="screen">${head('تفاصيل المشكلة', true)}
      ${crumbs(d)}
      ${hero(d.it.name, d.p.name, d.desc, d)}
      ${tagsRow(d)}
      ${cta('problem', d.p.id, 'اطلب فنيًا لهذه المشكلة')}
      ${safetyBox(d.safety)}
      ${stepsBox(d.steps)}
      ${needsBox(d.needs)}
      ${qLabels.length ? `<h2 class="sec-title">${I('p-diagnose')}أسئلة سنسألك عنها</h2>
        <div class="glass neon disc-box">${qLabels.map(q => `<div class="cause">${E(q.label)}</div>`).join('')}
        ${d.questions.length > qLabels.length ? `<small class="disc-more">+${d.questions.length - qLabels.length} أسئلة أخرى داخل الطلب</small>` : ''}</div>` : ''}
      ${others.length ? `<h2 class="sec-title">${I('wrench')}مشكلات أخرى في ${E(d.it.name)}</h2>
        <div class="plist">${others.map(p => probRow(p, d.it, d.c)).join('')}</div>` : ''}
      <button type="button" class="cta ghost" data-disc="item|${E(d.it.id)}">${I('back')} كل مشكلات ${E(d.it.name)}</button>
      ${rel.length ? `<h2 class="sec-title">${I('grid')}خدمات مرتبطة</h2>
        <div class="chips">${rel.map(i => `<button type="button" class="chip" data-disc="item|${E(i.id)}">${E(i.name)}</button>`).join('')}</div>` : ''}
    </div>`;
  };

  const render = (kind, id) => {
    const d = describe(kind, id);
    if (!d) {
      const msg = (typeof UIK !== 'undefined')
        ? UIK.error('الصفحة المطلوبة لم تعد متاحة') : '<div class="empty"><p>الصفحة المطلوبة لم تعد متاحة</p></div>';
      return `<div class="screen">${head('غير متاح', true)}${msg}<button type="button" class="cta" data-go="sections">${I('grid')} تصفّح الخدمات</button></div>`;
    }
    return kind === 'cat' ? pageCat(d) : kind === 'item' ? pageItem(d) : pageProblem(d);
  };

  /* ═════════ التنقل ═════════ */
  const exists = (kind, id) => !!(kind === 'cat' ? CAT.category(id) : kind === 'item' ? CAT.item(id) : kind === 'problem' ? CAT.problem(id) : null);

  const open = (kind, id) => {
    if (!exists(kind, id)) return false;
    if (typeof show !== 'function' || typeof state !== 'object') return false;
    try { closeSheet(true); } catch {}
    state.stack.push('disc:' + kind + ':' + id);
    history.pushState({ disc: kind + ':' + id }, '');
    show('disc', kind + '|' + id);
    return true;
  };

  /* بدء الويزارد مع اختيار مسبق — يضبط الخطوة والتاريخ قبل العرض (فلا يظهر ويزارد على خطوة خاطئة) */
  const order = (kind, id) => {
    if (typeof startRequest !== 'function') return false;
    if (kind === 'cat') { if (!CAT.category(id)) return false; startRequest(id); return true; }
    if (kind === 'item') { const i = CAT.item(id); if (!i) return false; startRequest(i.cat, i.id); return true; }
    if (kind === 'problem') {
      const p = CAT.problem(id); if (!p) return false;
      startRequest(p.cat, p.item);
      if (typeof WZ !== 'undefined' && WZ) {
        WZ.problem = id; WZ.unknown = false;
        /* wzGo يسجّل الخطوة السابقة (2) في hist ويدفع إدخال رجوع ثم يعرض — فيعمل «رجوع» داخل الويزارد بشكل صحيح */
        if (typeof wzGo === 'function') wzGo(3);
        else { WZ.hist = [2]; WZ.step = 3; try { show('wizard'); } catch {} }
      }
      return true;
    }
    return false;
  };

  return { open, order, render, describe, exists };
})();

/* شاشة disc — arg = 'kind|id' */
if (typeof screens === 'object') {
  screens.disc = (arg) => { const [k, ...r] = String(arg || '').split('|'); return HS_DISCOVER.render(k, r.join('|')); };
}

document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-disc-order]');
  if (o) { e.preventDefault(); const [k, ...r] = String(o.dataset.discOrder).split('|'); HS_DISCOVER.order(k, r.join('|')); return; }
  const t = e.target.closest('[data-disc]');
  if (t) { e.preventDefault(); const [k, ...r] = String(t.dataset.disc).split('|'); HS_DISCOVER.open(k, r.join('|')); }
});
