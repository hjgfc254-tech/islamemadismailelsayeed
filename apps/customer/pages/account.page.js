/* ═══════════════════════════════════════════════════════════════
   هنصلحلك — حساب العميل الكامل (Account) — V7 — ملف جديد
   ───────────────────────────────────────────────────────────────
   الغرض:
   • شاشات حساب العميل: ملف شخصي، طلباتي، المفضلة، الإشعارات، التقييمات، الإعدادات.
   • تعيد استخدام: MP (بيانات)، AT (مرفقات)، Addresses (شاشة العناوين).
   • تُستخدم من app.js عبر screens.account (تُستبدل في هذا الملف).
   • التبويبات الداخلية تُدار عبر state.accountTab.

   الواجهة العامة:
   • Account.render()          — HTML الشاشة الرئيسية (تُستدعى من screens.account)
   • Account.tab(name)         — التنقل بين التبويبات دون إعادة تحميل
   • Account.openProfile()     — نموذج تعديل الملف الشخصي
   • Account.openSettings()    — شاشة الإعدادات
   • Account.openDelete()      — تأكيد حذف الحساب (تجريبي)

   ملاحظات:
   • التقييمات هنا = سجل تقييمات العميل السابقة (عرض فقط + رابط لتقييم جديد عند الحاجة).
   • الإعدادات = تفضيلات إشعارات محلية فقط (لا Backend).
   • حذف الحساب = واجهة تأكيد + تنظيف محلي فقط.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const Account = (() => {
  const _esc = (typeof esc === 'function') ? esc : (s => String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));
  const safeIc = (n, cls) => (typeof ic === 'function') ? ic(n, cls) : '';
  const safeIcp = (n, kind, cls) => (typeof icp === 'function') ? icp(n, kind, cls) : '';
  const safeIcSec = (n) => (typeof icSec === 'function') ? icSec(n) : n;

  const TABS = [
    ['orders',    'طلباتي',   'list'],
    ['favorites', 'المفضلة',  'heart'],
    ['notifs',    'الإشعارات','bell'],
    ['reviews',   'تقييماتي', 'medal'],
    ['profile',   'الملف',    'user'],
    ['settings',  'الإعدادات','settings']
  ];

  const typeLabel = t => ({home:'منزل', work:'عمل', other:'أخرى'})[t] || 'منزل';

  /* ═════════ أدوات ═════════ */
  const meUser = () => (typeof me === 'function') ? me() : null;

  /* ═════════ تبويب: طلباتي ═════════ */
  const tabOrders = () => {
    const u = meUser(); if (!u) return loginPrompt();
    const all = MP.reqs().filter(r => r.customerId === u.id);
    if (!all.length) {
      return `<div class="empty">${safeIc('list')}<p>لا توجد طلبات<br><small>ابدأ طلبك الأول من الرئيسية</small></p>
        <button class="cta" data-go="home">${safeIc('home')} اطلب خدمة</button></div>`;
    }
    const current = all.filter(r => !['closed','cancelled','failed'].includes(r.status));
    const past = all.filter(r => r.status === 'closed');
    const stopped = all.filter(r => ['cancelled','failed'].includes(r.status));
    const section = (title, items) => items.length ? `
      <h2 class="sec-title">${safeIc('list')}${title} (${items.length})</h2>
      <div class="plist">${items.map(reqRow).join('')}</div>` : '';
    return section('جارية', current) + section('مكتملة', past) + section('ملغاة / متعذرة', stopped);
  };

  const reqRow = (r) => {
    const stIco = (typeof icStatus === 'function') ? icStatus(r.status) : 'st-new';
    const label = (typeof STATUS_LABEL !== 'undefined') ? (STATUS_LABEL[r.status] || r.status) : r.status;
    return `<button class="prow glass neon" data-track="${_esc(r.id)}">
      ${safeIcp(stIco, 'st')}
      <span class="tx">${_esc(r.serviceName)}<small><bdi class="code">#${_esc(r.no)}</bdi> • ${fmtDTShort(r.createdAt)}</small></span>
      <span class="tag">${safeIc(stIco)} ${_esc(label)}</span>
    </button>`;
  };
  const fmtDTShort = s => {
    try { return new Date(s).toLocaleDateString('ar-EG-u-nu-latn', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}); }
    catch { return s || ''; }
  };

  /* ═════════ تبويب: المفضلة ═════════ */
  const tabFavorites = () => {
    const u = meUser(); if (!u) return loginPrompt();
    const favs = MP.favoritesFor(u.id);
    if (!favs.length) {
      return `<div class="empty">${safeIc('heart')}<p>لا توجد مفضلات<br><small>أضف مقدمي خدمة أو خدمات لتعود إليها بسرعة</small></p></div>`;
    }
    const provs = favs.filter(f => f.kind === 'provider').map(f => MP.get('providers', f.refId)).filter(Boolean);
    const services = favs.filter(f => f.kind === 'service');
    const provCards = provs.map(p => `
      <div class="card2 glass neon prov-card">
        <div class="top">
          <div class="prov-avatar" aria-hidden="true" style="background:${p.avatar || '#FF3D8F'}">${_esc((p.name||'?').split(' ').map(w=>w[0]).slice(0,2).join(''))}</div>
          <div class="prov-head">
            <b>${_esc(p.name)}</b>
            <small>${p.cats.map(c => MP.catName(c)).join('، ')}${p.rating ? ` • ★ ${p.rating}` : ''}</small>
          </div>
          <button class="fav-btn on" data-fav-provider="${_esc(p.id)}" aria-label="إزالة من المفضلة">${safeIc('heart')}</button>
        </div>
        <div class="acts">
          <button data-provider-details="${_esc(p.id)}">${safeIc('info')} التفاصيل</button>
          ${p.available ? `<button class="pri" data-choose-provider="${_esc(p.id)}">${safeIc('check')} اختيار</button>` : `<button disabled>${safeIc('clock')} غير متاح</button>`}
        </div>
      </div>`).join('');
    const svcCards = services.map(f => {
      const prob = (typeof CAT !== 'undefined') ? CAT.problem(f.refId) : null;
      const item = (typeof CAT !== 'undefined') ? CAT.item(f.refId) : null;
      const target = prob || item;
      if (!target) return '';
      const isProb = !!prob;
      return `<button class="prow glass neon" data-provider-service="${isProb ? 'problem' : 'item'}|${_esc(target.id)}">
        ${safeIcp(isProb ? 'p-diagnose' : 'wrench', 'pr')}
        <span class="tx">${_esc(target.name)}<small>${_esc((typeof CAT !== 'undefined' && CAT.category(target.cat) ? CAT.category(target.cat).name : ''))}</small></span>
        ${safeIc('chev','chev')}
      </button>`;
    }).join('');
    const visibleServices = svcCards.filter(Boolean).length;
    const unresolved = services.length - visibleServices;
    if (!provs.length && !visibleServices) return `<div class="empty">${safeIc('heart')}<p>لا توجد مفضلات قابلة للعرض حاليًا</p>${unresolved ? `<small>بعض العناصر المحفوظة من إصدار سابق لم تعد موجودة في الكتالوج الحالي.</small>` : ''}</div>`;
    return `
      ${provs.length ? `<h2 class="sec-title">${safeIc('user')}مقدمو خدمة (${provs.length})</h2><div class="plist" style="gap:10px">${provCards}</div>` : ''}
      ${visibleServices ? `<h2 class="sec-title">${safeIc('wrench')}خدمات محفوظة (${visibleServices})</h2><div class="plist">${svcCards.join('')}</div>` : ''}
      ${unresolved ? `<p class="hint">${unresolved} عنصر محفوظ من إصدار سابق لم يعد متاحًا في الكتالوج الحالي.</p>` : ''}
    `;
  };

  /* ═════════ تبويب: الإشعارات ═════════ */
  const tabNotifs = () => {
    const u = meUser(); if (!u) return loginPrompt();
    const ns = MP.notesFor('customer:' + u.id).slice(0, 30);
    if (!ns.length) return `<div class="empty">${safeIc('bell')}<p>لسه مفيش إشعارات<br><small>هنبلغك هنا بكل تحديث على طلباتك.</small></p></div>`;
    return `<div class="plist" style="gap:8px">${ns.map(n => `
      <div class="card2 glass neon" style="padding:12px">
        <div class="top"><b>${safeIc('bell')} إشعار</b>${!n.read ? '<span class="tag">جديد</span>' : ''}</div>
        <small>${_esc(n.text)}</small>
        <small style="color:var(--muted);font-size:11.5px">${fmtDTShort(n.at)}</small>
        ${n.reqId ? `<button class="cta ghost" style="min-height:38px;margin-top:6px" data-track="${_esc(n.reqId)}">${safeIc('clock')} متابعة الطلب</button>` : ''}
      </div>`).join('')}</div>`;
  };

  /* ═════════ تبويب: تقييماتي ═════════ */
  const tabReviews = () => {
    const u = meUser(); if (!u) return loginPrompt();
    const revs = MP.db().reviews.filter(r => r.customerId === u.id);
    if (!revs.length) return `<div class="empty">${safeIc('medal')}<p>لا توجد تقييمات بعد<br><small>قيّم الخدمات المكتملة لتساعد الآخرين</small></p></div>`;
    return `<div class="plist" style="gap:10px">${revs.map(v => {
      const p = MP.get('providers', v.providerId);
      const r = MP.get('serviceRequests', v.reqId);
      return `<div class="card2 glass neon">
        <div class="top"><b>${_esc(p ? p.name : '—')}</b>${r ? `<span class="tag"><bdi class="code">#${_esc(r.no)}</bdi></span>` : ''}</div>
        <div style="margin:4px 0">${typeof starsHtml === 'function' ? starsHtml(v.stars) : ''}</div>
        <small>${_esc(v.quality || '')}${v.comment ? ' • ' + _esc(v.comment) : ''}</small>
        <small style="color:var(--muted);font-size:11.5px">${fmtDTShort(v.at)}</small>
      </div>`;
    }).join('')}</div>`;
  };

  /* ═════════ تبويب: الملف الشخصي ═════════ */
  const tabProfile = () => {
    const u = meUser(); if (!u) return loginPrompt();
    const stat = (label, value) => `<div class="stat glass"><small>${label}</small><b>${value}</b></div>`;
    const all = MP.reqs().filter(r => r.customerId === u.id);
    const completed = all.filter(r => ['completed','closed'].includes(r.status)).length;
    const active = all.filter(r => !['closed','cancelled','failed'].includes(r.status)).length;
    return `<div class="profile glass neon">
        <div class="av">${_esc((u.name || '?')[0])}</div>
        <div>
          <b>${_esc(u.name)}</b>
          <small>${_esc(u.phone || '')}</small>
        </div>
        <button class="ic-btn" data-account-profile-edit aria-label="تعديل">${safeIc('edit')}</button>
      </div>
      <div class="stats" style="grid-template-columns:1fr 1fr 1fr">
        ${stat('الطلبات', all.length)}
        ${stat('الجارية', active)}
        ${stat('المكتملة', completed)}
      </div>
      <button class="cta ghost" data-go="addresses">${safeIc('pin')} إدارة العناوين (${MP.addressesFor(u.id).length})</button>
      ${globalThis.HSTrust ? HSTrust.myHome() : ''}
    `;
  };

  /* ═════════ تبويب: الإعدادات ═════════ */
  const tabSettings = () => {
    const u = meUser(); if (!u) return loginPrompt();
    const prefs = u.prefs || {notifyStatus:true, notifyQuotes:true, notifyReminders:true, preferredContact:'call'};
    const chk = (k, label) => `<label class="menu-item" style="cursor:pointer"><input type="checkbox" data-account-pref="${k}" ${prefs[k] ? 'checked' : ''} style="width:auto;margin-inline-end:8px">${label}</label>`;
    return `
      <div class="card2 glass neon">
        <b>${safeIc('bell')} تفضيلات الإشعارات</b>
        ${chk('notifyStatus','تحديثات حالة الطلب')}
        ${chk('notifyQuotes','عروض الأسعار')}
        ${chk('notifyReminders','تذكير المواعيد')}
      </div>
      <div class="card2 glass neon">
        <label for="account-preferred-contact"><b>${safeIc('call')} وسيلة التواصل المفضلة</b></label>
        <select id="account-preferred-contact" class="mini" data-account-contact>
          <option value="call" ${prefs.preferredContact === 'call' ? 'selected' : ''}>مكالمة هاتفية</option>
          <option value="whatsapp" ${prefs.preferredContact === 'whatsapp' ? 'selected' : ''}>واتساب</option>
          <option value="sms" ${prefs.preferredContact === 'sms' ? 'selected' : ''}>رسالة نصية</option>
        </select>
      </div>
      <div class="card2 glass neon">
        <b>${safeIc('search')} حجم الخط</b>
        <div class="seg seg-sm fs-seg" role="radiogroup" aria-label="حجم الخط">${[['', 'عادي'], ['lg', 'كبير'], ['xl', 'أكبر']].map(([v, l]) => `<label class="seg-opt"><input type="radio" name="fontSize" value="${v}" data-font-size ${(document.documentElement.getAttribute('data-fs') || '') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      </div>
      <div class="card2 glass neon">
        <b>${safeIc('shield')} الخصوصية والحساب</b>
        <button class="menu-item" data-account-logout>${safeIc('logout')} تسجيل الخروج</button>
        <button class="menu-item is-danger" data-account-delete>${safeIc('trash')} حذف الحساب</button>
      </div>
      <small class="hint" style="padding:10px 4px;display:block">${(globalThis.HSFirebaseConfig&&globalThis.HSFirebaseConfig.mode==='firebase')?'بياناتك محفوظة بأمان على خوادم هنصلحلك.':'جميع البيانات محفوظة محليًا على جهازك في الوضع التجريبي.'}</small>
    `;
  };

  /* ═════════ حالة: مستخدم غير مسجل ═════════ */
  /* Sign-in choices are visible up front (owner, 2026-11-15): quick (name + number, no code), email + password, or
     SMS code — plus browsing as a guest. Name + number are always asked (the provider needs a contact). */
  const loginPrompt = () => `<section class="auth-card" aria-labelledby="auth-title">
    <img class="auth-mark" src="../../assets/brand/hsl-mark.svg" alt="" width="56" height="56" decoding="async">
    <h2 id="auth-title" class="auth-title">سجّل دخولك أو أنشئ حسابًا</h2>
    <p class="auth-sub">خطوة واحدة وتقدر تطلب خدمتك وتتابعها.</p>
    <form class="form auth-form" id="loginFormAcc" data-method="quick">
      <div class="seg" role="radiogroup" aria-label="طريقة الدخول">
        <label class="seg-opt"><input type="radio" name="method" value="quick" checked><span>سريع</span></label>
        <label class="seg-opt"><input type="radio" name="method" value="email"><span>البريد</span></label>
        <label class="seg-opt"><input type="radio" name="method" value="phone"><span>كود SMS</span></label>
      </div>
      <p class="seg-hint" data-hint aria-live="polite">بالاسم ورقم الموبايل فقط — بدون كود أو كلمة مرور.</p>
      <div><label for="account-login-name">الاسم</label><input id="account-login-name" name="name" required placeholder="اسمك" autocomplete="name"></div>
      <div><label for="account-login-phone">رقم الموبايل</label><input id="account-login-phone" name="phone" required type="tel" inputmode="tel" dir="ltr" placeholder="01xxxxxxxxx" pattern="[0-9+ ]{8,15}" autocomplete="tel"></div>
      <div class="login-email" hidden>
        <div class="seg seg-sm" role="radiogroup" aria-label="نوع الدخول بالبريد">
          <label class="seg-opt"><input type="radio" name="mode" value="signup" checked disabled><span>حساب جديد</span></label>
          <label class="seg-opt"><input type="radio" name="mode" value="login" disabled><span>عندي حساب</span></label>
        </div>
        <div><label for="account-login-email">البريد الإلكتروني</label><input id="account-login-email" name="email" type="email" dir="ltr" autocomplete="email" placeholder="name@example.com" disabled required></div>
        <div><label for="account-login-password">كلمة المرور</label><input id="account-login-password" name="password" type="password" minlength="6" autocomplete="current-password" placeholder="6 أحرف على الأقل" disabled required></div>
      </div>
      <button class="cta auth-submit" type="submit" data-submit>متابعة</button>
      <div class="auth-or" aria-hidden="true"><span>أو</span></div>
      <button class="auth-guest" type="button" data-go="home">تصفح كزائر بدون تسجيل</button>
      <p class="auth-trust">${safeIc('shield')} بياناتك محمية، ولا يرى مقدم الخدمة رقمك إلا بعد قبول طلبك.</p><p class="auth-legal">بالمتابعة، فإنك توافق على <a href="../../legal/terms.html" target="_blank" rel="noopener">شروط الاستخدام</a> و<a href="../../legal/privacy.html" target="_blank" rel="noopener">سياسة الخصوصية</a> و<a href="../../legal/cancellation.html" target="_blank" rel="noopener">سياسة الإلغاء</a>.</p>
    </form>
  </section>`;

  /* ═════════ الرسم الرئيسي ═════════ */
  const render = () => {
    const u = meUser();
    const tab = (typeof state !== 'undefined' && state.accountTab) || 'orders';
    /* Tabs that fit are shown in equal cells (3 on phones, 4 on large phones, all from 720px — CSS); the rest sit in the
       «⋮» menu, so no section hides behind a sideways swipe. data-cur lets CSS light «⋮» when the current section is
       inside the menu at the current width. */
    const cur = Math.max(0, TABS.findIndex(([k]) => k === tab));
    const tabBar = u ? `<div class="subtabs account-tabs" role="group" aria-label="أقسام الحساب" data-cur="${cur}">
      ${TABS.map(([k, n, ico], i) => `<button type="button" aria-pressed="${tab === k}" class="acc-t acc-t${i}${tab === k ? ' on' : ''}" data-account-tab="${k}">${safeIc(ico)}<span>${_esc(n)}</span></button>`).join('')}
      <div class="acc-more-wrap">
        <button type="button" class="acc-more" data-acc-more aria-haspopup="menu" aria-expanded="false" aria-controls="acc-more-menu" aria-label="باقي أقسام الحساب">${safeIc('dots')}<span>المزيد</span></button>
        <div class="acc-menu" id="acc-more-menu" role="menu" aria-label="باقي أقسام الحساب" hidden>
          ${TABS.map(([k, n, ico], i) => (i < 3 ? '' : `<button type="button" role="menuitem" tabindex="-1" class="acc-mi acc-mi${i}${tab === k ? ' on' : ''}" ${tab === k ? 'aria-current="true"' : ''} data-account-tab="${k}">${safeIc(ico)}<span>${_esc(n)}</span></button>`)).join('')}
        </div>
      </div>
    </div>` : '';
    const body = !u ? loginPrompt() : (({
      orders: tabOrders,
      favorites: tabFavorites,
      notifs: tabNotifs,
      reviews: tabReviews,
      profile: tabProfile,
      settings: tabSettings
    })[tab] || tabOrders)();   /* unknown/stale tab key falls back instead of crashing the screen */
    return `<div class="screen">${typeof head === 'function' ? head('حسابي') : ''}${tabBar}${body}</div>`;
  };

  /* ═════════ نموذج تعديل الملف الشخصي ═════════ */
  const openProfile = () => {
    const u = meUser(); if (!u) { toast('سجّل بياناتك أولًا'); return; }
    if (typeof sheet !== 'function') return;
    sheet(`<h4>${safeIc('user')} تعديل الملف الشخصي</h4>
      <form class="form" id="accProfileForm" data-id="${_esc(u.id)}">
        <div><label for="acc-name">الاسم *</label><input id="acc-name" name="name" required value="${_esc(u.name || '')}" autocomplete="name"></div>
        <div><label for="acc-phone">رقم الهاتف *</label><input id="acc-phone" name="phone" required type="tel" inputmode="tel" value="${_esc(u.phone || '')}" pattern="[0-9+ ]{8,15}" autocomplete="tel"></div>
        <div><label for="acc-email">البريد الإلكتروني (اختياري)</label><input id="acc-email" name="email" type="email" autocomplete="email" value="${_esc(u.email || '')}"></div>
        <button class="cta" type="submit">${safeIc('check')} حفظ التعديلات</button>
      </form>
    `);
  };

  /* ═════════ شاشة الحذف (تجريبي) ═════════ */
  const openDelete = () => {
    const u = meUser(); if (!u) { toast('لا يوجد حساب'); return; }
    if (typeof sheet !== 'function') return;
    sheet(`<h4>${safeIc('warn')} حذف الحساب؟</h4>
      <div class="demo-banner">${safeIc('info')}<span>حذف الحساب يمسح بياناتك المحلية فقط (الاسم، الهاتف، العناوين، المفضلة). لا يمكن التراجع.</span></div>
      <form class="form" id="accDeleteForm" data-id="${_esc(u.id)}">
        <div><label for="acc-del-confirm">للتأكيد اكتب كلمة "حذف"</label><input id="acc-del-confirm" name="confirm" required placeholder="حذف" autocomplete="off"></div>
        <button class="cta" style="background:#8b1a35;border-color:#8b1a35" type="submit">${safeIc('trash')} حذف نهائي</button>
        <button class="cta ghost" type="button" data-account-cancel-delete>إلغاء</button>
      </form>
    `);
  };

  /* ═════════ «⋮» menu of the sections that do not fit ═════════ */
  const moreBtn = () => document.querySelector('.account-tabs [data-acc-more]');
  const moreMenu = () => document.getElementById('acc-more-menu');
  const menuItems = () => { const m = moreMenu(); return m ? [...m.querySelectorAll('[role="menuitem"]')].filter((b) => b.offsetParent !== null) : []; };
  function setMenu(open, focusFirst) {
    const b = moreBtn(), m = moreMenu(); if (!b || !m) return;
    m.hidden = !open; b.setAttribute('aria-expanded', String(open));
    if (open && focusFirst) { const items = menuItems(); const cur = items.find((x) => x.classList.contains('on')) || items[0]; if (cur) cur.focus(); }
  }
  document.addEventListener('keydown', (e) => {
    const m = moreMenu(); if (!m || m.hidden) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.closest && e.target.closest('[data-acc-more]')) { e.preventDefault(); setMenu(true, true); }
      return;
    }
    const items = menuItems(), i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); setMenu(false); const b = moreBtn(); if (b) b.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (items[(i + 1) % items.length] || items[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (items[(i - 1 + items.length) % items.length] || items[0]).focus(); }
    else if (e.key === 'Home') { e.preventDefault(); if (items[0]) items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); if (items.length) items[items.length - 1].focus(); }
    else if (e.key === 'Tab') setMenu(false);
  });

  /* ═════════ الأحداث ═════════ */
  document.addEventListener('click', (e) => {
    const more = e.target.closest('[data-acc-more]');
    if (more) { const m = moreMenu(); setMenu(!!(m && m.hidden), e.detail === 0); return; }
    if (moreMenu() && !moreMenu().hidden && !e.target.closest('#acc-more-menu')) setMenu(false);
    const t = e.target.closest('[data-account-tab],[data-account-profile-edit],[data-account-logout],[data-account-delete],[data-account-cancel-delete]');
    if (!t) return;
    const d = t.dataset;
    if (d.accountTab) {
      const fromMenu = !!t.closest('#acc-more-menu');
      if (typeof state !== 'undefined') state.accountTab = d.accountTab;
      if (typeof show === 'function') show('account');
      /* keep keyboard users where they were: the «⋮» button (menu choice) or the chosen tab */
      setTimeout(() => {
        const target = fromMenu ? moreBtn() : [...document.querySelectorAll(`.account-tabs > [data-account-tab="${d.accountTab}"]`)].find((x) => x.offsetParent !== null);
        if (target && target.offsetParent !== null) { try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); } }
      }, 0);
      return;
    }
    if (d.accountProfileEdit !== undefined) return openProfile();
    if (d.accountLogout !== undefined) {
      /* Accessible confirmation sheet instead of native confirm() (blocking, unstyled, not focus-managed). */
      askSheet({ id: 'session', kind: 'logout', title: 'تسجيل الخروج', text: 'ستعود إلى وضع الزائر على هذا الجهاز.', reasonLabel: '', confirmLabel: 'تسجيل الخروج' });
      return;
    }
    if (d.accountDelete !== undefined) return openDelete();
    if (d.accountCancelDelete !== undefined) { if (typeof closeSheet === 'function') closeSheet(); return; }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'method' && t.form && t.form.id === 'loginFormAcc') {
      /* show the email fields only for the email method; hidden fields are disabled so they are not required */
      const f = t.form, email = t.value === 'email', box = f.querySelector('.login-email');
      f.dataset.method = t.value;
      if (box) { box.hidden = !email; box.querySelectorAll('input').forEach(i => { i.disabled = !email; }); }
      const HINT = { quick: 'بالاسم ورقم الموبايل فقط — بدون كود أو كلمة مرور.', email: 'ادخل من أي جهاز ببريدك وكلمة المرور.', phone: 'نرسل كود تأكيد برسالة SMS إلى رقمك.' };
      const hint = f.querySelector('[data-hint]'); if (hint) hint.textContent = HINT[t.value] || '';
      const mode = (f.querySelector('input[name=mode]:checked') || {}).value;
      const btn = f.querySelector('[data-submit]'); if (btn) btn.textContent = t.value === 'phone' ? 'إرسال الكود' : t.value === 'email' ? (mode === 'login' ? 'دخول' : 'إنشاء حساب') : 'متابعة';
      return;
    }
    if (t.name === 'mode' && t.form && t.form.id === 'loginFormAcc') {
      const btn = t.form.querySelector('[data-submit]'); if (btn) btn.textContent = t.value === 'login' ? 'دخول' : 'إنشاء حساب';
      const pw = t.form.querySelector('#account-login-password'); if (pw) pw.autocomplete = t.value === 'login' ? 'current-password' : 'new-password';
      return;
    }
    if (t.dataset.accountPref !== undefined) {
      const u = meUser(); if (!u) return;
      HSCustomerApi.updateMe({ prefs: { [t.dataset.accountPref]: t.checked } })
        .then(res => toast(res.ok ? 'تم حفظ التفضيلات' : 'تعذّر حفظ التفضيلات'));
    }
    if (t.dataset.fontSize !== undefined) {
      /* larger text for older eyes: scales the whole app (stored on this device only) */
      try { if (t.value) localStorage.setItem('hs_font', t.value); else localStorage.removeItem('hs_font'); } catch {}
      if (t.value) document.documentElement.setAttribute('data-fs', t.value); else document.documentElement.removeAttribute('data-fs');
      toast(t.value ? 'تم تكبير الخط' : 'رجع الخط للحجم العادي');
    }
    if (t.dataset.accountContact !== undefined) {
      const u = meUser(); if (!u) return;
      HSCustomerApi.updateMe({ prefs: { preferredContact: t.value } })
        .then(res => toast(res.ok ? 'تم حفظ وسيلة التواصل' : 'تعذّر حفظ وسيلة التواصل'));
    }
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.id === 'loginFormAcc') {
      e.preventDefault();
      const d = new FormData(f);
      const method = d.get('method') || 'quick';
      const opts = { method, email: d.get('email') || '', password: d.get('password') || '', mode: d.get('mode') || 'signup' };
      const res = HSCustomerSession.signIn(d.get('name'), d.get('phone'), opts);
      if (!res.ok) return toast(res.error);
      toast('تم التسجيل');
      /* إن جاء المستخدم من رابط يتطلب تسجيل الدخول (#/orders، #/track/…) نعيده إليه */
      if (typeof afterSignIn === 'function' && afterSignIn()) return;
      if (typeof show === 'function') show('account');
    }
    if (f.id === 'accProfileForm') {
      e.preventDefault();
      const u = meUser(); if (!u) return;
      const d = new FormData(f);
      const name = (d.get('name') || '').trim();
      const phone = (d.get('phone') || '').trim();
      const email = (d.get('email') || '').trim();
      if (!name) return toast('اكتب الاسم');
      if (!/^[0-9+ ]{8,15}$/.test(phone)) return toast('رقم الهاتف غير صحيح');
      const dup = MP.db().customers.find(c => c.phone === phone && c.id !== u.id);
      if (dup) return toast('هذا الرقم مسجّل باسم آخر');
      HSCustomerApi.updateMe({ name, phone, email }).then(res => {
        if (!res.ok) return toast((res.error && res.error.details && Object.values(res.error.details)[0]) || (res.error && res.error.message) || 'تعذّر حفظ التعديلات');
        HSCustomerSession.update({name, phone});
        if (typeof closeSheet === 'function') closeSheet();
        toast('تم حفظ التعديلات');
        if (typeof show === 'function') show('account');
      });
    }
    if (f.id === 'accDeleteForm') {
      e.preventDefault();
      const u = meUser(); if (!u) return;
      const d = new FormData(f);
      if ((d.get('confirm') || '').trim() !== 'حذف') return toast('اكتب كلمة "حذف" للتأكيد');
      /* تنظيف محلي */
      /* profile/addresses/favorites are deleted through the API (local store or Firebase backend);
         drafts and search history are device-local and are cleared here */
      HSCustomerApi.deleteMe().then(res => {
        if (!res.ok) return toast('تعذّر حذف الحساب');
        try {
          const db = MP.db();
          db.drafts = db.drafts.filter(x => x.customerId !== u.id);
          db.searchHistory = db.searchHistory.filter(x => x.customerId !== u.id);
          MP.save();
        } catch {}
        HSCustomerSession.signOut();
        if (typeof HSBackend !== 'undefined' && HSBackend.mode === 'firebase') HSBackend.signOut().catch(() => {});
        if (typeof closeSheet === 'function') closeSheet();
        toast('تم حذف الحساب');
        if (typeof show === 'function') show('account');
      });
    }
  });

  return { render, openProfile, openDelete, tab: (n) => { if (typeof state !== 'undefined') state.accountTab = n; } };
})();

/* استبدال screens.account القديمة */
if (typeof screens !== 'undefined' && screens) {
  screens.account = () => Account.render();
}