/**
 * MODULE: callcenter.page — «الكول سنتر» in the Admin shell (owner / admin / the `callcenter` role: callcenter.view).
 * One caller at a time: phone search → caller card + their requests (status, cancel with the travel-fee confirmation,
 * complaint) → «طلب جديد للمتصل» (category → item → problem, address, time) → recent call logs and hand-off tickets.
 * Data: HSApiClient → /agent/* (server: functions/src/agent-gateway.js — the same routes the AI voice agent uses through
 * the https function agentApi). No customer list is ever loaded. Existing admin classes only (no new styles).
 * STATUS: IMPLEMENTED (server routes; in the local demo the routes do not exist and the page says so).
 */
'use strict';
(function (root) {
  const S = root.HSAdminShell;
  if (!S || typeof S.registerPage !== 'function') return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const req = (method, path, opts) => (root.HSApiClient ? root.HSApiClient.request(method, path, opts || {}) : Promise.resolve({ ok: false, error: { message: 'الخدمة غير متاحة' } }));
  const errText = (r) => {
    const e = r && r.error; if (!e) return 'حصل خطأ، جرّب تاني';
    return e.message + (e.details && typeof e.details === 'object' && e.code === 'VALIDATION' ? ' — ' + Object.entries(e.details).map(([k, v]) => k + ': ' + v).join('، ') : '');
  };
  const when = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : ''; };
  const OUTCOME = { request_created: 'طلب جديد', status_given: 'استعلام عن حالة', cancelled: 'إلغاء', complaint: 'شكوى', handoff: 'تحويل لموظف', info: 'استفسار', dropped: 'المكالمة فصلت', other: 'أخرى' };
  const PERIOD = { morning: 'الصبح', noon: 'الضهر', evening: 'بالليل' };

  function render() {
    const wrap = root.document.createElement('div'); wrap.className = 'ops';
    let caller = null, catalog = null;
    const st = { phone: '' };
    const say = (m) => { const n = wrap.querySelector('[data-cc-status]'); if (n) n.textContent = m || ''; };

    const reqRow = (r) => `<li class="ops-tk" data-cc-req="${esc(r.id)}"><details><summary><strong>${esc(r.no || r.id)} — ${esc(r.serviceName)}</strong>
        <small class="ord-muted">${esc(r.statusLabel)} · ${esc(r.gov)}${r.area ? '، ' + esc(r.area) : ''} · ${esc(when(r.createdAt))}${r.source === 'callcenter' ? ' · من الكول سنتر' : ''}</small></summary>
        <div class="ops-al-acts"><button type="button" class="adm-btn" data-cc-status-of="${esc(r.id)}">الحالة دلوقتي</button>
        ${r.open ? `<button type="button" class="adm-btn" data-cc-cancel="${esc(r.id)}">إلغاء الطلب</button>` : ''}</div>
        <p role="status" aria-live="polite" data-cc-detail="${esc(r.id)}"></p></details></li>`;

    function callerHtml() {
      if (!caller) return '';
      if (!caller.found) return `<section class="ops-new" aria-labelledby="cc-c-t"><h2 id="cc-c-t">رقم جديد</h2><p>مفيش حساب بالرقم ${esc(caller.phone)} — اعمل له طلب جديد من تحت وهيتعمل الحساب تلقائي.</p></section>`;
      const c = caller.customer;
      return `<section class="ops-new" aria-labelledby="cc-c-t"><h2 id="cc-c-t">${esc(c.name)} <small class="ord-muted">${esc(c.phone)}${c.status === 'suspended' ? ' · موقوف' : ''}</small></h2>
        ${caller.requests.length ? `<ul class="ops-list">${caller.requests.map(reqRow).join('')}</ul>` : '<p class="ord-muted">مفيش طلبات قبل كده.</p>'}
        <form data-cc-complaint><h3>شكوى من المتصل</h3>
          <label class="hs-grid-field"><span>الطلب (اختياري)</span><select name="requestId"><option value="">شكوى عامة</option>${caller.requests.map((r) => `<option value="${esc(r.id)}">${esc(r.no || r.id)} — ${esc(r.serviceName)}</option>`).join('')}</select></label>
          <label class="hs-grid-field"><span>تفاصيل الشكوى</span><textarea name="text" rows="2" minlength="5" maxlength="1000" required></textarea></label>
          <p><button type="submit" class="adm-btn">سجّل الشكوى</button></p></form></section>`;
    }

    function newRequestHtml() {
      if (!caller) return '';
      const cats = catalog ? catalog.categories : [];
      const govs = catalog ? catalog.govs : [];
      return `<form class="ops-new" data-cc-new aria-labelledby="cc-n-t"><h2 id="cc-n-t">طلب جديد للمتصل</h2>
        <label class="hs-grid-field"><span>اسم المتصل</span><input name="name" minlength="2" maxlength="60" required value="${esc(caller.found ? caller.customer.name : '')}"></label>
        <label class="hs-grid-field"><span>التصنيف</span><select name="cat" required><option value="">اختار</option>${cats.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
        <label class="hs-grid-field"><span>البند</span><select name="item" required><option value="">اختار التصنيف الأول</option></select></label>
        <label class="hs-grid-field"><span>المشكلة</span><select name="problem"><option value="">مش واضحة — تشخيص بالمعاينة</option></select></label>
        <p class="ord-muted" data-cc-price></p>
        <label class="hs-grid-field"><span>وصف المشكلة</span><textarea name="desc" rows="2" maxlength="2000"></textarea></label>
        <label class="hs-grid-field"><span>المحافظة</span><select name="gov" required><option value="">اختار</option>${govs.map((g) => `<option>${esc(g)}</option>`).join('')}</select></label>
        <label class="hs-grid-field"><span>المنطقة</span><input name="area" maxlength="60"></label>
        <label class="hs-grid-field"><span>العنوان بالتفصيل</span><input name="addr" minlength="5" maxlength="300" required></label>
        <label class="hs-grid-field"><span>اليوم (اختياري)</span><input type="date" name="when"></label>
        <label class="hs-grid-field"><span>الفترة</span><select name="period"><option value="">أي وقت</option>${Object.entries(PERIOD).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <p class="ord-muted">أكّد العنوان والميعاد مع المتصل قبل الإرسال. متقولش سعر غير اللي ظاهر هنا.</p>
        <p><button type="submit" class="adm-btn adm-btn-p">ابعت الطلب</button></p></form>`;
    }

    async function loadLists() {
      const host = wrap.querySelector('[data-cc-lists]'); if (!host) return;
      const [calls, hands] = await Promise.all([req('GET', '/agent/calls'), req('GET', '/agent/handoffs')]);
      const callLi = (c) => `<li class="ops-tk"><strong>${esc(OUTCOME[c.outcome] || c.outcome)}</strong> <small class="ord-muted">${esc(c.from)} · ${c.channel === 'ai' ? 'المساعد الصوتي' : 'موظف'} · ${esc(when(c.startedAt))}</small>${c.summary ? `<p>${esc(c.summary)}</p>` : ''}</li>`;
      const handLi = (t) => `<li class="ops-tk is-${esc(t.priority)}"><strong>${esc(t.title)}</strong> <small class="ord-muted">${esc(t.phone)} · ${esc(when(t.createdAt))}${t.owner ? ' · مع ' + esc(t.owner) : ''} · ${t.status === 'done' ? 'خلص' : t.status === 'doing' ? 'بيتعمل عليه' : 'جديد'}</small></li>`;
      host.innerHTML = `<section aria-labelledby="cc-h-t"><h2 id="cc-h-t">تحويلات لموظف</h2>${hands.ok && hands.data.items.length ? `<ul class="ops-list">${hands.data.items.map(handLi).join('')}</ul>` : `<p class="ord-muted">${hands.ok ? 'مفيش تحويلات.' : esc(errText(hands))}</p>`}
        <p><a href="#/tickets">كل البلاغات</a></p></section>
        <section aria-labelledby="cc-l-t"><h2 id="cc-l-t">آخر المكالمات</h2>${calls.ok && calls.data.items.length ? `<ul class="ops-list">${calls.data.items.map(callLi).join('')}</ul>` : `<p class="ord-muted">${calls.ok ? 'مفيش مكالمات مسجّلة.' : esc(errText(calls))}</p>`}</section>`;
    }

    function paint() {
      wrap.innerHTML = `<form class="ops-bar" data-cc-search role="search" aria-label="بحث برقم المتصل">
          <label class="hs-grid-field"><span>رقم المتصل</span><input name="phone" type="tel" inputmode="tel" autocomplete="off" required pattern="[0-9+ ]{11,16}" value="${esc(st.phone)}" placeholder="01xxxxxxxxx"></label>
          <button type="submit" class="adm-btn adm-btn-p">ابحث</button></form>
        <p role="status" aria-live="polite" data-cc-status></p>
        ${callerHtml()}${newRequestHtml()}
        <div data-cc-lists><p class="ord-muted">جارٍ تحميل المكالمات والتحويلات…</p></div>`;
      loadLists();
    }

    async function search(phone) {
      st.phone = phone; say('بندوّر…');
      const [r, cat] = await Promise.all([req('POST', '/agent/lookup', { body: { phone } }), catalog ? Promise.resolve({ ok: true, data: catalog }) : req('GET', '/agent/catalog')]);
      if (!r.ok) { say(errText(r)); return; }
      if (cat.ok) catalog = cat.data;
      caller = r.data; paint();
      say(caller.found ? 'لقيت المتصل — ' + caller.requests.length + ' طلب.' : 'رقم جديد.');
    }

    wrap.addEventListener('change', (e) => {
      const f = e.target.form; if (!f || !f.hasAttribute('data-cc-new') || !catalog) return;
      const cat = catalog.categories.find((c) => c.id === f.cat.value);
      if (e.target.name === 'cat') {
        f.item.innerHTML = '<option value="">اختار</option>' + (cat ? cat.items.map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('') : '');
        f.problem.innerHTML = '<option value="">مش واضحة — تشخيص بالمعاينة</option>';
      }
      if (e.target.name === 'cat' || e.target.name === 'item') {
        const it = cat && cat.items.find((i) => i.id === f.item.value);
        if (e.target.name === 'item') f.problem.innerHTML = '<option value="">مش واضحة — تشخيص بالمعاينة</option>' + (it ? it.problems.filter((p) => !/\/other$/.test(p.id)).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') : '');
        const out = wrap.querySelector('[data-cc-price]');
        if (out) out.textContent = it ? (it.price != null ? 'السعر للعميل: ' + it.price + ' ج.م' : 'السعر بيتحدد بعد المعاينة' + (catalog.fees.visitFee ? ' (رسوم المعاينة ' + catalog.fees.visitFee + ' ج.م)' : '')) : '';
      }
    });

    wrap.addEventListener('submit', async (e) => {
      const f = e.target; e.preventDefault();
      if (f.hasAttribute('data-cc-search')) return search(f.phone.value.trim());
      if (f.hasAttribute('data-cc-new')) {
        const body = { phone: st.phone, name: f.name.value, cat: f.cat.value, item: f.item.value, problem: f.problem.value, desc: f.desc.value, gov: f.gov.value, area: f.area.value, addr: f.addr.value, when: f.when.value, period: f.period.value };
        const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
        const r = await req('POST', '/agent/requests', { body });
        btn.disabled = false;
        if (!r.ok) return say(errText(r));
        await search(st.phone); return say('اتعمل الطلب ' + (r.data.no || '') + ' — ' + r.data.statusLabel + '.');
      }
      if (f.hasAttribute('data-cc-complaint')) {
        const r = await req('POST', '/agent/complaints', { body: { phone: st.phone, requestId: f.requestId.value, kind: 'callcenter', text: f.text.value } });
        if (!r.ok) return say(errText(r));
        f.reset(); say('اتسجّلت الشكوى وفريق العمليات هيتابعها.');
      }
    });

    wrap.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.ccStatusOf) {
        const id = b.dataset.ccStatusOf, out = wrap.querySelector(`[data-cc-detail="${CSS.escape(id)}"]`);
        const r = await req('GET', '/agent/requests/' + encodeURIComponent(id), { query: { phone: st.phone } });
        if (out) out.textContent = r.ok ? r.data.statusLabel + ' — ' + r.data.nextStep + (r.data.provider ? ' · الفني: ' + r.data.provider : '') + (r.data.eta ? ' · الوصول خلال ~' + r.data.eta.minutes + ' دقيقة' : '') + (r.data.cancelFee ? ' · الإلغاء دلوقتي عليه رسوم انتقال ' + r.data.cancelFee + ' ج.م' : '') : errText(r);
      }
      if (b.dataset.ccCancel) {
        const id = b.dataset.ccCancel;
        const reason = root.prompt ? root.prompt('سبب الإلغاء (من المتصل):', '') : '';
        if (!reason) return;
        let r = await req('POST', '/agent/requests/' + encodeURIComponent(id) + '/cancel', { body: { phone: st.phone, reason } });
        if (!r.ok && r.error && r.error.code === 'FEE_CONFIRMATION_REQUIRED') {
          /* the fee is read to the caller first; only their «موافق» confirms it */
          if (!root.confirm || !root.confirm('اقرأ للمتصل: الإلغاء دلوقتي عليه رسوم انتقال ' + r.error.details.fee + ' ج.م لأن الفني في الطريق. المتصل وافق؟')) return say('ما اتلغاش الطلب.');
          r = await req('POST', '/agent/requests/' + encodeURIComponent(id) + '/cancel', { body: { phone: st.phone, reason, confirmFee: true } });
        }
        if (!r.ok) return say(errText(r));
        await search(st.phone); say('اتلغى الطلب' + (r.data.cancelFee ? ' (رسوم انتقال ' + r.data.cancelFee + ' ج.م)' : '') + '.');
      }
    });

    paint();
    return wrap;
  }

  S.registerPage('callcenter', { title: 'الكول سنتر', description: 'ابحث برقم المتصل، اعمل له طلب، تابع أو الغي طلباته، سجّل شكوى — نفس قواعد التطبيق.', render });
})(typeof window !== 'undefined' ? window : globalThis);
