/**
 * MODULE: onboarding (HSOnboarding) — first-visit welcome: three full-screen photos you swipe through (native scroll-snap,
 * so it follows the finger), with the copy over the faded lower part, dots, «التالي» / «يلا نبدأ» and «تخطي».
 * Shown once per device (localStorage 'hs_onboard_v1'); never on deep links (#/track/…, #/provider/…) nor when the visitor
 * already has requests. Sits under the logo intro (z-index 9998 < 9999), so the intro plays first.
 */
'use strict';
(function (root) {
  const KEY = 'hs_onboard_v1';
  const IMG = '../../assets/brand/';
  const SLIDES = [
    { img: 'hero-tech-v3.jpg', t: 'فني موثّق لحد باب بيتك', s: 'فنيين بتراجعهم الإدارة قبل ما يشتغلوا، وبيوصلوا في الميعاد اللي اتفقتوا عليه.' },
    { art: ['choose', 'price', 'track'], t: 'اطلب في دقيقة من مكانك', s: 'اختار المشكلة، واعرف السعر قبل ما تأكد، وتابع الفني خطوة بخطوة.' },
    { art: ['verified', 'rate', 'schedule'], t: 'شغل نضيف وانت مطمّن', s: 'قيّم الشغل بعد ما يخلص، وادفع كاش للفني — من غير مفاجآت.' }
  ];
  const seen = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return true; } };
  const mark = () => { try { localStorage.setItem(KEY, '1'); } catch (e) {} };

  function shouldShow() {
    if (seen()) return false;
    const h = String(location.hash || '');
    if (/^#\/(track|provider|orders|disc|request)/.test(h)) return false;          // arriving for something specific
    try { const u = JSON.parse(localStorage.getItem('hs_user') || 'null'); if (u && u.phone) return false; } catch (e) {}
    return true;
  }

  function mount() {
    if (!shouldShow() || document.getElementById('onboard')) return;
    const el = document.createElement('div');
    el.id = 'onboard'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'أهلًا بيك في هنصلحلك');
    el.innerHTML = `<div class="ob-track" tabindex="-1">${SLIDES.map((x, i) => `
      <section class="ob-slide" aria-roledescription="شريحة" aria-label="${i + 1} من ${SLIDES.length}">
        ${x.img ? `<img src="${IMG + x.img}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async" draggable="false">` : `<div class="ob-art" aria-hidden="true">${x.art.map((n) => `<span>${(window.HSBrandIcons && window.HSBrandIcons.svg(n)) || ''}</span>`).join('')}</div>`}   <!-- 2026 identity: brand icons on navy (no old-uniform photos) -->
        <div class="ob-copy"><h2>${x.t}</h2><p>${x.s}</p></div>
      </section>`).join('')}</div>
      <div class="ob-bar">
        <div class="ob-dots" role="tablist" aria-label="الشرائح">${SLIDES.map((_, i) => `<button type="button" role="tab" aria-label="شريحة ${i + 1}" data-ob-go="${i}" ${i ? '' : 'aria-selected="true" class="on"'}></button>`).join('')}</div>
        <button type="button" class="ob-next" data-ob-next>التالي</button>
      </div>
      <button type="button" class="ob-skip" data-ob-skip>تخطي</button>`;
    document.body.appendChild(el);
    document.documentElement.classList.add('ob-open');
    const track = el.querySelector('.ob-track'), dots = [...el.querySelectorAll('[data-ob-go]')], next = el.querySelector('[data-ob-next]');
    const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
    const width = () => track.clientWidth || 1;
    /* RTL scroll: scrollLeft is 0 at the first (rightmost) slide and negative further on — normalise to an index */
    const index = () => Math.round(Math.abs(track.scrollLeft) / width());
    const goTo = (i) => track.scrollTo({ left: -i * width(), behavior: reduce() ? 'auto' : 'smooth' });
    const paint = () => {
      const i = Math.min(SLIDES.length - 1, index());
      dots.forEach((d, k) => { d.classList.toggle('on', k === i); d.setAttribute('aria-selected', String(k === i)); });
      next.textContent = i === SLIDES.length - 1 ? 'يلا نبدأ' : 'التالي';
      el.querySelectorAll('.ob-slide').forEach((s, k) => s.classList.toggle('is-on', k === i));
    };
    let raf = 0;
    track.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }, { passive: true });
    const close = () => {
      mark();
      el.classList.add('is-out');
      document.documentElement.classList.remove('ob-open');
      setTimeout(() => el.remove(), reduce() ? 0 : 320);
      const q = document.querySelector('#view h1, #view h2'); if (q && q.focus) try { q.setAttribute('tabindex', '-1'); q.focus({ preventScroll: true }); } catch (e) {}
    };
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-ob-go],[data-ob-next],[data-ob-skip]'); if (!t) return;
      if (t.hasAttribute('data-ob-skip')) return close();
      if (t.hasAttribute('data-ob-next')) { const i = index(); return i >= SLIDES.length - 1 ? close() : goTo(i + 1); }
      goTo(+t.dataset.obGo);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') goTo(Math.min(SLIDES.length - 1, index() + 1));     // RTL: left = forward
      if (e.key === 'ArrowRight') goTo(Math.max(0, index() - 1));
    });
    paint();
    setTimeout(() => { try { next.focus({ preventScroll: true }); } catch (e) {} }, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  root.HSOnboarding = Object.freeze({ mount, reset: () => { try { localStorage.removeItem(KEY); } catch (e) {} } });
})(typeof globalThis !== 'undefined' ? globalThis : this);
