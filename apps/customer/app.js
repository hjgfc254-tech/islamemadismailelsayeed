/* ═══════════════════════════════════════════════════════════════
   منصة هنصلحلك — الواجهة الأمامية الرئيسية — V7
   ───────────────────────────────────────────────────────────────
   V7 — تغييرات عن V6:
   • حذف startRequest القديمة (ينتقل إلى wizard.js — مصدر وحيد).
   • حذف bindSearch القديمة (بيانات data.js) واستبدالها بـ HS_SEARCH.bind.
   • شاشة البحث (screens.search) تستخدم HS_SEARCH الموحّد على CAT.
   • إضافة أقسام الرئيسية المطلوبة (المرحلة 1):
       - خدمات مستخدمة مؤخرًا (من MP.searchHistory + myReqs)
       - الخدمات المفضلة (MP.favoritesFor)
       - مناطق الخدمة (Demo Banner)
   • دالة موحدة openProblem تعتمد على CAT بدل data.js للمشاكل.
   • ربط بطاقة مقدم الخدمة لفتح تفاصيله (سنتوسّعها في C).
   • الحفاظ على: نظام الأيقونات، الافتتاحية، الحركات، RTL، الخط.

   ملاحظات:
   • لا يحتوي هذا الملف منطق طلب (الطلب في wizard.js).
   • لا يحتوي منطق بيانات (في market.js).
   • لا يحتوي منطق بحث (في search.js).
   • يعتمد على: icons.js، data.js، catalog.js، market.js، market-ui.js، wizard.js، portal.js، attachments.js، search.js.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ───────── رسومات الخدمات (SVG) — كما في V6 ───────── */
const GEAR = (x,y,s=1) => `<g transform="translate(${x} ${y}) scale(${s})"><circle r="19" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="5" stroke-dasharray="5 8.35"/><circle r="14" fill="rgba(59,130,246,.25)" stroke="#fff" stroke-opacity=".9" stroke-width="4"/><circle r="6" fill="#140b18" stroke="#60a5fa" stroke-width="1.5"/></g>`;
const SPARK = (x,y,s=1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-6L1.5-1.5 6 0 1.5 1.5 0 6-1.5 1.5-6 0-1.5-1.5z" fill="#bfdbfe"/>`;
const ART = {
  /* Home hero photo (assets/brand/hero-tech-v2.webp — the technician in the platform uniform) */
  hero:'<img class="hero-photo" src="../../assets/brand/hero-tech-v3.jpg" alt="فني من هنصلحلك بيونيفورم المنصة" width="860" height="865" decoding="async" fetchpriority="high" draggable="false">',

  electric:`<svg viewBox="0 0 160 150">
    <ellipse cx="80" cy="142" rx="56" ry="6" fill="#3b82f6" opacity=".5" filter="url(#gb6)"/>
    <ellipse cx="76" cy="84" rx="62" ry="58" fill="#3b82f6" opacity=".2" filter="url(#gb10)"/>
    <rect x="22" y="26" width="88" height="110" rx="11" fill="#1c1521" stroke="url(#metal)" stroke-width="3"/>
    <rect x="31" y="36" width="70" height="90" rx="6" fill="url(#glass)" stroke="rgba(255,255,255,.22)"/>
    <g stroke="rgba(255,255,255,.28)" fill="#2b2230">
      <rect x="39" y="46" width="24" height="20" rx="4"/><rect x="69" y="46" width="24" height="20" rx="4"/>
      <rect x="39" y="72" width="24" height="20" rx="4"/><rect x="69" y="72" width="24" height="20" rx="4"/>
      <rect x="39" y="98" width="24" height="20" rx="4"/><rect x="69" y="98" width="24" height="20" rx="4"/>
    </g>
    <g fill="url(#pinkg)"><rect x="43" y="50" width="16" height="9" rx="2.5"/><rect x="73" y="76" width="16" height="9" rx="2.5"/><rect x="43" y="102" width="16" height="9" rx="2.5"/></g>
    <g fill="#8d8698"><rect x="43" y="59" width="16" height="3.5" rx="1.7"/><rect x="73" y="53" width="16" height="3.5" rx="1.7"/><rect x="43" y="85" width="16" height="3.5" rx="1.7"/><rect x="73" y="111" width="16" height="3.5" rx="1.7"/></g>
    <g transform="translate(98 2) scale(.46) translate(-28 -8)">
      <path d="M92 8L28 108h46l-12 74 70-104H86z" fill="#3b82f6" opacity=".6" filter="url(#gb6)"/>
      <path d="M92 8L28 108h46l-12 74 70-104H86z" fill="url(#pinkg)" stroke="#fff" stroke-opacity=".7" stroke-width="4" stroke-linejoin="round"/>
      <path d="M90 22L48 98h30" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="5" stroke-linecap="round"/>
    </g>
    <path d="M110 118h14a10 10 0 0 1 10 10v10" fill="none" stroke="#8d8698" stroke-width="5" stroke-linecap="round"/>
    <rect x="127" y="136" width="14" height="9" rx="3" fill="url(#metal2)"/>
    ${SPARK(16,48,1.2)}${SPARK(146,92,1.1)}${SPARK(140,26,.8)}
  </svg>`,

  plumbing:`<svg viewBox="0 0 160 150">
    <ellipse cx="86" cy="146" rx="52" ry="5" fill="#3b82f6" opacity=".5" filter="url(#gb6)"/>
    <ellipse cx="86" cy="78" rx="62" ry="56" fill="#3b82f6" opacity=".16" filter="url(#gb10)"/>
    <rect x="6" y="34" width="14" height="48" rx="4" fill="url(#metal2)" stroke="rgba(0,0,0,.3)"/>
    <rect x="18" y="46" width="94" height="24" rx="9" fill="url(#metal)" stroke="rgba(0,0,0,.3)"/>
    <rect x="94" y="46" width="26" height="52" rx="10" fill="url(#metal)" stroke="rgba(0,0,0,.3)"/>
    <rect x="90" y="94" width="34" height="13" rx="4" fill="url(#metal2)" stroke="rgba(0,0,0,.3)"/>
    <path d="M26 52h66" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>
    <rect x="52" y="30" width="11" height="18" rx="3" fill="url(#metal2)"/>
    <rect x="34" y="20" width="48" height="12" rx="6" fill="url(#pinkg)" stroke="rgba(255,255,255,.5)"/>
    <rect x="40" y="23" width="36" height="3" rx="1.5" fill="#fff" opacity=".45"/>
    <path d="M107 114c-5 8-8 12-8 16a8 8 0 0 0 16 0c0-4-3-8-8-14z" fill="#bfdbfe" opacity=".95"/>
    <path d="M104 126a4 4 0 0 0 3 4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>
    <path d="M107 134c-2 3-3 5-3 6.5a3 3 0 0 0 6 0c0-1.5-1-3.5-3-6.5z" fill="#60a5fa" opacity=".8"/>
    <ellipse cx="107" cy="145" rx="22" ry="3.5" fill="none" stroke="#60a5fa" stroke-width="1.6" opacity=".8"/>
    <rect x="10" y="108" width="46" height="16" rx="5" fill="url(#metal)" stroke="rgba(0,0,0,.3)"/>
    <rect x="22" y="104" width="7" height="24" rx="2" fill="url(#metal2)"/><rect x="40" y="104" width="7" height="24" rx="2" fill="url(#metal2)"/>
    ${SPARK(142,40,1.1)}${SPARK(18,98,.8)}${SPARK(140,70,.8)}
  </svg>`,

  carpentry:`<svg viewBox="0 0 160 150">
    <ellipse cx="80" cy="142" rx="64" ry="5" fill="#3b82f6" opacity=".45" filter="url(#gb6)"/>
    <ellipse cx="82" cy="80" rx="62" ry="54" fill="#3b82f6" opacity=".16" filter="url(#gb10)"/>
    <path d="M14 16v62h10V26h40V16z" fill="url(#metal)" stroke="rgba(0,0,0,.3)"/>
    <path d="M14 34h6M14 46h6M14 58h6M34 16v6M46 16v6M58 16v6" stroke="#2b2230" stroke-width="1.6"/>
    <rect x="12" y="108" width="136" height="28" rx="5" fill="url(#pinkg)" stroke="rgba(255,255,255,.4)"/>
    <path d="M20 116c20-4 34 4 56 0s40-4 64 0M20 126c24-3 40 3 62 0s36-3 58 0" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="1.6"/>
    <ellipse cx="148" cy="122" rx="5" ry="14" fill="#d6246f" stroke="rgba(0,0,0,.25)"/>
    <rect x="108" y="82" width="5" height="28" rx="1.5" fill="url(#metal2)"/><rect x="103" y="79" width="15" height="5" rx="2.5" fill="url(#metal)"/>
    <g transform="translate(88 70) rotate(52)">
      <rect x="-6" y="-4" width="12" height="76" rx="6" fill="url(#metal2)" stroke="rgba(0,0,0,.3)"/>
      <rect x="-3" y="6" width="3.5" height="56" rx="1.7" fill="#fff" opacity=".35"/>
      <rect x="-28" y="-30" width="56" height="26" rx="6" fill="url(#metal)" stroke="rgba(0,0,0,.35)"/>
      <path d="M-28-26C-44-30-50-18-48-8c4-6 12-8 20-8z" fill="url(#metal2)" stroke="rgba(0,0,0,.3)"/>
      <path d="M-20-24h38" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>
    </g>
    ${SPARK(132,60,1.2)}${SPARK(40,98,.9)}${SPARK(144,24,.8)}
  </svg>`,

  painting:`<svg viewBox="0 0 160 150">
    <ellipse cx="78" cy="144" rx="54" ry="5" fill="#3b82f6" opacity=".45" filter="url(#gb6)"/>
    <ellipse cx="80" cy="76" rx="62" ry="54" fill="#3b82f6" opacity=".16" filter="url(#gb10)"/>
    <rect x="12" y="62" width="96" height="16" rx="8" fill="url(#pinkg)" opacity=".55"/>
    <path d="M30 76v14a4 4 0 0 0 8 0V76M62 76v22a4 4 0 0 0 8 0V76M88 76v10a4 4 0 0 0 8 0V76" fill="#2f6fed" opacity=".55"/>
    <rect x="14" y="20" width="96" height="32" rx="12" fill="url(#pinkg)" stroke="rgba(255,255,255,.55)" stroke-width="1.5"/>
    <path d="M24 30h72" stroke="#fff" stroke-opacity=".5" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M110 36h16a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H72v12" fill="none" stroke="url(#metal)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="63" y="92" width="18" height="46" rx="8" fill="url(#metal2)" stroke="rgba(0,0,0,.3)"/>
    <rect x="68" y="100" width="4" height="30" rx="2" fill="#2b2230" opacity=".5"/>
    <g transform="translate(128 98) rotate(24)">
      <rect x="-5.5" y="2" width="11" height="40" rx="5.5" fill="url(#metal2)" stroke="rgba(0,0,0,.3)"/>
      <rect x="-9" y="-14" width="18" height="18" rx="3" fill="url(#metal)" stroke="rgba(0,0,0,.3)"/>
      <path d="M-9-14C-8-34 8-34 9-14z" fill="url(#pinkg)" stroke="rgba(255,255,255,.4)"/>
    </g>
    <circle cx="138" cy="44" r="3.5" fill="#60a5fa"/><circle cx="148" cy="58" r="2.4" fill="#3b82f6"/><circle cx="20" cy="108" r="3" fill="#bfdbfe"/>
    ${SPARK(26,92,1)}${SPARK(144,20,1)}
  </svg>`,

  cleaning:`<svg viewBox="0 0 160 150">
    <ellipse cx="80" cy="144" rx="62" ry="5" fill="#3b82f6" opacity=".45" filter="url(#gb6)"/>
    <ellipse cx="80" cy="76" rx="62" ry="56" fill="#3b82f6" opacity=".16" filter="url(#gb10)"/>
    <g transform="translate(112 12) rotate(16)">
      <rect x="-4" y="0" width="8" height="74" rx="4" fill="url(#metal2)" stroke="rgba(0,0,0,.3)"/>
      <rect x="-12" y="70" width="24" height="9" rx="3" fill="url(#metal)"/>
      <path d="M-14 78h28l10 50H-24z" fill="url(#pinkg)" stroke="rgba(255,255,255,.45)"/>
      <path d="M-8 90l-6 36M0 90v36M8 90l6 36" stroke="#000" stroke-opacity=".25" stroke-width="2" stroke-linecap="round"/>
    </g>
    <rect x="22" y="70" width="46" height="62" rx="11" fill="url(#glass)" stroke="url(#metal)" stroke-width="2.5"/>
    <rect x="27" y="92" width="36" height="35" rx="7" fill="#3b82f6" opacity=".5"/>
    <path d="M27 100c9-4 14 3 22 0s10-3 14 0" fill="none" stroke="#bfdbfe" stroke-width="2" opacity=".8"/>
    <rect x="36" y="54" width="18" height="18" rx="3" fill="url(#metal)"/>
    <path d="M30 54h36a6 6 0 0 1 6 6v7H30z" fill="url(#pinkg)" stroke="rgba(255,255,255,.4)"/>
    <path d="M66 58h10v7H66z" fill="url(#metal2)"/>
    <circle cx="45" cy="84" r="9" fill="rgba(255,255,255,.14)" stroke="#fff" stroke-opacity=".5"/><path d="M45 79l1.6 3.4 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fff" opacity=".85"/>
    <g fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"><circle cx="86" cy="48" r="6"/><circle cx="98" cy="62" r="4"/><circle cx="82" cy="70" r="3"/><circle cx="20" cy="40" r="5"/><circle cx="34" cy="30" r="3"/></g>
    ${SPARK(142,20,1.1)}${SPARK(12,16,.9)}
  </svg>`,

  appliances:`<svg viewBox="0 0 160 196">
    <ellipse cx="80" cy="190" rx="62" ry="5" fill="#3b82f6" opacity=".55" filter="url(#gb6)"/>
    <rect x="26" y="184" width="14" height="8" rx="2" fill="#2b2230"/><rect x="120" y="184" width="14" height="8" rx="2" fill="#2b2230"/>
    <rect x="14" y="4" width="132" height="182" rx="13" fill="url(#metal)" stroke="rgba(255,255,255,.5)"/>
    <rect x="14" y="4" width="38" height="182" rx="13" fill="#fff" opacity=".1"/>
    <path d="M14 46h132" stroke="#000" stroke-opacity=".22" stroke-width="2"/>
    <rect x="24" y="14" width="46" height="24" rx="5" fill="#150d17" stroke="rgba(255,255,255,.25)"/>
    <path d="M31 26h8M44 26h8M57 26h8" stroke="#3b82f6" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="104" cy="26" r="14" fill="url(#metal2)" stroke="rgba(0,0,0,.3)"/><circle cx="104" cy="26" r="9" fill="#2b2230"/><path d="M104 26l4-6" stroke="#60a5fa" stroke-width="2" stroke-linecap="round"/>
    <circle cx="134" cy="26" r="7" fill="#3b82f6" opacity=".3"/><circle cx="134" cy="26" r="3.6" fill="#3b82f6"/>
    <rect x="9" y="102" width="7" height="16" rx="2" fill="#8d8698"/>
    <circle cx="80" cy="120" r="57" fill="url(#metal2)" stroke="rgba(0,0,0,.35)"/>
    <circle cx="80" cy="120" r="47" fill="#1a1420" stroke="rgba(255,255,255,.3)" stroke-width="2"/>
    <circle cx="80" cy="120" r="40" fill="url(#glass)"/>
    <circle cx="80" cy="120" r="27" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="8"/>
    <ellipse cx="86" cy="130" rx="21" ry="11" fill="#3b82f6" opacity=".38"/><ellipse cx="70" cy="117" rx="12" ry="8" fill="#60a5fa" opacity=".28"/>
    <path d="M42 126q9-5 19 0t19 0 19 0 19 0" fill="none" stroke="#bfdbfe" stroke-opacity=".55" stroke-width="2"/>
    <path d="M50 102a34 34 0 0 1 28-17" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="106" cy="142" r="3" fill="#fff" opacity=".25"/>
  </svg>`,

  car:`<svg viewBox="0 0 240 130">
    <ellipse cx="120" cy="120" rx="104" ry="7" fill="#3b82f6" opacity=".5" filter="url(#gb6)"/>
    <path d="M10 94c0-14 16-18 34-22l26-27c6-6 14-9 24-9h56c12 0 20 4 28 14l18 20c18 4 32 8 32 24v8H10z" fill="url(#pinkg)"/>
    <path d="M10 94h218v8H10z" fill="#000" opacity=".28"/>
    <path d="M80 50l14-6h24v28H58zM126 44h28c6 0 10 3 14 8l12 20h-54z" fill="#18101c" opacity=".94"/>
    <path d="M96 46h18l-14 26H84zM130 46h12l-12 26h-8z" fill="#fff" opacity=".1"/>
    <path d="M24 88c44-8 124-10 202 2" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1.6"/>
    <path d="M122 46v56" stroke="#000" stroke-opacity=".3"/><rect x="108" y="78" width="10" height="3" rx="1.5" fill="#fff" opacity=".6"/>
    <circle cx="62" cy="102" r="23" fill="#0a070c"/><circle cx="182" cy="102" r="23" fill="#0a070c"/>
    <g><circle cx="62" cy="102" r="19" fill="#0e0a10" stroke="url(#metal)" stroke-width="3"/><circle cx="62" cy="102" r="12" fill="url(#metal)"/><path d="M62 90v24M50 102h24M53.5 93.5l17 17M70.5 93.5l-17 17" stroke="#0e0a10" stroke-width="1.6"/><circle cx="62" cy="102" r="3.5" fill="#0e0a10"/></g>
    <g><circle cx="182" cy="102" r="19" fill="#0e0a10" stroke="url(#metal)" stroke-width="3"/><circle cx="182" cy="102" r="12" fill="url(#metal)"/><path d="M182 90v24M170 102h24M173.5 93.5l17 17M190.5 93.5l-17 17" stroke="#0e0a10" stroke-width="1.6"/><circle cx="182" cy="102" r="3.5" fill="#0e0a10"/></g>
    <ellipse cx="224" cy="83" rx="14" ry="5" fill="#fff" opacity=".35" filter="url(#gb6)"/><rect x="212" y="80" width="15" height="7" rx="3.5" fill="#fff"/>
    <rect x="8" y="78" width="6" height="9" rx="2" fill="#ff1744"/>
  </svg>`,
};

const TABS = [['home','الرئيسية','home'],['sections','الخدمات','grid'],['new','طلب خدمة','plus'],['orders','طلباتي','list'],['account','حسابي','user']];   // search: header button + Home field

/* ───────── أدوات ───────── */
const $ = s => document.querySelector(s);
const view = $('#view'), app = $('#app');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm = s => String(s).replace(/[\u064B-\u065F\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').toLowerCase().trim();
const store = {
  get(k,d){ try{ const v = localStorage.getItem('hs_'+k); return v===null?d:JSON.parse(v);}catch{ return d; } },
  set(k,v){ try{ localStorage.setItem('hs_'+k, JSON.stringify(v)); }catch{} }
};
let toastT;
/* toast(msg, type?): type success | error | warn | info — inferred from the wording when not given. The text stays
   plain (textContent); colour and glyph come from CSS (data-type), so screen readers read only the message. */
const TOAST_TYPE = m => /^(تعذّر|تعذر|خطأ|فشل|لا يمكن|غير مسموح)/.test(m) ? 'error'
  : /^(اختر|اكتب|أدخل|رقم الهاتف غير|البريد|كلمة المرور|سجّل الدخول|يرجى)/.test(m) ? 'warn'
  : /^(تم|شكرًا|شكرا|أهلاً|أهلا|تمام)/.test(m) ? 'success' : 'info';
function toast(msg, type){ const t=$('#toast'); if(!t) return; t.textContent=msg; try { t.setAttribute('data-type', type || TOAST_TYPE(String(msg||''))); } catch {} t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'), (type||TOAST_TYPE(String(msg||'')))==='error' ? 3600 : 2400); }

/* مفتاح مشكلة "قسم:رقم" — توافق خلفي فقط للمفضلة القديمة/الروابط القديمة */
const getProb = key => {
  const m = /^([a-z]+):(\d+)$/.exec(String(key)); if(!m) return null;
  const d = DEVICES[m[1]], p = d && d.problems[+m[2]];
  return p ? [d, p, m[1], +m[2]] : null;
};

/* ترحيل خفيف */
(function migrate(){
  if (store.get('ver',0) < 3){ store.set('fav',[]); store.set('ver',3); }
  const f = store.get('fav',[]); store.set('fav', Array.isArray(f) ? f.filter(k=>getProb(k)) : []);
  const r = store.get('reqs',[]); store.set('reqs', Array.isArray(r) ? r.filter(x=>x && typeof x==='object' && x.t) : []);
  const rc = store.get('recent',[]); store.set('recent', Array.isArray(rc) ? rc.filter(x=>typeof x==='string') : []);
  const u = store.get('user',null); if (u && (typeof u!=='object' || !u.name)) store.set('user',null);
})();

/* ───────── مكونات ───────── */
const topbar = () => {
  let hasNotes = false;
  try { const c = me(); hasNotes = c ? MP.unreadFor('customer:'+c.id) > 0 : false; } catch {}
  return `
<header class="topbar">
  <div class="tb-actions"><button class="ic-btn" data-act="menu" aria-label="القائمة">${ic('menu')}</button></div>
  <div class="logo"><span class="hs-logo" aria-label="هنصلحلك HANSALEHLAK">${typeof HSBrandIcons !== 'undefined' && HSBrandIcons.mark ? HSBrandIcons.mark(46) : '<img src="../../assets/brand/hsl-mark.svg" alt="" width="38" height="38" decoding="async" draggable="false">'}<span class="w" aria-hidden="true"><b>هنصلحلك</b><small>HANSALEHLAK</small></span></span></div>
  <div class="tb-actions">
    <button class="ic-btn mini-search" data-act="miniSearch" aria-label="ابحث عن خدمة">${ic('search')}</button>
    <button class="ic-btn ${hasNotes?'dot':''}" data-act="bell" aria-label="الإشعارات">${ic('bell')}</button>
  </div>
</header>`;
};
/* V8-C3: البلاطة تفتح مسار الكتالوج الجديد (قسم ← جهاز ← مشكلة) إن وُجد القسم في CAT؛ وإلا تعود لمسار details القديم (توافق خلفي). */
const tile = (k, small) => {
  let viaCat = false;
  try { const c = CAT.category(k); viaCat = !!(c && c.active); } catch {}
  const target = viaCat ? `data-wz-hit="cat|${k}"` : `data-dev="${k}"`;
  return `<button class="tile glass neon ${small?'small':''}" ${target} aria-label="${DEVICES[k].name}">${(()=>{ const bi = typeof HSBrandIcons!=='undefined' && HSBrandIcons.svg(k); /* 2026 identity: two-tone brand icons */ return bi ? `<span class="tart brand" aria-hidden="true">${bi}</span>` : `<span class="tart ${typeof icImg==='function'&&icImg('c-'+k)?'ph':''}" aria-hidden="true">${(typeof icImg==='function'&&icImg('c-'+k)) || ic(icExists('c-'+k) ? 'c-'+k : (DEVICES[k].icon || 'p-service'))}</span>`; })()}<span class="tl">${DEVICES[k].cat}</span><span class="tfrom" data-from-cat="${k}" hidden></span></button>`;
};
const tiles = (small) => `<div class="grid fit">${HOME_ORDER.map(k=>tile(k,small)).join('')}</div>`;
const head = (title, back) => `<div class="dhead">${back?`<button class="back" data-back aria-label="رجوع">${ic('back')}</button>`:'<span></span>'}<h2 tabindex="-1">${title}</h2><span></span></div>`;

/* ───────── الشرائح (كما في V6) ───────── */
/* slides published from the Admin Center (HSSiteContent) replace the built-in GUIDES; action: wizard|services|orders|none */
const slideList = () => { const s = globalThis.HSSiteContent && HSSiteContent.slides(); return s && s.length ? s : GUIDES; };
const discover = () => `
<section class="disc" aria-labelledby="discT">
  <h2 class="sec-title" id="discT">${ic('sparkle')}اكتشف خدمات هنصلحلك</h2>
  <div class="car" id="car" tabindex="0" role="region" aria-roledescription="carousel" aria-label="اكتشف خدمات هنصلحلك">
    <div class="track" id="track">
      ${slideList().map((g,i,L)=>`
      <article class="slide s-${g.id} ${g.img?'has-img':'no-img'}" id="guide-slide-${g.id}" role="group" aria-roledescription="slide" aria-label="${i+1} من ${L.length}" aria-labelledby="guide-tab-${g.id}">
        ${g.img ? `<img class="s-img" src="${g.img}" alt="" decoding="async" draggable="false" ${i?'loading="lazy"':''} onerror="this.remove()">
        <div class="s-shade"></div>` : `<div class="s-art" aria-hidden="true"><span class="s-num">${String(i+1).padStart(2,'0')}</span><span class="s-ic">${ic(g.icon||'sparkle')}</span></div>`}
        <div class="s-body">
          <h3>${esc(g.title)}</h3>
          <p>${esc(g.desc)}</p>
          ${g.action ? (g.action !== 'none' && g.cta ? `<button class="s-cta" data-act="slideGo" data-to="${esc(g.action)}">${esc(g.cta)} ${ic('chev')}</button>` : '') : `<button class="s-cta" data-act="slide" data-s="${g.id}">${g.cta} ${ic('chev')}</button>`}
        </div>
      </article>`).join('')}
    </div>
  </div>
  <div class="dots" id="dots" role="tablist" aria-label="مؤشر الشرائح">${slideList().map((g,i)=>`<button type="button" role="tab" id="guide-tab-${g.id}" aria-controls="guide-slide-${g.id}" class="${i?'':'on'}" data-dot="${i}" aria-label="${g.title}" aria-selected="${i?'false':'true'}"></button>`).join('')}</div>
</section>`;

let carTimer = null;
function initCarousel(){
  clearInterval(carTimer);
  const car=$('#car'), track=$('#track'); if(!track) return;
  const slides=[...track.children], dots=[...document.querySelectorAll('#dots button')];
  const dotList = document.querySelector('#dots');
  const dotTabs = dotList && window.HSA11yTabs ? window.HSA11yTabs.attach(dotList) : null;
  let cur=0, pausedUntil=0, hover=false, raf=0, drag=null, moved=false;
  const pause = (ms=7000)=>{ pausedUntil = Date.now()+ms; };
  const nearest = () => {
    const max = track.scrollWidth - track.clientWidth, x = Math.abs(track.scrollLeft);
    if (x <= 2) return 0;
    if (x >= max-2) return slides.length-1;
    const tr = track.getBoundingClientRect(), c = tr.left + tr.width/2;
    let best=0, bd=1e9;
    slides.forEach((s,i)=>{ const r=s.getBoundingClientRect(), d=Math.abs(r.left+r.width/2-c); if(d<bd){bd=d;best=i;} });
    return best;
  };
  const paint = () => { raf=0; cur = nearest(); dots.forEach((d,i)=>{ d.classList.toggle('on',i===cur); d.setAttribute('aria-selected',i===cur ? 'true' : 'false'); }); if(dotTabs) dotTabs.sync(); };
  const goTo = (i, smooth=true) => {
    const s=slides[(i+slides.length)%slides.length], tr=track.getBoundingClientRect(), r=s.getBoundingClientRect();
    track.scrollBy({left:(r.left+r.width/2)-(tr.left+tr.width/2), behavior: smooth?'smooth':'auto'});
  };
  track.addEventListener('scroll', ()=>{ if(!raf) raf=requestAnimationFrame(paint); }, {passive:true});
  dots.forEach(d=>d.addEventListener('click',()=>{ pause(9000); goTo(+d.dataset.dot); }));
  ['touchstart','wheel','focusin'].forEach(ev=>car.addEventListener(ev,()=>pause(9000),{passive:true}));
  car.addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'){ e.preventDefault(); pause(9000); goTo(Math.min(cur+1,slides.length-1)); }
    if(e.key==='ArrowRight'){ e.preventDefault(); pause(9000); goTo(Math.max(cur-1,0)); }
  });
  track.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='mouse' || e.button!==0) return;
    drag={x:e.clientX, left:track.scrollLeft, id:e.pointerId}; moved=false; pause(9000);
  });
  track.addEventListener('pointermove',e=>{
    if(!drag) return;
    const dx=e.clientX-drag.x;
    if(!moved && Math.abs(dx)>5){ moved=true; track.classList.add('drag'); try{track.setPointerCapture(drag.id);}catch{} }
    if(moved) track.scrollLeft = drag.left - dx;
  });
  const end = () => { if(!drag) return; const was=moved; drag=null; track.classList.remove('drag'); if(was){ goTo(nearest()); setTimeout(()=>moved=false,0); } };
  track.addEventListener('pointerup',end); track.addEventListener('pointercancel',end);
  track.addEventListener('click',e=>{ if(moved){ e.preventDefault(); e.stopPropagation(); } },true);
  car.addEventListener('mouseenter',()=>hover=true); car.addEventListener('mouseleave',()=>hover=false);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches){
    carTimer = setInterval(()=>{
      if(!document.body.contains(track)) return clearInterval(carTimer);
      if(hover || drag || state.sheet || document.hidden || Date.now()<pausedUntil) return;
      goTo(cur+1);
    }, 5500);
  }
  paint();
}

/* ═════════ أقسام الرئيسية الجديدة — V7 ═════════ */

/* خدمة سابقة للعميل: يعيد [{kind:'req', req}] */
function recentUsedServices(){
  try {
    const c = me(); if (!c) return [];
    const reqs = MP.reqs().filter(r => r.customerId === c.id);
    /* خدمة مميزة = كل زوج (itemId) فريد؛ نأخذ أول 4 */
    const seen = new Set(), out = [];
    for (const r of reqs) {
      const key = r.itemId || r.cat;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      if (out.length >= 4) break;
    }
    return out;
  } catch { return []; }
}

function favoriteProviders(){
  try {
    const c = me(); if (!c) return [];
    const favs = MP.favoritesFor(c.id).filter(f => f.kind === 'provider');
    return favs.map(f => MP.get('providers', f.refId)).filter(Boolean).slice(0, 4);
  } catch { return []; }
}

function renderRecentUsed(){
  const list = recentUsedServices();
  if (!list.length) return '';
  const row = (r) => {
    const cat = CAT.category(r.cat); const it = CAT.item(r.itemId);
    return `<button class="prow glass neon" data-repeat="${r.id}" title="إعادة طلب الخدمة">
      ${icp(icItem(it, r.cat), 'dev')}
      <span class="tx">${esc(it ? it.name : r.serviceName)}<small>${esc(cat ? cat.name : '')} — إعادة طلب</small></span>
      ${ic('chev','chev')}
    </button>`;
  };
  return `<h2 class="sec-title">${ic('clock')}خدمات استخدمتها مؤخرًا</h2>
    <div class="plist">${list.map(row).join('')}</div>`;
}

function renderFavorites(){
  const provs = favoriteProviders();
  let services = [];
  try {
    const c = me(); if (c) {
      const favs = MP.favoritesFor(c.id).filter(f => f.kind === 'service');
      services = favs.map(f => CAT.problem(f.refId) || CAT.item(f.refId)).filter(Boolean).slice(0, 3);
    }
  } catch {}
  if (!provs.length && !services.length) return '';
  const provRow = (p) => `<button class="prow glass neon" data-provider="${esc(p.id)}">
    ${icp(icSec(SEC_ICON_FOR(p.cats[0])), 'sv')}
    <span class="tx">${esc(p.name)}<small>${p.cats.map(MP.catName).join('، ')} — ${esc((p.areas||[]).slice(0,2).join('، ') || (p.govs||[]).join('، '))}</small></span>
    <span class="tag">${starsHtml(Math.round(p.rating || 0))}</span>
  </button>`;
  const svcRow = (s) => {
    const isProb = !!s.slug;
    const type = isProb ? 'problem' : 'item';
    return `<button class="prow glass neon" data-provider-service="${type}|${esc(s.id)}">
      ${icp('star', 'pr')}
      <span class="tx">${esc(s.name)}<small>${isProb ? 'مشكلة محفوظة' : 'نوع عمل محفوظ'}</small></span>
      ${ic('chev','chev')}
    </button>`;
  };
  return `<h2 class="sec-title">${ic('heart')}المفضلة</h2>
    ${provs.length?`<div class="lbl">مقدمو خدمة</div><div class="plist">${provs.map(provRow).join('')}</div>`:''}
    ${services.length?`<div class="lbl">خدمات</div><div class="plist">${services.map(svcRow).join('')}</div>`:''}`;
}

function renderServiceAreas(){
  /* Firebase backend: service areas are server data — no hardcoded fallback and no demo notice; nothing until configured */
  if (typeof HSFirebaseConfig !== 'undefined' && HSFirebaseConfig.mode === 'firebase') {
    let real = [];
    try { real = MP.db().serviceAreas.filter(x => !x.demo).map(x => x.gov); } catch {}
    return real.length ? `<h2 class="sec-title">${ic('pin')}مناطق الخدمة</h2><div class="chips" style="flex-wrap:wrap">${real.map(g => `<span class="chip">${ic('pin')} ${esc(g)}</span>`).join('')}</div>` : '';
  }
  let govs = [];
  try {
    govs = MP.db().serviceAreas.map(x => x.gov);
  } catch {}
  if (!govs.length) govs = ['القاهرة','الجيزة','الإسكندرية'];
  const chips = govs.map(g => `<span class="chip">${ic('pin')} ${esc(g)}</span>`).join('');
  return `<h2 class="sec-title">${ic('pin')}مناطق الخدمة</h2>
    ${(globalThis.HSFirebaseConfig&&globalThis.HSFirebaseConfig.mode==='firebase')?'':`<div class="demo-banner">${ic('info')}<span>بيانات تجريبية — المناطق الفعلية تُحدَّد عند تشغيل المنصة.</span></div>`}
    <div class="chips" style="flex-wrap:wrap">${chips}</div>`;
}

/* مساعدة: أيقونة قسم من cats */
function SEC_ICON_FOR(cat) {
  const d = DEVICES[cat]; return d ? d.icon : 'grid';
}


/* ═════════ V8-C3: الرئيسية والتنقل ═════════
   ملاحظة: me/myReqs/reqCard معرّفة في market-ui.js (تُحمَّل بعد app.js) — تُستدعى وقت العرض فقط، وأول عرض مؤجل حتى اكتمال التحميل (انظر البدء). */
const homeMe = () => { try { return me(); } catch { return null; } };

/* طلبات العميل النشطة (غير النهائية)، الأحدث أولًا */
/* newest real reviews with their service name (no customer identity) */
function homeLatestReviews(){
  try {
    const reqs = MP.reqs();
    return (MP.db().reviews || []).filter(v => !v.hidden).sort((a, b) => String(b.at || '') < String(a.at || '') ? -1 : 1).slice(0, 12)
      .map(v => { const r = reqs.find(x => x.id === v.reqId); return { stars: +v.stars || 0, comment: v.comment || '', service: r ? r.serviceName : '' }; });
  } catch { return []; }
}
/* category tiles: «يبدأ من» from the public price list (customer prices), fetched once and cached for 5 minutes */
let _priceFrom = null, _priceAt = 0;
function fillTilePrices(){
  const paint = map => document.querySelectorAll('[data-from-cat]').forEach(el => { const v = map[el.dataset.fromCat]; if (v) { el.textContent = 'يبدأ من ' + Number(v).toLocaleString('ar-EG') + ' ج.م'; el.hidden = false; } });
  if (_priceFrom && Date.now() - _priceAt < 300000) return paint(_priceFrom);
  if (typeof HSApiClient === 'undefined') return;
  HSApiClient.request('GET', '/pricing').then(res => {
    if (!res || !res.ok || !res.data || !res.data.prices) return;
    const min = {};
    for (const [key, price] of Object.entries(res.data.prices)) { const cat = String(key).split('/')[0]; if (price > 0 && (!min[cat] || price < min[cat])) min[cat] = price; }
    _priceFrom = min; _priceAt = Date.now(); paint(min);
  }).catch(() => {});
}
/* ═════════ round 5: Home extras — address switcher, today's demand, packages, invite a friend; services filters ═════════ */
const addrName = a => a ? (a.label || a.name || ({ home: 'البيت', work: 'الشغل' })[a.type] || a.area || 'عنواني') : '';
function homeAddressBar(){
  const c = homeMe(); if (!c) return '';
  const list = MP.addressesFor(c.id); if (!list.length) return '';
  const def = MP.defaultAddress(c.id) || list[0];
  return `<button type="button" class="addr-bar" data-act="addrSwitch" aria-haspopup="dialog">${ic('pin')}<span><small>الخدمة لـ</small><b>${esc(addrName(def))}</b><em>${esc([def.area, def.gov].filter(Boolean).join('، '))}</em></span>${ic('chev')}</button>`;
}
function openAddressSwitch(){
  const c = homeMe(); if (!c) return;
  const list = MP.addressesFor(c.id), def = MP.defaultAddress(c.id) || list[0];
  sheet(`<h4>${ic('pin')} الخدمة لأنهي عنوان؟</h4><div class="plist addr-pick" role="list">${list.map(a => `<button type="button" class="prow glass neon ${def && a.id === def.id ? 'sel' : ''}" data-addr-def="${esc(a.id)}" aria-pressed="${!!(def && a.id === def.id)}">${ic('pin')}<span class="tx">${esc(addrName(a))}<small>${esc([a.area, a.gov].filter(Boolean).join('، '))}</small></span>${def && a.id === def.id ? ic('check') : ''}</button>`).join('')}</div>
    <button type="button" class="cta ghost" data-go="addresses">${ic('plus')} إضافة أو تعديل العناوين</button>`);
}
function homeTrending(){
  const tr = (MP.db().settings || {}).trend; if (!tr || !tr.cats || typeof MP.cairoDay !== 'function' || tr.day !== MP.cairoDay()) return '';
  const top = Object.entries(tr.cats).filter(([k, n]) => n > 0 && CAT.category(k) && CAT.category(k).active !== false).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (top.reduce((s, [, n]) => s + n, 0) < 3) return '';                      // too few to say anything (and nothing identifiable)
  return `<section class="trend" aria-labelledby="trendT"><h2 class="sec-title" id="trendT">${ic('bolt')}الأكثر طلبًا النهارده</h2>
    <div class="chips trend-row">${top.map(([k, n]) => `<button type="button" class="chip" data-wz-hit="cat|${esc(k)}">${esc(CAT.category(k).name)}<small>${n.toLocaleString('ar-EG')} طلب</small></button>`).join('')}</div></section>`;
}
function homePackages(){
  const pk = ((MP.db().settings || {}).packages || []).filter(p => p && p.active !== false);
  if (!pk.length) return '';
  return `<section class="pkgs" aria-labelledby="pkgT"><h2 class="sec-title" id="pkgT">${ic('calendar')}باقات الصيانة الدورية</h2>
    <div class="pkg-row">${pk.map(p => `<article class="pkg-card glass neon"><b>${esc(p.name)}</b>${p.desc ? `<p>${esc(p.desc)}</p>` : ''}
      <ul><li>${ic('calendar')} ${Number(p.visits) || 1} ${Number(p.visits) > 2 && Number(p.visits) < 11 ? 'زيارات' : 'زيارة'}</li>${p.cat && CAT.category(p.cat) ? `<li>${ic('wrench')} ${esc(CAT.category(p.cat).name)}</li>` : ''}</ul>
      <div class="pkg-foot"><span class="pkg-price">${Number(p.price) ? Number(p.price).toLocaleString('ar-EG') + ' ج.م' : 'السعر مع الفني'}</span><button type="button" class="cta" data-act="pkgStart" data-id="${esc(p.id)}">اطلب الباقة</button></div></article>`).join('')}</div>
    <p class="pkg-note">بتطلب الباقة زي أي طلب، والفني بيتفق معاك على مواعيد الزيارات. الدفع كاش للفني.</p></section>`;
}
function homeInvite(){
  const ref = (MP.db().settings || {}).referral; if (!ref || !ref.on || !(+ref.reward > 0) || !homeMe()) return '';
  return `<button type="button" class="invite-card" data-act="invite">${ic('share')}<span><b>ادعُ صاحبك وخد ${(+ref.reward).toLocaleString('ar-EG')} ج.م</b><small>صاحبك بياخد خصم على أول طلب، وانت بيتضافلك رصيد لما يخلّص</small></span>${ic('chev')}</button>`;
}
function openInvite(btn){
  apiCall('invite', btn, () => HSCustomerApi.refCode(), res => {
    const d = res.data, msg = `جرّب هنصلحلك لأي صيانة في البيت — استخدم كود الدعوة ${d.code} وخد خصم ${d.reward} ج.م على أول طلب.`;
    sheet(`<h4>${ic('share')} ادعُ صاحبك</h4><div class="invite-code" dir="ltr">${esc(d.code)}</div>
      <p class="sub">صاحبك يكتب الكود في آخر خطوة من طلبه الأول وياخد خصم ${esc(d.reward)} ج.م. ولما الخدمة تخلص بيتضافلك ${esc(d.reward)} ج.م رصيد بيتخصم تلقائيًا من طلبك الجاي.</p>
      ${+d.credit > 0 ? `<div class="need">${ic('wallet')}<span>رصيدك الحالي: <b>${money(d.credit)}</b></span></div>` : ''}
      <button type="button" class="cta" data-act="inviteShare" data-msg="${esc(msg)}">${ic('share')} ابعت الكود</button>`);
  });
}
/* «الخدمات»: quick filters */
let secFilter = 'all';
function sectionsTiles(){
  let keys = HOME_ORDER.slice();
  if (secFilter === 'now') keys = keys.filter(k => (MP.db().providers || []).some(p => p.status === 'approved' && p.available !== false && (p.cats || []).includes(k)));
  if (secFilter === 'price') keys.sort((a, b) => ((_priceFrom && _priceFrom[a]) || Infinity) - ((_priceFrom && _priceFrom[b]) || Infinity));
  const chips = [['all', 'الكل'], ['now', 'متاح دلوقتي'], ['price', 'الأقل سعرًا']].map(([v, l]) => `<button type="button" class="chip ${secFilter === v ? 'on' : ''}" data-sec-filter="${v}" aria-pressed="${secFilter === v}">${l}</button>`).join('');
  return `<div class="chips sec-filters" role="group" aria-label="تصفية الأقسام">${chips}</div>${keys.length ? `<div class="grid fit">${keys.map(k => tile(k)).join('')}</div>` : uiEmpty('clock', 'مفيش فنيين متاحين دلوقتي', 'جرّب «الكل» واطلب، وهنلاقيلك فني في أقرب وقت')}`;
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act="addrSwitch"],[data-addr-def],[data-act="pkgStart"],[data-act="invite"],[data-act="inviteShare"],[data-sec-filter]');
  if (!t) return;
  const d = t.dataset;
  if (d.secFilter === undefined && d.addrDef === undefined && !['addrSwitch', 'pkgStart', 'invite', 'inviteShare'].includes(d.act)) return;
  e.preventDefault(); e.stopPropagation();
  if (d.secFilter !== undefined) {
    secFilter = d.secFilter;
    if (secFilter === 'price' && !_priceFrom) { fillTilePrices(); setTimeout(() => show('sections'), 700); }
    show('sections'); return;
  }
  if (d.act === 'addrSwitch') return openAddressSwitch();
  if (d.addrDef !== undefined) return apiCall('addr-def:' + d.addrDef, t, () => HSCustomerApi.updateAddress(d.addrDef, { default: true }), () => { closeSheet(true); show('home'); toast('اتغيّر عنوان الخدمة'); });
  if (d.act === 'pkgStart') {
    const p = ((MP.db().settings || {}).packages || []).find(x => x.id === d.id); if (!p) return;
    startRequest(p.cat && CAT.category(p.cat) ? p.cat : undefined);
    if (typeof WZ !== 'undefined' && WZ) { WZ.packageId = p.id; show('wizard'); }
    toast(`بتطلب باقة «${p.name}» — كمّل تفاصيل الطلب`);
    return;
  }
  if (d.act === 'invite') return openInvite(t);
  if (d.act === 'inviteShare') return typeof shareText === 'function' ? shareText('كود دعوة هنصلحلك', d.msg) : null;
}, true);
/* ═════════ round 6: interactive Home — when-chips, pull to refresh, tap feedback, tab tap → top, sticky search ═════════ */
const WHEN_KEY = 'hs_when_pref';
const whenPref = () => { try { return sessionStorage.getItem(WHEN_KEY) || ''; } catch { return ''; } };
/* «امتى محتاج الفني؟» — the choice pre-fills the schedule step of the next request */
function homeWhen(){
  const cur = whenPref();
  const opts = [['today', 'النهارده'], ['tomorrow', 'بكرة'], ['flex', 'أي وقت يناسب الفني']];
  return `<section class="when-pick" aria-labelledby="whenT"><h2 class="sec-title" id="whenT">${ic('clock')}امتى محتاج الفني؟</h2>
    <div class="chips" role="radiogroup" aria-labelledby="whenT">${opts.map(([v, l]) => `<button type="button" class="chip ${cur === v ? 'on' : ''}" role="radio" aria-checked="${cur === v}" data-when="${v}">${l}</button>`).join('')}</div>
    ${cur ? `<small class="when-note">هنحط الموعد ده في طلبك الجاي، وتقدر تغيّره وانت بتطلب.</small>` : ''}</section>`;
}
/* applied when a new request starts (request-wizard calls it after wzNew) */
function applyWhenPref(w){
  const v = whenPref(); if (!w || !w.schedule || !v) return;
  const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  if (v === 'flex') { w.schedule.flexible = true; return; }
  w.schedule.flexible = false; w.schedule.date = iso(v === 'today' ? 0 : 1);
  if (!w.schedule.period) w.schedule.period = v === 'today' && new Date().getHours() >= 12 ? 'evening' : 'morning';
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-when]'); if (!t) return;
  const v = t.dataset.when, next = whenPref() === v ? '' : v;      // tapping the selected chip clears it
  try { if (next) sessionStorage.setItem(WHEN_KEY, next); else sessionStorage.removeItem(WHEN_KEY); } catch {}
  const box = t.closest('.when-pick'); if (box) box.outerHTML = homeWhen();
  toast(next ? 'تمام — هنحطه في طلبك' : 'اتلغى الاختيار');
});

/* light haptic tick on phones for primary taps (no-op where vibration is unsupported) */
document.addEventListener('click', e => {
  if (!e.target.closest('.cta,.hero-cta,.tile,.chip,.tab,.prow')) return;
  try { if (navigator.vibrate && matchMedia('(pointer:coarse)').matches) navigator.vibrate(8); } catch {}
}, { passive: true });

/* Pull down at the top of Home / Orders to refresh from the server */
function mountPullRefresh(){
  if (!view || view.dataset.ptr) return; view.dataset.ptr = '1';
  const ind = document.createElement('div'); ind.className = 'ptr'; ind.setAttribute('aria-hidden', 'true'); ind.innerHTML = ic('arrow');
  document.body.appendChild(ind);
  let y0 = null, dy = 0, busy = false;
  const can = () => !busy && !state.sheet && view.scrollTop <= 0 && state.lastShown && ['home', 'orders', 'tracking'].includes(state.lastShown.name);
  view.addEventListener('touchstart', e => { y0 = can() && e.touches.length === 1 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  view.addEventListener('touchmove', e => {
    if (y0 == null) return; dy = e.touches[0].clientY - y0;
    if (dy <= 0) { ind.style.cssText = ''; return; }
    const d = Math.min(90, dy * 0.5);
    ind.style.cssText = `opacity:${Math.min(1, d / 60)};transform:translate(-50%,${d}px) rotate(${d * 3}deg)`;
    ind.classList.toggle('ready', d >= 60);
  }, { passive: true });
  view.addEventListener('touchend', async () => {
    if (y0 == null) return; y0 = null;
    const go = Math.min(90, dy * 0.5) >= 60; dy = 0;
    if (!go) { ind.style.cssText = ''; ind.classList.remove('ready'); return; }
    busy = true; ind.classList.add('spin'); ind.style.cssText = 'opacity:1;transform:translate(-50%,56px)';
    try { if (globalThis.HSBackend && typeof HSBackend.sync === 'function') await HSBackend.sync(); } catch {}
    const s = state.lastShown; if (s) { const y = view.scrollTop; show(s.name, s.arg); view.scrollTop = y; }
    ind.classList.remove('spin', 'ready'); ind.style.cssText = ''; busy = false;
    toast('اتحدّثت البيانات');
  });
}

/* Sticky mini search: once the Home hero scrolls away, a compact search button appears in the top bar */
function mountStickySearch(){
  if (!view || view.dataset.sticky) return; view.dataset.sticky = '1';
  let raf = 0;
  view.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const hero = view.querySelector('.hero'), on = !!hero && state.lastShown && state.lastShown.name === 'home' && hero.getBoundingClientRect().bottom < 60;
      document.documentElement.classList.toggle('show-mini-search', on);
    });
  }, { passive: true });
}
document.addEventListener('click', e => {
  const ms = e.target.closest('[data-act="miniSearch"]'); if (!ms || ms.dataset.act !== 'miniSearch' || typeof view.scrollTo !== 'function') return;
  view.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  setTimeout(() => { const q = document.getElementById('q'); if (q) try { q.focus({ preventScroll: true }); } catch {} }, 350);
});
/* ═════════ round 7: category peek (long-press / right-click) + quick actions on the active-request card ═════════ */
function openCatPeek(k){
  const c = CAT.category(k); if (!c) return;
  const items = CAT.items(k) || [];
  const probs = items.flatMap(i => (CAT.problems(i.id) || []).slice(0, 2).map(p => ({ p, i }))).slice(0, 6);
  const from = _priceFrom && _priceFrom[k];
  const avail = (MP.db().providers || []).filter(p => p.status === 'approved' && p.available !== false && (p.cats || []).includes(k)).length;
  sheet(`<h4>${esc(c.name)}</h4>
    <div class="sub">${items.length} ${items.length > 10 ? 'خدمة' : 'خدمات'}${from ? ` • يبدأ من ${Number(from).toLocaleString('ar-EG')} ج.م` : ''}${avail ? ` • ${avail} فني متاح` : ''}</div>
    ${probs.length ? `<p class="peek-h">أشهر المشاكل — اضغط وابدأ الطلب على طول</p><div class="plist peek-list">${probs.map(({ p, i }) => `<button type="button" class="prow glass neon" data-wz-hit="problem|${esc(p.id)}">${ic('wrench')}<span class="tx">${esc(p.name)}<small>${esc(i.name)}</small></span>${ic('chev', 'chev')}</button>`).join('')}</div>` : ''}
    <button type="button" class="cta" data-wz-hit="cat|${esc(k)}">${ic('grid')} كل خدمات ${esc(c.name)}</button>`);
  if (!_priceFrom) fillTilePrices();
}
function mountTilePeek(){
  if (!view || view.dataset.peek) return; view.dataset.peek = '1';
  const tileOf = e => e.target && e.target.closest && e.target.closest('.tile[data-wz-hit^="cat|"]');
  let timer = null, fired = false, x0 = 0, y0 = 0;
  view.addEventListener('touchstart', e => {
    const t = tileOf(e); if (!t || e.touches.length !== 1) return;
    fired = false; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fired = true; try { if (navigator.vibrate) navigator.vibrate(15); } catch {} openCatPeek(t.dataset.wzHit.split('|')[1]); }, 450);
  }, { passive: true });
  view.addEventListener('touchmove', e => { if (timer && Math.hypot(e.touches[0].clientX - x0, e.touches[0].clientY - y0) > 10) { clearTimeout(timer); timer = null; } }, { passive: true });
  view.addEventListener('touchend', () => { clearTimeout(timer); timer = null; }, { passive: true });
  /* desktop: right-click opens the same peek; on phones it stops the system menu after a long press */
  view.addEventListener('contextmenu', e => { const t = tileOf(e); if (!t) return; e.preventDefault(); if (!fired) openCatPeek(t.dataset.wzHit.split('|')[1]); });
  /* the tap that ends a long press must not also open the request */
  view.addEventListener('click', e => { if (fired && tileOf(e)) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
}
/* «رسالة» on the active-request card: open tracking straight on the chat */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act="openChat"]'); if (!t || t.dataset.act !== 'openChat') return;
  e.preventDefault(); e.stopPropagation();
  state.stack.push('track:' + t.dataset.id); history.pushState({ t: 1 }, ''); show('tracking', t.dataset.id);
  setTimeout(() => { const h = document.getElementById('chat-h'); if (h) h.scrollIntoView({ block: 'start' }); const i = document.getElementById('chat-text'); if (i) try { i.focus({ preventScroll: true }); } catch {} }, 60);
}, true);
function homeActiveRequests(){
  try {
    const c = homeMe(); if (!c) return [];
    return MP.reqs()
      .filter(r => r.customerId === c.id && !FINAL_STATUSES.has(r.status))
      .sort((a, b) => String(b.createdAt || '') < String(a.createdAt || '') ? -1 : 1);
  } catch { return []; }
}

/* «الخطوة التالية» لكل حالة + هل المطلوب إجراء من العميل؟ (متوافق مع أزرار تفاصيل الطلب في market-ui.js) */
const NEXT_STEP = {
  received:'بنراجع طلبك', searching:'بندوّر على مقدم خدمة مناسب', sent:'بانتظار رد مقدم الخدمة',
  accepted:'بانتظار تأكيد الموعد', scheduled:'الموعد متأكد — جهّز المكان', enroute:'مقدم الخدمة في الطريق إليك',
  arrived:'مقدم الخدمة وصل', started:'الخدمة جارية الآن', quote:'مطلوب موافقتك على السعر', completed:'أكّد إتمام الخدمة'
};
function nextStepOf(r){
  if (r.status === 'accepted' && r.proposal) return { need:true, text:'مقدم الخدمة اقترح موعدًا — محتاج موافقتك' };
  if (r.status === 'completed' || r.status === 'quote') return { need:true, text:NEXT_STEP[r.status] };
  return { need:false, text:NEXT_STEP[r.status] || '' };
}

function renderActiveRequests(){
  const list = homeActiveRequests();
  if (!list.length) return '';
  const card = (r) => {
    const n = nextStepOf(r);
    const stg = ({ received:0, searching:0, sent:0, accepted:1, scheduled:1, enroute:2, arrived:3, started:3, quote:3, completed:4 })[r.status];
    const mini = stg === undefined ? '' : `<span class="mj" aria-hidden="true">${[0,1,2,3,4].map(i => `<i class="${i < stg ? 'd' : i === stg ? 'n' : ''}"></i>`).join('')}</span>`;
    /* quick actions once a provider accepted: arrival estimate, message, share (siblings of the card button) */
    const prov = MP.providerOf(r.id);
    const eta = r.status === 'enroute' && r.etaAt ? Math.round((new Date(r.etaAt).getTime() - Date.now()) / 60000) : null;
    const quick = prov && !['completed'].includes(r.status) ? `<div class="ac-quick" role="group" aria-label="إجراءات سريعة للطلب ${esc(r.no)}">${eta != null ? `<span class="ac-eta">${ic('clock')} ${eta > 1 ? `هيوصل خلال ${eta} د` : 'وصل تقريبًا'}</span>` : ''}<button type="button" class="chip" data-act="openChat" data-id="${esc(r.id)}">${ic('chat')} رسالة لـ${esc(String(prov.name || '').split(' ')[0])}</button><button type="button" class="chip" data-act="shareReq" data-id="${esc(r.id)}">${ic('share')} شارك</button></div>` : '';
    return `<div class="act-wrap"><button class="act-card glass neon ${n.need?'need':''}" data-track="${esc(r.id)}">
      <span class="ac-top">${icp(icStatus(r.status),'st')}
        <span class="tx">${esc(r.serviceName)}<small>#${esc(r.no)} • ${esc(STATUS_LABEL[r.status]||'')}</small></span>
        ${ic('chev','chev')}</span>
      ${mini}
      ${n.text?`<span class="ac-next">${ic(n.need?'warn':'info')}<span>${esc(n.text)}</span></span>`:''}
    </button>${quick}</div>`;
  };
  const shown = list.slice(0, 3);
  return `<h2 class="sec-title">${ic('clock')}طلباتك النشطة${list.length>3?`<button class="sec-more" data-go="orders">عرض الكل (${list.length})</button>`:''}</h2>
    <div class="plist">${shown.map(card).join('')}</div>`;
}

/* مشكلات شائعة: قائمة مختارة من الكتالوج الحالي (CAT) — تُتحقق من وجودها ونشاطها وقت العرض، لا نسخة بيانات موازية */
const COMMON_PROBLEMS = [
  'appliances/ac/no-cooling','appliances/washer-auto/no-drain','appliances/fridge/no-cooling',
  'electric/dist-board/breaker-trips','electric/switches/socket-dead','plumbing/sinks/leak-under'
];
function renderCommonProblems(){
  let rows = [];
  try {
    rows = COMMON_PROBLEMS.map(id => CAT.problem(id)).filter(p => p && p.active && !p.isOther)
      .map(p => ({ p, it: CAT.item(p.item), c: CAT.category(p.cat) })).filter(x => x.it && x.c && x.it.active && x.c.active);
  } catch {}
  if (!rows.length) return '';
  /* 2026-11-25 (owner): a compact swipe row right under the search — one tap starts the request on that problem */
  /* round 7: each chip keeps the old card's two lines (problem + device) in a compact swipe row */
  return `<section class="cp-row" aria-labelledby="cpT"><h2 class="sec-title cp-h" id="cpT">${ic('bulb')}مشكلات شائعة<small class="cp-hint" aria-hidden="true">اسحب ←</small></h2>
    <div class="cp-scroll" role="list">${rows.map(({p,it}) => `<button type="button" class="cp-chip" role="listitem" data-wz-hit="problem|${esc(p.id)}">${icp(icItem(it, p.cat),'dev')}<span><b>${esc(p.name)}</b><small>${esc(it.name)}</small></span></button>`).join('')}</div></section>`;
}

/* العناوين المحفوظة — من نفس طبقة العناوين (MP.addressesFor)؛ تُدار من شاشة addresses */
function renderSavedAddresses(){
  const c = homeMe(); if (!c) return '';
  let list = [];
  try { list = MP.addressesFor(c.id); } catch {}
  const head2 = `<h2 class="sec-title">${ic('pin')}عناويني${list.length?`<button class="sec-more" data-go="addresses">إدارة (${list.length})</button>`:''}</h2>`;
  if (!list.length && state.lastShown && state.lastShown.name === 'home') return '';   /* Home stays short: the address is asked inside the request */
  if (!list.length) {
    const emptyHtml = (typeof UIK !== 'undefined') ? UIK.empty('pin','مفيش عناوين محفوظة','ضيف عنوانك علشان طلباتك تبقى أسرع')
      : `<div class="empty">${ic('pin')}<p>مفيش عناوين محفوظة</p></div>`;
    return head2 + `<div class="empty-card glass neon">${emptyHtml}<button class="cta ghost" data-go="addresses">${ic('plus')} إضافة عنوان</button></div>`;
  }
  const sorted = list.slice().sort((a, b) => (b.default ? 1 : 0) - (a.default ? 1 : 0)).slice(0, 2);
  return head2 + `<div class="plist">${sorted.map(a => `<button class="prow glass neon" data-go="addresses">
    ${icp('pin','pr')}<span class="tx">${esc(a.label || 'عنوان')}<small>${esc([a.gov, a.area].filter(Boolean).join(' — '))}</small></span>
    ${a.default?'<span class="tag">افتراضي</span>':ic('chev','chev')}</button>`).join('')}</div>`;
}

/* ترحيب شخصي */
function renderDraftResume(){
  try {
    const u = typeof me === 'function' ? me() : null;
    const d = u && MP && MP.getDraft ? MP.getDraft(u.id) : null;
    if (!d || !d.data || !(d.data.cat || d.data.item)) return '';
    const step = Math.max(1, Math.min(10, (+d.step || 0) + 1));
    return `<section class="draft-resume" aria-label="استكمال طلب غير مكتمل"><div><b>عندك طلب لم يكتمل</b><small>حفظنا بياناتك — توقفت عند الخطوة ${step} من 10.</small></div><button type="button" class="cta" data-act="wzResume">استكمال الطلب</button><button type="button" class="draft-discard" data-act="wzDiscardDraft" aria-label="حذف مسودة الطلب">حذف المسودة</button></section>`;
  } catch { return ''; }
}

function renderGreeting(){
  const c = homeMe();
  const h = new Date().getHours();
  const part = h < 12 ? 'صباح الخير' : h < 17 ? 'أهلاً بيك' : 'مساء الخير';
  if (!c) return `<section class="greet"><b>${part} في هنصلحلك</b><small>سجّل بياناتك لمتابعة طلباتك بسهولة — <button class="link" data-go="account">تسجيل</button></small></section>`;
  const first = String(c.name || '').trim().split(/\s+/)[0] || '';
  const n = homeActiveRequests().length;
  return `<section class="greet"><b>${part}${first?' يا '+esc(first):''}</b><small>${n?`عندك ${n===1?'طلب واحد':n+' طلبات'} شغّالة`:'تحب نصلّحلك إيه النهارده؟'}</small></section>`;
}

/* إجراءات سريعة */
function renderQuickActions(){
  const n = homeActiveRequests().length;
  return `<div class="qa" role="group" aria-label="إجراءات سريعة">
    <button class="glass neon" data-act="cam">${ic('camera')}<span>صوّر المشكلة</span></button>
    <button class="glass neon" data-go="orders">${ic('list')}<span>طلباتي</span>${n?`<i class="n">${n>9?'9+':n}</i>`:''}</button>
    <button class="glass neon" data-go="addresses">${ic('pin')}<span>عناويني</span></button>
  </div>`;
}

/* اقتراحات البحث الفوري في الرئيسية — تستخدم HS_SEARCH.suggest على CAT، وتفتح الويزارد عبر data-wz-hit (بدون منطق موازٍ) */
function homeSuggestHtml(q){
  if (typeof HS_SEARCH === 'undefined') return '';
  let html = '';
  try { html = HS_SEARCH.renderSuggestions(q, 6); } catch { html = ''; }
  if (!html) return `<div class="sr-none">${ic('search')}<span>مفيش نتيجة مباشرة لـ «${esc(q)}»</span></div>
    <button class="sr-item" data-act="newReq" role="option">${ic('send')}<span class="sr-t">أرسل طلبًا عامًا<small>اكتب مشكلتك وهنوجهها</small></span>${ic('chev')}</button>`;
  return html.replace(/data-hs-hit=/g, 'data-wz-hit=')
    + `<button class="sr-item sr-all" data-act="homeSearchAll" role="option">${ic('search')}<span class="sr-t">عرض كل النتائج</span>${ic('chev')}</button>`;
}
function bindHomeSearch(){
  const q = $('#q'), sg = $('#home-sg'); if (!q || !sg) return;
  let t = 0, activeIndex = -1;
  const options = () => Array.from(sg.querySelectorAll('[role="option"]'));
  const syncActive = () => {
    const items = options();
    items.forEach((item, i) => {
      if (!item.id) item.id = `home-sg-option-${i}`;
      item.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
      item.setAttribute('tabindex', '-1');
      item.classList.toggle('active', i === activeIndex);
    });
    if (activeIndex >= 0 && items[activeIndex]) q.setAttribute('aria-activedescendant', items[activeIndex].id);
    else q.removeAttribute('aria-activedescendant');
  };
  const close = () => {
    sg.hidden = true;
    q.setAttribute('aria-expanded', 'false');
    q.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  };
  const paint = () => {
    const v = q.value.trim();
    activeIndex = -1;
    if (!v) { sg.innerHTML = ''; close(); return; }
    sg.innerHTML = homeSuggestHtml(v);
    sg.hidden = !sg.innerHTML;
    q.setAttribute('aria-expanded', sg.hidden ? 'false' : 'true');
    syncActive();
  };
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(paint, 90); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      clearTimeout(t);
      if (sg.hidden || !sg.innerHTML) paint();
      const items = options();
      if (!items.length) return;
      e.preventDefault();
      activeIndex = e.key === 'ArrowDown'
        ? (activeIndex + 1) % items.length
        : (activeIndex - 1 + items.length) % items.length;
      syncActive();
    } else if (e.key === 'Enter' && q.value.trim()) {
      const items = options();
      if (activeIndex >= 0 && items[activeIndex]) {
        e.preventDefault();
        items[activeIndex].click();
        close();
      } else {
        try { MP.addSearch((homeMe() || {}).id || '', q.value.trim()); } catch {}
        go('search', q.value.trim());
      }
    } else if (e.key === 'Escape' && !sg.hidden) {
      e.preventDefault();
      close();
    }
  });
  q.addEventListener('blur', () => setTimeout(close, 200));
}

/* ───────── الشاشات ───────── */
const screens = {
  home(){
    return HSCustomerHomePage.render({
      topbar, renderGreeting, renderDraftResume, ic, ART,
      renderQuickActions, renderActiveRequests, tiles,
      renderCommonProblems, renderRecentUsed, renderSavedAddresses,
      renderFavorites, discover, renderServiceAreas,
      siteHero: (globalThis.HSSiteContent && HSSiteContent.hero()) || null, esc,
  siteBanner: (globalThis.HSSiteContent && typeof HSSiteContent.banner === 'function' && HSSiteContent.banner()) || null,
      demo: !(globalThis.HSFirebaseConfig && HSFirebaseConfig.mode === 'firebase'),
      firstVisit: !(homeMe() && MP.reqs().some(r => r.customerId === homeMe().id)),
      latestReviews: homeLatestReviews(),
      addressBar: homeAddressBar(), care: globalThis.HSTrust ? HSTrust.homeReminder() : '', when: homeWhen(), trending: homeTrending(), packages: homePackages(), invite: homeInvite()
    });
  },

  sections(){ return `<div class="screen">${head('الخدمات')}
    <div style="margin-top:14px">${sectionsTiles()}</div>
    ${renderServiceAreas()}
    </div>`; },

  /* ═════════ شاشة البحث — V7 (تعتمد على HS_SEARCH) ═════════ */
  search(q=''){
    return `<div class="screen">${head('بحث')}
      <div class="search" style="margin-top:12px">
        <label class="field glass neon" style="flex:1">
          ${ic('search')}
          <input id="hs-q" type="search" aria-label="ابحث عن جهاز أو مشكلة أو خدمة" placeholder="ابحث: اسم جهاز، مشكلة، خدمة…" autocomplete="off" value="${esc(q)}">
        </label>
      </div>
      <div id="hs-results" style="margin-top:6px" aria-live="polite"></div>
    </div>`;
  },

  fav(){ const f = store.get('fav',[]).filter(k=>getProb(k)); return `<div class="screen">${head('المفضلة')}
    ${f.length?`<div class="plist" style="margin-top:14px">${f.map(k=>{const g=getProb(k);return `<button class="prow glass neon" data-prob="${k}">${icp(g[1].i,'pr')}<span class="tx">${esc(g[1].t)}<small>${esc(g[0].name)}</small></span>${ic('chev','chev')}</button>`;}).join('')}</div>`:`<div class="empty">${ic('heart')}<p>لسه مفيش حاجة في المفضلة<br><small>اضغط على القلب في أي حل لحفظه</small></p></div>`}</div>`; },

  /* حساب العميل: مصدر العرض الوحيد هو Account في account.js (يُحمَّل قبل أول render). */
  account(){
    return (typeof Account !== 'undefined' && Account && typeof Account.render === 'function')
      ? Account.render()
      : `<div class="screen">${head('حسابي')}<div class="empty">${ic('user')}<p>تعذّر تحميل الحساب. أعد المحاولة.</p></div></div>`;
  },

  details(k){ const d = DEVICES[k];
    if (!d) return `<div class="screen">${head('تفاصيل المشكلة',true)}<div class="empty">${ic('search')}<p>الخدمة دي مش موجودة أو اتشالت.</p><button class="cta" data-go="sections">تصفّح الخدمات</button></div></div>`;   /* stale / wrong link */
    return `<div class="screen">${head('تفاصيل المشكلة',true)}
  <section class="dcard neon">
    <div class="info"><span class="badge">${ic(icSec(d.icon))} ${d.cat}</span><h3>${d.name}</h3><p>اختر نوع المشكلة لمعرفة الحل</p></div>
    <div class="art">${ART[d.art]}</div>
  </section>
  <h2 class="sec-title">${ic('wrench')}اختر نوع المشكلة</h2>
  <div class="plist">${d.problems.map((_,n)=>`<button class="prow glass neon" data-prob="${k}:${n}">${icp(d.problems[n].i,'pr')}<span class="tx">${esc(d.problems[n].t)}</span>${ic('chev','chev')}</button>`).join('')}</div>
  <div class="after glass neon">${ic('bulb')}<div><b>بعد تحديد المشكلة</b><small>ستظهر لك: الأسباب المحتملة والحل خطوة بخطوة</small></div></div>
  ${(typeof HS_DISCOVER !== 'undefined' && CAT.category(k)) ? `<button class="cta" data-disc="cat|${k}">${ic('wrench')} اطلب فنيًا في ${esc(d.cat)}</button>` : ''}
  </div>`; }
};

/* ───────── التوجيه ───────── */
let state = { tab:'home', stack:[], sheet:false };
const renderTabs = () => {
  const nAct = homeActiveRequests().length;
  const keepTab = focusedTab(); /* إعادة البناء تُدمّر التبويب المُركَّز عليه — نعيد التركيز إلى مكافئه (لكل المستدعين: go وshow) */
  $('#tabbar').innerHTML = TABS.map(([id,l,i])=>{
    /* 2026 identity: the centre «طلب خدمة» button starts a new request from any screen */
    if (id === 'new') return `<button class="tab tab-fab" data-act="newReq" aria-label="${l}"><span class="fab" aria-hidden="true">${ic(i)}</span><span>${l}</span></button>`;
    const b = (id==='orders' && nAct) ? `<b class="tab-badge" aria-hidden="true">${nAct>9?'9+':nAct}</b>` : '';
    const lbl = (id==='orders' && nAct) ? `${l} — ${nAct} نشطة` : l;
    return `<button class="tab ${state.tab===id?'on':''}" data-go="${id}" aria-label="${lbl}"${state.tab===id?' aria-current="page"':''}>${ic(i)}<span>${l}</span>${b}</button>`;
  }).join('');
  placeTabInk();
  if (keepTab) {
    const t = document.querySelector(`#tabbar [data-go="${keepTab}"]`);
    if (t) { try { t.focus({preventScroll:true}); } catch { try { t.focus(); } catch {} } }
  }
};

/* إدارة التركيز بعد تبديل الشاشة: استبدال innerHTML يُسقط التركيز إلى <body> إذا كان داخل #view.
   نعيده فقط عند فقدانه فعلًا، ولا نفعل ذلك في أول عرض (الإقلاع)، ولا نسحبه من شريط التبويب أو الورقة السفلية.
   يمكن للمستدعي طلب عنصر محدد عبر requestFocusAfterShow(selector) (مثل زر التصفية المضغوط). */
let showCount = 0, focusAfterShow = null;
function requestFocusAfterShow(selector){ focusAfterShow = selector || null; }
function focusLostAfterRender(){
  const ae = document.activeElement;
  if (!ae || ae === document.body) return true;
  return typeof document.contains === 'function' ? !document.contains(ae) : false;
}
function focusedTab(){
  const ae = document.activeElement;
  return ae && typeof ae.closest === 'function' && ae.closest('#tabbar') ? ((ae.dataset || {}).go || null) : null;
}
function restoreScreenFocus(name){
  const wanted = focusAfterShow; focusAfterShow = null;
  if (showCount++ === 0 || name === 'wizard' || name === 'search') return;
  if (!wanted && !focusLostAfterRender()) return;
  const target = (wanted && view.querySelector(wanted)) || view.querySelector('.dhead h2') || view;
  try { target.focus({preventScroll:true}); } catch { try { target.focus(); } catch {} }
}

/* Moving tab indicator (phones): the pill glides from the previous tab to the new one instead of jumping. Only when
   the active tab actually draws its pill (the desktop top-nav uses an underline instead). */
let _inkX = null;
function placeTabInk(){
  try {
    const bar = $('#tabbar'), on = bar && bar.querySelector('.tab.on'); if (!on) return;
    if (getComputedStyle(on, '::before').display === 'none') { bar.classList.remove('has-ink'); return; }
    const x = on.offsetLeft + on.offsetWidth / 2 - 26;
    const ink = document.createElement('i'); ink.className = 'tab-ink'; ink.setAttribute('aria-hidden', 'true');
    ink.style.transform = `translateX(${_inkX == null ? x : _inkX}px)`;
    bar.prepend(ink); bar.classList.add('has-ink');
    if (_inkX !== x) requestAnimationFrame(() => { ink.style.transform = `translateX(${x}px)`; });
    _inkX = x;
  } catch {}
}
/* Images fade in once loaded instead of popping in. */
function fadeImages(scope){
  try { scope.querySelectorAll('img').forEach(img => { if (img.complete) return; img.classList.add('img-fade'); const done = () => img.classList.add('is-in'); img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); }); } catch {}
}
function show(name, arg){
  clearInterval(carTimer);
  state.lastShown = { name, arg };
  try { document.documentElement.dataset.screen = name; } catch {}   /* CSS: screen-specific chrome (help bubble hidden on form screens) */
  renderTabs();   /* V8-C3: يحدّث شارة الطلبات النشطة عند كل عرض */
  view.innerHTML = screens[name](arg);
  view.scrollTop = 0;
  try { const sc = view.firstElementChild; if (sc) { sc.classList.add('screen-in'); sc.addEventListener('animationend', () => sc.classList.remove('screen-in'), { once: true }); } } catch {}
  fadeImages(view);
  if (name === 'wizard' || name === 'sections') fillTilePrices();
  if (globalThis.HSTrust) HSTrust.hydrate(name, arg);   /* photos, read receipts, typing, portfolio — fetched on demand */
  restoreScreenFocus(name);
  if (typeof HSCustomerRouter !== 'undefined') HSCustomerRouter.sync(name, arg);   /* الرابط يعكس الشاشة الحالية (#/orders، #/track/<id>…) */
  if (name === 'wizard') {
    const heading = view.querySelector('[data-wz-heading]');
    if (heading) {
      try { heading.focus({preventScroll:true}); } catch { heading.focus(); }
    }
  }
  if (name==='home'){
    initCarousel();
    bindHomeSearch();
    fillTilePrices();
  }
  if (name==='search'){
    const input = document.getElementById('hs-q');
    if (input) {
      if (typeof HS_SEARCH !== 'undefined' && HS_SEARCH.bind) {
        HS_SEARCH.bind(input, { wrap: null, results: document.getElementById('hs-results') });  /* V8-C4: النتائج الفورية هي الاقتراحات */
      }
      if (arg) input.value = arg;
      /* لو arg موجود، نُشغّل البحث مباشرة */
      if (arg && typeof HS_SEARCH !== 'undefined' && HS_SEARCH.query) {
        document.getElementById('hs-results').innerHTML = HS_SEARCH.renderResults(arg);
        const el = document.getElementById('hs-q');
        if (el) el.dispatchEvent(new Event('input'));
      }
      setTimeout(() => { try { input.focus({ preventScroll: true }); } catch { input.focus(); } }, 50);
    }
  }
  if (name==='account'){
    const f = $('#loginForm');
    if (f) f.addEventListener('submit', e => {
      e.preventDefault(); const d = new FormData(f);
      const res = HSCustomerSession.signIn(d.get('name'), d.get('phone'));
      if (!res.ok) return toast(res.error);
      toast('أهلاً بيك'); if (!afterSignIn()) show('account');
    });
  }
}

function go(tab, arg){
  closeSheet(true);
  state.tab = tab; state.stack = []; renderTabs(); show(tab, arg);
  history.replaceState({tab}, '');
}

/* ───────── الروابط العميقة (customer-router + guest-policy/guest-entry) ─────────
   تفتح الشاشة بنفس مسار النقر داخل التطبيق: التبويب أولًا، ثم شاشة الطلب/المزود فوق المكدس حتى يعمل زر الرجوع. */
function openRoute(r){
  if (!r) { go('home'); return; }
  if (r.screen === 'requestCreate' && typeof HSCustomerRequestCreate !== 'undefined') {
    go('home');   /* الرجوع من المعالج يعود إلى الرئيسية كما عند البدء من داخل التطبيق */
    HSCustomerRequestCreate.open(r.target, { CAT, startRequest, getWizard: () => WZ, show });
    return;
  }
  if (r.screen === 'tracking' || r.screen === 'providerDetails') {
    go(r.tab);
    state.stack.push((r.screen === 'tracking' ? 'track:' : 'provider:') + r.id);
    history.pushState({dl:1}, '');
    show(r.screen, r.id);
    return;
  }
  go(r.tab);
}
/* يطبّق رابطًا (عند البدء أو عند تعديل العنوان يدويًا). يعيد true إذا تعامل مع الرابط. */
function applyEntry(hash){
  if (typeof HSGuestEntry === 'undefined') return false;
  const customer = typeof HSCustomerSession !== 'undefined' ? HSCustomerSession.customer() : null;
  const entry = HSGuestEntry.resolve(hash, customer, MP);
  if (!entry) return false;
  if (entry.signin) { HSGuestEntry.rememberReturn(entry.returnTo); go('account'); toast('سجّل الدخول الأول عشان تشوف الصفحة دي'); return true; }
  if (entry.notFound) { go('home'); toast('الرابط غير متاح'); return true; }
  openRoute(entry); return true;
}
/* بعد تسجيل دخول ناجح: ارجع إلى الرابط الذي طُلب قبل تسجيل الدخول إن وُجد. */
function afterSignIn(){
  const back = typeof HSGuestEntry !== 'undefined' ? HSGuestEntry.consumeReturn() : '';
  return back ? applyEntry(back) : false;
}
/* اقرأ الهدف من newURL للحدث وليس من location.hash: في Chromium يُطلق popstate قبل hashchange، ومعالج popstate
   قد يعيد الرسم ويزامن الرابط (#/home) فيمحو الرابط الذي كتبه المستخدم قبل وصول hashchange. */
window.addEventListener('hashchange', e => {
  let hash = location.hash;
  try { if (e && e.newURL) hash = new URL(e.newURL).hash; } catch {}
  applyEntry(hash);
});
function openDevice(k){
  if (!DEVICES[k]) return;
  closeSheet(true); state.stack.push(k); history.pushState({dev:k},''); show('details',k);
}

window.addEventListener('popstate', () => {
  if (state.sheet) { closeSheet(); history.pushState({r:1}, ''); return; }
  if (state.stack.length){
    state.stack.pop();
    const k = state.stack[state.stack.length-1];
    if (!k) show(state.tab);
    else if (k === 'wizard') show('wizard');
    else if (String(k).startsWith('track:')) show('tracking', String(k).slice(6));
    else if (String(k).startsWith('provider:')) show('providerDetails', String(k).slice(9));
    else if (String(k).startsWith('disc:')) { const [, kd, ...rr] = String(k).split(':'); show('disc', kd + '|' + rr.join(':')); }  /* V8-C4 */
    else show('details', k);
  }
});

/* ───────── الورقة السفلية: إدارة التركيز والعزل ───────── */
let origin = null; // سياق رجوع قائمة المشاكل؛ مستقل تمامًا عن عنصر فتح النافذة.
let sheetOpener = null;
let sheetBackgroundState = [];
let sheetFocusRevision = 0;
const SHEET_FOCUSABLE = 'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),iframe,summary,[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
function sheetFocusable(){
  return [...$('#sheet').querySelectorAll(SHEET_FOCUSABLE)].filter(el =>
    !el.closest('[hidden],[inert],[aria-hidden="true"]') &&
    (!el.closest('details:not([open])') || el.matches('summary')) &&
    (el.getClientRects().length > 0 || el === document.activeElement) &&
    getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'
  );
}
function isolateSheetBackground(active){
  const sheetNode = $('#sheet');
  const nodes = [...app.children].filter(el => el !== sheetNode && el.id !== 'sheet-backdrop');
  if (active){
    sheetBackgroundState = nodes.map(el => ({el, inert:el.inert, ariaHidden:el.getAttribute('aria-hidden')}));
    nodes.forEach(el => { el.inert = true; el.setAttribute('aria-hidden','true'); });
  } else {
    sheetBackgroundState.forEach(({el,inert,ariaHidden}) => {
      el.inert = inert;
      if (ariaHidden === null) el.removeAttribute('aria-hidden');
      else el.setAttribute('aria-hidden',ariaHidden);
    });
    sheetBackgroundState = [];
  }
}
function focusSheetContent(){
  const node = $('#sheet');
  const heading = node.querySelector('h4,[data-sheet-title]');
  if (heading){
    if (!heading.id) heading.id = 'customer-sheet-title';
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex','-1');
    node.setAttribute('aria-labelledby',heading.id);
  } else {
    node.setAttribute('aria-label','محتوى النافذة');
    node.removeAttribute('aria-labelledby');
  }
  const targets = sheetFocusable();
  (targets[0] || heading || node).focus({preventScroll:true});
}
function sheet(html){
  const wasOpen = !!state.sheet;
  if (!wasOpen){ sheetOpener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null; }
  $('#sheet').innerHTML = '<div class="grab" aria-hidden="true"></div>'+html;
  $('#sheet').scrollTop=0;
  app.classList.add('open'); state.sheet=true;
  if (!wasOpen) isolateSheetBackground(true);
  const revision = ++sheetFocusRevision;
  setTimeout(() => { if (state.sheet && revision === sheetFocusRevision) focusSheetContent(); }, 0);
}
function focusCustomerView(){ view.setAttribute('tabindex','-1'); view.focus({preventScroll:true}); }
/* Bottom sheets close with a downward swipe from the top area (like native apps); the grab handle shows it. */
function mountSheetSwipe(){
  const el = document.getElementById('sheet'); if (!el || el.dataset.swipe) return; el.dataset.swipe = '1';
  let y0 = null, dy = 0;
  el.addEventListener('touchstart', e => { if (!state.sheet || el.scrollTop > 0 || e.touches.length !== 1) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  el.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 4) { el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)`; } }, { passive: true });
  el.addEventListener('touchend', () => { if (y0 == null) return; el.style.transition = ''; el.style.transform = ''; if (dy > 90) closeSheet(); y0 = null; dy = 0; });
}
function closeSheet(suppressRestoreFocus=false){
  if (!state.sheet) return;
  app.classList.remove('open'); state.sheet=false; origin=null;
  isolateSheetBackground(false);
  const opener = sheetOpener; sheetOpener = null;
  // Defer until the current click/submit handler has completed any synchronous route render.
  // If that render removed the opener, move focus to the destination view instead.
  setTimeout(() => {
    if (state.sheet) return;
    const openerStillUsable = !suppressRestoreFocus && opener && opener.isConnected && !opener.disabled &&
      opener.getClientRects().length > 0 && !opener.closest('[inert],[aria-hidden="true"]') &&
      getComputedStyle(opener).visibility !== 'hidden' && typeof opener.focus === 'function';
    if (openerStillUsable) opener.focus({preventScroll:true});
    else focusCustomerView();
  }, 0);
}
document.addEventListener('keydown', e => {
  if (!state.sheet) return;
  if (e.key === 'Escape'){
    if (e.defaultPrevented) return;
    e.preventDefault(); e.stopPropagation(); closeSheet(); return;
  }
  if (e.key !== 'Tab') return;
  const targets = sheetFocusable();
  if (!targets.length){ e.preventDefault(); $('#sheet').focus(); return; }
  const first = targets[0], last = targets[targets.length-1], active = document.activeElement;
  if (!$('#sheet').contains(active)){ e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (e.shiftKey && (active === first || active === $('#sheet'))){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && active === last){ e.preventDefault(); first.focus(); }
}, true);

/* محتوى المشاكل (data.js القديمة) — يُستخدم من openProblem فقط للتوافق.
   المسار الأساسي للطلبات هو CAT عبر HS_SEARCH. */
const NEED = { 'سهل':'تقدر تحلها بنفسك بالخطوات التالية.', 'متوسط':'جرّب الخطوات، ولو ما اتحلتش اطلب فني.', 'يحتاج فني':'المشكلة دي محتاجة فني متخصص — الخطوات هنا إجراءات أمان وتشخيص أولي فقط.' };

function openProblem(key, ret){
  const g = getProb(key); if(!g) return; const [d,p] = g; const fav = store.get('fav',[]).includes(key);
  const warn = p.lvl==='يحتاج فني';
  sheet(`${ret?`<button class="sheet-back" data-act="slide" data-s="${ret}">${ic('back')} رجوع للقائمة</button>`:''}
    <button class="fav-btn ${fav?'on':''}" data-fav="${key}" aria-label="مفضلة">${ic('heart')}</button>
    <h4>${p.t}</h4><div class="sub">${d.name} • ${d.cat}</div>
    <div class="meta"><span class="tag ${warn?'warn':''}">${ic(warn?'warn':'check')} ${p.lvl}</span><span class="tag">${ic('clock')} حوالي ${p.min} دقيقة</span></div>
    <div class="need ${warn?'warn':''}">${ic(warn?'warn':'info')}<span>${NEED[p.lvl]||''}</span></div>
    ${p.warn?`<div class="safety">${ic('shield')}<div><b>تنبيه أمان</b><span>${p.warn}</span></div></div>`:''}
    <button class="cta" data-act="tech" data-key="${key}">${ic('wrench')} اطلب متخصصًا — ${d.cat}</button>
    <h5>${ic('info')} الأسباب المحتملة (للفهم فقط)</h5>
    ${p.causes.map(c=>`<div class="cause">${c}</div>`).join('')}
    <h5>${ic('wrench')} ${warn?'إجراءات أمان وتشخيص أولي':'نصائح سريعة'}</h5>
    <div class="prog"><i id="pb"></i></div>
    ${p.steps.map((s,i)=>`<button class="step" data-step><i>${i+1}</i><span>${s}</span></button>`).join('')}
    <div class="solved" id="solved"><b>خلصت الخطوات!</b><div class="row2"><button class="cta" data-act="solved">${ic('check')} اتحلت</button><button class="cta ghost" data-act="tech" data-key="${key}">اطلب متخصصًا</button></div></div>
  `);
}
function stepProgress(){
  const all = document.querySelectorAll('#sheet .step'), done = document.querySelectorAll('#sheet .step.done');
  const pb = $('#pb'); if (pb) pb.style.width = (all.length? done.length/all.length*100 : 0)+'%';
  const s = $('#solved'); if (s) s.classList.toggle('show', all.length>0 && done.length===all.length);
}

/* "اطلب متخصص" من مشكلة قديمة → يفتح النموذج من خلال CAT */
function openTech(key){
  const g = getProb(key); if(!g) return; const [d,p] = g; const dk = key.split(':')[0];
  /* نحاول الربط بـ CAT عبر HS_SEARCH */
  try {
    const hits = CAT.search(p.t);
    const probHit = hits.find(h => h.type === 'problem' && h.cat === dk);
    if (probHit) { if (typeof HS_DISCOVER !== 'undefined') { HS_DISCOVER.order('problem', probHit.id); return; } startRequest(probHit.cat, probHit.item); if (WZ) { WZ.problem = probHit.id; WZ.step = 3; } return; }
  } catch {}
  /* fallback: نفتح النموذج بدون مشكلة (الفني يشخّص) */
  startRequest(dk);
}

function openNotes(){
  const c = me(); if (!c) { sheet(`<h4>${ic('bell')} الإشعارات</h4><div class="empty" style="padding:24px">${ic('bell')}<p>سجّل بياناتك أولاً لعرض إشعاراتك</p></div>`); return; }
  /* Mark read through notifications-api (own inbox only); the header dot refreshes on the next screen render. */
  /* read the list (with its unread state) BEFORE marking everything read; group Today / Earlier; a note about a
     request opens that request */
  const ns = MP.notesFor('customer:'+c.id).slice(0, 30).map(n => ({ ...n }));
  try { if (typeof HSNotificationsApi !== 'undefined') HSNotificationsApi.markAllRead(); } catch {}
  const today = new Date().toDateString();
  const isToday = n => { const d = new Date(n.at); return !Number.isNaN(d.getTime()) && d.toDateString() === today; };
  const row = n => {
    const inner = `${ic(n.reqId ? 'list' : 'bell')}<div><b>${esc(n.text)}</b><small>${fmtDT(n.at)}</small></div>${n.read ? '' : '<span class="note-dot" aria-label="جديد"></span>'}`;
    return n.reqId ? `<button type="button" class="note ${n.read ? '' : 'unread'}" data-act="noteOpen" data-id="${esc(n.reqId)}">${inner}${ic('chev','chev')}</button>`
                   : `<div class="note ${n.read ? '' : 'unread'}">${inner}</div>`;
  };
  const group = (title, list) => list.length ? `<div class="note-group">${title}</div>${list.map(row).join('')}` : '';
  sheet(`<h4>${ic('bell')} الإشعارات</h4><div class="sub">تحديثات طلباتك</div>
    ${ns.length ? group('النهارده', ns.filter(isToday)) + group('قبل كده', ns.filter(n => !isToday(n)))
      : `<div class="empty" style="padding:24px">${ic('bell')}<p>لا توجد إشعارات بعد</p><small>هنبلغك هنا بكل تحديث على طلباتك.</small></div>`}`);
}

function openMenu(){
  const items = [['home','الرئيسية','home'],['sections','الخدمات','grid'],['orders','طلباتي','list'],['fav','المحفوظة','heart'],['account','حسابي','user']];
  /* 2026: the menu opens on a navy brand card that greets the customer and offers the main action */
  let who = ''; try { const c = me(); who = c && c.name ? String(c.name).trim().split(/\s+/)[0] : ''; } catch {}
  const mk = typeof HSBrandIcons !== 'undefined' && HSBrandIcons.mark ? HSBrandIcons.mark(52) : '';
  const brandCard = `<div class="menu-brand">${mk}<div><b>${who ? 'أهلاً يا ' + esc(who) : 'أهلاً بيك في هنصلحلك'}</b><small>أي عطل في البيت — احنا هنا نساعدك</small></div><button type="button" class="menu-cta" data-act="newReq">${ic('plus')} اطلب خدمة</button></div>`;
  sheet(`<h4>القائمة</h4>${brandCard}<div style="margin-top:8px">${items.map(([g,l,i])=>`<button class="menu-item" data-go="${g}">${ic(i)}${l}</button>`).join('')}
    <button class="menu-item menu-emg" data-emg="">${ic('warn')}طوارئ — تسريب، شرر، ريحة غاز</button>
    <button class="menu-item" data-go="support">${ic('info')}المساعدة والدعم</button>
    <div class="lbl">محتوى توعوي (اختياري)</div>
    <button class="menu-item" data-act="slide" data-s="guide">${ic('book')}دليل الصيانة</button>
    <button class="menu-item" data-act="slide" data-s="popular">${ic('medal')}أشهر الحلول</button>
    <button class="menu-item" data-act="slide" data-s="latest">${ic('list')}أحدث المشاكل</button>
    <div class="lbl">للمتخصصين</div>
    <a class="menu-item" href="../provider/index.html#/join">${ic('wrench')}عايز تقدم خدماتك؟ انضم كمقدم خدمة</a>
    <button class="menu-item" data-act="about">${ic('info')}عن هنصلحلك</button></div>`);
}

/* الشرائح (كما في V6 مع تعديلات طفيفة لتعمل مع CAT) */
function openSlide(id){
  if (id==='steps'){ sheet(`<h4>${ic('wrench')} خدمتك على بُعد خطوات</h4><div class="sub">اختر الخدمة، حدد موقعك، وسنساعدك في الوصول لمقدم الخدمة المناسب</div>
      <div class="steps3"><div><i>1</i>اختر الخدمة</div><div><i>2</i>صف الطلب وحدد موقعك</div><div><i>3</i>تابع طلبك</div></div>${tiles(true)}`); origin=null; return; }
  if (id==='specialists'){ sheet(`<h4>${ic('grid')} متخصصون في مختلف الخدمات</h4><div class="sub">اضغط على الخدمة لعرض أنواعها وإرسال طلبك</div>
      ${HOME_ORDER.map(k=>{ const d=DEVICES[k], t=MP.db().services.filter(s=>s.cat===k); return `<details class="gd"><summary>${ic(icSec(d.icon))}<span>${d.name}</span><small>${t.length} خدمات</small>${ic('chev','chev')}</summary><div class="gd-in">${t.map(s=>`<button class="prow glass neon" data-req="${k}|${s.id}"><span class="tx">${s.name}</span>${ic('chev','chev')}</button>`).join('')}</div></details>`; }).join('')}`); origin=null; return; }
  if (id==='track'){ if(myReqs().length){ closeSheet(true); return go('orders'); }
    sheet(`<h4>${ic('clock')} تابع طلبك خطوة بخطوة</h4><div class="sub">من لحظة إرسال الطلب حتى اكتمال الخدمة</div>
      <ol class="tl">${FLOW.map(([k,l],i)=>`<li><i>${i+1}</i><span>${l}</span></li>`).join('')}</ol><button class="cta" data-go="home">${ic('wrench')} ابدأ طلبك</button>`); origin=null; return; }
  if (id==='guide'){
    sheet(`<h4>${ic('book')} دليل الصيانة</h4><div class="sub">نصائح وقائية لكل خدمة — الوقاية أرخص من الإصلاح</div>
      ${HOME_ORDER.map(k=>{ const d=DEVICES[k]; return `<details class="gd"><summary>${ic(icSec(d.icon))}<span>${d.name}</span><small>${d.tips.length} نصائح</small>${ic('chev','chev')}</summary>
        <div class="gd-in">${d.tips.map(t=>`<div class="cause">${t}</div>`).join('')}
        <button class="cta ghost" data-dev="${k}">${ic('wrench')} مشاكل ${d.cat} وحلولها (${d.problems.length})</button></div></details>`; }).join('')}
      <h5>${ic('shield')} قاعدة أمان</h5><div class="cause">افصل الجهاز من الكهرباء قبل أي فحص، ولو شميت غاز أو شفت شرر اخرج واطلب الطوارئ.</div>`);
    origin = null; return;
  }
  /* popular / latest — تستخدم devises القديمة كتوافق */
  const POPULAR = () => Object.keys(DEVICES).flatMap(k=>DEVICES[k].problems.map((p,n)=>p.pop?{key:k+':'+n,p}:null).filter(Boolean)).sort((a,b)=>a.p.pop-b.p.pop).map(x=>x.key);
  const LATEST = () => Object.keys(DEVICES).flatMap(k=>DEVICES[k].problems.map((p,n)=>p.nw?{key:k+':'+n,p}:null).filter(Boolean)).sort((a,b)=>b.p.nw.localeCompare(a.p.nw)).map(x=>x.key);
  const keys = id==='popular' ? POPULAR() : LATEST();
  sheet(`<h4>${ic(id==='popular'?'medal':'list')} ${id==='popular'?'أشهر الحلول':'أحدث المشاكل'}</h4><div class="sub">${id==='popular'?'أكتر المشاكل اللي بيدوّر عليها الناس':'آخر المشاكل والحلول اللي أضفناها فعليًا'}</div>
    <div class="plist" style="margin-top:12px">${keys.slice(0,15).map(k=>{const g=getProb(k);if(!g)return '';return `<button class="prow glass neon" data-prob="${k}">${icp(g[1].i,'pr')}<span class="tx">${esc(g[1].t)}<small>${g[0].name}</small></span>${ic('chev','chev')}</button>`;}).join('')}</div>`);
  origin = id;
}

let PENDING_PHOTO = null;
function openCam(file){
  if (globalThis.HSAiAssist && HSAiAssist.flags().photo) { HSAiAssist.routePhoto(file); return; }   /* «صوّر المشكلة»: the server suggests the service */
  const url = URL.createObjectURL(file);
  sheet(`<h4>${ic('camera')} صورة المشكلة</h4><div class="sub">اختر القسم المناسب لبدء طلبك، ثم أضف الصورة من خطوة المرفقات</div>
    <img class="preview" src="${url}" alt="صورة المشكلة">
    ${tiles(true)}`);
  origin = null;
}

/* ───────── الأحداث ───────── */
document.addEventListener('click', e => {
  if (e.target.id==='sheet-backdrop') return closeSheet();
  const t = e.target.closest('[data-go],[data-dev],[data-prob],[data-act],[data-back],[data-fav],[data-step],[data-chip],[data-repeat],[data-provider],[data-provider-service]');
  if (!t) return;
  const d = t.dataset;
  if (d.go) {   /* tapping the tab you are on scrolls back to the top (like native apps) */
    if (d.go === state.tab && state.lastShown && state.lastShown.name === d.go && !state.stack.length && view.scrollTop > 40 && typeof view.scrollTo === 'function') { view.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
    return go(d.go);
  }
  if (d.dev) return openDevice(d.dev);
  if (d.prob){ const r = t.closest('#sheet') ? origin : null; return openProblem(d.prob, r); }
  if ('back' in d) {   /* back with a stack → browser history; opened directly (deep link / action / tab page) → the tab, or Home */
    if (state.stack.length) return history.back();
    const cur = state.lastShown && state.lastShown.name;
    return go(state.tab && state.tab !== cur ? state.tab : 'home');
  }
  if ('step' in d){ t.classList.toggle('done'); return stepProgress(); }
  if (d.chip){ const i=$('#hs-q') || $('#q2') || $('#q'); if (i){ i.value=d.chip; i.dispatchEvent(new Event('input')); } return; }
  if (d.fav){
    let f = store.get('fav',[]); const on = f.includes(d.fav);
    f = on ? f.filter(x=>x!==d.fav) : [d.fav,...f]; store.set('fav',f);
    t.classList.toggle('on',!on); toast(on?'اتشالت من المفضلة':'اتحفظت في المفضلة'); return;
  }
  if (d.repeat){
    /* إعادة طلب خدمة سابقة */
    /* through the API boundary (local store or Firebase backend) — never a direct store write */
    HSOrdersApi.repeat(d.repeat).then(res => {
      if (res.ok) { toast('تم إنشاء طلب جديد '+res.data.no); go('orders'); }
      else toast('تعذّر إعادة الطلب');
    });
    return;
  }
  if (d.provider){
    /* فتح تفاصيل مقدم الخدمة (ستوسّع في C) */
    show('providerDetails', d.provider); return;
  }
  if (d.providerService){
    const [type, id] = d.providerService.split('|');
    if (type === 'problem' && typeof HS_DISCOVER !== 'undefined') HS_DISCOVER.order('problem', id);
    else if (type === 'problem') { const p = CAT.problem(id); if (p) { startRequest(p.cat, p.item); if (WZ) { WZ.problem = id; WZ.step = 3; } } }
    else { const it = CAT.item(id); if (it) startRequest(it.cat, it.id); }
    return;
  }
  switch (d.act){
    case 'cam': { const el = $('#cam'); if (el) el.click(); break; }
    case 'menu': openMenu(); break;
    case 'bell': openNotes(); break;
    case 'slide': openSlide(d.s); break;
    case 'noteOpen': closeSheet(true); state.stack.push('track:'+d.id); history.pushState({tr:1}, ''); show('tracking', d.id); break;
    case 'slideGo': if (d.to === 'wizard') startRequest(); else if (d.to === 'services') go('sections'); else if (d.to === 'orders') go('orders'); break;
    case 'about': toast('هنصلحلك — منصة تربطك بمقدم الخدمة المناسب'); break;
    case 'newReq': startRequest(); break;
    case 'homeSearchAll': { const qv = ($('#q')||{}).value; go('search', (qv||'').trim()); break; }
    case 'scrollTiles': { const e2 = document.getElementById('tilesT'); if (e2) e2.scrollIntoView({behavior:'smooth', block:'start'}); break; }
    case 'tech': openTech(d.key); break;
    case 'solved': closeSheet(); toast('تمام! سعداء إننا ساعدنا'); break;
    case 'logout': HSCustomerSession.signOut(); show('account'); toast('تم تسجيل الخروج'); break;
    case 'openAddresses': { try { go('addresses'); } catch { toast('العناوين ستُضاف في تحديث لاحق'); } break; }
    case 'openNotifs': openNotes(); break;
  }
});

/* كاميرا الصفحة الرئيسية */
const camEl = document.getElementById('cam');
if (camEl) camEl.addEventListener('change', e => { const f = e.target.files[0]; if (f) openCam(f); e.target.value = ''; });

/* ───────── الافتتاحية V10 (كشف الشعار — CSS فقط؛ هنا التحكم والتخطي) ─────────
   سياسة الظهور كما كانت: مرة لكل جلسة (sessionStorage 'hs_intro_v1' يُفحص مبكرًا في index.html).
   التسلسل: فك ترميز صورتي الشعار ← إضافة .go (يبدأ كل الأنيميشن) ← انتهاء introOut أو تخطي ← إزالة العقدة وفتح #app. */
const Intro = (() => {
  let node = null, done = false, timer = 0;
  const root = document.documentElement;
  const reduced = () => { try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch{ return false; } };
  const unlock = () => { try{ const ap = document.getElementById('app'); if(ap) ap.inert = false; }catch{} };
  function finish(){
    if(done) return; done = true; clearTimeout(timer);
    try{ document.removeEventListener('keydown', onKey); if(node){ node.removeEventListener('animationend', onEnd); const b = node.querySelector('#introSkip'); if(b) b.removeEventListener('click', skip); } }catch{}
    try{ if(node) node.remove(); }catch{ if(node) node.style.display='none'; }
    node = null; unlock();
  }
  function onEnd(e){ if(e.target===node && /^(introOut|introSkip)$/.test(e.animationName)) finish(); }
  function skip(){ if(done||!node) return; root.classList.add('intro-skipped'); node.classList.add('skip'); clearTimeout(timer); timer = setTimeout(finish, 500); }
  function onKey(e){ if(e.key==='Escape'||e.key==='Enter'||e.key===' '){ if(document.activeElement && document.activeElement.id==='introSkip') return; skip(); } }
  function go(){
    if(done||!node) return;
    clearTimeout(timer);
    root.classList.add('intro-go');
    node.classList.add('go');
    timer = setTimeout(finish, reduced() ? 1600 : 3200);   /* CSS hand-off ends ≈2.5s (introOut 2.05s + .45s); this is the safety removal */
  }
  function init(){
    try{
      node = document.getElementById('intro'); if(!node) return;
      if(root.classList.contains('no-intro')){ node.remove(); node = null; return; }
      const ap = document.getElementById('app'); if(ap) ap.inert = true;
      node.addEventListener('animationend', onEnd);
      const b = node.querySelector('#introSkip'); if(b) b.addEventListener('click', skip);
      document.addEventListener('keydown', onKey);
      timer = setTimeout(finish, 6000);   /* شبكة أمان لو تأخر/تعطل تحميل الشعار */
      /* لا نبدأ الحركة قبل جاهزية صورتي الشعار: يمنع ظهور شعار ناقص أو وميض. فشل التحميل/تأخره > 1.8ث ⇒ نتخطى الافتتاحية بهدوء. */
      const imgs = Array.from(node.querySelectorAll('img.main'));
      const ready = Promise.all(imgs.map(im => (im.decode ? im.decode() : Promise.resolve()).catch(() => null)))
        .then(() => imgs.every(im => im.complete && im.naturalWidth > 0));
      const cap = new Promise(res => setTimeout(() => res(false), 1800));
      Promise.race([ready, cap]).then(ok => { if(ok) go(); else finish(); }).catch(finish);
    }catch(err){ console.warn('intro disabled', err); try{ if(node) node.remove(); }catch{} node = null; unlock(); }
  }
  return { init, skip };
})();

/* ───────── البدء ───────── */
/* V8-C3: البدء مؤجل حتى تُحمَّل كل السكربتات (market-ui.js يعرّف me/reqCard؛ ui-kit.js يعرّف UIK).
   قبلها كان أول عرض للرئيسية يجري قبل تعريفها فيفقد الترحيب والطلبات النشطة. */
/* Another tab changed the shared store (e.g. the provider advanced this order): refresh live screens in place —
   keep scroll, never drop focus to <body>, announce politely — but never while a sheet/form is open. */
function liveRefresh(announce){
  const s = state.lastShown;
  if (!s || state.sheet || !['tracking','orders'].includes(s.name) || !screens[s.name]) return;
  const wasLoading = !!view.querySelector('[aria-busy="true"]');
  const html = screens[s.name](s.arg);
  if (html === view.innerHTML) return;                       /* nothing changed for this screen: no flicker, no toast */
  const hadFocus = view.contains(document.activeElement), y = view.scrollTop;
  view.innerHTML = html;
  view.scrollTop = y;
  renderTabs();
  if (hadFocus) { const h = view.querySelector('.dhead h2'); if (h) { try { h.focus({preventScroll:true}); } catch { h.focus(); } } }
  if (announce && !wasLoading) toast('تم تحديث بيانات الطلب');   /* server syncs refresh silently; placeholders are replaced silently */
}
/* help button (support centre: FAQ, contact, complaints) + connection banner */
function mountHelpAndNet(){
  if (typeof document === 'undefined' || !document.body || !document.createElement) return;
  try {
    const fs = localStorage.getItem('hs_font'); if (fs === 'lg' || fs === 'xl') document.documentElement.setAttribute('data-fs', fs);
  } catch {}
  if (!document.getElementById('help-fab')) {
    const b = document.createElement('button');
    b.id = 'help-fab'; b.type = 'button'; b.className = 'help-fab'; b.setAttribute('aria-label', 'المساعدة والأسئلة الشائعة');
    /* 2026: the help button is «مساعد هنصلحلك» (experience.js) — a short menu; without it, straight to support */
    b.innerHTML = '<img src="../../assets/brand/hsl-mark.svg" alt="" width="30" height="30" decoding="async"><span>مساعدة</span>';
    b.addEventListener('click', () => { try { if (globalThis.HSExperience) HSExperience.menu(); else go('support'); } catch {} });
    document.body.appendChild(b);
  }
  if (!document.getElementById('net-banner')) {
    const n = document.createElement('div');
    n.id = 'net-banner'; n.className = 'net-banner'; n.setAttribute('role', 'status'); n.hidden = true;
    n.textContent = 'مفيش اتصال بالإنترنت — هنكمّل أول ما الاتصال يرجع';
    document.body.appendChild(n);
    const set = online => { n.hidden = online; };
    if (typeof addEventListener === 'function') {
      addEventListener('offline', () => set(false));
      addEventListener('online', () => { if (!n.hidden) toast('رجع الاتصال', 'success'); set(true); });
    }
    try { if (navigator.onLine === false) set(false); } catch {}
  }
}
function boot(){
  if (typeof HSAuthApi !== 'undefined') HSAuthApi.useApp('customer');
  try { mountHelpAndNet(); } catch {}
  try { mountSheetSwipe(); } catch {}
  try { mountPullRefresh(); mountStickySearch(); mountTilePeek(); } catch {}   /* API actor = the signed-in demo customer */
  /* live screens follow changes from another tab (storage) and from the server (Firebase sync / RTDB signal) */
  if (typeof HSRealtimeClient !== 'undefined') HSRealtimeClient.subscribe('market:changed', e => { if (e.source === 'storage' || e.source === 'firebase') liveRefresh(e.source === 'storage'); });
  /* site content published from the Admin Center: refresh Home in place (keeps scroll; never interrupts a sheet) */
  if (typeof addEventListener === 'function') addEventListener('hs:content', () => {
    const s = state.lastShown;
    if (!s || s.name !== 'home' || state.sheet || !screens.home) return;
    const y = view.scrollTop; view.innerHTML = screens.home(); view.scrollTop = y;
    try { initCarousel(); bindHomeSearch(); fillTilePrices(); } catch {}
  });
  if (!applyEntry(location.hash)) go('home');   /* رابط عميق مثل #/orders أو #/track/<id>؛ وإلا الرئيسية */
  Intro.init();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('../../service-worker.js').catch(()=>{});
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();