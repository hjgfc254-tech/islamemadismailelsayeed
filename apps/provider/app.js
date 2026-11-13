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

  function accountPicker() {
    const accounts=HSProviderAuth.listDemoAccounts(MP);
    dom.nav.hidden=true; $('[data-pv-action="logout"]',dom.host).hidden=true;
    dom.view.innerHTML=`<section class="pv-welcome"><span class="pv-eyebrow">HANSALEHLAK · PROVIDER PORTAL</span><h1>مساحة عمل مقدم الخدمة</h1><p>اختر حسابًا تجريبيًا لفتح مساحة العمل. هذا الاختيار لا يمثل تسجيل دخول حقيقيًا ولا يمنح صلاحيات إنتاجية.</p></section><section class="pv-panel"><div class="pv-section-head"><h2>حسابات العرض</h2><span>${accounts.length} حساب</span></div><div class="pv-account-list">${accounts.map(p=>`<button class="pv-account" type="button" data-pv-action="select" data-id="${esc(p.id)}"><span class="pv-avatar">${esc(p.name.slice(0,1))}</span><span class="pv-account-copy"><b>${esc(p.name)}</b><small>${p.demo?'حساب تجريبي':'حساب مسجل'} · ${p.status==='approved'?'مقبول':p.status==='pending'?'قيد المراجعة':p.status==='suspended'?'معلّق':'مرفوض'}</small></span><span class="pv-arrow">${icon('chev')}</span></button>`).join('')}</div></section><p class="pv-disclaimer">لا توجد مصادقة فعلية في هذه النسخة. لا تستخدم بيانات حقيقية أو تعتبر هذه الشاشة حماية للحساب.</p>`;
  }

  function renderNav(active) {
    dom.nav.hidden=false;
    dom.nav.innerHTML=tabs.map(([id,label])=>`<button type="button" data-pv-route="${id}" class="${active===id?'is-active':''}" ${active===id?'aria-current="page"':''}>${esc(label)}</button>`).join('');
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
      if(['started','quote'].includes(r.status)) actions.push(`<button class="pv-btn" data-pv-action="quote" data-id="${esc(r.id)}">${quote?'تحديث عرض السعر':'إرسال عرض سعر'}</button>`,`<button class="pv-btn pv-btn-primary" data-pv-action="complete" data-id="${esc(r.id)}">تسجيل الإكمال</button>`);
    }
    const address=a.status==='accepted'?`${esc(r.gov)} · ${esc(r.area)} · ${esc(r.addr)}`:`${esc(r.gov)} · ${esc(r.area)} — يظهر العنوان التفصيلي بعد قبول الطلب`;
    return `<article class="pv-request"><header><div><span class="pv-order-no">${esc(r.no||r.id)}</span><h3>${esc(r.serviceName||'طلب خدمة')}</h3></div><span class="pv-status">${esc(STATUS_LABEL[r.status]||r.status)}</span></header><p>${esc(r.desc||'لا يوجد وصف إضافي')}</p><div class="pv-meta"><span>${icon('calendar')} ${date(r.agreedAt||r.when)}</span><span>${icon('pin')} ${address}</span></div>${r.proposal?`<p class="pv-note">اقتراح الموعد: ${date(r.proposal.at)} — بانتظار العميل</p>`:''}${quote?`<div class="pv-quote"><b>عرض السعر: ${money(quote.total)}</b><span>${quote.status==='approved'?'مقبول':quote.status==='rejected'?'مرفوض':'بانتظار العميل'}</span></div>`:''}<div class="pv-actions"><button class="pv-btn" type="button" data-pv-route="request/${encodeURIComponent(r.id)}">عرض التفاصيل</button>${actions.join('')}</div></article>`;
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
    if(!p){accountPicker();settle('picker','اختيار حساب العرض',focusTargets);return;}
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
    if(changed) dom.view.focus({preventScroll:true});
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
    if(kind==='complete') { const q=MP.currentQuote(id); const suggested=q?.status==='approved'?q.total:''; dom.view.insertAdjacentHTML('afterbegin',`<form class="pv-inline-form" id="pv-complete-form" data-id="${esc(id)}" ${named('تسجيل إكمال الطلب')}><label>القيمة النهائية (ج.م)<input name="value" type="number" min="1" step="0.01" required value="${suggested}"></label><label>خصومات معلنة<input name="deductions" type="number" min="0" step="0.01" value="0"></label><button class="pv-btn pv-btn-primary">تأكيد اكتمال الخدمة</button><button type="button" class="pv-btn" data-pv-action="cancel-form">إلغاء</button></form>`); }
    const form=$('#'+({reject:'pv-reject-form',propose:'pv-propose-form',quote:'pv-quote-form',complete:'pv-complete-form'}[kind]),dom.view);
    if(form) { form.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'center'}); form.querySelector('input,select')?.focus({preventScroll:true}); }
  }

  /* Close the open inline form and return focus to the control that opened it. */
  function cancelForm() {
    $('.pv-inline-form',dom.view)?.remove();
    const trigger=formTrigger; formTrigger=null;
    if(trigger) focusIn([actionSel(trigger.kind,trigger.id)]);
  }

  /* Validation failure: announce through the live toast and keep focus inside the form for correction. */
  function invalid(form,message) {
    toast(message);
    $('#'+form.id,dom.view)?.querySelector('input,select,textarea')?.focus({preventScroll:true});
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
    const p=currentProvider(); if(!p)return;
    const nearRequest=[actionSel('advance',id),detailsSel(id)];
    if(action==='availability'){MP.updateProvider(p.id,{available:!p.available});render(['[data-pv-action="availability"]']);return;}
    if(action==='accept'){if(!MP.respond(id,true)){render([detailsSel(id)]);toast(STALE);return;}router.navigate('accepted');render();toast('تم قبول الطلب');return;}
    if(action==='reject'||action==='propose'||action==='quote'||action==='complete'){openForm(action,id);return;}
    if(action==='confirm'){if(!MP.confirmTime(id,'provider')){render([detailsSel(id)]);toast(STALE);return;}render(nearRequest);toast('تم تأكيد الموعد');return;}
    if(action==='advance'){const ok=MP.advance(id,next);if(ok)followToGroup(id,p);render(nearRequest);toast(ok?'تم تحديث حالة الطلب':'تعذر تحديث الحالة؛ راجع تسلسل الطلب');return;}
    if(action==='cancel-form'){cancelForm();return;}
  }

  function onSubmit(event) {
    const form=event.target;
    if(!form.matches('.pv-inline-form'))return;
    event.preventDefault(); const data=new FormData(form), id=form.dataset.id;
    const stale=()=>{formTrigger=null;render([detailsSel(id)]);toast(STALE);};
    let focusAfter;
    if(form.id==='pv-reject-form'){const reason=String(data.get('reason')||'').trim();if(!reason)return invalid(form,'اختر سبب الرفض');if(!MP.respond(id,false,reason))return stale();router.navigate('cancelled');toast('تم رفض الطلب');}
    if(form.id==='pv-propose-form'){const value=data.get('at'),at=value?new Date(value):null;if(!at||Number.isNaN(at.getTime()))return invalid(form,'أدخل موعدًا صحيحًا');if(at.getTime()<=Date.now())return invalid(form,'اختر موعدًا مستقبليًا');if(!MP.propose(id,at.toISOString()))return stale();focusAfter=[detailsSel(id)];toast('تم إرسال اقتراح الموعد');}
    if(form.id==='pv-quote-form'){const amounts=quoteAmounts(data);if(!amounts)return invalid(form,'راجع مبالغ عرض السعر: المصنعية مطلوبة وكل المبالغ أرقام غير سالبة');const result=MP.createQuote(id,{...amounts,note:String(data.get('note')||'').trim()});if(!result.ok)return invalid(form,result.msg||'تعذر إرسال العرض');router.navigate('quote');toast('تم إرسال عرض السعر');}
    if(form.id==='pv-complete-form'){const value=Number(data.get('value')),deductions=Number(data.get('deductions'));if(!Number.isFinite(value)||!Number.isFinite(deductions)||!(value>0)||deductions<0||deductions>value)return invalid(form,'راجع قيمة الخدمة والخصم');if(!MP.complete(id,value,deductions))return invalid(form,'لا يمكن إكمال الطلب في حالته الحالية');router.navigate('done');toast('تم تسجيل اكتمال الخدمة');}
    formTrigger=null;
    render(focusAfter);
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
    root.addEventListener('hashchange',()=>render());
    if(!location.hash) router.navigate('home');
    render();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})(globalThis);
