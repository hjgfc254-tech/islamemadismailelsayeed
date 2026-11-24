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
    /* «how it works» for first-time visitors (hidden once the customer has requests) */
    const howItWorks=ctx.firstVisit===false?'':`<section class="how" aria-labelledby="howT"><h2 class="sec-title" id="howT">${ic('info')}إزاي هنصلحلك بتشتغل؟</h2>
      <ol class="how-steps"><li><i>1</i><b>اطلب الخدمة</b><small>اختار القسم ووصف المشكلة في دقيقة</small></li><li><i>2</i><b>فني موثّق يقبل طلبك</b><small>وتعرف السعر قبل ما توافق</small></li><li><i>3</i><b>تابع وادفع بعد الخدمة</b><small>كاش للفني بعد ما الشغل يخلص</small></li></ol></section>`;
    /* latest REAL reviews (only when there are some; no customer names — privacy) */
    const rv=Array.isArray(ctx.latestReviews)?ctx.latestReviews.filter(r=>r&&r.stars>=4&&String(r.comment||'').trim()).slice(0,6):[];
    const reviewsBlock=rv.length?`<section class="reviews-strip" aria-labelledby="rvT"><h2 class="sec-title" id="rvT">${ic('star')}آراء عملائنا</h2>
      <div class="rv-row">${rv.map(r=>`<figure class="rv-card glass neon"><div class="rv-stars" aria-label="${r.stars} من 5">${'★'.repeat(Math.round(r.stars))}</div><blockquote>${e(String(r.comment).slice(0,140))}</blockquote><figcaption>${e(r.service||'عميل هنصلحلك')}</figcaption></figure>`).join('')}</div></section>`:'';
    const art=h&&h.img?`<img class="hero-photo" src="${e(h.img)}" alt="" decoding="async" fetchpriority="high" draggable="false">`:ART.hero;
    const sb=ctx.siteBanner, sbe=ctx.esc||(s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));
    const bannerHtml=sb&&sb.text?`<div class="site-banner" role="note" data-part="banner">${ic('info')}<span>${sbe(sb.text)}</span>${sb.action&&sb.action!=='none'?`<button type="button" class="sb-go" data-act="slideGo" data-to="${sbe(sb.action)}">اعرف أكتر</button>`:''}</div>`:'';
    /* 2026 identity (owner, 2026-11-23): photo hero under the navy header, trust strip, search, the customer's own work
       (draft / active requests), popular services, governorate banner, how it works — then the rest, shorter */
    const heroImg=h&&h.img?e(h.img):'../../assets/brand/hero-tech-v3.jpg';
    const heroTitle=h?title:'كل خدمة<br>تصليح وصيانة', heroAccent=h?accent:'في مكان واحد', heroSub=h?sub:'';   // the trust row under the search says it — no small text over the street photo
    const bi=(n,fb)=>(root.HSBrandIcons&&root.HSBrandIcons.svg(n))||ic(fb);   // 2026 two-tone icons (brand-icons.js), old icon as fallback
    const steps=[['choose','grid','اختار الخدمة'],['schedule','calendar','حدّد الموعد'],['arrive','user','يوصلك الفني'],['rate','star','قيّم الخدمة']];
    const how4=ctx.firstVisit===false?'':`<section class="how-v3" aria-labelledby="howT"><h2 id="howT">إزاي هنصلحلك بتشتغل؟</h2><ol>${steps.map(([b,i,t])=>`<li><i>${bi(b,i)}</i><span>${t}</span></li>`).join('')}</ol></section>`;
    /* the customer's own work comes right after the search (round 4: the header always flows into the photo); the greeting is a
       slim line under the trust strip so the header flows straight into the photo (owner mock-up). Rendered in this
       order (greeting → draft → active) so the dependency call order stays stable. */
    const topHtml=topbar(), greetHtml=renderGreeting(), draftHtml=renderDraftResume(), activeHtml=renderActiveRequests();
    const ownWork=(draftHtml||'').trim()||(activeHtml||'').trim();
    return `<div class="screen home-v3${ownWork?' has-own':''}">${topHtml}${bannerHtml}
  <section class="hero" aria-labelledby="heroT">
    <img class="${h&&h.img?'hero-photo':'hero-bg'}" src="${heroImg}" data-hero="art" alt="" width="900" height="1115" decoding="async" fetchpriority="high" draggable="false">
    <div class="txt">
      ${greetHtml}
      <h1 id="heroT">${heroTitle}${heroAccent?`<br><span>${heroAccent}</span>`:''}</h1>
      ${heroSub?`<p>${heroSub}</p>`:''}
      <button class="hero-cta" data-act="newReq">${cta==='ابدأ الطلب'?'اطلب خدمة الآن':cta} <span class="arr" aria-hidden="true">←</span></button>
    </div>
  </section>
  <div class="search hero-search">
    <label class="field">${ic('search')}<input id="q" type="search" aria-label="ابحث عن فني أو خدمة" placeholder="اكتب مشكلتك… مثلاً: التكييف مش بيبرّد" enterkeyhint="search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="home-sg"><button type="button" class="cam" data-act="cam" aria-label="تصوير المشكلة لإرفاقها بطلبك">${ic('camera')}</button></label>
  </div>
  <div id="home-sg" class="hs-suggest home-sg" role="listbox" hidden></div>
  ${renderCommonProblems()}
  ${draftHtml}
  ${activeHtml}
  ${root.HSSmartHelp?root.HSSmartHelp.homeCard()+root.HSSmartHelp.myHome():''}
  ${ctx.addressBar||''}
  ${ctx.care||''}
  <section aria-labelledby="tilesT">
    <div class="sec-head"><h2 id="tilesT">أشهر الخدمات</h2><button type="button" class="more" data-go="sections">عرض الكل <span aria-hidden="true">←</span></button></div>
    ${String(tiles()).replace(/<\/div>\s*$/,`<button type="button" class="tile all-tile" data-go="sections" aria-label="كل الأقسام"><span class="tart brand" aria-hidden="true">${bi('all','grid')}</span><span class="tl">كل الأقسام</span></button></div>`)}
  </section>
  <section class="why-card" aria-labelledby="whyT"><h2 id="whyT">ليه تختار هنصلحلك؟</h2>
    <ul class="trust-strip" aria-label="ليه هنصلحلك">
      <li>${bi('verified','shield')}<span><b>فنيين موثوقين</b><small>بتراجعهم الإدارة قبل التفعيل</small></span></li>
      <li>${bi('price','wallet')}<span><b>سعر واضح</b><small>تعرفه قبل الحجز ومايتغيّرش إلا بموافقتك</small></span></li>
      <li>${bi('track','clock')}<span><b>متابعة لحظة بلحظة</b><small>من قبول الطلب لحد ما الشغل يخلص</small></span></li>
    </ul>
  </section>
  <button type="button" class="gov-banner" data-go="sections">
    <span class="gb-pin" aria-hidden="true">${ic('pin')}</span>
    <span><b>خدماتك في محافظتك</b><small>فنيين في منطقتك — اختار القسم وإحنا نوصّلك بالأقرب</small></span>
    <span class="gb-go" aria-hidden="true">${ic('back')}</span>
    <svg class="gb-sky" viewBox="0 0 200 46" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" fill="#fff"><path d="M0 46V34h8v-6h6v6h6V22h5v-8h2v8h5v24h6V30h10v16h6V26l4-10 4 10v20h8V20h3V6h2v14h3v26h6V32h12v14h6V28h8v18h5V12l3-6 3 6v34h6V30h10v16h8V36h10v10z"/></svg>
  </button>
  ${ctx.trending||''}
  ${ctx.when||''}
  ${how4}
  ${renderRecentUsed()}
  ${renderSavedAddresses()}
  ${renderFavorites()}
  ${discover()}
  ${ctx.packages||''}
  ${ctx.invite||''}
  ${reviewsBlock}
  ${renderServiceAreas()}
  <div class="join glass neon">${ic('user')}<div><b>عايز تقدم خدماتك؟</b><small>انضم كمقدم خدمة — التسجيل يُراجَع من الإدارة قبل استقبال الطلبات</small></div><a class="tag" href="../provider/index.html#/join">انضم كمقدم خدمة</a></div>
  <footer class="site-foot" aria-label="عن هنصلحلك">
    <div class="foot-brand">
      <span class="hs-logo"><img src="../../assets/brand/hsl-mark.svg" alt="" width="38" height="38" loading="lazy" decoding="async"><span class="w"><b>هنصلحلك</b><small>HANSALEHLAK</small></span></span>
      <p>كل خدمة تصليح وصيانة في مكان واحد.</p>
    </div>
    <nav class="foot-links" aria-label="روابط هنصلحلك">
      <button type="button" data-go="sections">الخدمات</button><button type="button" data-go="orders">طلباتي</button><button type="button" data-go="support">المساعدة</button><button type="button" data-support="faq">الأسئلة الشائعة</button><button type="button" data-support="complaint">شكوى</button>
      <button type="button" data-support="policy-privacy">الخصوصية</button><button type="button" data-support="policy-terms">الشروط</button><button type="button" data-support="policy-cancel">الإلغاء والاسترداد</button>
      <a href="../provider/index.html#/join">انضم كفني</a><a href="../provider/index.html">دخول الفنيين</a>
    </nav>
    <div class="foot-bottom"><small class="foot-copy">© ${new Date().getFullYear()} هنصلحلك — جميع الحقوق محفوظة</small>${ctx.demo === false ? '' : '<small>نسخة عرض تجريبية — البيانات محلية على هذا الجهاز.</small>'}</div>
  </footer>
  </div>`;
  };
  root.HSCustomerHomePage=Object.freeze({render,dependencies:REQUIRED.slice()});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.HSCustomerHomePage;
})(typeof globalThis!=='undefined'?globalThis:this);
