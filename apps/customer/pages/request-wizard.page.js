/* ═══════════════════════════════════════════════════════════════
   هنصلحلك — رحلة إنشاء الطلب (Wizard) — الإصدار 7
   ───────────────────────────────────────────────────────────────
   V7 — 11 خطوة:
     0) اختيار القسم
     1) اختيار الجهاز/نوع العمل
     2) اختيار المشكلة (مع خيار "الفني يشخّص")
     3) الأسئلة التخصصية
     4) وصف المشكلة + ملاحظات
     5) المرفقات (صور + فيديو) — عبر AT (IndexedDB)
     6) الموقع والعنوان (مع عناوين محفوظة)
     7) الموعد (تفضيلات: يوم/فترة/مرونة)
     8) بيانات التواصل (اسم + هاتف + وسيلة تفضيل)
     9) مراجعة الطلب
    10) تأكيد الطلب (نجاح)
   + مسار "طلب عام/وصف يدوي" عند عدم وجود نتيجة بحث.

   يعتمد على: CAT (catalog.js v7)، AT (attachments.js)، MP (market.js v7),
             HS_SEARCH (search.js) اختياري، وأدوات app.js.

   ملاحظات:
   • يحفظ مسودة النموذج في MP.saveDraft بعد كل خطوة (عند وجود customerId).
   • يستعيد المسودة عند إعادة فتح wizard إن وجدت.
   • المرفقات مرتبطة بـ draftId قبل إنشاء الطلب، ثم تُنقل إلى reqId بعد الإنشاء.
   • يحافظ على التوقيعات العامة: startRequest(cat, itemId, desc) وWZ.
   • لا يحذف أي وظيفة من V6 (wzGo, wzSave, wzCheck, qField…).
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const WZ_STEPS11 = [
  'اختيار القسم',
  'الجهاز أو نوع العمل',
  'المشكلة',
  'التفاصيل التخصصية',
  'وصف المشكلة',
  'المرفقات',
  'الموقع والعنوان',
  'الموعد',
  'بيانات التواصل',
  'المراجعة',
  'التأكيد'
];
const UNKNOWN_TXT = 'مش عارف أحدد المشكلة — محتاج فني يفحصها';

/* ═════════ حالة النموذج ═════════ */
let WZ = null;
let WZ_DRAFT_ID = '';   /* معرّف المسودة الحالي (للمرفقات) */

/* ═════════ أدوات ═════════ */
const _isFn = f => typeof f === 'function';
const safeIc = (n, cls) => (typeof ic === 'function') ? ic(n, cls) : '';
const safeIcp = (n, kind, cls) => (typeof icp === 'function') ? icp(n, kind, cls) : '';
const safeIcSec = (n) => (typeof icSec === 'function') ? icSec(n) : n;
const safeIcItem = (it, catId) => (typeof icItem === 'function') ? icItem(it, catId) : 'p-diagnose';
const safeIcProb = (p, it, catId) => (typeof icProb === 'function') ? icProb(p, it, catId) : 'p-diagnose';
const _esc = (typeof esc === 'function') ? esc : (s => String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));

/* هل نحن في وضع الواجهة (يستدعي app.js's show)؟ */
const hasUI = () => typeof show === 'function' && typeof state === 'object';

/* ═════════ نموذج جديد ═════════ */
function wzNew(cat, itemId, desc){
  const u = (typeof store !== 'undefined' && store.get('user', null)) || {};
  const w = {
    step: 0, hist: [],
    cat: '', item: '', problem: '', unknown: false,
    answers: {}, desc: desc || '', note: '',
    attachments: [],    /* [ids] فقط بعد الرفع — Blobs في IndexedDB */
    attachmentMeta: [], /* [{id,kind,name,size,thumb}] للعرض السريع */
    video: '',          /* اسم الفيديو (توافق خلفي) — الفيديو الفعلي مرفق في attachmentMeta */
    address: { id:'', label:'', gov:'', area:'', addr:'', detail:'', type:'home', save:true, default:false, geo:null },
    schedule: { date:'', period:'', slot:'', flexible:false, whenNote:'' },
    contact: { name: u.name || '', phone: u.phone || '', method: 'call', note: '' },
    done: null,
    __reviewView: 'grid'
  };
  if (cat && CAT.category(cat) && CAT.category(cat).active) {
    w.cat = cat; w.step = 1;
    const it = itemId && (CAT.item(itemId) || CAT.item(cat + '/' + itemId));
    if (it && it.cat === cat && it.active) { w.item = it.id; w.step = 2; }
  }
  /* استعادة الصورة القديمة إن وُجدت من كاميرا الواجهة الرئيسية */
  if (typeof PENDING_PHOTO !== 'undefined' && PENDING_PHOTO) {
    /* نحولها إلى Blob ونحوّل إلى attachment */
    try {
      const arr = PENDING_PHOTO.split(',');
      const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
      const bin = atob(arr[1]);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const blob = new Blob([u8], {type: mime});
      const file = new File([blob], 'camera.jpg', {type: mime});
      WZ_PENDING_FILE = file;
    } catch {}
    PENDING_PHOTO = null;
  }
  return w;
}
let WZ_PENDING_FILE = null;

/* ═════════ فتح النموذج ═════════ */
function startRequest(cat, itemId, desc){
  WZ = wzNew(cat, itemId, desc);
  WZ_DRAFT_ID = 'dr_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  if (hasUI()) {
    try { closeSheet(true); } catch {}
    state.stack.push('wizard'); history.pushState({wz:1}, ''); show('wizard');
  }
}

/* ═════════ مراجعة اتساق الاختيارات بعد أي تغيير ═════════ */
function wzReconcile(){
  if (!WZ) return;
  const v = CAT.valid({cat: WZ.cat, item: WZ.item, problem: WZ.problem});
  const itemChanged = v.item !== WZ.item, probChanged = v.problem !== WZ.problem;
  WZ.cat = v.cat; WZ.item = v.item; WZ.problem = v.problem;
  if (!v.problem && !WZ.unknown) WZ.problem = '';
  if (itemChanged || !v.item) WZ.answers = {};
  if (!v.item) { WZ.problem = ''; WZ.unknown = false; }
}

const wzGo = n => {
  if (!WZ) return;
  WZ.hist.push(WZ.step);
  WZ.step = n;
  wzSaveDraft();
  if (hasUI()) {
    state.stack.push('wizard'); history.pushState({wz:1}, ''); show('wizard');
  }
};

/* ═════════ حفظ/استعادة المسودة ═════════ */
function wzSaveDraft(){
  if (!WZ || !MP || !MP.saveDraft) return;
  try {
    const u = (typeof me === 'function') ? me() : null;
    if (!u) return;
    MP.saveDraft(u.id, {
      step: WZ.step,
      data: {
        cat: WZ.cat, item: WZ.item, problem: WZ.problem, unknown: WZ.unknown,
        answers: WZ.answers, desc: WZ.desc, note: WZ.note,
        attachments: WZ.attachments, attachmentMeta: WZ.attachmentMeta, video: WZ.video,
        address: WZ.address, schedule: WZ.schedule, contact: WZ.contact,
        draftId: WZ_DRAFT_ID
      }
    });
  } catch (e) { /* best-effort */ }
}
function wzRestoreDraft(customerId){
  if (!MP || !MP.getDraft) return false;
  try {
    const d = MP.getDraft(customerId);
    if (!d || !d.data) return false;
    /* استعادة فقط إن كانت هناك بيانات جوهرية */
    const hasData = d.data.cat || d.data.item;
    if (!hasData) return false;
    WZ = wzNew();
    Object.assign(WZ, {
      step: typeof d.step === 'number' ? Math.min(d.step, 9) : 0,
      cat: d.data.cat || '', item: d.data.item || '', problem: d.data.problem || '',
      unknown: !!d.data.unknown, answers: d.data.answers || {},
      desc: d.data.desc || '', note: d.data.note || '',
      attachments: d.data.attachments || [], attachmentMeta: d.data.attachmentMeta || [],
      video: d.data.video || '',
      address: d.data.address || WZ.address,
      schedule: d.data.schedule || WZ.schedule,
      contact: d.data.contact || WZ.contact
    });
    WZ_DRAFT_ID = d.data.draftId || ('dr_' + d.id);
    return true;
  } catch { return false; }
}
function wzClearDraft(){
  try {
    const u = (typeof me === 'function') ? me() : null;
    if (u && MP && MP.clearDraft) MP.clearDraft(u.id);
  } catch {}
}

/* ═════════ عناصر التحقق حسب الخطوة ═════════ */
function wzCheckStep(step){
  if (!WZ) return 'لا توجد بيانات';
  const w = WZ;
  if (step === 0) { if (!w.cat) return 'اختر القسم'; return ''; }
  if (step === 1) { if (!w.item) return 'اختر الجهاز أو نوع العمل'; return ''; }
  if (step === 2) { if (!w.problem && !w.unknown) return 'اختر المشكلة أو اطلب من الفني تشخيصها'; return ''; }
  if (step === 3) {
    const qs = CAT.questionsFor(w.item, w.unknown ? '' : w.problem);
    const missing = qs.find(q => q.required && !String(w.answers[q.id] || '').trim());
    if (missing) return 'أجب عن: ' + missing.label;
    return '';
  }
  if (step === 4) {
    if (!w.unknown && (w.desc || '').trim().length < 5) return 'اكتب وصفًا للمشكلة (5 حروف على الأقل)';
    const p = w.problem && CAT.problem(w.problem);
    return '';
  }
  if (step === 5) {
    const p = w.problem && CAT.problem(w.problem);
    if (p && p.attachments && p.attachments.photos === 'required' && !(w.attachmentMeta || []).some(a => a.kind === 'image'))
      return 'هذه المشكلة تحتاج صورة واحدة على الأقل قبل المتابعة';
    return '';
  }
  if (step === 6) {
    if (!w.address.gov) return 'اختر المحافظة';
    if (!w.address.area.trim()) return 'اكتب المنطقة';
    if (w.address.addr.trim().length < 5) return 'اكتب العنوان بالتفصيل';
    return '';
  }
  if (step === 7) {
    if (!w.schedule.flexible) {
      if (!w.schedule.date) return 'اختر اليوم';
      const d = new Date(w.schedule.date + 'T00:00:00');
      if (isNaN(d.getTime())) return 'التاريخ غير صحيح';
      const today = new Date(); today.setHours(0,0,0,0);
      if (d < today) return 'اختر تاريخًا قادمًا';
      if (!w.schedule.period) return 'اختر الفترة المفضلة';
    }
    return '';
  }
  if (step === 8) {
    if (!w.contact.name.trim()) return 'اكتب اسمك';
    const phone = w.contact.phone.replace(/[\s-]/g, '');
    if (!/^(?:01[0125][0-9]{8}|\+?201[0125][0-9]{8})$/.test(phone)) return 'اكتب رقم موبايل مصري صحيحًا مثل 01012345678';
    if (!w.contact.method) return 'اختر وسيلة التواصل';
    return '';
  }
  if (step === 9) { /* مراجعة */ return ''; }
  return '';
}

/* ═════════ إتاحة التحقق والتنقل داخل النموذج ═════════ */
function wzValidationTarget(step){
  const w = WZ;
  if (!w) return null;
  if (step === 0) return document.querySelector('[data-wz-cat]');
  if (step === 1) return document.querySelector('[data-wz-item]');
  if (step === 2) return document.querySelector('[data-wz-prob], [data-wz-unknown]');
  if (step === 3) {
    const missing = CAT.questionsFor(w.item, w.unknown ? '' : w.problem).find(q => q.required && !String(w.answers[q.id] || '').trim());
    return missing ? document.getElementById('q-' + missing.id) : null;
  }
  if (step === 4) return !w.unknown && (w.desc || '').trim().length < 5 ? document.getElementById('wz-desc') : null;
  if (step === 5) return (w.attachmentMeta || []).some(a => a.kind === 'image') ? null : document.querySelector('[data-act="wzAddPhoto"]');
  if (step === 6) return !w.address.gov ? document.getElementById('wz-gov') : !w.address.area.trim() ? document.getElementById('wz-area') : document.getElementById('wz-addr');
  if (step === 7) return !w.schedule.flexible ? (!w.schedule.date ? document.getElementById('wz-date-input') : !w.schedule.period ? document.querySelector('[data-wz-period]') : null) : null;
  if (step === 8) return !w.contact.name.trim() ? document.getElementById('wz-name') : !/^(?:01[0125][0-9]{8}|\+?201[0125][0-9]{8})$/.test(w.contact.phone.replace(/[\s-]/g, '')) ? document.getElementById('wz-phone') : !w.contact.method ? document.getElementById('wz-method') : null;
  return null;
}
function wzClearValidationError(){
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
  const root = document.querySelector('.screen');
  if (!root) return;
  const error = root.querySelector('#wz-validation-error');
  if (error) { error.hidden = true; error.textContent = ''; }
  root.querySelectorAll('[aria-invalid="true"]').forEach(el => {
    el.removeAttribute('aria-invalid');
    if (el.dataset.wzOriginalDescribedby !== undefined) {
      if (el.dataset.wzOriginalDescribedby) el.setAttribute('aria-describedby', el.dataset.wzOriginalDescribedby);
      else el.removeAttribute('aria-describedby');
      delete el.dataset.wzOriginalDescribedby;
    } else el.removeAttribute('aria-describedby');
  });
}
function wzReportValidationError(message){
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') { if (typeof toast === 'function') toast(message); return; }
  const root = document.querySelector('.screen');
  if (!root) { if (typeof toast === 'function') toast(message); return; }
  const error = root.querySelector('#wz-validation-error');
  if (error) { error.textContent = message; error.hidden = false; }
  const target = wzValidationTarget(WZ.step);
  if (target) {
    if (target.hasAttribute('aria-describedby')) target.dataset.wzOriginalDescribedby = target.getAttribute('aria-describedby');
    target.setAttribute('aria-invalid', 'true');
    target.setAttribute('aria-describedby', [target.dataset.wzOriginalDescribedby, 'wz-validation-error'].filter(Boolean).join(' '));
    try { target.focus({preventScroll:true}); } catch { target.focus(); }
  } else if (error) {
    error.setAttribute('tabindex', '-1');
    try { error.focus({preventScroll:true}); } catch { error.focus(); }
  }
}

/* ═════════ الحقول الديناميكية ═════════ */
function qField(q, v){
  v = v == null ? '' : v;
  const id = 'q-' + q.id, lab = `<label for="${id}">${_esc(q.label)}${q.required ? ' *' : ''}</label>`;
  if (q.type === 'select') {
    return `<div>${lab}<select id="${id}" data-q="${q.id}" ${q.required ? 'required aria-required="true"' : ''}><option value="">اختر</option>${q.options.map(o=>`<option ${o===v?'selected':''}>${_esc(o)}</option>`).join('')}</select></div>`;
  }
  if (q.type === 'number') {
    return `<div>${lab}<input id="${id}" data-q="${q.id}" ${q.required ? 'required aria-required="true"' : ''} type="number" inputmode="numeric" min="0" value="${_esc(v)}"></div>`;
  }
  return `<div>${lab}<input id="${id}" data-q="${q.id}" ${q.required ? 'required aria-required="true"' : ''} value="${_esc(v)}"></div>`;
}

/* ═════════ شريط التقدم ═════════ */
function wzProgressBar(step){
  /* نعرض 10 شرائح لأن التأكيد شاشة نجاح وليست خطوة */
  const shown = Math.min(step, 9);
  return `<div class="wz-bar" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${shown+1}">${Array.from({length:10}).map((_,i)=>`<i class="${i<shown?'done':i===shown?'on':''}"></i>`).join('')}</div>
    <div class="wz-cap">${step<10?`الخطوة ${step+1} من 10 — ${WZ_STEPS11[step]}`:'تم إرسال الطلب'}</div>`;
}

/* ═════════ مسار crumb ═════════ */
function crumbHtml(w){
  const b = CAT.breadcrumb(w);
  if (!b.length && !w.unknown) return '';
  const go = {cat:0, item:1, problem:2};
  const parts = b.map(x => `<button type="button" data-wz-edit="${go[x.k]}">${_esc(x.name)}</button>`).join('<i>‹</i>');
  const unk = w.unknown && w.item ? '<i>‹</i><span class="unk">الفني يشخّص</span>' : '';
  return `<nav class="crumbs" aria-label="مسار الاختيارات">${parts}${unk}</nav>`;
}

/* ═════════ تنسيق التاريخ/الوقت ═════════ */
const fmtDateShort = s => { try { return new Date(s + 'T00:00:00').toLocaleDateString('ar-EG', {day:'numeric', month:'long', weekday:'short'}); } catch { return s; } };
const fmtTime = (dateStr, slot) => {
  if (!dateStr) return 'لم يُحدد';
  const map = { morning: 'صباحًا (9–12)', noon: 'ظهرًا (12–3)', evening: 'مساءً (3–8)' };
  return fmtDateShort(dateStr) + (slot ? ' — ' + (map[slot] || slot) : '');
};

/* ═════════ عرض الأيام السبعة القادمة كشرائح ═════════ */
function dateChipsHtml(current){
  const out = [];
  const today = new Date(); today.setHours(0,0,0,0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0,10);
    const lbl = i === 0 ? 'النهاردة' : i === 1 ? 'غدًا' : d.toLocaleDateString('ar-EG', {weekday:'short', day:'numeric'});
    out.push(`<button type="button" class="chip date-chip ${current===iso?'on':''}" data-wz-date="${iso}" aria-pressed="${current===iso}">${_esc(lbl)}</button>`);
  }
  return `<div class="chips" role="group" aria-label="اختيار اليوم المفضل">${out.join('')}</div>`;
}

/* ═════════ شاشة المرفقات ═════════ */
async function renderAttachmentsBlock(w){
  /* نعرض ملخص قائمة المرفقات الحالية من WZ_DRAFT_ID */
  let list = [];
  try { if (typeof AT !== 'undefined') list = await AT.listForReq(''); } catch {}
  /* المرفقات قبل إنشاء الطلب: reqId فارغ، ونربطها بـ draftId */
  const draftList = (typeof AT !== 'undefined' && AT._draftListCache) ? AT._draftListCache(WZ_DRAFT_ID) : [];
  const all = list.concat(draftList);
  const attach = w.attachmentMeta || [];
  const chips = attach.map(a => `
    <span class="th">
      ${a.thumb ? `<img src="${a.thumb}" alt="">` : (a.kind==='video' ? safeIc('file-up') : safeIc('image-up'))}
      <button type="button" data-wz-att-rm="${a.id}" aria-label="حذف المرفق: ${_esc(a.name || 'ملف')}">×</button>
      <em class="th-meta">${(a.size ? Math.round(a.size/1024)+'KB' : '')}</em>
    </span>`).join('');
  const limits = (typeof AT !== 'undefined') ? AT.limits() : {maxFiles:6, maxImageMB:8, maxVideoMB:40};
  return `<div class="form">
    <div class="thumbs">${chips}
      ${attach.length < limits.maxFiles ? `
        <button type="button" class="th add" data-act="wzAddPhoto">${safeIc('camera')}<small>صور</small></button>
        <button type="button" class="th add" data-act="wzAddVideo">${safeIc('file-up')}<small>فيديو</small></button>
      ` : ''}
    </div>
    <small class="hint">الحد الأقصى ${limits.maxFiles} مرفقات • صورة ≤ ${limits.maxImageMB}MB • فيديو ≤ ${limits.maxVideoMB}MB</small>
    <div class="need">${safeIc('info')}<span>المرفقات تُخزَّن على جهازك فقط في الوضع التجريبي، ويمكن حذفها قبل إرسال الطلب.</span></div>
  </div>`;
}

/* ═════════ شاشة النموذج (تُستدعى من screens.wizard) ═════════ */
Object.assign(screens, {
  wizard(){
    if (!WZ) {
      const u = (typeof me === 'function') ? me() : null;
      const draft = u && MP && MP.getDraft ? MP.getDraft(u.id) : null;
      if (draft && draft.data && (draft.data.cat || draft.data.item)) {
        return `<div class="screen">${typeof head === 'function' ? head('استكمال طلبك') : ''}<h1 class="wz-a11y-heading" tabindex="-1" data-wz-heading>استكمال طلبك</h1><div class="card2"><h3>لديك طلب غير مكتمل</h3><p class="hint">يمكنك استكماله من حيث توقفت، أو بدء طلب جديد.</p><button type="button" class="cta" data-act="wzResume">استكمال المسودة</button><button type="button" class="cta ghost" data-act="wzDiscardDraft">حذف المسودة</button></div></div>`;
      }
      if (hasUI()) return screens.home();
      return '';
    }
    wzReconcile();
    const w = WZ;
    const c = CAT.category(w.cat), it = CAT.item(w.item), pr = w.problem ? CAT.problem(w.problem) : null;

    let body = '';

    /* 0 — اختيار القسم */
    if (w.step === 0) {
      body = `<div class="cgrid" role="group" aria-label="اختيار القسم">${CAT.categories().map(x => `
        <button type="button" class="icard glass neon ${x.id===w.cat?'sel':''}" data-wz-cat="${x.id}" aria-pressed="${x.id===w.cat}">
          ${safeIcp(safeIcSec(x.icon), 'dev')}<span>${_esc(x.name)}</span>
        </button>`).join('')}</div>`;
    }

    /* 1 — الجهاز/نوع العمل */
    if (w.step === 1) {
      body = crumbHtml(w) + `<div class="cgrid" role="group" aria-label="اختيار الجهاز أو نوع العمل">${CAT.items(w.cat).map(i => `
        <button type="button" class="icard glass neon ${i.id===w.item?'sel':''}" data-wz-item="${i.id}" aria-pressed="${i.id===w.item}">
          ${safeIcp(safeIcItem(i, c.id), 'dev')}<span>${_esc(i.name)}</span>
        </button>`).join('')}</div>`;
    }

    /* 2 — المشكلة */
    if (w.step === 2) {
      const ps = CAT.problems(w.item);
      body = crumbHtml(w) + `<h2 class="sec-title">${safeIc('wrench')}إيه المشكلة في ${_esc(it.name)}؟</h2>
        <div class="plist" role="group" aria-label="اختيار المشكلة">${ps.map(p => `
          <button type="button" class="prow glass neon ${p.id===w.problem && !w.unknown ? 'sel' : ''}" data-wz-prob="${p.id}" aria-pressed="${p.id===w.problem && !w.unknown}">
            ${safeIcp(safeIcProb(p, it, c.id), 'pr')}<span class="tx">${_esc(p.name)}</span>${safeIc('chev','chev')}
          </button>`).join('')}</div>
        <button type="button" class="cta ghost unk-btn ${w.unknown?'sel':''}" data-wz-unknown aria-pressed="${w.unknown}">${safeIc('p-diagnose')} ${UNKNOWN_TXT}</button>`;
    }

    /* 3 — الأسئلة التخصصية */
    if (w.step === 3) {
      const qs = CAT.questionsFor(w.item, w.unknown ? '' : w.problem);
      const sf = CAT.safetyFor(w.item, w.unknown ? '' : w.problem);
      body = crumbHtml(w) +
        (sf.length ? `<div class="need warn">${safeIc('warn')}<span>${sf.map(_esc).join('<br>')}</span></div>` : '') +
        `<div class="form">${qs.length ? qs.map(q => qField(q, w.answers[q.id])).join('') : `<div class="need">${safeIc('info')}<span>لا توجد أسئلة إضافية — يمكنك الانتقال للخطوة التالية.</span></div>`}</div>`;
    }

    /* 4 — وصف المشكلة */
    if (w.step === 4) {
      const sugg = w.unknown ? `${it ? it.name : ''}: مش عارف سبب المشكلة بالظبط` : (pr ? `${it ? it.name : ''} — ${pr.name}` : '');
      body = crumbHtml(w) + `<div class="form">
        <div>
          <label for="wz-desc">وصف المشكلة${w.unknown ? ' (اختياري)' : ' *'}</label>
          <textarea id="wz-desc" placeholder="اكتب بإيجاز اللي بيحصل، إمتى بدأ، وأي تفاصيل تساعد الفني…">${_esc(w.desc)}</textarea>
          ${sugg && !w.desc ? `<button type="button" class="chip" data-wz-sugg="${_esc(sugg)}">استخدم وصفًا مقترحًا</button>` : ''}
        </div>
        <div><label for="wz-note">ملاحظات إضافية</label><textarea id="wz-note" placeholder="أي تفاصيل تساعد الفني">${_esc(w.note)}</textarea></div>
      </div>`;
    }

    /* 5 — المرفقات */
    if (w.step === 5) {
      body = `<div id="wz-attach-block">${renderAttachmentsBlockSync(w)}</div>`;
      /* نحدّث المحتوى لاحقاً عند الرسم بعد استرجاع المرفقات */
      setTimeout(async () => {
        try {
          const html = await renderAttachmentsBlock(w);
          const el = document.getElementById('wz-attach-block');
          if (el) el.innerHTML = html;
        } catch {}
      }, 0);
    }

    /* 6 — الموقع والعنوان */
    if (w.step === 6) {
      const u = (typeof me === 'function') ? me() : null;
      let savedAddrs = [];
      try { if (u && MP) savedAddrs = MP.addressesFor(u.id); } catch {}
      const addrChips = savedAddrs.length ? `
        <div class="lbl">عناوين محفوظة</div>
        <div class="chips">${savedAddrs.map(a => `
          <button type="button" class="chip ${w.address.id===a.id?'on':''}" data-wz-addr-pick="${a.id}">
            ${safeIc('pin')} ${_esc(a.label || a.addr.slice(0,20))}
          </button>`).join('')}
        </div>` : '';
      body = crumbHtml(w) + `<div class="form">
        ${addrChips}
        <div><label for="wz-gov">المحافظة *</label><select id="wz-gov" required aria-required="true"><option value="">اختر المحافظة</option>${(MP ? MP.GOVS : []).map(g=>`<option ${g===w.address.gov?'selected':''}>${_esc(g)}</option>`).join('')}</select></div>
        <div><label for="wz-area">المنطقة *</label><input id="wz-area" required aria-required="true" list="areas" value="${_esc(w.address.area)}" placeholder="المنطقة / الحي"><datalist id="areas">${((MP && MP.AREA_HINTS[w.address.gov]) || []).map(a=>`<option value="${_esc(a)}">`).join('')}</datalist></div>
        <div><label for="wz-addr">الشارع ورقم العقار *</label><input id="wz-addr" required aria-required="true" value="${_esc(w.address.addr)}" placeholder="الشارع، رقم العمارة"></div>
        <div><label for="wz-detail">الدور / الشقة / تفاصيل</label><input id="wz-detail" value="${_esc(w.address.detail)}" placeholder="الدور، الشقة، علامة مميزة"></div>
        <div><label for="wz-addr-type">نوع العنوان</label><select id="wz-addr-type"><option value="home" ${w.address.type==='home'?'selected':''}>منزل</option><option value="work" ${w.address.type==='work'?'selected':''}>عمل</option><option value="other" ${w.address.type==='other'?'selected':''}>أخرى</option></select></div>
        <div><label for="wz-label">اسم مختصر (اختياري)</label><input id="wz-label" value="${_esc(w.address.label)}" placeholder="مثل: البيت، المكتب"></div>
        <label class="hint" style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="wz-save-addr" ${w.address.save?'checked':''} style="width:auto"> احفظ هذا العنوان لاستخدامه لاحقًا</label>
        <label class="hint" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="wz-default-addr" ${w.address.default?'checked':''} style="width:auto"> اجعله العنوان الافتراضي</label>
        <button type="button" class="cta ghost" style="margin-top:8px;min-height:46px" data-act="wzGeo">${safeIc('pin')} ${w.address.geo ? 'تم تحديد موقعك' : 'استخدم موقعي الحالي (بموافقتك)'}</button>
      </div>`;
    }

    /* 7 — الموعد */
    if (w.step === 7) {
      const s = w.schedule;
      body = `<div class="form">
        <label class="hint" style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" id="wz-flexible" ${s.flexible?'checked':''} style="width:auto"> موعد مرن (سأتفق مع الفني)</label>
        <div id="wz-date-wrap" style="${s.flexible ? 'display:none' : ''}">
          <label for="wz-date-input">اليوم المفضل *</label>
          ${dateChipsHtml(s.date)}
          <div style="margin-top:10px"><input type="date" id="wz-date-input" value="${_esc(s.date)}" min="${new Date().toISOString().slice(0,10)}"></div>
        </div>
        <div id="wz-period-wrap" style="${s.flexible ? 'display:none' : ''}">
          <span class="wz-field-label" id="wz-period-label">الفترة المفضلة *</span>
          <div class="chips" role="group" aria-labelledby="wz-period-label">
            <button type="button" class="chip ${s.period==='morning'?'on':''}" data-wz-period="morning" aria-pressed="${s.period==='morning'}">صباحًا (9–12)</button>
            <button type="button" class="chip ${s.period==='noon'?'on':''}" data-wz-period="noon" aria-pressed="${s.period==='noon'}">ظهرًا (12–3)</button>
            <button type="button" class="chip ${s.period==='evening'?'on':''}" data-wz-period="evening" aria-pressed="${s.period==='evening'}">مساءً (3–8)</button>
          </div>
        </div>
        <div><label for="wz-when-note">ملاحظات على الموعد</label><input id="wz-when-note" value="${_esc(s.whenNote)}" placeholder="مثل: بعد العصر، أو أي وقت بعد الظهر"></div>
        <div class="need">${safeIc('info')}<span>الموعد تفضيل مبدئي — سيُؤكَّد مع مقدم الخدمة قبل التنفيذ.</span></div>
      </div>`;
    }

    /* 8 — بيانات التواصل */
    if (w.step === 8) {
      body = `<div class="form">
        <div><label for="wz-name">الاسم *</label><input id="wz-name" required aria-required="true" value="${_esc(w.contact.name)}" placeholder="اسمك" autocomplete="name"></div>
        <div><label for="wz-phone">رقم الهاتف *</label><input id="wz-phone" required aria-required="true" type="tel" inputmode="tel" value="${_esc(w.contact.phone)}" placeholder="01xxxxxxxxx" pattern="[0-9+ ]{8,16}" autocomplete="tel"></div>
        <div><label for="wz-method">وسيلة التواصل المفضلة</label>
          <select id="wz-method" required aria-required="true">
            <option value="call" ${w.contact.method==='call'?'selected':''}>مكالمة هاتفية</option>
            <option value="whatsapp" ${w.contact.method==='whatsapp'?'selected':''}>واتساب</option>
            <option value="sms" ${w.contact.method==='sms'?'selected':''}>رسالة نصية</option>
          </select>
        </div>
        <div><label for="wz-contact-note">ملاحظات إضافية</label><textarea id="wz-contact-note" placeholder="أي تفاصيل يحتاجها الفني قبل الوصول">${_esc(w.contact.note)}</textarea></div>
      </div>`;
    }

    /* 9 — مراجعة الطلب */
    if (w.step === 9) {
      const qs = CAT.questionsFor(w.item, w.unknown ? '' : w.problem).filter(q => w.answers[q.id]);
      const sec = (t, s, x) => `<div class="rsec">
        <div class="rh"><small>${_esc(t)}</small><button type="button" data-wz-edit="${s}">تعديل</button></div>${x}
      </div>`;
      const addrText = [w.address.gov, w.address.area, w.address.addr, w.address.detail].filter(Boolean).join(' — ');
      const schedText = w.schedule.flexible ? 'موعد مرن — سأتفق مع الفني' : fmtTime(w.schedule.date, w.schedule.period);
      const attCount = (w.attachmentMeta || []).length;
      body = `<div class="sumbox glass neon">
        ${sec('الخدمة', 0, `<b>${_esc(c ? c.name : '')} ← ${_esc(it ? it.name : '')}</b>`)}
        ${sec('المشكلة', 2, `<b>${w.unknown ? _esc(UNKNOWN_TXT.split('—')[0]) : _esc(pr ? pr.name : '')}</b>`)}
        ${sec('الأسئلة', 3, qs.length ? qs.map(q => `<div class="kv"><small>${_esc(q.label)}</small> ${_esc(w.answers[q.id])}</div>`).join('') : '<span class="hint">لا توجد إجابات</span>')}
        ${sec('الوصف', 4, `<b>${_esc(w.desc) || '—'}</b>${w.note ? `<div class="kv"><small>ملاحظات</small> ${_esc(w.note)}</div>` : ''}`)}
        ${sec('المرفقات', 5, attCount ? `<b>${attCount} مرفق</b>${(w.attachmentMeta||[]).slice(0,3).map(a => a.thumb ? `<img src="${a.thumb}" class="preview-thumb" alt="">` : '').join('')}` : '<span class="hint">لا مرفقات</span>')}
        ${sec('الموقع', 6, `<b>${_esc(addrText)}</b>`)}
        ${sec('الموعد', 7, `<b>${_esc(schedText)}</b>${w.schedule.whenNote ? `<div class="kv">${_esc(w.schedule.whenNote)}</div>` : ''}`)}
        ${sec('التواصل', 8, `<b>${_esc(w.contact.name)} • ${_esc(w.contact.phone)}</b><div class="kv">${({call:'مكالمة',whatsapp:'واتساب',sms:'رسالة'})[w.contact.method] || w.contact.method}</div>`)}
      </div>
      ${CAT.needsVisit(w.item, w.unknown ? '' : w.problem) ? `<div class="need">${safeIc('info')}<span>الفني سيعاين المشكلة أولًا ثم يحدد التكلفة النهائية.</span></div>` : ''}
      <div class="demo-banner">${safeIc('info')}<span>وضع العرض التجريبي — الطلب يُحفظ محليًا ولا يُرسل لفنيين حقيقيين.</span></div>`;
    }

    /* 10 — التأكيد */
    if (w.step === 10 && w.done) {
      const r = MP.get('serviceRequests', w.done.id);
      body = `<div class="done glass neon">
        ${safeIc('check')}
        <h3>تم إرسال طلبك</h3>
        <p><b>${_esc(w.done.no)}</b></p>
        <p class="hint">${_esc(c ? c.name : '')} ← ${_esc(it ? it.name : '')}${w.unknown ? '' : ' ← ' + _esc(pr ? pr.name : '')}</p>
        <p class="hint">${{received:'تم الاستلام',searching:'جارٍ البحث عن مقدم خدمة',sent:'تم إرسال الطلب لمقدم الخدمة'}[r ? r.status : 'received'] || ''}</p>
        <button type="button" class="cta" data-act="wzTrack">${safeIc('clock')} متابعة الطلب</button>
        <button type="button" class="cta ghost" data-go="home">${safeIc('home')} الرئيسية</button>
      </div>`;
    }

    /* شريط الأزرار */
    let nav = '';
    if (w.step >= 0 && w.step <= 9) {
      const nextBtn = w.step === 9
        ? `<button type="button" class="cta" style="margin:0" data-act="wzSubmit">${safeIc('check')} تأكيد وإرسال الطلب</button>`
        : `<button type="button" class="cta" style="margin:0" data-act="wzNext">التالي</button>`;
      const backBtn = w.step === 0
        ? ''
        : `<button type="button" class="cta ghost" style="margin:0" data-act="wzPrev">رجوع</button>`;
      /* خطوة 0 لها زر رجوع للمتصفح فقط */
      if (w.step === 0) {
        nav = `<div class="row2" style="margin-top:14px"><button type="button" class="cta" style="margin:0" data-act="wzNext" ${!w.cat?'disabled':''}>التالي</button></div>`;
      } else {
        nav = `<div class="row2" style="margin-top:14px">${nextBtn}${backBtn}</div>`;
      }
    }

    /* حفظ أي حالة عرض */
    const wzHead = hasUI() ? (typeof head === 'function' ? head(w.step === 10 ? 'تأكيد الطلب' : 'طلب خدمة', w.step < 10) : '') : '';
    const stepHeading = w.step < 10 ? `<h1 class="wz-a11y-heading" tabindex="-1" data-wz-heading>${_esc(WZ_STEPS11[w.step])}</h1>` : `<h1 class="wz-a11y-heading" tabindex="-1" data-wz-heading>تم إرسال الطلب بنجاح</h1>`;
    return `<div class="screen">${wzHead}${stepHeading}${w.step < 10 ? wzProgressBar(w.step) : ''}${body}<p id="wz-validation-error" class="wz-validation-error" role="alert" aria-live="assertive" hidden></p>${nav}</div>`;
  }
});

/* عرض المرفقات متزامن (بديل سريع قبل استرجاع الـ async) */
function renderAttachmentsBlockSync(w){
  const attach = w.attachmentMeta || [];
  const limits = (typeof AT !== 'undefined') ? AT.limits() : {maxFiles:6, maxImageMB:8, maxVideoMB:40};
  const chips = attach.map(a => `
    <span class="th">
      ${a.thumb ? `<img src="${a.thumb}" alt="">` : (a.kind === 'video' ? safeIc('file-up') : safeIc('image-up'))}
      <button type="button" data-wz-att-rm="${a.id}" aria-label="حذف المرفق: ${_esc(a.name || 'ملف')}">×</button>
      <em class="th-meta">${a.size ? Math.round(a.size/1024)+'KB' : ''}</em>
    </span>`).join('');
  return `<div class="form">
    <div class="thumbs">${chips}
      ${attach.length < limits.maxFiles ? `
        <button type="button" class="th add" data-act="wzAddPhoto">${safeIc('camera')}<small>صور</small></button>
        <button type="button" class="th add" data-act="wzAddVideo">${safeIc('file-up')}<small>فيديو</small></button>
      ` : ''}
    </div>
    <small class="hint">الحد الأقصى ${limits.maxFiles} مرفقات • صورة ≤ ${limits.maxImageMB}MB • فيديو ≤ ${limits.maxVideoMB}MB</small>
  </div>`;
}

/* ═════════ حفظ الحقول الحالية قبل الانتقال ═════════ */
function wzSaveFields(){
  if (!WZ) return;
  const w = WZ;
  const g = id => { const e = document.getElementById(id); return e ? e.value : null; };
  if (w.step === 4) {
    const v = g('wz-desc'); if (v !== null) w.desc = v;
    const n = g('wz-note'); if (n !== null) w.note = n;
  }
  if (w.step === 3) {
    document.querySelectorAll('[data-q]').forEach(e => { w.answers[e.dataset.q] = e.value; });
  }
  if (w.step === 6) {
    ['wz-gov','wz-area','wz-addr','wz-detail','wz-addr-type','wz-label'].forEach(id => {
      const v = g(id); if (v !== null) {
        const key = { 'wz-gov':'gov', 'wz-area':'area', 'wz-addr':'addr', 'wz-detail':'detail', 'wz-addr-type':'type', 'wz-label':'label' }[id];
        w.address[key] = v;
      }
    });
    const sv = document.getElementById('wz-save-addr'); if (sv) w.address.save = sv.checked;
    const df = document.getElementById('wz-default-addr'); if (df) w.address.default = df.checked;
  }
  if (w.step === 7) {
    const fx = document.getElementById('wz-flexible'); if (fx) w.schedule.flexible = fx.checked;
    const d = g('wz-date-input'); if (d !== null) w.schedule.date = d;
    const n = g('wz-when-note'); if (n !== null) w.schedule.whenNote = n;
  }
  if (w.step === 8) {
    const nm = g('wz-name'); if (nm !== null) w.contact.name = nm;
    const ph = g('wz-phone'); if (ph !== null) w.contact.phone = ph;
    const me_ = g('wz-method'); if (me_ !== null) w.contact.method = me_;
    const nt = g('wz-contact-note'); if (nt !== null) w.contact.note = nt;
  }
}

/* ═════════ إرسال الطلب ═════════ */
async function wzSubmit(){
  if (!WZ) return;
  if (wzSubmitting) return;
  wzSubmitting = true;
  try {
    for (let s = 0; s <= 9; s++) {
      wzSaveFields();
      const m = wzCheckStep(s);
      if (m) {
        if (hasUI()) { toast(m); WZ.step = s; show('wizard'); }
        return;
      }
      /* نحفظ الحقول مرارًا أثناء التحقق، لكن لا نُغيّر step الحالي */
    }
    const w = WZ;
    const u = (typeof me === 'function') ? me() : null;
    /* تحقق من حساب معلّق */
    const ex = MP.db().customers.find(c => c.phone === w.contact.phone.trim());
    if (ex && ex.status === 'suspended') {
      if (hasUI()) toast('الحساب معلّق — تواصل مع الإدارة');
      return;
    }

    /* حفظ العنوان إن طُلب */
    let addressId = w.address.id || '';
    if (w.address.save) {
      try {
        const c = MP.customerFor(w.contact.name.trim(), w.contact.phone.trim());
        const payload = {
          label: w.address.label || '',
          gov: w.address.gov, area: w.address.area, addr: w.address.addr, detail: w.address.detail,
          type: w.address.type, default: !!w.address.default
        };
        if (w.address.id) {
          MP.updateAddress(w.address.id, payload);
          addressId = w.address.id;
        } else {
          const newA = MP.addAddress(c.id, payload);
          addressId = newA.id;
          w.address.id = newA.id;
        }
      } catch {}
    }

    /* بناء طلب MP */
    const cat = CAT.category(w.cat), it = CAT.item(w.item), p = w.unknown ? null : CAT.problem(w.problem);
    const when = w.schedule.flexible ? '' : (w.schedule.date || '');
    const whenFull = when ? when + (w.schedule.period ? ' ' + ({morning:'09:00',noon:'12:00',evening:'15:00'}[w.schedule.period]||'') : '') : '';

    const reqPayload = {
      cat: w.cat, serviceId: w.item,
      serviceName: it.name + (p ? ' — ' + p.name : ' — تشخيص بالمعاينة'),
      catName: cat.name, itemId: w.item, itemName: it.name,
      problemId: p ? p.id : '', problemName: p ? p.name : '', unknownProblem: w.unknown,
      answers: { ...w.answers }, specialty: it.specialty,
      desc: w.desc.trim(), note: w.note.trim(), notes: w.contact.note.trim(),
      photos: [], attachments: (w.attachmentMeta || []).map(a => a.id),
      video: w.video || '',
      gov: w.address.gov, area: w.address.area, addr: w.address.addr + (w.address.detail ? ' — ' + w.address.detail : ''),
      geo: w.address.geo,
      when: whenFull, preferredSlot: '', preferredPeriod: w.schedule.period || '',
      flexible: !!w.schedule.flexible, whenNote: w.schedule.whenNote,
      phone: w.contact.phone.trim(), name: w.contact.name.trim(),
      contactMethod: w.contact.method,
      addressId: addressId
    };

    const r = MP.createRequest(reqPayload);

    /* ربط المرفقات بالطلب */
    try {
      if (typeof AT !== 'undefined' && WZ_DRAFT_ID) {
        await AT.migrateDraftAttachments(WZ_DRAFT_ID, r.id);
      }
      /* ربط معرّفات المرفقات في الطلب (الطلب يحفظها كمعرّفات فقط) */
      const list = (typeof AT !== 'undefined') ? await AT.listForReq(r.id) : [];
      r.attachments = list.map(x => x.id);
      r.photos = list.filter(x => x.kind === 'image').map(x => x.thumb).filter(Boolean);
      MP.save();
    } catch (e) { /* المرفقات قد تفشل — لا نُفشل الطلب */ }

    /* تحديث store المستخدم */
    try { HSCustomerSession.update({ name: w.contact.name.trim(), phone: w.contact.phone.trim() }); } catch {}

    /* حفظ رسالة النجاح في الحالة، ثم مسح المسودة */
    WZ.done = { id: r.id, no: r.no };
    WZ.step = 10;
    wzClearDraft();

    if (hasUI()) { state.stack = []; state.tab = 'orders'; if (typeof renderTabs === 'function') renderTabs(); show('wizard'); }
  } finally {
    wzSubmitting = false;
  }
}
let wzSubmitting = false;
let wzDraftSaveTimer = null;
function wzQueueDraftSave(){
  if (wzDraftSaveTimer) clearTimeout(wzDraftSaveTimer);
  wzDraftSaveTimer = setTimeout(() => { wzDraftSaveTimer = null; wzSaveDraft(); }, 350);
}

/* ═════════ معالجة النقرات ═════════ */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-wz-cat],[data-wz-item],[data-wz-prob],[data-wz-unknown],[data-wz-sugg],[data-wz-edit],[data-wz-go],[data-wz-rm],[data-wz-hit],[data-wz-date],[data-wz-period],[data-wz-addr-pick],[data-wz-att-rm],[data-act^="wz"]');
  if (!t) return;
  const d = t.dataset;
  const stop = () => { e.stopImmediatePropagation(); e.preventDefault(); };

  /* نتائج البحث (من HS_SEARCH) */
  if (d.wzHit) {
    stop();
    const [ty, id] = d.wzHit.split('|');
    if (ty === 'cat') return startRequest(id);
    if (ty === 'item') { const i = CAT.item(id); return i && startRequest(i.cat, id); }
    if (ty === 'problem') {
      /* V8-C4: يضبط الخطوة والتاريخ ثم يعرض (قبلها كانت الشاشة تبقى على خطوة اختيار المشكلة) */
      if (typeof HS_DISCOVER !== 'undefined' && HS_DISCOVER.order(ty, id)) return;
      const p = CAT.problem(id); if (!p) return;
      startRequest(p.cat, p.item);
      if (WZ) { WZ.problem = id; WZ.unknown = false; WZ.step = 3; }
      return;
    }
    return;
  }
  if (!WZ && !['wzResume','wzDiscardDraft'].includes(d.act)) return;
  if (!/^(wz|wzAdd|wzSubmit|wzPrev|wzNext|wzTrack|wzGeo|wzAddPhoto|wzAddVideo|wzResume|wzDiscardDraft)$/.test(d.act || '')) {
    /* ليست من صلاحيتنا (قد تكون من market-ui أو غيره) */
    if (!t.matches('[data-wz-cat],[data-wz-item],[data-wz-prob],[data-wz-unknown],[data-wz-sugg],[data-wz-edit],[data-wz-go],[data-wz-date],[data-wz-period],[data-wz-addr-pick],[data-wz-att-rm]')) return;
  }
  stop();
  if (WZ) { wzClearValidationError(); wzSaveFields(); }

  /* اختيارات */
  if (d.wzCat) {
    if (WZ.cat !== d.wzCat) {
      WZ.cat = d.wzCat; WZ.item = ''; WZ.problem = ''; WZ.unknown = false; WZ.answers = {};
    }
    return wzGo(1);
  }
  if (d.wzItem) {
    const it = CAT.item(d.wzItem); if (!it) return;
    if (WZ.cat !== it.cat) WZ.cat = it.cat;
    if (WZ.item !== d.wzItem) {
      WZ.item = d.wzItem; WZ.problem = ''; WZ.unknown = false; WZ.answers = {};
    }
    return wzGo(2);
  }
  if (d.wzProb) { WZ.problem = d.wzProb; WZ.unknown = false; return wzGo(3); }
  if ('wzUnknown' in d) { WZ.unknown = true; WZ.problem = ''; return wzGo(3); }
  if (d.wzSugg) { WZ.desc = d.wzSugg; return show('wizard'); }
  if ('wzEdit' in d) return wzGo(+d.wzEdit);
  if ('wzGo' in d) return wzGo(+d.wzGo);
  if ('wzRm' in d) { WZ.attachments.splice(+d.wzRm, 1); return show('wizard'); }
  if (d.wzDate) { WZ.schedule.date = d.wzDate; return show('wizard'); }
  if (d.wzPeriod) { WZ.schedule.period = d.wzPeriod; return show('wizard'); }
  if (d.wzAddrPick) {
    try {
      const a = MP.db().addresses.find(x => x.id === d.wzAddrPick);
      if (a) {
        WZ.address = {
          id: a.id, label: a.label, gov: a.gov, area: a.area, addr: a.addr,
          detail: a.detail, type: a.type, save: true, default: !!a.default, geo: null
        };
        show('wizard');
      }
    } catch {}
    return;
  }
  if (d.wzAttRm) {
    const id = d.wzAttRm;
    try {
      if (typeof AT !== 'undefined') AT.remove(id);
    } catch {}
    WZ.attachments = (WZ.attachments || []).filter(x => x !== id);
    WZ.attachmentMeta = (WZ.attachmentMeta || []).filter(x => x.id !== id);
    wzSaveDraft();
    return show('wizard');
  }

  /* الأزرار */
  switch (d.act) {
    case 'wzResume': {
      const u = (typeof me === 'function') ? me() : null;
      if (!u || !wzRestoreDraft(u.id)) return toast('لم نعثر على مسودة قابلة للاستكمال');
      WZ.hist = [];
      if (hasUI()) return show('wizard');
      break;
    }
    case 'wzDiscardDraft': {
      wzClearDraft();
      WZ = null; WZ_DRAFT_ID = '';
      toast('تم حذف المسودة');
      if (hasUI()) return show('home');
      break;
    }
    case 'wzNext': {
      const m = wzCheckStep(WZ.step);
      if (m) return wzReportValidationError(m);
      wzSaveDraft();
      wzGo(WZ.step + 1);
      break;
    }
    case 'wzPrev': {
      wzSaveDraft();
      if (WZ.hist.length) {
        WZ.step = WZ.hist.pop();
        if (hasUI()) show('wizard');
      } else if (hasUI()) {
        history.back();
      }
      break;
    }
    case 'wzGeo': {
      if (!navigator.geolocation) return toast('المتصفح لا يدعم تحديد الموقع');
      navigator.geolocation.getCurrentPosition(p => {
        WZ.address.geo = { lat: p.coords.latitude, lng: p.coords.longitude };
        show('wizard'); toast('تم تحديد موقعك');
      }, () => toast('لم يتم السماح بتحديد الموقع'), { timeout: 8000 });
      break;
    }
    case 'wzAddPhoto': {
      pickFiles('image/*', true, async files => {
        if (!files || !files.length) return;
        await handleAttachments(files, 'image');
      });
      break;
    }
    case 'wzAddVideo': {
      pickFiles('video/*', false, async files => {
        if (!files || !files.length) return;
        await handleAttachments(files, 'video');
      });
      break;
    }
    case 'wzSubmit': {
      wzSubmit().catch(err => { console.error(err); toast('تعذّر إرسال الطلب'); });
      break;
    }
    case 'wzTrack': {
      if (WZ && WZ.done) {
        const id = WZ.done.id;
        WZ = null;
        if (hasUI()) {
          state.stack = [];
          state.tab = 'orders';
          if (typeof renderTabs === 'function') renderTabs();
          state.stack.push('track:' + id); history.pushState({tr:1}, ''); show('tracking', id);
        }
      }
      break;
    }
  }
}, true);

/* ═════════ رفع الملفات ═════════ */
function pickFiles(accept, multiple, cb) {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = accept; i.multiple = !!multiple;
  i.onchange = () => { const files = Array.from(i.files || []); if (files.length) cb(files); };
  i.click();
}

async function handleAttachments(files, kind) {
  if (!WZ) return;
  if (typeof AT === 'undefined') { toast('طبقة المرفقات غير محمّلة'); return; }
  const existing = (WZ.attachmentMeta || []).length;
  const { ok, added, errors } = await AT.addFiles('', files, { draftId: WZ_DRAFT_ID, existingCount: existing });
  if (added && added.length) {
    for (const rec of added) {
      WZ.attachments.push(rec.id);
      WZ.attachmentMeta.push(AT.toSummary(rec));
      if (rec.kind === 'video' && !WZ.video) WZ.video = rec.name;
    }
    wzSaveDraft();
    show('wizard');
  }
  if (errors && errors.length) {
    toast(errors[0].name + ' — ' + errors[0].reason);
  }
}

/* ═════════ أحداث الحقول (حفظ فوري بدون إعادة رسم) ═════════ */
document.addEventListener('input', e => {
  if (!WZ) return;
  wzClearValidationError();
  const q = e.target.closest('[data-q]');
  if (q) { WZ.answers[q.dataset.q] = q.value; return; }
  if (e.target.id === 'wz-desc') WZ.desc = e.target.value;
  if (e.target.id === 'wz-note') WZ.note = e.target.value;
  if (e.target.id === 'wz-area') WZ.address.area = e.target.value;
  if (e.target.id === 'wz-addr') WZ.address.addr = e.target.value;
  if (e.target.id === 'wz-detail') WZ.address.detail = e.target.value;
  if (e.target.id === 'wz-label') WZ.address.label = e.target.value;
  if (e.target.id === 'wz-when-note') WZ.schedule.whenNote = e.target.value;
  if (e.target.id === 'wz-name') WZ.contact.name = e.target.value;
  if (e.target.id === 'wz-phone') WZ.contact.phone = e.target.value;
  if (e.target.id === 'wz-contact-note') WZ.contact.note = e.target.value;
  wzQueueDraftSave();
});

document.addEventListener('change', e => {
  if (!WZ) return;
  wzClearValidationError();
  const t = e.target;
  if (t.id === 'wz-gov') { WZ.address.gov = t.value; WZ.address.area = ''; return show('wizard'); }
  if (t.id === 'wz-addr-type') { WZ.address.type = t.value; return; }
  if (t.id === 'wz-save-addr') { WZ.address.save = t.checked; return; }
  if (t.id === 'wz-default-addr') { WZ.address.default = t.checked; return; }
  if (t.id === 'wz-flexible') {
    WZ.schedule.flexible = t.checked;
    return show('wizard');
  }
  if (t.id === 'wz-date-input') { WZ.schedule.date = t.value; return show('wizard'); }
  if (t.id === 'wz-method') { WZ.contact.method = t.value; wzQueueDraftSave(); return; }
  wzQueueDraftSave();
});

/* حفظ المسودة دورياً كل 20 ثانية أثناء الكتابة */
setInterval(() => { try { if (WZ && WZ.step < 10) wzSaveDraft(); } catch {} }, 20000);

/* زر الرجوع: يعود خطوة سابقة داخل النموذج */
window.addEventListener('popstate', () => {
  if (!WZ || WZ.step >= 10) return;
  if (WZ.hist.length) {
    WZ.step = WZ.hist.pop();
    if (hasUI()) show('wizard');
  }
});