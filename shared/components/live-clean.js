/**
 * MODULE: live-clean (HSLiveClean) — production wording. The pages were built with a local demo mode that explains
 * itself («بيانات تجريبية…», «للعرض فقط…»). On the real server (HSFirebaseConfig.mode === 'firebase') those words are
 * false, so this module removes them everywhere, including content rendered later:
 *   1. demo fragments inside real sentences are cut: «لا توجد طلبات في البيانات التجريبية» → «لا توجد طلبات»,
 *      «… (قاعدة تجريبية)» → «…», «الهاتف (تجريبي)» → «الهاتف»; in headings «المعاملات التجريبية» → «المعاملات»;
 *   2. a note whose whole purpose is the demo disclaimer (banners, role=note, small print) is hidden.
 * Local demo mode is untouched. Loaded by the customer, provider and admin entries right after firebase-config.js.
 */
'use strict';
(function (root) {
  const doc = root.document;
  if (!doc || root.HSLiveClean) return;
  const live = () => !!(root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase');
  /* whole-note disclaimers (hidden) */
  const NOTE = /بيانات تجريبية|إجراءات تجريبية|تجريبي[ةًا]? (محلي|للعرض|فقط)|الوضع التجريبي|العرض التجريبي|نسخة عرض تجريبية|عرض تجريبي|الحساب التجريبي|أرقام محلية تجريبية|ملف تجريبي|بيانات العرض|العرض المحلي|محلية فقط|محليًا فقط|للعرض فقط|ليست? حماية فعلية|ليست? (رصيدًا|سجل تدقيق حقيقي)|لم تُرسل|نص تجريبي|نصوص تجريبية|عند التكامل مع|واجهة تجريبية|حساب العرض|تجريبيًا|(^|\s)محاكاة/;
  /* fragments cut from any text */
  const FRAGMENTS = [/\s*في البيانات التجريبية(?: الحالية)?/g, /\s*\((?:قاعدة|حد|ثابت|إعدادات)? ?تجريبي[ةً]?\)/g, /\s*\(تجريبي[ةً]?\)/g, /\s*\(محاكاة(?: محلية)?\)/g];
  /* in headings / labels the adjective goes too */
  const WORD = /\s*(التجريبية|التجريبي|تجريبية|تجريبي)(?=[\s:.،)]|$)/g;
  const BLOCKS = '.fin-banner,.adm-banner,.demo-banner,.dash-note,.pv-disclaimer,.adm-chip,[role="note"],p,small,li,.tag,.ord-muted,span.hint,dd';
  const HEADS = 'h1,h2,h3,h4,.pv-eyebrow,.eyebrow,legend,th,dt,caption,label,button,option,summary,a';

  function cutText(scope) {
    if (typeof doc.createTreeWalker !== 'function') return;   /* minimal DOMs (unit tests) */
    const w = doc.createTreeWalker(scope, 4 /* SHOW_TEXT */);
    const nodes = []; for (let n = w.nextNode(); n; n = w.nextNode()) if (/تجريبي/.test(n.nodeValue)) nodes.push(n);
    for (const n of nodes) {
      let v = n.nodeValue; for (const re of FRAGMENTS) v = v.replace(re, '');
      const host = n.parentElement;
      if (host && host.closest(HEADS) && !host.closest('[data-keep-wording]')) v = v.replace(WORD, '');
      if (v !== n.nodeValue) n.nodeValue = v;
    }
  }
  function clean(scope) {
    if (!live() || !scope || !scope.querySelectorAll) return;
    cutText(scope);
    for (const el of scope.querySelectorAll(BLOCKS)) {
      if (el.dataset.liveClean || el.closest('[data-keep-wording]')) continue;
      const t = el.textContent || '';
      if (t.length < 400 && NOTE.test(t) && !el.querySelector('input,select,textarea,button,a[href]')) { el.style.setProperty('display', 'none', 'important'); el.dataset.liveClean = 'hidden'; }
    }
  }
  let queued = false;
  const run = () => { queued = false; clean(doc.body); };
  function start() {
    if (!live() || !doc.body) return;
    try { clean(doc.body); } catch (e) { return; }
    if (typeof MutationObserver === 'function') new MutationObserver(() => { if (!queued) { queued = true; (root.requestAnimationFrame || setTimeout)(run); } }).observe(doc.body, { childList: true, subtree: true, characterData: true });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
  root.HSLiveClean = Object.freeze({ clean, NOTE, FRAGMENTS, WORD });
})(typeof globalThis !== 'undefined' ? globalThis : this);
