/* ═══════════════════════════════════════════════════════════════
   هنصلحلك — محرك البحث الموحد (Unified Search) — V7 — ملف جديد
   ───────────────────────────────────────────────────────────────
   الغرض:
   • مسار بحث واحد فقط، يعتمد على CAT (catalog.js) كمصدر وحيد.
   • إلغاء المسار القديم الذي كان يبحث في data.js (DEVICES.problems).
   • دعم: اسم جهاز، اسم مشكلة، نوع خدمة، وصف حر بلغة طبيعية، مرادفات شائعة.
   • اقتراحات فورية أثناء الكتابة (debounced).
   • عند اختيار نتيجة: فتح نموذج الطلب مع تعبئة القسم/الجهاز/المشكلة.
   • حالة "لا نتائج": عرض زر "أرسل طلبًا عامًا" يفتح النموذج بدون اختيار مسبق.

   الواجهة العامة (HS_SEARCH):
   • HS_SEARCH.query(q, opts)      → { tokens[], suggestions[], groups{cat,item,problem}, total }
   • HS_SEARCH.topSuggestions(n)   → أكثر الاقتراحات شيوعًا (بدون نص)
   • HS_SEARCH.renderResults(q, opts) → HTML لقائمة النتائج (باستخدام أيقونات icons.js)
   • HS_SEARCH.bind(el, opts)      → يربط input#... بالبحث الفوري والتوجيه عند الاختيار
   • HS_SEARCH.openResult(hit)     → يُفتح اختيار النتيجة (يُفوَّض إلى wizard.js)
   • HS_SEARCH.synonyms()          → كائن المرادفات (للاستخدام الخارجي/الاختبار)

   ملاحظات:
   • لا يعتمد على data.js كمرجع بحث.
   • يعتمد على: CAT (catalog.js) + ic/icp/icSec/icItem/icProb (icons.js) + norm/esc (app.js).
   • علامات التسجيل: يستخدم window.HS_SEARCH لتفادي تعارض المتغيرات.
   • لا يفتح النموذج مباشرة — يُفوّض عبر callback (افتراضي: يبحث عن startRequest).
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const HS_SEARCH = (() => {
  /* ═════════ قائمة المرادفات الشائعة ═════════
     مفتاح: الكلمة المدخلة (سيتم تطبيعها بـ norm) → قائمة توسيعات.
     القيم تُطبَّع أيضاً عند المقارنة. لا تحفظ الكلمة الأصلية. */
  const RAW_SYNONYMS = {
    'تكييف': ['مكيف','سبليت','كونسيل','تكييفات','تكييفات سبليت'],
    'مكيف': ['تكييف','سبليت'],
    'غسالة': ['غساله','غسالات'],
    'غساله': ['غسالة'],
    'ثلاجة': ['تلاجه','ثلاجه','فريزر','ديب فريزر','برادة'],
    'تلاجة': ['ثلاجة'],
    'فريزر': ['ديب فريزر','ثلاجة','تلاجة'],
    'سباكة': ['سباك','سباكه','تسريب','تسليك','مواسير','صرف','حنفية'],
    'سباك': ['سباكة'],
    'كهرباء': ['كهربائي','كهربا','ماس','قاطع','فيشة','مفتاح','لمبة','تأسيس'],
    'كهربائي': ['كهرباء'],
    'ماس': ['ماس كهربائي','شرر','قصر'],
    'شرر': ['ماس كهربائي','شرارة'],
    'نجارة': ['نجار','باب','شباك','دولاب','مطبخ خشب','أثاث','اثاث'],
    'نجار': ['نجارة'],
    'باب': ['ابواب','باب مكسور','كالون','مفصلة'],
    'شباك': ['شبابيك','زجاج','الوميتال'],
    'دهانات': ['دهان','نقاش','بويه','معجون','دوكو','رطوبة','شروخ'],
    'دهان': ['دهانات','بويه','دوكو'],
    'بويه': ['دهان','دهانات'],
    'نقاش': ['دهانات','دهان'],
    'رطوبة': ['رطوبه','عفن','تسريب حائط','بقع'],
    'شروخ': ['تشققات','شروق','crack'],
    'سيارة': ['سياره','عربية','عربيه','سيارات','عطل سيارة','بطارية سيارة','فرامل'],
    'سيارات': ['سيارة','عربية'],
    'عربية': ['سيارة','سياره'],
    'فرامل': ['فرامل سيارة','تيل فرامل','brake'],
    'بطارية': ['بطاريه','بطارية سيارة','battery'],
    'تنظيف': ['تنضيف','نضافة','كلين','تنظيف شقة','تنظيف كنب','تنظيف سجاد','تنظيف خزانات'],
    'تنضيف': ['تنظيف'],
    'كنب': ['كنبة','كنبه','انتريه','صالون','انتريهات'],
    'سجاد': ['سجاده','موكيت','سجادة'],
    'خزانات': ['خزان','تانك','خزان مياه'],
    'أجهزة': ['اجهزه','أجهزة منزلية','اجهزة منزلية','أجهزة كهربائية'],
    'اجهزة': ['أجهزة','اجهزه منزلية'],
    'سخان': ['سخان كهرباء','سخان غاز','هيتر'],
    'فرن': ['بوتاجاز','فرن كهرباء','فرن غاز'],
    'بوتاجاز': ['فرن','فرن غاز','قدر'],
    'شفاط': ['hood','شفاط مطبخ'],
    'ميكروويف': ['ميكرويف','microwave'],
    'قاطع': ['قاطع كهرباء','مفتاح كهرباء','ديسچارج','circuit breaker'],
    'لوحة': ['لوحة كهرباء','لوحة توزيع','لوحة مفاتيح'],
    'محبس': ['صنبور','محبس مياه','حنفية'],
    'صرف': ['تسليك','انسداد','صرف صحي','بالوعة','بلاعة'],
    'تسريب': ['تسريب مياه','تسرب','رشح','leak'],
    'عطل': ['عطل كهربائي','مشكلة','باظ','بايظ'],
    'صيانة': ['خدمة','تصليح','إصلاح','اصلاح'],
    'تركيب': ['تنصيب','تأسيس','install'],
    /* V8-C4: جذور وأفعال عامية يكتبها العميل (مصر) → مفردات الكتالوج */
    'تصريف': ['صرف','تصرف'],
    'تصرف': ['صرف','تصريف'],
    'سرب': ['تسريب','تسرب'],
    'نقط': ['تنقيط','تسريب','تسرب'],
    'بينقط': ['تنقيط','تسريب'],
    'مسدود': ['انسداد','سد','طفح'],
    'مسدوده': ['انسداد','سد','طفح'],
    'سد': ['انسداد','مسدود'],
    'طافح': ['طفح','مجاري'],
    'مجاري': ['صرف صحي','طفح','انسداد'],
    'حمام': ['مرحاض','سباكة','بانيو','دش'],
    'مطبخ': ['حوض','بوتاجاز','شفاط'],
    'مبيبردش': ['لا تبرد','برد','تبريد'],
    'برد': ['تبريد','تبرد'],
    'تبريد': ['برد','تبرد'],
    'سخن': ['تسخين','سخان','حرارة'],
    'بيسخن': ['تسخين','سخان','حرارة'],
    'سخونة': ['تسخين','حرارة'],
    'وقف': ['لا تعمل','توقف'],
    'واقف': ['لا تعمل','توقف'],
    'بايظ': ['عطل','لا تعمل'],
    'باظ': ['عطل','لا تعمل'],
    'خربان': ['عطل','لا تعمل'],
    'مولع': ['تشغيل','لا تعمل'],
    'بيفصل': ['فصل','قاطع','يفصل'],
    'فصل': ['قاطع','يفصل'],
    'عصر': ['تعصر'],
    'بتعصر': ['تعصر','عصر'],
    'ريحة': ['رائحه','كريهه','ريح'],
    'ريح': ['رائحه','ريحه'],
    'صوت': ['ضجيج','اهتزاز','صوت غير طبيعي'],
    'دوشة': ['صوت','ضجيج'],
    'بيهز': ['اهتزاز','صوت'],
    'تلاجة': ['ثلاجة','فريزر'],
    'مياه': ['ماء','مايه'],
    'ميه': ['مياه','ماء']
  };

  /* نُطبّع المفاتيح والقيم مرة واحدة */
  const SYNONYMS = (() => {
    const out = {};
    for (const [k, list] of Object.entries(RAW_SYNONYMS)) {
      const nk = normKey(k);
      out[nk] = (out[nk] || []).concat(list.map(normKey));
    }
    return out;
  })();
  function normKey(s) {
    return String(s || '')
      .replace(/[ً-ٟـ]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
      .toLowerCase()
      .trim();
  }

  /* ═════════ V8-C4: محرك المطابقة ═════════
     كل كلمة من كلام العميل تُشكّل «مجموعة»: صيغها المباشرة (بعد حذف ال/بادئات الأفعال العامية/لواحق الجمع)
     + مرادفاتها (وزن أقل) + تصحيح الأخطاء الإملائية (عند عدم وجود نتائج فقط).
     المجموعات تُطابَق بـ AND مرن: نسبة التغطية (coverage) هي المعيار، لا اشتراط كل الكلمات.
     مثال: «الغسالة مش بتصرف مياه» → {غسالة} {صرف} {مياه} → «لا تصرف المياه» تحت الغسالات. */
  const STOP = new Set(['مش','مو','ما','لا','في','من','علي','عن','الي','اللي','اللى','ده','دي','دا','دول','بتاع','بتاعي','بتاعتي',
    'عندي','عندنا','انا','و','او','ايه','ازاي','ليه','كده','جدا','اوي','قوي','عايز','عاوز','عايزه','عاوزه','محتاج','ممكن','يعني',
    'عشان','مع','بقي','لسه','فجاه','دلوقتي','هو','هي','بس','كل','لو','ان','اي','يا'].map(normKey));

  const stripAl = (w) => { const m = w.match(/^(وال|بال|كال|فال|لل|ال)(.+)$/); return m && m[2].length >= 3 ? m[2] : w; };
  const variantsOf = (w) => {
    const out = new Set([w]);
    const a = stripAl(w); out.add(a);
    const m = a.match(/^(بت|بي|بن|هت|هي|حت|هن)(.{3,})$/) || a.match(/^([يت])(.{3,})$/);
    const v = m ? m[2] : null; if (v) out.add(v);
    [a, v].filter(Boolean).forEach(x => {
      if (/ات$/.test(x) && x.length >= 6) out.add(x.slice(0, -2));
      if (/ه$/.test(x) && x.length >= 4) out.add(x.slice(0, -1));
    });
    return Array.from(out).filter(x => x.length >= 2);
  };

  /* ═════════ توسيع الكلمات (للتوافق مع الواجهة القديمة) ═════════ */
  const expandTokens = (tokens) => {
    const out = new Set(tokens);
    for (const t of tokens) {
      const syn = SYNONYMS[t];
      if (syn) syn.forEach(s => out.add(s));
    }
    return Array.from(out);
  };

  /* ═════════ التطبيع النهائي للبحث ═════════ */
  const tokenize = (q) => normKey(q).split(/[\s,.:;!?،؟"'()\-_/\\]+/).filter(Boolean);

  const makeGroups = (raw) => {
    let words = tokenize(raw);
    const kept = words.filter(w => !STOP.has(w));
    if (kept.length) words = kept;
    const seen = new Set(), groups = [];
    words.forEach(w => {
      if (seen.has(w)) return; seen.add(w);
      const direct = variantsOf(w);
      const syn = new Set();
      direct.concat([w]).forEach(v => (SYNONYMS[v] || []).forEach(x => { if (!direct.includes(x)) syn.add(x); }));
      groups.push({ w, direct, syn: Array.from(syn), fuzz: [] });
    });
    return groups;
  };

  const has = (hay, v) => v.length >= 3 ? hay.includes(v) : (' ' + hay).includes(' ' + v);

  /* مفردات الكتالوج (للتصحيح الإملائي) — تُبنى عند أول احتياج وتُلغى مع تغيّر الكتالوج */
  let VOCAB = null, VOCAB_SIG = '';
  const vocab = () => {
    const sig = CAT.categories().length + ':' + CAT.categories().reduce((n, c) => n + CAT.items(c.id).length, 0);
    if (VOCAB && sig === VOCAB_SIG) return VOCAB;
    const set = new Set();
    const add = (s) => tokenize(s).forEach(w => { const a = stripAl(w); if (a.length >= 3) set.add(a); });
    CAT.categories().forEach(c => { add(c.name); CAT.items(c.id).forEach(i => { add(i.name); CAT.problems(i.id).forEach(p => { if (!p.isOther) add(p.name); }); }); });
    Object.keys(SYNONYMS).forEach(k => { if (k.length >= 3 && !k.includes(' ')) set.add(k); });
    VOCAB = Array.from(set); VOCAB_SIG = sig; return VOCAB;
  };
  const lev = (a, b, max) => {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        cur[j] = v; if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  };
  const addFuzzy = (groups) => {
    const V = vocab(); let any = false;
    groups.forEach(g => {
      const base = g.direct.slice().sort((x, y) => y.length - x.length)[0];
      if (!base || base.length < 4) return;
      /* كلمة معروفة في الكتالوج/المرادفات ← لا تُصحَّح (مثل «بيبرد» العامية) */
      if (g.direct.some(v => v.length >= 3 && (V.includes(v) || SYNONYMS[v]))) return;
      const max = base.length >= 7 ? 2 : 1;
      let best = null;
      V.forEach(u => { if (u === base) return; const d = lev(base, u, max); if (d <= max && (!best || d < best.d)) best = { u, d }; });
      V.forEach(u => { if (u !== base && lev(base, u, max) <= max) g.fuzz.push(u); });
      if (g.fuzz.length) { any = true; g.best = best && best.u; }
    });
    return any;
  };

  /* حقول كل نوع ووزنها */
  const FIELDS = {
    cat:     (c)       => [{ n: normKey(c.name), w: 2 }],
    item:    (i, c)    => [{ n: normKey(i.name), w: 3 }, { n: normKey(c.name), w: 2 }, { n: normKey(i.specialty || ''), w: 1 }],
    problem: (p, i, c) => [{ n: normKey(p.name), w: 4 }, { n: normKey(i.name), w: 3 }, { n: normKey(c.name), w: 2 }]
  };
  const scoreDoc = (groups, fields) => {
    let cov = 0, score = 0, nameHit = false, excl = 0;
    groups.forEach(g => {
      let bestF = 0, bestS = 0, nameF = 0, otherF = 0;
      fields.forEach((f, idx) => {
        let factor = 0;
        if (g.direct.some(v => has(f.n, v))) factor = 1;
        else if (g.fuzz.length && g.fuzz.some(v => has(f.n, v))) factor = 0.8;
        else if (g.syn.some(v => has(f.n, v))) factor = 0.6;
        if (factor) { if (idx === 0) { nameHit = true; nameF = factor; } else otherF = Math.max(otherF, factor); bestF = Math.max(bestF, factor); bestS = Math.max(bestS, f.w * factor); }
      });
      if (nameF && !otherF) excl++;   /* كلمة طابقت اسم النتيجة نفسه فقط (لا اسم الجهاز/القسم) */
      cov += bestF; score += bestS;
    });
    return { cov: groups.length ? cov / groups.length : 0, score, nameHit, excl };
  };

  const collect = (groups, phrase) => {
    const docs = { cat: [], item: [], problem: [] };
    const push = (type, obj, fields) => {
      const s = scoreDoc(groups, fields); if (!s.cov) return;
      if (phrase && fields[0].n.includes(phrase)) s.score += 5;
      docs[type].push(Object.assign(obj, s));
    };
    CAT.categories().forEach(c => {
      push('cat', { type: 'cat', id: c.id, name: c.name, icon: c.icon }, FIELDS.cat(c));
      CAT.items(c.id).forEach(i => {
        push('item', { type: 'item', id: i.id, cat: i.cat, name: i.name, path: c.name }, FIELDS.item(i, c));
        CAT.problems(i.id).forEach(p => {
          if (p.isOther) return;
          push('problem', { type: 'problem', id: p.id, item: p.item, cat: p.cat, name: p.name, path: c.name + ' ← ' + i.name }, FIELDS.problem(p, i, c));
        });
      });
    });
    return docs;
  };

  const EMPTY = () => ({ tokens: [], groups: { cat: [], item: [], problem: [] }, total: 0, partial: false, fuzzy: false, didYouMean: '', order: ['problem', 'item', 'cat'] });

  /* ═════════ بحث أساسي داخل CAT ═════════
     يعيد { tokens, groups:{cat,item,problem}, total, partial, fuzzy, didYouMean, order }
     كل نتيجة تحمل cov (نسبة تغطية كلمات العميل) وscore. */
  const query = (q, opts = {}) => {
    const raw = String(q || '').trim();
    if (raw.length < 1) return EMPTY();
    const groups = makeGroups(raw);
    if (!groups.length) return EMPTY();
    const phrase = groups.length > 1 ? groups.map(g => g.w).join(' ') : '';

    const covOf = (d) => Math.max(0, ...['cat', 'item', 'problem'].map(k => Math.max(0, ...d[k].map(x => x.cov))));
    const cnt = (d) => d.cat.length + d.item.length + d.problem.length;
    let docs = collect(groups, phrase), fuzzy = false;
    /* تغطية ناقصة (أو لا نتائج) ← جرّب التصحيح الإملائي واحتفظ به إن حسّن التغطية */
    if (covOf(docs) < 0.99 && addFuzzy(groups)) {
      const d2 = collect(groups, phrase);
      if (covOf(d2) > covOf(docs) + 1e-9) { docs = d2; fuzzy = true; }
    }
    const n = cnt(docs);

    const out = EMPTY();
    out.tokens = groups.map(g => g.w); out.fuzzy = fuzzy;
    if (fuzzy) {
      const fixed = groups.map(g => g.best || g.w);
      if (fixed.join(' ') !== groups.map(g => g.w).join(' ')) out.didYouMean = fixed.join(' ');
    }
    if (!n) { out.didYouMean = out.didYouMean || ''; return out; }

    const maxCov = Math.max(0, ...['cat', 'item', 'problem'].map(k => Math.max(0, ...docs[k].map(d => d.cov))));
    const min = Math.max(0.5, maxCov * 0.75);
    const cmp = (a, b) => (b.cov - a.cov) || (b.score - a.score);
    ['cat', 'item', 'problem'].forEach(k => { out.groups[k] = docs[k].filter(d => d.cov >= min - 1e-9).sort(cmp); });
    out.total = out.groups.cat.length + out.groups.item.length + out.groups.problem.length;
    out.partial = maxCov < 0.99;
    /* مشكلة مطابقة باسمها ← المشكلات أولًا؛ وإلا (اسم جهاز/قسم فقط) ← الأجهزة أولًا */
    const probFirst = out.groups.problem.some(p => p.excl > 0 && p.cov >= maxCov - 1e-9);
    out.order = probFirst ? ['problem', 'item', 'cat'] : ['item', 'cat', 'problem'];
    return out;
  };

  /* ═════════ اقتراحات فورية (بدون تحليل ثقيل) ═════════
     تُستخدم أثناء الكتابة قبل الضغط على Enter. تأخذ نتائج مختصرة. */
  const suggest = (q, limit = 8) => {
    const r = query(q);
    if (!r.total) return [];
    const out = [];
    const caps = { problem: 5, item: 4, cat: 2 };
    r.order.forEach(k => {
      r.groups[k].slice(0, Math.min(caps[k], Math.max(0, limit - out.length))).forEach(h => out.push({ ...h, kind: k }));
    });
    return out.slice(0, limit);
  };

  /* ═════════ توصيات عامة (بدون نص) ═════════ */
  const TOP = [
    { label:'تكييف لا يبرد', q:'تكييف' },
    { label:'تسريب مياه', q:'تسريب' },
    { label:'غسالة أوتوماتيك', q:'غسالة' },
    { label:'كهرباء — قاطع يفصل', q:'قاطع' },
    { label:'دهان غرفة', q:'دهان' },
    { label:'نجار — باب لا يقفل', q:'باب' },
    { label:'تنظيف كنب', q:'كنب' },
    { label:'سيارة — بطارية', q:'بطارية' }
  ];
  const topSuggestions = (n = 6) => TOP.slice(0, n);

  /* ═════════ عرض النتائج (HTML) ═════════ */
  const safeEsc = (typeof esc === 'function') ? esc : (s => String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));
  const safeIc = (n, cls) => (typeof ic === 'function') ? ic(n, cls) : '';
  const safeIcp = (n, kind, cls) => (typeof icp === 'function') ? icp(n, kind, cls) : '';
  const safeIcSec = (n) => (typeof icSec === 'function') ? icSec(n) : n;
  const safeIcItem = (it, catId) => (typeof icItem === 'function') ? icItem(it, catId) : 'p-diagnose';
  const safeIcProb = (p, it, catId) => (typeof icProb === 'function') ? icProb(p, it, catId) : 'p-diagnose';

  const rowProblem = (h) => {
    const it = CAT.item(h.item), c = CAT.category(h.cat), p = CAT.problem(h.id);
    return `<button class="prow glass neon" data-hs-hit="problem|${safeEsc(h.id)}" role="option">
      ${safeIcp(safeIcProb(p, it, c && c.id), 'pr')}
      <span class="tx">${safeEsc(h.name)}<small>${safeEsc(c ? c.name : '')} ← ${safeEsc(it ? it.name : '')}</small></span>
      ${safeIc('chev','chev')}
    </button>`;
  };
  const rowItem = (h) => {
    const it = CAT.item(h.id), c = CAT.category(h.cat);
    return `<button class="prow glass neon" data-hs-hit="item|${safeEsc(h.id)}" role="option">
      ${safeIcp(safeIcItem(it, h.cat), 'dev')}
      <span class="tx">${safeEsc(h.name)}<small>${safeEsc(c ? c.name : '')} — نوع العمل</small></span>
      ${safeIc('chev','chev')}
    </button>`;
  };
  const rowCat = (h) => {
    const c = CAT.category(h.id);
    return `<button class="prow glass neon" data-hs-hit="cat|${safeEsc(h.id)}" role="option">
      ${safeIcp(safeIcSec(c ? c.icon : 'p-service'), 'dev')}
      <span class="tx">${safeEsc(h.name)}<small>قسم كامل</small></span>
      ${safeIc('chev','chev')}
    </button>`;
  };

  const SECTION = {
    problem: { t: 'مشاكل مطابقة', row: rowProblem, max: 12 },
    item:    { t: 'أجهزة / أنواع عمل', row: rowItem, max: 8 },
    cat:     { t: 'أقسام', row: rowCat, max: 7 }
  };

  const renderResults = (q, opts = {}) => {
    const r = query(q, opts);
    if (!r.total) return renderEmpty(q, opts);
    const parts = [];
    if (r.fuzzy && r.didYouMean) {
      parts.push(`<div class="need">${safeIc('info')}<span>عرضنا نتائج «${safeEsc(r.didYouMean)}» — لو تقصد شيئًا آخر عدّل البحث.</span></div>`);
    } else if (r.partial) {
      parts.push(`<div class="need">${safeIc('info')}<span>مفيش تطابق كامل لكل كلماتك، دي أقرب النتائج.</span></div>`);
    }
    r.order.forEach(k => {
      const g = r.groups[k], S = SECTION[k];
      if (!g.length) return;
      parts.push(`<div class="lbl">${S.t} (${g.length})</div><div class="plist">${g.slice(0, S.max).map(S.row).join('')}</div>`);
      if (g.length > S.max) parts.push(`<div class="hs-more">+${g.length - S.max} نتيجة أخرى — أضف كلمة لتضييق البحث</div>`);
    });
    return parts.join('');
  };

  /* حالة «لا نتائج»: تصحيح مقترح + أقرب نتائج لأي كلمة من كلامه + أقسام + طلب عام */
  const renderEmpty = (q, opts = {}) => {
    const raw = String(q || '').trim();
    const safe = safeEsc(raw);
    const r = query(raw);
    let dym = '';
    if (r.didYouMean) dym = `<div class="lbl">هل تقصد؟</div><div class="chips"><button class="chip" type="button" data-hs-chip="${safeEsc(r.didYouMean)}">${safeEsc(r.didYouMean)}</button></div>`;
    /* أقرب نتائج: جرّب كل كلمة على حدة (الأطول أولًا) */
    let related = '';
    const words = r.tokens.slice().sort((a, b) => b.length - a.length);
    const rawWords = raw.split(/[\s,.:;!?،؟]+/).filter(Boolean);
    for (const w of words) {
      if (words.length < 2) break;
      const hits = suggest(w, 4);
      if (hits.length) {
        const shown = rawWords.find(x => normKey(x) === w || normKey(x).includes(w)) || w;
        related = `<div class="lbl">نتائج قريبة لكلمة «${safeEsc(shown)}»</div><div class="plist">${hits.map(h => h.kind === 'problem' ? rowProblem(h) : h.kind === 'item' ? rowItem(h) : rowCat(h)).join('')}</div>`;
        break;
      }
    }
    const cats = CAT.categories().map(c => `<button class="chip" type="button" data-hs-hit="cat|${safeEsc(c.id)}">${safeEsc(c.name)}</button>`).join('');
    const empty = (typeof UIK !== 'undefined' && UIK.empty)
      ? UIK.empty('search', `مفيش نتائج لـ «${safe}»`, 'جرّب كلمة مختلفة أو تصفّح الأقسام، أو أرسل طلبًا عامًا وسيتواصل معك الفني.')
      : `<div class="empty">${safeIc('search')}<p>مفيش نتائج لـ «${safe}»<br><small>جرّب كلمة مختلفة، أو أرسل طلبًا عامًا وسيتواصل معك الفني.</small></p></div>`;
    return `${empty}${dym}${related}
      <div class="lbl">تصفّح الأقسام</div><div class="chips">${cats}</div>
      <button class="cta" data-hs-hit="generic|" data-hs-generic="1">${safeIc('send')} أرسل طلبًا عامًا</button>
      <button class="cta ghost" data-hs-hit="desc|" data-hs-desc="1">${safeIc('edit')} اكتب وصف مشكلتك يدويًا</button>`;
  };

  const renderSuggestions = (q, limit = 8) => {
    const items = suggest(q, limit);
    if (!items.length) return '';
    return items.map(h => {
      if (h.kind === 'problem') {
        const it = CAT.item(h.item), c = CAT.category(h.cat), p = CAT.problem(h.id);
        return `<button class="sr-item" data-hs-hit="problem|${safeEsc(h.id)}" role="option">
          ${safeIc('p-diagnose')}
          <span class="sr-t">${safeEsc(h.name)}<small>${safeEsc(c ? c.name : '')} ← ${safeEsc(it ? it.name : '')}</small></span>
          ${safeIc('chev')}
        </button>`;
      }
      if (h.kind === 'item') {
        return `<button class="sr-item" data-hs-hit="item|${safeEsc(h.id)}" role="option">
          ${safeIc('wrench')}
          <span class="sr-t">${safeEsc(h.name)}<small>${safeEsc(h.path || '')} — نوع العمل</small></span>
          ${safeIc('chev')}
        </button>`;
      }
      return `<button class="sr-item" data-hs-hit="cat|${safeEsc(h.id)}" role="option">
        ${safeIc('grid')}
        <span class="sr-t">${safeEsc(h.name)}<small>قسم كامل</small></span>
        ${safeIc('chev')}
      </button>`;
    }).join('');
  };

  /* ═════════ توجيه الاختيار ═════════
     يُفوَّض إلى wizard.js إن وجد؛ وإلا إلى callback في opts. */
  const openResult = (hit, opts = {}) => {
    const [kind, id] = String(hit || '').split('|');
    const D = (typeof HS_DISCOVER !== 'undefined') ? HS_DISCOVER : null;
    if (kind === 'problem' || kind === 'item' || kind === 'cat') {
      if (!(kind === 'problem' ? CAT.problem(id) : kind === 'item' ? CAT.item(id) : CAT.category(id))) return false;
      /* V8-C4: النتيجة تفتح صفحة الخدمة/الجهاز/المشكلة (ثم «اطلب» تفتح الويزارد) */
      if (D && typeof D.open === 'function') { D.open(kind, id); return true; }
      if (D && typeof D.order === 'function') { D.order(kind, id); return true; }
      if (typeof opts.onSelect === 'function') return opts.onSelect({ kind, id });
      return false;
    }
    if (kind === 'generic' || kind === 'desc') {
      if (typeof startRequest === 'function') { startRequest(); return true; }
      if (typeof opts.onSelect === 'function') return opts.onSelect({ kind, id });
      return false;
    }
    return false;
  };

  /* ═════════ ربط عنصر إدخال ═════════
     يُضاف إلى app.js استدعاء HS_SEARCH.bind(el) من داخل شاشة البحث. */
  const bind = (input, opts = {}) => {
    if (!input) return;
    const wrap = opts.wrap || document.getElementById('hs-suggest');
    const resultBox = opts.results || document.getElementById('hs-results');
    let timer = 0, lastQ = '';
    let activeIndex = -1;
    let resultOptions = [];
    if (input && !input.getAttribute('aria-label')) input.setAttribute('aria-label', 'ابحث عن فني أو خدمة');
    if (input) input.setAttribute('aria-controls', resultBox && resultBox.id ? resultBox.id : 'hs-results');

    const syncResultOptions = () => {
      resultOptions = [];
      if (!resultBox) return;
      resultBox.querySelectorAll('.plist').forEach((list, groupIndex) => {
        const options = Array.from(list.querySelectorAll('[data-hs-hit]'));
        if (!options.length) return;
        list.setAttribute('role', 'listbox');
        if (!list.hasAttribute('aria-label')) list.setAttribute('aria-label', `مجموعة نتائج ${groupIndex + 1}`);
        options.forEach((option, index) => {
          option.setAttribute('role', 'option');
          option.tabIndex = -1;
          if (!option.id) option.id = `hs-result-option-${groupIndex}-${index}`;
          option.setAttribute('aria-selected', 'false');
          resultOptions.push(option);
        });
      });
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
    };

    const setActiveResult = (index) => {
      if (!resultOptions.length) return;
      activeIndex = (index + resultOptions.length) % resultOptions.length;
      resultOptions.forEach((option, i) => option.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false'));
      const active = resultOptions[activeIndex];
      input.setAttribute('aria-activedescendant', active.id);
      try { active.scrollIntoView({block:'nearest'}); } catch {}
    };

    const paint = () => {
      const q = input.value.trim();
      if (q === lastQ) return;
      lastQ = q;
      activeIndex = -1;
      if (!q) {
        if (wrap) wrap.innerHTML = '';
        if (resultBox) { resultBox.innerHTML = renderDefaultStart(); syncResultOptions(); }
        return;
      }
      /* اقتراحات فورية */
      if (wrap) {
        const html = renderSuggestions(q);
        wrap.innerHTML = html;
        wrap.hidden = !html;
      }
      /* نتائج تفصيلية (بدون تأخير كبير) */
      if (resultBox) { resultBox.innerHTML = renderResults(q); syncResultOptions(); }
    };

    const debounced = () => { clearTimeout(timer); timer = setTimeout(paint, 90); };

    input.addEventListener('input', debounced);
    input.addEventListener('keydown', (e) => {
      const items = wrap ? Array.from(wrap.querySelectorAll('.sr-item')) : [];
      if (!wrap && resultOptions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        setActiveResult(activeIndex + (e.key === 'ArrowDown' ? 1 : -1));
      } else if (!wrap && resultOptions.length && e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        resultOptions[activeIndex].click();
      } else if (!wrap && e.key === 'Escape') {
        activeIndex = -1;
        resultOptions.forEach(option => option.setAttribute('aria-selected', 'false'));
        input.removeAttribute('aria-activedescendant');
      } else if (e.key === 'ArrowDown' && items.length) {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        items.forEach((b,i)=>b.classList.toggle('active', i===activeIndex));
        items[activeIndex].scrollIntoView({ block:'nearest' });
      } else if (e.key === 'ArrowUp' && items.length) {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        items.forEach((b,i)=>b.classList.toggle('active', i===activeIndex));
        items[activeIndex].scrollIntoView({ block:'nearest' });
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0 && items[activeIndex]) {
          e.preventDefault();
          items[activeIndex].click();
        } else {
          /* Enter بدون تحديد: الحفظ في السجل ثم تنفيذ أول نتيجة */
          const q = input.value.trim();
          if (q) {
            try { MP.addSearch((me() || {}).id || '', q); } catch {}
            if (resultBox) { resultBox.innerHTML = renderResults(q); syncResultOptions(); }
          }
        }
      } else if (e.key === 'Escape') {
        if (wrap) wrap.hidden = true;
      }
    });

    /* اختيار نتيجة (تفويض) */
    const clickHandler = (e) => {
      const btn = e.target.closest('[data-hs-hit]'); if (!btn) return;
      const hit = btn.dataset.hsHit;
      const qv = (input.value || '').trim();
      if (qv.length >= 2) { try { MP.addSearch((me() || {}).id || '', qv); } catch {} }
      const handled = openResult(hit, opts);
      if (!handled && opts.onSelect) opts.onSelect({ raw: hit });
    };
    if (wrap) wrap.addEventListener('click', clickHandler);
    if (resultBox) resultBox.addEventListener('click', clickHandler);

    /* إغلاق الاقتراحات عند فقد التركيز (بتأخير صغير للنقر) */
    input.addEventListener('blur', () => setTimeout(() => { if (wrap) wrap.hidden = true; }, 120));

    /* عرض بداية افتراضية */
    if (resultBox) { resultBox.innerHTML = renderDefaultStart(); syncResultOptions(); }

    return { paint, renderResults, renderSuggestions };
  };

  /* ═════════ عرض بداية البحث (سجل + أكثر بحثًا) ═════════ */
  const renderDefaultStart = () => {
    let recent = [];
    try {
      const c = (typeof me === 'function') ? me() : null;
      recent = MP.recentSearches(c ? c.id : '', 6);
    } catch {}
    const recentHtml = recent.length ? `
      <div class="lbl">عمليات بحث سابقة <button data-act="hs-clr" type="button">مسح</button></div>
      <div class="chips">${recent.map(r => `<button class="chip" data-hs-chip="${safeEsc(r.q)}" type="button">${safeEsc(r.q)}</button>`).join('')}</div>` : '';
    const top = topSuggestions(6);
    const topHtml = top.length ? `
      <div class="lbl">اقتراحات شائعة</div>
      <div class="chips">${top.map(t => `<button class="chip" data-hs-chip="${safeEsc(t.q)}" type="button">${safeEsc(t.label)}</button>`).join('')}</div>` : '';
    return recentHtml + topHtml;
  };

  return {
    query, suggest, topSuggestions, synonyms: () => ({ ...SYNONYMS }),
    renderResults, renderEmpty, renderSuggestions, renderDefaultStart,
    openResult, bind
  };
})();

/* ربط عالمي للأزرار المولّدة (chips/clearing) — يعمل مستقلاً عن شاشة البحث */
document.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-hs-chip]');
  if (chip) {
    const v = chip.dataset.hsChip || '';
    const input = document.getElementById('hs-q') || document.getElementById('q2') || document.getElementById('q');
    if (input) { input.value = v; input.dispatchEvent(new Event('input')); input.focus(); }
    return;
  }
  if (e.target.closest('[data-act="hs-clr"]')) {
    try {
      const c = (typeof me === 'function') ? me() : null;
      if (typeof MP !== 'undefined' && MP.db) {
        /* مسح سجل البحث لهذا العميل */
        const arr = MP.db().searchHistory || [];
        MP.db().searchHistory = arr.filter(x => c && x.customerId === c.id ? false : true);
        if (MP.save) MP.save();
      }
    } catch {}
    const box = document.getElementById('hs-results') || document.getElementById('results');
    if (box) box.innerHTML = HS_SEARCH.renderDefaultStart();
  }
});