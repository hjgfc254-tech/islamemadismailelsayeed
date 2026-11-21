/**
 * MODULE: offers (HSOffers) — Customer side of the offers round (round 9) and the price-trust cues (round 11).
 * While nearby providers answer, tracking shows each offer (price with the platform share included, labor / parts, note,
 * rating, jobs) with comparison tags (الأرخص / الأعلى تقييمًا / الأكثر خبرة), a countdown ring, «اختارلي الأنسب» that says
 * WHY it is the best, and a 5-second undo before the choice is sent. After the choice: a «السعر ثابت» seal, and any new
 * price shows its difference from the agreed one. Cash confirmation card after completion.
 * Classic script on the Customer app globals (MP, esc, ic, money, apiCall, show, toast, state).
 */
'use strict';
(function (root) {
  const num = (n, d = 0) => (+n || 0).toLocaleString('ar-EG', { maximumFractionDigits: d, minimumFractionDigits: d });
  const untilMs = (r) => { const t = Date.parse(r.bidding && r.bidding.until); return Number.isFinite(t) ? t - Date.now() : 0; };
  const minutesLeft = (r) => Math.max(0, Math.round(untilMs(r) / 60000));
  const minutesSince = (r) => Math.max(0, -untilMs(r) / 60000);
  const waiting = (r) => r && r.bidding && !MP.providerOf(r.id) && ['received', 'searching', 'sent'].includes(r.status);
  const list = (r) => (typeof MP.offersFor === 'function' ? MP.offersFor(r.id) : []).filter((a) => a.status === 'offered' && a.offer)
    .map((a) => ({ a, p: MP.get('providers', a.providerId) || {} }))
    .sort((x, y) => x.a.offer.total - y.a.offer.total);
  /* «الأنسب»: price weighted by rating (5★ counts as is; lower ratings make the price «feel» higher) */
  const score = (o) => o.a.offer.total * (1.3 - 0.06 * (+o.p.rating || 4));
  const best = (offers) => offers.slice().sort((x, y) => score(x) - score(y))[0];
  function tagsFor(offers) {
    const t = new Map(); if (offers.length < 2) return t;
    const add = (o, label) => { if (o) t.set(o, (t.get(o) || []).concat(label)); };
    add(offers[0], 'الأرخص');
    const topRated = offers.slice().sort((x, y) => (+y.p.rating || 0) - (+x.p.rating || 0))[0];
    if (+topRated.p.rating && offers.some((o) => (+o.p.rating || 0) < +topRated.p.rating)) add(topRated, 'الأعلى تقييمًا');
    const mostJobs = offers.slice().sort((x, y) => (+y.p.jobs || 0) - (+x.p.jobs || 0))[0];
    if (+mostJobs.p.jobs && offers.some((o) => (+o.p.jobs || 0) < +mostJobs.p.jobs)) add(mostJobs, 'الأكثر خبرة');
    return t;
  }
  function whyBest(top, offers) {
    const others = offers.filter((o) => o !== top);
    const cheaper = others.length ? Math.min(...others.map((o) => o.a.offer.total)) - top.a.offer.total : 0;
    const bits = [];
    if (cheaper > 0) bits.push('أرخص بـ ' + money(cheaper));
    if (+top.p.rating) bits.push('تقييمه ' + num(top.p.rating, 1));
    if (cheaper <= 0 && others.some((o) => (+o.p.rating || 0) < (+top.p.rating || 0))) bits.push('أعلى تقييم من الأرخص');
    return bits.join(' و');
  }
  /* countdown ring: the share of the offers window still left */
  function ring(r) {
    const total = (+(MP.db().settings || {}).bidWindowMin || 15) * 60000;
    const pct = Math.round(Math.min(1, Math.max(0, untilMs(r)) / total) * 100);
    return `<span class="of-ring" style="--p:${pct}" role="img" aria-label="باقي ${num(minutesLeft(r))} دقيقة على العروض"><b>${num(minutesLeft(r))}</b><small>دقيقة</small></span>`;
  }

  function block(r) {
    if (!waiting(r)) return inspectionNote(r) + seal(r);
    const offers = list(r), mode = r.bidding.mode, left = minutesLeft(r);
    const head = `<h2 class="sec-title" id="of-h">${ic('list')}${mode === 'inspection' ? 'عروض المعاينة' : 'عروض الفنيين'}${offers.length ? ` <span class="of-count">${num(offers.length)}</span>` : ''}</h2>`;
    const intro = mode === 'inspection'
      ? '<p class="of-intro">المشكلة دي محتاجة الفني يشوفها الأول. كل فني بيحدد سعر المعاينة — ولو كمّلت الإصلاح معاه، المعاينة بتتخصم من السعر.</p>'
      : '<p class="of-intro">الفنيين القريبين بيبعتوا أسعارهم. السعر شامل كل حاجة، ومش هيتغير إلا بموافقتك.</p>';
    if (!offers.length) {
      const widen = !left && !r.bidding.widened ? `<button type="button" class="cta ghost" data-of-widen>${ic('search')} دوّر على فنيين في مناطق تانية</button>` : '';
      return `<section class="offers" aria-labelledby="of-h">${head}${intro}<div class="of-wait" role="status">${left ? ring(r) : `<span class="ai-dots" aria-hidden="true"><i></i><i></i><i></i></span>`}<b>${left ? 'بنستنى عروض الفنيين' : (r.bidding.widened ? 'بندوّر في مناطق أبعد' : 'لسه مفيش عروض')}</b><small>${left ? 'أول ما يوصل عرض هيظهر هنا' : (r.bidding.widened ? 'والإدارة بتتابع طلبك' : 'ممكن نوسّع البحث')}</small>${widen}</div></section>`;
    }
    const top = best(offers), late = minutesSince(r) >= 60, tags = tagsFor(offers), why = offers.length > 1 ? whyBest(top, offers) : '';
    return `<section class="offers" aria-labelledby="of-h">${head}${intro}
      ${left ? `<div class="of-timer">${ring(r)}<span>ممكن توصلك عروض تانية — أو اختار دلوقتي.</span></div>` : `<p class="of-ready" role="status">${ic('bell')} العروض جاهزة — اختار واحد عشان الفني يتحرك</p>`}
      ${(() => { const m = +((MP.db().settings || {}).autoPickMin) || 0; return m ? `<p class="of-auto" data-of-autopick>${ic('clock')} لو ما اخترتش خلال ${num(m)} دقيقة من انتهاء وقت العروض، هنختارلك الأنسب تلقائيًا.</p>` : ''; })()}
      ${offers.length > 1 ? `<button type="button" class="cta of-best ${late ? 'is-late' : ''}" data-of-choose="${esc(top.a.providerId)}">${ic('check')} اختارلي الأنسب</button>${why ? `<p class="of-why">${ic('info')} الأنسب: ${esc(top.p.name || 'فني')} — ${esc(why)}</p>` : ''}` : ''}
      <ul class="of-list">${offers.map((o) => { const { a, p } = o; const tg = tags.get(o) || []; return `<li class="of-card ${o === top && offers.length > 1 ? 'is-best' : ''}" data-of-card="${esc(a.providerId)}">
        ${tg.length ? `<div class="of-tags">${tg.map((x) => `<span class="of-tag">${esc(x)}</span>`).join('')}</div>` : ''}
        <div class="of-top"><span class="prov-avatar" aria-hidden="true" style="background:${esc(p.avatar || '#B4511C')}">${esc(String(p.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span>
          <span class="of-who"><b>${esc(p.name || 'فني')}${p.status === 'approved' ? ` <span class="verified">${ic('shield')} موثّق</span>` : ''}</b><small>${p.rating ? `★ ${num(p.rating, 1)}` : 'جديد'}${p.jobs ? ` • ${num(p.jobs)} خدمة` : ''}${a.offer.eta ? ` • ${esc(a.offer.eta)}` : ''}</small></span>
          <span class="of-price"><b>${money(a.offer.total)}</b><small>${a.offer.kind === 'inspection' ? 'سعر المعاينة' : 'شامل كل حاجة'}</small></span></div>
        ${a.offer.kind === 'quote' ? `<div class="of-split"><span>مصنعية <b>${money(a.offer.labor)}</b></span><span>قطع غيار <b>${money(a.offer.parts)}</b></span></div>` : ''}
        ${a.offer.note ? `<p class="of-note">«${esc(a.offer.note)}»</p>` : ''}
        <button type="button" class="cta ghost of-pick" data-of-choose="${esc(a.providerId)}">اختار العرض ده</button></li>`; }).join('')}</ul>
      <div class="of-undo" data-of-undo-bar hidden role="status" aria-live="assertive"></div></section>`;
  }
  function inspectionNote(r) {
    if (!r || !r.inspection) return '';
    if (r.inspection.only) return `<div class="need">${ic('info')}<span>اتعملت المعاينة بس (${money(r.inspection.customerFee)}).</span></div>`;
    if (r.inspection.waived) return `<div class="need promo-note">${ic('check')}<span>سعر المعاينة اتخصم من الإصلاح.</span></div>`;
    return `<div class="need">${ic('info')}<span>معاينة بـ <b>${money(r.inspection.customerFee)}</b>. بعد ما الفني يشوف المشكلة هيبعتلك سعر الإصلاح — ولو وافقت، المعاينة بتتخصم منه.</span></div>`;
  }
  /* «السعر ثابت»: the agreed price is locked until the customer approves a change */
  function seal(r) {
    if (!r || !r.pricing || r.visitOnly || !['accepted', 'scheduled', 'enroute', 'arrived', 'started', 'quote'].includes(r.status)) return '';
    const q = MP.currentQuote && MP.currentQuote(r.id);
    if (q && q.status === 'pending') return '';
    return `<div class="price-seal" role="note">${ic('shield')}<span><b>${money(r.pricing.customerPrice)}</b><small>سعرك ثابت — مش هيتغير إلا بموافقتك</small></span></div>`;
  }
  /* a new price after the visit: how far from the agreed one (shown on the quote card) */
  function quoteDiff(r, q) {
    if (!r || !q || !r.pricing || !q.customerTotal) return '';
    const d = Math.round(q.customerTotal - r.pricing.customerPrice);
    if (!d) return '';
    return `<div class="quote-row quote-diff ${d > 0 ? 'is-up' : 'is-down'}"><span>${d > 0 ? 'أعلى من المتفق عليه' : 'أقل من المتفق عليه'} (${money(r.pricing.customerPrice)})</span><b>${d > 0 ? '+' : '−'}${money(Math.abs(d))}</b></div>`;
  }
  /* cash after completion: both sides confirm; a mismatch goes to the admin */
  function cashCard(r) {
    if (!r || !['completed', 'closed'].includes(r.status) || !(+r.finalValue > 0) || (r.cash && r.cash.customer != null)) return r && r.cash && r.cash.disputed ? `<div class="need">${ic('info')}<span>فيه اختلاف على الدفع — الإدارة هتتواصل معاك.</span></div>` : '';
    return `<section class="of-cash" aria-label="تأكيد الدفع"><b>دفعت ${money(r.finalValue)} للفني؟</b><div><button type="button" class="cta" data-of-cash="1">أيوه دفعت</button><button type="button" class="cta ghost" data-of-cash="0">لسه مدفعتش</button></div></section>`;
  }

  /* 5-second undo before the choice is sent (a mis-tap must not close the other offers) */
  let pending = null;
  const UNDO_MS = 5000;
  function startChoice(id, pid, btn) {
    const bar = document.querySelector('[data-of-undo-bar]');
    const p = MP.get('providers', pid) || {};
    if (pending) { clearTimeout(pending.timer); clearInterval(pending.tick); }
    const send = () => { const cur = pending; pending = null; if (bar) bar.hidden = true;
      apiCall('choose:' + id, (cur && cur.btn) || btn, () => HSOrdersApi.choose(id, pid), () => { show('tracking', id); toast('تمام — الفني هيتواصل معاك على الموعد'); }); };
    if (!bar) return send();
    let s = UNDO_MS / 1000;
    const paint = () => { bar.innerHTML = `<span>اخترت <b>${esc(p.name || 'الفني')}</b> — هيتبعت خلال ${num(s)}…</span><button type="button" class="cta ghost" data-of-undo>تراجع</button>`; };
    bar.hidden = false; paint();
    pending = { id, pid, btn, timer: setTimeout(send, UNDO_MS), tick: setInterval(() => { s = Math.max(0, s - 1); paint(); }, 1000) };
    const b = bar.querySelector && bar.querySelector('[data-of-undo]'); if (b && b.focus) b.focus({ preventScroll: true });   /* keep the offers in view */
  }
  function undo() { if (!pending) return; clearTimeout(pending.timer); clearInterval(pending.tick); const btn = pending.btn; pending = null;
    const bar = document.querySelector('[data-of-undo-bar]'); if (bar) bar.hidden = true; toast('اتلغى الاختيار'); if (btn && btn.focus) btn.focus({ preventScroll: true }); }

  const curId = () => (state && state.lastShown && state.lastShown.arg) || '';
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-of-undo]')) { e.preventDefault(); return undo(); }
    const w = e.target.closest('[data-of-widen]'), c = e.target.closest('[data-of-cash]');
    if (w || c) { e.preventDefault(); const id = curId(); if (!id) return;
      if (w) apiCall('widen:' + id, w, () => HSOrdersApi.widen(id), () => { show('tracking', id); toast('بندوّر على فنيين أبعد'); });
      else apiCall('cash:' + id, c, () => HSOrdersApi.cash(id, c.dataset.ofCash === '1'), () => { show('tracking', id); toast('اتسجّل — شكرًا'); });
      return; }
    const t = e.target.closest('[data-of-choose]'); if (!t) return;
    e.preventDefault();
    const id = curId(); if (!id || !t.closest('.offers')) return;
    startChoice(id, t.dataset.ofChoose, t);
  });

  root.HSOffers = Object.freeze({ block, waiting, list, best, tagsFor, whyBest, cashCard, seal, quoteDiff, num, UNDO_MS });
})(typeof globalThis !== 'undefined' ? globalThis : this);
