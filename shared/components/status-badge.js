/**
 * MODULE: status-badge
 * RESPONSIBILITY: Reusable status badge — one central mapping from (domain, status key) to Arabic label, tone and icon.
 * STATUS: IMPLEMENTED (presentation only). No data access, no side effects.
 *
 * API (global `HSStatusBadge`, also `module.exports` under Node):
 *   render(domain, key, opts?) -> HTML string   opts: { size: 'sm'|'md', icon: bool (default true), label: string, title: string }
 *   element(domain, key, opts?) -> HTMLElement   (browser only)
 *   label(domain, key) / tone(domain, key) / known(domain, key)
 *   register(domain, map)   map: { key: { label, tone, icon? } } — adds a new domain; refuses to overwrite an existing one
 *   domains() / keys(domain)
 *
 * Contract: every badge shows TEXT (never colour alone). Unknown domain/key never throws: it renders a neutral
 *   badge labelled «غير محدد» with the raw key (escaped) in the tooltip. Tones: success | warning | danger | info | neutral | brand.
 * Order labels mirror STATUS_LABEL in services/local-market-store.js (FLOW + ALT_STATUS); a unit test checks parity.
 * Styles: `.hs-badge` rules live in apps/admin/styles/admin-components.css (no shared stylesheet is loaded by every app yet).
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TONES = ['success', 'warning', 'danger', 'info', 'neutral', 'brand'];
  const UNKNOWN_LABEL = 'غير محدد';

  /* Icon names come from shared/icons/icon-registry.js (st-*, check, warn…). A missing icon simply renders no glyph. */
  const REGISTRY = {
    order: {
      received: { label: 'تم استلام الطلب', tone: 'info', icon: 'st-new' },
      searching: { label: 'جارٍ البحث عن مقدم خدمة', tone: 'info', icon: 'st-search' },
      sent: { label: 'تم إرسال الطلب لمقدم الخدمة', tone: 'info', icon: 'st-sent' },
      accepted: { label: 'تم قبول الطلب', tone: 'brand', icon: 'st-accepted' },
      scheduled: { label: 'تم تأكيد الموعد', tone: 'brand', icon: 'st-sched' },
      enroute: { label: 'مقدم الخدمة في الطريق', tone: 'brand', icon: 'st-enroute' },
      arrived: { label: 'مقدم الخدمة وصل', tone: 'brand', icon: 'st-arrived' },
      started: { label: 'جارٍ تنفيذ الخدمة', tone: 'brand', icon: 'st-working' },
      quote: { label: 'مطلوب موافقة العميل على السعر', tone: 'warning', icon: 'st-quote' },
      completed: { label: 'تم إتمام الخدمة', tone: 'success', icon: 'st-done' },
      closed: { label: 'تم إغلاق الطلب', tone: 'neutral', icon: 'st-closed' },
      cancelled: { label: 'تم إلغاء الطلب', tone: 'danger', icon: 'st-cancelled' },
      failed: { label: 'تعذر تنفيذ الخدمة', tone: 'danger', icon: 'st-failed' }
    },
    provider: {
      approved: { label: 'مقبول', tone: 'success', icon: 'check' },
      pending: { label: 'قيد المراجعة', tone: 'warning', icon: 'st-search' },
      suspended: { label: 'معلّق', tone: 'warning', icon: 'warn' },
      rejected: { label: 'مرفوض', tone: 'danger', icon: 'st-failed' }
    },
    quote: {
      pending: { label: 'بانتظار العميل', tone: 'warning', icon: 'st-quote' },
      approved: { label: 'مقبول', tone: 'success', icon: 'check' },
      rejected: { label: 'مرفوض', tone: 'danger', icon: 'st-failed' }
    },
    collection: {
      pending: { label: 'لم تُحصَّل', tone: 'warning', icon: 'st-quote' },
      collected: { label: 'تم التحصيل', tone: 'info', icon: 'check' },
      settled: { label: 'تمت التسوية', tone: 'success', icon: 'st-done' }
    }
  };

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const entry = (domain, key) => {
    const d = typeof domain === 'string' && has(REGISTRY, domain) ? REGISTRY[domain] : null;
    const k = key == null ? '' : String(key);
    return d && has(d, k) ? d[k] : null;
  };
  /* `ic` is a top-level const in icon-registry.js (not a window property), so it is resolved by bare name. */
  const icon = (name) => (name && typeof ic === 'function' ? ic(name) : '');

  const model = (domain, key, opts) => {
    const o = opts || {};
    const e = entry(domain, key);
    const label = o.label != null && String(o.label).trim() ? String(o.label) : (e ? e.label : UNKNOWN_LABEL);
    const tone = e && TONES.includes(e.tone) ? e.tone : 'neutral';
    const title = o.title != null ? String(o.title) : (e ? label : (key == null || key === '' ? '' : 'القيمة: ' + String(key)));
    return { label, tone, title, known: !!e, icon: e ? e.icon : '', size: o.size === 'sm' ? 'sm' : 'md', showIcon: o.icon !== false };
  };

  const render = (domain, key, opts) => {
    const m = model(domain, key, opts);
    return '<span class="hs-badge hs-badge--' + m.tone + (m.size === 'sm' ? ' hs-badge--sm' : '') + (m.known ? '' : ' is-unknown') +
      '" data-status="' + esc(key == null ? '' : key) + '"' + (m.title ? ' title="' + esc(m.title) + '"' : '') + '>' +
      (m.showIcon ? icon(m.icon) : '') + '<span class="hs-badge-t">' + esc(m.label) + '</span></span>';
  };

  const element = (domain, key, opts) => {
    if (!root.document) throw new Error('HSStatusBadge.element requires a browser document');
    const t = root.document.createElement('template');
    t.innerHTML = render(domain, key, opts);
    return t.content.firstElementChild;
  };

  const register = (domain, map) => {
    if (typeof domain !== 'string' || !/^[a-z][a-z0-9-]*$/.test(domain)) throw new Error('HSStatusBadge.register: invalid domain id');
    if (has(REGISTRY, domain)) throw new Error('HSStatusBadge.register: domain already exists: ' + domain);
    if (!map || typeof map !== 'object') throw new Error('HSStatusBadge.register: map required');
    const clean = {};
    Object.keys(map).forEach((k) => {
      const v = map[k];
      if (!v || typeof v.label !== 'string' || !v.label.trim()) throw new Error('HSStatusBadge.register: label required for ' + k);
      if (!TONES.includes(v.tone)) throw new Error('HSStatusBadge.register: invalid tone for ' + k);
      clean[k] = { label: v.label, tone: v.tone, icon: v.icon || '' };
    });
    REGISTRY[domain] = clean;
  };

  const api = {
    TONES: TONES.slice(),
    UNKNOWN_LABEL,
    render,
    element,
    register,
    label: (d, k) => model(d, k).label,
    tone: (d, k) => model(d, k).tone,
    known: (d, k) => !!entry(d, k),
    domains: () => Object.keys(REGISTRY),
    keys: (d) => (typeof d === 'string' && has(REGISTRY, d) ? Object.keys(REGISTRY[d]) : [])
  };

  root.HSStatusBadge = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
