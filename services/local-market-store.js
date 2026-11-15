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
      searchHistory:[],       /* عمليات بحث حديثة: {customerId, q, at} */
      serviceAreas:Object.keys(AREA_HINTS).map(g=>({gov:g,areas:AREA_HINTS[g],demo:true})),
      settings:{ defaultRate:15, rates:{}, collectionModel:'platform', autoAssign:true, customerFee:false }
    };
  };

  let db;
  const buildServices = () => { db.services = Object.entries(SERVICE_TYPES).flatMap(([cat,l])=>l.map((name,i)=>({id:cat+':'+i,cat,name}))); };

  /* ترحيل آمن من V1 إلى V2 (إن وُجدت بيانات قديمة) */
  const migrate = () => {
    if (!db.meta) db.meta = { lastReqNo:1000, created:now() };
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
  const notify = (to,text,reqId) => { db.notifications.unshift({id:uid('n'),to,text,reqId:reqId||null,at:now(),read:false}); };
  const log = (r,s,note) => { r.status = s; r.history.push({s,at:now(),note:note||''}); };
  const catName = c => (typeof DEVICES!=='undefined' && DEVICES[c]) ? DEVICES[c].name : c;

  /* ═════════ العمولة ═════════ */
  const rateFor = (cat, providerId) => {
    const p = providerId && get('providers',providerId);
    if (p && p.specialRate!=null && p.specialRate!=='') return +p.specialRate;
    const r = db.settings.rates[cat];
    return (r!=null && r!=='') ? +r : +db.settings.defaultRate;
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

  /* ═════════ الإسناد ═════════ */
  const candidates = r => {
    /* التوافق: 1) التخصص (cats)  2) تخصص الجهاز إن أمكن (subs)  3) المحافظة  4) التوفر */
    const subs = r.itemId || '';
    return db.providers.filter(p => {
        if (p.status !== 'approved' || !p.available) return false;
        if (!p.cats.includes(r.cat)) return false;
        if (!p.govs.includes(r.gov)) return false;
        /* إن كان للمزود subs محدد، نفضّل أن يتضمن subs الجهاز — وإلا فالتخصص العام كافٍ */
        return true;
      })
      .map(p => {
        let score = (rating(p.id) || 0) * 10 + acceptRate(p.id);
        if (subs && Array.isArray(p.subs) && p.subs.some(s => subs.startsWith(s))) score += 30;
        return { p, score };
      })
      .filter(x => !db.assignments.some(a => a.reqId===r.id && a.providerId===x.p.id && a.status==='rejected'))
      .sort((a,b) => b.score - a.score)
      .map(x => x.p);
  };
  const rating = pid => { const rs = db.reviews.filter(x=>x.providerId===pid); return rs.length ? Math.round(rs.reduce((s,x)=>s+x.stars,0)/rs.length*10)/10 : null; };
  const acceptRate = pid => { const as = db.assignments.filter(a=>a.providerId===pid && a.status!=='offered' && a.status!=='withdrawn'); return as.length ? Math.round(as.filter(a=>a.status!=='rejected').length/as.length*100) : 100; };

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
        status:'received', history:[], proposal:null, finalValue:null,
        quoteId:'', demo:true, createdAt:now()
      };
      const pr = priceFor(r.itemId) || priceFor(r.serviceId);
      if (pr) { r.pricing = pr; r.agreedValue = pr.customerPrice; }   /* upfront price shown to the customer and fixed on the request */
      log(r,'received'); log(r,'searching');
      db.serviceRequests.unshift(r);
      notify('admin','طلب جديد '+r.no+' — '+r.serviceName, r.id);
      if (db.settings.autoAssign) api.assign(r.id);
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
      if(accept){
        a.status='accepted';
        log(r,'accepted','قبل '+get('providers',a.providerId).name);
        notify('customer:'+r.customerId,'تم قبول طلبك '+r.no,r.id);
      }
      else {
        a.status='rejected'; a.reason=reason||'';
        log(r,'searching','رفض مقدم الخدمة: '+(reason||'بدون سبب'));
        notify('admin','رُفض الطلب '+r.no+' — '+(reason||''),r.id);
        if (db.settings.autoAssign) api.assign(reqId);
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
      if (r.pricing) { const nq = quoteFor(total, r.pricing.rate); quote.providerAmount = nq.providerAmount; quote.customerTotal = nq.customerPrice; quote.platformFee = nq.platformFee; }
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
      if (r.pricing) { r.pricing = quoteFor(q.total, r.pricing.rate); r.agreedValue = r.pricing.customerPrice; }   /* adjusted upfront price */
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
        r.finalValue = x.value;
        log(r,'completed','السعر المحدد مسبقًا '+x.value);
        if (!db.transactions.some(t => t.reqId===reqId)) db.transactions.push({id:uid('t'),reqId,providerId:p.id,customerId:r.customerId,cat:r.cat,...x,model:db.settings.collectionModel,collection:'pending',demo:true,at:now()});
        notify('customer:'+r.customerId,'اكتملت الخدمة — أكّد الإتمام وقيّم الفني (الطلب '+r.no+')',r.id);
        save(); return true;
      }
      if (q && q.status === 'approved') {
        /* السعر المتفق عليه هو القيمة النهائية؛ لا يُقبل مبلغ مختلف */
        if (value !== undefined && value !== null && value !== '' && v !== +q.total) return false;
        v = +q.total;
      } else if (!Number.isFinite(v) || v <= 0) return false;
      const rate = rateFor(r.cat, p.id), x = calc(v, rate, deductions);
      r.finalValue = x.value;
      log(r,'completed','القيمة النهائية '+x.value);
      if (!db.transactions.some(t => t.reqId===reqId)) {
        db.transactions.push({id:uid('t'),reqId,providerId:p.id,customerId:r.customerId,cat:r.cat,...x,model:db.settings.collectionModel,collection:'pending',demo:true,at:now()});
      }
      notify('customer:'+r.customerId,'اكتملت الخدمة — أكّد الإتمام وقيّم الفني (الطلب '+r.no+')',r.id);
      save(); return true;
    },

    close(reqId){
      const r = get('serviceRequests',reqId);
      if(!r || r.status!=='completed') return false;
      log(r,'closed','أكّد العميل الإتمام'); save(); return true;
    },

    cancel(reqId, reason){
      const r = get('serviceRequests',reqId);
      if(!r || FINAL_STATUSES.has(r.status)) return false;
      const idx = FLOW.findIndex(f=>f[0]===r.status);
      if (idx >= FLOW.findIndex(f=>f[0]==='started')) return false;
      const a = api.activeAssignment(reqId);
      if(a){ a.status='withdrawn'; notify('provider:'+a.providerId,'ألغى العميل الطلب '+r.no,r.id); }
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
      save();
      return db.complaints[0];
    },
    resolveComplaint(id,res){ const k = get('complaints',id); if(k){ k.status='resolved'; k.resolution=res||''; save(); } },
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
    repeatRequest(oldId){
      const r = get('serviceRequests',oldId); if(!r) return null;
      const d = {
        cat:r.cat, serviceId:r.serviceId, serviceName:r.serviceName,
        catName:r.catName, itemId:r.itemId, itemName:r.itemName,
        problemId:r.problemId, problemName:r.problemName, unknownProblem:r.unknownProblem,
        answers:{...r.answers}, specialty:r.specialty, desc:r.desc,
        photos:[], attachments:[], video:'',
        gov:r.gov, area:r.area, addr:r.addr, geo:r.geo,
        when:'', whenNote:'', phone:r.phone, name:(get('customers',r.customerId)||{}).name||'',
        contactMethod:r.contactMethod, note:r.note, addressId:r.addressId
      };
      return api.createRequest(d);
    },

    save
  };
  return api;
})();