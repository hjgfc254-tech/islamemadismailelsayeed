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
/* the demo notice describes the offline demo only; with the Firebase backend requests are real */
const demoBanner = () => (typeof HSFirebaseConfig !== 'undefined' && HSFirebaseConfig.mode === 'firebase') ? '' : `<div class="demo-banner">${ic('info')}<span>${DEMO_NOTE}</span></div>`;
const fmtDT = s => { try{ if(!s) return ''; const d = new Date(s); if(Number.isNaN(d.getTime())) return ''; return d.toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}); }catch{ return ''; } };
const fmtDateOnly = s => { try{ return new Date(s).toLocaleDateString('ar-EG',{day:'numeric',month:'long',weekday:'short'}); }catch{ return s||''; } };
const money = n => (+n||0).toLocaleString('ar-EG',{maximumFractionDigits:2})+' ج.م';
const stars = n => starsHtml(n);
const me = () => (typeof HSCustomerSession !== 'undefined' ? HSCustomerSession.customer()
  : (u => u ? MP.db().customers.find(c=>c.phone===u.phone) || null : null)(store.get('user',null)));
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
function providerCard(p, opts = {}) { return HSCustomerProvidersPage.card(p, opts, providersCtx()); }
const providersCtx = () => ({ MP, me, esc, ic, icp, head, demoBanner, uiEmpty, uiSuccess, uiOfflineIfNeeded, starsHtml, fmtDT, icStatus, STATUS_LABEL });

/* ═════════ شاشات مقدم الخدمة — العرض في pages/providers.page.js (HSCustomerProvidersPage) ═════════ */
Object.assign(screens, {
  providerDetails(id){ return HSCustomerProvidersPage.details({ ...providersCtx(), id }); },

  /* ═════════ مطابقة مقدمي الخدمة (بعد إنشاء الطلب) ═════════ */
  matchProviders(reqId){ return HSCustomerProvidersPage.matches({ ...providersCtx(), reqId }); },

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
    document.querySelectorAll('#sheet [data-star]').forEach(b => { b.classList.toggle('on', +b.dataset.star <= +d.star); b.setAttribute('aria-pressed', String(+b.dataset.star === +d.star)); });
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
    chooseProviderManually(d.chooseProvider, d.chooseReq || '', t);
    return;
  }
  if (d.favProvider) {
    e.preventDefault(); e.stopPropagation();
    const u = me(); if (!u) return toast('سجّل بياناتك أولاً');
    apiCall('fav:' + d.favProvider, t, () => HSCustomerApi.toggleFavorite('provider', d.favProvider), res => {
      const on = !!res.data.favorite;
      t.classList.toggle('on', on); t.setAttribute('aria-pressed', on ? 'true' : 'false');
      toast(on ? 'أُضيف للمفضلة' : 'أُزيل من المفضلة');
    });
    return;
  }
  if (d.providerServiceRequest) {
    e.preventDefault(); e.stopPropagation();
    if (typeof startRequest === 'function') startRequest(d.providerServiceRequest);
    return;
  }

  /* data-act */
  switch (d.act) {
    /* Marketplace mutations go through the API adapters (services/*-api.js); MP stays the local read model. */
    case 'custConfirm':
      apiCall('confirm:' + d.id, t, () => HSOrdersApi.schedule(d.id), () => { show('tracking', d.id); toast('تم الاتفاق على الموعد'); });
      break;
    case 'custClose':
      apiCall('close:' + d.id, t, () => HSOrdersApi.close(d.id), () => { show('tracking', d.id); toast('تم إغلاق الطلب'); });
      break;
    case 'cancelReq':
      askSheet({ id: d.id, kind: 'cancel', title: 'إلغاء الطلب', text: 'هل تريد إلغاء الطلب؟ لا يمكن التراجع.', reasonLabel: 'سبب الإلغاء (اختياري)', confirmLabel: 'تأكيد الإلغاء' });
      break;
    case 'rate': openRateSheet(d.id); break;
    case 'complain': openComplainSheet(d.id); break;
    case 'approveQuote':
      apiCall('approve:' + d.id, t, () => HSQuotesApi.approve(d.id), () => { show('tracking', d.id); toast('تمت الموافقة على السعر — سينفّذ مقدم الخدمة ثم يسجّل الإكمال'); });
      break;
    /* الخدمة المجانية: مسار مستقل عن عروض الأسعار (لا عرض سعر بقيمة صفر) */
    case 'acceptFree':
      apiCall('free:' + d.id, t, () => HSQuotesApi.respondFree(d.id, true), () => { show('tracking', d.id); toast('وافقت على تنفيذ الخدمة مجانًا'); });
      break;
    case 'declineFree':
      apiCall('free:' + d.id, t, () => HSQuotesApi.respondFree(d.id, false), () => { show('tracking', d.id); toast('تم رفض الخدمة المجانية — يمكن لمقدم الخدمة إرسال عرض سعر'); });
      break;
    case 'rejectQuote':
      askSheet({ id: d.id, kind: 'rejectQuote', title: 'رفض عرض السعر', text: 'سيتمكن مقدم الخدمة من إرسال عرض معدّل.', reasonLabel: 'سبب الرفض (اختياري)', confirmLabel: 'تأكيد الرفض' });
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
          /* Requests without a catalogue item (e.g. created outside the wizard) resume at item selection instead of crashing the problem step. */
          WZ.step = r.itemId && CAT.item(r.itemId) ? 2 : (r.cat && CAT.category(r.cat) ? 1 : 0);
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
      apiCall('expand:' + d.id, t, () => HSOrdersApi.chooseProvider(r.id, p.id), () => { show('tracking', d.id); toast('تم توسيع نطاق البحث — أُرسل الطلب إلى ' + p.name); });
      break;
    }
    /* 2026-11-14: the customer-side «محاكاة التقدّم» controls (simAdvance/simQuote) were removed — they let the
       customer perform provider-only transitions. Progress now comes only from the Provider app on the shared store. */
  }
});

/* ═════════ اختيار مزود يدويًا ═════════ */
/* reqId comes from the matches screen (data-choose-req). From the directory there is no request in context: use the
   customer's own single unassigned request in the provider's category, otherwise start a new request in that category
   (previously it silently assigned whichever unassigned request came first, possibly someone else's). */
function chooseProviderManually(providerId, reqId, control) {
  const u = me(); if (!u) { toast('سجّل بياناتك أولاً'); return; }
  const p = MP.get('providers', providerId); if (!p) return;
  let id = reqId;
  if (!id) {
    const own = MP.reqs().filter(x => x.customerId === u.id && ['searching','received'].includes(x.status) && (p.cats || []).includes(x.cat));
    if (own.length === 1) id = own[0].id;
    else { if (typeof startRequest === 'function') startRequest((p.cats || [])[0]); toast('ابدأ طلبًا جديدًا ثم اختر ' + p.name); return; }
  }
  apiCall('choose:' + id, control, () => HSOrdersApi.chooseProvider(id, providerId), res => { show('tracking', id); toast('تم إرسال الطلب إلى ' + (res.data.providerName || p.name)); });
}

/* ═════════ API calls from Customer screens ═════════
   apiCall(key, control, request, onOk, onFail?): one in-flight request per key (repeat clicks/Enter ignored), the
   control is disabled + aria-busy while waiting; failures show the envelope's message (401 → sign-in prompt). */
const _apiInFlight = new Set();
function apiErrorText(res) {
  if (res && res.status === 401) return 'سجّل الدخول لإتمام هذا الإجراء';
  return (res && res.error && res.error.message) || 'تعذر تنفيذ الإجراء. حاول مرة أخرى.';
}
async function apiCall(key, control, request, onOk, onFail) {
  if (_apiInFlight.has(key)) return;
  _apiInFlight.add(key);
  const busy = on => { if (control && typeof control.setAttribute === 'function') { try { control.disabled = on; if (on) control.setAttribute('aria-busy', 'true'); else control.removeAttribute('aria-busy'); } catch {} } };
  busy(true);
  try {
    const res = await request();
    if (res && res.ok) onOk(res);
    else if (onFail) onFail(res); else toast(apiErrorText(res));
  } catch { if (onFail) onFail(null); else toast(apiErrorText(null)); }
  finally { _apiInFlight.delete(key); busy(false); }
}

/* Accessible confirmation (replaces native confirm()/prompt()): a labelled form inside the focus-managed sheet. */
function askSheet(o) {
  sheet(`<h4 id="ask-title">${esc(o.title)}</h4><div class="sub">${esc(o.text)}</div>
    <form class="form" id="askForm" data-id="${esc(o.id)}" data-kind="${esc(o.kind)}" aria-labelledby="ask-title">
      ${o.reasonLabel ? `<div><label for="ask-reason">${esc(o.reasonLabel)}</label><textarea id="ask-reason" name="reason" maxlength="300"></textarea></div>` : ''}
      <div class="row2"><button class="cta" type="submit">${esc(o.confirmLabel)}</button><button class="cta ghost" type="button" data-act="askCancel">تراجع</button></div>
    </form>`);
}
document.addEventListener('click', e => { if (e.target.closest('[data-act="askCancel"]')) closeSheet(); });

/* ═════════ شيت التقييم (V7) ═════════ */
function openRateSheet(reqId) {
  const r = MP.get('serviceRequests', reqId);
  if (!r) return;
  sheet(`<h4>${ic('medal')} قيّم مقدم الخدمة</h4><div class="sub">#${esc(r.no)} — ${esc(r.serviceName)}</div>
    <div class="stars-in" role="group" aria-label="عدد النجوم">${[1,2,3,4,5].map(n=>`<button type="button" data-star="${n}" aria-pressed="false" aria-label="${n} من 5 نجوم">${ic('star')}</button>`).join('')}</div>
    <form class="form" id="rvForm" data-id="${reqId}"><input type="hidden" id="rv-stars" name="stars" value="0">
      <div><label for="rv-quality">جودة التنفيذ</label><select id="rv-quality" name="quality"><option>ممتازة</option><option>جيدة</option><option>مقبولة</option><option>ضعيفة</option></select></div>
      <div><label for="rv-comment">تعليق</label><textarea id="rv-comment" name="comment" placeholder="اكتب تجربتك (اختياري)" maxlength="500"></textarea></div>
      <div><span class="lbl-like" id="rv-photos-lbl">صور (اختياري)</span><div class="thumbs" id="rv-thumbs" role="list" aria-labelledby="rv-photos-lbl"></div>
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
      <div><label for="cmp-kind">نوع الشكوى</label>
        <select id="cmp-kind" name="kind">
          <option value="quality">جودة الخدمة</option>
          <option value="delay">تأخر في الموعد</option>
          <option value="price">خلاف على السعر</option>
          <option value="behavior">سلوك غير لائق</option>
          <option value="other">أخرى</option>
        </select>
      </div>
      <div><label for="cmp-text">تفاصيل الشكوى</label><textarea id="cmp-text" name="text" required minlength="10" maxlength="1000" placeholder="اشرح ما حدث بالتفصيل"></textarea></div>
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
    const id = f.dataset.id;
    /* quality + photo attachment ids travel with the review (stored by the review route, local or Firebase) */
    const extra = { quality: d.get('quality') || undefined, attachments: _rvPhotos.map(x => x.id) };
    apiCall('review:' + id, f.querySelector('[type=submit]'), () => HSOrdersApi.review(id, s, String(d.get('comment') || ''), extra), () => {
      _rvPhotos = [];
      closeSheet();
      show('tracking', id);
      toast('شكرًا على تقييمك');
    });
  }
  if (f.id === 'cmpForm') {
    e.preventDefault();
    const d = new FormData(f);
    apiCall('complain:' + f.dataset.id, f.querySelector('[type=submit]'), () => HSSupportApi.file(String(d.get('text') || ''), f.dataset.id, d.get('kind')), () => { closeSheet(); toast('تم تسجيل شكواك'); });
  }
  if (f.id === 'askForm') {
    e.preventDefault();
    const id = f.dataset.id, reason = String(new FormData(f).get('reason') || '').trim(), btn = f.querySelector('[type=submit]');
    if (f.dataset.kind === 'cancel') apiCall('cancel:' + id, btn, () => HSOrdersApi.cancel(id, reason || 'ألغاه العميل'), () => { closeSheet(true); show('tracking', id); toast('تم إلغاء الطلب'); });
    if (f.dataset.kind === 'logout') { HSCustomerSession.signOut(); closeSheet(true); if (typeof state !== 'undefined') state.accountTab = 'orders'; show('account'); toast('تم تسجيل الخروج'); return; }
    if (f.dataset.kind === 'addrRemove') apiCall('addr-rm:' + id, btn, () => HSCustomerApi.removeAddress(id), () => { closeSheet(true); show('addresses'); toast('تم حذف العنوان'); });
    if (f.dataset.kind === 'rejectQuote') apiCall('reject:' + id, btn, () => HSQuotesApi.reject(id, reason), () => { closeSheet(true); show('tracking', id); toast('تم رفض العرض — يمكن للفني إرسال عرض معدّل'); });
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
