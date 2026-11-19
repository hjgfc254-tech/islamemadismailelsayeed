/**
 * MODULE: trust-features (HSTrust) — Customer UI for the trust features of round 8:
 *   arrival code card, warranty strip + «المشكلة رجعت», tip at completion, before/after photo comparison,
 *   read receipts + «بيكتب…» in the chat, «العملاء بيقولوا عنه» review tags, provider portfolio, «بيتي» (home appliances)
 *   with maintenance reminders.
 * Renderers return small HTML blocks used by the order-details / providers / home / account renderers; `hydrate(name, arg)`
 * runs after a screen is shown (photos are fetched on demand; they are never part of a sync).
 * Classic script: relies on the Customer app globals (MP, CAT, esc, ic, sheet, closeSheet, toast, show, apiCall, fmtDT, money).
 */
'use strict';
(function (root) {
  const RV_TAGS = ['ملتزم بالموعد', 'شغله نضيف', 'أسعاره مناسبة', 'محترم في التعامل', 'سريع'];
  const live = () => !!(root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase');
  const settings = () => (MP.db().settings || {});
  const dayFmt = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' }); };

  /* ── arrival: estimate + 4-digit code (shown to the technician at the door) ── */
  function arrivalCard(r) {
    const showPin = settings().arrivalPin && r.pin && ['accepted', 'scheduled', 'enroute'].includes(r.status);
    const at = r.status === 'enroute' && r.etaAt ? new Date(r.etaAt) : null;
    const mins = at && !Number.isNaN(at.getTime()) ? Math.round((at.getTime() - Date.now()) / 60000) : null;
    if (!showPin && mins == null) return '';
    const eta = mins == null ? '' : `<div class="ar-eta">${ic('clock')}<span><b>${mins > 1 ? `هيوصل خلال حوالي ${mins} دقيقة` : 'المفروض يوصل دلوقتي'}</b><small>حوالي الساعة ${esc(at.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }))} — تقدير الفني</small></span></div>`;
    const pin = showPin ? `<div class="ar-pin"><small>كود الوصول</small><div class="pin-digits" dir="ltr" role="img" aria-label="كود الوصول ${esc(r.pin.split('').join(' '))}">${r.pin.split('').map((d) => `<b>${esc(d)}</b>`).join('')}</div><small>ورّيه للفني لما يوصل — من غيره ما يقدرش يسجّل إنه وصل</small></div>` : '';
    return `<section class="arrive-card" aria-label="الوصول">${eta}${pin}</section>`;
  }

  /* ── warranty ── */
  function warrantyStrip(r) {
    if (r.warrantyOf) { const o = MP.get('serviceRequests', r.warrantyOf); return `<div class="warranty-strip is-claim">${ic('shield')}<span><b>طلب ضمان</b><small>على الطلب #${esc(o ? o.no : '')} — الفني بيرجع يشوف المشكلة من غير تكلفة شغل</small></span></div>`; }
    if (!r.warrantyUntil || !['completed', 'closed'].includes(r.status)) return '';
    const until = Date.parse(r.warrantyUntil), active = until > Date.now();
    const claim = r.warrantyClaimId && MP.get('serviceRequests', r.warrantyClaimId);
    const claimOpen = claim && !['closed', 'cancelled', 'failed'].includes(claim.status);
    const action = claimOpen ? `<button type="button" class="ws-go" data-track="${esc(claim.id)}">طلب الضمان #${esc(claim.no)}</button>`
      : active ? `<button type="button" class="ws-go" data-act="warrantyClaim" data-id="${esc(r.id)}">المشكلة رجعت؟</button>` : '';
    return `<div class="warranty-strip ${active ? '' : 'is-over'}">${ic('shield')}<span><b>${active ? `مضمون لحد ${esc(dayFmt(r.warrantyUntil))}` : 'فترة الضمان خلصت'}</b><small>${active ? 'لو المشكلة رجعت، نفس الفني بيرجع يشوفها' : `كانت لحد ${esc(dayFmt(r.warrantyUntil))}`}</small></span>${action}</div>`;
  }
  function openWarrantyClaim(id) {
    const r = MP.get('serviceRequests', id); if (!r) return;
    sheet(`<h4>${ic('shield')} المشكلة رجعت؟</h4><div class="sub">هنبعت طلب ضمان لنفس الفني على الطلب #${esc(r.no)}.</div>
      <form class="form" id="warrantyForm" data-id="${esc(id)}"><div><label for="wr-desc">إيه اللي حصل؟</label><textarea id="wr-desc" name="desc" maxlength="1000" placeholder="مثلًا: التكييف رجع ينقّط مية من نفس المكان"></textarea></div>
      <button class="cta" type="submit">${ic('send')} ابعت طلب الضمان</button></form>`);
  }

  /* ── tip at completion (cash with the bill) ── */
  function tipCard(r) {
    if (r.tip) return `<div class="tip-done">${ic('star')}<span>هتدي الفني <b>${esc(r.tip.amount)} ج.م</b> بقشيش مع الحساب — شكرًا ليك</span></div>`;
    if (r.status !== 'completed' || r.warrantyOf) return '';
    return `<section class="tip-card" aria-labelledby="tip-h"><div><b id="tip-h">عايز تشكر الفني؟</b><small>البقشيش بيروح له كله، وبتديهوله كاش مع الحساب</small></div>
      <div class="tip-chips" role="group" aria-labelledby="tip-h">${[10, 20, 50].map((a) => `<button type="button" class="chip" data-tip="${a}" data-id="${esc(r.id)}">${a} ج.م</button>`).join('')}<button type="button" class="chip ghost" data-tip="other" data-id="${esc(r.id)}">مبلغ تاني</button></div></section>`;
  }

  /* ── before / after photos ── */
  const photoCache = new Map();            // reqId → {at, before, after, share}
  function photosSlot(r) {
    if (!r.hasPhotos || !(r.hasPhotos.before || r.hasPhotos.after)) return '';
    return `<section class="ba-card" aria-labelledby="ba-h"><h2 class="sec-title" id="ba-h">${ic('camera')}قبل وبعد</h2><div class="ba-slot" data-ba="${esc(r.id)}"><div class="ba-skel" aria-busy="true"></div></div></section>`;
  }
  function baHtml(id, x) {
    const both = x.before && x.after;
    const body = both
      ? `<div class="ba" style="--x:50%"><img class="ba-img" src="${esc(x.after)}" alt="بعد الشغل"><div class="ba-before"><img class="ba-img" src="${esc(x.before)}" alt="قبل الشغل"></div><span class="ba-line" aria-hidden="true"><i></i></span><span class="ba-tag b">قبل</span><span class="ba-tag a">بعد</span><input class="ba-range" type="range" min="0" max="100" value="50" dir="ltr" aria-label="اسحب عشان تقارن قبل وبعد"></div>`
      : `<div class="ba single"><img class="ba-img" src="${esc(x.before || x.after)}" alt="${x.before ? 'قبل الشغل' : 'بعد الشغل'}"><span class="ba-tag ${x.before ? 'b' : 'a'}">${x.before ? 'قبل' : 'بعد'}</span></div>`;
    const share = both && MP.get('serviceRequests', id) && ['completed', 'closed'].includes(MP.get('serviceRequests', id).status)
      ? `<label class="ba-share"><input type="checkbox" data-ba-share="${esc(id)}" ${x.share ? 'checked' : ''}><span>اسمح للفني يعرض الصور دي في ملف أعماله (من غير اسمك أو عنوانك)</span></label>` : '';
    return body + share;
  }
  function hydratePhotos(id) {
    const slot = document.querySelector(`[data-ba="${CSS.escape(id)}"]`); if (!slot) return;
    const r = MP.get('serviceRequests', id), stamp = r && r.hasPhotos && r.hasPhotos.at;
    const hit = photoCache.get(id);
    if (hit && hit.at === stamp) { slot.innerHTML = baHtml(id, hit); return; }
    HSOrdersApi.photos(id).then((res) => {
      if (!res || !res.ok) { slot.innerHTML = '<p class="hint">تعذّر تحميل الصور دلوقتي.</p>'; return; }
      const x = { at: stamp, ...res.data }; photoCache.set(id, x);
      const s = document.querySelector(`[data-ba="${CSS.escape(id)}"]`); if (s) s.innerHTML = baHtml(id, x);
    });
  }
  document.addEventListener('input', (e) => {
    const t = e.target; if (!t.classList || !t.classList.contains('ba-range')) return;
    const box = t.closest('.ba'); if (box) box.style.setProperty('--x', t.value + '%');
  });

  /* ── chat: read receipts + «بيكتب…» ── */
  function seenLabel(r, m, mine) {
    const other = mine === 'customer' ? 'provider' : 'customer';
    const seen = r.chatSeen && r.chatSeen[other];
    return seen && seen >= m.at ? '<span class="seen">اتقرت</span>' : '';
  }
  let offTyping = null, typingFor = '';
  function hydrateChat(r) {
    const chat = Array.isArray(r.chat) ? r.chat : [];
    const lastOther = chat.filter((m) => m.by === 'provider').pop();
    const mine = r.chatSeen && r.chatSeen.customer;
    if (lastOther && (!mine || mine < lastOther.at)) { try { HSOrdersApi.chatSeen(r.id); } catch (e) {} }
    if (typingFor !== r.id) {
      if (offTyping) { try { offTyping(); } catch (e) {} offTyping = null; }
      typingFor = r.id;
      if (root.HSBackend && typeof HSBackend.onTyping === 'function') offTyping = HSBackend.onTyping(r.id, 'customer', (on) => { const el = document.querySelector('.chat-typing'); if (el) el.hidden = !on; });
    }
  }
  document.addEventListener('input', (e) => {
    if (!e.target || e.target.id !== 'chat-text') return;
    const f = e.target.closest('#chatForm'); if (f && root.HSBackend && HSBackend.setTyping) HSBackend.setTyping(f.dataset.id, 'customer');
  });

  /* ── review tags («العملاء بيقولوا عنه») ── */
  function tagCounts(providerId) {
    const counts = Object.fromEntries(RV_TAGS.map((t) => [t, 0]));
    (MP.db().reviews || []).filter((v) => v.providerId === providerId && !v.hidden).forEach((v) => RV_TAGS.forEach((t) => { if (String(v.comment || '').includes(t)) counts[t]++; }));
    return Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  }
  function tagChips(providerId, max) {
    const list = tagCounts(providerId).slice(0, max || 5); if (!list.length) return '';
    return `<ul class="praise" aria-label="العملاء بيقولوا عنه">${list.map(([t, n]) => `<li>${esc(t)}<b>${n.toLocaleString('ar-EG')}</b></li>`).join('')}</ul>`;
  }

  /* ── provider portfolio (customers' consent only) ── */
  function portfolioSlot(pid) { return `<div class="portfolio" data-portfolio="${esc(pid)}" hidden></div>`; }
  function hydratePortfolio(pid) {
    const host = document.querySelector(`[data-portfolio="${CSS.escape(pid)}"]`); if (!host || !root.HSCatalogApi || !HSCatalogApi.portfolio) return;
    HSCatalogApi.portfolio(pid).then((res) => {
      const items = res && res.ok && res.data && res.data.items || []; if (!items.length) return;
      host.innerHTML = `<h2 class="sec-title">${ic('camera')}من شغله</h2><div class="pf-row">${items.map((x) => `<figure class="pf-item"><div class="ba" style="--x:50%"><img class="ba-img" src="${esc(x.after)}" alt="بعد"><div class="ba-before"><img class="ba-img" src="${esc(x.before)}" alt="قبل"></div><span class="ba-line" aria-hidden="true"><i></i></span><input class="ba-range" type="range" min="0" max="100" value="50" dir="ltr" aria-label="قارن قبل وبعد"></div></figure>`).join('')}</div>`;
      host.hidden = false;
    });
  }

  /* ── «بيتي»: appliances + maintenance reminders ── */
  const myDevices = () => { try { const c = typeof homeMe === 'function' ? homeMe() : null; return c ? (MP.get('customers', c.id) || {}).devices || [] : []; } catch (e) { return []; } };
  const dueSoon = (d) => d.nextAt && Date.parse(d.nextAt) - Date.now() < 14 * 864e5;
  const ago = (iso) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / (30 * 864e5))); return m < 1 ? 'من أقل من شهر' : m === 1 ? 'من شهر' : m === 2 ? 'من شهرين' : `من ${m} شهور`; };
  function homeReminder() {
    const d = myDevices().filter(dueSoon).sort((a, b) => Date.parse(a.nextAt) - Date.parse(b.nextAt))[0]; if (!d) return '';
    const late = Date.parse(d.nextAt) < Date.now();
    return `<section class="care-card" aria-label="تذكير صيانة">${ic('calendar')}<span><b>${late ? 'ميعاد' : 'قرّب ميعاد'} صيانة ${esc(d.name)}${d.brand ? ' ' + esc(d.brand) : ''}</b><small>${d.lastAt ? 'آخر صيانة كانت ' + ago(d.lastAt) : 'من «بيتي»'}</small></span><button type="button" class="cta" data-act="careBook" data-item="${esc(d.item)}">احجز</button></section>`;
  }
  function myHome() {
    const list = myDevices();
    return `<section class="myhome" aria-labelledby="mh-h"><h2 class="sec-title" id="mh-h">${ic('home')}بيتي<button type="button" class="sec-more" data-act="deviceAdd">${ic('plus')} إضافة جهاز</button></h2>
      ${list.length ? `<ul class="mh-list">${list.map((d) => `<li class="${dueSoon(d) ? 'due' : ''}"><span class="mh-ic">${typeof icItemOf === 'function' ? icItemOf(d.item) : ic('wrench')}</span><span class="mh-tx"><b>${esc(d.name)}${d.brand ? ' — ' + esc(d.brand) : ''}${d.year ? ' ' + esc(d.year) : ''}</b><small>${d.nextAt ? (dueSoon(d) ? 'الصيانة الجاية: قرّبت' : 'الصيانة الجاية: ' + esc(dayFmt(d.nextAt))) : (d.lastAt ? 'آخر خدمة ' + ago(d.lastAt) : 'لسه ما اتعملهوش خدمة')}</small></span><button type="button" class="mh-book" data-act="careBook" data-item="${esc(d.item)}" aria-label="احجز صيانة ${esc(d.name)}">${ic('wrench')}</button><button type="button" class="mh-rm" data-device-rm="${esc(d.id)}" aria-label="شيل ${esc(d.name)}">${ic('trash')}</button></li>`).join('')}</ul>`
      : '<p class="mh-empty">سجّل أجهزة بيتك مرة واحدة، فتتملى لوحدها في أي طلب ويوصلك تذكير لما ميعاد صيانتها يقرّب.</p>'}</section>`;
  }
  function openDeviceAdd() {
    const cats = CAT.categories().filter((c) => c.active !== false);
    const first = cats[0] ? cats[0].id : '';
    const itemsOf = (cat) => CAT.items(cat).filter((i) => i.active !== false).map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('');
    sheet(`<h4>${ic('home')} إضافة جهاز لبيتك</h4>
      <form class="form" id="deviceForm"><div><label for="dv-cat">القسم</label><select id="dv-cat">${cats.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></div>
      <div><label for="dv-item">الجهاز</label><select id="dv-item" name="item" required>${itemsOf(first)}</select></div>
      <div class="row2"><div><label for="dv-brand">الماركة (اختياري)</label><input id="dv-brand" name="brand" maxlength="40" placeholder="مثلًا: شارب"></div><div><label for="dv-year">سنة الشراء (اختياري)</label><input id="dv-year" name="year" inputmode="numeric" maxlength="4" placeholder="2021" dir="ltr"></div></div>
      <button class="cta" type="submit">${ic('check')} حفظ</button></form>`);
    const sel = document.getElementById('dv-cat'); if (sel) sel.addEventListener('change', () => { const it = document.getElementById('dv-item'); if (it) it.innerHTML = itemsOf(sel.value); });
  }

  /* ── events ── */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act="warrantyClaim"],[data-tip],[data-act="deviceAdd"],[data-device-rm],[data-act="careBook"]'); if (!t) return;
    const d = t.dataset;
    if (d.tip === undefined && d.deviceRm === undefined && !['warrantyClaim', 'deviceAdd', 'careBook'].includes(d.act)) return;
    e.preventDefault(); e.stopPropagation();
    if (d.act === 'warrantyClaim') return openWarrantyClaim(d.id);
    if (d.act === 'deviceAdd') return openDeviceAdd();
    if (d.act === 'careBook') { const it = CAT.item(d.item); if (it && typeof startRequest === 'function') startRequest(it.cat, it.id); return; }
    if (d.deviceRm !== undefined) return apiCall('dv-rm:' + d.deviceRm, t, () => HSCustomerApi.removeDevice(d.deviceRm), () => { show(state.lastShown ? state.lastShown.name : 'account'); toast('اتشال الجهاز'); });
    if (d.tip !== undefined) {
      const send = (amount) => apiCall('tip:' + d.id, t, () => HSOrdersApi.tip(d.id, amount), () => { show('tracking', d.id); toast('شكرًا — الفني هيعرف'); });
      if (d.tip !== 'other') return send(+d.tip);
      sheet(`<h4>${ic('star')} بقشيش للفني</h4><form class="form" id="tipForm" data-id="${esc(d.id)}"><div><label for="tip-amount">المبلغ (ج.م)</label><input id="tip-amount" name="amount" type="number" min="5" max="1000" inputmode="numeric" required dir="ltr"></div><button class="cta" type="submit">تأكيد</button></form>`);
    }
  }, true);
  document.addEventListener('change', (e) => {
    const t = e.target; if (!t.dataset || t.dataset.baShare === undefined) return;
    const id = t.dataset.baShare;
    HSOrdersApi.sharePhotos(id, t.checked).then((res) => { if (res && res.ok) { const c = photoCache.get(id); if (c) c.share = t.checked; toast(t.checked ? 'الفني يقدر يعرض الصور دي' : 'الصور مش هتظهر في ملف الفني'); } else { t.checked = !t.checked; toast('تعذّر الحفظ'); } });
  });
  document.addEventListener('submit', (e) => {
    const f = e.target; if (!f || !['warrantyForm', 'tipForm', 'deviceForm'].includes(f.id)) return;
    e.preventDefault();
    const btn = f.querySelector('button[type="submit"]');
    if (f.id === 'warrantyForm') return apiCall('warranty:' + f.dataset.id, btn, () => HSOrdersApi.warranty(f.dataset.id, f.querySelector('#wr-desc').value), (res) => { closeSheet(true); show('tracking', res.data.id); toast('اتبعت طلب الضمان لنفس الفني'); });
    if (f.id === 'tipForm') return apiCall('tip:' + f.dataset.id, btn, () => HSOrdersApi.tip(f.dataset.id, +f.querySelector('#tip-amount').value), () => { closeSheet(true); show('tracking', f.dataset.id); toast('شكرًا — الفني هيعرف'); });
    if (f.id === 'deviceForm') {
      const body = { item: f.querySelector('#dv-item').value, brand: f.querySelector('#dv-brand').value, year: f.querySelector('#dv-year').value };
      return apiCall('dv-add', btn, () => HSCustomerApi.addDevice(body), () => { closeSheet(true); show(state.lastShown ? state.lastShown.name : 'account'); toast('اتضاف لبيتك'); });
    }
  });

  /** runs after a screen is shown */
  function hydrate(name, arg) {
    try {
      if (name === 'tracking') { const r = MP.get('serviceRequests', arg); if (r) { hydratePhotos(r.id); if (MP.providerOf(r.id)) hydrateChat(r); } }
      else if (offTyping) { offTyping(); offTyping = null; typingFor = ''; }
      if (name === 'providerDetails') hydratePortfolio(arg);
    } catch (e) { /* screens stay usable without the extras */ }
  }

  /* round 11: warranty certificate — the «paid through the platform» promise made visible; printable / screenshot-able */
  function warrantyCert(r) {
    if (!r || r.warrantyOf || !r.warrantyUntil || !['completed', 'closed'].includes(r.status) || Date.parse(r.warrantyUntil) < Date.now()) return '';
    const p = MP.providerOf(r.id) || {}, c = MP.get('customers', r.customerId) || {};
    const done = (r.history || []).slice().reverse().find((h) => h.s === 'completed');
    return `<details class="w-cert"><summary>${ic('shield')} شهادة الضمان</summary>
      <div class="w-cert-card" role="group" aria-label="شهادة ضمان الطلب ${esc(r.no)}">
        <div class="w-cert-head"><b>شهادة ضمان</b><small>هنصلحلك</small></div>
        <dl>
          <div><dt>رقم الطلب</dt><dd>#${esc(r.no)}</dd></div>
          <div><dt>الخدمة</dt><dd>${esc(r.serviceName || '')}</dd></div>
          ${c.name ? `<div><dt>العميل</dt><dd>${esc(c.name)}</dd></div>` : ''}
          ${p.name ? `<div><dt>الفني</dt><dd>${esc(p.name)}</dd></div>` : ''}
          ${done ? `<div><dt>تاريخ التنفيذ</dt><dd>${esc(dayFmt(done.at))}</dd></div>` : ''}
          <div><dt>الضمان لحد</dt><dd><b>${esc(dayFmt(r.warrantyUntil))}</b></dd></div>
        </dl>
        <p class="w-cert-terms">الضمان على المصنعية. لو المشكلة رجعت خلال المدة، الفني بيرجع من غير تكلفة شغل — ولو ما رجعش، المنصة بتبعت فني تاني على حسابه. الضمان ساري لأن الطلب والدفع اتعملوا من خلال المنصة.</p>
        <button type="button" class="cta ghost" data-act="printCert">${ic('save')} احفظ الشهادة</button>
      </div></details>`;
  }
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-act="printCert"]'); if (!b) return; e.preventDefault(); try { root.print(); } catch { /* print unavailable */ } });
  root.HSTrust = Object.freeze({ RV_TAGS, arrivalCard, warrantyStrip, warrantyCert, tipCard, photosSlot, seenLabel, tagCounts, tagChips, portfolioSlot, homeReminder, myHome, hydrate, live });
})(typeof globalThis !== 'undefined' ? globalThis : this);
