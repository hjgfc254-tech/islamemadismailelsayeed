/* HANSALEHLAK V8 — Standalone Provider Application (local demo adapter). */
'use strict';
(function (root) {
  const $ = (selector, scope=document) => scope.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => (Number(value)||0).toLocaleString('ar-EG',{maximumFractionDigits:2})+' ج.م';
const num = (value, digits = 0) => (Number(value)||0).toLocaleString('ar-EG',{minimumFractionDigits:digits,maximumFractionDigits:digits});   /* Arabic digits like money() */
  const date = value => { if(!value) return 'لم يحدد'; const d=new Date(value); return Number.isNaN(d.getTime())?esc(value):d.toLocaleString('ar-EG',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}); };
  const icon = name => typeof ic==='function' ? ic(name) : '';
  let dom, toastTimer;
  const session = root.HSProviderSession;
  const router = root.HSProviderRouter;
  const domain = root.HSProviderDomain;
  const currentProvider = () => { const id=session.currentId(); return id ? MP.get('providers',id) : null; };
  const providerGroups = p => domain.groupAssignments(MP.db(),p.id);
  /* type (success|error|warn|info) inferred from the wording; plain text stays the accessible message, CSS adds the glyph */
  const toastType = m => /^(تعذّر|تعذر|خطأ|فشل|لا يمكن)/.test(m) ? 'error' : /^(اختر|اكتب|أدخل|يرجى)/.test(m) ? 'warn' : /^(تم|شكرًا|أهلاً)/.test(m) ? 'success' : 'info';
  const toast = message => { const ty=toastType(String(message||'')); dom.toast.textContent=message; try{dom.toast.setAttribute('data-type',ty);}catch(e){} dom.toast.classList.add('is-visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>dom.toast.classList.remove('is-visible'),ty==='error'?3600:2400); };
  const STALE = 'تعذر تنفيذ الإجراء؛ تغيرت حالة الطلب. تم تحديث العرض.';
  const BASE_TITLE = 'مساحة مقدم الخدمة | هنصلحلك';
  let lastRouteKey = null, formTrigger = null;
  const actionSel = (action,id) => `[data-pv-action="${action}"][data-id="${id}"]`;
  const loc = root.HSProviderLocation;   /* customer location panel: address, contact, map link, distance (no live tracking) */
  const locState = {};                   /* reqId -> {status, km?}; kept only in memory on this device */
  const detailsSel = id => `[data-pv-route="request/${encodeURIComponent(id)}"]`;
  const reduceMotion = () => typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Focus the first matching control in the view, falling back to the view itself (tabindex="-1"). */
  function focusIn(selectors) {
    for (const sel of [].concat(selectors||[])) { const el=$(sel,dom.view); if(el){ el.focus({preventScroll:true}); return; } }
    dom.view.focus({preventScroll:true});
  }
  /* Four destinations (2026-11-20 simplification). Every older route still works and opens inside one of them:
     new / accepted / progress / quote / schedule / done / cancelled → الطلبات (with a filter); transactions → فلوسي;
     services → حسابي; notifications → the bell in the top bar. */
  const tabs = [['home','الطلبات'],['earnings','فلوسي'],['reviews','تقييماتي'],['profile','حسابي']];
  const TAB_OF = {new:'home',accepted:'home',progress:'home',quote:'home',schedule:'home',done:'home',cancelled:'home',request:'home',transactions:'earnings',services:'profile'};
  const FILTER_OF = {new:'new',accepted:'active',progress:'active',quote:'active',schedule:'active',done:'done',cancelled:'done'};

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
    dom.view.innerHTML=`<section class="pv-welcome"><span class="pv-eyebrow">HANSALEHLAK · PROVIDER PORTAL</span><h1>مساحة عمل مقدم الخدمة</h1><p>اختر حسابًا تجريبيًا لفتح مساحة العمل. هذا الاختيار لا يمثل تسجيل دخول حقيقيًا ولا يمنح صلاحيات إنتاجية.</p></section><section class="pv-panel"><div class="pv-section-head"><h2>حسابات العرض</h2><span>${num(accounts.length)} حساب</span></div><div class="pv-account-list">${accounts.map(p=>`<button class="pv-account" type="button" data-pv-action="select" data-id="${esc(p.id)}"><span class="pv-avatar">${esc(p.name.slice(0,1))}</span><span class="pv-account-copy"><b>${esc(p.name)}</b><small>${p.demo?'حساب تجريبي':'حساب مسجل'} · ${p.status==='approved'?'مقبول':p.status==='pending'?'قيد المراجعة':p.status==='suspended'?'معلّق':'مرفوض'}</small></span><span class="pv-arrow">${icon('chev')}</span></button>`).join('')}</div></section><section class="pv-panel"><div class="pv-section-head"><h2>مقدم خدمة جديد؟</h2></div><p class="pv-hint">سجّل حسابًا تجريبيًا محليًا؛ يظهر بحالة «قيد المراجعة» حتى تعتمده الإدارة.</p><button class="pv-btn pv-btn-primary" type="button" data-pv-action="register">تسجيل مقدم خدمة جديد</button></section><p class="pv-disclaimer">لا توجد مصادقة فعلية في هذه النسخة. لا تستخدم بيانات حقيقية أو تعتبر هذه الشاشة حماية للحساب.</p>`;
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
    const NAV_ICON={home:'inbox',new:'inbox',accepted:'st-accepted',progress:'st-working',quote:'st-quote',schedule:'calendar',done:'st-done',reviews:'star',transactions:'wallet',earnings:'earnings',services:'wrench',notifications:'bell',profile:'user'};
    const tab=TAB_OF[active]||active;
    dom.nav.innerHTML=tabs.map(([id,label])=>`<button type="button" data-pv-route="${id}" class="${tab===id?'is-active':''}" ${tab===id?'aria-current="page"':''}>${typeof ic==='function'?ic(NAV_ICON[id]||'dots'):''}<span>${esc(label)}</span></button>`).join('');
    /* top bar bell: unread notifications */
    const bell=$('[data-pv-bell]',dom.host), p=currentProvider();
    if(bell&&!bell.dataset.ready){bell.innerHTML=(typeof ic==='function'?ic('bell'):'🔔')+'<b hidden></b>';bell.dataset.ready='1';}
    if(bell&&p){ const unread=(typeof MP.notesFor==='function'?MP.notesFor('provider:'+p.id):[]).filter(n=>!n.read).length;
      bell.hidden=false; bell.classList.toggle('is-active',active==='notifications'); bell.setAttribute('aria-label',unread?`الإشعارات — ${num(unread)} جديدة`:'الإشعارات');
      const b=$('b',bell); if(b){b.textContent=unread?num(Math.min(unread,99)):'';b.hidden=!unread;} }
  }

  /* ── الطلبات: one list with three filters instead of seven pages ── */
  function ordersPage(p,groups,transactions,filter) {
    const uniq=list=>{const seen=new Set();return list.filter(x=>{const id=x&&x.request&&x.request.id;if(!id||seen.has(id))return false;seen.add(id);return true;});};
    const when=x=>new Date(x.request.agreedAt||x.request.when||x.request.createdAt||0).getTime()||0;
    const lists={new:uniq(groups.new||[]),active:uniq([...(groups.quote||[]),...(groups.progress||[]),...(groups.accepted||[])]).sort((a,b)=>when(a)-when(b)),done:uniq([...(groups.done||[]),...(groups.cancelled||[])])};
    const f=filter||(lists.new.length?'new':lists.active.length?'active':'new');
    const s=summary(p,groups,transactions,{parts:true});
    const FILTERS=[['new','جديدة','new'],['active','شغالة','progress'],['done','خلصت','done']];
    const seg=`<div class="pv-seg" role="group" aria-label="عرض الطلبات">${FILTERS.map(([k,l,route])=>`<button type="button" data-pv-route="${route}" class="${f===k?'is-on':''}" aria-pressed="${f===k}">${l}${lists[k].length&&k!=='done'?` <b>${num(lists[k].length)}</b>`:''}</button>`).join('')}</div>`;
    const EMPTY={new:['new','مفيش طلبات جديدة دلوقتي'],active:['progress','مفيش شغل شغال دلوقتي'],done:['done','لسه ما خلصتش طلبات']};
    const items=lists[f];
    const body=items.length?items.map(x=>requestCard(x,p)).join(''):emptyState(EMPTY[f][0],EMPTY[f][1])+(f==='new'?s.demandCard:'');
    return `<section class="pv-ohead"><div><h1>طلباتك</h1><p>النهارده: <b>${money(s.tt.net)}</b> · ${num(s.todayCount)} خدمة</p></div><button class="pv-availability ${p.available?'is-on':''}" type="button" data-pv-action="availability" aria-pressed="${!!p.available}">${icon('power')} ${p.available?'متاح':'مش متاح'}</button></section>${seg}<section class="pv-olist" aria-label="${esc(FILTERS.find(x=>x[0]===f)[1])}">${body}</section>`;
  }
  /* ── فلوسي: today, bonus / level, last 7 days, totals and every transaction ── */
  function moneyPage(p,groups,transactions,ctx) {
    const s=summary(p,groups,transactions,{parts:true});
    return `${s.todayMoneyCard}${s.rankCard}${s.weekCard}${HSProviderEarningsPage.render(ctx)}${HSProviderTransactionsPage.render(ctx).replace(/<p class="pv-disclaimer">[\s\S]*?<\/p>/,'')}`;   /* one demo note is enough */
  }

  function summary(p,groups,transactions) {
    const t=domain.totals(transactions);
    /* round 5: level & goal, last-7-days summary, today's demand by area */
    const LEVELS=[['فني جديد',0,0],['فني متمكّن',5,4],['فني محترف',20,4.5],['فني خبير',50,4.7]];
    const jobs=Math.max(+p.jobs||0,transactions.length), rating=+p.rating||0;
    let li=0; LEVELS.forEach((L,i)=>{ if(jobs>=L[1]&&(i===0||rating>=L[2])) li=i; });
    const nextL=LEVELS[li+1], prog=nextL?Math.min(100,Math.round(jobs/nextL[1]*100)):100;
    const levelCard=`<section class="pv-level" aria-label="مستواك على المنصة"><div><small>مستواك</small><b>${LEVELS[li][0]}</b></div><div class="pv-goal">${nextL?`<small>عشان توصل «${nextL[0]}»: ${Math.max(0,nextL[1]-jobs)} خدمة كمان${rating<nextL[2]?` وتقييم ${nextL[2]} أو أعلى`:''}</small><i style="--p:${prog}%" role="progressbar" aria-valuenow="${prog}" aria-valuemin="0" aria-valuemax="100" aria-label="التقدّم للمستوى التالي"></i>`:'<small>وصلت لأعلى مستوى — كمّل كده</small>'}</div></section>`;
    /* round 11: the admin's bonus program replaces the generic level card when it is on */
    const bcfg=MP.bonusCfg&&MP.bonusCfg(); let bonusCard=''; const an=(n,d=0)=>(+n||0).toLocaleString('ar-EG',{minimumFractionDigits:d,maximumFractionDigits:d});
    if(bcfg){ const st=MP.bonusStats(p.id), tier=MP.tierOf(p.id), tiers=bcfg.tiers||[], ti=tier?tier.rank:0, next=tiers[ti], w=bcfg.weekly||{};
      const need=next?Math.max(0,(+next.minJobs||0)-st.jobs):0, prog=next&&+next.minJobs?Math.min(100,Math.round(st.jobs/next.minJobs*100)):100;
      const wprog=w.on&&+w.target?Math.min(100,Math.round(st.weekJobs/w.target*100)):0;
      bonusCard=`<section class="pv-level pv-bonus" aria-label="برنامج البونص"><div><small>مستواك</small><b>${esc(tier?tier.name:'عادي')}</b>${tier&&+tier.rateOff?`<small>نسبة المنصة على عروضك أقل ${an(tier.rateOff)}٪ • طلباتك بتوصلك الأول</small>`:''}</div>`
        +`<div class="pv-goal">${next?`<small>عشان توصل «${esc(next.name)}»: ${need?`${an(need)} عميل كمان خلال ${an(bcfg.windowDays||30)} يوم`:''}${need&&+next.minRating&&!(st.rating>=+next.minRating)?' و':''}${+next.minRating&&!(st.rating>=+next.minRating)?`تقييم ${an(next.minRating,1)} أو أعلى`:''}${!need&&!(+next.minRating&&!(st.rating>=+next.minRating))&&st.strikes>(+next.maxStrikes||0)?'من غير خلافات على الدفع':''}</small><i style="--p:${prog}%" role="progressbar" aria-valuenow="${prog}" aria-valuemin="0" aria-valuemax="100" aria-label="التقدّم للمستوى التالي"></i>`:'<small>وصلت لأعلى مستوى — كمّل كده</small>'}</div>`
        +(w.on&&+w.target?`<div class="pv-goal pv-week"><small>${st.paidWeek?`خدت بونص الأسبوع ده (${money(w.amount)}) — برافو`:`الأسبوع ده: ${an(st.weekJobs)} من ${an(w.target)} — باقي ${an(Math.max(0,w.target-st.weekJobs))} على بونص ${money(w.amount)}`}</small><i style="--p:${st.paidWeek?100:wprog}%" role="progressbar" aria-valuenow="${st.paidWeek?100:wprog}" aria-valuemin="0" aria-valuemax="100" aria-label="هدف البونص الأسبوعي"></i></div>`:'')
        +`<p class="pv-bonus-rule">بتتحسب الخدمة لما العميل يأكد إنه دفع، ولعملاء مختلفين.</p></section>`; }
    /* what customers praise most (quick tags stored with their reviews) */
    const RVT=['ملتزم بالموعد','شغله نضيف','أسعاره مناسبة','محترم في التعامل','سريع'];
    const myRv=(MP.db().reviews||[]).filter(v=>v.providerId===p.id&&!v.hidden);
    const praise=RVT.map(t=>[t,myRv.filter(v=>String(v.comment||'').includes(t)).length]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const praiseCard=praise.length?`<section class="pv-praise" aria-label="العملاء بيقولوا عنك"><small>العملاء بيقولوا عنك</small><ul>${praise.map(([t,n])=>`<li>${esc(t)}<b>${num(n)}</b></li>`).join('')}</ul></section>`:'';
    const dayMs=864e5, nowMs=Date.now(), inDays=(at,from,to)=>{const t=new Date(at).getTime();return Number.isFinite(t)&&t>nowMs-to*dayMs&&t<=nowMs-from*dayMs;};
    const wk=transactions.filter(x=>inDays(x.at,0,7)), pw=transactions.filter(x=>inDays(x.at,7,14));
    const wn=domain.totals(wk).net, pn=domain.totals(pw).net, delta=pn>0?Math.round((wn-pn)/pn*100):null;
    const wr=(MP.db().reviews||[]).filter(v=>v.providerId===p.id&&inDays(v.at,0,7)), ravg=wr.length?num(wr.reduce((s,v)=>s+(+v.stars||0),0)/wr.length,1):'—';
    const weekCard=`<section class="pv-week" aria-labelledby="pvxweek-h"><h2 id="pvxweek-h">آخر ٧ أيام</h2><dl><div><dt>مكسبك</dt><dd>${money(wn)}</dd>${delta!=null?`<small class="${delta>=0?'up':'down'}">${delta>=0?'أعلى':'أقل'} ${num(Math.abs(delta))}٪ من الأسبوع اللي قبله</small>`:''}</div><div><dt>خدمات</dt><dd>${num(wk.length)}</dd></div><div><dt>تقييمك</dt><dd>${ravg}</dd></div></dl></section>`;
    let demandCard='';
    const tr=(MP.db().settings||{}).trend;
    if(tr&&tr.areas&&typeof MP.cairoDay==='function'&&tr.day===MP.cairoDay()){
      const govs=new Set(p.govs||[]);
      const rows=Object.entries(tr.areas).filter(([k])=>!govs.size||govs.has(k.split('|')[0])).sort((a,b)=>b[1]-a[1]).slice(0,5);
      if(rows.reduce((s,[,n])=>s+n,0)>=3){
        const max=rows[0][1];
        demandCard=`<section class="pv-demand" aria-labelledby="pvxdem-h"><h2 id="pvxdem-h">فين الطلب عالي النهارده</h2><ul>${rows.map(([k,n])=>{const [g,ar]=k.split('|');return `<li><span>${esc(ar)}<small>${esc(g)}</small></span><i style="--w:${Math.round(n/max*100)}%" aria-hidden="true"></i><b>${n} طلب</b></li>`;}).join('')}</ul><p class="pv-hint">عدد الطلبات الجديدة في مناطقك النهارده — من غير أي بيانات عملاء.</p></section>`;
      }
    }
    const active=groups.new.length+groups.accepted.length+groups.progress.length+groups.quote.length;
    const live=!!(root.HSFirebaseConfig&&root.HSFirebaseConfig.mode==='firebase');
    /* today's earnings: completed services recorded today (provider amount, net of the platform share) */
    const day=new Date().toDateString(), todayTx=transactions.filter(x=>{const d=new Date(x.at);return !Number.isNaN(d.getTime())&&d.toDateString()===day;}), tt=domain.totals(todayTx);
    const todayCard=`<section class="pv-today" aria-label="مكسبك النهارده"><div><small>مكسبك النهارده</small><b>${money(tt.net)}</b></div><div><small>خدمات خلصتها النهارده</small><b>${num(todayTx.length)}</b></div><div><small>طلبات جديدة مستنياك</small><b>${num(groups.new.length)}</b></div></section>`;
    if(arguments[3]&&arguments[3].parts) return {todayMoneyCard:`<section class="pv-today" aria-label="مكسبك النهارده"><div><small>مكسبك النهارده</small><b>${money(tt.net)}</b></div><div><small>خدمات خلصتها النهارده</small><b>${num(todayTx.length)}</b></div></section>`,todayCard,rankCard:bonusCard||levelCard,praiseCard,weekCard,demandCard,live,tt,todayCount:todayTx.length};
    return `<section class="pv-hero"><div><span class="pv-eyebrow">مساحة مقدم الخدمة</span><h1>أهلًا، ${esc((p.name||'').split(' ')[0])}</h1><p>تابع الطلبات والمواعيد ومستحقاتك${live?'':' التجريبية'} من مكان واحد.</p></div><button class="pv-availability ${p.available?'is-on':''}" type="button" data-pv-action="availability" aria-pressed="${!!p.available}">${icon('power')} ${p.available?'متاح لاستقبال الطلبات':'متوقف عن استقبال الطلبات'}</button></section>${todayCard}${bonusCard||levelCard}${praiseCard}${weekCard}${demandCard}<section class="pv-kpis pv-kpis-slim" aria-label="ملخص شغلك"><article><small>إجراءات معلقة</small><b>${num(active)}</b></article><article><small>مكتملة</small><b>${num(groups.done.length)}</b></article><article><small>صافي مستحقاتك${live?'':' (تجريبي)'}</small><b>${money(t.net)}</b></article></section>`;
  }

  function requestCard(item,p) {
    const r=item.request,a=item.assignment,quote=MP.currentQuote(r.id);
    const actions=[];
    if(a.status==='offered'&&a.bidding) actions.push(`<button class="pv-btn pv-btn-primary" data-pv-action="bid" data-id="${esc(r.id)}">${a.bid?'عدّل عرضك':(r.bidding&&r.bidding.mode==='inspection'?'ابعت سعر المعاينة':'ابعت عرضك')}</button>`,`<button class="pv-btn" data-pv-action="reject" data-id="${esc(r.id)}">اعتذار</button>`);
    else if(a.status==='offered') actions.push(`<button class="pv-btn pv-btn-primary" data-pv-action="accept" data-id="${esc(r.id)}">قبول الطلب</button>`,`<button class="pv-btn" data-pv-action="reject" data-id="${esc(r.id)}">رفض</button>`);
    if(a.status==='accepted') {
      if(r.status==='accepted'&&!r.proposal) actions.push(`<button class="pv-btn pv-btn-primary" data-pv-action="confirm" data-id="${esc(r.id)}">تأكيد الموعد</button>`,`<button class="pv-btn" data-pv-action="propose" data-id="${esc(r.id)}">اقتراح موعد</button>`);
      if(r.status==='scheduled') actions.push(`<button class="pv-btn pv-btn-primary" data-pv-action="advance" data-next="enroute" data-id="${esc(r.id)}">أنا في الطريق</button>`,`<span class="pv-eta-pick" role="group" aria-label="أنا في الطريق وهوصل خلال"><small>أو هوصل خلال:</small>${[15,30,45,60].map(m=>`<button class="pv-chip" type="button" data-pv-action="advance" data-next="enroute" data-eta="${m}" data-id="${esc(r.id)}" aria-label="أنا في الطريق وهوصل خلال ${m} دقيقة">${m} د</button>`).join('')}</span>`);
      if(r.status==='enroute') actions.push(pinOn()?`<button class="pv-btn pv-btn-primary" data-pv-action="pin" data-id="${esc(r.id)}">وصلت — اكتب كود العميل</button>`:`<button class="pv-btn pv-btn-primary" data-pv-action="advance" data-next="arrived" data-id="${esc(r.id)}">وصلت</button>`);
      if(['arrived','started','quote','completed'].includes(r.status)){ const hp=r.hasPhotos||{}; actions.push(`<span class="pv-photos" role="group" aria-label="صور الشغل"><button class="pv-chip ${hp.before?'is-done':''}" type="button" data-pv-action="photo" data-kind="before" data-id="${esc(r.id)}">${icon('camera')} ${hp.before?'قبل ✓':'صورة قبل'}</button><button class="pv-chip ${hp.after?'is-done':''}" type="button" data-pv-action="photo" data-kind="after" data-id="${esc(r.id)}">${icon('camera')} ${hp.after?'بعد ✓':'صورة بعد'}</button></span>`); }
      if(r.status==='arrived') actions.push(`<button class="pv-btn pv-btn-primary" data-pv-action="advance" data-next="started" data-id="${esc(r.id)}">بدأت الخدمة</button>`);
      const visitOnly=!r.inspection&&r.pricing&&quote&&quote.status==='rejected'&&+((MP.db().settings||{}).visitFee)>0;
      if(((r.inspection&&!r.inspection.waived&&!r.inspection.only)||visitOnly)&&['arrived','started','quote'].includes(r.status)&&!(quote&&['pending','approved'].includes(quote.status))) actions.push(`<button class="pv-btn" data-pv-action="inspection-only" data-id="${esc(r.id)}">${visitOnly?'العميل رفض السعر الجديد — سجّل الزيارة بس':'العميل ما كمّلش — سجّل المعاينة بس'}</button>`);
      if(['completed','closed'].includes(r.status)&&+r.finalValue>0&&!(r.cash&&r.cash.provider!=null)) actions.push(`<button class="pv-btn pv-btn-primary" data-pv-action="cash-yes" data-id="${esc(r.id)}">استلمت الحساب</button>`,`<button class="pv-btn" data-pv-action="cash-no" data-id="${esc(r.id)}">ما استلمتش</button>`);
      if(['completed','closed'].includes(r.status)&&!r.customerReview) actions.push(`<button class="pv-btn" data-pv-action="rate-customer" data-id="${esc(r.id)}">قيّم العميل</button>`);
      if(loc&&loc.available(r,a)) actions.push(`<button class="pv-btn" data-pv-action="customer-location" data-id="${esc(r.id)}">${icon('pin')} موقع العميل</button>`);
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
    /* five-stage progress of an accepted job (same stages the customer sees) */
    const PV_STAGES=['مقبول','موعد مؤكد','في الطريق','جاري التنفيذ','تم'];
    const pvStage=({accepted:0,scheduled:1,enroute:2,arrived:3,started:3,quote:3,completed:4,closed:4})[r.status];
    const journey=a.status==='accepted'&&pvStage!==undefined?`<ol class="pv-journey" aria-label="مراحل الشغل — الحالية: ${PV_STAGES[pvStage]}">${PV_STAGES.map((l,i)=>`<li class="${i<pvStage?'is-done':i===pvStage?'is-now':''}"><i aria-hidden="true"></i><span>${l}</span></li>`).join('')}</ol>`:'';
    const freeNote=r.freeService?`<p class="pv-note">خدمة مجانية (${esc((MP.FREE_REASONS||{})[r.freeService.reason]||'')}): ${({proposed:'بانتظار موافقة العميل',accepted:'وافق العميل — نفّذ وسجّل الإكمال',declined:'رفض العميل؛ يمكن إرسال عرض سعر',completed:'اكتملت بلا مقابل'})[r.freeService.status]||''}</p>`:'';
    const address=a.status==='accepted'?`${esc(r.gov)} · ${esc(r.area)} · ${esc(r.addr)}`:`${esc(r.gov)} · ${esc(r.area)} — يظهر العنوان التفصيلي بعد قبول الطلب`;
    const cust=a.status==='accepted'?MP.get('customers',r.customerId):null;
    const custNote=cust&&+cust.ratingCount>0?`<p class="pv-note">تقييم العميل من الفنيين: ${esc(cust.rating)} من 5 (${esc(cust.ratingCount)})</p>`:'';
    const ptx=(MP.db().transactions||[]).find(t=>t.reqId===r.id);
    const promoNote=r.promo?`<p class="pv-note">${r.discount&&ptx?`حصّل من العميل <b>${money(ptx.value)}</b> بعد خصم ${money(r.discount)} — الخصم من حصة المنصة، ومبلغك ما اتأثرش`:'العميل عنده خصم بتتحمّله المنصة من عمولتها — مبلغك مش بيتأثر، والمبلغ اللي هتحصّله بيظهر بعد تسجيل الإكمال'}</p>`:'';
    const rateNote=r.customerReview?`<p class="pv-note">قيّمت العميل ${esc(r.customerReview.stars)} من 5</p>`:'';
    const bidNote=a.bidding&&a.status==='offered'?`<p class="pv-note pv-note-bid">${icon('list')} ${r.bidding&&r.bidding.mode==='inspection'?'طلب معاينة — حدد سعر المعاينة، وبعد ما تشوف المشكلة تبعت سعر الإصلاح (المعاينة بتتخصم منه)':'طلب عروض — العميل بيقارن بين أكتر من فني ويختار'}${a.bid?` • عرضك: <b>${money(a.bid.kind==='inspection'?a.bid.fee:a.bid.labor+a.bid.parts)}</b>${a.bid.kind==='inspection'?' (معاينة)':''} — مستني العميل`:''}</p>`:'';
    const cancelNote=r.cancelFee?`<p class="pv-note">${icon('info')} العميل لغى بعد ما اتحركت — ليك رسوم انتقال ${money(r.cancelFee)}</p>`:'';
    const inspNote=a.status==='accepted'&&r.inspection?`<p class="pv-note">${icon('info')} ${r.inspection.waived?'العميل وافق على الإصلاح — المعاينة اتخصمت منه':r.inspection.only?'اتسجلت المعاينة بس':'معاينة: '+money(r.inspection.fee)+' لك — بعد ما تعاين ابعت «عرض سعر» للإصلاح'}</p>`:'';
    const warrantyNote=r.warrantyOf?`<p class="pv-note pv-note-warranty">${icon('shield')} طلب ضمان على شغلك في الطلب #${esc((MP.get('serviceRequests',r.warrantyOf)||{}).no||'')} — نفّذه كـ«خدمة مجانية» بسبب «ضمان على خدمة سابقة»</p>`:'';
    const tipNote=r.tip?`<p class="pv-note pv-note-tip">${icon('star')} العميل هيديك بقشيش <b>${money(r.tip.amount)}</b> مع الحساب</p>`:'';
    const pkgNote=r.packageName?`<p class="pv-note">الطلب ضمن باقة: <b>${esc(r.packageName)}</b> — اتفق مع العميل على مواعيد الزيارات.</p>`:'';
    const chatCount=a.status==='accepted'&&Array.isArray(r.chat)?r.chat.filter(m=>m.pid===p.id).length:0;
    const swipeHint='';   /* swiping still works on offered cards; the hint line was removed to keep cards short */
    /* One clear next step: the primary action (and its direct alternative: decline / «ما استلمتش» / ETA chips) stays
       visible; everything else moves under «خيارات تانية». Customer location sits with «التفاصيل». */
    const prim=[],pair=[],more=[],quick=[];
    for(const h of actions){
      if(/data-pv-action="customer-location"/.test(h)) quick.push(h);
      else if(!prim.length&&/pv-btn-primary/.test(h)) prim.push(h);
      else if(/data-pv-action="(reject|cash-no)"/.test(h)||/pv-eta-pick/.test(h)) pair.push(h);
      else more.push(h);
    }
    if(!prim.length&&more.length) prim.push(more.shift());
    const actionsHtml=`${prim.length||pair.length?`<div class="pv-actions pv-actions-main">${prim.join('')}${pair.join('')}</div>`:''}<div class="pv-card-links"><button class="pv-link" type="button" data-pv-route="request/${encodeURIComponent(r.id)}">التفاصيل${chatCount?` · ${num(chatCount)} رسالة`:''}</button>${quick.join('')}${more.length?`<details class="pv-more-actions"><summary>خيارات تانية (${num(more.length)})</summary><div class="pv-actions">${more.join('')}</div></details>`:''}</div>`;
    return `<article class="pv-request"${a.status==='offered'?` data-swipe-id="${esc(r.id)}"`:''}><header><div><span class="pv-order-no">${esc(r.no||r.id)}</span><h3>${esc(r.serviceName||'طلب خدمة')}</h3></div><span class="pv-status">${esc(STATUS_LABEL[r.status]||r.status)}</span></header>${journey}<p>${esc(r.desc||'لا يوجد وصف إضافي')}</p><div class="pv-meta"><span>${icon('calendar')} ${date(r.agreedAt||r.when)}</span><span>${icon('pin')} ${address}</span></div>${r.pricing&&r.pricing.providerAmount!=null?`<p class="pv-note">مبلغك المحدد عند الحجز: <b>${money(r.pricing.providerAmount)}</b> — يدفع العميل ${money(r.pricing.customerPrice)} شاملًا رسوم المنصة</p>`:''}${r.proposal?`<p class="pv-note">اقتراح الموعد: ${date(r.proposal.at)} — بانتظار العميل</p>`:''}${freeNote}${bidNote}${inspNote}${cancelNote}${warrantyNote}${tipNote}${pkgNote}${custNote}${promoNote}${rateNote}${swipeHint}${quote?`<div class="pv-quote"><b>عرض السعر: ${money(quote.total)}</b><span>${quote.status==='approved'?'مقبول':quote.status==='rejected'?'مرفوض':'بانتظار العميل'}</span></div>`:''}${actionsHtml}${locPanel(r,a)}</article>`;
  }

  /* Empty states: an icon, the (unchanged) message, one line on what fills this screen, and the next step when there is one. */
  const EMPTY_ICON={new:'inbox',accepted:'st-accepted',progress:'st-working',done:'st-done',cancelled:'st-done',quote:'st-quote',schedule:'calendar',reviews:'star',transactions:'wallet',notifications:'bell',priority:'sparkle'};
  const EMPTY_HINT={
    new:['خليك «متاح» من الزرار اللي فوق، والطلبات اللي في تخصصك ومنطقتك هتوصلك هنا على طول.'],
    accepted:['لما تقبل طلب هيظهر هنا ومعاه عنوان العميل وطرق التواصل.',['new','شوف الطلبات الجديدة']],
    progress:['الطلبات اللي قبلتها والشغل اللي بدأته بيفضلوا هنا لحد ما تخلّصهم.',['new','شوف الطلبات الجديدة']],
    done:['كل خدمة بتخلّصها بتتحسب في أرباحك وبتقرّبك من مستوى البونص الأعلى.'],
    cancelled:['مفيش إلغاءات — استمر كده.'],
    schedule:['المواعيد اللي بتتفق عليها مع العملاء بتتجمع هنا بالترتيب.'],
    reviews:['بعد كل خدمة العميل بيقيّمك، والتقييم العالي بيقدّمك في ترشيح الطلبات.'],
    transactions:['أول ما تخلّص خدمة مدفوعة هتلاقي الحساب والعمولة والصافي هنا.'],
    notifications:['هنبلّغك هنا بكل طلب جديد أو رد من عميل.'],
    priority:['مفيش حاجة مستنياك دلوقتي — وقت مناسب تراجع ملفك وخدماتك.',['profile','راجع ملفي']]
  };
  function emptyState(kind,text){
    const [hint,cta]=EMPTY_HINT[kind]||[];
    return `<div class="pv-empty pv-empty-rich">${typeof ic==='function'?`<span class="pv-empty-ic" aria-hidden="true">${ic(EMPTY_ICON[kind]||'inbox')}</span>`:''}<b>${esc(text)}</b>${hint?`<p>${esc(hint)}</p>`:''}${cta?`<button type="button" class="pv-btn" data-pv-route="${cta[0]}">${esc(cta[1])}</button>`:''}</div>`;
  }

  function sectionFor(page,p,groups,transactions) {
    const reviews=MP.db().reviews.filter(x=>x.providerId===p.id);
    const notifications=typeof MP.notesFor==='function'?MP.notesFor('provider:'+p.id):[];
    const totals=domain.totals(transactions);
    const ctx={p,groups,transactions,reviews,notifications,totals,esc,date,money,catName:MP.catName,
      summary,requestCard,chatPanel,statusLabel:STATUS_LABEL,num,empty:emptyState,items:Object.values(groups).flat(),
      renderGroup(key){const items=groups[key]||[];return `<section class="pv-panel"><div class="pv-section-head"><h1>${esc(domain.GROUPS[key]||key)}</h1><span>${num(items.length)} طلب</span></div>${items.length?items.map(x=>requestCard(x,p)).join(''):emptyState(key,'لا توجد طلبات في هذا القسم.')}</section>`;}};
    const renderers={
      home:()=>HSProviderDashboardPage.render(ctx),new:()=>HSProviderIncomingRequestsPage.render(ctx),
      progress:()=>HSProviderActiveJobsPage.render(ctx),quote:()=>HSProviderQuotesPage.render(ctx),
      schedule:()=>HSProviderSchedulePage.render(ctx),reviews:()=>HSProviderReviewsPage.render(ctx),
      transactions:()=>HSProviderTransactionsPage.render(ctx),earnings:()=>HSProviderEarningsPage.render(ctx),
      profile:()=>HSProviderProfilePage.render(ctx),services:()=>HSProviderServicesPage.render(ctx),
      notifications:()=>HSProviderNotificationsPage.render(ctx),
      request:()=>HSProviderRequestDetailsPage.render({...ctx,id:router.parse(location.hash).id,backPage:'home'})
    };
    if(page==='home'||FILTER_OF[page]) return ordersPage(p,groups,transactions,FILTER_OF[page]);
    if(page==='earnings'||page==='transactions') return moneyPage(p,groups,transactions,ctx);
    if(page==='reviews') return summary(p,groups,transactions,{parts:true}).praiseCard+renderers.reviews();
    if(page==='profile'||page==='services') return renderers.profile();   /* the profile already lists specialties, governorates and areas */
    return (renderers[page]||(()=>ordersPage(p,groups,transactions)))();
  }

  /* render(focusTargets): a route change focuses the main view; a same-route re-render (after an action)
     restores focus to the first matching selector so keyboard users are not dropped to <body>. */
  /* New request alert: when a request appears in «طلبات جديدة» after the first render — a short tone (if the browser
     allows audio), a vibration on phones, a polite toast and the tab title, until the provider looks at the app. */
  /* ── round 8: arrival code, before/after photos, read receipts + typing ── */
  const pinOn=()=>!!((MP.db().settings||{}).arrivalPin);
  /* photo → compressed webp/jpeg data URL (≤ ~170 KB of text) */
  function compressPhoto(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file), img=new Image();
      img.onload=()=>{
        URL.revokeObjectURL(url);
        let w=img.naturalWidth,h=img.naturalHeight; const max=1100; if(Math.max(w,h)>max){const k=max/Math.max(w,h);w=Math.round(w*k);h=Math.round(h*k);}
        const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h);
        let q=.78, type=c.toDataURL('image/webp').startsWith('data:image/webp')?'image/webp':'image/jpeg', out=c.toDataURL(type,q);
        while(out.length>170000&&q>.35){q-=.1;out=c.toDataURL(type,q);}
        if(out.length>170000){const k=.75;c.width=Math.round(w*k);c.height=Math.round(h*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);out=c.toDataURL(type,.6);}
        out.length>170000?reject(new Error('الصورة كبيرة جدًا')):resolve(out);
      };
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('تعذّر قراءة الصورة'));};
      img.src=url;
    });
  }
  function pickPhoto(id,kind,button){
    const i=document.createElement('input'); i.type='file'; i.accept='image/*'; i.setAttribute('capture','environment');
    i.onchange=async()=>{ const f=i.files&&i.files[0]; if(!f)return; setBusy(button,true);
      try{ const data=await compressPhoto(f); const res=await api.orders.uploadPhoto(id,kind,data); if(res&&res.ok){render([detailsSel(id)]);toast(kind==='before'?'اترفعت صورة قبل الشغل':'اترفعت صورة بعد الشغل — العميل هيشوفها');} else toast(errorText(res)); }
      catch(e){ toast(e.message||'تعذّر رفع الصورة'); } finally{ setBusy(button,false); } };
    i.click();
  }
  let pvOffTyping=null, pvTypingFor='';
  function hydrateProviderChat(){
    const f=$('#pv-chat-form',dom.view); const id=f&&f.dataset.id;
    if(!id){ if(pvOffTyping){pvOffTyping();pvOffTyping=null;pvTypingFor='';} return; }
    const r=MP.get('serviceRequests',id); if(!r)return;
    const lastCust=(r.chat||[]).filter(m=>m.by==='customer').pop(), mine=r.chatSeen&&r.chatSeen.provider;
    if(lastCust&&(!mine||mine<lastCust.at)) { try{ api.orders.chatSeen(id); }catch(e){} }
    if(pvTypingFor!==id){ if(pvOffTyping){pvOffTyping();pvOffTyping=null;} pvTypingFor=id;
      if(root.HSBackend&&typeof root.HSBackend.onTyping==='function') pvOffTyping=root.HSBackend.onTyping(id,'provider',on=>{const el=$('.pv-typing',dom.view); if(el) el.hidden=!on;}); }
  }
  document.addEventListener('input',e=>{ if(e.target&&e.target.id==='pvxchat-text'){ const f=e.target.closest('#pv-chat-form'); if(f&&root.HSBackend&&root.HSBackend.setTyping) root.HSBackend.setTyping(f.dataset.id,'provider'); } });
  /* ── round 5: chat panel on the request page, swipe to accept/decline offers ── */
  function chatPanel(item){
    const r=item.request,a=item.assignment,p=currentProvider(); if(!p||a.status!=='accepted') return '';
    const msgs=(Array.isArray(r.chat)?r.chat:[]).filter(m=>m.pid===p.id), open=!['cancelled','failed','closed'].includes(r.status);
    if(!open&&!msgs.length) return '';
    return `<section class="pv-chat" aria-labelledby="pvxchat-h"><h2 id="pvxchat-h">رسائل مع العميل</h2><ol class="pv-chat-list">${msgs.length?msgs.slice(-60).map((m,i,arr)=>`<li class="${m.by==='provider'?'me':'them'}"><p>${esc(m.text)}</p><time>${date(m.at)}</time>${m.by==='provider'&&i===arr.length-1&&r.chatSeen&&r.chatSeen.customer>=m.at?'<span class="pv-seen">اتقرت</span>':''}</li>`).join(''):'<li class="pv-chat-empty">ابعت للعميل أي سؤال عن المشكلة أو الموعد.</li>'}</ol><p class="pv-typing" hidden aria-live="polite"><i></i><i></i><i></i> العميل بيكتب</p>${open?`<form id="pv-chat-form" class="pv-chat-form" data-id="${esc(r.id)}"><label class="pv-sr" for="pvxchat-text">رسالة للعميل</label><input id="pvxchat-text" name="text" maxlength="500" required autocomplete="off" placeholder="اكتب رسالتك للعميل…"><button class="pv-btn pv-btn-primary">إرسال</button></form>`:''}</section>`;
  }
  function mountSwipe(){
    if(!dom.view||dom.view.dataset.swipe) return; dom.view.dataset.swipe='1';
    let s=null;
    dom.view.addEventListener('touchstart',e=>{const c=e.target.closest&&e.target.closest('[data-swipe-id]'); if(!c||e.touches.length!==1||e.target.closest('button,a,input,select,textarea')){s=null;return;} s={c,x:e.touches[0].clientX,y:e.touches[0].clientY,dx:0,h:false};},{passive:true});
    dom.view.addEventListener('touchmove',e=>{ if(!s) return; const dx=e.touches[0].clientX-s.x, dy=e.touches[0].clientY-s.y; if(!s.h&&Math.abs(dy)>Math.abs(dx)){s=null;return;} s.h=true; s.dx=dx; s.c.style.transition='none'; s.c.style.transform=`translateX(${dx}px)`; s.c.classList.toggle('sw-yes',dx>70); s.c.classList.toggle('sw-no',dx<-70); },{passive:true});
    dom.view.addEventListener('touchend',()=>{ if(!s) return; const {c,dx}=s; s=null; c.style.transition=''; c.style.transform=''; c.classList.remove('sw-yes','sw-no'); const id=c.dataset.swipeId;
      const b=dx>110?c.querySelector(`[data-pv-action="accept"][data-id="${id}"]`):dx<-110?c.querySelector(`[data-pv-action="reject"][data-id="${id}"]`):null; if(b) b.click(); });
  }
  let knownOffers=null, titleBase='';
  function noticeNewOffers(groups){
    const ids=new Set((groups.new||[]).map(x=>x&&x.request&&x.request.id).filter(Boolean));
    if(knownOffers){
      const fresh=[...ids].filter(x=>!knownOffers.has(x)).length;
      if(fresh){
        try{const AC=root.AudioContext||root.webkitAudioContext;if(AC){const ac=new AC(),o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=880;g.gain.setValueAtTime(0.0001,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.18,ac.currentTime+0.02);g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+0.5);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+0.55);}}catch(e){}
        try{if(root.navigator&&root.navigator.vibrate)root.navigator.vibrate([120,60,120]);}catch(e){}
        toast(fresh>1?`وصلك ${fresh} طلبات جديدة`:'وصلك طلب جديد');
        try{if(root.document&&root.document.hidden!==false){titleBase=titleBase||root.document.title;root.document.title='('+ids.size+') طلب جديد — '+titleBase;}}catch(e){}
      }
    }
    knownOffers=ids;
  }
  try{root.document.addEventListener('visibilitychange',()=>{if(!root.document.hidden&&titleBase){root.document.title=titleBase;titleBase='';}});}catch(e){}
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
    noticeNewOffers(groups);
    mountSwipe();
    setTimeout(hydrateProviderChat,0);   /* read receipt + typing for the open request chat */
    renderNav(page);
    dom.view.innerHTML=sectionFor(page,p,groups,tx);
    settle(page+'/'+(page==='request'?id:''),titleFor(page),focusTargets);
  }

  const titleFor = page => page==='request' ? 'تفاصيل الطلب' : page==='notifications' ? 'الإشعارات' : FILTER_OF[page] ? ({new:'طلبات جديدة',active:'الطلبات الشغالة',done:'الطلبات اللي خلصت'})[FILTER_OF[page]] : ((tabs.find(t=>t[0]===(TAB_OF[page]||page))||[])[1] || 'الطلبات');

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
    if(kind==='bid'){ const a0=MP.db().assignments.find(x=>x.reqId===id&&x.providerId===(currentProvider()||{}).id&&x.bidding)||{}; const b0=a0.bid||{}; const insp=(b0.kind||(request.bidding&&request.bidding.mode))==='inspection';
      dom.view.insertAdjacentHTML('afterbegin',`<form class="pv-inline-form" id="pv-bid-form" data-id="${esc(id)}" ${named('عرض سعر للطلب')}><fieldset class="pv-wide pv-bid-kind"><legend>نوع العرض</legend><label><input type="radio" name="kind" value="quote" ${insp?'':'checked'}> سعر الإصلاح</label><label><input type="radio" name="kind" value="inspection" ${insp?'checked':''}> محتاج معاينة الأول</label></fieldset><div class="pv-bid-pair pv-wide" data-bid="quote"><label>المصنعية (ج.م)<input name="labor" type="number" min="1" inputmode="numeric" value="${esc(b0.labor||'')}"></label><label>قطع الغيار (ج.م)<input name="parts" type="number" min="0" inputmode="numeric" value="${esc(b0.parts||'')}"></label></div><label data-bid="inspection">سعر المعاينة (ج.م)<input name="fee" type="number" min="1" inputmode="numeric" value="${esc(b0.fee||'')}"></label><label>هتوصل إمتى؟ (اختياري)<input name="eta" maxlength="40" placeholder="مثلًا: النهارده بعد العصر" value="${esc(b0.eta||'')}"></label><label class="pv-wide">ملاحظة للعميل (اختياري)<input name="note" maxlength="300" value="${esc(b0.note||'')}"></label><div class="pv-bid-total pv-wide" data-bid-total aria-live="polite"></div><p class="pv-hint pv-wide">اللي بتكتبه هو اللي هتاخده انت. المنصة بتضيف نسبتها والعميل بيشوف الإجمالي.</p><button class="pv-btn pv-btn-primary">${a0.bid?'تحديث العرض':'ابعت العرض'}</button><button type="button" class="pv-btn" data-pv-action="cancel-form">إلغاء</button></form>`);
      const f=$('#pv-bid-form',dom.view); const sync=()=>{ const k=(f.querySelector('input[name="kind"]:checked')||{}).value; f.querySelectorAll('[data-bid]').forEach(el=>{el.hidden=el.dataset.bid!==k;});
        /* live preview: what YOU get and what the CUSTOMER sees (platform share, your tier included) */
        const out=f.querySelector('[data-bid-total]'); if(out){ const v=n=>+((f.querySelector(`[name="${n}"]`)||{}).value)||0; const base=k==='inspection'?v('fee'):v('labor')+v('parts');
          const t=base>0&&MP.customerTotalFor?MP.customerTotalFor(base,(currentProvider()||{}).id,k):null;
          out.innerHTML=t?`<span>هتاخد <b>${money(base)}</b></span><span>العميل هيشوف <b>${money(t.customerPrice)}</b></span>`:'<span>اكتب السعر وهنوريك العميل هيشوف كام</span>'; } };
      f.addEventListener('change',sync); f.addEventListener('input',sync); sync(); }
    if(kind==='pin') dom.view.insertAdjacentHTML('afterbegin',`<form class="pv-inline-form" id="pv-pin-form" data-id="${esc(id)}" ${named('كود الوصول للطلب')}><label>كود الوصول (4 أرقام من العميل)<input class="pv-pin-input" name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="one-time-code" dir="ltr" required></label><p class="pv-hint pv-wide">العميل بيلاقي الكود في صفحة طلبه. ده بيأكد له إنك الفني الصح.</p><button class="pv-btn pv-btn-primary">تأكيد الوصول</button><button type="button" class="pv-btn" data-pv-action="cancel-form">إلغاء</button></form>`);
    if(kind==='rate-customer') dom.view.insertAdjacentHTML('afterbegin',`<form class="pv-inline-form" id="pv-ratec-form" data-id="${esc(id)}" ${named('تقييم العميل للطلب')}><label>تقييمك للعميل<select name="stars" required><option value="">اختر</option><option value="5">5 — ممتاز</option><option value="4">4 — كويس جدًا</option><option value="3">3 — مقبول</option><option value="2">2 — ضعيف</option><option value="1">1 — سيئ</option></select></label><label>ملاحظة (اختياري)<input name="comment" maxlength="300"></label><p class="pv-hint pv-wide">التقييم بيوصل للإدارة ولباقي الفنيين كمتوسط، والعميل مش بيشوف تقييمك ليه بالتفصيل.</p><button class="pv-btn pv-btn-primary">حفظ التقييم</button><button type="button" class="pv-btn" data-pv-action="cancel-form">إلغاء</button></form>`);
    const form=$('#'+({reject:'pv-reject-form',propose:'pv-propose-form',quote:'pv-quote-form',complete:'pv-complete-form',free:'pv-free-form','rate-customer':'pv-ratec-form',pin:'pv-pin-form',bid:'pv-bid-form'}[kind]),dom.view);
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
    if(!(v>0)) return `أدخل القيمة لمعاينة عمولة المنصة (${rate}%) وصافي مستحقك.`;
    if(!Number.isFinite(d)||d<0||d>v) return 'الخصم يجب أن يكون بين صفر وقيمة الخدمة.';
    const x=MP.calc(v,rate,d);
    return `عمولة المنصة (${rate}%): ${money(x.commission)} • الخصومات: ${money(x.deductions)} • صافي مستحقك: ${money(x.net)}`;
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
    if(action==='customer-location'){showCustomerLocation(id);return;}
    if(action==='customer-location-close'){delete locState[id];render([actionSel('customer-location',id)]);return;}
    if(action==='reject'||action==='propose'||action==='quote'||action==='complete'||action==='free'||action==='rate-customer'||action==='pin'||action==='bid'){openForm(action,id);return;}
    if(action==='photo'){pickPhoto(id,button.dataset.kind,button);return;}
    if(action==='edit-profile'){openProfileForm(p);return;}
    /* Mutations go through the API adapters (services/*-api.js); MP stays the local read model. */
    const failedButton=res=>{render([detailsSel(id)]);toast(isStale(res)?STALE:errorText(res));};
    if(action==='cash-yes'||action==='cash-no') return perform('cash:'+id,button,()=>api.orders.cash(id,action==='cash-yes'),()=>{render();toast('اتسجّل');},failedButton);
    if(action==='inspection-only') return perform('insp:'+id,button,()=>api.orders.inspectionOnly(id),()=>{router.navigate('done');render();toast('اتسجلت المعاينة');},failedButton);
    if(action==='availability') return perform('availability',button,()=>api.provider.setAvailability(!p.available),()=>render(['[data-pv-action="availability"]']),res=>toast(errorText(res)));
    if(action==='accept') return perform('accept:'+id,button,()=>api.orders.respond(id,true),()=>{router.navigate('accepted');render();toast('تم قبول الطلب');},failedButton);
    if(action==='complete-free') return perform('complete-free:'+id,button,()=>api.quotes.completeFree(id),()=>{router.navigate('done');render();toast('تم تسجيل إكمال الخدمة المجانية (بلا مقابل)');},failedButton);
    if(action==='confirm') return perform('confirm:'+id,button,()=>api.orders.schedule(id),()=>{render(nearRequest);toast('تم تأكيد الموعد');},failedButton);
    if(action==='advance') return perform('advance:'+id,button,()=>api.orders.advance(id,next,button.dataset.eta?+button.dataset.eta:undefined),()=>{followToGroup(id,p);render(nearRequest);toast('تم تحديث حالة الطلب');},()=>{render(nearRequest);toast('تعذر تحديث الحالة؛ راجع تسلسل الطلب');});
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
    if(form&&form.id==='pv-chat-form'){
      event.preventDefault(); const id=form.dataset.id, text=String(new FormData(form).get('text')||'').trim(); if(!text) return;
      return perform('chat:'+id,form.querySelector('button'),()=>api.orders.message(id,text),()=>{render(['#pvxchat-text']);},res=>toast(errorText(res)));
    }
    if(!form.matches('.pv-inline-form'))return;
    event.preventDefault(); const data=new FormData(form), id=form.dataset.id;
    const submitter=form.querySelector?form.querySelector('.pv-btn-primary'):null;
    const stale=res=>{ if(res&&res.status===422) return invalid(form,errorText(res)); formTrigger=null;render([detailsSel(id)]);toast(STALE); };
    const done=(focusAfter)=>{formTrigger=null;render(focusAfter);};
    if(form.id==='pv-register-form'){
      const result=registrationFrom(data); if(result.error) return invalid(form,result.error,result.field);
      return perform('register',submitter,()=>api.provider.register(result.value),res=>{
        session.select(res.data.id); formTrigger=null; router.navigate('home'); render();
        toast('تم إرسال طلب التسجيل — بانتظار اعتماد الإدارة');
      },res=>invalid(form,errorText(res)));
    }
    if(form.id==='pv-bid-form'){const kind=String(data.get('kind')||'quote');const body={kind,labor:+data.get('labor')||0,parts:+data.get('parts')||0,fee:+data.get('fee')||0,note:String(data.get('note')||''),eta:String(data.get('eta')||'')};if(kind==='quote'&&!(body.labor>0))return invalid(form,'اكتب سعر المصنعية');if(kind==='inspection'&&!(body.fee>0))return invalid(form,'اكتب سعر المعاينة');return perform('bid:'+id,submitter,()=>api.orders.bid(id,body),()=>{toast('عرضك اتبعت — العميل هيختار');done([detailsSel(id)]);},res=>invalid(form,errorText(res)));}
    if(form.id==='pv-pin-form'){const pin=String(data.get('pin')||'').trim();if(!/^\d{4}$/.test(pin))return invalid(form,'الكود 4 أرقام');const p=currentProvider();return perform('advance:'+id,submitter,()=>api.orders.advance(id,'arrived',undefined,pin),()=>{formTrigger=null;followToGroup(id,p);render([detailsSel(id)]);toast('تم تسجيل وصولك');},res=>invalid(form,errorText(res)));}
    if(form.id==='pv-ratec-form'){const stars=+data.get('stars');if(!(stars>=1&&stars<=5))return invalid(form,'اختر التقييم');return perform('ratec:'+id,submitter,()=>api.orders.rateCustomer(id,stars,String(data.get('comment')||'')),()=>{toast('تم حفظ تقييمك للعميل');done([detailsSel(id)]);},stale);}
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
  function locPanel(r,a) {
    if(!loc||!locState[r.id]||!loc.available(r,a)) return '';
    const c=MP.get('customers',r.customerId);
    return loc.panelHtml(r,c&&c.name,locState[r.id],esc);
  }

  /* Each press re-reads the provider's position once (permission prompt on first use) and recomputes the distance. */
  function showCustomerLocation(id) {
    const r=MP.get('serviceRequests',id), focus=[actionSel('customer-location',id)];
    if(!r) return;
    const set=st=>{locState[id]=st;render(focus);};
    const target=loc.validGeo(r.geo);
    if(!target) return set({status:'nogeo'});
    const geo=root.navigator&&root.navigator.geolocation;
    if(!geo||typeof geo.getCurrentPosition!=='function') return set({status:'unsupported'});
    set({status:'locating'});
    geo.getCurrentPosition(
      pos=>{const me=loc.validGeo({lat:pos&&pos.coords&&pos.coords.latitude,lng:pos&&pos.coords&&pos.coords.longitude});set(me?{status:'ok',km:loc.distanceKm(me,target)}:{status:'error'});},
      err=>set({status:err&&err.code===1?'denied':'error'}),
      {enableHighAccuracy:true,timeout:15000,maximumAge:30000});
  }

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
