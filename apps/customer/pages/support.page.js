/* ═══════════════════════════════════════════════════════════════
   هنصلحلك — مركز الدعم والشكاوى والثقة — V7 — ملف جديد
   ───────────────────────────────────────────────────────────────
   الغرض:
   • مركز دعم متكامل: الأسئلة الشائعة، التواصل، الشكاوى، الإبلاغ،
     سياسات (الإلغاء، الخصوصية، الشروط).
   • يعيد استخدام: MP (بيانات)، AT (مرفقات)، HS_SEARCH (اختياري).
   • يُستدعى من القائمة الرئيسية (app.js → openMenu) أو من بطاقة الطلب.
   • يُدعم ربط الشكوى برقم الطلب + الإبلاغ عن مزود.

   الواجهة العامة:
   • Support.open()              — فتح مركز الدعم
   • Support.openComplaint(reqId?)  — نموذج شكوى
   • Support.openReport(providerId?) — الإبلاغ عن مزود
   • Support.openFaq()           — الأسئلة الشائعة
   • Support.openContact()       — التواصل
   • Support.openPolicy(kind)    — سياسة/شروط

   ملاحظات:
   • لا Backend — الرسائل تُسجَّل في db.complaints بنوع kind مختلف.
   • السياسات نصوص تجريبية وليست إلزامية قانونيًا.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const Support = (() => {
  const _esc = (typeof esc === 'function') ? esc : (s => String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));
  const safeIc = (n, cls) => (typeof ic === 'function') ? ic(n, cls) : '';
  const safeIcp = (n, kind, cls) => (typeof icp === 'function') ? icp(n, kind, cls) : '';

  const meUser = () => (typeof me === 'function') ? me() : null;

  /* ═════════ بيانات الأسئلة الشائعة (Demo) ═════════ */
  const FAQ = [
    {q:'كيف أطلب خدمة؟', a:'من الصفحة الرئيسية اختر القسم أو استخدم البحث، اختر الجهاز والمشكلة، أجب عن الأسئلة، حدد موقعك وموعدك، ثم أرسل الطلب.'},
    {q:'هل الأسعار نهائية؟', a:'الأسعار تقديرية. الفني يحدد التكلفة النهائية بعد المعاينة. تُعرض عليك للموافقة قبل بدء العمل.'},
    {q:'كيف أتابع طلبي؟', a:'من تبويب "طلباتي" اضغط على أي طلب لفتح صفحة المتابعة حيث تظهر الحالة الحالية وسجل التغييرات.'},
    {q:'هل يمكنني إلغاء الطلب؟', a:'يمكنك الإلغاء قبل بدء الخدمة. بعد البدء، تواصل مع الدعم لحل الأمر مع الفني.'},
    {q:'كيف أقيّم الفني؟', a:'بعد إغلاق الطلب، يظهر زر "قيّم مقدم الخدمة" في صفحة المتابعة. اختر النجوم وأضف تعليقًا إن أردت.'},
    {q:'ماذا أفعل لو تأخر الفني؟', a:'استخدم زر "تقديم شكوى" من صفحة الطلب. فريق الدعم سيتواصل معك.'},
    {q:'كيف أضيف عنوانًا محفوظًا؟', a:'من "حسابي" ← "إدارة العناوين" ← "إضافة عنوان جديد". سيظهر في خطوة الموقع أثناء الطلب.'},
    {q:'هل بياناتي آمنة؟', a:(globalThis.HSFirebaseConfig&&globalThis.HSFirebaseConfig.mode==='firebase')?'أيوه. بياناتك محفوظة على خوادم مؤمَّنة، والفني ما بيشوفش عنوانك ورقمك غير بعد ما يقبل طلبك.':'في الوضع التجريبي تُحفظ بياناتك على جهازك فقط. عند التكامل مع Backend ستُحدَّث السياسة.'}
  ];

  /* ═════════ الشاشة الرئيسية ═════════ */
  const render = () => {
    const u = meUser();
    const complaints = u ? MP.db().complaints.filter(k => isMine(k, u)) : [];
    const openTickets = complaints.filter(k => k.status === 'open').length;
    return `<div class="screen">${typeof head === 'function' ? head('مركز الدعم', true) : ''}
      ${(globalThis.HSFirebaseConfig&&globalThis.HSFirebaseConfig.mode==='firebase')?'':`<div class="demo-banner">${safeIc('info')}<span>وضع العرض التجريبي — الشكاوى تُحفظ محليًا ولا تُرسل لفريق دعم حقيقي.</span></div>`}
      ${openTickets ? `<div class="need">${safeIc('info')}<span>لديك ${openTickets} شكوى/شكاوى مفتوحة — يمكنك متابعتها من "سجل الشكاوى".</span></div>` : ''}
      ${globalThis.HSSupportChat && globalThis.HSSupportChat.enabled() ? `<button type="button" class="hc-entry" data-chat-open>${safeIc('chat')}<span><b>اسأل مساعد هنصلحلك</b><small>${globalThis.HSSupportChat.live() ? 'بيرد فورًا 24 ساعة — يتابع طلبك ويجهّزلك طلب أو إلغاء بتأكيدك' : 'نسخة تجريبية — ردود ثابتة على جهازك'}</small></span>${safeIc('chev','chev')}</button>` : ''}
      <div class="plist" style="gap:8px;margin-top:14px">
        <button class="prow glass neon" data-support="faq">
          ${safeIcp('info','sv')}
          <span class="tx">الأسئلة الشائعة<small>إجابات سريعة على أكثر الأسئلة</small></span>
          ${safeIc('chev','chev')}
        </button>
        <button class="prow glass neon" data-support="complaint">
          ${safeIcp('warn','pr')}
          <span class="tx">تقديم شكوى<small>أبلغنا عن مشكلة مع طلب أو فني</small></span>
          ${safeIc('chev','chev')}
        </button>
        <button class="prow glass neon" data-support="history">
          ${safeIcp('list','sv')}
          <span class="tx">سجل الشكاوى (${complaints.length})<small>متابعة الشكاوى السابقة</small></span>
          ${safeIc('chev','chev')}
        </button>
        <button class="prow glass neon" data-support="contact">
          ${safeIcp('chat','sv')}
          <span class="tx">التواصل مع الدعم<small>طرق مباشرة للتواصل</small></span>
          ${safeIc('chev','chev')}
        </button>
        <button class="prow glass neon" data-support="report">
          ${safeIcp('shield','pr')}
          <span class="tx">الإبلاغ عن مقدم خدمة<small>سلوك غير لائق أو مشكلة جسيمة</small></span>
          ${safeIc('chev','chev')}
        </button>
      </div>
      <h2 class="sec-title">${safeIc('book')}السياسات</h2>
      <div class="plist" style="gap:8px">
        <button class="prow glass neon" data-support="policy-cancel">
          ${safeIcp('cancel','st')}
          <span class="tx">سياسة الإلغاء</span>${safeIc('chev','chev')}
        </button>
        <button class="prow glass neon" data-support="policy-privacy">
          ${safeIcp('shield','st')}
          <span class="tx">سياسة الخصوصية</span>${safeIc('chev','chev')}
        </button>
        <button class="prow glass neon" data-support="policy-terms">
          ${safeIcp('book','st')}
          <span class="tx">شروط الاستخدام</span>${safeIc('chev','chev')}
        </button>
      </div>
    </div>`;
  };

  /* ═════════ الأسئلة الشائعة ═════════ */
  const openFaq = () => {
    if (typeof sheet !== 'function') return;
    sheet(`<h4>${safeIc('info')} الأسئلة الشائعة</h4><div class="sub">اضغط على السؤال لعرض الإجابة</div>
      ${FAQ.map((f, i) => `<details class="gd">
        <summary><span>${_esc(f.q)}</span>${safeIc('chev','chev')}</summary>
        <div class="gd-in"><div class="cause">${_esc(f.a)}</div></div>
      </details>`).join('')}`);
  };

  /* ═════════ نموذج شكوى ═════════ */
  const openComplaint = (reqId) => {
    const u = meUser();
    const myReqs = u ? MP.reqs().filter(r => r.customerId === u.id) : [];
    if (typeof sheet !== 'function') return;
    sheet(`<h4>${safeIc('warn')} تقديم شكوى</h4>
      <div class="sub">${(globalThis.HSFirebaseConfig&&globalThis.HSFirebaseConfig.mode==='firebase')?'فريق الدعم هيراجعها ويرد عليك في الإشعارات':'سيتم حفظها محليًا في الوضع التجريبي'}</div>
      <form class="form" id="supComplaintForm">
        <div><label for="sup-kind">نوع الشكوى *</label>
          <select id="sup-kind" name="kind" required>
            <option value="quality">جودة الخدمة</option>
            <option value="delay">تأخر في الموعد</option>
            <option value="price">خلاف على السعر</option>
            <option value="behavior">سلوك غير لائق</option>
            <option value="damage">تلف بالممتلكات</option>
            <option value="other">أخرى</option>
          </select>
        </div>
        ${myReqs.length ? `<div><label for="sup-req">ربط برقم الطلب (اختياري)</label>
          <select id="sup-req" name="reqId">
            <option value="">— بدون طلب —</option>
            ${myReqs.slice(0, 20).map(r => `<option value="${_esc(r.id)}" ${r.id === reqId ? 'selected' : ''}>#${_esc(r.no)} — ${_esc(r.serviceName)}</option>`).join('')}
          </select>
        </div>` : ''}
        <div><label for="sup-text">تفاصيل الشكوى *</label>
          <textarea id="sup-text" name="text" required minlength="10" maxlength="1000" placeholder="اشرح ما حدث بالتفصيل"></textarea>
        </div>
        <div><span class="lbl-like" id="sup-att-lbl">مرفقات (اختياري)</span>
          <div class="thumbs" id="sup-thumbs" role="list" aria-labelledby="sup-att-lbl"></div>
          <button type="button" class="cta ghost" style="min-height:44px" data-sup-add-photo>${safeIc('camera')} إضافة صورة</button>
        </div>
        <button class="cta" type="submit">${safeIc('send')} إرسال الشكوى</button>
      </form>`);
    _supPhotos = [];
  };
  let _supPhotos = [];

  /* ═════════ نموذج الإبلاغ عن مزود ═════════ */
  const openReport = (providerId) => {
    const provs = MP.db().providers.filter(p => p.status === 'approved');
    if (typeof sheet !== 'function') return;
    sheet(`<h4>${safeIc('shield')} الإبلاغ عن مقدم خدمة</h4>
      <div class="sub">سيتم مراجعة البلاغ من الإدارة</div>
      <form class="form" id="supReportForm">
        <div><label for="rep-provider">مقدم الخدمة *</label>
          <select id="rep-provider" name="providerId" required>
            <option value="">— اختر —</option>
            ${provs.map(p => `<option value="${_esc(p.id)}" ${p.id === providerId ? 'selected' : ''}>${_esc(p.name)} — ${p.cats.map(c => MP.catName(c)).join('، ')}</option>`).join('')}
          </select>
        </div>
        <div><label for="rep-kind">سبب الإبلاغ *</label>
          <select id="rep-kind" name="kind" required>
            <option value="behavior">سلوك غير لائق</option>
            <option value="fraud">احتيال أو تلاعب</option>
            <option value="damage">تلف بالممتلكات</option>
            <option value="safety">خطر على السلامة</option>
            <option value="other">أخرى</option>
          </select>
        </div>
        <div><label for="rep-text">تفاصيل *</label>
          <textarea id="rep-text" name="text" required minlength="10" maxlength="1000" placeholder="اشرح ما حدث"></textarea>
        </div>
        <button class="cta" type="submit">${safeIc('send')} إرسال البلاغ</button>
      </form>`);
  };

  /* ═════════ سجل الشكاوى ═════════ */
  const openHistory = () => {
    const u = meUser();
    if (!u) { toast('سجّل بياناتك أولًا'); return; }
    const myReqIds = new Set(MP.reqs().filter(r => r.customerId === u.id).map(r => r.id));
    const items = MP.db().complaints.filter(k => isMine(k, u));
    if (typeof sheet !== 'function') return;
    sheet(`<h4>${safeIc('list')} سجل الشكاوى (${items.length})</h4>
      ${items.length ? items.map(k => {
        const r = MP.get('serviceRequests', k.reqId);
        const kindLabel = {quality:'جودة', delay:'تأخر', price:'سعر', behavior:'سلوك', damage:'تلف', fraud:'احتيال', safety:'سلامة', other:'أخرى'}[k.kind] || 'شكوى';
        return `<div class="card2 glass neon">
          <div class="top"><b>${_esc(kindLabel)}</b>
            <span class="tag ${k.status === 'open' ? 'warn' : ''}">${k.status === 'open' ? 'مفتوحة' : 'تم الحل'}</span>
          </div>
          ${r ? `<small>طلب #${_esc(r.no)} — ${_esc(r.serviceName)}</small>` : ''}
          <small>${_esc(k.text)}</small>
          <small style="color:var(--muted)">${new Date(k.at).toLocaleString('ar-EG')}</small>
          ${k.resolution ? `<small style="color:#6ee7b7">القرار: ${_esc(k.resolution)}</small>` : ''}
        </div>`;
      }).join('') : `<div class="empty" style="padding:24px">${safeIc('shield')}<p>لا توجد شكاوى سابقة</p></div>`}`);
  };

  /* ═════════ التواصل ═════════ */
  /* Support channels come from Admin › الإعدادات (settings.support via shared/components/support-contacts.js); only the
     ones that are set are shown. The in-app message to support is always available. orderNo prefills WhatsApp. */
  const openContact = (orderNo) => {
    if (typeof sheet !== 'function') return;
    const SC = globalThis.HSSupportContacts;
    const channels = SC ? SC.html({ orderNo: orderNo || '', who: 'customer', cls: 'hs-contact', icon: safeIc }) : '';
    sheet(`<h4>${safeIc('chat')} التواصل مع الدعم</h4>
      <div class="sub">ابعتلنا استفسارك أو شكوتك من هنا، وفريق الدعم بيرد عليك في الإشعارات.</div>
      <button type="button" class="cta" data-support="complaint">${safeIc('send')} ابعت للدعم من التطبيق</button>
      ${channels ? `<div class="sub" style="margin-top:12px">أو كلّمنا مباشرة:</div>${channels}` : ''}`);
  };

  /* ═════════ السياسات ═════════ */
  const POLICIES = {
    cancel: {title:'سياسة الإلغاء والاسترداد', body: `يحق لك إلغاء الطلب دون أي رسوم ما دام مقدم الخدمة لم يتحرك إليك بعد. وبعد تحركه قد يُستحق رسم انتقال يُعرض عليك قبل تأكيد الإلغاء. وإذا رفضت السعر بعد المعاينة، فلا تلتزم إلا برسم المعاينة إن كان معلنًا.`},
    privacy: {title:'سياسة الخصوصية', body: `نجمع الحد الأدنى من البيانات اللازم لتقديم الخدمة، ونعالجها وفق قانون حماية البيانات الشخصية رقم 151 لسنة 2020. لا يطّلع مقدم الخدمة على عنوانك ورقم هاتفك إلا بعد قبوله طلبك، ولا نبيع بياناتك لأي جهة، ويحق لك الاطلاع على بياناتك وتصحيحها وحذف حسابك في أي وقت.`},
    terms: {title:'شروط الاستخدام', body: `«هنصلحلك» وسيط تقني يربط العميل بمقدم خدمة مستقل يتحمل مسؤولية تنفيذ العمل وجودته. السعر المتفق عليه لا يتغير إلا بموافقتك، والعمل المنفذ والمدفوع من خلال المنصة مشمول بضمان على المصنعية.`}
  };

  /* The full policy text lives in legal/*.html (one source for the website and the app). The sheet opens on the
     short summary, then replaces it with the page's full text (headings, lists) as soon as it is fetched; offline,
     the summary stays and «افتح الصفحة» links the page. */
  const POLICY_PAGE = { privacy: 'privacy.html', terms: 'terms.html', cancel: 'cancellation.html' };
  const policyHtml = (raw) => {
    try {
      const d = new DOMParser().parseFromString(raw, 'text/html'), m = d.querySelector('main'); if (!m) return '';
      m.querySelectorAll('script,style,iframe,object,embed,form,img,.links').forEach((n) => n.remove());
      m.querySelectorAll('*').forEach((n) => { [...n.attributes].forEach((a) => { if (/^on/i.test(a.name) || (a.name === 'href' && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); }); });
      const h1 = m.querySelector('h1'); if (h1) h1.remove();   // the sheet already has the title
      m.querySelectorAll('a[href]').forEach((a) => { const f = a.getAttribute('href'); if (/^[a-z]+\.html$/.test(f)) { a.setAttribute('href', '../../legal/' + f); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); } });
      return m.innerHTML;
    } catch (e) { return ''; }
  };
  const openPolicy = (kind) => {
    const p = POLICIES[kind];
    if (!p) return;
    if (typeof sheet !== 'function') return;
    const page = POLICY_PAGE[kind];
    sheet(`<h4>${safeIc('book')} ${_esc(p.title)}</h4>
      <div class="policy-text" data-policy-body>${page ? '' : `<p>${_esc(p.body)}</p>`}${page ? `<p>${_esc(p.body)}</p><p class="policy-loading" aria-live="polite">بنحمّل النص الكامل…</p>` : ''}</div>
      ${page ? `<p style="margin:10px 0 0"><a class="cta ghost" href="../../legal/${page}" target="_blank" rel="noopener">افتح الصفحة في نافذة</a></p>` : ''}`);
    if (!page || typeof fetch !== 'function') return;
    fetch('../../legal/' + page, { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : '')).then((raw) => {
      const html = raw && policyHtml(raw), box = document.querySelector('#sheet [data-policy-body]');
      if (box && html) box.innerHTML = html;
      else if (box) { const l = box.querySelector('.policy-loading'); if (l) l.remove(); }
    }).catch(() => { const l = document.querySelector('#sheet .policy-loading'); if (l) l.textContent = 'مش قادرين نحمّل النص الكامل دلوقتي — افتح الصفحة من الزرار اللي تحت.'; });
  };

  /* ═════════ الأحداث ═════════ */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-support],[data-sup-add-photo]');
    if (!t) return;
    const d = t.dataset;
    if (d.supAddPhoto !== undefined) {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true;
      i.onchange = async () => {
        if (typeof AT === 'undefined') return toast('المرفقات غير متاحة');
        const { added } = await AT.addFiles('', i.files, {draftId: 'support'});
        for (const rec of added) _supPhotos.push({id: rec.id, thumb: rec.thumb});
        const box = document.getElementById('sup-thumbs');
        if (box) box.innerHTML = _supPhotos.map(p => `<span class="th"><img src="${p.thumb}" alt=""></span>`).join('');
      };
      i.click();
      return;
    }
    switch (d.support) {
      case 'faq': openFaq(); break;
      case 'complaint': openComplaint(); break;
      case 'report': openReport(); break;
      case 'history': openHistory(); break;
      case 'contact': openContact(d.orderNo || ''); break;
      case 'policy-cancel': openPolicy('cancel'); break;
      case 'policy-privacy': openPolicy('privacy'); break;
      case 'policy-terms': openPolicy('terms'); break;
    }
  });

  /* Own complaints: filed through support-api (by = customer:<id>) or legacy records tied to own requests. */
  function isMine(k, u) {
    if (!u) return false;
    if (k.by === 'customer:' + u.id) return true;
    return k.by === 'customer' && MP.reqs().some(r => r.customerId === u.id && r.id === k.reqId);
  }

  /* ═════════ حفظ النماذج ═════════ */
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.id === 'supComplaintForm') {
      e.preventDefault();
      const d = new FormData(f);
      const reqId = (d.get('reqId') || '').trim();
      const kind = d.get('kind');
      const text = (d.get('text') || '').trim();
      if (text.length < 10) return toast('اكتب تفاصيل أكثر (10 حروف على الأقل)');
      apiCall('sup-complaint', f.querySelector('[type=submit]'), () => HSSupportApi.file(text, reqId, kind, { attachments: _supPhotos.map(x => x.id) }), () => {
        toast('تم إرسال الشكوى — سيتواصل معك فريق الدعم');
        if (typeof closeSheet === 'function') closeSheet();
        _supPhotos = [];
      });
    }
    if (f.id === 'supReportForm') {
      e.preventDefault();
      const d = new FormData(f);
      const pid = d.get('providerId');
      const kind = d.get('kind');
      const text = (d.get('text') || '').trim();
      if (!pid) return toast('اختر مقدم الخدمة');
      if (text.length < 10) return toast('اكتب تفاصيل أكثر');
      /* A report is a complaint of kind report:* about a provider (support-api validates the provider). */
      apiCall('sup-report', f.querySelector('[type=submit]'), () => HSSupportApi.file(text, '', 'report:' + kind, { providerId: pid }), () => {
        toast('تم إرسال البلاغ — سيتم مراجعته');
        if (typeof closeSheet === 'function') closeSheet();
      });
    }
  });

  return { render, openComplaint, openReport, openFaq, openContact, openPolicy, openHistory };
})();

/* ربط screens.support (اختياري — للاستدعاء المباشر) */
if (typeof screens !== 'undefined' && screens) {
  screens.support = () => Support.render();
}