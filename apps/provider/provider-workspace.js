/* HANSALEHLAK V8 — Provider Workspace 2.0
 * Customer-facing admin is deliberately untouched. This module only replaces
 * screens.provider and reuses MP + the existing provider actions/data contracts.
 */
'use strict';

const PW = (() => {
  const escPW = s => (typeof esc === 'function' ? esc(s) : String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const moneyPW = n => (typeof money === 'function' ? money(n) : (+n || 0).toLocaleString('ar-EG') + ' ج.م');
  const datePW = s => { if (!s) return 'لم يحدد'; const d = new Date(s); return Number.isNaN(d.getTime()) ? escPW(s) : d.toLocaleString('ar-EG',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}); };
  const labelPW = s => STATUS_LABEL[s] || s || '—';
  const nav = (active) => {
    const tabs = [['home','الرئيسية','home'],['new','جديدة','inbox'],['accepted','مقبولة','calendar'],['progress','جارية','wrench'],['schedule','المواعيد','clock'],['reviews','التقييمات','star'],['quote','عرض سعر','receipt'],['done','مكتملة','check'],['cancelled','ملغاة','ban'],['profile','ملفي','user']];
    return `<nav class="pw-nav" aria-label="تنقل مقدم الخدمة">${tabs.map(([k,n,ico])=>`<button type="button" data-pa="tab" data-id="${k}" class="${active===k?'on':''}" aria-current="${active===k?'page':'false'}">${ic(ico)}<span>${n}</span></button>`).join('')}</nav>`;
  };
  const stats = (items, tx, p) => {
    const sum = k => tx.reduce((v,t)=>v+(+t[k]||0),0);
    const rating = MP.rating(p.id);
    return `<div class="pw-stats">
      <div class="pw-stat"><small>طلبات جديدة</small><b>${items.new.length}</b></div>
      <div class="pw-stat"><small>طلبات مقبولة</small><b>${items.accepted.length}</b></div>
      <div class="pw-stat"><small>طلبات جارية</small><b>${items.progress.length}</b></div>
      <div class="pw-stat"><small>مكتملة</small><b>${items.done.length}</b></div>
      <div class="pw-stat"><small>صافي المستحقات التجريبية</small><b>${moneyPW(sum('net'))}</b></div>
      <div class="pw-stat"><small>التقييم المسجل</small><b>${rating ? rating + ' / 5' : 'لا يوجد بعد'}</b></div>
    </div>`;
  };
  const priority = items => {
    const queue = [
      ...items.quote.map(([r])=>({r,title:'موافقة العميل على عرض السعر',desc:'راجع العرض وتابع رد العميل',key:'quote'})),
      ...items.new.map(([r])=>({r,title:'طلب جديد ينتظر ردك',desc:'راجع التفاصيل ثم اقبل أو ارفض',key:'new'})),
      ...items.accepted.map(([r])=>({r,title:'تأكيد الموعد أو اقتراح موعد',desc:'أكمل تنسيق الزيارة مع العميل',key:'accepted'})),
      ...items.progress.map(([r])=>({r,title:'استكمال تنفيذ الخدمة',desc:'حدّث حالة العمل عند الانتقال للمرحلة التالية',key:'progress'}))
    ];
    if (!queue.length) return `<div class="pw-empty"><b>لا توجد إجراءات معلقة</b><span>ستظهر هنا الطلبات التي تحتاج إلى متابعة.</span></div>`;
    return `<div class="pw-priority">${queue.slice(0,4).map(x=>`<button type="button" class="pw-action" data-pa="tab" data-id="${x.key}"><span class="pw-action-icon">${ic(x.key==='quote'?'st-quote':x.key==='new'?'inbox':x.key==='accepted'?'calendar':'wrench')}</span><span><b>${escPW(x.title)}</b><small>#${escPW(x.r.no)} · ${escPW(x.r.serviceName)}</small><small>${escPW(x.desc)}</small></span>${ic('chev')}</button>`).join('')}</div>`;
  };
  const upcoming = items => {
    const now = Date.now();
    const rows = [...items.accepted,...items.progress].map(([r,a])=>({r,a,at:r.agreedAt||r.when||r.proposal?.at||''}))
      .filter(x=>x.at && !Number.isNaN(new Date(x.at).getTime()) && new Date(x.at).getTime() >= now - 86400000)
      .sort((a,b)=>new Date(a.at)-new Date(b.at)).slice(0,5);
    return rows.length ? `<div class="pw-list">${rows.map(x=>`<div class="pw-row"><span class="pw-date">${ic('calendar')}</span><span><b>${escPW(x.r.serviceName)}</b><small>#${escPW(x.r.no)} · ${datePW(x.at)}</small><small>${escPW(x.r.area||'')}</small></span><span class="pw-tag">${escPW(labelPW(x.r.status))}</span></div>`).join('')}</div>` : `<div class="pw-empty"><b>لا توجد مواعيد قادمة مسجلة</b><span>ستظهر المواعيد بعد تأكيدها في الطلبات.</span></div>`;
  };
  const home = (p, items, tx) => `<section class="pw-hero"><div><small>مساحة عمل مقدم الخدمة</small><h2>أهلًا، ${escPW((p.name||'').split(' ')[0])}</h2><p>تابع طلباتك ومواعيدك وأداءك من مكان واحد.</p></div><button type="button" class="pw-availability ${p.available?'is-on':''}" data-pa="avail" aria-pressed="${!!p.available}">${ic('power')} ${p.available?'متاح لاستقبال الطلبات':'متوقف عن استقبال الطلبات'}</button></section>
    ${stats(items,tx,p)}
    <section class="pw-section"><div class="pw-section-head"><h3>ماذا تحتاج أن تفعل الآن؟</h3><span>${items.new.length+items.accepted.length+items.progress.length+items.quote.length} إجراء</span></div>${priority(items)}</section>
    <section class="pw-section"><div class="pw-section-head"><h3>المواعيد القادمة</h3><button data-pa="tab" data-id="schedule">عرض الكل</button></div>${upcoming(items)}</section>
    <section class="pw-section"><h3>آخر الإشعارات</h3>${notifications(p)}</section>
    <section class="pw-section"><h3>آخر المعاملات التجريبية</h3>${transactions(tx)}</section>
    <p class="pw-disclaimer">${ic('info')} البيانات المالية والتقييمات في هذه البيئة تجريبية ومحلية، وليست سجلًا ماليًا أو اعتمادًا مهنيًا فعليًا.</p>`;
  const notifications = p => {
    const rows = MP.notesFor('provider:'+p.id).slice().sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)).slice(0,4);
    return rows.length ? `<div class="pw-list">${rows.map(n=>`<div class="pw-row"><span class="pw-date">${ic('bell')}</span><span><b>${escPW(n.text||'إشعار')}</b><small>${datePW(n.at)}</small></span>${n.read?'':'<span class="pw-tag">جديد</span>'}</div>`).join('')}</div>` : `<div class="pw-empty"><b>لا توجد إشعارات</b><span>ستظهر هنا تحديثات الطلبات والتنبيهات المسجلة.</span></div>`;
  };
  const transactions = tx => {
    const rows = tx.slice().sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)).slice(0,4);
    return rows.length ? `<div class="pw-list">${rows.map(t=>`<div class="pw-row"><span class="pw-date">${ic('wallet')}</span><span><b>${moneyPW(t.net)}</b><small>قيمة الخدمة ${moneyPW(t.value)} · عمولة ${moneyPW(t.commission)}</small><small>${datePW(t.at)}</small></span></div>`).join('')}</div>` : `<div class="pw-empty"><b>لا توجد معاملات مسجلة</b><span>ستظهر بعد تسجيل إكمال الخدمات في العرض التجريبي.</span></div>`;
  };
  const appointments = items => {
    const rows = [...items.accepted,...items.progress].map(([r,a])=>({r,a,at:r.agreedAt||r.when||r.proposal?.at||''})).filter(x=>x.at).sort((a,b)=>new Date(a.at)-new Date(b.at));
    return `<section class="pw-section"><h3>المواعيد المسجلة</h3>${rows.length?`<div class="pw-list">${rows.map(x=>`<div class="pw-row"><span class="pw-date">${ic('calendar')}</span><span><b>${escPW(x.r.serviceName)}</b><small>#${escPW(x.r.no)} · ${datePW(x.at)}</small><small>${escPW(x.r.gov||'')} · ${escPW(x.r.area||'')}</small></span><span class="pw-tag">${escPW(labelPW(x.r.status))}</span></div>`).join('')}</div>`:`<div class="pw-empty"><b>لا توجد مواعيد مسجلة</b><span>المواعيد تظهر هنا من الطلبات التي تم قبولها أو تأكيدها.</span></div>`}</section>`;
  };
  const reviews = p => {
    const all = MP.db().reviews.filter(r=>r.providerId===p.id).sort((a,b)=>new Date(b.at||0)-new Date(a.at||0));
    return `<section class="pw-section"><h3>تقييمات العملاء</h3>${all.length?`<div class="pw-list">${all.map(r=>`<article class="pw-review"><div><b>${'★'.repeat(Math.max(0,Math.min(5,+r.stars||0)))}</b><small>${datePW(r.at)}</small></div><p>${escPW(r.comment||r.quality||'لم يترك العميل تعليقًا.')}</p></article>`).join('')}</div>`:`<div class="pw-empty"><b>لا توجد تقييمات بعد</b><span>ستظهر تقييمات العملاء بعد إغلاق الطلبات وتسجيل التقييم.</span></div>`}</section>`;
  };
  const profile = p => `<section class="pw-section"><div class="pw-profile"><div class="pw-avatar">${escPW((p.name||'?').split(' ').map(x=>x[0]).slice(0,2).join(''))}</div><div><h3>${escPW(p.name)}</h3><small>${escPW(p.phone||'')}</small><small>${(p.cats||[]).map(c=>escPW(MP.catName(c))).join('، ')}</small></div></div><button type="button" class="cta ghost" data-pw-edit-profile>تعديل بيانات الملف</button><dl class="pw-details"><div><dt>المحافظات</dt><dd>${escPW((p.govs||[]).join('، ')||'غير محدد')}</dd></div><div><dt>مناطق الخدمة</dt><dd>${escPW((p.areas||[]).join('، ')||'غير محددة')}</dd></div><div><dt>النبذة</dt><dd>${escPW(p.bio||'لم تُضف نبذة بعد')}</dd></div><div><dt>حالة الحساب</dt><dd>${p.demo?'حساب عرض تجريبي':'حساب مسجل'} · ${p.status==='approved'?'مقبول بالمنصة':'قيد المراجعة'}</dd></div></dl><p class="pw-disclaimer">لا تعرض هذه الصفحة شهادات أو اعتمادات غير مسجلة في بيانات الحساب.</p></section>`;
  const grouped = (p, items, key) => {
    const arr = items[key] || [];
    return `<section class="pw-section"><div class="pw-section-head"><h3>${escPW(provState[key]||key)}</h3><span>${arr.length} طلب</span></div>${arr.length?arr.map(([r,a])=>provCard(r,a,p)).join(''):`<div class="pw-empty"><b>لا توجد طلبات في هذا القسم</b><span>ستظهر هنا الطلبات المطابقة لهذه الحالة.</span></div>`}</section>`;
  };
  const render = () => {
    const p = myProvider();
    if (!p) return `<div class="screen">${roleBar('بوابة مقدم الخدمة')}${demoBanner()}<h2 class="sec-title">الدخول كمقدم خدمة</h2><div class="plist">${MP.db().providers.map(x=>`<button class="prow" data-pa="login" data-id="${escPW(x.id)}"><span class="tx">${escPW(x.name)}<small>${x.demo?'حساب عرض تجريبي':'حساب مسجل'}</small></span>${ic('chev')}</button>`).join('')}</div><button class="cta" data-pa="register">${ic('user')} تسجيل مقدم خدمة جديد</button></div>`;
    if (p.status !== 'approved') return `<div class="screen">${roleBar(escPW(p.name))}<div class="pw-empty"><b>${p.status==='pending'?'طلب التسجيل قيد المراجعة':p.status==='suspended'?'الحساب معلّق':'طلب التسجيل غير مقبول'}</b><span>لا يمكن إدارة الطلبات قبل تفعيل الحساب في بيئة العرض.</span></div><button class="cta ghost" data-pa="logout">تبديل الحساب</button></div>`;
    const items = provRequests(p), tx = MP.db().transactions.filter(t=>t.providerId===p.id);
    const active = PV.tab || 'home';
    let content = active==='home' ? home(p,items,tx)
      : active==='schedule' ? appointments(items)
      : active==='reviews' ? reviews(p)
      : active==='profile' ? profile(p)
      : grouped(p,items,active);
    return `<div class="screen pw-screen">${roleBar(escPW(p.name))}${demoBanner()}${nav(active)}${content}<button class="cta ghost" data-pa="logout">تبديل الحساب</button></div>`;
  };
  return {render};
})();

document.addEventListener('click', e => {
  const b = e.target.closest('[data-pw-edit-profile]');
  if (!b) return;
  const p = myProvider();
  if (p && typeof providerForm === 'function') providerForm(p, false);
});

screens.provider = () => PW.render();
