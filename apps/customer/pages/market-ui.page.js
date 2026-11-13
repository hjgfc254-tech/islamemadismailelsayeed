/* ═══════════════════════════════════════════════════════════════
   هنصلحلك — واجهة العميل في المنصة الوسيطة — الإصدار 7
   ───────────────────────────────────────────────────────────────
   V7 — تغييرات جوهرية عن V6:
   • شاشة tracking تُدعم 12 حالة (FLOW الجديد) + حالات بديلة (cancelled/failed).
   • عرض تفاصيل مقدم الخدمة (providerDetails) مع بيانات موسّعة + مفضلة.
   • شاشة مطابقة/اختيار مقدم الخدمة (matchProviders) — للمحاكاة والاختيار.
   • عرض السعر (quote) والموافقة/الرفض (quoteReview).
   • موافقة العميل على الموعد (confirmTime) + إلغاء + شكوى.
   • تقييم بعد الإتمام مع صور (عبر AT).
   • عرض حالات: loading, empty, error, success, offline.
   • استخدام FLOW الجديد وSTATUS_LABEL.
   • استخدام icStatus للحالات الجديدة (st-arrived/st-quote/st-failed).
   • لا شيء من V6 حُذف — كل الشاشات القديمة تعمل.

   يعتمد على: MP, CAT, AT, HS_SEARCH (اختياري)، أدوات app.js.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const DEMO_NOTE = 'وضع العرض التجريبي — لا تُرسل الطلبات لفنيين حقيقيين، والإسناد محاكاة داخل هذا الجهاز فقط.';
const demoBanner = () => `<div class="demo-banner">${ic('info')}<span>${DEMO_NOTE}</span></div>`;
const fmtDT = s => { try{ if(!s) return ''; const d = new Date(s); if(Number.isNaN(d.getTime())) return ''; return d.toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}); }catch{ return ''; } };
const fmtDateOnly = s => { try{ return new Date(s).toLocaleDateString('ar-EG',{day:'numeric',month:'long',weekday:'short'}); }catch{ return s||''; } };
const money = n => (+n||0).toLocaleString('ar-EG',{maximumFractionDigits:2})+' ج.م';
const stars = n => starsHtml(n);
const me = () => { const u = store.get('user',null); return u ? MP.db().customers.find(c=>c.phone===u.phone) || null : null; };
const myReqs = () => { const c = me(); return c ? MP.reqs().filter(r=>r.customerId===c.id) : []; };

/* ═════════ عناصر الحالة (loading/empty/error/offline) ═════════ */
const uiLoading = (txt) => UIK.loading(txt);
const uiEmpty = (icon, txt, sub) => UIK.empty(icon, txt, sub);
const uiError = (txt) => UIK.error(txt);
const uiOffline = () => UIK.offline();
const uiSuccess = (icon, txt) => UIK.success(icon, txt);

/* ═════════ حالة الاتصال ═════════ */
let isOnline = true;
try { isOnline = navigator.onLine !== false; } catch {}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { isOnline = true; });
  window.addEventListener('offline', () => { isOnline = false; });
}

/* ═════════ بطاقة طلب للعميل (تُستخدم في الطلبات/الرئيسية) ═════════ */
const reqCard = x => `<button class="prow glass neon" data-track="${x.id}">
  ${icp(icStatus(x.status),'st')}
  <span class="tx">${esc(x.serviceName)}<small>#${x.no} • ${fmtDT(x.createdAt)}</small></span>
  <span class="tag ${x.status==='cancelled'||x.status==='failed'?'warn':''}">${ic(icStatus(x.status))} ${STATUS_LABEL[x.status]||''}</span>
</button>`;

/* ═════════ عرض الحالة الحالية + المسار ═════════ */
function statusTimeline(r){
  const history = Array.isArray(r.history) ? r.history : [];
  /* aria-current="step" على آخر سجل للحالة الحالية، حتى يعلن قارئ الشاشة الخطوة الحالية داخل القائمة */
  let currentIdx = -1;
  history.forEach((h, i) => { if (h.s === r.status) currentIdx = i; });
  const events = history.map((h, i) => {
    const label = STATUS_LABEL[h.s] || h.s || 'تحديث حالة';
    const terminal = ['cancelled','failed'].includes(h.s);
    return `<li class="${terminal?'bad':'done'}"${i===currentIdx?' aria-current="step"':''}><i>${ic(terminal ? icStatus(h.s) : 'tick')}</i><span>${esc(label)}</span>${h.note?`<small>${esc(h.note)}</small>`:''}<time>${fmtDT(h.at)}</time></li>`;
  });
  const currentRecorded = currentIdx >= 0;
  if (!currentRecorded && r.status) {
    const terminal = ['cancelled','failed'].includes(r.status);
    events.push(`<li class="${terminal?'bad':'now'}" aria-current="step"><i>${ic(icStatus(r.status),'live')}</i><span>${esc(STATUS_LABEL[r.status] || r.status)}</span><small>الحالة الحالية</small></li>`);
  }
  if (!events.length) {
    const idx = FLOW.findIndex(f => f[0] === r.status);
    const label = STATUS_LABEL[r.status] || r.status;
    events.push(`<li class="now" aria-current="step"><i>${ic(icStatus(r.status),'live')}</i><span>${esc(label)}</span><small>الحالة الحالية</small></li>`);
    if (idx >= 0 && FLOW[idx+1]) events.push(`<li><i>${idx+2}</i><span>${esc(FLOW[idx+1][1])}</span><small>الخطوة التالية المتوقعة</small></li>`);
  }
  return `<ol class="tl" aria-label="السجل الزمني للطلب">${events.slice(-12).reverse().join('')}</ol>`;
}

/* ═════════ بطاقة مقدم الخدمة ═════════ */
function providerCard(p, { compact=false, showFav=true } = {}) {
  const u = me();
  const isFav = u && MP.isFavorite(u.id, 'provider', p.id);
  const rating = p.rating || MP.rating(p.id);
  const subTitle = p.cats.map(c => MP.catName(c)).join('، ');
  const areaText = (p.areas && p.areas.length ? p.areas : p.govs || []).slice(0,3).join('، ');
  const avatar = p.avatar || '#FF3D8F';
  const initials = (p.name || '?').split(' ').map(w=>w[0]).slice(0,2).join('');
  return `<div class="card2 glass neon prov-card">
    <div class="top">
      <div class="prov-avatar" style="background:${avatar}">${esc(initials)}</div>
      <div class="prov-head">
        <b>${esc(p.name)}</b>
        ${p.demo?`<span class="tag">محاكاة</span>`:''}
        <small>${esc(subTitle)}${p.years?` • ${p.years} سنة خبرة`:''}</small>
      </div>
      ${showFav?`<button class="fav-btn ${isFav?'on':''}" data-fav-provider="${esc(p.id)}" aria-label="مفضلة">${ic('heart')}</button>`:''}
    </div>
    ${!compact && p.bio?`<small class="prov-bio">${esc(p.bio)}</small>`:''}
    <div class="prov-meta">
      <span class="tag">${ic('star')} ${rating?rating:'—'}</span>
      ${p.jobs?`<span class="tag">${ic('medal')} ${p.jobs} خدمة</span>`:''}
      ${areaText?`<span class="tag">${ic('pin')} ${esc(areaText)}</span>`:''}
    </div>
    ${!compact?`<div class="acts">
      <button data-provider-details="${esc(p.id)}">${ic('info')} التفاصيل</button>
      ${p.available?`<button class="pri" data-choose-provider="${esc(p.id)}">${ic('check')} اختيار</button>`:`<button disabled>${ic('clock')} غير متاح</button>`}
    </div>`:''}
  </div>`;
}

/* ═════════ شاشة تفاصيل مقدم الخدمة ═════════ */
Object.assign(screens, {
  providerDetails(id){
    const p = MP.get('providers', id);
    if (!p) return `<div class="screen">${head('مقدم الخدمة', true)}${uiEmpty('user','لم يُعثر على مقدم الخدمة')}</div>`;
    const u = me();
    const isFav = u && MP.isFavorite(u.id, 'provider', p.id);
    const rating = p.rating || MP.rating(p.id);
    const reviews = MP.db().reviews.filter(v => v.providerId === p.id).slice(0, 5);
    const ratingCount = MP.db().reviews.filter(v => v.providerId === p.id).length;
    return `<div class="screen">${head('تفاصيل مقدم الخدمة', true)}${demoBanner()}
      <div class="provider-hero glass neon">
        <div class="prov-avatar" style="background:${p.avatar||'#FF3D8F'}">${esc((p.name||'?').split(' ').map(w=>w[0]).slice(0,2).join(''))}</div>
        <div>
          <h3>${esc(p.name)}</h3>
          <small>${p.cats.map(c=>MP.catName(c)).join('، ')}</small>
          ${p.demo?`<div class="tag" style="margin-top:6px">محاكاة تجريبية</div>`:''}
        </div>
        <button class="fav-btn ${isFav?'on':''}" data-fav-provider="${esc(p.id)}" aria-label="مفضلة">${ic('heart')}</button>
      </div>
      <div class="stats" style="grid-template-columns:1fr 1fr 1fr">
        <div class="stat glass"><small>التقييم</small><b>${rating?rating+' ★':'—'}</b></div>
        <div class="stat glass"><small>الخدمات</small><b>${p.jobs||0}</b></div>
        <div class="stat glass"><small>الخبرة</small><b>${p.years||0} سنة</b></div>
      </div>
      ${p.bio?`<div class="sumbox glass neon"><div><small>نبذة</small><b>${esc(p.bio)}</b></div></div>`:''}
      <div class="sumbox glass neon">
        <div><small>المحافظات</small><b>${(p.govs||[]).join('، ')}</b></div>
        ${p.areas && p.areas.length?`<div><small>المناطق</small><b>${p.areas.join('، ')}</b></div>`:''}
        ${p.subs && p.subs.length?`<div><small>تخصصات دقيقة</small><b>${p.subs.map(s => s.split('/').pop()).join('، ')}</b></div>`:''}
      </div>
      <div class="row2" style="margin-top:12px">
        ${p.available?`<button class="cta" style="margin:0" data-choose-provider="${esc(p.id)}">${ic('check')} اختيار مقدم الخدمة</button>`:`<button class="cta ghost" style="margin:0" disabled>${ic('clock')} غير متاح حاليًا</button>`}
        <button class="cta ghost" style="margin:0" data-provider-service-request="${esc(p.cats[0])}">${ic('wrench')} طلب خدمة</button>
      </div>
      <h2 class="sec-title">${ic('medal')}التقييمات (${ratingCount})</h2>
      ${reviews.length?reviews.map(v=>`<div class="card2 glass neon">
        <div class="top"><b>${starsHtml(v.stars)}</b><span class="tag">${esc(v.quality||'')}</span></div>
        ${v.comment?`<small>${esc(v.comment)}</small>`:''}
        <small style="color:var(--muted)">${fmtDT(v.at)}</small>
      </div>`).join(''):uiEmpty('star','لا توجد تقييمات بعد','كن أول من يقيّم')}
    </div>`;
  },

  /* ═════════ مطابقة مقدمي الخدمة (بعد إنشاء الطلب) ═════════ */
  matchProviders(reqId){
    const r = MP.get('serviceRequests', reqId);
    if (!r) return `<div class="screen">${head('مطابقة', true)}${uiEmpty('wrench','لم يُعثر على الطلب')}</div>`;
    const cands = MP.candidates(r);
    const p = MP.providerOf(reqId);
    const activeAssign = MP.activeAssignment(reqId);
    const stillSearching = r.status === 'searching' || r.status === 'received';

    /* حالة: لا يوجد مزود */
    if (!cands.length) {
      return `<div class="screen">${head('البحث عن مقدم خدمة', true)}${demoBanner()}
        ${uiOfflineIfNeeded()}
        <div class="card2 glass neon">
          <div class="top"><b>${ic('clock')} لا يوجد مقدم خدمة متاح الآن</b></div>
          <small>لم نجد مقدم خدمة مطابقًا لتخصصك في منطقتك. يمكنك:</small>
        </div>
        <div class="plist">
          <button class="prow glass neon" data-act="expandSearch" data-id="${reqId}">${icp(ic('search'),'sv')}<span class="tx">توسيع نطاق البحث<small>المحافظات المجاورة</small></span>${ic('chev','chev')}</button>
          <button class="prow glass neon" data-act="editReq" data-id="${reqId}">${icp(ic('edit'),'sv')}<span class="tx">تعديل الطلب<small>تغيير التفاصيل أو المنطقة</small></span>${ic('chev','chev')}</button>
          <button class="prow glass neon" data-act="cancelReq" data-id="${reqId}">${icp(ic('cancel'),'sv')}<span class="tx">إلغاء الطلب</span>${ic('chev','chev')}</button>
        </div>
        ${uiSuccess('info','سنُعلمك فور توفر مقدم خدمة مناسب.')}
      </div>`;
    }

    /* حالة: تم العثور على مزودين */
    return `<div class="screen">${head('مقدمو الخدمة المتاحون', true)}${demoBanner()}
      ${uiOfflineIfNeeded()}
      <div class="sumbox glass neon" style="margin-top:6px">
        <div><small>الطلب</small><b>#${esc(r.no)} — ${esc(r.serviceName)}</b></div>
        <div><small>الموقع</small><b>${esc(r.gov)} — ${esc(r.area)}</b></div>
        <div><small>الحالة</small><b>${ic(icStatus(r.status))} ${STATUS_LABEL[r.status]||''}</b></div>
      </div>
      ${stillSearching ? `<div class="need">${ic('info')}<span>جارٍ البحث… سيتم إسناد الطلب تلقائيًا للمرشح الأول. يمكنك الاختيار يدويًا إذا أردت.</span></div>` : ''}
      ${p ? `<div class="need" style="color:#6ee7b7">${ic('check')}<span>تم قبول الطلب من ${esc(p.name)}</span></div>` : ''}
      <h2 class="sec-title">${ic('user')}مقدمو الخدمة المطابقون (${cands.length})</h2>
      <div class="plist" style="gap:12px">${cands.map(x => providerCard(x)).join('')}</div>
      <div class="row2" style="margin-top:14px">
        <button class="cta ghost" style="margin:0" data-act="editReq" data-id="${reqId}">${ic('edit')} تعديل الطلب</button>
        <button class="cta ghost" style="margin:0" data-act="cancelReq" data-id="${reqId}">${ic('cancel')} إلغاء</button>
      </div>
    </div>`;
  },

  /* ═════════ شاشة تتبع الطلب (V7 — 12 حالة) ═════════ */
  tracking(id){
    return HSCustomerOrderDetailsPage.render({
      id, MP, head, demoBanner, uiOfflineIfNeeded, uiEmpty, esc, ic,
      icStatus, STATUS_LABEL, money, fmtDT, statusTimeline, uiSuccess, starsHtml
    });
  }
});

function uiOfflineIfNeeded(){ return isOnline ? '' : uiOffline(); }

/* ═════════ أحداث (تُضاف إلى مستمعي app.js) ═════════ */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-track],[data-star],[data-act],[data-provider-details],[data-choose-provider],[data-fav-provider],[data-provider-service-request]');
  if (!t) return;
  const d = t.dataset;

  if (d.track) {
    e.preventDefault(); e.stopPropagation();
    if (typeof state !== 'undefined') { state.stack.push('track:'+d.track); history.pushState({tr:1},''); }
    if (typeof show === 'function') show('tracking', d.track);
    return;
  }
  if (d.star) {
    document.querySelectorAll('#sheet [data-star]').forEach(b => b.classList.toggle('on', +b.dataset.star <= +d.star));
    const el = document.getElementById('rv-stars'); if (el) el.value = d.star;
    return;
  }
  if (d.providerDetails) {
    e.preventDefault(); e.stopPropagation();
    if (typeof state !== 'undefined') { state.stack.push('provider:'+d.providerDetails); history.pushState({pv:1},''); }
    if (typeof show === 'function') show('providerDetails', d.providerDetails);
    return;
  }
  if (d.chooseProvider) {
    e.preventDefault(); e.stopPropagation();
    chooseProviderManually(d.chooseProvider);
    return;
  }
  if (d.favProvider) {
    e.preventDefault(); e.stopPropagation();
    const u = me(); if (!u) return toast('سجّل بياناتك أولاً');
    const on = MP.toggleFavorite(u.id, 'provider', d.favProvider);
    t.classList.toggle('on', on);
    toast(on ? 'أُضيف للمفضلة' : 'أُزيل من المفضلة');
    return;
  }
  if (d.providerServiceRequest) {
    e.preventDefault(); e.stopPropagation();
    if (typeof startRequest === 'function') startRequest(d.providerServiceRequest);
    return;
  }

  /* data-act */
  switch (d.act) {
    case 'custConfirm':
      if (MP.confirmTime(d.id, 'customer')) { show('tracking', d.id); toast('تم الاتفاق على الموعد'); }
      break;
    case 'custClose':
      if (MP.close(d.id)) { show('tracking', d.id); toast('تم إغلاق الطلب'); }
      break;
    case 'cancelReq':
      if (confirm('هل تريد إلغاء الطلب؟')) {
        const reason = prompt('سبب الإلغاء (اختياري):') || 'ألغاه العميل';
        if (MP.cancel(d.id, reason)) { show('tracking', d.id); toast('تم إلغاء الطلب'); }
      }
      break;
    case 'rate': openRateSheet(d.id); break;
    case 'complain': openComplainSheet(d.id); break;
    case 'approveQuote':
      if (MP.approveQuote(d.id)) { show('tracking', d.id); toast('تمت الموافقة على السعر'); }
      break;
    case 'rejectQuote':
      if (confirm('هل تريد رفض عرض السعر؟')) {
        const reason = prompt('سبب الرفض (اختياري):') || '';
        if (MP.rejectQuote(d.id, reason)) { show('tracking', d.id); toast('تم رفض العرض — يمكن للفني إرسال عرض معدّل'); }
      }
      break;
    case 'viewMatches':
      if (typeof state !== 'undefined') { state.stack.push('match:'+d.id); history.pushState({m:1},''); }
      show('matchProviders', d.id);
      break;
    case 'editReq': {
      const r = MP.get('serviceRequests', d.id);
      if (!r) break;
      if (typeof startRequest === 'function') {
        startRequest(r.cat, r.itemId);
        if (typeof WZ !== 'undefined' && WZ) {
          WZ.problem = r.problemId || '';
          WZ.unknown = !!r.unknownProblem;
          WZ.answers = { ...(r.answers || {}) };
          WZ.desc = r.desc || '';
          WZ.note = r.note || '';
          WZ.address.gov = r.gov || '';
          WZ.address.area = r.area || '';
          WZ.address.addr = r.addr || '';
          WZ.contact.phone = r.phone || '';
          WZ.contact.name = r.phone ? (MP.get('customers', r.customerId)||{}).name || '' : '';
          WZ.contact.method = r.contactMethod || 'call';
          WZ.step = 2;
          if (typeof show === 'function') show('wizard');
        }
      }
      break;
    }
    case 'expandSearch': {
      const r = MP.get('serviceRequests', d.id);
      if (!r) break;
      const expanded = MP.db().providers.filter(p => p.status==='approved' && p.cats.includes(r.cat) && p.govs.some(g => ['القاهرة','الجيزة','الإسكندرية','القليوبية'].includes(g)));
      if (!expanded.length) { toast('لا يوجد مقدمو خدمة إضافيون حاليًا'); break; }
      const p = expanded[0];
      const res = MP.assign(r.id, p.id);
      if (res.ok) { show('tracking', d.id); toast('تم توسيع نطاق البحث — أُرسل الطلب إلى ' + p.name); }
      else toast(res.msg || 'تعذّر التوسيع');
      break;
    }
    case 'simAdvance': {
      const r = MP.get('serviceRequests', d.id);
      if (!r) break;
      const idx = FLOW.findIndex(f => f[0] === r.status);
      if (idx < 0 || idx >= FLOW.length - 1) { toast('الطلب في حالة نهائية'); break; }
      const next = FLOW[idx + 1][0];
      /* محاكاة قبول/بدء بدون مزود */
      if ((next === 'accepted' || next === 'scheduled') && !MP.providerOf(d.id)) {
        const cand = MP.candidates(r)[0];
        if (cand) { MP.assign(r.id, cand.id); MP.respond(r.id, true); }
      }
      MP.advance(d.id, next);
      show('tracking', d.id);
      toast('الحالة: ' + (STATUS_LABEL[next]||next));
      break;
    }
    case 'simQuote': {
      const p = MP.providerOf(d.id);
      if (!p) { toast('لا يوجد مزود معيّن بعد'); break; }
      MP.createQuote(d.id, { labor: 250, parts: 120, visitFee: 0, discount: 0, note: 'محاكاة عرض سعر تجريبي' });
      show('tracking', d.id);
      toast('تم إنشاء عرض سعر تجريبي');
      break;
    }
  }
});

/* ═════════ اختيار مزود يدويًا ═════════ */
function chooseProviderManually(providerId) {
  /* نحتاج reqId — نستخدم أحدث طلب غير مُسند في searching/received */
  const r = MP.reqs().find(x => ['searching','received'].includes(x.status));
  if (!r) { toast('لا يوجد طلب بانتظار الإسناد'); return; }
  const res = MP.assign(r.id, providerId);
  if (res.ok) { show('tracking', r.id); toast('تم إرسال الطلب إلى ' + res.provider.name); }
  else toast(res.msg || 'تعذّر الإسناد');
}

/* ═════════ شيت التقييم (V7) ═════════ */
function openRateSheet(reqId) {
  const r = MP.get('serviceRequests', reqId);
  if (!r) return;
  sheet(`<h4>${ic('medal')} قيّم مقدم الخدمة</h4><div class="sub">#${esc(r.no)} — ${esc(r.serviceName)}</div>
    <div class="stars-in">${[1,2,3,4,5].map(n=>`<button data-star="${n}" aria-label="${n}">${ic('star')}</button>`).join('')}</div>
    <form class="form" id="rvForm" data-id="${reqId}"><input type="hidden" id="rv-stars" name="stars" value="0">
      <div><label>جودة التنفيذ</label><select name="quality"><option>ممتازة</option><option>جيدة</option><option>مقبولة</option><option>ضعيفة</option></select></div>
      <div><label>تعليق</label><textarea name="comment" placeholder="اكتب تجربتك (اختياري)" maxlength="500"></textarea></div>
      <div><label>صور (اختياري)</label><div class="thumbs" id="rv-thumbs"></div>
        <button type="button" class="cta ghost" style="min-height:44px" data-act="rvAddPhoto">${ic('camera')} إضافة صورة</button>
      </div>
      <button class="cta" type="submit">${ic('check')} إرسال التقييم</button>
    </form>`);
}
let _rvPhotos = [];
document.addEventListener('click', e => {
  if (e.target.closest('[data-act="rvAddPhoto"]')) {
    const i = document.createElement('input'); i.type='file'; i.accept='image/*'; i.multiple = true;
    i.onchange = async () => {
      if (typeof AT === 'undefined') { toast('المرفقات غير متاحة'); return; }
      const { added } = await AT.addFiles('', i.files, {draftId:'review'});
      for (const rec of added) {
        _rvPhotos.push({id: rec.id, thumb: rec.thumb});
      }
      const box = document.getElementById('rv-thumbs');
      if (box) box.innerHTML = _rvPhotos.map(p => `<span class="th"><img src="${p.thumb}" alt=""></span>`).join('');
    };
    i.click();
  }
});

/* ═════════ شيت الشكوى ═════════ */
function openComplainSheet(reqId) {
  sheet(`<h4>${ic('warn')} تقديم شكوى</h4><div class="sub">سيراجعها فريق الإدارة</div>
    <form class="form" id="cmpForm" data-id="${reqId}" data-by="customer">
      <div><label>نوع الشكوى</label>
        <select name="kind">
          <option value="quality">جودة الخدمة</option>
          <option value="delay">تأخر في الموعد</option>
          <option value="price">خلاف على السعر</option>
          <option value="behavior">سلوك غير لائق</option>
          <option value="other">أخرى</option>
        </select>
      </div>
      <div><label>تفاصيل الشكوى</label><textarea name="text" required minlength="10" maxlength="1000" placeholder="اشرح ما حدث بالتفصيل"></textarea></div>
      <button class="cta" type="submit">${ic('send')} إرسال الشكوى</button>
    </form>`);
}

/* ═════════ معالجات الإرسال ═════════ */
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'rvForm') {
    e.preventDefault();
    const d = new FormData(f), s = +d.get('stars');
    if (!s) return toast('اختر عدد النجوم');
    const r = MP.review(f.dataset.id, { stars:s, quality:d.get('quality'), comment:d.get('comment'), attachments: _rvPhotos.map(x=>x.id) });
    if (r) {
      _rvPhotos = [];
      closeSheet();
      show('tracking', f.dataset.id);
      toast('شكرًا على تقييمك');
    } else toast('تعذّر حفظ التقييم');
  }
  if (f.id === 'cmpForm') {
    e.preventDefault();
    const d = new FormData(f);
    MP.complain(f.dataset.id, f.dataset.by || 'customer', d.get('text'), {kind: d.get('kind')});
    closeSheet();
    toast('تم تسجيل شكواك');
  }
});

/* ═════════ شاشة الطلبات (توسيع V6) ═════════ */
Object.assign(screens, {
  orders(){
    const customer = me();
    return HSCustomerOrdersPage.render({
      customer,
      orders: myReqs(),
      filter: (typeof state !== 'undefined' && state.orderFilter) || 'active',
      head, demoBanner, offlineNotice: uiOfflineIfNeeded, empty: uiEmpty,
      buttonIcon: ic, requestCard: reqCard
    });
  }
});

document.addEventListener('click', e => {
  const b = e.target.closest('[data-order-filter]');
  if (!b) return;
  if (typeof state !== 'undefined') state.orderFilter = b.dataset.orderFilter;
  /* أعِد التركيز إلى زر التصفية المضغوط بعد إعادة رسم الشاشة (لوحة المفاتيح/قارئ الشاشة) */
  if (typeof requestFocusAfterShow === 'function') requestFocusAfterShow(`[data-order-filter="${b.dataset.orderFilter}"]`);
  if (typeof show === 'function') show('orders');
});

/* CSS شريط التحميل وبطاقات المزود نُقل إلى styles.css (قسم V8-C2) */