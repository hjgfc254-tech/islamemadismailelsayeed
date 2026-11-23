/**
 * MODULE: brand-icons (HSBrandIcons) — the 2026 identity icon set for the Customer app: two-tone line icons, navy
 * strokes with one red accent (owner mock-up). 48×48 grid, 2.2 px strokes, round caps. Used by the Home service cards,
 * the trust strip and «إزاي هنصلحلك بتشتغل؟». Pure strings, no DOM.
 *   HSBrandIcons.svg(name, cls?) → '<svg …>' ('' for an unknown name, so callers can fall back to the old icon)
 */
'use strict';
(function (root) {
  const N = '#0B1F3A', R = '#E1251B';
  const s = (d, c = N, w = 2.2) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const f = (d, c = R) => `<path d="${d}" fill="${c}"/>`;
  const ICONS = {
    /* service categories (CAT ids) */
    electric: s('M27 5 13 27h10l-3 16 15-23H25l2-15Z', R, 2.4),
    plumbing: s('M8 20h14v-4h6v4h6a6 6 0 0 1 6 6v3h-7v-2a2 2 0 0 0-2-2H8z') + s('M18 16v-4h10M23 12V9') + f('M36.5 34c0 2.5-1.6 4.5-3.5 4.5s-3.5-2-3.5-4.5c0-2.4 3.5-6 3.5-6s3.5 3.6 3.5 6Z'),
    appliances: s('M10 6h28a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM8 14h32') + s('M14 10h4') + `<circle cx="24" cy="28" r="9" fill="none" stroke="${R}" stroke-width="2.2"/>` + s('M19.5 29.5c2-1.6 3.4 1.6 5.4 0s3.4 1.6 5.4 0', R, 1.8) + `<circle cx="33" cy="10" r="1.4" fill="${N}"/>`,
    carpentry: s('M8 40 26 22') + s('M23 14l6-6 11 11-6 6z', R) + s('M10 10l9 9M12 8l-4 4 3 3 4-4M30 30l9 9 3-3-9-9'),
    painting: s('M9 8h26a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z', R) + s('M37 13h3v9H23v6') + s('M20 28h6v14h-6z'),
    cleaning: s('M17 18h12v4l3 5v14a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2V27l3-5zM20 18v-6h6v6M26 12h6l2 3') + s('M38 22v6M35 25h6M40 8v4M38 10h4', R) + s('M18 32h10'),
    cars: s('M8 30v-6l4-9a3 3 0 0 1 2.8-2h18.4a3 3 0 0 1 2.8 2l4 9v6a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2ZM10 24h28M12 32v5M36 32v5') + `<circle cx="14.5" cy="27.5" r="1.8" fill="${R}"/><circle cx="33.5" cy="27.5" r="1.8" fill="${R}"/>`,
    all: s('M8 8h13v13H8zM27 27h13v13H27z') + s('M27 8h13v13H27zM8 27h13v13H8z', R),
    /* trust strip */
    verified: s('M24 5 39 11v11c0 9.5-6.4 17.4-15 20-8.6-2.6-15-10.5-15-20V11z', R) + s('M17 24l5 5 9-10', N, 2.4),
    price: s('M6 24 24 6h16v16L22 40a2 2 0 0 1-2.8 0L6 26.8A2 2 0 0 1 6 24Z', R) + `<circle cx="33" cy="15" r="2.6" fill="none" stroke="${N}" stroke-width="2.2"/>` + s('M18 22l8 8'),
    track: s('M24 42s13-12 13-23a13 13 0 0 0-26 0c0 11 13 23 13 23Z', R) + `<circle cx="24" cy="19" r="5" fill="none" stroke="${N}" stroke-width="2.2"/>`,
    /* how it works */
    choose: s('M15 8h18a2 2 0 0 1 2 2v30a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2ZM19 5h10v6H19z') + s('M18 21h12M18 28h12M18 35h7', R),
    schedule: s('M9 11h30a2 2 0 0 1 2 2v26a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2ZM7 19h34M16 7v8M32 7v8') + `<rect x="27" y="27" width="7" height="7" rx="1.5" fill="${R}"/>`,
    arrive: s('M12 42c0-7 5.4-12 12-12s12 5 12 12') + s('M14 20a10 10 0 0 1 20 0z', R) + s('M12 20h24M24 8v4') + s('M17 22a7 7 0 0 0 14 0'),
    rate: s('M24 6l5.3 10.8 11.9 1.7-8.6 8.4 2 11.8L24 33.1l-10.6 5.6 2-11.8-8.6-8.4 11.9-1.7z', R)
  };
  /** inline SVG for a brand icon ('' when unknown) */
  function svg(name, cls) {
    const body = ICONS[name]; if (!body) return '';
    return `<svg class="bi${cls ? ' ' + cls : ''}" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false">${body}</svg>`;
  }
  const api = Object.freeze({ svg, names: Object.freeze(Object.keys(ICONS)) });
  root.HSBrandIcons = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
