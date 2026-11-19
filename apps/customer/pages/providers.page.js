/**
 * Customer providers page renderers: provider card, provider details and provider matching for a request.
 * Extracted verbatim from market-ui.page.js (same markup, data-* hooks and copy). Presentation only: the caller passes
 * the local marketplace adapter and UI helpers explicitly; event handling and workflow transitions stay in market-ui.page.js.
 */
'use strict';
(function(root){
  const REQUIRED = ['MP', 'me', 'esc', 'ic', 'icp', 'head', 'demoBanner', 'uiEmpty', 'uiSuccess', 'uiOfflineIfNeeded', 'starsHtml', 'fmtDT', 'icStatus', 'STATUS_LABEL'];
  const check = (ctx, extra = []) => {
    const missing = REQUIRED.concat(extra).filter(k => ctx[k] === undefined || ctx[k] === null);
    if (missing.length) throw new Error('HSCustomerProvidersPage: missing dependencies: ' + missing.join(', '));
  };

  /* ═════════ بطاقة مقدم الخدمة ═════════ */
  function card(p, { compact=false, showFav=true, reqId='' } = {}, ctx = {}) {
    check(ctx);
    const { MP, me, esc, ic } = ctx;
    const u = me();
    const isFav = u && MP.isFavorite(u.id, 'provider', p.id);
    const rating = p.rating || MP.rating(p.id);
    const subTitle = p.cats.map(c => MP.catName(c)).join('، ');
    const areaText = (p.areas && p.areas.length ? p.areas : p.govs || []).slice(0,3).join('، ');
    const avatar = p.avatar || '#FF3D8F';
    const initials = (p.name || '?').split(' ').map(w=>w[0]).slice(0,2).join('');
    return `<div class="card2 glass neon prov-card">
    <div class="top">
      <div class="prov-avatar" aria-hidden="true" style="background:${avatar}">${esc(initials)}</div>
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
      ${p.available?`<button class="pri" data-choose-provider="${esc(p.id)}"${reqId?` data-choose-req="${esc(reqId)}"`:''}>${ic('check')} اختيار</button>`:`<button disabled>${ic('clock')} غير متاح</button>`}
    </div>`:''}
  </div>`;
  }

  /* ═════════ شاشة تفاصيل مقدم الخدمة ═════════ */
  function details(ctx = {}) {
    check(ctx, ['id']);
    const { id, MP, me, esc, ic, head, demoBanner, uiEmpty, starsHtml, fmtDT } = ctx;
    const p = MP.get('providers', id);
    if (!p) return `<div class="screen">${head('مقدم الخدمة', true)}${uiEmpty('user','لم يُعثر على مقدم الخدمة')}</div>`;
    const u = me();
    const isFav = u && MP.isFavorite(u.id, 'provider', p.id);
    const rating = p.rating || MP.rating(p.id);
    const allReviews = MP.db().reviews.filter(v => v.providerId === p.id && !v.hidden);
    const reviews = allReviews.slice(0, 5);
    const ratingCount = allReviews.length;
    /* rating distribution (5 → 1) from the reviews this device can see */
    const dist = [5,4,3,2,1].map(n => [n, allReviews.filter(v => Math.round(+v.stars) === n).length]);
    const breakdown = ratingCount ? `<div class="rating-break glass neon" aria-label="توزيع التقييمات">
        <div class="rb-score"><b>${(+rating || 0).toFixed(1)}</b>${starsHtml(Math.round(+rating || 0))}<small>${ratingCount} تقييم</small></div>
        <ul class="rb-bars">${dist.map(([n, c]) => `<li><span>${n}</span><i style="--w:${Math.round(c / ratingCount * 100)}%"></i><small>${c}</small></li>`).join('')}</ul>
      </div>` : '';
    const since = p.createdAt ? (() => { const d = new Date(p.createdAt); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }); })() : '';
    return `<div class="screen">${head('تفاصيل مقدم الخدمة', true)}${demoBanner()}
      <div class="provider-hero glass neon">
        <div class="prov-avatar" aria-hidden="true" style="background:${p.avatar||'#FF3D8F'}">${esc((p.name||'?').split(' ').map(w=>w[0]).slice(0,2).join(''))}</div>
        <div>
          <h3>${esc(p.name)}${p.status==='approved'?` <span class="verified">${ic('shield')} موثّق</span>`:''}</h3>
          <small>${p.cats.map(c=>MP.catName(c)).join('، ')}</small>
          ${since?`<small class="prov-since">على هنصلحلك منذ ${esc(since)}</small>`:''}
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
      ${root.HSTrust ? root.HSTrust.portfolioSlot(p.id) : ''}
      <h2 class="sec-title">${ic('medal')}التقييمات (${ratingCount})</h2>
      ${breakdown}
      ${root.HSTrust && ratingCount ? `<p class="praise-h">العملاء بيقولوا عنه</p>${root.HSTrust.tagChips(p.id)}` : ''}
      ${reviews.length?reviews.map(v=>`<div class="card2 glass neon">
        <div class="top"><b>${starsHtml(v.stars)}</b><span class="tag">${esc(v.quality||'')}</span></div>
        ${v.comment?`<small>${esc(v.comment)}</small>`:''}
        <small style="color:var(--muted)">${fmtDT(v.at)}</small>
      </div>`).join(''):uiEmpty('star','لا توجد تقييمات بعد','كن أول من يقيّم')}
    </div>`;
  }

  /* ═════════ مطابقة مقدمي الخدمة (بعد إنشاء الطلب) ═════════ */
  function matches(ctx = {}) {
    check(ctx, ['reqId']);
    const { reqId, MP, esc, ic, icp, head, demoBanner, uiEmpty, uiSuccess, uiOfflineIfNeeded, icStatus, STATUS_LABEL } = ctx;
    const r = MP.get('serviceRequests', reqId);
    if (!r) return `<div class="screen">${head('مطابقة', true)}${uiEmpty('wrench','لم يُعثر على الطلب')}</div>`;
    const cands = MP.candidates(r);
    const p = MP.providerOf(reqId);
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
      <div class="plist" style="gap:12px">${cands.map(x => card(x, { reqId }, ctx)).join('')}</div>
      <div class="row2" style="margin-top:14px">
        <button class="cta ghost" style="margin:0" data-act="editReq" data-id="${reqId}">${ic('edit')} تعديل الطلب</button>
        <button class="cta ghost" style="margin:0" data-act="cancelReq" data-id="${reqId}">${ic('cancel')} إلغاء</button>
      </div>
    </div>`;
  }

  root.HSCustomerProvidersPage = Object.freeze({ card, details, matches, dependencies: REQUIRED.slice() });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HSCustomerProvidersPage;
})(typeof globalThis !== 'undefined' ? globalThis : this);
