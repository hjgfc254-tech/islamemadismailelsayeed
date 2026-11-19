/**
 * MODULE: offers (HSOffers) — Customer side of the offers round (round 9): while nearby providers answer, the tracking
 * screen shows each offer (price with the platform share included, labor / parts, note, rating, jobs) and the customer
 * chooses one — or «اختارلي الأنسب» (best balance of price and rating). Inspection offers show the visit fee and that it
 * is deducted when the repair is approved. Classic script on the Customer app globals (MP, esc, ic, money, apiCall, show, toast).
 */
'use strict';
(function (root) {
  const minutesLeft = (r) => { const t = Date.parse(r.bidding && r.bidding.until); return Number.isFinite(t) ? Math.max(0, Math.round((t - Date.now()) / 60000)) : 0; };
  const waiting = (r) => r && r.bidding && !MP.providerOf(r.id) && ['received', 'searching', 'sent'].includes(r.status);
  const list = (r) => (typeof MP.offersFor === 'function' ? MP.offersFor(r.id) : []).filter((a) => a.status === 'offered' && a.offer)
    .map((a) => ({ a, p: MP.get('providers', a.providerId) || {} }))
    .sort((x, y) => x.a.offer.total - y.a.offer.total);
  /* «الأنسب»: price weighted by rating (5★ counts as is; lower ratings make the price «feel» higher) */
  const best = (offers) => offers.slice().sort((x, y) => x.a.offer.total * (1.3 - 0.06 * (+x.p.rating || 4)) - y.a.offer.total * (1.3 - 0.06 * (+y.p.rating || 4)))[0];

  function block(r) {
    if (!waiting(r)) return inspectionNote(r);
    const offers = list(r), mode = r.bidding.mode, left = minutesLeft(r);
    const head = `<h2 class="sec-title" id="of-h">${ic('list')}${mode === 'inspection' ? 'عروض المعاينة' : 'عروض الفنيين'}${offers.length ? ` <span class="of-count">${offers.length}</span>` : ''}</h2>`;
    const intro = mode === 'inspection'
      ? '<p class="of-intro">المشكلة دي محتاجة الفني يشوفها الأول. كل فني بيحدد سعر المعاينة — ولو كمّلت الإصلاح معاه، المعاينة بتتخصم من السعر.</p>'
      : '<p class="of-intro">الفنيين القريبين بيبعتوا أسعارهم. السعر شامل كل حاجة، ومش هيتغير إلا بموافقتك.</p>';
    if (!offers.length) {
      return `<section class="offers" aria-labelledby="of-h">${head}${intro}<div class="of-wait" role="status"><span class="ai-dots" aria-hidden="true"><i></i><i></i><i></i></span><b>بنستنى عروض الفنيين</b><small>${left ? `خلال حوالي ${left} دقيقة` : 'أول ما يوصل عرض هنبلّغك'}</small></div></section>`;
    }
    const top = best(offers);
    return `<section class="offers" aria-labelledby="of-h">${head}${intro}
      ${offers.length > 1 ? `<button type="button" class="cta of-best" data-of-choose="${esc(top.a.providerId)}">${ic('check')} اختارلي الأنسب</button>` : ''}
      <ul class="of-list">${offers.map(({ a, p }) => `<li class="of-card ${top && a === top.a && offers.length > 1 ? 'is-best' : ''}">
        <div class="of-top"><span class="prov-avatar" aria-hidden="true" style="background:${esc(p.avatar || '#B4511C')}">${esc(String(p.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span>
          <span class="of-who"><b>${esc(p.name || 'فني')}${p.status === 'approved' ? ` <span class="verified">${ic('shield')} موثّق</span>` : ''}</b><small>${p.rating ? `★ ${esc(p.rating)}` : 'جديد'}${p.jobs ? ` • ${esc(p.jobs)} خدمة` : ''}${a.offer.eta ? ` • ${esc(a.offer.eta)}` : ''}</small></span>
          <span class="of-price"><b>${money(a.offer.total)}</b><small>${a.offer.kind === 'inspection' ? 'سعر المعاينة' : 'شامل كل حاجة'}</small></span></div>
        ${a.offer.kind === 'quote' ? `<div class="of-split"><span>مصنعية <b>${money(a.offer.labor)}</b></span><span>قطع غيار <b>${money(a.offer.parts)}</b></span></div>` : ''}
        ${a.offer.note ? `<p class="of-note">«${esc(a.offer.note)}»</p>` : ''}
        <button type="button" class="cta ghost of-pick" data-of-choose="${esc(a.providerId)}">اختار العرض ده</button></li>`).join('')}</ul>
      ${left ? `<p class="of-more">ممكن توصلك عروض تانية خلال ${left} دقيقة.</p>` : ''}</section>`;
  }
  function inspectionNote(r) {
    if (!r || !r.inspection) return '';
    if (r.inspection.only) return `<div class="need">${ic('info')}<span>اتعملت المعاينة بس (${money(r.inspection.customerFee)}).</span></div>`;
    if (r.inspection.waived) return `<div class="need promo-note">${ic('check')}<span>سعر المعاينة اتخصم من الإصلاح.</span></div>`;
    return `<div class="need">${ic('info')}<span>معاينة بـ <b>${money(r.inspection.customerFee)}</b>. بعد ما الفني يشوف المشكلة هيبعتلك سعر الإصلاح — ولو وافقت، المعاينة بتتخصم منه.</span></div>`;
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-of-choose]'); if (!t) return;
    e.preventDefault();
    const sec = t.closest('.offers'); const id = (state && state.lastShown && state.lastShown.arg) || '';
    if (!id || !sec) return;
    apiCall('choose:' + id, t, () => HSOrdersApi.choose(id, t.dataset.ofChoose), () => { show('tracking', id); toast('تمام — الفني هيتواصل معاك على الموعد'); });
  });

  root.HSOffers = Object.freeze({ block, waiting, list, best });
})(typeof globalThis !== 'undefined' ? globalThis : this);
