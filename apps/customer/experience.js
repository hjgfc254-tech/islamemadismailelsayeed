/**
 * MODULE: experience (HSExperience) — the Customer app "answers back" (2026 identity, owner request 2026-11-24).
 *   • Scroll: the header turns compact once the page moves (html.is-scrolled) and the red gear of the logo turns with the
 *     scroll (--sy, read by CSS). Reaching the end of a page offers help instead of a dead end.
 *   • Enter: a new screen reveals its below-the-fold blocks as they come into view, and card grids arrive in a short
 *     cascade. Only on a real navigation — silent re-renders (server sync, pull to refresh) never re-animate.
 *   • Guide: the help button becomes «مساعد هنصلحلك» — tap for a short menu; after a pause on Home / Services, or at
 *     the bottom of Home, it offers one contextual hint (once per session each, closes by itself, never on forms).
 * Progressive: nothing here is required to use the app; reduced-motion turns every animation off.
 * Loaded after app.js (uses its globals go / state when present). No library.
 */
'use strict';
(function (root) {
  const doc = root.document;
  if (!doc || !doc.getElementById || !doc.documentElement || root.HSExperience) return;
  const html = doc.documentElement;
  const reduce = () => { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const seen = (k) => { try { return sessionStorage.getItem('hs_cue_' + k) === '1'; } catch (e) { return true; } };
  const mark = (k) => { try { sessionStorage.setItem('hs_cue_' + k, '1'); } catch (e) {} };
  const screen = () => html.dataset.screen || '';
  const markImg = '<img src="../../assets/brand/hsl-mark.svg" alt="" width="34" height="34" decoding="async">';

  /* ───────── guide bubble ───────── */
  const CUES = {
    idleHome: { text: 'محتار تبدأ منين؟ اكتب المشكلة بكلامك أو صوّرها، وأنا أوصّلك للفني المناسب.', acts: [['اكتب المشكلة', 'data-xp="search"'], ['صوّر المشكلة', 'data-act="cam"']] },
    bottom: { text: 'مالقيتش اللي بتدوّر عليه؟ ابعت طلب عام، وفني متخصص هيكلّمك ويفهم منك.', acts: [['اطلب خدمة', 'data-act="newReq"']] },
    idleSections: { text: 'مش متأكد القسم إيه؟ اكتب المشكلة زي «التكييف مش بيبرد» وأنا ألاقيها.', acts: [['ابحث بالمشكلة', 'data-go="search"']] }
  };
  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'سهرانين معاك' : h < 12 ? 'صباح الخير' : h < 17 ? 'نهارك سعيد' : 'مساء النور';
  }
  let bubble = null, hideT = 0;
  function close() { if (!bubble) return; bubble.classList.remove('on'); clearTimeout(hideT); const b = bubble; setTimeout(() => { if (!b.classList.contains('on')) b.hidden = true; }, 220); }
  function say(text, acts, opts) {
    const fab = doc.getElementById('help-fab');
    if (!fab || !doc.body) return false;
    if (root.getComputedStyle && getComputedStyle(fab).display === 'none') return false;   // forms / tracking: stay quiet
    const app = doc.getElementById('app'); if (app && app.classList.contains('open')) return false;   // a sheet is open
    if (!bubble) {
      bubble = doc.createElement('div'); bubble.id = 'hs-say'; bubble.className = 'hs-say'; bubble.setAttribute('role', 'status'); bubble.hidden = true;
      doc.body.appendChild(bubble);
      bubble.addEventListener('click', (e) => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.hasAttribute('data-xp-close')) return close();
        if (t.dataset.xp === 'search') {
          const q = doc.getElementById('q'); const v = doc.getElementById('view');
          if (q) { if (v && v.scrollTo) v.scrollTo({ top: 0, behavior: reduce() ? 'auto' : 'smooth' }); setTimeout(() => { try { q.focus({ preventScroll: true }); } catch (er) {} }, 320); }
        }
        close();   // the app's own click delegate (data-act / data-go) still runs — this listener does not stop it
      });
    }
    bubble.innerHTML = `<div class="hs-say-in">${markImg}<div><b class="hs-say-h">${opts && opts.title ? opts.title : 'مساعد هنصلحلك'}</b><p>${text}</p>
      <div class="hs-say-acts">${acts.map(([l, a]) => `<button type="button" ${a}>${l}</button>`).join('')}</div></div>
      <button type="button" class="hs-say-x" data-xp-close aria-label="إغلاق">×</button></div>`;
    bubble.hidden = false;
    requestAnimationFrame(() => bubble.classList.add('on'));
    clearTimeout(hideT); hideT = setTimeout(close, opts && opts.stay ? 15000 : 11000);
    return true;
  }
  function cue(k) {
    if (seen(k) || !CUES[k]) return;
    if (bubble && bubble.classList.contains('on')) return;
    if (say(CUES[k].text, CUES[k].acts)) mark(k);
  }
  /** the guide's menu (tap on the help button) */
  function menu() {
    if (bubble && bubble.classList.contains('on')) return close();
    say('أقدر أساعدك في إيه؟', [['اطلب خدمة', 'data-act="newReq"'], ['تابع طلباتي', 'data-go="orders"'], ['أسئلة ومساعدة', 'data-go="support"']], { title: greeting() + ' 👋', stay: true });
  }

  /* idle: no touch / scroll / key for a while on Home or Services */
  let idleT = 0;
  function arm() {
    clearTimeout(idleT);
    const s = screen(); if (s !== 'home' && s !== 'sections') return;
    idleT = setTimeout(() => { const v = doc.getElementById('view'); if (screen() === 'home' && v && v.scrollTop < 500) cue('idleHome'); else if (screen() === 'sections') cue('idleSections'); }, 14000);
  }
  ['pointerdown', 'keydown'].forEach((ev) => doc.addEventListener(ev, arm, { passive: true }));

  /* ───────── scroll ───────── */
  function mountScroll(view) {
    let raf = 0, scrollT = 0;
    view.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = view.scrollTop, max = view.scrollHeight - view.clientHeight;
        html.style.setProperty('--sy', String(Math.round(y)));
        html.classList.toggle('is-scrolled', y > 14);
        if (screen() === 'home' && max > 600 && y / max > 0.94) cue('bottom');
      });
      /* while the finger moves the guide steps back (never covers what is being read), then returns */
      html.classList.add('is-scrolling'); clearTimeout(scrollT); scrollT = setTimeout(() => html.classList.remove('is-scrolling'), 700);
      arm();
    }, { passive: true });
  }

  /* ───────── reveal on enter ───────── */
  let io = null, lastKey = '';
  function enter(view) {
    const sc = view.firstElementChild; if (!sc || !sc.classList || !sc.classList.contains('screen')) return;
    const key = screen() + '|' + (root.location ? root.location.hash : '');
    const fresh = key !== lastKey; lastKey = key;
    html.style.setProperty('--sy', String(Math.round(view.scrollTop || 0)));
    html.classList.toggle('is-scrolled', (view.scrollTop || 0) > 14);
    if (!fresh || reduce()) return;
    sc.setAttribute('data-enter', '');
    sc.querySelectorAll('.grid.fit,.cgrid,.trust-strip,.how-v3 ol,.plist').forEach((g) => { let i = 0; for (const c of g.children) c.style.setProperty('--i', String(Math.min(i++, 11))); });
    setTimeout(() => sc.removeAttribute('data-enter'), 1400);
    if (!('IntersectionObserver' in root)) return;
    if (!io) io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('rv-in'); io.unobserve(e.target); } }), { root: view, rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    const host = sc.querySelector('.home-v3') || sc;
    const vh = view.clientHeight || 700;
    for (const el of host.children) {
      if (el.matches('.topbar,.dhead,.hero,h1,script,style')) continue;
      if (el.getBoundingClientRect().top < vh * 0.92) continue;   // already on screen: never hide what is visible (LCP)
      el.classList.add('rv'); io.observe(el);
    }
    arm();
  }

  function start() {
    const view = doc.getElementById('view'); if (!view) return;
    mountScroll(view);
    if (typeof MutationObserver === 'function') new MutationObserver(() => enter(view)).observe(view, { childList: true });
    enter(view);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
  root.HSExperience = Object.freeze({ menu, say, cue, close });
})(typeof globalThis !== 'undefined' ? globalThis : this);
