/* ═══════════════════════════════════════════════════════════════
   هنصلحلك — بوابة مقدم الخدمة + لوحة الإدارة التجارية — V7
   ───────────────────────────────────────────────────────────────
   V7 — تغييرات عن V6:
   • توافق كامل مع FLOW الجديد (12 حالة) + حالات بديلة (cancelled/failed).
   • بوابة المزود: تقسيمات جديدة (arrived/quote) + إجراءات إضافية
     (تسجيل الوصول، إرسال عرض سعر).
   • لوحة الإدارة: تصفية طلبات جديدة (arrived/quote/failed) +
     عرض عروض الأسعار + بيانات موسعة للمزودين.
   • الحفاظ على كل التوقيعات القديمة (provCard, admOrders, admProviders…).
   • استخدام الأيقونات الجديدة st-arrived, st-quote, st-failed.
   • لا شيء من V6 حُذف.

   ملاحظات:
   • تعتمد على MP (V7) — كل شيء موجود.
   • الدخول للأدوار لا يزال تجريبيًا (بدون مصادقة).
   ═══════════════════════════════════════════════════════════════ */
'use strict';

let ROLE = null;
const PV = { tab:'home' };
const AD = { tab:'orders', f:'all' };
const rerender = () => { if(ROLE) show(ROLE); };
const CAT_KEYS = () => Object.keys(SERVICE_TYPES);

function enterRole(r){ ROLE = r; document.body.classList.add('role-mode'); state.stack=[]; history.pushState({role:r},''); show(r); }
function exitRole(){ ROLE = null; document.body.classList.remove('role-mode'); go('home'); }
const myProvider = () => { const id = store.get('provId',null); return id ? MP.get('providers',id) : null; };
const roleBar = (t) => `<div class="role-bar"><b>${t}</b><button data-act="exitRole">العودة للعميل</button></div>`;

/* ═════════ مجموعات المزود (V7) ═════════
   new       : عروض معلقة
   accepted  : مقبولة بانتظار الموعد
   progress  : جارية (enroute/arrived/started)
   quote     : عرض سعر مرسل (بانتظار العميل)
   done      : مكتملة/مغلقة
   cancelled : ملغاة/مرفوضة/فشل */
const provState = {
  new:      'بانتظار ردّك',
  accepted: 'مقبولة',
  progress: 'جارية',
  quote:    'عرض سعر',
  done:     'مكتملة',
  cancelled:'ملغاة / مرفوضة'
};

/* الخريطة: حالة الطلب (V7) → مجموعة المزود */
function providerGroupOf(r, a){
  if (!a) return 'new';
  if (a.status === 'offered') return 'new';
  if (a.status === 'rejected' || a.status === 'withdrawn') return 'cancelled';
  if (a.status === 'accepted') {
    if (['completed','closed'].includes(r.status)) return 'done';
    if (r.status === 'cancelled' || r.status === 'failed') return 'cancelled';
    if (r.status === 'quote') return 'quote';
    if (['enroute','arrived','started'].includes(r.status)) return 'progress';
    if (['accepted','scheduled'].includes(r.status)) return 'accepted';
    return 'accepted';
  }
  return 'new';
}

const provLine = x => `<small>${MP.catName(x.cat)} — ${esc(x.serviceName)}</small>`;

/* ═════════ جمع طلبات المزود حسب المجموعة الجديدة ═════════ */
function provRequests(p){
  const out = { new:[], accepted:[], progress:[], quote:[], done:[], cancelled:[] };
  MP.db().assignments.filter(a => a.providerId === p.id).forEach(a => {
    const r = MP.get('serviceRequests', a.reqId);
    if (!r) return;
    const g = providerGroupOf(r, a);
    if (out[g]) out[g].push([r, a]);
  });
  /* ترتيب: الأحدث أولًا داخل كل مجموعة */
  Object.keys(out).forEach(k => out[k].sort((x, y) => (y[0].createdAt || '').localeCompare(x[0].createdAt || '')));
  return out;
}

/* ═════════ بطاقة الطلب للمزود ═════════ */
function provCard(r, a, p){
  const c = MP.get('customers', r.customerId) || {};
  const open = a.status === 'accepted';
  const t = MP.db().transactions.find(x => x.reqId === r.id);
  const quote = MP.currentQuote(r.id);

  /* أزرار الإجراء حسب الحالة */
  const acts = [];
  if (a.status === 'offered') {
    acts.push(`<button class="pri" data-pa="accept" data-id="${r.id}">قبول</button>`);
    acts.push(`<button class="bad" data-pa="reject" data-id="${r.id}">رفض</button>`);
  } else if (a.status === 'accepted') {
    if (r.status === 'accepted' && !r.proposal) {
      acts.push(`<button class="pri" data-pa="confirm" data-id="${r.id}">تأكيد موعد العميل</button>`);
      acts.push(`<button data-pa="propose" data-id="${r.id}">اقتراح موعد</button>`);
    } else if (r.status === 'scheduled') {
      acts.push(`<button class="pri" data-pa="enroute" data-id="${r.id}">أنا في الطريق</button>`);
    } else if (r.status === 'enroute') {
      acts.push(`<button class="pri" data-pa="arrived" data-id="${r.id}">وصلت</button>`);
    } else if (r.status === 'arrived') {
      acts.push(`<button class="pri" data-pa="started" data-id="${r.id}">بدأت الخدمة</button>`);
    } else if (r.status === 'started') {
      acts.push(`<button class="pri" data-pa="sendQuote" data-id="${r.id}">إرسال عرض سعر</button>`);
      acts.push(`<button data-pa="finish" data-id="${r.id}">تسجيل القيمة وإكمال العمل</button>`);
    } else if (r.status === 'quote') {
      acts.push(`<button data-pa="sendQuote" data-id="${r.id}">تحديث عرض السعر</button>`);
      acts.push(`<button data-pa="finish" data-id="${r.id}">تسجيل القيمة النهائية</button>`);
    } else if (r.status === 'completed') {
      /* لا إجراءات — بانتظار العميل */
    }
  }

  /* عرض السعر الحالي */
  const quoteBlock = quote && ['pending','approved','rejected'].includes(quote.status)
    ? `<div class="quote-summary" style="padding:10px;border-radius:12px;background:rgba(255,61,143,.08);border:1px solid rgba(255,61,143,.25);margin:6px 0">
        <small style="display:block;color:var(--muted)">عرض السعر — ${quote.status === 'approved' ? '✅ مقبول' : quote.status === 'rejected' ? '❌ مرفوض' : '⏳ بانتظار العميل'}</small>
        <b>${money(quote.total)}</b>
        <small> — مصنعية ${money(quote.labor)}${quote.parts?` + قطع ${money(quote.parts)}`:''}${quote.discount?` − خصم ${money(quote.discount)}`:''}</small>
      </div>` : '';

  return `<div class="card2 glass neon">
    <div class="top"><b>#${esc(r.no)} — ${esc(r.serviceName)}</b>
      <span class="tag">${ic(icStatus(r.status))} ${STATUS_LABEL[r.status] || ''}</span>
    </div>
    ${provLine(r)}<small>${esc(r.desc)}</small>
    ${r.answers && Object.keys(r.answers).length ? `<div class="pw-diagnostics"><small><b>إجابات التشخيص</b></small>${Object.entries(r.answers).map(([k,v])=>`<small>${esc(k)}: ${esc(v)}</small>`).join('')}</div>` : ''}
    <small>${ic('clock')} الموعد المطلوب: ${fmtDT(r.agreedAt || r.when) || 'مرن — يُحدَّد بالاتفاق مع العميل'}${r.proposal ? ' • اقتراحك: ' + fmtDT(r.proposal.at) + ' (بانتظار العميل)' : ''}</small>
    ${r.flexible ? `<small class="hint">${ic('info')} موعد مرن</small>` : ''}
    ${r.photos && r.photos.length ? `<div class="thumbs">${r.photos.slice(0,3).map(x => `<span class="th"><img src="${x}" alt=""></span>`).join('')}</div>` : ''}
    ${quoteBlock}
    ${open ? `<small>${ic('user')} ${esc(c.name || '')} • ${esc(r.phone || '')}<br>${ic('pin')} ${esc(r.gov)} — ${esc(r.area)} — ${esc(r.addr)}${r.geo ? ` • <a href="https://maps.google.com/?q=${r.geo.lat},${r.geo.lng}" target="_blank" rel="noopener" style="color:var(--pink2)">الخريطة</a>` : ''}</small>`
           : `<small>${ic('pin')} ${esc(r.gov)} — ${esc(r.area)}<br>${ic('st-closed')} بيانات العميل والعنوان التفصيلي تظهر بعد قبول الطلب.</small>`}
    ${t ? `<small>القيمة ${money(t.value)} • عمولة المنصة (${t.rate}%) ${money(t.commission)} • صافي مستحقك <b>${money(t.net)}</b></small>` : ''}
    ${acts.length ? `<div class="acts">${acts.join('')}</div>` : ''}
  </div>`;
}

/* ═════════ شاشة بوابة المزود ═════════ */
screens.provider = () => {
  const p = myProvider();

  /* اختيار مزود */
  if (!p) return `<div class="screen">${roleBar('بوابة مقدم الخدمة')}${demoBanner()}
    <h2 class="sec-title">${ic('user')}الدخول كمقدم خدمة</h2>
    <div class="plist">${MP.db().providers.map(x => `
      <button class="prow glass neon" data-pa="login" data-id="${x.id}">
        ${icp(icSec(DEVICES[x.cats[0]] ? DEVICES[x.cats[0]].icon : 'grid'), 'dev')}
        <span class="tx">${esc(x.name)}<small>${x.status === 'approved' ? (x.demo ? 'مقبول في العرض التجريبي' : 'مقبول') : x.status === 'pending' ? 'بانتظار موافقة الإدارة' : x.status === 'suspended' ? 'معلّق' : 'مرفوض'}</small></span>
        ${ic('chev','chev')}
      </button>`).join('')}
    </div>
    <button class="cta" data-pa="register">${ic('user')} تسجيل مقدم خدمة جديد</button>
  </div>`;

  /* حساب غير معتمد */
  if (p.status !== 'approved') {
    return `<div class="screen">${roleBar(esc(p.name))}
      <div class="empty">${ic('shield')}<p>${p.status === 'pending' ? 'طلب تسجيلك قيد المراجعة من الإدارة' : p.status === 'suspended' ? 'الحساب معلّق حاليًا' : 'تم رفض طلب التسجيل'}<br><small>افتح لوحة الإدارة (من القائمة) للموافقة على الطلب في هذا العرض التجريبي</small></p></div>
      <button class="cta ghost" data-pa="logout">تبديل الحساب</button>
    </div>`;
  }

  /* الحساب المعتمد */
  const q = provRequests(p);
  const tx = MP.db().transactions.filter(t => t.providerId === p.id);
  const sum = k => tx.reduce((s, t) => s + t[k], 0);
  const rt = p.rating || MP.rating(p.id);

  return `<div class="screen">${roleBar(esc(p.name))}${demoBanner()}
    <div class="stats">
      <div class="stat glass"><small>طلبات جديدة</small><b>${q.new.length}</b></div>
      <div class="stat glass"><small>جارية</small><b>${q.progress.length + q.accepted.length}</b></div>
      <div class="stat glass"><small>عرض سعر معلق</small><b>${q.quote.length}</b></div>
      <div class="stat glass"><small>مكتملة</small><b>${q.done.length}</b></div>
      <div class="stat glass"><small>معدل القبول</small><b>${MP.acceptRate(p.id)}%</b></div>
      <div class="stat glass"><small>تقييم العملاء</small><b>${rt ? rt + ' ' + ic('star','star on') : 'لا يوجد بعد'}</b></div>
      <div class="stat glass"><small>إجمالي قيمة الخدمات</small><b>${money(sum('value'))}</b></div>
      <div class="stat glass"><small>عمولة المنصة</small><b>${money(sum('commission'))}</b></div>
      <div class="stat glass"><small>صافي مستحقاتك</small><b>${money(sum('net'))}</b></div>
    </div>
    <small class="hint">الأرقام المالية تنشأ فقط من محاكاة الطلبات داخل هذا العرض التجريبي.</small>
    <button class="cta ghost" style="margin-top:8px" data-pa="avail">${ic('power')} ${p.available ? 'متاح لاستقبال الطلبات — اضغط للإيقاف' : 'غير متاح — اضغط للتفعيل'}</button>
    <div class="subtabs" style="margin-top:12px">${Object.keys(provState).map(k => `
      <button class="${PV.tab === k ? 'on' : ''}" data-pa="tab" data-id="${k}">${provState[k]} (${q[k].length})</button>`).join('')}
    </div>
    ${q[PV.tab].length ? q[PV.tab].map(([r, a]) => provCard(r, a, p)).join('') : `<div class="empty" style="padding:26px">${ic('list')}<p>لا توجد طلبات هنا</p></div>`}
    <button class="cta ghost" data-pa="logout">تبديل الحساب</button>
  </div>`;
};

/* ═════════ نموذج المزود (كما V6 + حقول موسعة) ═════════ */
function providerForm(p, admin){
  const v = p || {name:'',phone:'',type:'individual',cats:[],govs:[],years:0,docs:'',bio:'',areas:[],subs:[]};
  sheet(`<h4>${ic('user')} ${p ? 'تعديل مقدم خدمة' : admin ? 'إضافة مقدم خدمة' : 'تسجيل مقدم خدمة'}</h4>
    <form class="form" id="pvForm" data-id="${p ? p.id : ''}" data-admin="${admin ? 1 : 0}">
      <div><label>الاسم *</label><input name="name" required value="${esc(v.name)}"></div>
      <div><label>رقم الهاتف *</label><input name="phone" required type="tel" inputmode="tel" pattern="[0-9+ ]{8,15}" value="${esc(v.phone)}"></div>
      <div><label>النوع</label><select name="type"><option value="individual" ${v.type === 'individual' ? 'selected' : ''}>فرد</option><option value="company" ${v.type === 'company' ? 'selected' : ''}>شركة</option></select></div>
      <div><label>التخصصات *</label><div class="chips">${CAT_KEYS().map(c => `<label class="chip"><input type="checkbox" name="cats" value="${c}" ${v.cats.includes(c) ? 'checked' : ''} style="width:auto;height:auto"> ${MP.catName(c)}</label>`).join('')}</div></div>
      <div><label>المحافظات *</label><details class="gd"><summary><span>اختيار المحافظات</span>${ic('chev','chev')}</summary><div class="gd-in chips">${MP.GOVS.map(g => `<label class="chip"><input type="checkbox" name="govs" value="${g}" ${v.govs.includes(g) ? 'checked' : ''} style="width:auto;height:auto"> ${g}</label>`).join('')}</div></details></div>
      <div><label>المناطق المفضلة (اختياري)</label><input name="areas" placeholder="مثل: مدينة نصر، المعادي" value="${esc((v.areas || []).join('، '))}"></div>
      <div><label>سنوات الخبرة</label><input name="years" type="number" min="0" max="60" value="${v.years || 0}"></div>
      <div><label>نبذة قصيرة</label><textarea name="bio" maxlength="300" placeholder="اكتب نبذة قصيرة عن خدماتك">${esc(v.bio || '')}</textarea></div>
      <div><label>المستندات (للتحقق)</label><input name="docs" placeholder="مثال: صورة بطاقة، شهادة خبرة" value="${esc(v.docs || '')}"><small class="hint">في النسخة التجريبية تُحفظ أسماء المستندات فقط.</small></div>
      <button class="cta" type="submit">${ic('check')} ${p ? 'حفظ' : admin ? 'إضافة' : 'إرسال طلب التسجيل'}</button>
    </form>`);
}

/* ═════════ لوحة الإدارة — التبويبات ═════════ */
const ADM_TABS = [
  ['orders','الطلبات'],
  ['providers','مقدمو الخدمة'],
  ['customers','العملاء'],
  ['commissions','العمولات'],
  ['quotes','عروض الأسعار'],
  ['reports','التقارير'],
  ['complaints','الشكاوى']
];

/* تصفية الطلبات (V7 — مع الحالات الجديدة) */
const ORDER_FILTERS = {
  all:        ['الكل', () => true],
  unassigned: ['غير مُسندة', r => ['received','searching'].includes(r.status)],
  sent:       ['بانتظار الفني', r => r.status === 'sent'],
  accepted:   ['مقبولة', r => ['accepted','scheduled'].includes(r.status)],
  progress:   ['قيد التنفيذ', r => ['enroute','arrived','started'].includes(r.status)],
  quote:      ['عرض سعر', r => r.status === 'quote'],
  done:       ['مكتملة', r => ['completed','closed'].includes(r.status)],
  cancelled:  ['ملغاة', r => r.status === 'cancelled'],
  failed:     ['تعذر التنفيذ', r => r.status === 'failed']
};

const COLL = { pending:'لم تُحصَّل', collected:'تم التحصيل', settled:'تمت التسوية' };
const MODEL = { platform:'المنصة تحصّل المبلغ ثم تحوّل صافي الفني', direct:'تسوية مباشرة بين العميل والفني ثم تُحصَّل العمولة من الفني' };

/* ═════════ لوحة الإدارة — الطلبات ═════════ */
const admOrders = () => {
  const f = ORDER_FILTERS[AD.f], list = MP.reqs().filter(f[1]);
  return `<div class="subtabs">${Object.entries(ORDER_FILTERS).map(([k, [n, fn]]) =>
      `<button class="${AD.f === k ? 'on' : ''}" data-ad="filter" data-id="${k}">${n} (${MP.reqs().filter(fn).length})</button>`).join('')}</div>`
    + (list.length ? list.map(r => {
      const c = MP.get('customers', r.customerId);
      const a = MP.activeAssignment(r.id);
      const p = a && MP.get('providers', a.providerId);
      return `<div class="card2 glass neon">
        <div class="top"><b>#${esc(r.no)} — ${esc(r.serviceName)}</b>
          <span class="tag ${['cancelled','failed'].includes(r.status) ? 'warn' : ''}">${ic(icStatus(r.status))} ${STATUS_LABEL[r.status] || ''}</span>
        </div>
        <small>${MP.catName(r.cat)} • ${esc(c ? c.name : '')} • ${esc(r.phone)}<br>${esc(r.gov)} — ${esc(r.area)}<br>${esc(r.desc)}</small>
        ${p ? `<small>مقدم الخدمة: ${esc(p.name)}</small>` : ''}
        <div class="acts">
          ${['received','searching'].includes(r.status) ? `<button class="pri" data-ad="assign" data-id="${r.id}">إسناد يدوي</button>` : ''}
          ${r.status === 'searching' ? `<button data-ad="automatch" data-id="${r.id}">مطابقة تلقائية</button>` : ''}
          ${['quote'].includes(r.status) ? `<button data-ad="viewQuote" data-id="${r.id}">عرض السعر</button>` : ''}
          ${!['closed','cancelled','failed'].includes(r.status) ? `<button class="bad" data-ad="cancel" data-id="${r.id}">إلغاء</button>` : ''}
        </div>
        <small>${r.history.map(h => STATUS_LABEL[h.s] || h.s).join(' ← ')}</small>
      </div>`;
    }).join('')
    : `<div class="empty" style="padding:28px">${ic('list')}<p>لا توجد طلبات في هذا القسم<br><small>أرسل طلبًا من واجهة العميل لتجربة الدورة</small></p></div>`);
};

/* ═════════ مقدمو الخدمة (V7 — بيانات موسعة) ═════════ */
const admProviders = () => {
  const all = MP.db().providers;
  const pend = all.filter(p => p.status === 'pending');
  const card = p => {
    const done = MP.db().transactions.filter(t => t.providerId === p.id).length;
    const rt = p.rating || MP.rating(p.id);
    return `<div class="card2 glass neon">
      <div class="top">
        <b>${esc(p.name)}</b>
        <span class="tag ${p.status !== 'approved' ? 'warn' : ''}">${{approved:(p.demo?'مقبول في العرض التجريبي':'مقبول'),pending:'قيد المراجعة',suspended:'معلّق',rejected:'مرفوض'}[p.status]}</span>
      </div>
      <small>${p.type === 'company' ? 'شركة' : 'فرد'} • ${p.cats.map(MP.catName).join('، ')} • ${p.govs.join('، ') || '—'}<br>
      خبرة ${p.years || 0} سنة • مستندات: ${esc(p.docs || '—')}<br>
      ${p.bio ? `${esc(p.bio)}<br>` : ''}
      التقييم: ${rt ? rt + ' ' + ic('star','star on') : '—'} • معدل القبول ${MP.acceptRate(p.id)}% • خدمات منفذة ${done}
      ${p.specialRate != null && p.specialRate !== '' ? `<br>عمولة خاصة: ${p.specialRate}%` : ''}</small>
      <div class="acts">
        ${p.status === 'pending'
          ? `<button class="pri" data-ad="padmit" data-id="${p.id}">موافقة</button><button class="bad" data-ad="preject" data-id="${p.id}">رفض</button>`
          : `<button data-ad="pedit" data-id="${p.id}">تعديل</button><button data-ad="prate" data-id="${p.id}">عمولة خاصة</button><button class="${p.status === 'suspended' ? 'pri' : 'bad'}" data-ad="psusp" data-id="${p.id}">${p.status === 'suspended' ? 'تفعيل' : 'تعليق'}</button>`}
      </div>
    </div>`;
  };
  return `<button class="cta" style="margin-top:0" data-ad="padd">${ic('user')} إضافة مقدم خدمة</button>
    ${pend.length ? `<h2 class="sec-title">${ic('shield')}طلبات التسجيل (${pend.length})</h2>${pend.map(card).join('')}` : ''}
    <h2 class="sec-title">${ic('list')}كل مقدمي الخدمة (${all.length})</h2>
    ${all.filter(p => p.status !== 'pending').map(card).join('')}`;
};

/* ═════════ العملاء ═════════ */
const admCustomers = () => {
  const l = MP.db().customers;
  return l.length ? l.map(c => {
    const rs = MP.reqs().filter(r => r.customerId === c.id);
    const cm = MP.db().complaints.filter(k => rs.some(r => r.id === k.reqId) && k.by === 'customer').length;
    const rv = MP.db().reviews.filter(v => v.customerId === c.id).length;
    return `<div class="card2 glass neon">
      <div class="top"><b>${esc(c.name)}</b><span class="tag ${c.status !== 'active' ? 'warn' : ''}">${c.status === 'active' ? 'نشط' : 'معلّق'}</span></div>
      <small>${esc(c.phone)}<br>طلبات: ${rs.length} • تقييمات: ${rv} • شكاوى: ${cm}<br>${rs.slice(0, 3).map(r => '#' + r.no + ' ' + STATUS_LABEL[r.status]).join(' | ')}</small>
      <div class="acts"><button class="${c.status === 'active' ? 'bad' : 'pri'}" data-ad="csusp" data-id="${c.id}">${c.status === 'active' ? 'تعليق الحساب' : 'تفعيل الحساب'}</button></div>
    </div>`;
  }).join('') : `<div class="empty">${ic('user')}<p>لا يوجد عملاء بعد</p></div>`;
};

/* ═════════ العمولات ═════════ */
const admCommissions = () => {
  const s = MP.db().settings, tx = MP.db().transactions;
  return `<div class="card2 glass neon"><b>إعدادات العمولة</b>
    <div><label class="hint">النسبة الافتراضية (%)</label><input class="mini" type="number" min="0" max="100" step="0.5" value="${s.defaultRate}" data-ad-rate="default"></div>
    <label class="hint">نسبة مخصصة لكل قسم (اتركها فارغة لاستخدام الافتراضية)</label>
    ${CAT_KEYS().map(c => `<div style="display:flex;gap:8px;align-items:center"><span style="width:110px;font-size:13.5px">${MP.catName(c)}</span><input class="mini" type="number" min="0" max="100" step="0.5" placeholder="${s.defaultRate}" value="${s.rates[c] ?? ''}" data-ad-rate="${c}"></div>`).join('')}
    <small class="hint">العمولة الخاصة بمقدم خدمة تُضبط من تبويب «مقدمو الخدمة».</small></div>
  <div class="card2 glass neon"><b>نموذج التحصيل</b>
    <select class="mini" data-ad-set="collectionModel">${Object.entries(MODEL).map(([k, l]) => `<option value="${k}" ${s.collectionModel === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label class="hint" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-ad-set="autoAssign" ${s.autoAssign ? 'checked' : ''} style="width:auto"> الإسناد التلقائي للطلبات الجديدة</label>
  </div>
  <div class="card2 glass neon"><b>حاسبة سريعة</b>
    <input class="mini" id="calcV" type="number" min="0" placeholder="قيمة الخدمة (ج.م)">
    <select class="mini" id="calcC">${CAT_KEYS().map(c => `<option value="${c}">${MP.catName(c)}</option>`).join('')}</select>
    <small id="calcR">أدخل قيمة لعرض عمولة المنصة وصافي الفني.</small>
  </div>
  <h2 class="sec-title">${ic('list')}المعاملات (${tx.length})</h2>`
    + (tx.length
      ? `<div class="tblw glass"><table class="tbl"><tr><th>الطلب</th><th>القيمة</th><th>العمولة</th><th>صافي الفني</th><th>التحصيل</th></tr>${tx.map(t => {
        const r = MP.get('serviceRequests', t.reqId);
        return `<tr><td>#${r ? r.no : ''}</td><td>${money(t.value)}</td><td>${money(t.commission)}<br><small>${t.rate}%</small></td><td>${money(t.net)}</td><td><select class="mini" style="height:34px;font-size:12px" data-ad-coll="${t.id}">${Object.entries(COLL).map(([k, l]) => `<option value="${k}" ${t.collection === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`;
      }).join('')}</table></div>`
      : `<div class="empty" style="padding:24px">${ic('list')}<p>لا توجد معاملات — تظهر بعد أن يسجّل مقدم الخدمة قيمة خدمة مكتملة</p></div>`);
};

/* ═════════ عروض الأسعار (جديد V7) ═════════ */
const admQuotes = () => {
  const quotes = MP.db().quotes || [];
  return quotes.length ? quotes.slice(0, 30).map(q => {
    const r = MP.get('serviceRequests', q.reqId);
    const p = MP.get('providers', q.providerId);
    const statusBadge = { pending:'بانتظار العميل', approved:'مقبول', rejected:'مرفوض' }[q.status] || q.status;
    return `<div class="card2 glass neon">
      <div class="top"><b>#${r ? r.no : ''} — ${r ? esc(r.serviceName) : ''}</b>
        <span class="tag ${q.status === 'rejected' ? 'warn' : ''}">${statusBadge}</span>
      </div>
      <small>مقدم الخدمة: ${p ? esc(p.name) : '—'}<br>
        مصنعية: ${money(q.labor)} • قطع: ${money(q.parts)} • معاينة: ${money(q.visitFee)} • خصم: ${money(q.discount)}</small>
      <div style="margin-top:6px;padding-top:8px;border-top:1px dashed rgba(255,61,143,.3)">
        <b style="color:var(--pink2);font-size:16px">الإجمالي: ${money(q.total)}</b>
      </div>
      ${q.note ? `<small>${esc(q.note)}</small>` : ''}
    </div>`;
  }).join('') : `<div class="empty">${ic('wallet')}<p>لا توجد عروض أسعار بعد</p></div>`;
};

/* ═════════ التقارير ═════════ */
const topN = (arr, key, n = 5) => { const m = {}; arr.forEach(x => { const k = key(x); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n); };
const barList = l => l.length ? `<div class="bars">${l.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><i style="width:${v / l[0][1] * 100}%"></i><em>${v}</em></div>`).join('')}</div>` : `<small class="hint">لا بيانات بعد</small>`;

const admReports = () => {
  const rq = MP.reqs(), tx = MP.db().transactions;
  const sum = k => tx.reduce((s, t) => s + t[k], 0);
  const best = MP.db().providers.map(p => [p.name, MP.rating(p.id) || 0, tx.filter(t => t.providerId === p.id).length])
    .filter(x => x[2] || x[1]).sort((a, b) => b[1] - a[1] || b[2] - a[2]).slice(0, 5);
  return `<div class="demo-banner">${ic('info')}<span>كل الأرقام هنا ناتجة عن محاكاة داخل هذا الجهاز وليست أرباحًا حقيقية.</span></div>
    <div class="stats">
      <div class="stat glass"><small>عدد الطلبات</small><b>${rq.length}</b></div>
      <div class="stat glass"><small>الطلبات المكتملة</small><b>${rq.filter(r => ['completed','closed'].includes(r.status)).length}</b></div>
      <div class="stat glass"><small>إجمالي قيمة الخدمات</small><b>${money(sum('value'))}</b></div>
      <div class="stat glass"><small>إيرادات العمولة</small><b>${money(sum('commission'))}</b></div>
      <div class="stat glass"><small>مستحقات مقدمي الخدمة</small><b>${money(sum('net'))}</b></div>
      <div class="stat glass"><small>عمولات محصّلة</small><b>${money(tx.filter(t => t.collection !== 'pending').reduce((s, t) => s + t.commission, 0))}</b></div>
    </div>
    <h2 class="sec-title">${ic('medal')}أكثر الخدمات طلبًا</h2>${barList(topN(rq, r => MP.catName(r.cat) + ' — ' + r.serviceName))}
    <h2 class="sec-title">${ic('home')}أكثر المناطق نشاطًا</h2>${barList(topN(rq, r => r.gov + ' / ' + r.area))}
    <h2 class="sec-title">${ic('user')}أفضل مقدمي الخدمات</h2>${best.length ? `<div class="bars">${best.map(([n, r, c]) => `<div class="bar"><span>${esc(n)}</span><em>${r ? r + ' ★' : '—'} • ${c} خدمة</em></div>`).join('')}</div>` : '<small class="hint">لا بيانات بعد</small>'}
    <button class="cta ghost bad" data-ad="reset">إعادة ضبط بيانات العرض التجريبي</button>`;
};

/* ═════════ الشكاوى ═════════ */
const admComplaints = () => {
  const l = MP.db().complaints;
  return l.length ? l.map(k => {
    const r = MP.get('serviceRequests', k.reqId);
    return `<div class="card2 glass neon">
      <div class="top"><b>طلب #${r ? r.no : '—'}</b>
        <span class="tag ${k.status === 'open' ? 'warn' : ''}">${k.status === 'open' ? 'مفتوحة' : 'تم الحل'}</span>
      </div>
      <small>من: ${k.by === 'customer' ? 'العميل' : 'مقدم الخدمة'} • ${fmtDT(k.at)}
      ${k.kind ? ` • النوع: ${({quality:'جودة',delay:'تأخر',price:'سعر',behavior:'سلوك',other:'أخرى'})[k.kind] || k.kind}` : ''}
      <br>${esc(k.text)}${k.resolution ? '<br>القرار: ' + esc(k.resolution) : ''}</small>
      ${k.status === 'open' ? `<div class="acts"><button class="pri" data-ad="cresolve" data-id="${k.id}">تسجيل الحل</button></div>` : ''}
    </div>`;
  }).join('') : `<div class="empty">${ic('shield')}<p>لا توجد شكاوى</p></div>`;
};

/* ═════════ شاشة الإدارة الرئيسية ═════════ */
screens.admin = () => `<div class="screen">${roleBar('لوحة الإدارة')}${demoBanner()}
  <div class="subtabs">${ADM_TABS.map(([k, n]) => `<button class="${AD.tab === k ? 'on' : ''}" data-ad="tab" data-id="${k}">${n}</button>`).join('')}</div>
  ${({orders:admOrders,providers:admProviders,customers:admCustomers,commissions:admCommissions,quotes:admQuotes,reports:admReports,complaints:admComplaints})[AD.tab]()}
</div>`;

/* ═════════ الأحداث ═════════ */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-pa],[data-ad]');
  if (!t) return;
  const d = t.dataset, id = d.id;

  if (d.pa) {
    switch (d.pa) {
      case 'login': store.set('provId', id); PV.tab = 'home'; rerender(); break;
      case 'logout': store.set('provId', null); rerender(); break;
      case 'register': providerForm(null, false); break;
      case 'tab': PV.tab = id; rerender(); break;
      case 'avail': { const p = myProvider(); if (p) { MP.updateProvider(p.id, {available: !p.available}); rerender(); } break; }
      case 'accept': MP.respond(id, true); PV.tab = 'accepted'; rerender(); toast('تم قبول الطلب'); break;
      case 'reject':
        sheet(`<h4>سبب الرفض</h4>
          <form class="form" id="rejForm" data-id="${id}">
            <div><select name="reason">
              <option>خارج نطاق تخصصي</option>
              <option>خارج المنطقة</option>
              <option>غير متاح في الموعد</option>
              <option>أخرى</option>
            </select></div>
            <button class="cta" type="submit">تأكيد الرفض</button>
          </form>`);
        break;
      case 'confirm': MP.confirmTime(id, 'provider'); rerender(); toast('تم تأكيد الموعد'); break;
      case 'propose':
        sheet(`<h4>اقتراح موعد</h4>
          <form class="form" id="propForm" data-id="${id}">
            <div><input type="datetime-local" name="at" required></div>
            <button class="cta" type="submit">إرسال الاقتراح للعميل</button>
          </form>`);
        break;
      case 'enroute': case 'started': case 'arrived':
        MP.advance(id, d.pa);
        PV.tab = 'progress';
        rerender();
        toast('تم تحديث الحالة');
        break;
      case 'sendQuote': openQuoteForm(id); break;
      case 'finish': {
        const r = MP.get('serviceRequests', id), p = myProvider();
        const rate = MP.rateFor(r.cat, p.id);
        const q = MP.currentQuote(id);
        sheet(`<h4>القيمة النهائية للخدمة</h4>
          <div class="sub">${q ? 'عرض السعر المعتمد: ' + money(q.total) : 'أدخل القيمة المتفق عليها مع العميل'}</div>
          <form class="form" id="finForm" data-id="${id}" data-rate="${rate}">
            <div><label>قيمة الخدمة (ج.م) *</label><input name="value" type="number" min="1" step="any" required inputmode="decimal" value="${q ? q.total : ''}"></div>
            <div><label>خصومات معلنة (اختياري)</label><input name="ded" type="number" min="0" step="any" value="0" inputmode="decimal"></div>
            <div class="need" id="finPrev">${ic('info')}<span>أدخل القيمة لمعاينة عمولة المنصة (${rate}%) وصافي مستحقك.</span></div>
            <button class="cta" type="submit">${ic('check')} تأكيد اكتمال العمل</button>
          </form>`);
        break;
      }
    }
    return;
  }

  /* لوحة الإدارة */
  switch (d.ad) {
    case 'tab': AD.tab = id; rerender(); break;
    case 'filter': AD.f = id; rerender(); break;
    case 'assign': {
      const r = MP.get('serviceRequests', id), cand = MP.candidates(r);
      const rest = MP.db().providers.filter(p => p.status === 'approved' && p.cats.includes(r.cat) && !cand.includes(p));
      sheet(`<h4>إسناد الطلب #${esc(r.no)}</h4>
        <div class="sub">${MP.catName(r.cat)} — ${esc(r.gov)}</div>
        ${cand.length ? `<div class="lbl">مطابقون (التخصص + المحافظة + التوفر)</div>` : `<div class="need warn">${ic('warn')}<span>لا يوجد فني مطابق تمامًا.</span></div>`}
        <div class="plist">${cand.map(p => `
          <button class="prow glass neon" data-ad="doassign" data-id="${r.id}" data-p="${p.id}">
            <span class="tx">${esc(p.name)}<small>تقييم ${p.rating || MP.rating(p.id) || '—'} • قبول ${MP.acceptRate(p.id)}%</small></span>
            ${ic('chev','chev')}
          </button>`).join('')}</div>
        ${rest.length ? `<div class="lbl">خارج التطابق الكامل</div><div class="plist">${rest.map(p => `
          <button class="prow glass neon" data-ad="doassign" data-id="${r.id}" data-p="${p.id}">
            <span class="tx">${esc(p.name)}<small>${p.govs.join('، ')}${p.available ? '' : ' • غير متاح'}</small></span>
            ${ic('chev','chev')}
          </button>`).join('')}</div>` : ''}`);
      break;
    }
    case 'doassign': {
      const x = MP.assign(id, d.p);
      closeSheet();
      toast(x.ok ? 'تم إرسال الطلب إلى ' + x.provider.name : x.msg);
      rerender();
      break;
    }
    case 'automatch': {
      const x = MP.assign(id);
      toast(x.ok ? 'تمت المطابقة التلقائية — ' + x.provider.name : x.msg);
      rerender();
      break;
    }
    case 'viewQuote': {
      const r = MP.get('serviceRequests', id), q = MP.currentQuote(id);
      if (!q) { toast('لا يوجد عرض سعر'); break; }
      sheet(`<h4>عرض سعر #${esc(r.no)}</h4>
        <div class="sub">${esc(r.serviceName)}</div>
        <div class="sumbox glass neon">
          <div><small>المصنعية</small><b>${money(q.labor)}</b></div>
          <div><small>قطع الغيار</small><b>${money(q.parts)}</b></div>
          <div><small>رسوم المعاينة</small><b>${money(q.visitFee)}</b></div>
          <div><small>الخصم</small><b>- ${money(q.discount)}</b></div>
          <div><small>الإجمالي</small><b>${money(q.total)}</b></div>
          <div><small>الحالة</small><b>${q.status}</b></div>
        </div>`);
      break;
    }
    case 'cancel': {
      if (confirm('إلغاء الطلب؟')) {
        const r = MP.get('serviceRequests', id);
        const a = MP.activeAssignment(id);
        if (a) a.status = 'withdrawn';
        MP.cancel(id, 'إلغاء من الإدارة');
        rerender();
      }
      break;
    }
    case 'padd': providerForm(null, true); break;
    case 'pedit': providerForm(MP.get('providers', id), true); break;
    case 'padmit': MP.updateProvider(id, {status:'approved'}); rerender(); toast('تمت الموافقة'); break;
    case 'preject': MP.updateProvider(id, {status:'rejected'}); rerender(); break;
    case 'psusp': {
      const p = MP.get('providers', id);
      MP.updateProvider(id, {status: p.status === 'suspended' ? 'approved' : 'suspended'});
      rerender();
      break;
    }
    case 'prate': {
      const p = MP.get('providers', id);
      const v = prompt('نسبة العمولة الخاصة (%) — اتركها فارغة للعودة للافتراضية', p.specialRate ?? '');
      if (v === null) break;
      if (v !== '' && (isNaN(v) || +v < 0 || +v > 100)) return toast('نسبة غير صحيحة');
      MP.updateProvider(id, {specialRate: v === '' ? null : +v});
      rerender();
      break;
    }
    case 'csusp': {
      const c = MP.get('customers', id);
      if (c) { c.status = c.status === 'active' ? 'suspended' : 'active'; MP.save(); rerender(); }
      break;
    }
    case 'cresolve': {
      const v = prompt('قرار الإدارة / ملخص الحل');
      if (v !== null) { MP.resolveComplaint(id, v); rerender(); }
      break;
    }
    case 'reset': {
      if (confirm('سيتم مسح كل بيانات العرض التجريبي. متابعة؟')) {
        MP.reset();
        store.set('provId', null);
        rerender();
        toast('تمت إعادة الضبط');
      }
      break;
    }
  }
});

/* ═════════ نموذج عرض السعر (V7) ═════════ */
function openQuoteForm(reqId) {
  const r = MP.get('serviceRequests', reqId);
  if (!r) return;
  const existing = MP.currentQuote(reqId);
  sheet(`<h4>${ic('st-quote')} إرسال عرض سعر</h4>
    <div class="sub">الطلب #${esc(r.no)} — ${esc(r.serviceName)}</div>
    <form class="form" id="quoteForm" data-id="${reqId}">
      <div><label>المصنعية (ج.م) *</label><input name="labor" type="number" min="0" step="any" required value="${existing ? existing.labor : ''}" inputmode="decimal"></div>
      <div><label>قطع الغيار (ج.م)</label><input name="parts" type="number" min="0" step="any" value="${existing ? existing.parts : 0}" inputmode="decimal"></div>
      <div><label>رسوم المعاينة (ج.م)</label><input name="visitFee" type="number" min="0" step="any" value="${existing ? existing.visitFee : 0}" inputmode="decimal"></div>
      <div><label>خصم (ج.م)</label><input name="discount" type="number" min="0" step="any" value="${existing ? existing.discount : 0}" inputmode="decimal"></div>
      <div><label>ملاحظة للعميل</label><textarea name="note" maxlength="300">${existing ? esc(existing.note || '') : ''}</textarea></div>
      <button class="cta" type="submit">${ic('send')} إرسال العرض للعميل</button>
    </form>`);
}

/* ═════════ حفظ الحقول ═════════ */
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.adRate !== undefined) {
    const k = t.dataset.adRate;
    if (t.value !== '' && (+t.value < 0 || +t.value > 100)) return toast('النسبة بين 0 و 100');
    if (k === 'default') { if (t.value === '') return; MP.setSetting('defaultRate', +t.value); }
    else MP.setCatRate(k, t.value);
    toast('تم حفظ النسبة'); rerender();
  }
  if (t.dataset.adSet) { MP.setSetting(t.dataset.adSet, t.type === 'checkbox' ? t.checked : t.value); toast('تم الحفظ'); }
  if (t.dataset.adColl) { MP.setCollection(t.dataset.adColl, t.value); toast('تم تحديث حالة التحصيل'); }
  if (t.id === 'calcC') calcPrev();
});
document.addEventListener('input', e => {
  if (e.target.id === 'calcV') calcPrev();
  if (e.target.closest('#finForm')) {
    const f = e.target.closest('#finForm'), v = f.value.value, rate = +f.dataset.rate;
    if (!v) return;
    const x = MP.calc(v, rate, f.ded.value);
    $('#finPrev').innerHTML = `${ic('info')}<span>عمولة المنصة (${rate}%): <b>${money(x.commission)}</b> • صافي مستحقك: <b>${money(x.net)}</b></span>`;
  }
});
function calcPrev() { const v = $('#calcV'); if (!v) return; const val = v.value; if (!val) return; const c = $('#calcC').value, r = MP.rateFor(c), x = MP.calc(val, r); $('#calcR').innerHTML = `نسبة ${MP.catName(c)}: ${r}% — العمولة <b>${money(x.commission)}</b> • صافي الفني <b>${money(x.net)}</b>`; }

/* ═════════ نماذج ═════════ */
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'rejForm') {
    e.preventDefault();
    MP.respond(f.dataset.id, false, new FormData(f).get('reason'));
    closeSheet(); rerender(); toast('تم رفض الطلب');
  }
  if (f.id === 'propForm') {
    e.preventDefault();
    MP.propose(f.dataset.id, new FormData(f).get('at'));
    closeSheet(); rerender(); toast('تم إرسال الاقتراح');
  }
  if (f.id === 'finForm') {
    e.preventDefault();
    const d = new FormData(f), v = +d.get('value');
    if (!(v > 0)) return toast('أدخل قيمة صحيحة');
    MP.complete(f.dataset.id, v, d.get('ded'));
    PV.tab = 'done'; closeSheet(); rerender(); toast('تم تسجيل اكتمال الخدمة');
  }
  if (f.id === 'quoteForm') {
    e.preventDefault();
    const d = new FormData(f);
    const res = MP.createQuote(f.dataset.id, {
      labor: +d.get('labor') || 0, parts: +d.get('parts') || 0,
      visitFee: +d.get('visitFee') || 0, discount: +d.get('discount') || 0,
      note: d.get('note') || ''
    });
    if (res.ok) {
      closeSheet(); PV.tab = 'quote'; rerender();
      toast('تم إرسال عرض السعر — بإجمالي ' + money(res.quote.total));
    } else toast(res.msg || 'تعذّر إرسال العرض');
  }
  if (f.id === 'pvForm') {
    e.preventDefault();
    const d = new FormData(f), cats = d.getAll('cats'), govs = d.getAll('govs');
    if (!cats.length) return toast('اختر تخصصًا واحدًا على الأقل');
    if (!govs.length) return toast('اختر محافظة واحدة على الأقل');
    const areas = (d.get('areas') || '').split(/[،,]/).map(s => s.trim()).filter(Boolean);
    const v = {
      name: d.get('name').trim(), phone: d.get('phone').trim(), type: d.get('type'),
      cats, govs, years: +d.get('years') || 0, docs: d.get('docs'),
      bio: (d.get('bio') || '').trim(), areas
    };
    if (f.dataset.id) MP.updateProvider(f.dataset.id, v);
    else if (f.dataset.admin === '1') { const p = MP.registerProvider(v); MP.updateProvider(p.id, {status:'approved'}); }
    else { const p = MP.registerProvider(v); store.set('provId', p.id); }
    closeSheet(); rerender();
    toast(f.dataset.admin === '1' || f.dataset.id ? 'تم الحفظ' : 'تم إرسال طلب التسجيل');
  }
});

document.addEventListener('click', e => { if (e.target.closest('[data-act="exitRole"]')) exitRole(); });

/* ═════════ زر الرجوع والأدوار ═════════ */
let _wasSheet = false;
window.addEventListener('popstate', () => { _wasSheet = state.sheet; }, true);
window.addEventListener('popstate', () => { if (ROLE && !_wasSheet) { ROLE = null; document.body.classList.remove('role-mode'); } });