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
    {q:'هل بياناتي آمنة؟', a:'في الوضع التجريبي تُحفظ بياناتك على جهازك فقط. عند التكامل مع Backend ستُحدَّث السياسة.'}
  ];

  /* ═════════ الشاشة الرئيسية ═════════ */
  const render = () => {
    const u = meUser();
    const complaints = u ? MP.db().complaints.filter(k => isMine(k, u)) : [];
    const openTickets = complaints.filter(k => k.status === 'open').length;
    return `<div class="screen">${typeof head === 'function' ? head('مركز الدعم', true) : ''}
      <div class="demo-banner">${safeIc('info')}<span>وضع العرض التجريبي — الشكاوى تُحفظ محليًا ولا تُرسل لفريق دعم حقيقي.</span></div>
      ${openTickets ? `<div class="need">${safeIc('info')}<span>لديك ${openTickets} شكوى/شكاوى مفتوحة — يمكنك متابعتها من "سجل الشكاوى".</span></div>` : ''}
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
      <div class="sub">سيتم حفظها محليًا في الوضع التجريبي</div>
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
  const openContact = () => {
    if (typeof sheet !== 'function') return;
    sheet(`<h4>${safeIc('chat')} التواصل مع الدعم</h4>
      <div class="sub">في الوضع التجريبي، هذه قنوات محاكاة فقط</div>
      <div class="card2 glass neon">
        <div class="top"><b>${safeIc('call')} هاتف</b></div>
        <small>متاح تجريبيًا: 9 صباحًا - 9 مساءً</small>
        <div class="kv">01234567890</div>
      </div>
      <div class="card2 glass neon">
        <div class="top"><b>${safeIc('chat')} واتساب</b></div>
        <small>تواصل سريع عبر واتساب</small>
        <div class="kv">01234567890</div>
      </div>
      <div class="card2 glass neon">
        <div class="top"><b>${safeIc('send')} بريد إلكتروني</b></div>
        <small>support@hansalhak.demo</small>
      </div>
      <div class="demo-banner">${safeIc('info')}<span>عند التكامل مع Backend، ستظهر أرقام الدعم الفعلية.</span></div>`);
  };

  /* ═════════ السياسات ═════════ */
  const POLICIES = {
    cancel: {title:'سياسة الإلغاء', body: `يمكنك إلغاء الطلب مجانًا قبل بدء تنفيذ الخدمة. بعد بدء التنفيذ، يتم التعامل مع طلب الإلغاء بالتنسيق مع مقدم الخدمة وفريق الدعم. قد تُطبق رسوم معاينة إن تمت الزيارة. في حال عدم الاتفاق على السعر بعد المعاينة، يمكنك رفض العرض دون أي التزام.`},
    privacy: {title:'سياسة الخصوصية', body: `في الوضع التجريبي، تُحفظ جميع بياناتك (الاسم، الهاتف، العنوان، الطلبات) على جهازك فقط باستخدام LocalStorage وIndexedDB. لا تُرسل البيانات إلى أي خادم خارجي. عند إتمام التكامل مع Backend، سيتم تحديث هذه السياسة لتوضح كيفية حماية البيانات وتشفيرها.`},
    terms: {title:'شروط الاستخدام', body: `هنصلحلك منصة وسيطة تربط العملاء بمقدمي الخدمات. المنصة لا تقدم الخدمات مباشرة، ولا تتحمل مسؤولية جودة التنفيذ. يتم التحقق من مقدمي الخدمة قدر الإمكان، لكن التعاقد النهائي للخدمة بينك وبين مقدم الخدمة. أي نزاع يُرفع للدعم لتسهيل الحل. الأسعار المعروضة تقديرية، والسعر النهائي يُحدَّد بعد المعاينة.`}
  };

  const openPolicy = (kind) => {
    const p = POLICIES[kind];
    if (!p) return;
    if (typeof sheet !== 'function') return;
    sheet(`<h4>${safeIc('book')} ${_esc(p.title)}</h4>
      <div class="card2 glass neon" style="padding:14px">
        <div style="font-size:13.5px;line-height:1.7;color:#eadfe7">${_esc(p.body)}</div>
      </div>
      <div class="demo-banner">${safeIc('info')}<span>نص تجريبي — عند التشغيل الفعلي، ستحتاج لصياغة قانونية.</span></div>`);
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
      case 'contact': openContact(); break;
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