/* HANSALEHLAK V8 — Standalone Provider Application (local demo adapter). */
'use strict';
(function (root) {
  const $ = (selector, scope=document) => scope.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => (Number(value)||0).toLocaleString('ar-EG',{maximumFractionDigits:2})+' ج.م';
  const date = value => { if(!value) return 'لم يحدد'; const d=new Date(value); return Number.isNaN(d.getTime())?esc(value):d.toLocaleString('ar-EG',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}); };
  const icon = name => typeof ic==='function' ? ic(name) : '';
  let dom, toastTimer;
  const session = root.HSProviderSession;
  const router = root.HSProviderRouter;
  const domain = root.HSProviderDomain;
  const currentProvider = () => { const id=session.currentId(); return id ? MP.get('providers',id) : null; };
  const providerGroups = p => domain.groupAssignments(MP.db(),p.id);
  const toast = message => { dom.toast.textContent=message; dom.toast.classList.add('is-visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>dom.toast.classList.remove('is-visible'),2400); };
  const STALE = 'تعذر تنفيذ الإجراء؛ تغيرت حالة الطلب. تم تحديث العرض.';
  const BASE_TITLE = 'مساحة مقدم الخدمة | هنصلحلك';
  let lastRouteKey = null, formTrigger = null;
  const actionSel = (action,id) => `[data-pv-action="${action}"][data-id="${id}"]`;
  const detailsSel = id => `[data-pv-route="request/${encodeURIComponent(id)}"]`;
  const reduceMotion = () => typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Focus the first matching control in the view, falling back to the view itself (tabindex="-1"). */
  function focusIn(selectors) {
    for (const sel of [].concat(selectors||[])) { const el=$(sel,dom.view); if(el){ el.focus({preventScroll:true}); return; } }
    dom.view.focus({preventScroll:true});
  }
  const tabs = [['home','الرئيسية'],['new','طلبات جديدة'],['accepted','مقبولة'],['progress','جارية'],['quote','عروض الأسعار'],['schedule','المواعيد'],['done','مكتملة'],['reviews','التقييمات'],['transactions','المعاملات'],['earnings','الأرباح'],['services','خدماتي'],['notifications','الإشعارات'],['profile','ملفي']];

  /* Firebase backend: identity comes from a verified phone sign-in, never from a list of accounts. */
  const firebaseMode=()=>!!(globalThis.HSFirebaseConfig&&globalThis.HSFirebaseConfig.mode==='firebase');
  function firebaseSignIn() {
    dom.nav.hidden=true; $('[data-pv-action="logout"]',dom.host).hidden=true;
    dom.view.innerHTML=`<section class="pv-welcome" data-pv-signin-screen><span class="pv-eyebrow">HANSALEHLAK · PROVIDER PORTAL</span><h1>مساحة عمل مقدم الخدمة</h1><p>سجّل الدخول برقم الموبايل المسجّل لديك. تُفتح مساحة العمل بعد اعتماد الإدارة لتسجيلك.</p><button class="pv-btn pv-btn-primary" type="button" data-pv-fb-signin>دخول برقم الموبايل</button></section><section class="pv-panel"><div class="pv-section-head"><h2>مقدم خدمة جديد؟</h2></div><p class="pv-hint">سجّل بياناتك؛ يظهر طلبك بحالة «قيد المراجعة» حتى تعتمده الإدارة.</p><a class="pv-btn" href="#/join">الانضمام كمقدم خدمة</a></section>`;
    const b=dom.view.querySelector('[data-pv-fb-signin]');
    if(b)b.addEventListener('click',()=>{ if(globalThis.HSBackend)globalThis.HSBackend.signInProvider().catch(()=>{}); });
  }
  /* once the backend confirms a provider identity, reopen the workspace (the shell mounts once per page load) */
  if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('hs:backend-sync',e=>{
    const a=e.detail&&e.detail.actor;
    if(a&&a.role==='provider'&&dom&&dom.view&&dom.view.querySelector('[data-pv-signin-screen]'))location.reload();
  });
  function accountPicker() {
    if(firebaseMode())return firebaseSignIn();
    const accounts=HSProviderAuth.listDemoAccounts(MP);
    dom.nav.hidden=true; $('[data-pv-action="logout"]',dom.host).hidden=true;
    dom.view.innerHTML=`<section class="pv-welcome"><span class="pv-eyebrow">HANSALEHLAK · PROVIDER PORTAL</span><h1>مساحة عمل مقدم الخدمة</h1><p>اختر حسابًا تجريبيًا لفتح مساحة العمل. هذا الاختيار لا يمثل تسجيل دخول حقيقيًا ولا يمنح صلاحيات إنتاجية.</p></section><section class="pv-panel"><div class="pv-section-head"><h2>حسابات العرض</h2><span>${accounts.length} حساب</span></div><div class="pv-account-list">${accounts.map(p=>`<button class="pv-account" type="button" data-pv-action="select" data-id="${esc(p.id)}"><span class="pv-avatar">${esc(p.name.slice(0,1))}</span><span class="pv-account-copy"><b>${esc(p.name)}</b><small>${p.demo?'حساب تجريبي':'حساب مسجل'} · ${p.status==='approved'?'مقبول':p.status==='pending'?'قيد المراجعة':p.status==='suspended'?'معلّق':'مرفوض'}</small></span><span class="pv-arrow">${icon('chev')}</span></button>`).join('')}</div></section><section class="pv-panel"><div class="pv-section-head"><h2>مقدم خدمة جديد؟</h2></div><p class="pv-hint">سجّل حسابًا تجريبيًا محليًا؛ يظهر بحالة «قيد المراجعة» حتى تعتمده الإدارة.</p><button class="pv-btn pv-btn-primary" type="button" data-pv-action="register">تسجيل مقدم خدمة جديد</button></section><p class="pv-disclaimer">لا توجد مصادقة فعلية في هذه النسخة. لا تستخدم بيانات حقيقية أو تعتبر هذه الشاشة حماية للحساب.</p>`;
  }

  /* Demo self-registration (parity with legacy providerForm). Local only: MP.registerProvider → status "pending". */
  /* One provider-details form for onboarding (register) and profile editing (same fields, same validator). */
  function providerFormHtml(o) {
    const v=o.values||{}, cs=new Set(v.cats||[]), gs=new Set(v.govs||[]);
    const checks=(name,items,sel)=>items.map(([value,label])=>`<label class="pv-check"><input type="checkbox" name="${name}" value="${esc(value)}"${sel.has(value)?' checked':''}> ${esc(label)}</label>`).join('');
    const cats=Object.keys(SERVICE_TYPES).map(c=>[c,MP.catName(c)]), govs=MP.GOVS.map(g=>[g,g]);
    const val=k=>v[k]!=null&&v[k]!==''?` value="${esc(v[k])}"`:'';
    return `<form class="pv-inline-form pv-register-form" id="${o.id}" aria-label="${esc(o.label)}"><label>الاسم *<input name="name" required maxlength="80" autocomplete="name"${val('name')}></label><label>رقم الهاتف *<input name="phone" type="tel" inputmode="tel" required pattern="[0-9+ ]{8,15}" aria-describedby="pv-reg-phone-hint" autocomplete="tel"${val('phone')}><small class="pv-hint" id="pv-reg-phone-hint">من 8 إلى 15 خانة: أرقام ومسافات و+ فقط.</small></label><label>النوع<select name="type"><option value="individual">فرد</option><option value="company"${v.type==='company'?' selected':''}>شركة</option></select></label><label>سنوات الخبرة<input name="years" type="number" min="0" max="60" step="1" value="${esc(v.years!=null?v.years:0)}"></label><fieldset class="pv-wide"><legend>التخصصات *</legend>${checks('cats',cats,cs)}</fieldset><fieldset class="pv-wide"><legend>المحافظات *</legend>${checks('govs',govs,gs)}</fieldset><label class="pv-wide">المناطق المفضلة (اختياري)<input name="areas" placeholder="مثل: مدينة نصر، المعادي"${v.areas&&v.areas.length?` value="${esc(v.areas.join('، '))}"`:''}></label><label class="pv-wide">نبذة قصيرة<textarea name="bio" maxlength="300">${esc(v.bio||'')}</textarea></label><label class="pv-wide">أسماء المستندات (اختياري)<input name="docs" maxlength="200"${val('docs')}><small class="pv-hint">في العرض التجريبي تُحفظ الأسماء فقط، ولا يتم التحقق من الهوية أو المستندات.</small></label><button class="pv-btn pv-btn-primary">${esc(o.submit)}</button><button type="button" class="pv-btn" data-pv-action="cancel-form">إلغاء</button></form>`;
  }
  function openProviderForm(kind,id,html) {
    $('.pv-inline-form',dom.view)?.remove();
    formTrigger={kind,id:''};
    dom.view.insertAdjacentHTML('afterbegin',html);
    const form=$('#'+id,dom.view);
    if(form){ form.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'start'}); form.querySelector('input,select')?.focus({preventScroll:true}); }
  }
  function openRegisterForm() { openProviderForm('register', 'pv-register-form', providerFormHtml({ id:'pv-register-form', label:'تسجيل مقدم خدمة جديد', submit:'إرسال طلب التسجيل' })); }
  /* Profile editing (enabled 2026-11-14): same fields/validation as onboarding; status and approval are not editable here. */
  function openProfileForm(p) { openProviderForm('edit-profile', 'pv-profile-form', providerFormHtml({ id:'pv-profile-form', label:'تعديل ملف مقدم الخدمة', submit:'حفظ التعديلات', values:p })); }

  /* Validation mirrors legacy pvForm (name, phone pattern, >=1 specialty, >=1 governorate) and also rejects tampered values. */
  function registrationFrom(data) {
    const text=k=>String(data.get(k)??'').trim();
    const name=text('name'); if(!name||name.length>80) return {error:'أدخل الاسم (حتى 80 حرفًا)',field:'name'};
    const phone=text('phone'); if(!/^[0-9+ ]{8,15}$/.test(phone)) return {error:'أدخل رقم الهاتف بشكل صحيح: من 8 إلى 15 خانة (أرقام ومسافات و+)',field:'phone'};
    const cats=data.getAll('cats').map(String); if(!cats.length||!cats.every(c=>Object.prototype.hasOwnProperty.call(SERVICE_TYPES,c))) return {error:'اختر تخصصًا واحدًا على الأقل من القائمة',field:'cats'};
    const govs=data.getAll('govs').map(String); if(!govs.length||!govs.every(g=>MP.GOVS.includes(g))) return {error:'اختر محافظة واحدة على الأقل من القائمة',field:'govs'};
    const yearsRaw=text('years'), years=yearsRaw===''?0:Number(yearsRaw); if(!Number.isInteger(years)||years<0||years>60) return {error:'سنوات الخبرة رقم صحيح من 0 إلى 60',field:'years'};
    const bio=text('bio'); if(bio.length>300) return {error:'النبذة حتى 300 حرف',field:'bio'};
    return {value:{name,phone,type:text('type')==='company'?'company':'individual',cats,govs,
      areas:text('areas').split(/[،,]/).map(s=>s.trim()).filter(Boolean),years,bio,docs:text('docs').slice(0,200)}};
  }

  function renderNav(active) {
    dom.nav.hidden=false;
    /* V9: each destination carries its Lucide icon (shared registry); the label stays the accessible name. */
    const NAV_ICON={home:'home',new:'inbox',accepted:'st-accepted',progress:'st-working',quote:'st-quote',schedule:'calendar',done:'st-done',reviews:'star',transactions:'wallet',earnings:'earnings',services:'wrench',notifications:'bell',profile:'user'};
    dom.nav.innerHTML=tabs.map(([id,label])=>`<button type="button" data-pv-route="${id}" class="${active===id?'is-active':''}" ${active===id?'aria-current="page"':''}>${typeof ic==='function'?ic(NAV_ICON[id]||'dots'):''}<span>${esc(label)}</span></button>`).join('');
  }

  function summary(p,groups,transactions) {
    const t=domain.totals(transactions);
    const active=groups.new.length+groups.accepted.length+groups.progress.length+groups.quote.length;
    return `<section class="pv-hero"><div><span class="pv-eyebrow">مساحة مقدم الخدمة</span><h1>أهلًا، ${esc((p.name||'').split(' ')[0])}</h1><p>تابع الطلبات والمواعيد ومستحقاتك التجريبية من مكان واحد.</p></div><button class="pv-availability ${p.available?'is-on':''}" type="button" data-pv-action="availability" aria-pressed="${!!p.available}">${icon('power')} ${p.available?'متاح لاستقبال الطلبات':'متوقف عن استقبال الطلبات'}</button></section><section class="pv-kpis"><article><small>إجراءات معلقة</small><b>${active}</b></article><article><small>طلبات جديدة</small><b>${groups.new.length}</b></article><article><small>قيد التنفيذ</small><b>${groups.progress.length+groups.accepted.length}</b></article><article><small>مكتملة</small><b>${groups.done.length}</b></article><article><small>إجمالي الخدمات</small><b>${money(t.value)}</b></article><article><small>صافي مستحقات تجريبية</small><b>${money(t.net)}</b></article></section>`;
  }

  function requestCard(item,p) {
    const r=item.request,a=item.assignment,quote=MP.currentQuote(r.id);
    const actions=[];
    if(a.status==='offered') actions.push(`<button class="pv-btn pv-btn-primary" data-pv-action="accept" data-id="${esc(r.id)}">قبول الطلب</button>`,`<button class="pv-btn" data-pv-action="reject" data-id="${esc(r.id)}">رفض</button>`);
    if(a.status==='accepted') {
      if(r.status==='accepted'&&!r.proposal) actions.push(`<button class="pv-btn pv-btn-primary" data-pv-action="confirm" data-id="${esc(r.id)}">تأكيد الموعد</button>`,`<button class="pv-btn" data-pv-action="propose" data-id="${esc(r.id)}">اقتراح موعد</button>`);
      if(r.status==='scheduled') actions.push(`<button class="pv-btn pv-btn-primary" data-pv-action="advance" data-next="enroute" data-id="${esc(r.id)}">أنا في الطريق</button>`);
      if(r.status==='enroute') actions.push(`<button class="pv-btn pv-btn-primary" data-pv-action="advance" data-next="arrived" data-id="${esc(r.id)}">وصلت</button>`);
      if(r.status==='arrived') actions.push(`<button class="pv-btn pv-btn-primary" data-pv-action="advance" data-next="started" data-id="${esc(r.id)}">بدأت الخدمة</button>`);
      const fs=r.freeService&&r.freeService.status;
      if(fs==='accepted'&&['scheduled','enroute','arrived','started'].includes(r.status)) actions.push(`<button class="pv-btn pv-btn-primary" data-pv-action="complete-free" data-id="${esc(r.id)}">تسجيل إكمال الخدمة المجانية</button>`);
      else if(fs!=='proposed'&&['started','quote'].includes(r.status)) {
        /* Paid lifecycle: pending quote → only update it (customer decides); approved quote → only complete at the agreed price. */
        const agreed=quote&&quote.status==='approved', waiting=quote&&quote.status==='pending';
        if(!agreed) actions.push(`<button class="pv-btn" data-pv-action="quote" data-id="${esc(r.id)}">${waiting?'تحديث عرض السعر':'إرسال عرض سعر'}</button>`);
        if(!waiting) actions.push(`<button class="pv-btn pv-btn-primary" data-pv-action="complete" data-id="${esc(r.id)}">تسجيل الإكمال</button>`);
        if(r.status==='started'&&!(quote&&['pending','approved'].includes(quote.status))&&fs!=='declined') actions.push(`<button class="pv-btn" data-pv-action="free" data-id="${esc(r.id)}">تنفيذ كخدمة مجانية</button>`);
      }
    }
    const freeNote=r.freeService?`<p class="pv-note">خدمة مجانية (${esc((MP.FREE_REASONS||{})[r.freeService.reason]||'')}): ${({proposed:'بانتظار موافقة العميل',accepted:'وافق العميل — نفّذ وسجّل الإكمال',declined:'رفض العميل؛ يمكن إرسال عرض سعر',completed:'اكتملت بلا مقابل'})[r.freeService.status]||''}</p>`:'';
    const address=a.status==='accepted'?`${esc(r.gov)} · ${esc(r.area)} · ${esc(r.addr)}`:`${esc(r.gov)} · ${esc(r.area)} — يظهر العنوان التفصيلي بعد قبول الطلب`;
    return `<article class="pv-request"><header><div><span class="pv-order-no">${esc(r.no||r.id)}</span><h3>${esc(r.serviceName||'طلب خدمة')}</h3></div><span class="pv-status">${esc(STATUS_LABEL[r.status]||r.status)}</span></header><p>${esc(r.desc||'لا يوجد وصف إضافي')}</p><div class="pv-meta"><span>${icon('calendar')} ${date(r.agreedAt||r.when)}</span><span>${icon('pin')} ${address}</span></div>${r.proposal?`<p class="pv-note">اقتراح الموعد: ${date(r.proposal.at)} — بانتظار العميل</p>`:''}${freeNote}${quote?`<div class="pv-quote"><b>عرض السعر: ${money(quote.total)}</b><span>${quote.status==='approved'?'مقبول':quote.status==='rejected'?'مرفوض':'بانتظار العميل'}</span></div>`:''}<div class="pv-actions"><button class="pv-btn" type="button" data-pv-route="request/${encodeURIComponent(r.id)}">عرض التفاصيل</button>${actions.join('')}</div></article>`;
  }

  function sectionFor(page,p,groups,transactions) {
    const reviews=MP.db().reviews.filter(x=>x.providerId===p.id);
    const notifications=typeof MP.notesFor==='function'?MP.notesFor('provider:'+p.id):[];
    const totals=domain.totals(transactions);
    const ctx={p,groups,transactions,reviews,notifications,totals,esc,date,money,catName:MP.catName,
      summary,requestCard,statusLabel:STATUS_LABEL,items:Object.values(groups).flat(),
      renderGroup(key){const items=groups[key]||[];return `<section class="pv-panel"><div class="pv-section-head"><h1>${esc(domain.GROUPS[key]||key)}</h1><span>${items.length} طلب</span></div>${items.length?items.map(x=>requestCard(x,p)).join(''):'<div class="pv-empty">لا توجد طلبات في هذا القسم.</div>'}</section>`;}};
    const renderers={
      home:()=>HSProviderDashboardPage.render(ctx),new:()=>HSProviderIncomingRequestsPage.render(ctx),
      progress:()=>HSProviderActiveJobsPage.render(ctx),quote:()=>HSProviderQuotesPage.render(ctx),
      schedule:()=>HSProviderSchedulePage.render(ctx),reviews:()=>HSProviderReviewsPage.render(ctx),
      transactions:()=>HSProviderTransactionsPage.render(ctx),earnings:()=>HSProviderEarningsPage.render(ctx),
      profile:()=>HSProviderProfilePage.render(ctx),services:()=>HSProviderServicesPage.render(ctx),
      notifications:()=>HSProviderNotificationsPage.render(ctx),
      request:()=>HSProviderRequestDetailsPage.render({...ctx,id:router.parse(location.hash).id,backPage:'home'})
    };
    if(['accepted','done','cancelled'].includes(page)) return ctx.renderGroup(page);
    return (renderers[page]||renderers.home)();
  }

  /* render(focusTargets): a route change focuses the main view; a same-route re-render (after an action)
     restores focus to the first matching selector so keyboard users are not dropped to <body>. */
  function render(focusTargets) {
    const p=currentProvider();
    if(!p){accountPicker();const joining=router.parse(location.hash).page==='join';settle(joining?'join':'picker',joining?'الانضمام كمقدم خدمة':'اختيار حساب العرض',focusTargets);if(joining)openRegisterForm();return;}
    $('[data-pv-action="logout"]',dom.host).hidden=false;
    if(p.status!=='approved') {
      dom.nav.hidden=true;
      dom.view.innerHTML=`<section class="pv-panel pv-gate"><span class="pv-eyebrow">حالة الحساب</span><h1>${p.status==='pending'?'طلب التسجيل قيد المراجعة':p.status==='suspended'?'الحساب معلّق':'الحساب غير مقبول'}</h1><p>لا يمكن إدارة الطلبات قبل اعتماد الحساب من الإدارة.</p><button class="pv-btn" data-pv-action="logout">تبديل الحساب</button></section>`;
      settle('gate','حالة الحساب',focusTargets);
      return;
    }
    const {page,id}=router.parse(location.hash), groups=providerGroups(p), tx=MP.db().transactions.filter(t=>t.providerId===p.id);
    renderNav(page);
    dom.view.innerHTML=sectionFor(page,p,groups,tx);
    settle(page+'/'+(page==='request'?id:''),titleFor(page),focusTargets);
  }

  const titleFor = page => page==='request' ? 'تفاصيل الطلب' : ((tabs.find(t=>t[0]===page)||[])[1] || domain.GROUPS[page] || 'الرئيسية');

  function settle(routeKey,label,focusTargets) {
    const first=lastRouteKey===null, changed=routeKey!==lastRouteKey;
    lastRouteKey=routeKey;
    document.title=`${label} | ${BASE_TITLE}`;
    if(first) return; // never steal focus on initial load
    if(changed) {
      // A new screen starts at the top (e.g. logout from a long, scrolled profile page back to the picker).
      try { if(typeof root.scrollTo==='function') root.scrollTo(0,0); } catch {}
      dom.view.focus({preventScroll:true});
    }
    else if(focusTargets) focusIn(focusTargets);
  }

  function openForm(kind,id) {
    const request=MP.get('serviceRequests',id); if(!request) return;
    $('.pv-inline-form',dom.view)?.remove(); // one inline form at a time: avoids duplicate ids
    formTrigger={kind,id};
    const named=label=>`aria-label="${esc(label+' '+(request.no||request.id))}"`;
    if(kind==='reject') dom.view.insertAdjacentHTML('afterbegin',`<form class="pv-inline-form" id="pv-reject-form" data-id="${esc(id)}" ${named('رفض الطلب')}><label>سبب الرفض<select name="reason" required><option>خارج نطاق تخصصي</option><option>خارج المنطقة</option><option>غير متاح في الموعد</option><option>أخرى</option></select></label><button class="pv-btn pv-btn-primary">تأكيد الرفض</button><button type="button" class="pv-btn" data-pv-action="cancel-form">إلغاء</button></form>`);
    if(kind==='propose') dom.view.insertAdjacentHTML('afterbegin',`<form class="pv-inline-form" id="pv-propose-form" data-id="${esc(id)}" ${named('اقتراح موعد للطلب')}><label>الموعد المقترح<input type="datetime-local" name="at" required min="${new Date(Date.now()+60000).toISOString().slice(0,16)}"></label><button class="pv-btn pv-btn-primary">إرسال الاقتراح</button><button type="button" class="pv-btn" data-pv-action="cancel-form">إلغاء</button></form>`);
    if(kind==='quote') { const q=MP.currentQuote(id); dom.view.insertAdjacentHTML('afterbegin',`<form class="pv-inline-form" id="pv-quote-form" data-id="${esc(id)}" ${named('عرض سعر للطلب')}><label>المصنعية<input name="labor" type="number" min="0" step="0.01" required value="${q?.labor??''}"></label><label>قطع الغيار<input name="parts" type="number" min="0" step="0.01" value="${q?.parts??0}"></label><label>رسوم المعاينة<input name="visitFee" type="number" min="0" step="0.01" value="${q?.visitFee??0}"></label><label>الخصم<input name="discount" type="number" min="0" step="0.01" value="${q?.discount??0}"></label><label>ملاحظة<textarea name="note" maxlength="300">${esc(q?.note||'')}</textarea></label><button class="pv-btn pv-btn-primary">إرسال عرض السعر</button><button type="button" class="pv-btn" data-pv-action="cancel-form">إلغاء</button></form>`); }
    if(kind==='complete') { const q=MP.currentQuote(id); const suggested=q?.status==='approved'?q.total:''; const p=currentProvider(); const rate=p?Number(MP.rateFor(request.cat,p.id))||0:0; dom.view.insertAdjacentHTML('afterbegin',`<form class="pv-inline-form" id="pv-complete-form" data-id="${esc(id)}" data-rate="${rate}" ${named('تسجيل إكمال الطلب')}><label>القيمة النهائية (ج.م)<input name="value" type="number" min="1" step="0.01" required value="${suggested}"${suggested!==''?' readonly aria-describedby="agreed-price-note"':''}></label>${suggested!==''?'<p class="pv-note" id="agreed-price-note">السعر المتفق عليه مع العميل؛ لا يمكن تغييره عند الإكمال.</p>':''}<label>خصومات معلنة<input name="deductions" type="number" min="0" step="0.01" value="0"></label><p class="pv-calc" id="pv-complete-preview" aria-live="polite">${completionPreview(rate,suggested,0)}</p><button class="pv-btn pv-btn-primary">تأكيد اكتمال الخدمة</button><button type="button" class="pv-btn" data-pv-action="cancel-form">إلغاء</button></form>`); }
    if(kind==='free') dom.view.insertAdjacentHTML('afterbegin',`<form class="pv-inline-form" id="pv-free-form" data-id="${esc(id)}" ${named('خدمة مجانية للطلب')}><label>سبب تنفيذ الخدمة مجانًا<select name="reason" required><option value="">اختر السبب</option>${Object.entries(MP.FREE_REASONS||{}).map(([k,l])=>`<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select></label><p class="pv-hint pv-wide">لا يُسجَّل أي مبلغ ولا عمولة؛ يتطلب موافقة العميل قبل التنفيذ. الخدمة المجانية ليست عرض سعر بقيمة صفر.</p><button class="pv-btn pv-btn-primary">إرسال الاقتراح للعميل</button><button type="button" class="pv-btn" data-pv-action="cancel-form">إلغاء</button></form>`);
    const form=$('#'+({reject:'pv-reject-form',propose:'pv-propose-form',quote:'pv-quote-form',complete:'pv-complete-form',free:'pv-free-form'}[kind]),dom.view);
    if(form) { form.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'center'}); form.querySelector('input,select')?.focus({preventScroll:true}); }
  }

  /* Close the open inline form and return focus to the control that opened it. */
  function cancelForm() {
    $('.pv-inline-form',dom.view)?.remove();
    const trigger=formTrigger; formTrigger=null;
    if(trigger) focusIn([trigger.id?actionSel(trigger.kind,trigger.id):`[data-pv-action="${trigger.kind}"]`]);
  }

  /* Validation failure: announce through the live toast and keep focus inside the form for correction. */
  function invalid(form,message,field) {
    toast(message);
    const el=$('#'+form.id,dom.view);
    (field&&el?.querySelector(`[name="${field}"]`)||el?.querySelector('input,select,textarea'))?.focus({preventScroll:true});
  }

  /* Live commission/net preview while completing a job (parity with legacy #finPrev; local demo figures only). */
  function completionPreview(rate,value,deductions) {
    const v=Number(value), d=Number(deductions||0);
    if(!(v>0)) return `أدخل القيمة لمعاينة عمولة المنصة (${rate}%) وصافي مستحقك التجريبي.`;
    if(!Number.isFinite(d)||d<0||d>v) return 'الخصم يجب أن يكون بين صفر وقيمة الخدمة.';
    const x=MP.calc(v,rate,d);
    return `عمولة المنصة (${rate}%): ${money(x.commission)} • الخصومات: ${money(x.deductions)} • صافي مستحقك التجريبي: ${money(x.net)}`;
  }

  function onInput(event) {
    const form=event.target.closest('#pv-complete-form'); if(!form) return;
    const data=new FormData(form), out=$('#pv-complete-preview',dom.view);
    if(out) out.textContent=completionPreview(Number(form.dataset.rate)||0,data.get('value'),data.get('deductions'));
  }

  function onKeydown(event) {
    if(event.key==='Escape'&&event.target.closest('.pv-inline-form')){event.preventDefault();cancelForm();}
  }

  function onClick(event) {
    const route=event.target.closest('[data-pv-route]'); if(route){const [page,id='']=route.dataset.pvRoute.split('/');router.navigate(page,id);return;}
    const button=event.target.closest('[data-pv-action]'); if(!button)return;
    const {pvAction:action,id,next}=button.dataset;
    if(action==='select') { const p=HSProviderAuth.resolveDemoAccount(MP,id); if(!p)return; session.select(id); router.navigate('home'); render(); toast('تم فتح حساب العرض التجريبي'); return; }
    if(action==='logout') { session.clear(); router.navigate('home'); render(); return; }
    if(action==='register') { openRegisterForm(); return; }
    if(action==='cancel-form') { cancelForm(); return; } // also needed on the picker, where no provider is selected
    const p=currentProvider(); if(!p)return;
    const nearRequest=[actionSel('advance',id),detailsSel(id)];
    if(action==='reject'||action==='propose'||action==='quote'||action==='complete'||action==='free'){openForm(action,id);return;}
    if(action==='edit-profile'){openProfileForm(p);return;}
    /* Mutations go through the API adapters (services/*-api.js); MP stays the local read model. */
    const failedButton=res=>{render([detailsSel(id)]);toast(isStale(res)?STALE:errorText(res));};
    if(action==='availability') return perform('availability',button,()=>api.provider.setAvailability(!p.available),()=>render(['[data-pv-action="availability"]']),res=>toast(errorText(res)));
    if(action==='accept') return perform('accept:'+id,button,()=>api.orders.respond(id,true),()=>{router.navigate('accepted');render();toast('تم قبول الطلب');},failedButton);
    if(action==='complete-free') return perform('complete-free:'+id,button,()=>api.quotes.completeFree(id),()=>{router.navigate('done');render();toast('تم تسجيل إكمال الخدمة المجانية (بلا مقابل)');},failedButton);
    if(action==='confirm') return perform('confirm:'+id,button,()=>api.orders.schedule(id),()=>{render(nearRequest);toast('تم تأكيد الموعد');},failedButton);
    if(action==='advance') return perform('advance:'+id,button,()=>api.orders.advance(id,next),()=>{followToGroup(id,p);render(nearRequest);toast('تم تحديث حالة الطلب');},()=>{render(nearRequest);toast('تعذر تحديث الحالة؛ راجع تسلسل الطلب');});
  }

  /* ── API adapter boundary ───────────────────────────────────────────────────────────────────────────
     perform(key, control, request, onOk, onFail): one in-flight request per key (double clicks / double Enter are
     ignored), the control is disabled + aria-busy while waiting, and the envelope decides success or failure. */
  const api={ orders:root.HSOrdersApi, quotes:root.HSQuotesApi, provider:root.HSProviderApi };
  const inFlight=new Set();
  const isStale=res=>!!res&&(res.status===404||res.status===409);
  const errorText=res=>(res&&res.error&&res.error.message)||'تعذر تنفيذ الإجراء. حاول مرة أخرى.';
  function setBusy(control,busy){ if(!control||typeof control.setAttribute!=='function')return; try{ control.disabled=busy; if(busy)control.setAttribute('aria-busy','true'); else control.removeAttribute('aria-busy'); }catch{} }
  async function perform(key,control,request,onOk,onFail){
    if(inFlight.has(key)) return;
    inFlight.add(key); setBusy(control,true);
    try{ const res=await request(); if(res&&res.ok) onOk(res); else onFail(res); }
    catch{ onFail(null); }
    finally{ inFlight.delete(key); setBusy(control,false); }
  }

  function onSubmit(event) {
    const form=event.target;
    if(!form.matches('.pv-inline-form'))return;
    event.preventDefault(); const data=new FormData(form), id=form.dataset.id;
    const submitter=form.querySelector?form.querySelector('.pv-btn-primary'):null;
    const stale=res=>{ if(res&&res.status===422) return invalid(form,errorText(res)); formTrigger=null;render([detailsSel(id)]);toast(STALE); };
    const done=(focusAfter)=>{formTrigger=null;render(focusAfter);};
    if(form.id==='pv-register-form'){
      const result=registrationFrom(data); if(result.error) return invalid(form,result.error,result.field);
      return perform('register',submitter,()=>api.provider.register(result.value),res=>{
        session.select(res.data.id); formTrigger=null; router.navigate('home'); render();
        toast('تم إرسال طلب التسجيل (تجريبي) — بانتظار اعتماد الإدارة');
      },res=>invalid(form,errorText(res)));
    }
    if(form.id==='pv-reject-form'){const reason=String(data.get('reason')||'').trim();if(!reason)return invalid(form,'اختر سبب الرفض');return perform('reject:'+id,submitter,()=>api.orders.respond(id,false,reason),()=>{router.navigate('cancelled');toast('تم رفض الطلب');done();},stale);}
    if(form.id==='pv-propose-form'){const value=data.get('at'),at=value?new Date(value):null;if(!at||Number.isNaN(at.getTime()))return invalid(form,'أدخل موعدًا صحيحًا');if(at.getTime()<=Date.now())return invalid(form,'اختر موعدًا مستقبليًا');return perform('propose:'+id,submitter,()=>api.orders.schedule(id,at.toISOString()),()=>{toast('تم إرسال اقتراح الموعد');done([detailsSel(id)]);},stale);}
    if(form.id==='pv-free-form'){const reason=String(data.get('reason')||'');if(!reason)return invalid(form,'اختر سبب الخدمة المجانية','reason');return perform('free:'+id,submitter,()=>api.quotes.proposeFree(id,reason),()=>{done([detailsSel(id)]);toast('أُرسل اقتراح الخدمة المجانية للعميل');},res=>invalid(form,errorText(res)));}
    if(form.id==='pv-profile-form'){const result=registrationFrom(data);if(result.error)return invalid(form,result.error,result.field);if(!currentProvider())return;return perform('profile',submitter,()=>api.provider.update(result.value),()=>{done(['[data-pv-action="edit-profile"]']);toast('تم حفظ ملفك (محليًا)');},res=>invalid(form,errorText(res)));}
    if(form.id==='pv-quote-form'){const amounts=quoteAmounts(data);if(!amounts)return invalid(form,'راجع مبالغ عرض السعر: المصنعية مطلوبة وكل المبالغ أرقام غير سالبة');if(amounts.labor+amounts.parts+amounts.visitFee-amounts.discount<=0)return invalid(form,'لا يُسمح بعرض سعر بقيمة صفر. إن كانت الخدمة بلا مقابل استخدم «تنفيذ كخدمة مجانية».','labor');return perform('quote:'+id,submitter,()=>api.quotes.submit(id,{...amounts,note:String(data.get('note')||'').trim()}),()=>{router.navigate('quote');toast('تم إرسال عرض السعر');done();},res=>invalid(form,errorText(res)));}
    if(form.id==='pv-complete-form'){const value=Number(data.get('value')),deductions=Number(data.get('deductions'));if(!Number.isFinite(value)||!Number.isFinite(deductions)||!(value>0)||deductions<0||deductions>value)return invalid(form,'راجع قيمة الخدمة والخصم');return perform('complete:'+id,submitter,()=>api.orders.complete(id,value,deductions),()=>{router.navigate('done');toast('تم تسجيل اكتمال الخدمة');done();},res=>invalid(form,res&&res.status===422?errorText(res):'لا يمكن إكمال الطلب في حالته الحالية'));}
  }

  /* Mirrors the form's own constraints (labor required, all amounts >= 0) for submissions that bypass them. */
  function quoteAmounts(data) {
    const read=name=>{const raw=String(data.get(name)??'').trim();return raw===''?null:Number(raw);};
    const labor=read('labor'); if(labor===null) return null;
    const amounts={labor,parts:read('parts')??0,visitFee:read('visitFee')??0,discount:read('discount')??0};
    return Object.values(amounts).every(n=>Number.isFinite(n)&&n>=0)?amounts:null;
  }

  /* After a status change on a group list, follow the request to the group it now belongs to (as accept/reject/quote/complete do). */
  function followToGroup(id,p) {
    const {page}=router.parse(location.hash);
    if(!Object.prototype.hasOwnProperty.call(domain.GROUPS,page)) return;
    const request=MP.get('serviceRequests',id), assignment=MP.db().assignments.find(a=>a.reqId===id&&a.providerId===p.id&&a.status==='accepted');
    const group=request&&assignment?domain.groupOf(request,assignment):'';
    if(group&&group!==page) router.navigate(group);
  }

  function start() {
    dom=HSProviderShell.mount();
    dom.host.addEventListener('click',onClick);
    dom.host.addEventListener('submit',onSubmit);
    dom.host.addEventListener('keydown',onKeydown);
    dom.host.addEventListener('input',onInput);
    root.addEventListener('hashchange',()=>render());
    if(root.HSAuthApi) root.HSAuthApi.useApp('provider');                 // API actor = the selected demo provider
    /* Another tab (e.g. Admin approving this provider, a customer approving a quote) changed the shared store. */
    if(root.HSRealtimeClient) root.HSRealtimeClient.subscribe('market:changed',e=>{ if(e.source==='storage'&&!$('.pv-inline-form',dom.view)) render(); });
    if(!location.hash) router.navigate('home');
    render();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})(globalThis);
