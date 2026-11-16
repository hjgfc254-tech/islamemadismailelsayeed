/**
 * Customer Home page renderer.
 * Pure presentation module: all state/data/actions arrive through explicit dependencies.
 * Does not access DOM, storage, network, or global application state.
 */
'use strict';
(function(root){
  const REQUIRED=['topbar','renderGreeting','renderDraftResume','ic','ART','renderQuickActions','renderActiveRequests','tiles','renderCommonProblems','renderRecentUsed','renderSavedAddresses','renderFavorites','discover','renderServiceAreas'];
  const render=(ctx={})=>{
    const missing=REQUIRED.filter(k=>ctx[k]===undefined || ctx[k]===null);
    if(missing.length) throw new Error('HSCustomerHomePage: missing dependencies: '+missing.join(', '));
    const {topbar,renderGreeting,renderDraftResume,ic,ART,renderQuickActions,renderActiveRequests,tiles,renderCommonProblems,renderRecentUsed,renderSavedAddresses,renderFavorites,discover,renderServiceAreas}=ctx;
    /* optional: hero published from the Admin Center (texts escaped here; image is a local object/data URL) */
    const h=ctx.siteHero, e=ctx.esc||(s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));
    const eyebrow=h?e(h.eyebrow):'منصة واحدة، خدمات أسهل', title=h?e(h.title):'كل ما تحتاجه من خدمات،', accent=h?e(h.accent):'في مكان واحد';
    const sub=h?e(h.sub):'اكتشف الخدمة المناسبة بسهولة، وهنوصلك بمقدم الخدمة المناسب لطلبك.', cta=h?e(h.cta):'ابدأ الطلب';
    const art=h&&h.img?`<img class="hero-photo" src="${e(h.img)}" alt="" decoding="async" fetchpriority="high" draggable="false">`:ART.hero;
    return `<div class="screen">${topbar()}
  ${renderGreeting()}
  ${renderDraftResume()}
  <section class="hero" aria-labelledby="heroT">
    <div class="txt">
      ${eyebrow?`<p class="hero-eyebrow">${eyebrow}</p>`:''}
      <h1 id="heroT">${title}${accent?`<br><span>${accent}</span>`:''}</h1>
      ${sub?`<p>${sub}</p>`:''}
      <div class="search hero-search">
        <label class="field glass neon">${ic('search')}<input id="q" type="search" aria-label="ابحث عن فني أو خدمة" placeholder="ابحث عن الخدمات التي تحتاجها" enterkeyhint="search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="home-sg"></label>
        <button class="cam" data-act="cam" aria-label="تصوير المشكلة لإرفاقها بطلبك">${ic('camera')}</button>
      </div>
      <div id="home-sg" class="hs-suggest home-sg" role="listbox" hidden></div>
      <button class="hero-cta" data-act="newReq">${ic('wrench')} ${cta}</button>
    </div>
    <div class="art">${art}</div>
  </section>
  <ul class="trust-strip" aria-label="ليه هنصلحلك">
    <li>${ic('wallet')}<span><b>سعر واضح قبل الحجز</b><small>تعرف المبلغ قبل ما تأكد</small></span></li>
    <li>${ic('shield')}<span><b>فنيين بتراجعهم الإدارة</b><small>قبل ما يبدأوا يستقبلوا طلبات</small></span></li>
    <li>${ic('clock')}<span><b>تابع طلبك خطوة بخطوة</b><small>وتوصلك إشعارات بكل تحديث</small></span></li>
  </ul>
  ${renderQuickActions()}
  ${renderActiveRequests()}
  <h2 class="sec-title" id="tilesT">${ic('grid')}تصفّح الفئات</h2>
  ${tiles()}
  ${renderCommonProblems()}
  ${renderRecentUsed()}
  ${renderSavedAddresses()}
  ${renderFavorites()}
  ${discover()}
  ${renderServiceAreas()}
  <section class="trust" aria-labelledby="trustT">
    <div class="trust-photo"><img src="../../assets/brand/trust-handshake.jpg" alt="مقدم خدمة من هنصلحلك يصافح عميلًا" width="720" height="868" loading="lazy" decoding="async"></div>
    <div class="trust-body">
      <h2 id="trustT">خدماتك، في تجربة أسهل</h2>
      <ul>
        <li>${ic('check')}<span><b>مقدمو خدمة تتم مراجعتهم</b><small>تسجيل مقدم الخدمة يُراجَع من الإدارة قبل استقبال الطلبات.</small></span></li>
        <li>${ic('list')}<span><b>تابع حالة طلبك من مكان واحد</b><small>كل مرحلة في طلبك ظاهرة لك من «طلباتي».</small></span></li>
        <li>${ic('chat')}<span><b>قارن العروض قبل الاختيار</b><small>تستلم عروض الأسعار وتختار المناسب قبل التنفيذ.</small></span></li>
      </ul>
      <button class="cta" data-act="newReq">${ic('wrench')} ابدأ الطلب</button>
    </div>
  </section>
  <div class="join glass neon">${ic('user')}<div><b>عايز تقدم خدماتك؟</b><small>انضم كمقدم خدمة — التسجيل يُراجَع من الإدارة قبل استقبال الطلبات</small></div><a class="tag" href="../provider/index.html#/join">انضم كمقدم خدمة</a></div>
  <footer class="site-foot">
    <img class="wordmark" src="../../assets/brand/logo-v10-lockup.webp" alt="هنصلحلك HANSALEHLAK" width="615" height="160" loading="lazy" decoding="async">
    <p>منصة واحدة، خدمات أسهل.</p>
    <nav aria-label="روابط سريعة"><button type="button" data-go="sections">الخدمات</button><button type="button" data-go="search">البحث</button><button type="button" data-go="orders">طلباتي</button><button type="button" data-go="account">حسابي</button><a href="../provider/index.html#/join">انضم كمقدم خدمة</a></nav>
    <small>نسخة عرض تجريبية — البيانات محلية على هذا الجهاز.</small>
  </footer>
  </div>`;
  };
  root.HSCustomerHomePage=Object.freeze({render,dependencies:REQUIRED.slice()});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.HSCustomerHomePage;
})(typeof globalThis!=='undefined'?globalThis:this);
