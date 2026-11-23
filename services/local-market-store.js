/* ═══════════════════════════════════════════════════════════════
   هنصلحلك — طبقة بيانات المنصة الوسيطة (Marketplace Data Layer)
   ───────────────────────────────────────────────────────────────
   V7 — توسيع لدعم تجربة العميل الكاملة:
   • دورة حياة 12 حالة (FLOW) مع توافق خلفي كامل مع V6.
   • أرقام طلبات فريدة بصيغة HS-YYYY-XXXX (تسلسل دائم لا يُعاد).
   • عناوين محفوظة للعميل + عنوان افتراضي.
   • عروض أسعار (quotes) + موافقة/رفض العميل.
   • مفضلة (مقدمو خدمة + خدمات).
   • مسودات (drafts) لحفظ النموذج.
   • إشعارات مع markRead لكل قناة.
   • بيانات مقدمي خدمة موسّعة (Demo واضح).
   • دوال مطابقة محسّنة تتوافق مع تخصص الجهاز وليس القسم فقط.

   ملاحظات معمارية:
   - لا شيء من V6 حُذف. أي دالة قديمة موجودة بتوقيعها.
   - الحقول الجديدة كلها اختيارية عند القراءة (توافق مع طلبات قديمة).
   - عند إضافة Backend: تُستبدل أجسام الدوال الموسومة @API فقط.
   - المرفقات (صور/فيديو) لا تُخزَّن هنا — انظر attachments.js (IndexedDB).
   - المرفقات في الطلب هنا = معرّفات (ids) فقط، وليس DataURL.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const GOVS = ['القاهرة','الجيزة','الإسكندرية','القليوبية','الشرقية','الدقهلية','الغربية','المنوفية','البحيرة','كفر الشيخ','دمياط','بورسعيد','الإسماعيلية','السويس','الفيوم','بني سويف','المنيا','أسيوط','سوهاج','قنا','الأقصر','أسوان','الوادي الجديد','مطروح','شمال سيناء','جنوب سيناء','البحر الأحمر'];
const AREA_HINTS = {
  'القاهرة':['مدينة نصر','المعادي','التجمع الخامس','مصر الجديدة','حلوان','شبرا','الزمالك','المقطم'],
  'الجيزة':['الدقي','المهندسين','الهرم','فيصل','6 أكتوبر','الشيخ زايد','العجوزة'],
  'الإسكندرية':['سموحة','العجمي','سيدي بشر','المنتزه','محرم بك','ميامي']
};

/* أنواع الخدمات لكل قسم — كل نوع = طلب خدمة قابل للإرسال */
const SERVICE_TYPES = {
  electric:['إصلاح انقطاع كهرباء','تغيير أو تركيب مفاتيح وفيش','تركيب إضاءة وثريات','إصلاح لوحة كهرباء وقواطع','تمديدات وأسلاك','تركيب مراوح وسخانات كهرباء','خدمات كهرباء أخرى'],
  plumbing:['إصلاح تسريب','تسليك أحواض','تسليك صرف','تركيب حنفيات','إصلاح سيفون','تركيب أو صيانة مواسير','خدمات سباكة أخرى'],
  carpentry:['إصلاح أبواب','تركيب أو إصلاح شبابيك','إصلاح دواليب ومطابخ','تفصيل وتركيب أثاث','إصلاح كراسي وترابيزات','خدمات نجارة أخرى'],
  painting:['دهان غرفة','دهان شقة كاملة','دهان واجهات','إصلاح شروخ وتشققات','دهانات ديكور وورق حائط','خدمات دهان أخرى'],
  cars:['تشخيص أعطال السيارة','سحب أو ونش','تغيير زيت وفلاتر','إصلاح فرامل','كهرباء سيارات','بطارية وإطارات','خدمات سيارات أخرى'],
  cleaning:['تنظيف شقة','تنظيف بعد التشطيب','تنظيف كنب وسجاد','تنظيف خزانات','تنظيف مطابخ وحمامات','خدمات تنظيف أخرى'],
  appliances:['إصلاح غسالات','إصلاح ثلاجات','صيانة تكييفات','إصلاح سخانات','إصلاح غسالات أطباق','خدمات أجهزة منزلية أخرى']
};

/* ═════════ دورة حياة الطلب (V7 — 12 حالة) ═════════
   القيم القديمة محفوظة بنفس المعنى، والحالات الجديدة مضافة:
   • arrived   : مقدم الخدمة وصل (بين enroute و started)
   • quote     : مطلوب موافقة العميل على السعر (بين started و completed)
   • failed    : تعذر تنفيذ الخدمة (حالة نهائية بديلة عن closed)
   • cancelled : ملغى (موجودة أصلاً)
   ملاحظة: FLOW يمثل الترتيب المنطقي للتقدم الطبيعي، وليس بالضرورة ترتيباً زمنياً صارماً — بعض الحالات تُتخطى (مثلاً arrived قد لا تُستخدم إذا لم يسجلها المزود).  */
const FLOW = [
  ['received','تم استلام الطلب'],
  ['searching','جارٍ البحث عن مقدم خدمة'],
  ['sent','تم إرسال الطلب لمقدم الخدمة'],
  ['accepted','تم قبول الطلب'],
  ['scheduled','تم تأكيد الموعد'],
  ['enroute','مقدم الخدمة في الطريق'],
  ['arrived','مقدم الخدمة وصل'],
  ['started','جارٍ تنفيذ الخدمة'],
  ['quote','مطلوب موافقة العميل على السعر'],
  ['completed','تم إتمام الخدمة'],
  ['closed','تم إغلاق الطلب']
];
/* الحالات النهائية البديلة (لا تُدخل ضمن التقدم الطبيعي لكن لها label وأيقونة) */
const ALT_STATUS = [
  ['cancelled','تم إلغاء الطلب'],
  ['failed','تعذر تنفيذ الخدمة']
];
const STATUS_LABEL = Object.fromEntries(FLOW.concat(ALT_STATUS));
const FINAL_STATUSES = new Set(['closed','cancelled','failed']);
/* Request map pin: only {lat,lng} as rounded finite numbers in range (≈1 m precision); anything else → null. */
const cleanGeo = g => { if(!g||typeof g!=='object') return null; const lat=Number(g.lat), lng=Number(g.lng); if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) return null; return { lat:Math.round(lat*1e5)/1e5, lng:Math.round(lng*1e5)/1e5 }; };

const MP = (() => {
  const KEY = 'hs_mp_db';
  const now = () => new Date().toISOString();
  const year = () => new Date().getFullYear();
  const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);

  /* ═════════ رقم طلب فريد: HS-YYYY-XXXX — تسلسل دائم لا يعود ═════════
     نحتفظ بـ lastNo في db.meta، ولا يتأثر بحذف الطلبات من الواجهة.  */
  const nextReqNo = () => {
    if (!db.meta) db.meta = {};
    if (typeof db.meta.lastReqNo !== 'number') db.meta.lastReqNo = 1000;
    db.meta.lastReqNo += 1;
    const n = String(db.meta.lastReqNo).padStart(4,'0');
    return 'HS-' + year() + '-' + n;
  };

  /* ═════════ بذور البيانات (Demo) ═════════
     بيانات مقدمي الخدمة موسّعة بصور رمزية (SVG initials)، تخصصات دقيقة، تقييمات، أعمال، وصف.
     كل البيانات موسومة demo:true ولا تُعد تكاملاً حقيقياً.  */
  const PROVIDER_SEED = [
    { id:'p_demo1', name:'أحمد مصطفى', cats:['electric'], subs:['electric.board','electric.wiring','electric.fixtures'],
      govs:['القاهرة','الجيزة'], areas:['مدينة نصر','المعادي','مصر الجديدة'], years:12, bio:'كهربائي معتمد، متخصص في لوحات التوزيع والتأسيسات الحديثة.',
      rating:4.8, jobs:342, avatar:'#FF3D8F', phone:'', type:'individual' },
    { id:'p_demo2', name:'محمود السيد', cats:['plumbing'], subs:['plumbing.pipes','plumbing.fixtures','plumbing.heaters'],
      govs:['القاهرة','الجيزة'], areas:['الدقي','المهندسين','العجوزة'], years:9, bio:'سباك محترف، خبرة في كشف التسريبات بدون تكسير.',
      rating:4.7, jobs:228, avatar:'#FF7AB8', phone:'', type:'individual' },
    { id:'p_demo3', name:'شركة النجار الذهبي', cats:['carpentry'], subs:['carpentry.doors','carpentry.furniture','carpentry.kitchen'],
      govs:['القاهرة','الجيزة'], areas:['التجمع الخامس','المقطم','6 أكتوبر'], years:15, bio:'ورشة نجارة متخصصة في تفصيل وتركيب الأثاث والمطابخ.',
      rating:4.9, jobs:512, avatar:'#D6246F', phone:'', type:'company' },
    { id:'p_demo4', name:'حسن الديب', cats:['painting'], subs:['painting.interior','painting.exterior','painting.treatment'],
      govs:['القاهرة','الجيزة'], areas:['الهرم','فيصل','الشيخ زايد'], years:10, bio:'نقاش محترف، متخصص في معالجة الرطوبة والدهانات الديكورية.',
      rating:4.6, jobs:187, avatar:'#8b5cf6', phone:'', type:'individual' },
    { id:'p_demo5', name:'كريم فتحي', cats:['cars'], subs:['cars.engine','cars.electrical','cars.brakes','cars.ac'],
      govs:['القاهرة','الجيزة'], areas:['مدينة نصر','حلوان','المعادي'], years:8, bio:'فني سيارات متنقل، خدمة على الطريق وفحص كمبيوتر.',
      rating:4.5, jobs:143, avatar:'#FF9CCB', phone:'', type:'individual' },
    { id:'p_demo6', name:'فريق كلين برو', cats:['cleaning'], subs:['cleaning.home','cleaning.upholstery','cleaning.construction'],
      govs:['القاهرة','الجيزة'], areas:['التجمع الخامس','مدينة نصر','الشيخ زايد'], years:6, bio:'فريق تنظيف شامل، متخصص في ما بعد التشطيب والكنب والسجاد.',
      rating:4.8, jobs:274, avatar:'#b794ff', phone:'', type:'company' },
    { id:'p_demo7', name:'عمرو إبراهيم', cats:['appliances'], subs:['appliances.fridge','appliances.washer','appliances.ac'],
      govs:['القاهرة','الجيزة'], areas:['المعادي','مدينة نصر','الدقي'], years:11, bio:'فني أجهزة منزلية معتمد لجميع الماركات، صيانة وإصلاح.',
      rating:4.9, jobs:398, avatar:'#FF5AA5', phone:'', type:'individual' }
  ];

  const seed = () => {
    const providers = PROVIDER_SEED.map(p => ({
      ...p, docs:'', status:'approved', available:true, specialRate:null, demo:true, createdAt:now()
    }));
    return {
      v:2,
      meta:{ lastReqNo:1000, created:now() },
      customers:[], providers,
      services:[], serviceRequests:[], assignments:[], transactions:[], reviews:[],
      complaints:[], notifications:[],
      /* V7 جديد */
      addresses:[],           /* عناوين محفوظة للعميل: {id, customerId, label, gov, area, addr, detail, type, default} */
      quotes:[],              /* عروض أسعار: {id, reqId, providerId, labor, parts, visitFee, discount, total, status, at} */
      favorites:[],           /* مفضلة: {customerId, kind:'provider'|'service', refId, at} */
      drafts:[],              /* مسودات النموذج: {id, customerId, step, data, updatedAt} */
      searchHistory:[],
      jobPhotos:[],           /* صور قبل/بعد الشغل: {id=reqId, reqId, providerId, customerId, before, after, share, at} */       /* عمليات بحث حديثة: {customerId, q, at} */
      serviceAreas:Object.keys(AREA_HINTS).map(g=>({gov:g,areas:AREA_HINTS[g],demo:true})),
      settings:{ defaultRate:15, rates:{}, collectionModel:'platform', autoAssign:true, customerFee:false }
    };
  };

  let db;
  const buildServices = () => { db.services = Object.entries(SERVICE_TYPES).flatMap(([cat,l])=>l.map((name,i)=>({id:cat+':'+i,cat,name}))); };

  /* ترحيل آمن من V1 إلى V2 (إن وُجدت بيانات قديمة) */
  const migrate = () => {
    if (!db.meta) db.meta = { lastReqNo:1000, created:now() }; if (!Array.isArray(db.jobPhotos)) db.jobPhotos = [];
    if (db.v === 1) {
      db.addresses = db.addresses || [];
      db.quotes = db.quotes || [];
      db.favorites = db.favorites || [];
      db.drafts = db.drafts || [];
      db.searchHistory = db.searchHistory || [];
      /* ترقية بيانات مقدمي الخدمة التجريبيين إلى الشكل الموسّع إن كانوا لا يزالون بالبذرة */
      if (Array.isArray(db.providers)) {
        db.providers.forEach(p => {
          const full = PROVIDER_SEED.find(s => s.id === p.id);
          if (full && !p.rating) {
            Object.assign(p, { subs: full.subs, areas: full.areas, years: full.years, bio: full.bio, rating: full.rating, jobs: full.jobs, avatar: full.avatar });
          }
        });
      }
      /* ترقية أرقام الطلبات القديمة إن كانت رقمية فقط */
      if (Array.isArray(db.serviceRequests)) {
        db.serviceRequests.forEach(r => {
          if (/^\d+$/.test(r.no||'')) {
            const n = parseInt(r.no,10);
            if (n > db.meta.lastReqNo) db.meta.lastReqNo = n;
            const y = r.createdAt ? new Date(r.createdAt).getFullYear() : year();
            r.no = 'HS-' + y + '-' + String(n).padStart(4,'0');
          }
        });
      }
      db.v = 2;
    }
  };

  /* Firebase mode (services/firebase-config.js loads first): the local store is only a cache of the server's scoped
     read model. Never seed demo providers and never present local-mode data as server data — it is kept as a backup
     (hs_mp_db_backup_before_firebase) for the owner's migration, and the cache starts empty until the first sync. */
  const firebaseMode = () => { try { return !!(typeof globalThis !== 'undefined' && globalThis.HSFirebaseConfig && globalThis.HSFirebaseConfig.mode === 'firebase'); } catch { return false; } };
  const load = () => {
    try { const r = localStorage.getItem(KEY); db = r ? JSON.parse(r) : seed(); }
    catch { db = seed(); }
    if (!db || (db.v !== 1 && db.v !== 2)) db = seed();
    if (firebaseMode() && db._source !== 'firebase') {
      try { const raw = localStorage.getItem(KEY); if (raw && !localStorage.getItem(KEY + '_backup_before_firebase')) localStorage.setItem(KEY + '_backup_before_firebase', raw); } catch {}
      db = seed(); db.providers = []; db._source = 'firebase';
    }
    migrate();
    buildServices();
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch(e){ console.warn('storage full',e); } };
  load();

  const get = (col,id) => db[col].find(x=>x.id===id);
  /* ── ops alerts (teams release): an event for the team that must act. Local demo → db.alertEvents (the Admin app folds
     them into alerts: apps/admin/modules/ops-core.js); on the server the runtime provides HS_ALERT_OUTBOX and
     functions/src/alerts.js persists, de-duplicates and delivers them. No personal data in title/body — ids and numbers only. ── */
  const ALERT_TEAMS = ['ops', 'finance', 'content', 'tech', 'owner'];
  const raiseAlert = (a) => {
    const ev = { team: ALERT_TEAMS.includes(a && a.team) ? a.team : 'ops', severity: ['critical', 'normal', 'info'].includes(a && a.severity) ? a.severity : 'normal',
      kind: String((a && a.kind) || 'general').slice(0, 40), title: String((a && a.title) || '').slice(0, 120), body: String((a && a.body) || '').slice(0, 400),
      link: String((a && a.link) || '').slice(0, 200), dedupeKey: String((a && a.dedupeKey) || ((a && a.kind) || 'general')).slice(0, 120), at: now() };
    if (!ev.title) return null;
    const box = typeof globalThis !== 'undefined' && globalThis.HS_ALERT_OUTBOX;
    if (Array.isArray(box)) box.push(ev);
    else { db.alertEvents = Array.isArray(db.alertEvents) ? db.alertEvents : []; db.alertEvents.push(ev); if (db.alertEvents.length > 200) db.alertEvents.splice(0, db.alertEvents.length - 200); }
    return ev;
  };
  const notify = (to,text,reqId) => { db.notifications.unshift({id:uid('n'),to,text,reqId:reqId||null,at:now(),read:false}); };
  /* live tracking: the latest technician point lives only while the job is enroute / arrived (no history kept) */
  const log = (r,s,note) => { r.status = s; r.history.push({s,at:now(),note:note||''}); if (s !== 'enroute' && s !== 'arrived' && r.liveGeo) delete r.liveGeo; };
  const catName = c => (typeof DEVICES!=='undefined' && DEVICES[c]) ? DEVICES[c].name : c;

  /* ═════════ العمولة ═════════ */
  const rateFor = (cat, providerId) => {
    const p = providerId && get('providers',providerId);
    if (p && p.specialRate!=null && p.specialRate!=='') return +p.specialRate;
    const r = db.settings.rates[cat];
    const base = (r!=null && r!=='') ? +r : +db.settings.defaultRate;
    return providerId && api.bonusCfg() ? Math.max(0, base - api.rateCut(providerId)) : base;   /* tier: lower platform share */
  };
  /* ═════════ Upfront pricing (Uber model) ═════════
     The admin sets a base price per service (catalog item id, or service id) = what the PROVIDER receives.
     The customer sees base × (1 + markupRate%) at booking; the platform's share is the difference.
     markupRate defaults to the existing defaultRate. No price configured → the previous flow (value at completion). */
  const markupRate = () => { const m = db.settings.markupRate; return (m!=null && m!=='') ? +m : +db.settings.defaultRate; };
  const quoteFor = (base, rate) => { const b = Math.round(+base*100)/100, c = Math.round(b*(1+rate/100)); return { base:b, rate, customerPrice:c, providerAmount:b, platformFee:Math.round((c-b)*100)/100 }; };
  const priceFor = (key) => { const prices = db.settings.prices || {}; const b = key && prices[key]; return (b!=null && +b>0) ? quoteFor(+b, markupRate()) : null; };
  const calc = (value, rate, deductions=0) => {
    const v = Math.max(0, +value||0), c = Math.round(v*rate)/100, d = Math.max(0, +deductions||0);
    return { value:v, rate, commission:c, deductions:d, net: Math.round((v-c-d)*100)/100 };
  };

  /* ═════════ round 5: today's demand (public counts) and discounts ═════════ */
  const cairoDay = () => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date()); } catch { return now().slice(0, 10); } };
  /* Per-day request counts by category and by area (no people, no request ids) — feeds «الأكثر طلبًا النهارده» for
     customers and «فين الطلب عالي النهارده» for providers. Kept small: at most 40 areas. */
  const bumpTrend = r => {
    const day = cairoDay(), cur = db.settings.trend;
    const tr = cur && cur.day === day ? cur : { day, cats: {}, areas: {} };
    if (r.cat) tr.cats[r.cat] = (tr.cats[r.cat] || 0) + 1;
    if (r.area) {
      const k = String(r.gov || '') + '|' + String(r.area).slice(0, 40);
      tr.areas[k] = (tr.areas[k] || 0) + 1;
      const keys = Object.keys(tr.areas);
      if (keys.length > 40) keys.sort((a, b) => tr.areas[a] - tr.areas[b]).slice(0, keys.length - 40).forEach(x => delete tr.areas[x]);
    }
    db.settings.trend = tr;
  };
  /* Promo code / referral / credit discount, applied once when the job is completed. The platform pays it out of its
     own fee: the discount never exceeds the platform commission, so the provider's net amount never changes. */
  const applyDiscount = (r, x) => {
    const pm = r.promo; if (!pm || !(x.value > 0)) return;
    const cust = get('customers', r.customerId);
    let off = pm.kind === 'percent' ? x.value * (+pm.value || 0) / 100 : (+pm.value || 0);
    if (pm.kind === 'credit') off = Math.min(off, +(cust && cust.credit) || 0);
    if (+pm.maxOff > 0) off = Math.min(off, +pm.maxOff);
    off = Math.round(Math.max(0, Math.min(off, x.commission, x.value)) * 100) / 100;
    if (pm.ref) {
      const f = get('customers', pm.ref);
      if (f && +pm.refReward > 0) { f.credit = Math.round(((+f.credit || 0) + (+pm.refReward)) * 100) / 100; notify('customer:' + f.id, 'صاحبك خلّص أول طلب بكود دعوتك — اتضافلك رصيد ' + (+pm.refReward) + ' ج.م على طلبك الجاي', null); }
    }
    if (!off) return;
    if (pm.kind === 'credit' && cust) cust.credit = Math.round(Math.max(0, (+cust.credit || 0) - off) * 100) / 100;
    x.value = Math.round((x.value - off) * 100) / 100;
    x.commission = Math.round((x.commission - off) * 100) / 100;
    x.discount = off; x.promo = pm.code;
    r.discount = off;
  };
  const CHAT_MAX = 150;
  const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /* round 8: maintenance reminder intervals (days) for devices that need periodic service; others get no reminder */
  const MAINTENANCE_DAYS = { 'appliances/ac': 120, 'appliances/heater-electric': 365, 'appliances/heater-gas': 365, 'appliances/washer-auto': 365, 'appliances/fridge': 365, 'appliances/dishwasher': 365, 'cars/oil-change': 90, 'plumbing/water-tanks': 180 };
  /* after a completed job: warranty end date (admin-set days) and the customer's «بيتي» device / next maintenance date */
  const afterCompletion = r => {
    const wd = api.warrantyDays(r);
    if (wd > 0 && !r.warrantyOf) r.warrantyUntil = new Date(Date.now() + wd * 864e5).toISOString();
    const days = MAINTENANCE_DAYS[r.itemId]; if (!days) return;
    const c = get('customers', r.customerId); if (!c) return;
    c.devices = Array.isArray(c.devices) ? c.devices : [];
    let d = c.devices.find(x => x.item === r.itemId);
    if (!d && c.devices.length < 20) { d = { id: uid('dv'), item: r.itemId, cat: r.cat, name: r.itemName || r.serviceName, brand: '', year: '', at: now(), auto: true }; c.devices.push(d); }
    if (d) { d.lastAt = now(); d.nextAt = new Date(Date.now() + days * 864e5).toISOString(); d.lastReq = r.no; }
  };

  /* ═════════ الإسناد ═════════ */
  /* security (round 2): a provider never serves a request from their own phone number (self-dealing: fake jobs,
     bonus and rating farming) */
  const digitsOf = s => String(s || '').replace(/\D/g, '').replace(/^20(?=1\d{9}$)/, '0');
  const selfDeal = (p, r) => !!(p && r && digitsOf(p.phone) && digitsOf(p.phone) === digitsOf(r.phone));
  const candidates = r => {
    /* التوافق: 1) التخصص (cats)  2) تخصص الجهاز إن أمكن (subs)  3) المحافظة  4) التوفر */
    const subs = r.itemId || '';
    return db.providers.filter(p => {
        if (p.status !== 'approved' || !p.available) return false;
        if (selfDeal(p, r)) return false;
        if (!p.cats.includes(r.cat)) return false;
        if (!p.govs.includes(r.gov)) return false;
        /* إن كان للمزود subs محدد، نفضّل أن يتضمن subs الجهاز — وإلا فالتخصص العام كافٍ */
        return true;
      })
      .map(p => {
        let score = (rating(p.id) || 0) * 10 + acceptRate(p.id);
        if (p.tier && db.settings.bonus && db.settings.bonus.on) { const ti = (db.settings.bonus.tiers || []).findIndex(t => (t.id || t.name) === p.tier); if (ti >= 0) score += 100 * (ti + 1); }   /* bonus tier: priority in offers */
        if (subs && Array.isArray(p.subs) && p.subs.some(s => subs.startsWith(s))) score += 30;
        return { p, score };
      })
      .filter(x => !db.assignments.some(a => a.reqId===r.id && a.providerId===x.p.id && a.status==='rejected'))
      .sort((a,b) => b.score - a.score)
      .map(x => x.p);
  };
  /* server: providers carry stats {n, sum, dec, ok} maintained at commit (functions/src/provider-stats.js), so matching does
     not need their whole history; the local demo (no stats) computes from the arrays as before */
  const statsOf = pid => { const p = db.providers.find(x => x.id === pid); return p && p.stats && typeof p.stats === 'object' ? p.stats : null; };
  const rating = pid => { const s = statsOf(pid); if (s) return s.n ? Math.round(s.sum / s.n * 10) / 10 : null; const rs = db.reviews.filter(x=>x.providerId===pid && !x.hidden);   /* hidden (moderated) reviews do not count */ return rs.length ? Math.round(rs.reduce((s,x)=>s+x.stars,0)/rs.length*10)/10 : null; };
  const acceptRate = pid => { const s = statsOf(pid); if (s) return s.dec ? Math.round(s.ok / s.dec * 100) : 100; const as = db.assignments.filter(a=>a.providerId===pid && a.status!=='offered' && a.status!=='withdrawn'); return as.length ? Math.round(as.filter(a=>a.status!=='rejected').length/as.length*100) : 100; };

  const api = {
    db: () => db, reset(){ db = seed(); buildServices(); save(); },
    /* Re-read the shared store after another tab changed it (storage event) so this tab never renders or saves stale data. */
    reload(){ load(); }, GOVS, AREA_HINTS, rateFor, calc, rating, acceptRate, candidates, get, catName, uid, now, year,
    reqs: () => db.serviceRequests, byStatus: f => db.serviceRequests.filter(f),
    FLOW, ALT_STATUS, STATUS_LABEL, FINAL_STATUSES,

    customerFor(name, phone){
      let c = db.customers.find(x=>x.phone===phone);
      if(!c){ c = {id:uid('c'),name,phone,status:'active',createdAt:now()}; db.customers.push(c); }
      else if(name) c.name = name;
      save(); return c;
    },

    /* ═════════ إنشاء طلب (V6 signature محفوظ) ═════════
       يقبل نفس الحقول القديمة + الحقول الجديدة (كلها اختيارية):
       - title? attachments? (ids) addressId? preferredSlot? preferredPeriod? flexible?
       - contactMethod? notes?
       @API POST /requests
       ملاحظة: خاصية photos تبقى موجودة للتوافق، لكن attachments[].id هو المرجع الجديد. */
    createRequest(d){
      const c = api.customerFor(d.name, d.phone);
      const r = {
        id:uid('r'), no: nextReqNo(), customerId:c.id,
        cat:d.cat, serviceId:d.serviceId, serviceName:d.serviceName,
        catName:d.catName||'', itemId:d.itemId||'', itemName:d.itemName||'',
        problemId:d.problemId||'', problemName:d.problemName||'', unknownProblem:!!d.unknownProblem,
        answers:d.answers||{}, specialty:d.specialty||'',
        desc:d.desc, photos:Array.isArray(d.photos)?d.photos:[],
        attachments:Array.isArray(d.attachments)?d.attachments:[],
        video:d.video||'',
        gov:d.gov, area:d.area, addr:d.addr, geo:cleanGeo(d.geo),
        when:d.when||'', whenNote:d.whenNote||'',
        preferredSlot:d.preferredSlot||'',  preferredPeriod:d.preferredPeriod||'',
        flexible:!!d.flexible,
        phone:d.phone, contactMethod:d.contactMethod||'call',
        note:d.note||'', notes:d.notes||'',
        addressId:d.addressId||'',
        promo:d.promo||null, packageId:d.packageId||'', packageName:d.packageName||'',
        status:'received', history:[], proposal:null, finalValue:null,
        quoteId:'', demo:true, createdAt:now()
      };
      const pr = priceFor(r.itemId) || priceFor(r.serviceId);
      if (pr) { r.pricing = pr; r.agreedValue = pr.customerPrice; }   /* upfront price shown to the customer and fixed on the request */
      log(r,'received'); log(r,'searching');
      db.serviceRequests.unshift(r);
      bumpTrend(r);
      notify('admin','طلب جديد '+r.no+' — '+r.serviceName, r.id);
      const pref = d.preferProvider && get('providers', d.preferProvider);   /* «اطلب نفس الفني تاني» */
      if (pref && pref.status === 'approved' && pref.available !== false && (pref.cats || []).includes(r.cat)) api.assign(r.id, pref.id);
      else if (api.biddingOn()) api.openBidding(r);
      else if (db.settings.autoAssign) api.assign(r.id);
      save(); return r;
    },

    /* ═════════ إسناد (تلقائي أو يدوي) ═════════
       @API POST /assignments
       V7: بعد الإسناد التلقائي، الحالة تنتقل إلى searching ثم sent (كما V6).
       عند الرفض، تعود الحالة searching ثم تُسند لمرشح آخر تلقائياً إن توفر. */
    assign(reqId, providerId){
      const r = get('serviceRequests',reqId);
      if(!r || !['searching','received'].includes(r.status)) return {ok:false,msg:'حالة الطلب لا تسمح بالإسناد'};
      const p = providerId ? get('providers',providerId) : candidates(r)[0];
      if(!p) return {ok:false,msg:'لا يوجد مقدم خدمة مطابق (التخصص/المحافظة/التوفر)'};
      if(selfDeal(p, r)) return {ok:false,msg:'مقدم الخدمة ده هو صاحب الطلب نفسه — اختار مقدم خدمة تاني'};
      db.assignments.push({id:uid('a'),reqId,providerId:p.id,status:'offered',reason:'',at:now(),manual:!!providerId});
      log(r,'sent', (providerId?'إسناد يدوي من الإدارة':'مطابقة تلقائية')+' — '+p.name);
      notify('provider:'+p.id,'طلب جديد '+r.no+' بانتظار ردّك',r.id);
      save(); return {ok:true,provider:p};
    },

    /* المزود المقبول الحالي (حسب V6: offered أو accepted) */
    activeAssignment: reqId => db.assignments.find(a=>a.reqId===reqId && ['offered','accepted'].includes(a.status)),
    providerOf(reqId){ const a = db.assignments.find(a=>a.reqId===reqId && a.status==='accepted'); return a && get('providers',a.providerId); },

    /* ═════════ ردّ المزود على العرض ═════════ */
    respond(reqId, accept, reason){
      const r = get('serviceRequests',reqId), a = api.activeAssignment(reqId);
      if(!r||!a||a.status!=='offered') return false;
      if(accept && selfDeal(get('providers', a.providerId), r)) return false;
      if(accept){
        a.status='accepted';
        r.pin = String(1000 + Math.floor(Math.random() * 9000));   /* arrival code: the customer shows it, the provider enters it at the door */
        log(r,'accepted','قبل '+get('providers',a.providerId).name);
        notify('customer:'+r.customerId,'تم قبول طلبك '+r.no,r.id);
      }
      else {
        a.status='rejected'; a.reason=reason||'';
        log(r,'searching','رفض مقدم الخدمة: '+(reason||'بدون سبب'));
        notify('admin','رُفض الطلب '+r.no+' — '+(reason||''),r.id);
        if (r.warrantyOf && !r.warrantyPayer) { r.warrantyPayer = a.providerId; notify('admin','الفني الأصلي رفض طلب الضمان '+r.no+' — هيتبعت لفني تاني والتكلفة على الفني الأصلي',r.id); api.assign(reqId); }
        else if (db.settings.autoAssign) api.assign(reqId);
      }
      save(); return true;
    },

    /* ═════════ المواعيد ═════════ */
    propose(reqId, at){ const r = get('serviceRequests',reqId); if(!r||r.status!=='accepted') return false; r.proposal={at,by:'provider'};
      notify('customer:'+r.customerId,'مقدم الخدمة اقترح موعدًا جديدًا للطلب '+r.no,r.id); save(); return true; },
    confirmTime(reqId, by){
      const r = get('serviceRequests',reqId); if(!r||r.status!=='accepted') return false;
      r.agreedAt = (by==='customer' && r.proposal) ? r.proposal.at : (r.proposal?r.proposal.at:r.when);
      r.proposal = null;
      log(r,'scheduled','الموعد: '+r.agreedAt);
      const other = by==='customer' ? 'provider:'+(api.providerOf(reqId)||{}).id : 'customer:'+r.customerId;
      notify(other,'تم الاتفاق على موعد الطلب '+r.no,r.id);
      save(); return true;
    },

    /* ═════════ التقدم بين الحالات (يسمح بالتخطي للأمام بمقدار واحد فقط) ═════════
       التوافق الخلفي محفوظ: التوقيع (reqId, to) بنفس السلوك القديم. */
    /** Live tracking: the assigned provider's latest position while enroute / arrived, rounded to ~10 m (4 decimals).
        Returns false when not allowed. Only the latest point is kept. */
    setLiveGeo(reqId, providerId, lat, lng, acc){
      const r = get('serviceRequests', reqId); if (!r) return false;
      if (!['enroute', 'arrived'].includes(r.status)) return false;
      const p = api.providerOf(reqId); if (!p || p.id !== providerId) return false;
      lat = +lat; lng = +lng; if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
      const round = v => Math.round(v * 1e4) / 1e4;
      r.liveGeo = { lat: round(lat), lng: round(lng), acc: Math.min(5000, Math.max(0, Math.round(+acc || 0))), at: now() };
      save(); return true;
    },
    advance(reqId, to){
      const r = get('serviceRequests',reqId); if(!r) return false;
      const i = k => FLOW.findIndex(f=>f[0]===k);
      if (i(r.status) < 0) return false;               /* من حالة نهائية بديلة (cancelled/failed) لا تقدم */
      /* advance يغطي الخطوات التشغيلية فقط. بقية الحالات لها عمليات مُتحقَّق منها:
         accepted=respond، scheduled=confirmTime، quote=createQuote، completed=complete/completeFree، closed=close. */
      if (!['enroute','arrived','started'].includes(to)) return false;
      if (!api.providerOf(reqId)) return false;
      if (i(to) !== i(r.status) + 1) return false;
      log(r,to);
      notify('customer:'+r.customerId, STATUS_LABEL[to]+' — الطلب '+r.no, r.id);
      save(); return true;
    },

    /* ═════════ عرض السعر والموافقة — دورة حياة الطلب المدفوع (2026-11-14) ═════════
       started ──createQuote──▶ quote ──approveQuote──▶ started (السعر متفق عليه r.agreedValue، جارٍ التنفيذ)
               ◀──rejectQuote──┘                         ──complete (المزود)──▶ completed ──close (العميل)──▶ closed
       • موافقة العميل لا تُكمل الطلب: المزود يسجّل الإكمال، والعميل يؤكد الإتمام.
       • عرض بقيمة صفر ممنوع؛ لا يُستبدل عرض معتمد؛ تحديث عرض معلّق يجعل السابق superseded.
       • المعاملة المالية تُنشأ مرة واحدة عند complete() فقط. */
    createQuote(reqId, q){
      const r = get('serviceRequests',reqId); const p = api.providerOf(reqId);
      if(!r || !p) return {ok:false,msg:'لا يوجد مزود معين'};
      if (r.freeService && ['proposed','accepted'].includes(r.freeService.status)) return {ok:false,msg:'هذا الطلب في مسار «خدمة مجانية»؛ لا يمكن إرسال عرض سعر معه'};
      if (!['scheduled','enroute','arrived','started','quote'].includes(r.status)) return {ok:false,msg:'حالة الطلب لا تسمح بإرسال عرض سعر'};
      const prev = api.currentQuote(reqId);
      if (prev && prev.status === 'approved') return {ok:false,msg:'السعر متفق عليه بالفعل؛ لا يمكن استبدال عرض معتمد'};
      const total = Math.max(0, (+q.labor||0) + (+q.parts||0) + (+q.visitFee||0) - (+q.discount||0));
      /* قاعدة عمل: عروض الأسعار بقيمة صفر ممنوعة — الخدمة بلا مقابل لها مسار «خدمة مجانية» مستقل */
      if (!(total > 0)) return {ok:false,msg:'لا يُسمح بعرض سعر بقيمة صفر. إن كانت الخدمة بلا مقابل استخدم «خدمة مجانية».'};
      const quote = {
        id:uid('q'), reqId, providerId:p.id,
        labor:+q.labor||0, parts:+q.parts||0, visitFee:+q.visitFee||0, discount:+q.discount||0,
        total, note:q.note||'', status:'pending', at:now()
      };
      if (r.pricing || r.inspection) { const nq = quoteFor(total, r.pricing ? r.pricing.rate : r.inspection.rate); quote.providerAmount = nq.providerAmount; quote.customerTotal = nq.customerPrice; quote.platformFee = nq.platformFee; }
      if (r.pricing && total > r.pricing.providerAmount * 1.5) { quote.flagged = true; notify('admin', 'سعر جديد أعلى من المتفق عليه بأكتر من 50% على الطلب ' + r.no + ' (' + r.pricing.providerAmount + ' ← ' + total + ')', r.id); }
      if (prev && prev.status === 'pending') prev.status = 'superseded';
      db.quotes.unshift(quote);
      r.quoteId = quote.id;
      /* إن كان الطلب في started أو arrived، انتقل إلى quote */
      if (['started','arrived','enroute'].includes(r.status)) log(r,'quote','عرض سعر بمبلغ '+total);
      else if (r.status === 'quote') { /* لا تغيير */ }
      else r.status = 'quote';
      notify('customer:'+r.customerId,'عرض سعر جديد للطلب '+r.no+' — '+total+' ج.م',r.id);
      save(); return {ok:true, quote};
    },
    approveQuote(reqId){
      const r = get('serviceRequests',reqId); if(!r) return false;
      const q = db.quotes.find(x=>x.id===r.quoteId);
      if(!q || !(+q.total > 0)) return false;   /* لا موافقة على عرض بقيمة صفر (بيانات قديمة) */
      if (q.status !== 'pending' || r.status !== 'quote') return false;   /* موافقة واحدة على عرض معلّق فقط */
      const p = api.providerOf(reqId); if (!p) return false;
      q.status = 'approved'; q.approvedAt = now();
      r.agreedValue = q.total;
      if (r.pricing || r.inspection) { r.pricing = quoteFor(q.total, r.pricing ? r.pricing.rate : r.inspection.rate); r.agreedValue = r.pricing.customerPrice; if (r.inspection) r.inspection.waived = true; }   /* inspection fee deducted (not charged on top) */   /* adjusted upfront price */
      log(r,'started','العميل وافق على السعر ('+q.total+' ج.م) — جارٍ التنفيذ');
      notify('provider:'+p.id,'العميل وافق على السعر — نفّذ الخدمة ثم سجّل الإكمال (الطلب '+r.no+')',r.id);
      save(); return true;
    },
    rejectQuote(reqId, reason){
      const r = get('serviceRequests',reqId); if(!r) return false;
      const q = db.quotes.find(x=>x.id===r.quoteId);
      if(!q || q.status !== 'pending') return false;   /* الرفض لعرض معلّق فقط (لا رفض لعرض معتمد) */
      q.status = 'rejected'; q.reason = reason || '';
      /* إذا رُفض السعر، نرجع الطلب إلى started لو كان في quote */
      if (r.status === 'quote') log(r,'started','العميل رفض السعر — إعادة التفاوض');
      notify('provider:'+(api.providerOf(reqId)||{}).id,'العميل رفض عرض السعر — الطلب '+r.no,r.id);
      save(); return true;
    },
    currentQuote(reqId){
      const r = get('serviceRequests',reqId); if (!r || !r.quoteId) return null;
      return db.quotes.find(x=>x.id===r.quoteId) || null;
    },

    /* ═════════ اكتمال الخدمة + المعاملة المالية (متوافق مع V6) ═════════
       V6 signature: complete(reqId, value, deductions) — محفوظ.
       إن كان هناك عرض سعر معتمد، يمكن استدعاء complete بدون value لاستخدامه. */
    /* ═════════ الخدمة المجانية — مسار مستقل (ليست عرض سعر بقيمة صفر) ═════════
       proposed (من المزود، بسبب مطلوب) → accepted | declined (من العميل) → completed (من المزود، بلا مقابل).
       قواعد: لا مع عرض سعر معلّق/معتمد؛ لا إكمال مدفوع أثناء المسار؛ معاملة الإكمال value=0 بلا عمولة وموسومة free. */
    FREE_REASONS: { inspection:'معاينة/تشخيص مجاني', warranty:'ضمان على خدمة سابقة', goodwill:'مبادرة مجانية من مقدم الخدمة', other:'سبب آخر' },
    proposeFree(reqId, reason){
      const r = get('serviceRequests',reqId), p = api.providerOf(reqId);
      if(!r || !p) return {ok:false,msg:'لا يوجد مزود معين'};
      if(!api.FREE_REASONS[reason]) return {ok:false,msg:'اختر سبب الخدمة المجانية'};
      if(!['scheduled','enroute','arrived','started'].includes(r.status)) return {ok:false,msg:'لا يمكن تحويل الطلب إلى خدمة مجانية في حالته الحالية'};
      const q = api.currentQuote(reqId);
      if(q && ['pending','approved'].includes(q.status)) return {ok:false,msg:'يوجد عرض سعر قائم لهذا الطلب'};
      if(r.freeService && ['proposed','accepted','completed'].includes(r.freeService.status)) return {ok:false,msg:'سبق اقتراح خدمة مجانية لهذا الطلب'};
      r.freeService = { status:'proposed', reason, by:p.id, at:now() };
      r.history.push({s:r.status, at:now(), note:'اقتراح خدمة مجانية: '+api.FREE_REASONS[reason]});
      notify('customer:'+r.customerId,'مقدم الخدمة يقترح تنفيذ الطلب '+r.no+' مجانًا — بانتظار موافقتك',r.id);
      save(); return {ok:true};
    },
    respondFree(reqId, accept){
      const r = get('serviceRequests',reqId);
      if(!r || !r.freeService || r.freeService.status!=='proposed') return false;
      r.freeService.status = accept ? 'accepted' : 'declined'; r.freeService.respondedAt = now();
      r.history.push({s:r.status, at:now(), note: accept ? 'وافق العميل على الخدمة المجانية' : 'رفض العميل الخدمة المجانية'});
      notify('provider:'+(api.providerOf(reqId)||{}).id, (accept?'وافق':'رفض')+' العميل على الخدمة المجانية — الطلب '+r.no, r.id);
      save(); return true;
    },
    completeFree(reqId){
      const r = get('serviceRequests',reqId), p = api.providerOf(reqId);
      if(!r || !p || !r.freeService || r.freeService.status!=='accepted') return false;
      if(!['scheduled','enroute','arrived','started'].includes(r.status)) return false;
      r.finalValue = 0; r.freeService.status = 'completed'; r.freeService.completedAt = now();
      api.settleWarranty(r, p.id);
      log(r,'completed','خدمة مجانية — بدون مقابل ('+api.FREE_REASONS[r.freeService.reason]+')');
      if (!db.transactions.some(t => t.reqId===reqId)) {
        db.transactions.push({id:uid('t'),reqId,providerId:p.id,customerId:r.customerId,cat:r.cat,value:0,rate:0,commission:0,deductions:0,net:0,free:true,model:'free',collection:'none',demo:true,at:now()});
      }
      notify('customer:'+r.customerId,'اكتملت الخدمة المجانية — أكّد الإتمام وقيّم الفني (الطلب '+r.no+')',r.id);
      save(); return true;
    },

    complete(reqId, value, deductions){
      const r = get('serviceRequests',reqId), p = api.providerOf(reqId);
      if(!r || !p) return false;
      if (r.freeService && ['proposed','accepted'].includes(r.freeService.status)) return false;   /* المسار المجاني يُكمَل عبر completeFree */
      if (![ 'started','arrived','enroute','scheduled','accepted' ].includes(r.status)) return false;   /* 'quote' = بانتظار موافقة العميل: لا إكمال */
      const q = api.currentQuote(reqId);
      if (q && q.status === 'pending') return false;
      let v = +value;
      if (r.pricing) {
        if (value !== undefined && value !== null && value !== '' && v !== +r.pricing.customerPrice) return false;   /* the booked price is final */
        const d = Math.max(0, +deductions||0), pr = r.pricing;
        const x = { value:pr.customerPrice, rate:pr.rate, commission:pr.platformFee, deductions:d, net:Math.round((pr.providerAmount-d)*100)/100, pricing:'upfront' };
        if (!db.transactions.some(t => t.reqId===reqId)) applyDiscount(r, x);
        r.finalValue = x.value;
        api.learnPrice(r.problemId || r.itemId, pr.providerAmount);
        log(r,'completed','السعر المحدد مسبقًا '+x.value);
        if (!db.transactions.some(t => t.reqId===reqId)) db.transactions.push({id:uid('t'),reqId,providerId:p.id,customerId:r.customerId,cat:r.cat,...x,model:db.settings.collectionModel,collection:'pending',demo:true,at:now()});
        afterCompletion(r);
        notify('customer:'+r.customerId,'اكتملت الخدمة — أكّد الإتمام وقيّم الفني (الطلب '+r.no+')',r.id);
        save(); return true;
      }
      if (q && q.status === 'approved') {
        /* السعر المتفق عليه هو القيمة النهائية؛ لا يُقبل مبلغ مختلف */
        if (value !== undefined && value !== null && value !== '' && v !== +q.total) return false;
        v = +q.total;
      } else if (!Number.isFinite(v) || v <= 0) return false;
      const rate = rateFor(r.cat, p.id), x = calc(v, rate, deductions);
      if (!db.transactions.some(t => t.reqId===reqId)) applyDiscount(r, x);
      r.finalValue = x.value;
      api.learnPrice(r.problemId || r.itemId, x.value - (+x.commission || 0));
      log(r,'completed','القيمة النهائية '+x.value);
      if (!db.transactions.some(t => t.reqId===reqId)) {
        db.transactions.push({id:uid('t'),reqId,providerId:p.id,customerId:r.customerId,cat:r.cat,...x,model:db.settings.collectionModel,collection:'pending',demo:true,at:now()});
      }
      afterCompletion(r);
      notify('customer:'+r.customerId,'اكتملت الخدمة — أكّد الإتمام وقيّم الفني (الطلب '+r.no+')',r.id);
      save(); return true;
    },

    close(reqId){
      const r = get('serviceRequests',reqId);
      if(!r || r.status!=='completed') return false;
      log(r,'closed','أكّد العميل الإتمام'); save(); return true;
    },

    cancel(reqId, reason, byAdmin){
      const r = get('serviceRequests',reqId);
      if(!r || FINAL_STATUSES.has(r.status)) return false;
      const idx = FLOW.findIndex(f=>f[0]===r.status);
      if (idx >= FLOW.findIndex(f=>f[0]==='started')) return false;
      const a = api.activeAssignment(reqId);
      const fee = !byAdmin && a && a.status === 'accepted' && ['enroute', 'arrived'].includes(r.status) ? api.cancelFee() : 0;
      db.assignments.filter(x => x.reqId === reqId && x !== a && x.status === 'offered').forEach(x => { x.status = 'withdrawn'; });   /* other open offers */
      if(a){ a.status='withdrawn'; notify('provider:'+a.providerId,'ألغى العميل الطلب '+r.no+(fee?' — ليك رسوم انتقال '+fee+' ج.م':''),r.id); }
      if (fee) { r.cancelFee = fee; db.transactions.push({id:uid('t'),reqId,providerId:a.providerId,customerId:r.customerId,cat:r.cat,value:fee,rate:0,commission:0,deductions:0,net:fee,kind:'cancel-fee',model:db.settings.collectionModel,collection:'pending',demo:true,at:now()}); }
      log(r,'cancelled',reason||''); save(); return true;
    },

    /* حالة بديلة: تعذر التنفيذ */
    fail(reqId, reason){
      const r = get('serviceRequests',reqId);
      if(!r || FINAL_STATUSES.has(r.status)) return false;
      log(r,'failed', reason || 'تعذر التنفيذ');
      notify('customer:'+r.customerId,'تعذر تنفيذ الخدمة — الطلب '+r.no,r.id);
      save(); return true;
    },

    /* ═════════ round 5: in-request chat, provider rates the customer, arrival estimate, referral code ═════════ */
    /** Message between the customer and the provider who accepted the job (open until the request is closed). */
    message(reqId, by, text){
      const r = get('serviceRequests', reqId), p = api.providerOf(reqId);
      const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (!r || !p || !t || !['customer', 'provider'].includes(by) || ['cancelled', 'failed', 'closed'].includes(r.status)) return false;
      r.chat = Array.isArray(r.chat) ? r.chat : [];
      if (r.chat.length >= CHAT_MAX) return false;
      r.chat.push({ id: uid('m'), by, pid: p.id, text: t, at: now() });
      notify(by === 'customer' ? 'provider:' + p.id : 'customer:' + r.customerId, (by === 'customer' ? 'رسالة من العميل' : 'رسالة من ' + p.name) + ' — الطلب ' + r.no + ': ' + t.slice(0, 60), r.id);
      save(); return true;
    },
    /** messages visible to one side: the customer sees the whole thread, a provider only their own conversation */
    chatFor(reqId, providerId){
      const r = get('serviceRequests', reqId); const all = (r && Array.isArray(r.chat)) ? r.chat : [];
      return providerId ? all.filter(m => m.pid === providerId) : all;
    },
    /** The provider rates the customer once after the job (stars kept on the customer as an average). */
    rateCustomer(reqId, d){
      const r = get('serviceRequests', reqId), p = api.providerOf(reqId);
      if (!r || !p || r.customerReview || !['completed', 'closed'].includes(r.status)) return false;
      const stars = +d.stars; if (!Number.isInteger(stars) || stars < 1 || stars > 5) return false;
      r.customerReview = { stars, comment: String(d.comment || '').slice(0, 300), by: p.id, at: now() };
      const c = get('customers', r.customerId);
      if (c) { c.ratingSum = (+c.ratingSum || 0) + stars; c.ratingCount = (+c.ratingCount || 0) + 1; c.rating = Math.round(c.ratingSum / c.ratingCount * 10) / 10; }
      save(); return true;
    },
    /** Provider's own arrival estimate when leaving ("في الطريق"), in minutes. */
    setEta(reqId, minutes){
      const r = get('serviceRequests', reqId), m = Math.round(+minutes);
      if (!r || r.status !== 'enroute' || !(m >= 5 && m <= 180)) return false;
      r.etaMin = m; r.etaAt = new Date(Date.now() + m * 60000).toISOString();
      save(); return true;
    },
    /** The customer's personal invite code (created on first use). */
    refCodeFor(customerId){
      const c = get('customers', customerId); if (!c) return '';
      if (!c.refCode) { let s = 'HS'; for (let i = 0; i < 6; i++) s += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)]; c.refCode = s; save(); }
      return c.refCode;
    },
    cairoDay,
    /* ═════════ round 9: offers — up to 3 nearby providers send an offer, the customer chooses ═════════
       Switched on by the admin (settings.bidding). Mode per request: «quote» (labor + parts) or «inspection» (visit fee)
       — inspection when the problem is marked «needs a visit» in the catalogue or the customer doesn't know the problem;
       a provider may also answer a quote request with «محتاج معاينة». The server adds the platform share
       (quoteFor + markupRate) and refuses prices above the admin caps. Choosing an offer fixes the price on the request
       (r.pricing — the existing fixed-price completion path) or the inspection fee (r.inspection); an approved repair
       quote after an inspection replaces it (the inspection fee is deducted = not charged on top). */
    biddingOn(){ return !!(db.settings && db.settings.bidding); },
    needsInspection(r){
      /* unknown / «other» problems always start with a visit; otherwise the admin's list decides (problem > item > category), default: direct price */
      if (r.unknownProblem || !r.problemId || /\/other(-|$)|diagnos/.test(String(r.problemId))) return true;
      const m = db.settings.inspection || {};
      const v = [m.problems && m.problems[r.problemId], m.items && m.items[r.itemId], m.cats && m.cats[r.cat]].find(x => typeof x === 'boolean');
      return v === true;
    },
    inspectionCap(cat){
      const c = db.settings.inspectionCap || {}, v = c.cats && c.cats[cat] != null && c.cats[cat] !== '' ? c.cats[cat] : c.default;
      return +v > 0 ? +v : 0;                   /* 0 = no cap until the admin sets one */
    },
    priceCap(r){
      const c = db.settings.priceCaps || {};
      const v = [c.problems && c.problems[r.problemId], c.items && c.items[r.itemId], c.cats && c.cats[r.cat]].find(x => x != null && x !== '' && +x > 0);
      return v ? +v : 0;
    },
    /** invite up to `n` more matching providers (default 3) to send an offer */
    openBidding(r, n){
      if (!r.bidding) r.bidding = { mode: api.needsInspection(r) ? 'inspection' : 'quote', until: new Date(Date.now() + (+db.settings.bidWindowMin || 15) * 60000).toISOString() };
      const invited = new Set(db.assignments.filter(a => a.reqId === r.id).map(a => a.providerId));
      const pick = candidates(r).filter(p => !invited.has(p.id)).slice(0, n || 3);
      for (const p of pick) {
        db.assignments.push({ id: uid('a'), reqId: r.id, providerId: p.id, status: 'offered', reason: '', at: now(), bidding: true });
        notify('provider:' + p.id, (r.bidding.mode === 'inspection' ? 'طلب معاينة ' : 'طلب جديد ') + r.no + ' — ابعت عرضك', r.id);
      }
      if (!pick.length && !db.assignments.some(a => a.reqId === r.id && a.status === 'offered')) notify('admin', 'مفيش فنيين متاحين يبعتوا عروض على الطلب ' + r.no, r.id);
      return pick.length;
    },
    offersFor(reqId){ return db.assignments.filter(a => a.reqId === reqId && a.bidding && a.offer && ['offered', 'accepted'].includes(a.status)); },
    bid(reqId, providerId, b){
      const r = get('serviceRequests', reqId);
      const a = db.assignments.find(x => x.reqId === reqId && x.providerId === providerId && x.status === 'offered' && x.bidding);
      if (!r || !a || !r.bidding || !['received', 'searching', 'sent'].includes(r.status)) return { ok: false, msg: 'الطلب ده مش متاح للعروض دلوقتي' };
      if (selfDeal(get('providers', providerId), r)) return { ok: false, msg: 'مينفعش تبعت عرض على طلب من رقمك' };
      const kind = b && b.kind === 'inspection' ? 'inspection' : 'quote';
      let labor = 0, parts = 0, fee = 0, base;
      if (kind === 'inspection') {
        fee = Math.round(+b.fee || 0); const cap = api.inspectionCap(r.cat);
        if (!(fee > 0)) return { ok: false, msg: 'اكتب سعر المعاينة' };
        if (cap && fee > cap) return { ok: false, msg: 'سعر المعاينة أعلى من الحد المسموح (' + cap + ' ج.م)' };
        base = fee;
      } else {
        labor = Math.max(0, Math.round(+b.labor || 0)); parts = Math.max(0, Math.round(+b.parts || 0)); base = labor + parts;
        if (!(labor > 0)) return { ok: false, msg: 'اكتب سعر المصنعية' };
        const cap = api.priceCap(r);
        if (cap && base > cap) return { ok: false, msg: 'السعر أعلى من الحد المسموح للمشكلة دي (' + cap + ' ج.م) — لو محتاج تشوف الأول اختار «محتاج معاينة»' };
      }
      const q = api.customerTotalFor(base, providerId, kind), k = q.customerPrice / base;
      const note = String((b && b.note) || '').trim().slice(0, 300), eta = String((b && b.eta) || '').trim().slice(0, 40);
      const first = !a.bid;
      a.bid = { kind, labor, parts, fee, base, rate: q.rate, note, eta, at: now() };
      /* what the customer sees: totals with the platform share included, never the provider's base */
      a.offer = { kind, total: q.customerPrice, labor: kind === 'quote' ? Math.round(labor * k) : 0, parts: kind === 'quote' ? q.customerPrice - Math.round(labor * k) : 0, note, eta, at: a.bid.at };
      if (first) notify('customer:' + r.customerId, 'وصلك عرض جديد على طلبك ' + r.no + ' — قارن واختار', r.id);
      save(); return { ok: true, offer: a.offer };
    },
    chooseBid(reqId, providerId){
      const r = get('serviceRequests', reqId);
      const a = db.assignments.find(x => x.reqId === reqId && x.providerId === providerId && x.status === 'offered' && x.bidding && x.bid);
      if (!r || !a || !r.bidding || !['received', 'searching', 'sent'].includes(r.status)) return { ok: false, msg: 'العرض ده مش متاح' };
      db.assignments.filter(x => x.reqId === reqId && x !== a && x.status === 'offered').forEach(x => { x.status = 'withdrawn'; notify('provider:' + x.providerId, 'العميل اختار عرض تاني على الطلب ' + r.no, r.id); });
      a.status = 'accepted';
      r.pin = String(1000 + Math.floor(Math.random() * 9000));
      const q = quoteFor(a.bid.base, a.bid.rate);
      if (a.bid.kind === 'quote') { r.pricing = q; r.agreedValue = q.customerPrice; }
      else { r.inspection = { fee: a.bid.base, customerFee: q.customerPrice, rate: a.bid.rate }; r.agreedValue = q.customerPrice; }
      r.bidding.chosen = a.providerId; r.bidding.kind = a.bid.kind;
      const p = get('providers', a.providerId);
      log(r, 'accepted', 'العميل اختار عرض ' + (p ? p.name : '') + (a.bid.kind === 'inspection' ? ' (معاينة)' : ''));
      notify('provider:' + a.providerId, 'العميل اختار عرضك على الطلب ' + r.no + ' — اتفق معاه على الموعد', r.id);
      save(); return { ok: true };
    },
    declineBid(reqId, providerId, reason){
      const r = get('serviceRequests', reqId);
      const a = db.assignments.find(x => x.reqId === reqId && x.providerId === providerId && x.status === 'offered' && x.bidding);
      if (!r || !a) return false;
      a.status = 'rejected'; a.reason = reason || '';
      if (!db.assignments.some(x => x.reqId === reqId && x.status === 'offered')) api.openBidding(r, 1);   /* keep the request moving */
      save(); return true;
    },
    /** after an inspection the customer declined the repair: the visit fee is the job (fixed-price completion) */
    inspectionOnly(reqId){
      const r = get('serviceRequests', reqId); if (!r) return false;
      const q = api.currentQuote(reqId); if (q && ['pending', 'approved'].includes(q.status)) return false;
      if (r.inspection && !r.inspection.waived) { r.pricing = quoteFor(r.inspection.fee, r.inspection.rate); r.inspection.only = true; }
      else if (!r.inspection && q && q.status === 'rejected' && +db.settings.visitFee > 0) { r.pricing = quoteFor(+db.settings.visitFee, api.inspectionRate()); r.visitOnly = true; }   /* the customer refused the new price */
      else return false;
      r.agreedValue = r.pricing.customerPrice;
      return api.complete(reqId);
    },
    /* ═════════ round 11: provider bonus — tiers (priority in offers + lower platform share) and a weekly cash target ═════════
       All numbers come from the admin (settings.bonus); off until switched on. A job counts only when the CUSTOMER confirmed
       the cash and nothing is disputed; tiers and the weekly target count DISTINCT customers (no farming with one friend).
       The rolling record lives on the provider document (p.recent / p.strikes), so tiers cost no extra reads on the server. */
    bonusCfg(){ const b = db.settings && db.settings.bonus; return b && b.on ? b : null; },
    /** the provider's tier now (null = base). Tiers are ordered; the highest one whose rules pass wins. */
    tierOf(pid){
      const b = api.bonusCfg(), p = get('providers', pid); if (!b || !p || !Array.isArray(b.tiers)) return null;
      const st = api.bonusStats(pid); let best = null;
      b.tiers.forEach((t, i) => {
        const okJobs = st.jobs >= (+t.minJobs || 0), okRating = !(+t.minRating) || (st.rating != null && st.rating >= +t.minRating), okStrikes = st.strikes <= (t.maxStrikes == null || t.maxStrikes === '' ? 99 : +t.maxStrikes);
        if (okJobs && okRating && okStrikes) best = { ...t, rank: i + 1 };
      });
      return best;
    },
    /** rolling counters for the bonus window and the current Cairo week */
    bonusStats(pid){
      const b = db.settings.bonus || {}, p = get('providers', pid) || {}, since = Date.now() - (+b.windowDays || 30) * 864e5, week = api.cairoWeek();
      const inWin = (p.recent || []).filter(x => Date.parse(x.at) >= since);
      const inWeek = (p.recent || []).filter(x => api.cairoWeek(x.at) === week);
      return { jobs: new Set(inWin.map(x => x.c)).size, weekJobs: new Set(inWeek.map(x => x.c)).size, rating: rating(pid),
        strikes: (p.strikes || []).filter(x => Date.parse(x.at) >= since).length, week, paidWeek: p.bonusWeek === week };
    },
    /** platform share for this provider: the tier lowers it (never below zero) */
    rateCut(pid){ const t = api.tierOf(pid); return t ? Math.max(0, +t.rateOff || 0) : 0; },
    cairoWeek(at){   /* ISO-like week key in Cairo time: yyyy-Www (weeks start Saturday, the Egyptian work week) */
      let d; try { d = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(at ? new Date(at) : new Date()) + 'T00:00:00Z'); } catch { d = new Date(at || Date.now()); }
      const sat = new Date(d); sat.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7));
      return sat.toISOString().slice(0, 10);
    },
    /** a confirmed, undisputed job: record it, refresh the tier, pay the weekly target once */
    bonusCount(r){
      const p = api.providerOf(r.id); if (!p || !api.bonusCfg()) return;
      p.recent = (p.recent || []).filter(x => x.r !== r.id && Date.parse(x.at) > Date.now() - 120 * 864e5).slice(-300);
      p.recent.push({ r: r.id, c: r.customerId, at: now() });
      api.bonusSettle(p);
    },
    bonusStrike(r){
      const p = api.providerOf(r.id); if (!p) return;
      p.strikes = (p.strikes || []).filter(x => Date.parse(x.at) > Date.now() - 120 * 864e5); p.strikes.push({ r: r.id, at: now() });
      p.recent = (p.recent || []).filter(x => x.r !== r.id);   /* a disputed job never counts */
      api.bonusSettle(p);
    },
    bonusSettle(p){
      const b = api.bonusCfg(); if (!b) return;
      const before = p.tier || '', t = api.tierOf(p.id);
      p.tier = t ? t.id || t.name : '';
      if (p.tier !== before && t) notify('provider:' + p.id, 'مبروك — وصلت لمستوى «' + t.name + '»' + (+t.rateOff ? ' ونسبة المنصة على عروضك بقت أقل ' + t.rateOff + '٪' : '') + ' وطلباتك هتوصلك الأول', '');
      const w = b.weekly || {}, st = api.bonusStats(p.id);
      if (w.on && +w.target > 0 && +w.amount > 0 && !st.paidWeek && st.weekJobs >= +w.target) {
        p.bonusWeek = st.week;
        db.transactions.push({ id: uid('t'), reqId: '', providerId: p.id, customerId: '', cat: '', value: 0, rate: 0, commission: 0, deductions: 0, net: +w.amount, kind: 'bonus', week: st.week, model: db.settings.collectionModel, collection: 'pending', demo: true, at: now() });
        notify('provider:' + p.id, 'برافو! خلّصت ' + w.target + ' خدمات الأسبوع ده — ليك بونص ' + w.amount + ' ج.م', '');
        notify('admin', 'بونص أسبوعي ' + w.amount + ' ج.م للفني ' + p.name, '');
      }
    },
    /** what the customer will see for a provider's base price (used by the server and by the provider's live preview) */
    customerTotalFor(base, pid, kind){
      const rate = kind === 'inspection' ? api.inspectionRate() : Math.max(0, markupRate() - api.rateCut(pid));
      return quoteFor(+base || 0, rate);
    },
    /* ═════════ round 10: the owner's rules — wider search, visit fee, cancel fee, warranty payer, cash confirmation ═════════ */
    inspectionRate(){ const v = db.settings.inspectionRate; return v != null && v !== '' ? Math.max(0, +v) : 0; },   /* platform share on a visit fee (default none) */
    cancelFee(){ const v = db.settings.cancelFee; return v != null && v !== '' ? Math.max(0, Math.round(+v)) : 50; },
    /** window over and nobody answered: invite up to 3 more providers of the same specialty from other governorates, tell the admin */
    widenBidding(reqId){
      const r = get('serviceRequests', reqId);
      if (!r || !r.bidding || r.bidding.widened || api.providerOf(reqId) || !['received', 'searching', 'sent'].includes(r.status)) return false;
      if (Date.parse(r.bidding.until) > Date.now() || api.offersFor(reqId).length) return false;
      const invited = new Set(db.assignments.filter(a => a.reqId === r.id).map(a => a.providerId));
      const pick = db.providers.filter(p => p.status === 'approved' && p.available && (p.cats || []).includes(r.cat) && !invited.has(p.id) && !selfDeal(p, r))
        .sort((x, y) => (rating(y.id) || 0) - (rating(x.id) || 0)).slice(0, 3);
      for (const p of pick) {
        db.assignments.push({ id: uid('a'), reqId: r.id, providerId: p.id, status: 'offered', reason: '', at: now(), bidding: true, wide: true });
        notify('provider:' + p.id, 'طلب ' + r.no + ' في ' + (r.area || r.gov || 'منطقة قريبة') + ' — مفيش فني قريب، ابعت عرضك لو تقدر توصل', r.id);
      }
      r.bidding.widened = true; r.bidding.until = new Date(Date.now() + (+db.settings.bidWindowMin || 15) * 60000).toISOString();
      notify('admin', 'مفيش عروض على الطلب ' + r.no + ' — البحث اتوسّع لـ ' + pick.length + ' فني من مناطق تانية', r.id);
      save(); return true;
    },
    /** Offers-round clock (run on load, on a timer and by the server every 5 minutes): when a window ends —
        offers waiting → the customer is told once to choose (the round stays open until they do);
        no offers, not widened yet → widen the search (widenBidding);
        no offers after the widened window → the round closes, the request goes back to the normal search and the admin
        sees it in «مهام اليوم». Returns the ids that changed. */
    /** «الأنسب»: lowest price weighted by rating (5★ counts as is; lower ratings make the price «feel» higher) */
    bestOffer(reqId){
      const list = api.offersFor(reqId).filter(a => a.status === 'offered' && a.offer && a.bidding);
      const score = a => a.offer.total * (1.3 - 0.06 * (rating(a.providerId) || 4));
      return list.slice().sort((x, y) => score(x) - score(y))[0] || null;
    },
    /** Learned price library: provider amounts of completed jobs per problem / item (no personal data). O(1) update:
        running count / sum / min / max + the last 15 amounts for a robust range (25th–75th percentile). */
    learnPrice(key, amount){
      if (!key || !(+amount > 0)) return;
      const lib = db.settings.priceLib = db.settings.priceLib || {};
      const s = lib[key] = lib[key] || { n: 0, sum: 0, min: null, max: null, recent: [] };
      const v = Math.round(+amount);
      s.n++; s.sum += v; s.min = s.min == null ? v : Math.min(s.min, v); s.max = s.max == null ? v : Math.max(s.max, v);
      s.recent.push(v); if (s.recent.length > 15) s.recent.shift();
      const keys = Object.keys(lib); if (keys.length > 400) delete lib[keys[0]];   /* bounded document */
    },
    priceRange(key){
      const s = key && (db.settings.priceLib || {})[key]; if (!s || !s.n) return null;
      const r = s.recent.slice().sort((a, b) => a - b), at = q => r[Math.min(r.length - 1, Math.max(0, Math.round(q * (r.length - 1))))];
      return { n: s.n, low: at(.25), high: at(.75), median: at(.5), avg: Math.round(s.sum / s.n), min: s.min, max: s.max };
    },
    /** Raises the time-based ops alerts from the current records (called by the server clock every 5 min and by the local Admin app):
        requests without a provider > 30 min (critical after 2 h), providers waiting for review > 24 h, commissions uncollected > 7 days. */
    opsScan(at){
      const nowMs = at || Date.now(), min = (iso) => (nowMs - (Date.parse(iso) || nowMs)) / 60000;
      let n = 0;
      for (const r of db.serviceRequests) {
        if (!['received', 'searching'].includes(r.status) || api.providerOf(r.id)) continue;
        const age = min(r.createdAt); if (age < 30) continue;
        raiseAlert({ team:'ops', severity: age >= 120 ? 'critical' : 'normal', kind:'request.unassigned', title:'طلب من غير مقدم خدمة', body:'الطلب ' + (r.no || r.id) + ' من ' + Math.round(age) + ' دقيقة من غير مقدم خدمة', link:'#/orders', dedupeKey:'req-unassigned:' + r.id }); n++;
      }
      const pend = db.providers.filter(p => p.status === 'pending' && min(p.createdAt) >= 1440);
      if (pend.length) { raiseAlert({ team:'ops', severity:'normal', kind:'provider.pending', title:'طلبات انضمام مستنية مراجعة', body: pend.length + ' مقدم خدمة مستني المراجعة من أكتر من يوم', link:'#/providers', dedupeKey:'providers-pending' }); n++; }
      const due = db.transactions.filter(t => !t.free && t.collection === 'pending' && min(t.at) >= 7 * 1440);
      if (due.length) { raiseAlert({ team:'finance', severity:'normal', kind:'collection.overdue', title:'عمولات متأخرة التحصيل', body: due.length + ' عمولة لسه ما اتحصّلتش من أكتر من ٧ أيام', link:'#/settlements', dedupeKey:'collection-overdue' }); n++; }
      return n;
    },
    raiseAlert,
    tickBidding(at){
      const nowMs = at || Date.now(), changed = [];
      for (const r of db.serviceRequests) {
        const b = r.bidding;
        if (!b || b.closed || api.providerOf(r.id) || !['received', 'searching', 'sent'].includes(r.status)) continue;
        if (!(Date.parse(b.until) <= nowMs)) continue;
        const offers = api.offersFor(r.id).filter(a => a.status === 'offered' && a.offer).length;
        if (offers) {
          const autoMin = +db.settings.autoPickMin || 0;
          if (!b.readyNotified) { b.readyNotified = true; b.readyAt = new Date(nowMs).toISOString(); notify('customer:' + r.customerId, 'وقت العروض خلص — عندك ' + offers + ' عرض على طلبك ' + r.no + '، اختار الأنسب' + (autoMin ? ' (لو ما اخترتش خلال ' + autoMin + ' دقيقة هنختارلك الأنسب)' : ''), r.id); changed.push(r.id); }
          else if (autoMin > 0 && nowMs - Date.parse(b.readyAt || b.until) >= autoMin * 60000) {
            /* auto-pick: the same «الأنسب» score the customer sees (price weighted by rating, apps/customer/pages/offers.js) */
            const best = api.bestOffer(r.id);
            if (best && api.chooseBid(r.id, best.providerId).ok) {
              r.bidding.autoPicked = true;
              const p = get('providers', best.providerId);
              notify('customer:' + r.customerId, 'اخترنالك أنسب عرض على طلبك ' + r.no + (p ? ' — ' + p.name : '') + ' بـ ' + best.offer.total + ' ج.م', r.id);
              changed.push(r.id);
            }
          }
        } else if (!b.widened) {
          if (api.widenBidding(r.id)) changed.push(r.id);
        } else {
          b.closed = true; b.closedAt = new Date(nowMs).toISOString();
          db.assignments.forEach(a => { if (a.reqId === r.id && a.status === 'offered' && a.bidding) a.status = 'withdrawn'; });
          r.status = 'searching';
          notify('customer:' + r.customerId, 'مفيش فنيين قدروا يردّوا على طلبك ' + r.no + ' — فريقنا هيدوّرلك على فني بنفسه', r.id);
          notify('admin', 'جولة العروض على الطلب ' + r.no + ' خلصت من غير عروض — محتاج إسناد يدوي', r.id);
          raiseAlert({ team:'ops', severity:'normal', kind:'bidding.empty', title:'جولة العروض خلصت من غير عروض', body:'الطلب ' + r.no + ' محتاج إسناد يدوي لمقدم خدمة', link:'#/orders', dedupeKey:'bidding-empty:' + r.id });
          changed.push(r.id);
        }
      }
      if (changed.length) save();
      return changed;
    },
    /** cash after completion: each side says whether the money changed hands; a mismatch opens a complaint for the admin */
    cashConfirm(reqId, side, paid){
      const r = get('serviceRequests', reqId);
      if (!r || !['completed', 'closed'].includes(r.status) || !['customer', 'provider'].includes(side) || +r.finalValue === 0) return false;
      r.cash = r.cash || {};
      if (r.cash[side] != null) return false;   /* security (round 2): one answer per side — no flipping after the bonus counted */
      r.cash[side] = !!paid; r.cash[side + 'At'] = now();
      const t = db.transactions.find(x => x.reqId === reqId);
      if (r.cash.customer === true && r.cash.provider === true && t) t.collection = 'collected';
      if (side === 'customer' && paid && !r.cash.disputed && !r.cash.counted) { r.cash.counted = true; api.bonusCount(r); }
      if (r.cash.customer != null && r.cash.provider != null && r.cash.customer !== r.cash.provider && !r.cash.disputed) {
        r.cash.disputed = true; api.bonusStrike(r);
        api.complain(reqId, 'system', 'خلاف على الدفع: العميل ' + (r.cash.customer ? 'بيقول إنه دفع' : 'بيقول إنه مدفعش') + ' والفني ' + (r.cash.provider ? 'بيقول إنه استلم' : 'بيقول إنه ما استلمش'), { kind: 'payment' });
      }
      save(); return true;
    },
    /** off-platform deals: the admin warns; the second warning suspends the provider */
    warnProvider(pid, reason){
      const p = get('providers', pid); if (!p) return false;
      p.warnings = (+p.warnings || 0) + 1; p.lastWarning = { reason: String(reason || '').slice(0, 200), at: now() };
      if (p.warnings >= 2) p.status = 'suspended';
      notify('provider:' + pid, p.warnings >= 2 ? 'تم إيقاف حسابك بعد إنذار تاني — كلّم الإدارة' : 'إنذار من الإدارة: ' + (p.lastWarning.reason || 'الاتفاق مع العملاء بره المنصة ممنوع'), '');
      save(); return true;
    },
    /** a warranty job done by someone else: the substitute is paid the original labor, charged to the original provider */
    settleWarranty(r, doer){
      const old = r.warrantyOf && get('serviceRequests', r.warrantyOf); if (!old || !r.warrantyPayer || r.warrantyPayer === doer) return;
      const a = db.assignments.find(x => x.reqId === old.id && x.status === 'accepted');
      const q = old.quoteId && db.quotes.find(x => x.id === old.quoteId && x.status === 'approved');
      const t = db.transactions.find(x => x.reqId === old.id && !x.kind);
      const amt = Math.round((a && a.bid && a.bid.labor) || (q && q.labor) || (t && t.net) || 0);
      if (!(amt > 0)) { notify('admin', 'طلب ضمان ' + r.no + ' اتنفذ بفني بديل — حدد مستحقاته يدويًا', r.id); return; }
      const base = { reqId: r.id, customerId: r.customerId, cat: r.cat, rate: 0, commission: 0, deductions: 0, model: db.settings.collectionModel, collection: 'pending', demo: true, at: now() };
      db.transactions.push({ id: uid('t'), ...base, providerId: doer, value: 0, net: amt, kind: 'warranty-payout' });
      db.transactions.push({ id: uid('t'), ...base, providerId: r.warrantyPayer, value: 0, net: -amt, kind: 'warranty-charge' });
      notify('provider:' + r.warrantyPayer, 'اتخصم ' + amt + ' ج.م من مستحقاتك — فني تاني نفّذ ضمان الطلب ' + old.no, r.id);
      notify('provider:' + doer, 'هتاخد ' + amt + ' ج.م على ضمان الطلب ' + r.no + ' (على حساب الفني الأصلي)', r.id);
    },
    /* ═════════ round 8: trust features — arrival code, warranty, tips, read receipts, «بيتي», before/after photos ═════════ */
    /** Warranty days for a request: per item, then per category, then the default — all set by the admin (settings.warranty). */
    warrantyDays(r){
      const w = (db.settings && db.settings.warranty) || {};
      if ((r.inspection && r.inspection.only) || r.visitOnly) return 0;                /* a visit without the repair carries no warranty */
      if (!db.settings || !db.settings.warranty) return 30;                /* default: a month (the admin can change it) */
      const pick = [w.items && w.items[r.itemId], w.cats && w.cats[r.cat], w.default].find(x => x != null && x !== '');
      return Math.max(0, Math.min(365, Math.round(+pick || 0)));
    },
    /** «المشكلة رجعت» within the warranty: a linked request sent straight to the same provider (free-service path «ضمان»). */
    warrantyClaim(oldId, desc){
      const old = get('serviceRequests', oldId), p = api.providerOf(oldId);
      if (!old || !p || !['completed', 'closed'].includes(old.status)) return { ok: false, msg: 'الضمان متاح بعد ما الخدمة تخلص' };
      if (!old.warrantyUntil || Date.parse(old.warrantyUntil) < Date.now()) return { ok: false, msg: 'فترة الضمان انتهت' };
      const open = old.warrantyClaimId && get('serviceRequests', old.warrantyClaimId);
      if (open && !FINAL_STATUSES.has(open.status)) return { ok: false, msg: 'فيه طلب ضمان مفتوح بالفعل' };
      const r = api.repeatRequest(oldId, p.id);
      if (!r) return { ok: false, msg: 'تعذّر فتح طلب الضمان' };
      r.warrantyOf = oldId; r.serviceName = 'ضمان: ' + old.serviceName;
      r.freeService = { status: 'accepted', reason: 'warranty', by: 'system', at: now() };   /* labor warranty: nothing to pay */
      r.desc = String(desc || '').trim().slice(0, 1000) || 'المشكلة رجعت بعد الخدمة';
      old.warrantyClaimId = r.id;
      notify('admin', 'طلب ضمان ' + r.no + ' على الطلب ' + old.no, r.id);
      save(); return { ok: true, request: r };
    },
    /** Tip recorded at completion (paid in cash with the bill); goes entirely to the provider. */
    tip(reqId, amount){
      const r = get('serviceRequests', reqId), p = api.providerOf(reqId), a = Math.round(+amount);
      if (!r || !p || r.tip || !['completed', 'closed'].includes(r.status) || !(a >= 5 && a <= 1000)) return false;
      r.tip = { amount: a, at: now() };
      const t = db.transactions.find(x => x.reqId === reqId); if (t) t.tip = a;
      notify('provider:' + p.id, 'العميل هيديك بقشيش ' + a + ' ج.م مع الحساب — شكرًا على شغلك (الطلب ' + r.no + ')', r.id);
      save(); return true;
    },
    /** Read receipt: the side that opened the conversation saw everything until now. */
    chatSeen(reqId, role){
      const r = get('serviceRequests', reqId); if (!r || !['customer', 'provider'].includes(role)) return false;
      r.chatSeen = Object.assign({}, r.chatSeen, { [role]: now() }); save(); return true;
    },
    /* «بيتي»: the customer's appliances; a maintenance reminder date is set after each service of a device that needs one */
    devicesFor(cid){ const c = get('customers', cid); return (c && Array.isArray(c.devices)) ? c.devices : []; },
    addDevice(cid, d){
      const c = get('customers', cid); if (!c) return null;
      c.devices = Array.isArray(c.devices) ? c.devices : [];
      if (c.devices.length >= 20) return null;
      const it = typeof CAT !== 'undefined' && CAT.item ? CAT.item(d.item) : null;
      const x = { id: uid('dv'), item: String(d.item || ''), cat: it ? it.cat : String(d.cat || ''), name: it ? it.name : String(d.name || '').slice(0, 40), brand: String(d.brand || '').trim().slice(0, 40), year: /^\d{4}$/.test(String(d.year || '')) ? String(d.year) : '', lastAt: null, nextAt: null, at: now() };
      c.devices.push(x); save(); return x;
    },
    removeDevice(cid, id){ const c = get('customers', cid); if (!c || !Array.isArray(c.devices)) return false; const n = c.devices.length; c.devices = c.devices.filter(d => d.id !== id); save(); return c.devices.length !== n; },
    MAINTENANCE_DAYS,
    notifyAdmin(text, reqId){ notify('admin', text, reqId); },
    /** Before / after photos of a job (compressed data URLs, one document per request; the customer decides if they are shown in the provider's portfolio). */
    jobPhotosOf(reqId){ return (db.jobPhotos || []).find(x => x.reqId === reqId) || null; },
    setJobPhoto(reqId, kind, data){
      const r = get('serviceRequests', reqId), p = api.providerOf(reqId);
      if (!r || !p || !['before', 'after'].includes(kind) || !/^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(String(data || '')) || String(data).length > 180000) return false;
      db.jobPhotos = Array.isArray(db.jobPhotos) ? db.jobPhotos : [];
      let x = db.jobPhotos.find(j => j.reqId === reqId);
      if (!x) { x = { id: reqId, reqId, providerId: p.id, customerId: r.customerId, before: '', after: '', share: false, at: now() }; db.jobPhotos.unshift(x); }
      x[kind] = data; x.at = now();
      r.hasPhotos = { before: !!x.before, after: !!x.after, at: x.at };   /* tells the screens to fetch the photos (they are not in the sync) */
      if (db.jobPhotos.length > 40 && !firebaseMode()) db.jobPhotos.length = 40;      /* device storage guard in the local demo */
      if (kind === 'after') notify('customer:' + r.customerId, 'الفني رفع صور الشغل بعد ما خلص (الطلب ' + r.no + ')', r.id);
      save(); return true;
    },
    shareJobPhotos(reqId, on){ const x = api.jobPhotosOf(reqId); if (!x) return false; x.share = !!on; save(); return true; },
    portfolio(providerId){ return (db.jobPhotos || []).filter(x => x.providerId === providerId && x.share && x.before && x.after).slice(0, 6); },
    review(reqId, d){
      const r = get('serviceRequests',reqId), p = api.providerOf(reqId);
      if(!r||!p||db.reviews.some(x=>x.reqId===reqId)) return false;
      db.reviews.push({
        id:uid('v'), reqId, providerId:p.id, customerId:r.customerId,
        stars:d.stars, quality:d.quality, comment:d.comment||'',
        attachments: Array.isArray(d.attachments) ? d.attachments : [],
        at:now()
      });
      save(); return true;
    },
    complain(reqId, by, text, meta){
      db.complaints.unshift({
        id:uid('k'), reqId:reqId||'', by, text, status:'open', resolution:'', at:now(),
        kind:(meta&&meta.kind)||'', attachments:(meta&&meta.attachments)||[]
      });
      notify('admin','شكوى جديدة على الطلب '+(reqId||''), reqId);
      { const pay = /payment|cash/i.test(String((meta&&meta.kind)||''));
        raiseAlert({ team:'ops', severity: pay ? 'critical' : 'normal', kind: pay ? 'cash.dispute' : 'complaint.new', title: pay ? 'خلاف على الدفع' : 'شكوى جديدة',
          body: (pay ? 'خلاف بين العميل والفني على استلام الحساب' : 'شكوى مفتوحة محتاجة رد') + (reqId ? ' — الطلب ' + ((get('serviceRequests', reqId)||{}).no || reqId) : ''), link:'#/complaints', dedupeKey:'complaint:' + db.complaints[0].id }); }
      save();
      return db.complaints[0];
    },
    resolveComplaint(id,res){ const k = get('complaints',id); if(k){ k.status='resolved'; k.resolution=res||''; if (/^(customer|provider):/.test(String(k.by||''))) notify(k.by,'تم الرد على شكوتك'+(res?': '+String(res).slice(0,140):''),k.reqId||null); save(); } },
    /** Admin moderation: hide or re-publish a review (hidden reviews are kept for the record, excluded from ratings and public lists). */
    setReviewHidden(id, hidden, reason){ const v = get('reviews', id); if(!v) return false; v.hidden = !!hidden; v.moderation = { hidden: !!hidden, reason: String(reason||'').slice(0,200), at: now() }; save(); return true; },
    setCollection(txId, st){ const t = get('transactions',txId); if(t){ t.collection=st; save(); } },

    /* ═════════ مقدمو الخدمة ═════════ */
    registerProvider(d){
      const p = {id:uid('p'),...d,status:'pending',available:true,specialRate:null,demo:false,createdAt:now(),
        subs:d.subs||[], areas:d.areas||[], bio:d.bio||'', rating:null, jobs:0, avatar:'#FF3D8F'};
      db.providers.push(p);
      notify('admin','طلب تسجيل مقدم خدمة: '+p.name); save(); return p;
    },
    updateProvider(id, patch){ const p = get('providers',id); if(p){ Object.assign(p,patch); save(); } },
    setSetting(k,v){ db.settings[k]=v; save(); },
    setPrice(key,base){ db.settings.prices = db.settings.prices || {}; if(base===''||base==null) delete db.settings.prices[key]; else db.settings.prices[key]=+base; save(); },
    priceFor, markupRate, quoteFor,
    setCatRate(cat,v){ if(v===''||v==null) delete db.settings.rates[cat]; else db.settings.rates[cat]=+v; save(); },

    /* ═════════ الإشعارات ═════════ */
    notesFor(to){ return db.notifications.filter(n=>n.to===to); },
    unreadFor(to){ return db.notifications.filter(n=>n.to===to && !n.read).length; },
    markRead(to){ db.notifications.forEach(n=>{ if(n.to===to) n.read=true; }); save(); },

    /* ═════════ عناوين محفوظة (V7) ═════════
       address: {label, gov, area, addr, detail?, type:'home'|'work'|'other', default:boolean} */
    addressesFor(customerId){ return db.addresses.filter(a=>a.customerId===customerId); },
    addAddress(customerId, a){
      const addr = {
        id:uid('ad'), customerId, label:a.label||'', gov:a.gov||'', area:a.area||'',
        addr:a.addr||'', detail:a.detail||'', type:a.type||'home',
        default:!!a.default, at:now()
      };
      if (addr.default) db.addresses.forEach(x => { if (x.customerId===customerId) x.default=false; });
      db.addresses.push(addr); save(); return addr;
    },
    updateAddress(id, patch){
      const a = get('addresses',id); if(!a) return false;
      if (patch.default) db.addresses.forEach(x => { if (x.customerId===a.customerId) x.default=false; });
      Object.assign(a, patch, {at:now()}); save(); return a;
    },
    removeAddress(id){ db.addresses = db.addresses.filter(a=>a.id!==id); save(); },
    defaultAddress(customerId){ return db.addresses.find(a=>a.customerId===customerId && a.default) || null; },

    /* ═════════ مفضلة (V7) ═════════ */
    favoritesFor(customerId){ return db.favorites.filter(f=>f.customerId===customerId); },
    isFavorite(customerId, kind, refId){ return db.favorites.some(f=>f.customerId===customerId && f.kind===kind && f.refId===refId); },
    toggleFavorite(customerId, kind, refId){
      const i = db.favorites.findIndex(f=>f.customerId===customerId && f.kind===kind && f.refId===refId);
      if (i>=0) { db.favorites.splice(i,1); save(); return false; }
      db.favorites.push({id:uid('f'), customerId, kind, refId, at:now()}); save(); return true;
    },

    /* ═════════ مسودات النموذج (V7) ═════════ */
    saveDraft(customerId, data){ 
      let d = db.drafts.find(x=>x.customerId===customerId);
      if (!d) { d = {id:uid('dr'), customerId, step:0, data:{}, updatedAt:now()}; db.drafts.push(d); }
      d.step = data.step||0; d.data = data.data||{}; d.updatedAt = now();
      save(); return d;
    },
    getDraft(customerId){ return db.drafts.find(x=>x.customerId===customerId) || null; },
    clearDraft(customerId){ db.drafts = db.drafts.filter(x=>x.customerId!==customerId); save(); },

    /* ═════════ سجل البحث (V7) ═════════ */
    addSearch(customerId, q){
      if (!q) return;
      db.searchHistory = db.searchHistory.filter(x => !(x.customerId===customerId && x.q===q));
      db.searchHistory.unshift({id:uid('s'), customerId:customerId||'', q, at:now()});
      db.searchHistory = db.searchHistory.slice(0, 30);
      save();
    },
    recentSearches(customerId, n=6){
      return db.searchHistory.filter(x => !customerId || x.customerId===customerId).slice(0,n);
    },

    /* ═════════ إعادة طلب خدمة سابقة (V7) ═════════
       تُنشئ طلباً جديداً من نسخة معتمدة على طلب سابق، مع تحديث الموعد والتاريخ. */
    repeatRequest(oldId, preferProvider){
      const r = get('serviceRequests',oldId); if(!r) return null;
      const d = {
        cat:r.cat, serviceId:r.serviceId, serviceName:r.serviceName,
        catName:r.catName, itemId:r.itemId, itemName:r.itemName,
        problemId:r.problemId, problemName:r.problemName, unknownProblem:r.unknownProblem,
        answers:{...r.answers}, specialty:r.specialty, desc:r.desc,
        photos:[], attachments:[], video:'',
        gov:r.gov, area:r.area, addr:r.addr, geo:r.geo,
        when:'', whenNote:'', phone:r.phone, name:(get('customers',r.customerId)||{}).name||'',
        contactMethod:r.contactMethod, note:r.note, addressId:r.addressId,
        preferProvider: preferProvider || ''
      };
      return api.createRequest(d);
    },

    save
  };
  return api;
})();