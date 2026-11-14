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
    if (!r) return `<div class="screen">${head('متابعة الطلب', true)}${uiEmpty('list','الطلب غير موجود')}</div>`;
    const p = MP.providerOf(id);
    const as = MP.activeAssignment(id);
    const cancelled = r.status === 'cancelled';
    const failed = r.status === 'failed';
    const closed = r.status === 'closed';
    const rev = MP.db().reviews.find(v => v.reqId === id);
    const quote = MP.currentQuote(id);
    const inProgress = ['accepted','scheduled','enroute','arrived','started'].includes(r.status);
    const canCancel = !cancelled && !failed && !closed && !inProgress;
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

    /* بيانات المزود / البحث */
    const providerBlock = p
      ? `<div class="prov-inline glass neon">
          <div class="prov-avatar" style="background:${p.avatar||'#FF3D8F'}">${esc((p.name||'?').split(' ').map(w=>w[0]).slice(0,2).join(''))}</div>
          <div class="prov-head"><b>${esc(p.name)}</b><small>${p.cats.map(c=>MP.catName(c)).join('، ')}${p.demo?' • محاكاة':''}</small></div>
          <button class="tag" data-provider-details="${esc(p.id)}">${ic('info')} التفاصيل</button>
        </div>`
      : as
      ? `<div class="need">${ic('clock')}<span>بانتظار ردّ ${esc((MP.get('providers',as.providerId)||{}).name||'مقدم الخدمة')}</span></div>`
      : r.status === 'searching'
      ? `<div class="need">${ic('search')}<span>جارٍ البحث عن مقدم خدمة…</span></div>`
      : '';

    /* عرض السعر */
    const quoteBlock = quote && quote.status === 'pending'
      ? `<div class="card2 glass neon" style="border-color:rgba(255,61,143,.5)">
          <div class="top"><b>${ic('st-quote')} عرض سعر من مقدم الخدمة</b><span class="tag">بانتظار موافقتك</span></div>
          <div class="quote-row"><span>المصنعية</span><b>${money(quote.labor)}</b></div>
          ${quote.parts?`<div class="quote-row"><span>قطع الغيار</span><b>${money(quote.parts)}</b></div>`:''}
          ${quote.visitFee?`<div class="quote-row"><span>رسوم المعاينة</span><b>${money(quote.visitFee)}</b></div>`:''}
          ${quote.discount?`<div class="quote-row" style="color:#6ee7b7"><span>خصم</span><b>- ${money(quote.discount)}</b></div>`:''}
          <div class="quote-row total"><span>الإجمالي</span><b>${money(quote.total)}</b></div>
          ${quote.note?`<small>${esc(quote.note)}</small>`:''}
          <div class="acts">
            <button class="pri" data-act="approveQuote" data-id="${id}">${ic('check')} موافقة</button>
            <button class="bad" data-act="rejectQuote" data-id="${id}">${ic('cancel')} رفض</button>
          </div>
        </div>`
      : quote && quote.status === 'approved'
      ? `<div class="need" style="color:#6ee7b7">${ic('check')}<span>تمت الموافقة على عرض السعر — ${money(quote.total)}</span></div>`
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
      ${r.finalValue != null ? `<div><small>القيمة النهائية</small><b>${money(r.finalValue)}</b></div>` : ''}
      ${r.preferredPeriod || r.when ? `<div><small>الموعد المفضل</small><b>${esc(r.when || 'مرن')}${r.preferredPeriod?` — ${({morning:'صباحًا',noon:'ظهرًا',evening:'مساءً'})[r.preferredPeriod]||r.preferredPeriod}`:''}</b></div>` : ''}
      ${r.flexible ? `<div><small>مرونة الموعد</small><b>مرن</b></div>` : ''}
      <div><small>المكان</small><b>${esc(r.gov)} — ${esc(r.area)}${r.addr ? ' — '+esc(r.addr) : ''}</b></div>
      ${r.desc ? `<div><small>وصف المشكلة</small><b>${esc(r.desc)}</b></div>` : ''}
      ${r.note || r.notes ? `<div><small>ملاحظات</small><b>${esc(r.note || r.notes)}</b></div>` : ''}
      ${r.answers && Object.keys(r.answers).length ? `<div><small>إجابات التشخيص</small>${Object.entries(r.answers).map(([k,v])=>`<b>${esc(k)}: ${esc(v)}</b>`).join('')}</div>` : ''}
      ${r.photos && r.photos.some(src=>typeof src==='string' && /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(src)) ? `<div><small>صور مرفقة</small><div class="thumbs">${r.photos.filter(src=>typeof src==='string' && /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(src)).slice(0,4).map(src=>`<span class="th"><img src="${src}" alt="صورة مرفقة بالطلب" loading="lazy"></span>`).join('')}</div></div>` : ''}
    </div>`;

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
    if (r.status === 'searching') {
      actions.push(`<button class="cta ghost" data-act="viewMatches" data-id="${id}">${ic('search')} عرض مقدمي الخدمة المتاحين</button>`);
    }
    if (canCancel) {
      actions.push(`<button class="cta ghost" data-act="cancelReq" data-id="${id}">${ic('cancel')} إلغاء الطلب</button>`);
    }
    if (canComplain) {
      actions.push(`<button class="cta ghost" data-act="complain" data-id="${id}">${ic('warn')} تقديم شكوى</button>`);
    }

    /* حالة "تجريبي: محاكاة التقدم" */
    const sim = (!cancelled && !failed && !closed) ? `<div class="demo-banner" style="margin-top:14px">${ic('info')}<span>يمكنك محاكاة تقدّم الطلب لتجربة الواجهات.</span></div>
      <div class="row2">
        <button class="cta ghost" style="margin:0" data-act="simAdvance" data-id="${id}">${ic('arrow')} الحالة التالية</button>
        <button class="cta ghost" style="margin:0" data-act="simQuote" data-id="${id}">${ic('st-quote')} عرض سعر</button>
      </div>` : '';

    return `<div class="screen">${head('متابعة الطلب #'+esc(r.no), true)}${demoBanner()}
      ${uiOfflineIfNeeded()}
      ${statusBar}
      <div class="need tracking-next">${ic('info')}<span><b>الخطوة التالية</b><br>${esc(nextStepCopy)}</span></div>
      ${providerBlock}
      <h2 class="sec-title">${ic('clock')}مسار الطلب</h2>
      ${statusTimeline(r)}
      ${proposalBlock}
      ${freeBlock}
      ${quoteBlock}
      <h2 class="sec-title">${ic('info')}التفاصيل</h2>
      ${sum}
      <div class="plist" style="margin-top:12px;gap:8px">${actions.join('')}</div>
      ${sim}
    </div>`;
  
  };
  root.HSCustomerOrderDetailsPage=Object.freeze({render,dependencies:REQUIRED.slice()});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.HSCustomerOrderDetailsPage;
})(typeof globalThis!=='undefined'?globalThis:this);
