'use strict';
/* In-page accessibility audit injected by the CDP runners (no dependencies). Returns a list of violations for the
   visible part of the document. Checks are structural (names, labels, ids, tabindex, alt, dialog semantics) plus text
   contrast against the effective solid background. It is NOT a substitute for a screen reader; see docs. */
const AUDIT = String.raw`(() => {
  const out = [];
  const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden],[inert],[aria-hidden="true"]'); };
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '"';
  const nameOf = el => {
    if (el.getAttribute('aria-label') && el.getAttribute('aria-label').trim()) return el.getAttribute('aria-label').trim();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\s+/).map(id => (document.getElementById(id) || {}).textContent || '').join(' ').trim(); if (t) return t; }
    if (el.labels && el.labels.length) { const t = [...el.labels].map(l => l.textContent).join(' ').trim(); if (t) return t; }
    if (['BUTTON', 'A', 'SUMMARY'].includes(el.tagName)) { const t = (el.textContent || '').trim(); if (t) return t; const img = el.querySelector('img[alt]'); if (img && img.alt.trim()) return img.alt; }
    if (el.getAttribute('title') && el.getAttribute('title').trim()) return el.getAttribute('title').trim();
    if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type) && el.value) return el.value;
    return '';
  };
  // 1. accessible names for controls
  for (const el of document.querySelectorAll('input:not([type=hidden]),select,textarea,button,a[href],[role=button],[role=tab],[role=link],[role=checkbox],[role=switch]')) {
    if (!vis(el)) continue;
    if (!nameOf(el)) out.push('no accessible name: ' + desc(el));
  }
  // 2. duplicate ids (in the visible app)
  const seen = {};
  for (const el of document.querySelectorAll('[id]')) { if (!el.id) continue; seen[el.id] = (seen[el.id] || 0) + 1; }
  for (const [id, n] of Object.entries(seen)) if (n > 1) out.push('duplicate id: #' + id + ' x' + n);
  // 3. positive tabindex, images without alt, labels pointing nowhere
  for (const el of document.querySelectorAll('[tabindex]')) if (+el.getAttribute('tabindex') > 0) out.push('positive tabindex: ' + desc(el));
  for (const el of document.querySelectorAll('img')) if (vis(el) && !el.hasAttribute('alt')) out.push('img without alt: ' + (el.getAttribute('src') || '').slice(0, 40));
  for (const el of document.querySelectorAll('label[for]')) if (!document.getElementById(el.htmlFor)) out.push('label for missing id: ' + el.htmlFor);
  // 4. open dialogs need role + name
  for (const el of document.querySelectorAll('[role=dialog],dialog[open]')) { if (!vis(el)) continue; if (!nameOf(el) && !el.querySelector('h1,h2,h3,h4')) out.push('dialog without name: ' + desc(el)); }
  // 5. text contrast (WCAG AA: 4.5, large text 3) against the first solid ancestor background
  const rgb = s => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = el => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; const c = rgb(cs.backgroundColor); if (c && c.a >= 0.95) return c; } return rgb(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }; };
  const done = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement; if (!el || done.has(el) || !vis(el)) continue; done.add(el);
    const cs = getComputedStyle(el); const fg = rgb(cs.color); if (!fg || fg.a < 0.95 || +cs.opacity < 1) continue;
    const bg = bgOf(el); if (!bg) continue;
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700, large = px >= 24 || (bold && px >= 18.66);
    if (ratio < (large ? 3 : 4.5)) out.push('contrast ' + ratio.toFixed(2) + ': ' + desc(el));
  }
  return [...new Set(out)];
})()`;
module.exports = { AUDIT };
