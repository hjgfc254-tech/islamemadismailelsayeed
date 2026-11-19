/**
 * Customer Order Details / Tracking page renderer.
 * Receives the existing local marketplace adapter and presentation helpers explicitly.
 * This module renders only; event handling, persistence and workflow transitions stay in market-ui.page.js.
 */
'use strict';
(function(root){
  const REQUIRED=["id", "MP", "head", "demoBanner", "uiOfflineIfNeeded", "uiEmpty", "esc", "ic", "icStatus", "STATUS_LABEL", "money", "fmtDT", "statusTimeline", "uiSuccess", "starsHtml"];
  const render=(ctx={})=>{
    const missing=REQUIRED.filter(k=>ctx[k]===undefined || ctx[k]===null);
    if(missing.length) throw new Error('HSCustomerOrderDetailsPage: missing dependencies: '+missing.join(', '));
    const {id,MP,head,demoBanner,uiOfflineIfNeeded,uiEmpty,esc,ic,icStatus,STATUS_LABEL,money,fmtDT,statusTimeline,uiSuccess,starsHtml}=ctx;

    const r = MP.get('serviceRequests', id);
    if (!r && ctx.loading) return `<div class="screen">${head('متابعة الطلب', true)}<div aria-busy="true" aria-label="جارٍ تحميل الطلب"><div class="sk sk-bar"></div><div class="sk-card"><span class="sk sk-line w60"></span><span class="sk sk-line w80"></span><span class="sk sk-line w40"></span></div><div class="sk-card"><span class="sk sk-line w80"></span><span class="sk sk-line w60"></span></div></div></div>`;
    if (!r) return `<div class="screen">${head('متابعة الطلب', true)}${uiEmpty('list','الطلب غير موجود')}</div>`;
    const p = MP.providerOf(id);
    const as = MP.activeAssignment(id);
    const cancelled = r.status === 'cancelled';
    const failed = r.status === 'failed';
    const closed = r.status === 'closed';
    const rev = MP.db().reviews.find(v => v.reqId === id);
    const quote = MP.currentQuote(id);
    const inProgress = ['accepted','scheduled','enroute','arrived','started'].includes(r.status);
    const canCancel = ['received', 'searching', 'sent', 'accepted', 'scheduled', 'enroute', 'arrived'].includes(r.status);   /* free until the provider is on the way, then the admin's travel fee */   /* free cancellation until a provider accepts (the store refuses later anyway) */
    const canComplain = !cancelled && !failed;

    /* عنوان الحالة */
    const nextStepCopy = ({
      received:'تم استلام طلبك. ستبدأ المنصة البحث عن مقدم خدمة مناسب.',
      searching:'يجري البحث عن مقدم خدمة مناسب لطلبك.',
      sent:'تم إرسال الطلب إلى مقدم الخدمة. انتظر رده.',
      accepted:'راجع اقتراح الموعد إن وُجد، أو انتظر تأكيد مقدم الخدمة.',
      scheduled:'تم تأكيد الموعد. تابع تحديثات مقدم الخدمة قبل الزيارة.',
      enroute:'مقدم الخدمة سجّل أنه في الطريق إليك.',
      arrived:'مقدم الخدمة سجّل الوصول. يمكنك متابعة بدء تنفيذ الخدمة.',
      started:'الخدمة قيد التنفيذ. قد يصلك عرض سعر إذا احتاج العمل ذلك.',
      quote:'هناك عرض سعر ينتظر قرارك. راجعه قبل الموافقة أو الرفض.',
      completed:'سجّل مقدم الخدمة إتمام العمل. أكّد الإتمام إذا كانت الخدمة قد انتهت.',
      closed:'تم إغلاق الطلب. يمكنك الرجوع إلى تفاصيله وتقييم الخدمة إن كان متاحًا.',
      cancelled:'تم إلغاء هذا الطلب.',
      failed:'تعذر تنفيذ هذا الطلب.'
    })[r.status] || 'تابع سجل الطلب لمعرفة آخر تحديث.';
    const statusBar = failed
      ? `<div class="need warn">${ic('st-failed')}<span>${STATUS_LABEL.failed}${r.failureReason?` — ${esc(r.failureReason)}`:''}</span></div>`
      : cancelled
      ? `<div class="need warn">${ic('st-cancelled')}<span>${STATUS_LABEL.cancelled}${r.cancelReason?` — ${esc(r.cancelReason)}`:''}</span></div>`
      : `<div class="need">${ic(icStatus(r.status),'live')}<span><b>${STATUS_LABEL[r.status]||''}</b></span></div>`;

    /* مراحل الطلب (شريط مرئي مختصر فوق السجل الزمني التفصيلي) */
    const STAGES = [['استلمنا طلبك','st-new',['received','searching','sent']],['تم القبول','st-accepted',['accepted','scheduled']],['في الطريق','st-enroute',['enroute']],['جاري التنفيذ','st-working',['arrived','started','quote']],['تم','st-done',['completed','closed']]];
    const stageNow = STAGES.findIndex(s => s[2].includes(r.status));
    const journey = (cancelled || failed || stageNow < 0) ? '' : `<ol class="journey" aria-label="مراحل الطلب — المرحلة الحالية: ${STAGES[stageNow][0]}">${STAGES.map((s,i)=>`<li class="${i<stageNow?'is-done':i===stageNow?'is-now':''}"><i>${ic(i<stageNow?'tick':s[1])}</i><span>${s[0]}</span></li>`).join('')}</ol>`;

    /* بيانات المزود / البحث */
    const rating = p && Number(p.rating) > 0 ? Number(p.rating) : 0;
    const providerBlock = p
      ? `<div class="prov-inline prov-card glass neon">
          <div class="prov-avatar" aria-hidden="true" style="background:${p.avatar||'#FF3D8F'}">${esc((p.name||'?').split(' ').map(w=>w[0]).slice(0,2).join(''))}</div>
          <div class="prov-head"><b>${esc(p.name)}${p.status==='approved'?` <span class="verified">${ic('shield')} موثّق</span>`:''}</b><small>${p.cats.map(c=>MP.catName(c)).join('، ')}${p.demo?' • محاكاة':''}</small>
            ${rating || p.jobs ? `<small class="prov-stats">${rating?`${starsHtml(rating)} <b>${(+rating).toLocaleString('ar-EG',{minimumFractionDigits:1,maximumFractionDigits:1})}</b>`:''}${rating && p.jobs?' • ':''}${p.jobs?`${(+p.jobs).toLocaleString('ar-EG')} خدمة منجزة`:''}</small>`:''}</div>
          <button class="tag" data-provider-details="${esc(p.id)}">${ic('info')} التفاصيل</button>
        </div>`
      : as
      ? `<div class="need">${ic('clock')}<span>بانتظار ردّ ${esc((MP.get('providers',as.providerId)||{}).name||'مقدم الخدمة')}</span></div>`
      : r.status === 'searching'
      ? `<div class="need">${ic('search')}<span>جارٍ البحث عن مقدم خدمة…</span></div>`
      : '';

    /* upfront price (Uber model): fixed at booking */
    const priceBlock = r.pricing && r.pricing.customerPrice ? `<div class="need">${ic('wallet')}<span>السعر المحدد عند الطلب: <b>${money(r.pricing.customerPrice)}</b> — شامل رسوم المنصة</span></div>` : '';
    /* عرض السعر */
    const quoteBlock = quote && quote.status === 'pending'
      ? `<div class="card2 glass neon" style="border-color:rgba(255,61,143,.5)">
          <div class="top"><b>${ic('st-quote')} عرض سعر من مقدم الخدمة</b><span class="tag">بانتظار موافقتك</span></div>
          ${quote.customerTotal ? `<div class="quote-row"><span>تعديل السعر بعد المعاينة (شامل رسوم المنصة)</span></div>` : `<div class="quote-row"><span>المصنعية</span><b>${money(quote.labor)}</b></div>
          ${quote.parts?`<div class="quote-row"><span>قطع الغيار</span><b>${money(quote.parts)}</b></div>`:''}
          ${quote.visitFee?`<div class="quote-row"><span>رسوم المعاينة</span><b>${money(quote.visitFee)}</b></div>`:''}
          ${quote.discount?`<div class="quote-row" style="color:#6ee7b7"><span>خصم</span><b>- ${money(quote.discount)}</b></div>`:''}`}
          <div class="quote-row total"><span>الإجمالي</span><b>${money(quote.customerTotal || quote.total)}</b></div>
          ${globalThis.HSOffers ? HSOffers.quoteDiff(r, quote) : ''}
          ${quote.note?`<small>${esc(quote.note)}</small>`:''}
          <div class="acts">
            <button class="pri" data-act="approveQuote" data-id="${id}">${ic('check')} موافقة</button>
            <button class="bad" data-act="rejectQuote" data-id="${id}">${ic('cancel')} رفض</button>
          </div>
        </div>`
      : quote && quote.status === 'approved'
      ? `<div class="need" style="color:#6ee7b7">${ic('check')}<span>تمت الموافقة على عرض السعر — ${money(quote.customerTotal || quote.total)}</span></div>`
      : '';

    /* الخدمة المجانية — مسار مستقل: اقتراح من مقدم الخدمة ← موافقة/رفض العميل ← إكمال بلا مقابل */
    const fsv = r.freeService, freeReason = fsv ? ((MP.FREE_REASONS || {})[fsv.reason] || '') : '';
    const freeBlock = !fsv ? ''
      : fsv.status === 'proposed'
      ? `<div class="card2 glass neon">
          <div class="top"><b>${ic('medal')} عرض تنفيذ الخدمة مجانًا</b><span class="tag">بانتظار موافقتك</span></div>
          <small>السبب: ${esc(freeReason)}. لن يُطلب منك أي مبلغ مقابل هذه الخدمة، ولن يُرسل عرض سعر.</small>
          <div class="acts">
            <button class="pri" data-act="acceptFree" data-id="${id}">${ic('check')} موافقة</button>
            <button class="bad" data-act="declineFree" data-id="${id}">${ic('cancel')} رفض</button>
          </div>
        </div>`
      : fsv.status === 'accepted' ? `<div class="need" style="color:#6ee7b7">${ic('check')}<span>تم الاتفاق على تنفيذ الخدمة مجانًا (${esc(freeReason)})</span></div>`
      : fsv.status === 'completed' ? `<div class="need">${ic('check')}<span>خدمة مجانية — اكتملت بدون مقابل</span></div>`
      : `<div class="need">${ic('info')}<span>رفضت الخدمة المجانية؛ قد يرسل مقدم الخدمة عرض سعر.</span></div>`;

    /* الموعد المقترح */
    const proposalBlock = r.status === 'accepted' && r.proposal
      ? `<div class="need warn">${ic('clock')}<span>مقدم الخدمة اقترح الموعد: <b>${fmtDT(r.proposal.at)}</b></span></div>
         <button class="cta" data-act="custConfirm" data-id="${id}">${ic('check')} موافقة على الموعد المقترح</button>`
      : r.status === 'accepted' && !r.proposal
      ? `<div class="need">${ic('info')}<span>بانتظار تأكيد مقدم الخدمة للموعد.</span></div>`
      : r.agreedAt
      ? `<div class="need">${ic('calendar')}<span>الموعد المتفق عليه: <b>${fmtDT(r.agreedAt)}</b></span></div>`
      : '';

    /* معلومات الطلب */
    const sum = `<div class="sumbox glass neon">
      <div><small>الخدمة</small><b>${esc(r.catName||MP.catName(r.cat))} — ${esc(r.serviceName)}</b></div>
      ${r.finalValue != null ? `<div><small>القيمة النهائية</small><b>${money(r.finalValue)}</b></div>` : (r.agreedValue != null ? `<div><small>السعر المتفق عليه</small><b>${money(r.agreedValue)}</b></div>` : '')}
      ${r.preferredPeriod || r.when ? `<div><small>الموعد المفضل</small><b>${esc(r.when || 'مرن')}${r.preferredPeriod?` — ${({morning:'صباحًا',noon:'ظهرًا',evening:'مساءً'})[r.preferredPeriod]||r.preferredPeriod}`:''}</b></div>` : ''}
      ${r.flexible ? `<div><small>مرونة الموعد</small><b>مرن</b></div>` : ''}
      <div><small>المكان</small><b>${esc(r.gov)} — ${esc(r.area)}${r.addr ? ' — '+esc(r.addr) : ''}</b></div>
      ${r.desc ? `<div><small>وصف المشكلة</small><b>${esc(r.desc)}</b></div>` : ''}
      ${r.note || r.notes ? `<div><small>ملاحظات</small><b>${esc(r.note || r.notes)}</b></div>` : ''}
      ${r.answers && Object.keys(r.answers).length ? `<div><small>إجابات التشخيص</small>${Object.entries(r.answers).map(([k,v])=>`<b>${esc(k)}: ${esc(v)}</b>`).join('')}</div>` : ''}
      ${r.photos && r.photos.some(src=>typeof src==='string' && /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(src)) ? `<div><small>صور مرفقة</small><div class="thumbs">${r.photos.filter(src=>typeof src==='string' && /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(src)).slice(0,4).map(src=>`<span class="th"><img src="${src}" alt="صورة مرفقة بالطلب" loading="lazy"></span>`).join('')}</div></div>` : ''}
    </div>`;

    const T = root.HSTrust || null;   /* round 8 trust blocks (arrival code, warranty, tip, photos, read receipts) */
    /* ── round 5: arrival estimate, chat, discount / package notes ── */
    const etaBlock = r.status === 'enroute' && r.etaAt ? (() => {
      const at = new Date(r.etaAt); if (Number.isNaN(at.getTime())) return '';
      const mins = Math.round((at.getTime() - Date.now()) / 60000);
      const t = at.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
      return `<div class="eta-card" role="status">${ic('clock')}<span><b>${mins > 1 ? `هيوصل خلال حوالي ${mins} دقيقة` : 'المفروض يوصل دلوقتي'}</b><small>حوالي الساعة ${esc(t)} — تقدير الفني وقت ما اتحرك</small></span></div>`;
    })() : '';
    const chat = Array.isArray(r.chat) ? r.chat : [];
    const chatOpen = !!p && !['cancelled', 'failed', 'closed'].includes(r.status);
    const chatBlock = p && (chatOpen || chat.length) ? `<section class="chat-box glass neon" aria-labelledby="chat-h">
      <h2 class="sec-title" id="chat-h">${ic('chat')}رسائل مع ${esc(String(p.name || '').split(' ')[0])}</h2>
      <ol class="chat-list">${chat.length ? chat.slice(-60).map((m, i, arr) => `<li class="cm ${m.by === 'customer' ? 'me' : 'them'}"><p>${esc(m.text)}</p><time>${fmtDT(m.at)}</time>${T && m.by === 'customer' && i === arr.length - 1 ? T.seenLabel(r, m, 'customer') : ''}</li>`).join('') : '<li class="cm-empty">ابعت للفني أي تفاصيل، أو اسأله عن حاجة قبل الزيارة.</li>'}</ol>
      <p class="chat-typing" hidden aria-live="polite"><i></i><i></i><i></i> الفني بيكتب</p>
      ${chatOpen ? `<form class="chat-form" id="chatForm" data-id="${esc(id)}"><label class="sr-only" for="chat-text">اكتب رسالة للفني</label><input id="chat-text" name="text" maxlength="500" autocomplete="off" placeholder="اكتب رسالتك…" required><button class="cta" type="submit" aria-label="إرسال">${ic('send')}</button></form>` : ''}
    </section>` : '';
    const promoBlock = r.promo ? `<div class="need promo-note">${ic('wallet')}<span>${r.discount ? `اتخصم <b>${money(r.discount)}</b> ${r.promo.kind === 'credit' ? 'من رصيدك' : `(${esc(r.promo.code)})`}` : `عندك خصم ${r.promo.kind === 'credit' ? 'من رصيدك' : `بكود <b>${esc(r.promo.code)}</b>`} — بيتحسب على المبلغ لما الخدمة تخلص`}</span></div>` : '';
    const pkgBlock = r.packageName ? `<div class="need">${ic('calendar')}<span>الطلب ده ضمن باقة <b>${esc(r.packageName)}</b> — الفني بيتفق معاك على مواعيد الزيارات.</span></div>` : '';
    const tx = (MP.db().transactions || []).find(t => t.reqId === id);

    /* أزرار الإجراء */
    const actions = [];
    if (r.status === 'completed' && !closed) {
      actions.push(`<button class="cta" data-act="custClose" data-id="${id}">${ic('check')} تأكيد إتمام الخدمة</button>`);
    }
    if (closed && !rev) {
      actions.push(`<button class="cta" data-act="rate" data-id="${id}">${ic('medal')} قيّم مقدم الخدمة</button>`);
    }
    if (rev) {
      actions.push(uiSuccess('star', `تقييمك: ${starsHtml(rev.stars)}`));
    }
    if (r.status === 'searching' && !r.bidding) {   /* in an offers round the customer chooses among the offers instead */
      actions.push(`<button class="cta ghost" data-act="viewMatches" data-id="${id}">${ic('search')} عرض مقدمي الخدمة المتاحين</button>`);
    }
    if (canCancel) {
      actions.push(`<button class="cta ghost" data-act="cancelReq" data-id="${id}">${ic('cancel')} إلغاء الطلب</button>`);
    }
    if (p && inProgress) {
      actions.push(`<button class="cta ghost" data-act="shareReq" data-id="${id}">${ic('share')} شارك تفاصيل الطلب مع حد من أهلك</button>`);
    }
    if (tx && ['completed', 'closed'].includes(r.status)) {
      actions.push(`<button class="cta ghost" data-act="receipt" data-id="${id}">${ic('book')} الفاتورة</button>`);
    }
    if (closed && p && p.status === 'approved') {
      actions.push(`<button class="cta ghost" data-act="sameProvider" data-id="${id}" data-pid="${esc(p.id)}">${ic('user')} اطلب ${esc(String(p.name || '').split(' ')[0])} تاني</button>`);
    }
    if (closed || cancelled || failed) {
      actions.push(`<button class="cta ghost" data-repeat="${id}">${ic('send')} اطلبها تاني</button>`);
    }
    if (canComplain) {
      actions.push(`<button class="cta ghost" data-act="complain" data-id="${id}">${ic('warn')} تقديم شكوى</button>`);
    }

    /* Progress is driven by the provider from the Provider app (shared store); the customer has no provider-side controls. */
    const sim = (!cancelled && !failed && !closed && !['completed'].includes(r.status)) ? `<div class="demo-banner" style="margin-top:14px">${ic('info')}<span>يحدّث مقدم الخدمة حالة الطلب من تطبيقه.</span></div>` : '';

    return `<div class="screen">${head('متابعة الطلب #'+esc(r.no), true)}${demoBanner()}
      ${uiOfflineIfNeeded()}
      ${journey}
      ${statusBar}
      ${T ? T.arrivalCard(r) : etaBlock}
      ${T ? T.warrantyStrip(r) + (T.warrantyCert ? T.warrantyCert(r) : '') : ''}
      ${root.HSOffers ? root.HSOffers.block(r) + root.HSOffers.cashCard(r) : ''}
      ${r.warrantyOf ? `<div class="need promo-note">${ic('shield')}<span>طلب ضمان — مش هتدفع حاجة على المصنعية.</span></div>` : ''}
      <div class="need tracking-next">${ic('info')}<span><b>الخطوة التالية</b><br>${esc(nextStepCopy)}</span></div>
      ${providerBlock}
      ${T && p ? T.tagChips(p.id, 3) : ''}
      ${chatBlock}
      <h2 class="sec-title">${ic('clock')}مسار الطلب</h2>
      ${statusTimeline(r)}
      ${proposalBlock}
      ${freeBlock}
      ${priceBlock}${quoteBlock}
      ${promoBlock}${pkgBlock}
      ${T ? T.photosSlot(r) : ''}
      <h2 class="sec-title">${ic('info')}التفاصيل</h2>
      ${sum}
      ${T ? T.tipCard(r) : ''}
      <div class="plist" style="margin-top:12px;gap:8px">${actions.join('')}</div>
      ${sim}
    </div>`;
  
  };
  root.HSCustomerOrderDetailsPage=Object.freeze({render,dependencies:REQUIRED.slice()});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.HSCustomerOrderDetailsPage;
})(typeof globalThis!=='undefined'?globalThis:this);
