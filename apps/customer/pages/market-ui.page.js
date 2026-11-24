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

const DEMO_NOTE = 'وضع تجريبي — الطلبات مش بتوصل لفنيين حقيقيين.';   /* one line: the page content leads */
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
/* V10: a mini five-stage progress line and a badge for what needs the customer now (same stages as tracking) */
const STAGE_OF = { received:0, searching:0, sent:0, accepted:1, scheduled:1, enroute:2, arrived:3, started:3, quote:3, completed:4, closed:4 };
function reqBadge(x) {
  const q = MP.currentQuote ? MP.currentQuote(x.id) : null;
  if ((q && q.status === 'pending') || (x.status === 'accepted' && x.proposal) || (x.freeService && x.freeService.status === 'proposed')) return ['محتاج قرارك', 'need'];
  if (x.status === 'completed') return ['أكّد الإتمام', 'need'];
  if (x.status === 'enroute') return ['في الطريق إليك', 'go'];
  if (x.status === 'closed' && !(MP.db().reviews || []).some(v => v.reqId === x.id)) return ['قيّم الخدمة', 'rate'];
  return null;
}
const reqCard = x => {
  const st = STAGE_OF[x.status], badge = reqBadge(x);
  const mini = st === undefined ? '' : `<span class="mj" aria-hidden="true">${[0,1,2,3,4].map(i => `<i class="${i < st ? 'd' : i === st ? 'n' : ''}"></i>`).join('')}</span>`;
  return `<button class="prow glass neon" data-track="${x.id}">
  ${icp(icStatus(x.status),'st')}
  <span class="tx">${esc(x.serviceName)}<small><bdi class="code">#${x.no}</bdi> • ${fmtDT(x.createdAt)}</small>${mini}</span>
  ${badge ? `<span class="rb rb-${badge[1]}">${badge[0]}</span>` : `<span class="tag ${x.status==='cancelled'||x.status==='failed'?'warn':''}">${ic(icStatus(x.status))} ${STATUS_LABEL[x.status]||''}</span>`}
</button>`;
};

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
      icStatus, STATUS_LABEL, money, fmtDT, statusTimeline, uiSuccess, starsHtml,
      loading: !!(globalThis.HSFirebaseConfig && HSFirebaseConfig.mode === 'firebase' && globalThis.HSBackend && !HSBackend.lastSync)
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
    const lbl = document.getElementById('rv-star-label'); if (lbl) lbl.textContent = RV_LABEL[+d.star] || '';
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
      askSheet({ id: d.id, kind: 'cancel', title: 'إلغاء الطلب', text: 'هل تريد إلغاء الطلب؟ لا يمكن التراجع.', reasonLabel: 'سبب الإلغاء (اختياري)', confirmLabel: 'تأكيد الإلغاء',
        chips: ['المشكلة اتحلت', 'لقيت فني تاني', 'الموعد مش مناسب', 'طلبت بالغلط', 'هغيّر تفاصيل الطلب'],
        policy: (() => { const rq = MP.get('serviceRequests', d.id) || {}, s = MP.db().settings || {}, fee = s.cancelFee != null && s.cancelFee !== '' ? +s.cancelFee : 50;
          return ['enroute', 'arrived'].includes(rq.status) && fee > 0 ? 'الفني اتحرك بالفعل — الإلغاء دلوقتي عليه رسوم انتقال ' + fee + ' ج.م بتروح للفني.' : 'الإلغاء مجاني طالما الفني لسه ما اتحركش.'; })() });
      break;
    case 'rate': openRateSheet(d.id); break;
    case 'rvDone': closeSheet(); break;
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
      ${o.chips && o.chips.length ? `<div class="chips ask-chips" role="group" aria-label="أسباب سريعة">${o.chips.map(c => `<button type="button" class="chip" data-ask-chip="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}</div>` : ''}
      ${o.reasonLabel ? `<div><label for="ask-reason">${esc(o.reasonLabel)}</label><textarea id="ask-reason" name="reason" maxlength="300"></textarea></div>` : ''}
      ${o.policy ? `<p class="ask-policy">${ic('info')}<span>${esc(o.policy)}</span></p>` : ''}
      <div class="row2"><button class="cta" type="submit">${esc(o.confirmLabel)}</button><button class="cta ghost" type="button" data-act="askCancel">تراجع</button></div>
    </form>`);
}
document.addEventListener('click', e => { if (e.target.closest('[data-act="askCancel"]')) closeSheet(); });

/* ═════════ شيت التقييم (V7) ═════════ */
const RV_TAGS = ['ملتزم بالموعد', 'شغله نضيف', 'أسعاره مناسبة', 'محترم في التعامل', 'سريع'];
const RV_LABEL = ['اضغط على النجوم', 'ضعيف', 'مقبول', 'جيد', 'جيد جدًا', 'ممتاز'];
document.addEventListener('click', e => {
  const t = e.target.closest('[data-rv-tag]'); if (!t) return;
  const on = t.getAttribute('aria-pressed') !== 'true'; t.setAttribute('aria-pressed', String(on)); t.classList.toggle('on', on);
});
function openRateSheet(reqId) {
  const r = MP.get('serviceRequests', reqId);
  if (!r) return;
  sheet(`<h4>${ic('medal')} قيّم مقدم الخدمة</h4><div class="sub">#${esc(r.no)} — ${esc(r.serviceName)}</div>
    <div class="stars-in" role="group" aria-label="عدد النجوم">${[1,2,3,4,5].map(n=>`<button type="button" data-star="${n}" aria-pressed="false" aria-label="${n} من 5 نجوم">${ic('star')}</button>`).join('')}</div>
    <p class="rv-star-label" id="rv-star-label" aria-live="polite">اضغط على النجوم</p>
    <div class="rv-tags" role="group" aria-label="اختيارات سريعة">${RV_TAGS.map(t=>`<button type="button" class="chip" data-rv-tag="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}</div>
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
    const tags = [...document.querySelectorAll('#sheet [data-rv-tag][aria-pressed="true"]')].map(b => b.dataset.rvTag);
    const comment = [tags.join('، '), String(d.get('comment') || '').trim()].filter(Boolean).join(' — ').slice(0, 500);
    apiCall('review:' + id, f.querySelector('[type=submit]'), () => HSOrdersApi.review(id, s, comment, extra), () => {
      _rvPhotos = [];
      closeSheet();
      show('tracking', id);
      /* a small celebration for a good rating (CSS only; off under reduced motion) */
      const confetti = s >= 4 ? `<div class="confetti" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="--k:${i}"></i>`).join('')}</div>` : '';
      sheet(`<div class="done glass neon success-pop" role="status" aria-live="polite">${confetti}
        <svg class="success-check" viewBox="0 0 52 52" aria-hidden="true" focusable="false"><circle cx="26" cy="26" r="23"/><path d="M15.5 27.5l7 7 14-15"/></svg>
        <h3>شكرًا على تقييمك</h3><p class="hint">رأيك بيساعد غيرك يختار الفني المناسب.</p>
        <button type="button" class="cta" data-act="rvDone">تم</button></div>`);
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
      loading: !!(globalThis.HSFirebaseConfig && HSFirebaseConfig.mode === 'firebase' && globalThis.HSBackend && !HSBackend.lastSync),
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

/* ═════════ round 5: chat, share, receipt, same provider ═════════ */
const isLiveBackend = () => typeof HSFirebaseConfig !== 'undefined' && HSFirebaseConfig.mode === 'firebase';
async function shareText(title, text) {
  try { if (navigator.share) { await navigator.share({ title, text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('اتنسخت التفاصيل — ابعتها لمين ما تحب'); } catch { toast('مش قادرين نشارك من الجهاز ده'); }
}
function requestShareText(r) {
  const p = MP.providerOf(r.id), L = typeof STATUS_LABEL !== 'undefined' ? STATUS_LABEL : {};
  const eta = r.status === 'enroute' && r.etaAt ? new Date(r.etaAt).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }) : '';
  return [`طلبي على هنصلحلك #${r.no} — ${r.serviceName}`,
    p ? `الفني: ${p.name}${p.status === 'approved' ? ' (موثّق من المنصة)' : ''}` : '',
    `الحالة: ${L[r.status] || r.status}`,
    r.agreedAt ? `الموعد: ${fmtDT(r.agreedAt)}` : '',
    eta ? `الوصول المتوقع: حوالي ${eta}` : '',
    `المنطقة: ${[r.gov, r.area].filter(Boolean).join(' — ')}`].filter(Boolean).join('\n');
}
function openReceipt(reqId) {
  const r = MP.get('serviceRequests', reqId), t = (MP.db().transactions || []).find(x => x.reqId === reqId);
  if (!r || !t) return;
  const p = MP.providerOf(reqId), gross = (+t.value || 0) + (+t.discount || 0);
  sheet(`<div class="receipt" id="receipt">
    <div class="rc-head"><b>هنصلحلك</b><small>إيصال خدمة</small></div>
    <dl>
      <div><dt>رقم الطلب</dt><dd>#${esc(r.no)}</dd></div>
      <div><dt>الخدمة</dt><dd>${esc(r.serviceName)}</dd></div>
      <div><dt>مقدم الخدمة</dt><dd>${esc(p ? p.name : '—')}</dd></div>
      <div><dt>التاريخ</dt><dd>${fmtDT(t.at)}</dd></div>
      ${t.free ? '<div><dt>النوع</dt><dd>خدمة مجانية</dd></div>' : ''}
      ${t.discount ? `<div><dt>قيمة الخدمة</dt><dd>${money(gross)}</dd></div><div><dt>الخصم</dt><dd>− ${money(t.discount)}</dd></div>` : ''}
      <div class="rc-total"><dt>الإجمالي</dt><dd>${money(t.value || 0)}</dd></div>
      <div><dt>طريقة الدفع</dt><dd>كاش لمقدم الخدمة</dd></div>
    </dl>
    <p class="rc-note">ملخص من بيانات الطلب على المنصة${isLiveBackend() ? '' : ' (بيانات تجريبية)'}.</p>
  </div>
  <div class="row2"><button class="cta" type="button" data-act="receiptPrint">${ic('book')} اطبع أو احفظ PDF</button><button class="cta ghost" type="button" data-act="receiptShare" data-id="${esc(reqId)}">${ic('share')} شارك</button></div>`);
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act="shareReq"],[data-act="receipt"],[data-act="receiptPrint"],[data-act="receiptShare"],[data-act="sameProvider"],[data-ask-chip]');
  if (!t) return;
  const d = t.dataset;
  if (d.askChip === undefined && !['shareReq', 'receipt', 'receiptPrint', 'receiptShare', 'sameProvider'].includes(d.act)) return;
  if (d.askChip !== undefined) { const ta = document.getElementById('ask-reason'); if (ta) { ta.value = d.askChip; ta.focus(); } t.closest('[role="group"]').querySelectorAll('[data-ask-chip]').forEach(b => { const on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); return; }
  e.preventDefault(); e.stopPropagation();
  if (d.act === 'shareReq') { const r = MP.get('serviceRequests', d.id); if (r) shareText('تفاصيل طلبي', requestShareText(r)); }
  else if (d.act === 'receipt') openReceipt(d.id);
  else if (d.act === 'receiptPrint') { document.documentElement.classList.add('print-receipt'); try { window.print(); } finally { setTimeout(() => document.documentElement.classList.remove('print-receipt'), 500); } }
  else if (d.act === 'receiptShare') { const el = document.getElementById('receipt'); if (el) shareText('إيصال هنصلحلك', el.innerText.replace(/\n{2,}/g, '\n')); }
  else if (d.act === 'sameProvider') {
    apiCall('same:' + d.id, t, () => HSOrdersApi.repeat(d.id, d.pid), res => {
      const p = MP.get('providers', d.pid), got = MP.providerOf(res.data.id) || MP.activeAssignment(res.data.id);
      const sameOne = got && (got.id === d.pid || got.providerId === d.pid);
      toast(sameOne ? `اتبعت الطلب لـ ${p ? p.name : 'نفس الفني'}` : 'اتعمل طلب جديد — الفني مش متاح دلوقتي، وهنلاقيلك فني تاني');
      show('tracking', res.data.id);
    });
  }
}, true);
document.addEventListener('submit', e => {
  const f = e.target; if (!f || f.id !== 'chatForm') return;
  e.preventDefault();
  const input = f.querySelector('#chat-text'), text = String(input && input.value || '').trim(); if (!text) return;
  apiCall('chat:' + f.dataset.id, f.querySelector('button[type="submit"]'), () => HSOrdersApi.message(f.dataset.id, text), () => {
    show('tracking', f.dataset.id);
    const box = document.querySelector('.chat-list'); if (box) box.lastElementChild && box.lastElementChild.scrollIntoView({ block: 'nearest' });
    const again = document.getElementById('chat-text'); if (again) try { again.focus({ preventScroll: true }); } catch {}
  });
});

