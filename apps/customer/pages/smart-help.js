/**
 * MODULE: smart-help (HSSmartHelp) — Customer «we help you decide» features (owner request 2026-11-24).
 *   • Emergency (طوارئ): water leak / sparks / power cut / gas smell → the safety steps first, Egypt's emergency numbers,
 *     then an urgent request (today, earliest period, marked «طوارئ» in the note). Gas is never sent to a technician first.
 *   • Diagnose (شخّص مشكلتك): device → what is happening → the likely problem with its safety notes, whether it needs an
 *     inspection visit and the real price when the price list has one → «ابعت فني» opens the request on that problem.
 *   • Home smart card: rule-based, never invented numbers — a due maintenance reminder, the season (AC before summer,
 *     water heater before winter), and the emergency line stands out at night.
 *   • Maintenance reminders: «فكّرني بالصيانة» after a finished job stores a reminder ON THIS DEVICE (localStorage);
 *     Home shows it when it is due.
 * Uses the app globals (CAT, startRequest, WZ, show, sheet, closeSheet, toast, ic) at call time; loaded before Home.
 */
'use strict';
(function (root) {
  if (root.HSSmartHelp) return;
  const doc = root.document;
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = (n) => { try { return typeof ic === 'function' ? ic(n) : ''; } catch (e) { return ''; } };
  const B = (n) => { try { return (root.HSBrandIcons && root.HSBrandIcons.svg(n)) || ''; } catch (e) { return ''; } };
  const cat = () => (typeof CAT !== 'undefined' ? CAT : null);

  /* ───────── emergency ───────── */
  const EMG = {
    water: { t: 'تسريب مياه', bi: 'plumbing', cat: 'plumbing', item: 'plumbing/pipes',
      steps: ['اقفل محبس المية الرئيسي للشقة فورًا.', 'لو المية قريبة من فيشة أو جهاز: افصل الكهرباء من اللوحة قبل ما تلمس حاجة.', 'شيل الأجهزة والسجاجيد من مكان المية، ونشّف الأرض.'] },
    spark: { t: 'شرر أو ريحة حريق', bi: 'electric', cat: 'electric', item: 'electric/dist-board', call: [['180', 'المطافي']],
      steps: ['افصل السكينة الرئيسية من لوحة الكهرباء.', 'ما تلمسش أي سلك أو فيشة، وما ترميش مية على الكهرباء.', 'لو فيه نار أو دخان كتير: اخرج واطلب المطافي 180.'] },
    power: { t: 'الكهرباء قاطعة', bi: 'electric', cat: 'electric', item: 'electric/dist-board', call: [['121', 'طوارئ الكهرباء']],
      steps: ['بص على لوحة الكهرباء: لو فيه مفتاح نازل ارفعه مرة واحدة بس.', 'لو نزل تاني على طول، سيبه وافصل الأجهزة الكبيرة.', 'لو الشارع كله قاطع، الموضوع من الشركة — كلّم طوارئ الكهرباء 121.'] },
    gas: { t: 'ريحة غاز', bi: 'appliances', cat: '', item: 'appliances/cooker', call: [['129', 'طوارئ الغاز'], ['180', 'المطافي']],
      steps: ['ما تولّعش نور ولا كبريت، وما تشغّلش أي مفتاح كهرباء.', 'افتح الشبابيك واقفل محبس الغاز.', 'اخرج من الشقة واطلب طوارئ الغاز 129 من برّه.', 'بعد ما يتأمّن المكان، اطلب فني يكشف على البوتاجاز أو السخان.'] }
  };
  function openEmergency(kind) {
    if (typeof sheet !== 'function') return;
    if (!kind || !EMG[kind]) {
      sheet(`<h4 class="emg-h">${I('warn')} عندك طوارئ؟</h4><div class="sub">اختار اللي حاصل — هنقولك تعمل إيه حالًا، وبعدين نبعتلك فني بأولوية.</div>
        <div class="emg-grid">${Object.entries(EMG).map(([k, v]) => `<button type="button" class="emg-pick" data-emg="${k}">${B(v.bi)}<span>${v.t}</span></button>`).join('')}</div>
        <div class="emg-calls">${[['180', 'المطافي'], ['123', 'الإسعاف'], ['129', 'طوارئ الغاز'], ['121', 'طوارئ الكهرباء']].map(([n, l]) => `<a href="tel:${n}"><b>${n}</b><small>${l}</small></a>`).join('')}</div>`);
      return;
    }
    const v = EMG[kind];
    sheet(`<h4 class="emg-h">${I('warn')} ${E(v.t)} — اعمل كده دلوقتي</h4>
      <ol class="emg-steps">${v.steps.map((s) => `<li>${E(s)}</li>`).join('')}</ol>
      ${(v.call || []).map(([n, l]) => `<a class="cta emg-call" href="tel:${n}">${I('phone')} اتصل بـ${E(l)} ${n}</a>`).join('')}
      <button type="button" class="cta emg-go" data-emg-go="${kind}">${I('send')} ${kind === 'gas' ? 'المكان اتأمّن — اطلب فني يكشف' : 'اطلب فني بأولوية'}</button>
      <button type="button" class="cta ghost" data-emg="">رجوع</button>`);
  }
  function urgentRequest(kind) {
    const v = EMG[kind]; if (!v) return;
    const C = cat(); const it = C && C.item(v.item);
    if (typeof startRequest !== 'function') return;
    startRequest(it ? it.cat : (v.cat || undefined), it ? it.id : undefined);
    try {
      if (typeof WZ !== 'undefined' && WZ) {
        WZ.note = ('طوارئ: ' + v.t + (WZ.note ? ' — ' + WZ.note : '')).slice(0, 300);
        const d = new Date(), h = d.getHours();
        if (WZ.schedule) { WZ.schedule.flexible = false; WZ.schedule.date = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); WZ.schedule.period = h < 12 ? 'morning' : h < 15 ? 'noon' : 'evening'; }
        if (typeof show === 'function') show('wizard');
      }
    } catch (e) {}
    try { if (typeof toast === 'function') toast('طلب طوارئ — بنحطه أول القايمة للفنيين'); } catch (e) {}
  }

  /* ───────── diagnose ───────── */
  const DX_DEVICES = ['appliances/ac', 'appliances/fridge', 'appliances/washer-auto', 'appliances/heater-electric', 'appliances/heater-gas', 'appliances/cooker',
    'plumbing/faucets', 'plumbing/toilet', 'plumbing/pipes', 'electric/dist-board', 'electric/switches', 'electric/lighting'];
  let prices = null, pricesAsked = false;
  function loadPrices() {
    if (pricesAsked || typeof HSApiClient === 'undefined') return; pricesAsked = true;
    HSApiClient.request('GET', '/pricing').then((r) => { prices = r && r.ok && r.data && r.data.prices ? r.data.prices : null; }).catch(() => {});
  }
  function openDiagnose(step, id) {
    const C = cat(); if (!C || typeof sheet !== 'function') return;
    loadPrices();
    const dots = (n) => `<div class="dx-dots" aria-hidden="true">${[0, 1, 2].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;
    if (!step) {
      const list = DX_DEVICES.map((x) => C.item(x)).filter(Boolean);
      sheet(`${dots(0)}<h4>${I('search')} شخّص مشكلتك في 3 خطوات</h4><div class="sub">الجهاز أو المكان اللي فيه المشكلة إيه؟</div>
        <div class="dx-grid">${list.map((it) => `<button type="button" class="dx-pick" data-dx-item="${E(it.id)}">${B(it.cat) || I('wrench')}<span>${E(it.name)}</span></button>`).join('')}
        <button type="button" class="dx-pick dx-other" data-act="newReq">${B('all')}<span>حاجة تانية</span></button></div>`);
      return;
    }
    if (step === 'item') {
      const it = C.item(id); if (!it) return;
      const probs = (C.problems(it.id) || []).filter((p) => p && p.name).slice(0, 10);
      sheet(`${dots(1)}<h4>${E(it.name)}: إيه اللي حاصل؟</h4><div class="sub">اختار أقرب حاجة للي بتشوفه.</div>
        <div class="dx-list">${probs.map((p) => `<button type="button" class="dx-sym" data-dx-prob="${E(p.id)}">${E(p.name)}${I('chev')}</button>`).join('')}
        <button type="button" class="dx-sym dx-unsure" data-dx-unsure="${E(it.id)}">مش متأكد — محتاج فني يكشف${I('chev')}</button></div>
        <button type="button" class="cta ghost" data-dx-back>رجوع</button>`);
      return;
    }
    const unsure = step === 'unsure';
    const p = unsure ? null : C.problem(id); const it = C.item(unsure ? id : p && p.item); if (!it) return;
    const safety = (C.safetyFor ? C.safetyFor(it.id, p ? p.id : '') : []).filter(Boolean).slice(0, 3);
    const visit = C.needsVisit ? C.needsVisit(it.id, p ? p.id : '') : true;
    const price = prices && prices[it.id];
    sheet(`${dots(2)}<div class="dx-result"><span class="dx-badge">${unsure ? 'محتاج كشف' : 'التشخيص المبدئي'}</span>
        <h4>${E(it.name)}${p ? ' — ' + E(p.name) : ''}</h4>
        <ul class="dx-facts">
          <li>${I('wallet')}<span>${price ? `سعر الخدمة <b>${Number(price).toLocaleString('ar-EG')} ج.م</b> — ثابت وشامل` : 'السعر بيتحدد بعد ما الفني يعاين — وبتوافق عليه قبل التنفيذ'}</span></li>
          <li>${I('clock')}<span>${visit ? 'محتاجة زيارة فني يكشف ويصلّح' : 'غالبًا تتصلّح في نفس الزيارة'}</span></li>
          <li>${I('shield')}<span>فنيين بتراجعهم الإدارة، وتقدر تتابع الطلب خطوة بخطوة</span></li>
        </ul>
        ${safety.length ? `<div class="safety">${I('shield')}<div><b>لحد ما الفني يوصل</b><span>${safety.map(E).join('<br>')}</span></div></div>` : ''}
      </div>
      <button type="button" class="cta" ${p ? `data-wz-hit="problem|${E(p.id)}"` : `data-wz-hit="item|${E(it.id)}"`}>${I('send')} ابعت فني للمشكلة دي</button>
      <button type="button" class="cta ghost" data-dx-item="${E(it.id)}">اختار عَرَض تاني</button>`);
  }

  /* ───────── maintenance reminders (this device) ───────── */
  const RKEY = 'hs_maint_v1';
  const MONTHS = { 'appliances/ac': 6, 'appliances/heater-electric': 12, 'appliances/heater-gas': 12, 'plumbing/heaters-plumb': 12, 'plumbing/water-tanks': 6, 'cleaning/tanks-clean': 6, 'cars/oil-change': 4, 'appliances/washer-auto': 12, 'cars/car-ac': 12 };
  const readR = () => { try { const v = JSON.parse(localStorage.getItem(RKEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const writeR = (v) => { try { localStorage.setItem(RKEY, JSON.stringify(v.slice(0, 12))); } catch (e) {} };
  const monthsFor = (itemId) => MONTHS[itemId] || 0;
  function remind(itemId) {
    const C = cat(); const it = C && C.item(itemId); const m = monthsFor(itemId); if (!it || !m) return false;
    const due = new Date(); due.setMonth(due.getMonth() + m);
    writeR([{ item: it.id, name: it.name, due: due.toISOString().slice(0, 10) }, ...readR().filter((r) => r.item !== it.id)]);
    try { if (typeof toast === 'function') toast(`تمام — هنفكّرك بصيانة ${it.name} بعد ${m} ${m > 10 ? 'شهر' : 'شهور'}`, 'success'); } catch (e) {}
    return true;
  }
  const dueSoon = () => { const lim = new Date(); lim.setDate(lim.getDate() + 7); const L = lim.toISOString().slice(0, 10); return readR().filter((r) => r.due <= L); };
  /** «فكّرني بالصيانة» for a finished request on an item with a known maintenance cycle ('' otherwise) */
  function reminderButton(r) {
    const itemId = r && (r.itemId || r.serviceId); const m = monthsFor(itemId); if (!m) return '';
    if (readR().some((x) => x.item === itemId)) return `<div class="need">${I('clock')}<span>هنفكّرك بالصيانة الجاية في ميعادها.</span></div>`;
    return `<button type="button" class="cta ghost" data-remind="${E(itemId)}">${I('clock')} فكّرني بالصيانة بعد ${m} ${m > 10 ? 'شهر' : 'شهور'}</button>`;
  }

  /* ───────── Home smart card ───────── */
  function homeCard(now) {
    const d = now || new Date(), m = d.getMonth(), h = d.getHours(), night = h >= 22 || h < 6;
    const C = cat();
    let smart = '';
    const due = dueSoon()[0];
    if (due) smart = `<button type="button" class="smart-card is-due" data-wz-hit="item|${E(due.item)}">${B('schedule')}<span><small>تذكير الصيانة</small><b>ميعاد صيانة ${E(due.name)} جه</b><em>اطلبها دلوقتي بضغطة</em></span>${I('chev')}</button>`;
    else if (C && m >= 3 && m <= 7 && C.item('appliances/ac')) smart = `<button type="button" class="smart-card" data-wz-hit="item|appliances/ac">${B('appliances')}<span><small>قبل الحر ما يشتد</small><b>صيانة وتنظيف التكييف</b><em>تكييف نضيف = تبريد أسرع وفاتورة أقل</em></span>${I('chev')}</button>`;
    else if (C && (m >= 9 || m <= 1) && C.item('appliances/heater-electric')) smart = `<button type="button" class="smart-card" data-wz-hit="item|appliances/heater-electric">${B('plumbing')}<span><small>الشتا داخل</small><b>السخان بتاعك جاهز؟</b><em>كشف وصيانة قبل البرد</em></span>${I('chev')}</button>`;
    return `<section class="smart-help ${night ? 'is-night' : ''}" aria-label="مساعدة سريعة">
      <div class="sh-row">
        <button type="button" class="sh-btn sh-emg" data-emg="">${I('warn')}<span><b>طوارئ؟</b><small>تسريب، شرر، ريحة غاز</small></span></button>
        <button type="button" class="sh-btn sh-dx" data-dx-start>${I('search')}<span><b>شخّص مشكلتك</b><small>3 أسئلة وتعرف</small></span></button>
      </div>${smart}</section>`;
  }

  /* ───────── clicks ───────── */
  if (doc && doc.addEventListener) {
    doc.addEventListener('click', (e) => {
      const t = e.target && e.target.closest && e.target.closest('[data-emg],[data-emg-go],[data-dx-start],[data-dx-item],[data-dx-prob],[data-dx-unsure],[data-dx-back],[data-remind]');
      if (!t) return;
      e.preventDefault();
      const ds = t.dataset;
      if ('emgGo' in ds) return urgentRequest(ds.emgGo);
      if ('emg' in ds) return openEmergency(ds.emg);
      if ('dxStart' in ds || 'dxBack' in ds) return openDiagnose();
      if ('dxItem' in ds) return openDiagnose('item', ds.dxItem);
      if ('dxProb' in ds) return openDiagnose('prob', ds.dxProb);
      if ('dxUnsure' in ds) return openDiagnose('unsure', ds.dxUnsure);
      if ('remind' in ds) { if (remind(ds.remind)) { const n = doc.createElement('div'); n.className = 'need'; n.innerHTML = `${I('clock')}<span>هنفكّرك بالصيانة الجاية في ميعادها.</span>`; t.replaceWith(n); } }
    });
  }

  root.HSSmartHelp = Object.freeze({ EMG, openEmergency, urgentRequest, openDiagnose, homeCard, remind, reminderButton, dueSoon, monthsFor, _read: readR });
})(typeof globalThis !== 'undefined' ? globalThis : this);
