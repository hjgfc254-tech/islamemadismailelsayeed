/* ═══════════════════════════════════════════════════════════════
   هنصلحلك — الكتالوج الهرمي (Catalog) — الإصدار 7
   ───────────────────────────────────────────────────────────────
   V7 — تعديلات جوهرية عن V6:
   1) إصلاح خلل V6 الذي كان يستبعد أسئلة العمل (scope/urgency/materials)
      من أقسام النجارة والدهانات والتنظيف لأن kind='fault' فقط ترث Q_SETS.fault.
   2) إضافة مجموعات أسئلة متخصصة لكل جهاز تقريباً (Q_BY_ITEM) بدل الاكتفاء
      بأسئلة القسم العامة. مثال: الغسالة تسأل "هل تسحب المياه؟" والتكييف
      يسأل "هل يبرد؟" — وليس نفس الأسئلة.
   3) إضافة أسئلة مخصصة لكل مشكلة (extraQuestions) لعدد من المشاكل الحساسة
      (تسريب، ماس كهربائي، رائحة غاز، تشقق، تسرب مياه، تكييف لا يبرد...).
   4) إضافة خدمات/مشاكل للسيارات والتنظيف والأجهزة لم تكن موجودة (مساحات،
      تنظيف ستائر، تنظيف مراتب، صيانة دورية للتكييف، إلخ).
   5) تعديل search() ليشمل المرادفات الأساسية عبر HS_SEARCH إن وُجد، دون كسر
      التوافق الخلفي (يعمل مستقلاً لو لم يُحمَّل search.js).
   6) الحفاظ على نفس واجهة API العامة: CAT.categories/items/problems/valid/
      breadcrumb/questionsFor/safetyFor/needsVisit/search/upsert/setActive/
      move/remove/reset/onChange — لا كسر خلفي.

   ملاحظات معمارية:
   • كل المعرّفات الإنجليزية (slug) ثابتة — الطلبات القديمة لا تتأثر.
   • الإضافات (مشاكل/أسئلة) لا تحذف شيئاً من V6 — فقط تُوسّع.
   • جميع الأسئلة قابلة للتجاوز إن لم تكن required؛ لا نُجبر العميل على تعطيل
     النموذج. الأسئلة التي نعتبرها ضرورية (المقاس/العدد) لها required:true
     فقط حيث تكون قيمة القسم كبيرة.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ═════════ مجموعات الأسئلة الأساسية (المستوى 4) ═════════
   كل مجموعة لها معرّف ثابت ووصف قصير. تُركّب حسب:
   - Q_SETS[category.kind] (أسئلة القسم)
   - Q_SETS[item.qset] (أسئلة الجهاز إن وُجدت)
   - Q_BY_ITEM[itemId] (أسئلة مخصصة للجهاز — الأولوية)
   - problem.extraQuestions (أسئلة المشكلة المحددة)  */

const Q_SET_FAULT = [
  {id:'since',   type:'select', label:'متى بدأت المشكلة؟', options:['النهاردة','من كام يوم','من أسبوع أو أكتر','من شهر أو أكتر']},
  {id:'pattern', type:'select', label:'هل العطل مستمر أم متقطع؟', options:['مستمر','بيجي ويروح']},
  {id:'sudden',  type:'select', label:'هل حدث العطل فجأة؟', options:['أيوه فجأة','تدريجيًا']},
  {id:'repaired',type:'select', label:'هل سبق إصلاحه؟', options:['لا','أيوه من قبل']}
];

const Q_SET_JOB = [
  {id:'scope',     type:'select', label:'حجم العمل', options:['صغير (قطعة أو نقطة)','متوسط (غرفة أو عدة نقاط)','كبير (شقة أو مشروع)']},
  {id:'materials', type:'select', label:'الخامات', options:['العميل يوفرها','الفني يوفرها','مش متأكد']},
  {id:'urgency',   type:'select', label:'مدى الاستعجال', options:['عاجل','خلال أيام','مرن']}
];

const Q_SET_PAINT = [
  {id:'area',      type:'number', label:'المساحة التقريبية (م²)', required:false},
  {id:'rooms',     type:'number', label:'عدد الغرف', required:false},
  {id:'state',     type:'select', label:'حالة الحوائط', options:['جديدة','عليها دهان قديم','فيها رطوبة أو شروخ']},
  {id:'materials', type:'select', label:'الدهانات', options:['العميل يوفرها','الفني يوفرها','مش متأكد']}
];

const Q_SET_CLEAN = [
  {id:'area',      type:'number', label:'المساحة التقريبية (م²)', required:false},
  {id:'rooms',     type:'number', label:'عدد الغرف أو القطع', required:false},
  {id:'floor',     type:'select', label:'هل يوجد مصعد؟', options:['أيوه','لا','دور أرضي']},
  {id:'urgency',   type:'select', label:'مدى الاستعجال', options:['عاجل','خلال أيام','مرن']}
];

const Q_SET_CAR = [
  {id:'make',    type:'input',  label:'ماركة السيارة وموديلها وسنة الصنع', required:true},
  {id:'running', type:'select', label:'هل السيارة تتحرك الآن؟', options:['أيوه','لا (متوقفة)','بتتحرك بصعوبة']},
  {id:'since',   type:'select', label:'متى بدأت المشكلة؟', options:['النهاردة','من كام يوم','من أسبوع أو أكتر']},
  {id:'carloc',  type:'select', label:'مكان السيارة', options:['في الجراج / أمام المنزل','على الطريق','في ورشة']}
];

const Q_SET_APPLIANCE = [
  {id:'brand', type:'input',  label:'الماركة / الموديل (اختياري)', required:false},
  {id:'age',   type:'select', label:'عمر الجهاز تقريبًا', options:['أقل من سنتين','2 – 5 سنين','أكتر من 5 سنين','مش عارف']}
];

/* ═════════ أسئلة مخصصة لكل جهاز/نوع عمل (Q_BY_ITEM) ═════════
   المفتاح = itemId بصيغة cat/slug (مثل appliances/washer-auto).
   كل الأسئلة هنا تُضاف فوق أسئلة القسم + أسئلة qset. */
const Q_BY_ITEM = {
  /* ── الأجهزة المنزلية ── */
  'appliances/fridge': [
    {id:'cool_ok',   type:'select', label:'هل التبريد ضعيف أم لا يعمل إطلاقًا؟', options:['تبريد ضعيف','لا يبرد نهائيًا','يعمل بشكل متقطع']},
    {id:'freezer',   type:'select', label:'هل الفريزر يعمل بشكل طبيعي؟', options:['أيوه','لا','بيجمّد زيادة']},
    {id:'leak',      type:'select', label:'هل يوجد ماء متجمع حول أو أسفل الثلاجة؟', options:['أيوه','لا']}
  ],
  'appliances/washer-auto': [
    {id:'power',     type:'select', label:'هل الغسالة تعمل أصلًا (تضيء أو تصدر صوت)؟', options:['أيوه','لا','أحيانًا']},
    {id:'intake',    type:'select', label:'هل تسحب المياه من الحنفية؟', options:['أيوه','لا','ببطء']},
    {id:'drain',     type:'select', label:'هل تصرف المياه؟', options:['أيوه','لا','ببطء']},
    {id:'spin',      type:'select', label:'هل تعصر بشكل طبيعي؟', options:['أيوه','لا','بصوت عالي']},
    {id:'leak',      type:'select', label:'هل يوجد تسريب مياه منها؟', options:['أيوه','لا']}
  ],
  'appliances/washer-semi': [
    {id:'motor',     type:'select', label:'هل موتور الغسيل يعمل؟', options:['أيوه','لا']},
    {id:'spin_motor',type:'select', label:'هل موتور العصر يعمل؟', options:['أيوه','لا']},
    {id:'leak',      type:'select', label:'هل يوجد تسريب مياه؟', options:['أيوه','لا']}
  ],
  'appliances/ac': [
    {id:'cool',      type:'select', label:'هل التكييف يبرد فعلًا؟', options:['يبرد جيدًا','يبرد ضعيف','لا يبرد']},
    {id:'water',     type:'select', label:'هل يوجد تسريب مياه من الوحدة الداخلية؟', options:['أيوه','لا']},
    {id:'noise',     type:'select', label:'هل يصدر صوت غير طبيعي؟', options:['لا','أيوه — صوت عالي','أيوه — طقطقة']},
    {id:'remote',    type:'select', label:'هل الريموت يستجيب؟', options:['أيوه','لا','أحيانًا']}
  ],
  'appliances/heater-electric': [
    {id:'heats',     type:'select', label:'هل الماء يسخن؟', options:['أيوه','لا','يسخن زيادة']},
    {id:'power_on',  type:'select', label:'هل لمبة البيان تضيء؟', options:['أيوه','لا']},
    {id:'trip',      type:'select', label:'هل يفصل القاطع عند تشغيله؟', options:['أيوه','لا']}
  ],
  'appliances/heater-gas': [
    {id:'ignite',    type:'select', label:'هل يشتعل الشعلة؟', options:['أيوه','لا','تشتعل وتنطفئ']},
    {id:'gas_smell', type:'select', label:'هل تشم رائحة غاز؟', options:['لا','أيوه — خفيفة','أيوه — قوية (خطر)']},
    {id:'flue',      type:'select', label:'هل المدخنة/العادم سليم؟', options:['أيوه','لا','مش عارف']}
  ],
  'appliances/dishwasher': [
    {id:'power',     type:'select', label:'هل تعمل وتضيء؟', options:['أيوه','لا']},
    {id:'clean',     type:'select', label:'هل تنظف الأطباق جيدًا؟', options:['أيوه','لا','بقع بيضاء']},
    {id:'leak',      type:'select', label:'هل يوجد تسريب؟', options:['أيوه','لا']}
  ],
  'appliances/deep-freezer': [
    {id:'cool',      type:'select', label:'هل يجمد بشكل طبيعي؟', options:['أيوه','لا','يتراكم ثلج']},
    {id:'noise',     type:'select', label:'هل يصدر صوت عالي؟', options:['لا','أيوه']}
  ],
  'appliances/microwave': [
    {id:'heats',     type:'select', label:'هل يسخّن الطعام؟', options:['أيوه','لا']},
    {id:'spark',     type:'select', label:'هل يظهر شرر بالداخل؟', options:['لا','أيوه']},
    {id:'plate',     type:'select', label:'هل القرص الدوّار يدور؟', options:['أيوه','لا']}
  ],
  'appliances/cooker': [
    {id:'burners',   type:'select', label:'أي شعلة لا تعمل؟', options:['كل الشعلات','بعض الشعلات','الفرن فقط']},
    {id:'gas_smell', type:'select', label:'هل تشم رائحة غاز؟', options:['لا','أيوه']},
    {id:'ignition',  type:'select', label:'هل الشاعل يعمل؟', options:['أيوه','لا']}
  ],
  'appliances/hood': [
    {id:'suction',   type:'select', label:'هل يوجد سحب هواء؟', options:['سحب جيد','سحب ضعيف','لا يوجد']},
    {id:'light',     type:'select', label:'هل الإضاءة تعمل؟', options:['أيوه','لا']}
  ],

  /* ── الكهرباء ── */
  'electric/wiring': [
    {id:'scope',     type:'select', label:'ما نوع العمل المطلوب؟', options:['تأسيس شقة جديدة','إضافة نقاط','تغيير أسلاك قديمة','إصلاح عطل محدد']},
    {id:'points',    type:'number', label:'عدد النقاط التقريبي', required:false}
  ],
  'electric/dist-board': [
    {id:'tripping',  type:'select', label:'هل القاطع يفصل؟', options:['أيوه باستمرار','أيوه عند تشغيل أحمال ثقيلة','لا']},
    {id:'sparks',    type:'select', label:'هل يوجد شرر أو سخونة في اللوحة؟', options:['لا','أيوه — خطر']},
    {id:'rcd',       type:'select', label:'هل يوجد قاطع تسريب (RCD)؟', options:['أيوه','لا','مش عارف']}
  ],
  'electric/switches': [
    {id:'count',     type:'number', label:'عدد المفاتيح/الفيش المعطلة', required:false},
    {id:'hot',       type:'select', label:'هل تسخن الفيشة أو المفتاح؟', options:['لا','أيوه — خطر']}
  ],
  'electric/lighting': [
    {id:'kind',      type:'select', label:'ما نوع الإضاءة المطلوبة؟', options:['لمبات عادية','سبوتات','نجفة','إضاءة LED']},
    {id:'count',     type:'number', label:'العدد التقريبي', required:false}
  ],
  'electric/fans': [
    {id:'kind',      type:'select', label:'ما المطلوب؟', options:['تركيب جديد','صيانة مروحة قائمة']},
    {id:'location',  type:'select', label:'مكان المروحة', options:['سقف','حائط','طاولة']}
  ],
  'electric/cables': [
    {id:'length',    type:'number', label:'الطول التقريبي بالأمتار', required:false},
    {id:'scope',     type:'select', label:'نوع العمل', options:['تمديد خط جديد','إصلاح سلك مقطوع','تأريض']}
  ],

  /* ── السباكة ── */
  'plumbing/faucets': [
    {id:'count',     type:'number', label:'عدد الحنفيات', required:false},
    {id:'problem',   type:'select', label:'طبيعة المشكلة', options:['تسريب','ضعف تدفق','مكسورة','تركيب جديد']}
  ],
  'plumbing/pipes': [
    {id:'leak_vis',  type:'select', label:'هل التسريب ظاهر أم داخل الحيطة؟', options:['ظاهر','داخل الحيطة','مش عارف']},
    {id:'water_cut', type:'select', label:'هل تستطيع غلق المحبس الرئيسي؟', options:['أيوه','لا']}
  ],
  'plumbing/sewage': [
    {id:'where',     type:'select', label:'أين تظهر المشكلة؟', options:['بلاعة الحمام','بلاعة المطبخ','الخط الرئيسي','أكثر من مكان']},
    {id:'overflow',  type:'select', label:'هل يوجد طفح؟', options:['لا','أيوه']}
  ],
  'plumbing/toilet': [
    {id:'issue',     type:'select', label:'طبيعة المشكلة', options:['انسداد','تسريب من القاعدة','مشكلة في الطرد','مشكلة في الخزان']},
    {id:'count',     type:'number', label:'عدد القواعد المتأثرة', required:false}
  ],

  /* ── النجارة ── */
  'carpentry/doors': [
    {id:'kind',      type:'select', label:'ما نوع العمل؟', options:['إصلاح','تركيب جديد','تغيير','تلميع']},
    {id:'count',     type:'number', label:'عدد الأبواب', required:false},
    {id:'wood',      type:'select', label:'نوع الباب', options:['خشب','ألومنيوم','UPVC','مش عارف']}
  ],
  'carpentry/kitchens': [
    {id:'kind',      type:'select', label:'ما نوع العمل؟', options:['تفصيل مطبخ جديد','إصلاح وحدات','تغيير مفصلات','تغيير سطح']},
    {id:'length',    type:'number', label:'الطول التقريبي للمطبخ (متر)', required:false}
  ],
  'carpentry/furniture': [
    {id:'kind',      type:'select', label:'ما نوع العمل؟', options:['إصلاح قطعة قائمة','تفصيل جديد','تلميع/دوكو']},
    {id:'piece',     type:'input',  label:'نوع القطعة (كنبة/سرير/ترابيزة...)', required:false}
  ],
  'carpentry/assemble': [
    {id:'kind',      type:'select', label:'ما المطلوب تركيبه؟', options:['غرفة نوم','مطبخ','مكتبة','أثاث جاهز','أخرى']},
    {id:'count',     type:'number', label:'عدد القطع', required:false}
  ],

  /* ── الدهانات ── */
  'painting/room': [
    {id:'size',      type:'select', label:'حجم الغرفة', options:['صغيرة','متوسطة','كبيرة']},
    {id:'include_ceiling', type:'select', label:'هل يشمل السقف؟', options:['أيوه','لا']},
    {id:'current_state',   type:'select', label:'حالة الدهان الحالي', options:['جيد','متقشر','فيه بقع رطوبة']}
  ],
  'painting/full-apartment': [
    {id:'rooms',     type:'number', label:'عدد الغرف', required:true},
    {id:'area',      type:'number', label:'المساحة الكلية (م²)', required:false},
    {id:'empty',     type:'select', label:'هل الشقة فاضية؟', options:['أيوه','لا — يوجد أثاث']}
  ],
  'painting/facades': [
    {id:'floors',    type:'number', label:'عدد الأدوار', required:false},
    {id:'scaffold',  type:'select', label:'هل يحتاج سقالات؟', options:['أيوه','لا','مش عارف']}
  ],
  'painting/damp': [
    {id:'where',     type:'select', label:'أين تظهر الرطوبة؟', options:['حوائط داخلية','جوار الحمام','تحت السطح','أخرى']},
    {id:'since',     type:'select', label:'منذ متى؟', options:['حديثة','من أشهر','من سنين']}
  ],
  'painting/cracks': [
    {id:'kind',      type:'select', label:'نوع الشروخ', options:['سطحية','عميقة','شعرية']},
    {id:'count',     type:'number', label:'عدد الشروخ التقريبي', required:false}
  ],

  /* ── السيارات ── */
  'cars/engine': [
    {id:'starts',    type:'select', label:'هل تدور السيارة؟', options:['أيوه','لا','بصعوبة']},
    {id:'noise',     type:'select', label:'هل يوجد صوت؟', options:['لا','صوت عالي','طقطقة','صفير']},
    {id:'smoke',     type:'select', label:'هل يوجد دخان من العادم؟', options:['لا','أبيض','أسود','أزرق']}
  ],
  'cars/brakes': [
    {id:'feel',      type:'select', label:'إحساس الدواسة', options:['طبيعي','رخوة','قاسية']},
    {id:'noise',     type:'select', label:'هل يوجد صرير؟', options:['لا','أيوه']},
    {id:'drive',     type:'select', label:'هل يمكن قيادتها بأمان الآن؟', options:['أيوه','لا']}
  ],
  'cars/battery': [
    {id:'start',     type:'select', label:'هل تدور السيارة؟', options:['أيوه','لا']},
    {id:'lights',    type:'select', label:'هل الأنوار تعمل؟', options:['أيوه','ضعيفة','لا']}
  ],
  'cars/car-ac': [
    {id:'cool',      type:'select', label:'هل التكييف يبرد؟', options:['يبرد','ضعيف','لا يبرد']},
    {id:'smell',     type:'select', label:'هل توجد رائحة؟', options:['لا','أيوه']}
  ],
  'cars/tires': [
    {id:'count',     type:'number', label:'عدد الإطارات المتأثرة', required:false},
    {id:'kind',      type:'select', label:'المشكلة', options:['بنشر','تغيير','ترصيص','تآكل']}
  ],
  'cars/towing': [
    {id:'location',  type:'input',  label:'مكان السيارة الآن', required:true},
    {id:'distance',  type:'number', label:'المسافة التقريبية (كم)', required:false}
  ],

  /* ── التنظيف ── */
  'cleaning/apartments': [
    {id:'size',      type:'select', label:'حجم الشقة', options:['استوديو','غرفتين','3 غرف','4+ غرف']},
    {id:'type',      type:'select', label:'نوع التنظيف', options:['تنظيف عادي','تنظيف عميق','قبل السكن','بعد الخروج']}
  ],
  'cleaning/villas': [
    {id:'floors',    type:'number', label:'عدد الأدوار', required:false},
    {id:'pool',      type:'select', label:'هل يشمل حمام السباحة؟', options:['أيوه','لا']}
  ],
  'cleaning/sofas': [
    {id:'count',     type:'number', label:'عدد الكنب/القطع', required:false},
    {id:'type',      type:'select', label:'نوع التنظيف', options:['تنظيف سطحي','غسيل عميق','إزالة بقع']}
  ],
  'cleaning/carpets': [
    {id:'count',     type:'number', label:'عدد السجاد', required:false},
    {id:'area',      type:'number', label:'المساحة التقريبية (م²)', required:false}
  ],
  'cleaning/mattresses': [
    {id:'count',     type:'number', label:'عدد المراتب', required:false},
    {id:'type',      type:'select', label:'المطلوب', options:['تنظيف','تعقيم','إزالة بقع']}
  ],
  'cleaning/post-finishing': [
    {id:'area',      type:'number', label:'المساحة الكلية (م²)', required:false},
    {id:'windows',   type:'select', label:'هل يشمل تنظيف الزجاج؟', options:['أيوه','لا']}
  ],
  'cleaning/tanks-clean': [
    {id:'count',     type:'number', label:'عدد الخزانات', required:false},
    {id:'where',     type:'select', label:'مكان الخزان', options:['سطح','أرضي','كلاهما']}
  ]
};

/* ═════════ أسئلة مخصصة لكل مشكلة (extraQuestions) — الأكثر شيوعًا/خطورة ═════════
   المفتاح = problemId كامل (itemId + '/' + slug). */
const Q_BY_PROBLEM = {
  /* أجهزة */
  'appliances/fridge/compressor':          [{id:'loud',    type:'select', label:'هل يصدر صوت عالي من الضاغط؟', options:['لا','أيوه','أحيانًا']}],
  'appliances/washer-auto/motor-failure':  [{id:'attempt', type:'select', label:'هل حاولت تشغيلها أكثر من مرة؟', options:['أيوه','لا']},
                                            {id:'error',   type:'input',  label:'هل يوجد كود خطأ على الشاشة؟', required:false}],
  'appliances/ac/no-cooling':              [{id:'gas_last', type:'select', label:'آخر مرة تم فيها تعبئة الفريون؟', options:['أقل من سنة','سنة-سنتين','أكثر','مش عارف']}],
  'appliances/heater-gas/gas-smell':       [{id:'valve',   type:'select', label:'هل أغلقت محبس الغاز؟', options:['أيوه','لا — أحتاج مساعدة عاجلة']}],
  /* كهرباء */
  'electric/dist-board/breaker-trips':     [{id:'circuit', type:'select', label:'أي دائرة تفصل؟', options:['الرئيسي','دائرة معينة','مش عارف']},
                                            {id:'load',    type:'select', label:'هل يحدث عند تشغيل جهاز معين؟', options:['أيوه','لا','أحيانًا']}],
  'electric/dist-board/sparks':            [{id:'smoke',   type:'select', label:'هل يوجد دخان؟', options:['لا','أيوه — خطر']}],
  'electric/switches/hot-plug':            [{id:'device',  type:'input',  label:'ما الجهاز الموصّل بالفيشة؟', required:false}],
  /* سباكة */
  'plumbing/pipes/leak':                   [{id:'location',type:'select', label:'مكان التسريب', options:['تحت الحوض','جوار السخان','داخل الحيطة','تحت الأرضية','أخرى']}],
  'plumbing/pipes/burst':                  [{id:'water_off',type:'select',label:'هل أغلقت المحبس الرئيسي؟', options:['أيوه','لا']}],
  'plumbing/sewage/overflow':              [{id:'since',   type:'select', label:'منذ متى؟', options:['من ساعات','من يوم','أكثر من يوم']}],
  'plumbing/tanks/float-valve':            [{id:'where',   type:'select', label:'مكان الخزان', options:['سطح','أرضي','كلاهما']}],
  /* دهانات */
  'painting/damp/wall-damp':               [{id:'location',type:'select', label:'مكان الرطوبة', options:['حمام','مطبخ','واجهة','تحت السطح','أخرى']}],
  'painting/cracks/deep-cracks':           [{id:'length',  type:'number', label:'طول الشرخ التقريبي (سم)', required:false}],
  /* سيارات */
  'cars/engine/wont-start':                [{id:'attempt', type:'select', label:'هل حاولت تشغيلها أكثر من مرة؟', options:['أيوه','لا']},
                                            {id:'lights',  type:'select', label:'هل الأنوار تعمل؟', options:['أيوه','ضعيفة','لا']}],
  'cars/brakes/weak-brake':                [{id:'drive',   type:'select', label:'هل يمكن قيادتها الآن؟', options:['أيوه بحذر','لا']}],
  /* تنظيف */
  'cleaning/sofas/stains':                 [{id:'kind',    type:'select', label:'نوع البقع', options:['طعام','قهوة','حبر','أخرى']}],
  'cleaning/post-finishing/dust':          [{id:'area',    type:'number', label:'المساحة (م²)', required:false}],
  /* صحة/أمان */
  'electric/dist-board/main-off':          [{id:'neighbors',type:'select',label:'هل الكهرباء قاطعة عند الجيران كمان؟', options:['أيوه','لا','مش عارف']}]
};

/* ═════════ تعريف مختصر: الأقسام ← العناصر ← المشكلات ═════════
   القواعد محفوظة من V6 (توافق خلفي كامل):
   • "المعرّف:الاسم" • ! = تنبيه أمان • الباقي كما هو.
   • قائمة المشكلات لكل جهاز/عمل مستقلة.
   • «مشكلة أخرى» تُضاف تلقائيًا. */
const DEF = {
 appliances:{ name:'الأجهزة المنزلية', icon:'plug', art:'appliances', kind:'fault', extra:'appliance', spec:'appliances',
  safety:['افصل الجهاز من الكهرباء قبل أي فحص.','لا تفتح الجهاز بنفسك وهو متصل بالكهرباء.'],
  items:[
   ['fridge','ثلاجة','appliances.fridge','no-cooling:الثلاجة لا تبرد;freezer-no-freeze:الفريزر لا يجمد;compressor:عطل في الموتور / الضاغط;leak:تسريب مياه;loud-noise:صوت مرتفع;ice-buildup:تراكم ثلج;dead:الثلاجة لا تعمل;thermostat:مشكلة في الثرموستات;control-board:مشكلة في لوحة التحكم'],
   ['washer-auto','غسالة أوتوماتيك','appliances.washer','motor-failure:عطل في الموتور;dead:الغسالة لا تعمل نهائيًا;no-water-intake:لا تسحب المياه;no-drain:لا تصرف المياه;no-spin:لا تعصر;leakage:تسريب مياه;unusual-noise:صوت أو اهتزاز غير طبيعي;door-issue:مشكلة في باب الغسالة;control-board:مشكلة في لوحة التحكم;heater:مشكلة في السخان'],
   ['washer-semi','غسالة عادية / نصف أوتوماتيك','appliances.washer','wash-motor:موتور الغسيل لا يدور;spin-motor:موتور العصر لا يدور;no-drain:لا تصرف المياه;leakage:تسريب مياه;timer:مشكلة في التايمر;belt:سير أو بكرة تالفة;shock:ماس كهربائي (بتكهرب)'],
   ['ac','تكييف','appliances.ac','no-cooling:لا يبرد;dead:لا يعمل;leakage:تسريب مياه;loud-noise:صوت مرتفع;weak-airflow:ضعف تدفق الهواء;compressor:مشكلة في الضاغط;remote:مشكلة في الريموت;service:يحتاج تنظيفًا وصيانة دورية;gas-refill:يحتاج تعبئة فريون'],
   ['heater-electric','سخان كهرباء','appliances.heater','no-heat:لا يسخن;overheat:المياه شديدة السخونة;leakage:تسريب مياه;trips-breaker:يفصل القاطع;thermostat:عطل في الثرموستات;element:سخان داخلي (مقاومة) تالف;no-pressure:ضعف تدفق المياه'],
   ['heater-gas','سخان غاز','appliances.heater','no-ignition:لا يشتعل;pilot-off:الفتيلة تنطفئ;gas-smell:ريحة غاز;!low-heat:المياه فاترة;leakage:تسريب مياه;noise:صوت غير طبيعي;flue:مشكلة في المدخنة / العادم'],
   ['dishwasher','غسالة أطباق','appliances.dishwasher','no-drain:لا تصرف المياه;no-clean:لا تنظف جيدًا;leakage:تسريب مياه;dead:لا تعمل;door-issue:مشكلة في الباب;dryer:لا تجفف;control-board:مشكلة في لوحة التحكم'],
   ['deep-freezer','ديب فريزر','appliances.fridge','no-freeze:لا يجمد;compressor:عطل في الضاغط;ice-buildup:تراكم ثلج;loud-noise:صوت مرتفع;dead:لا يعمل;gasket:جوان الباب تالف'],
   ['microwave','ميكروويف','appliances.small','no-heat:لا يسخن;dead:لا يعمل;sparks:شرر داخل الجهاز;plate:الطبق لا يدور;door-issue:الباب لا يغلق;buttons:الأزرار لا تستجيب'],
   ['cooker','بوتاجاز','appliances.cooker','burner:الشعلة لا تشتعل;oven:الفرن لا يسخن;!gas-smell:ريحة غاز;igniter:الشاعل (الولاعة) لا يعمل;thermostat:ثرموستات الفرن;door-issue:باب الفرن;knobs:مشكلة في المفاتيح'],
   ['hood','شفاط','appliances.small','weak-suction:ضعف السحب;loud-noise:صوت مرتفع;dead:لا يعمل;light:الإضاءة لا تعمل;filter:يحتاج تنظيف / تغيير فلتر'],
   ['other-appliance','أجهزة منزلية أخرى','appliances.other','']]},

 electric:{ name:'الكهرباء', icon:'bolt', art:'electric', kind:'fault', extra:null, spec:'electric',
  safety:['لا تلمس أي سلك مكشوف.','لا تقف على أرضية مبلولة قرب لوحة القواطع.','لو في دخان أو ريحة حريق: اخرج واتصل بالإطفاء (180).'],
  items:[
   ['wiring','تأسيس كهرباء','electric.wiring','new-install:تأسيس شقة جديدة;extend:إضافة نقاط جديدة;rewire:تغيير أسلاك قديمة;short:ماس كهربائي;hidden-fault:عطل مجهول في الدائرة'],
   ['dist-board','لوحة توزيع','electric.board','!breaker-trips:القاطع يفصل باستمرار;!sparks:شرر أو سخونة في اللوحة;replace-board:تغيير اللوحة;rcd:مشكلة في قاطع التسريب;main-off:انقطاع الكهرباء عن المنزل;add-breaker:إضافة قاطع'],
   ['switches','مفاتيح وفيش','electric.fixtures','socket-dead:المقبس لا يعمل;!hot-plug:الفيشة أو المفتاح يسخن;switch-broken:المفتاح مكسور;install-new:تركيب جديد;loose:مفتاح أو فيشة مفكوكة;!sparks:شرر من الفيشة'],
   ['lighting','إضاءة ونجف','electric.fixtures','bulb-out:اللمبة لا تعمل;flicker:الإضاءة تومض;install-chandelier:تركيب نجفة;install-spots:تركيب سبوتات;driver:محوّل LED تالف;dimming:الإضاءة بتخفت وتزيد'],
   ['fans','مراوح','electric.fixtures','no-spin:لا تدور;noise:صوت أو اهتزاز;slow:دوران بطيء;install:تركيب مروحة سقف;remote:مشكلة في الريموت'],
   ['elec-heaters','سخانات كهربائية','electric.fixtures','install:تركيب سخان;no-power:لا يصله تيار;trips:يفصل القاطع;wiring:تغيير سلك السخان'],
   ['cables','تمديدات وأسلاك','electric.wiring','new-line:تمديد خط جديد;damaged:سلك تالف;extension:تمديد لمسافة بعيدة;grounding:تأريض (سلك أرضي)'],
   ['electrical-devices','أجهزة كهربائية','electric.devices','install-device:تركيب جهاز;doorbell:جرس الباب;intercom:إنتركم;stabilizer:منظم جهد;ups:UPS أو بطارية'],
   ['other-electric','خدمات أخرى','electric.other','']]},

 plumbing:{ name:'السباكة', icon:'tap', art:'plumbing', kind:'fault', extra:null, spec:'plumbing',
  safety:['اقفل المحبس الرئيسي عند وجود تسريب كبير.','أبعد الأجهزة الكهربائية عن المياه.'],
  items:[
   ['faucets','حنفيات','plumbing.fixtures','leak:تسريب مياه;!drip:نقط مستمرة;weak-flow:ضعف تدفق المياه;replace:تغيير الحنفية;handle:المقبض مكسور;install:تركيب حنفية جديدة;mixer:خلاط حمام'],
   ['sinks','أحواض','plumbing.fixtures','clog:انسداد;leak-under:تسريب أسفل الحوض;install:تركيب حوض;crack:كسر أو شرخ;slow-drain:بطء في التصريف;smell:ريحة كريهة'],
   ['toilet','قواعد حمام','plumbing.fixtures','loose:القاعدة مفكوكة;leak-base:تسريب من القاعدة;clog:انسداد;flush:الطرد لا يعمل;tank:مشكلة في الخزان;install:تركيب قاعدة جديدة;seat:تغيير غطاء'],
   ['siphon','سيفون','plumbing.drain','smell:ريحة كريهة;clog:انسداد;leak:تسريب;replace:تغيير السيفون;flush-tank:مشكلة في سيفون الطرد'],
   ['pipes','مواسير','plumbing.pipes','leak:تسريب في ماسورة;burst:ماسورة مكسورة;rust:صدأ أو مياه عكرة;low-pressure:ضعف الضغط;replace:تغيير مواسير;install-line:تمديد خط جديد'],
   ['heaters-plumb','سخانات','plumbing.heaters','install:تركيب سخان;connect:توصيل مواسير السخان;leakage:تسريب من السخان;valve:مشكلة في المحبس'],
   ['sewage','صرف صحي','plumbing.drain','clog-main:انسداد في الخط الرئيسي;overflow:طفح المجاري;!smell:ريحة بالوعة;manhole:مشكلة في المنهول;slow-drain:بطء التصريف;jetting:كسح / تسليك بالضغط'],
   ['water-tanks','خزانات مياه','plumbing.tanks','leak:تسريب;float-valve:العوامة لا تعمل;overflow:فيض المياه;clean-install:تركيب خزان جديد;no-supply:مفيش مياه من الخزان'],
   ['pumps','طلمبات','plumbing.pumps','no-start:لا تعمل;no-pressure:ضعف الدفع;noise:صوت مرتفع;leak:تسريب من الطلمبة;auto-cut:تفصل وتشتغل باستمرار;install:تركيب طلمبة'],
   ['other-plumbing','خدمات أخرى','plumbing.other','']]},

 carpentry:{ name:'النجارة', icon:'saw', art:'carpentry', kind:'fault', extra:'job', spec:'carpentry',
  safety:['أخلِ المكان من الأشياء الثمينة قبل حضور الفني.'],
  items:[
   ['doors','أبواب','carpentry.doors','install:تركيب باب جديد;wont-close:الباب لا يُقفل;jammed:الباب محشور;sag:الباب مائل;lock:مشكلة في الكالون;replace:تغيير باب;paint-polish:تلميع وإعادة تشطيب'],
   ['windows','شبابيك','carpentry.windows','jammed:الشباك محشور;glass:زجاج مكسور;seal:تسريب هواء أو مياه;replace:تغيير شباك;screen:تركيب سلك / ناموسية'],
   ['wardrobes','دواليب','carpentry.furniture','door-off:باب الدولاب خارج مكانه;rail:سكة الأدراج;shelf:رف مكسور;repaint:إعادة تشطيب;custom:تفصيل دولاب جديد'],
   ['kitchens','مطابخ','carpentry.kitchen','cabinet-door:باب وحدة مكسور;countertop:سطح الرخام / الخشب;drawer:درج لا يعمل;install:تركيب مطبخ جديد;custom:تفصيل مطبخ'],
   ['furniture','أثاث','carpentry.furniture','sofa-frame:هيكل كنبة مكسور;bed:سرير مكسور;table:ترابيزة;repolish:إعادة دوكو وتشطيب;custom:تفصيل قطعة أثاث'],
   ['chairs-tables','كراسي وترابيزات','carpentry.furniture','wobble:مهزوزة;leg:رجل مكسورة;fabric:تغيير قماش / إسفنج;repolish:تلميع'],
   ['hinges-locks','مفصلات وكوالين','carpentry.hardware','hinge:تغيير مفصلة;lock:تغيير كالون;handle:تغيير مقبض;latch:ترباس / قفل داخلي'],
   ['assemble','تركيب أثاث جديد','carpentry.assembly','bedroom:تركيب غرفة نوم;kitchen-units:تركيب وحدات;desk:مكتب / مكتبة;ikea:تركيب أثاث جاهز;tv-unit:وحدة تلفزيون'],
   ['other-carpentry','خدمات أخرى','carpentry.other','']]},

 painting:{ name:'الدهانات', icon:'roller', art:'painting', kind:'paint', extra:'paint', spec:'painting',
  safety:['أخلِ الغرفة أو غطِّ الأثاث قبل الدهان.','التهوية ضرورية أثناء الدهان وبعده.'],
  items:[
   ['room','دهان غرفة','painting.interior','full-room:دهان غرفة كاملة;ceiling-too:حوائط وسقف;touch-up:ترميم بقع;color-change:تغيير لون'],
   ['full-apartment','دهان شقة كاملة','painting.interior','new-finish:شقة تشطيب جديد;repaint:إعادة دهان;rental-return:دهان قبل التسليم;quote:معاينة وتسعير'],
   ['facades','دهان واجهات','painting.exterior','house-facade:واجهة منزل;building:عمارة;scaffold:يحتاج سقالات;fade:تقشير أو بهتان'],
   ['ceilings','دهان أسقف','painting.interior','stains:بقع على السقف;peeling:تقشير;full-ceiling:دهان سقف كامل;cornice:كرانيش / جبس'],
   ['damp','معالجة رطوبة','painting.treatment','wall-damp:رطوبة في الحائط;bathroom-damp:رطوبة جوار الحمام;mold:عفن;salt:ملح وتقشير;roof-leak:تسريب من السطح'],
   ['cracks','معالجة شروخ','painting.treatment','hair-cracks:شروخ سطحية;deep-cracks:شروخ عميقة;corner:شروخ في الأركان;plaster:تقشير بياض'],
   ['wallpaper','ورق حائط','painting.decor','install:تركيب جديد;replace:تغيير ورق قديم;remove:إزالة;repair:ترميم'],
   ['decor-paint','دهانات ديكورية','painting.decor','stucco:استوكو;gypsum:جبس بورد;effects:دهانات خاصة;accent:حائط مميز'],
   ['other-painting','خدمات أخرى','painting.other','']]},

 cars:{ name:'السيارات', icon:'car', art:'cars', kind:'fault', extra:'car', spec:'cars',
  safety:['لو السيارة على الطريق: شغّل الإشارات وابتعد عن مسار المرور.','لا تفتح غطاء المحرك والمحرك ساخن.'],
  items:[
   ['engine','محرك','cars.engine','strange-noise:صوت غير طبيعي;wont-start:لا يدور;overheating:ارتفاع الحرارة;oil-leak:تسريب زيت;power-loss:ضعف في القوة;smoke:دخان من العادم;warning-light:لمبة تحذير'],
   ['brakes','فرامل','cars.brakes','!weak-brake:الفرامل ضعيفة;squeal:صوت صرير;pedal:الدواسة رخوة;vibration:اهتزاز عند الفرملة;pads-change:تغيير تيل'],
   ['battery','بطارية','cars.electrical','dead:بطارية فاضية;jump-start:تشغيل بالكابلات;replace:تغيير بطارية;terminal:مشكلة في الأقطاب;alternator:الدينامو لا يشحن'],
   ['car-electric','كهرباء سيارات','cars.electrical','lights:الأنوار لا تعمل;windows:الزجاج الكهربائي;central-lock:السنترال لوك;fuses:فيوزات;sensors:حساسات;dashboard:لوحة العدادات'],
   ['car-ac','تكييف سيارات','cars.ac','no-cooling:لا يبرد;weak:تبريد ضعيف;smell:ريحة;compressor:الكمبروسر;gas:تعبئة فريون;noise:صوت'],
   ['tires','إطارات','cars.tires','flat:بنشر;replace:تغيير إطار;balance:ترصيص وميزان;uneven-wear:تآكل غير منتظم;pressure:فقد ضغط'],
   ['gearbox','ناقل حركة','cars.gearbox','slip:انزلاق;hard-shift:تعشيق صعب;leak:تسريب;noise:صوت;auto-jerk:رعشة في الأوتوماتيك;oil-change:تغيير زيت الجير'],
   ['suspension','عفشة','cars.suspension','noise:طرقعة;pull:سحب لجهة;shock:مساعدين;steering:توجيه;ball-joints:رولمان وأذرع'],
   ['oil-change','تغيير زيوت','cars.service','engine-oil:زيت محرك;filters:فلاتر;full-service:صيانة دورية;gearbox-oil:زيت جير'],
   ['towing','سحب ونش','cars.towing','breakdown:عطل على الطريق;accident:حادث;stuck:السيارة عالقة;transport:نقل سيارة'],
   ['other-car','خدمات أخرى','cars.other','']]},

 cleaning:{ name:'التنظيف', icon:'sparkle', art:'cleaning', kind:'clean', extra:'clean', spec:'cleaning',
  safety:['أخبرنا بأي حيوانات أليفة أو حساسية من المنظفات.'],
  items:[
   ['apartments','تنظيف شقق','cleaning.home','regular:تنظيف عادي;deep:تنظيف عميق;move-in:قبل السكن;move-out:بعد الخروج;windows:زجاج وشبابيك'],
   ['villas','تنظيف فلل','cleaning.home','full:تنظيف شامل;garden:ملحقات وحديقة;pool:حمام سباحة;deep:تنظيف عميق'],
   ['offices','تنظيف مكاتب','cleaning.commercial','daily:تنظيف يومي;periodic:دوري;deep:عميق;windows:زجاج'],
   ['sofas','تنظيف كنب','cleaning.upholstery','stains:بقع;deep-wash:غسيل عميق;smell:ريحة;sterilize:تعقيم'],
   ['carpets','تنظيف سجاد','cleaning.upholstery','wash:غسيل;stains:بقع;moth:تنظيف حشرات;pickup:استلام وتسليم'],
   ['mattresses','تنظيف مراتب','cleaning.upholstery','dust:غبار وعث;stains:بقع;sterilize:تعقيم;smell:رائحة'],
   ['kitchens-clean','تنظيف مطابخ','cleaning.home','grease:دهون;appliances:أجهزة المطبخ;deep:تنظيف عميق;cabinets:داخل الدواليب'],
   ['bathrooms','تنظيف حمامات','cleaning.home','limescale:جير وترسبات;grout:فواصل البلاط;deep:تنظيف عميق;mold:عفن'],
   ['tanks-clean','تنظيف خزانات','cleaning.tanks','ground:خزان أرضي;roof:خزان علوي;sterilize:تعقيم;water-test:فحص جودة المياه'],
   ['post-finishing','تنظيف بعد التشطيب','cleaning.construction','dust:غبار تشطيب;paint-stains:بقع دهان;glass:زجاج وألومنيوم;floors:أرضيات;full:تنظيف شامل'],
   ['other-cleaning','خدمات أخرى','cleaning.other','']]}
};

/* ═════════ مجموعات الأسئلة القديمة (توافق خلفي) ═════════
   Q_SETS ما زال مصدر الأسئلة الأساسي حسب القسم/النوع. أبقينا الاسم
   نفسه لأي مستهلك خارجي (اختبارات، واجهات مستقبلية). */
const Q_SETS = {
  fault: Q_SET_FAULT,
  job: Q_SET_JOB,
  paint: Q_SET_PAINT,
  clean: Q_SET_CLEAN,
  car: Q_SET_CAR,
  appliance: Q_SET_APPLIANCE
};

/* ═════════ بناء الكتالوج من التعريف المختصر ═════════ */
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
function buildSeed(){
  const cats=[], items=[], problems=[]; let ci=0;
  for(const [cid,c] of Object.entries(DEF)){
    cats.push({id:cid,name:c.name,icon:c.icon,art:c.art,kind:c.kind,safety:c.safety||[],active:true,order:ci++});
    c.items.forEach((it,ii)=>{
      const [iid,iname,spec,plist]=it, itemId=cid+'/'+iid;
      items.push({id:itemId,cat:cid,slug:iid,name:iname,specialty:spec,kind:c.kind,qset:c.extra||null,needsVisit:true,active:true,order:ii,image:'',safety:[]});
      const pl = plist ? plist.split(';') : [];
      pl.forEach((p,pi)=>{ let [pid,pname]=p.split(':'); let warn=false;
        if(pid[0]==='!'){ warn=true; pid=pid.slice(1); }
        const extra = Q_BY_PROBLEM[itemId + '/' + pid] || [];
        problems.push({id:itemId+'/'+pid,item:itemId,cat:cid,slug:pid,name:pname,warn:warn?(c.safety&&c.safety[0])||'':'',needsVisit:true,active:true,order:pi,extraQuestions:extra,attachments:{photos:'optional',video:'optional'}});
      });
      problems.push({id:itemId+'/other',item:itemId,cat:cid,slug:'other',name:'مشكلة أخرى',warn:'',needsVisit:true,active:true,order:99,extraQuestions:[],attachments:{photos:'optional',video:'optional'},isOther:true});
    });
  }
  /* the question bank (services/catalog-question-bank.js, loaded before this file): items / problems reference bank
     questions by id ({id, required}); without the bank the legacy Q_SETS composition below is used */
  const G = typeof globalThis !== 'undefined' ? globalThis : {};
  if (Array.isArray(G.HS_Q_BANK) && G.HS_Q_ITEM) {
    items.forEach(i => { i.qs = (G.HS_Q_ITEM[i.id] || []).map(r => ({id:r.id, required:!!r.required})); });
    problems.forEach(p => { p.qs = ((G.HS_Q_PROBLEM || {})[p.id] || []).map(r => ({id:r.id, required:!!r.required})); });
    return {v:3,bank:G.HS_Q_BANK.map(q => Object.assign({}, q, q.options ? {options:q.options.slice()} : {})),govs:null,categories:cats,items,problems};
  }
  return {v:2,categories:cats,items,problems};
}
/* the catalogue published by the admin (GET /catalog-feed, CDN-cached) — validated shape, or null */
function validPublished(d){
  return !!(d && d.v === 3 && +d.rev > 0 && Array.isArray(d.bank) && Array.isArray(d.categories) && Array.isArray(d.items) && Array.isArray(d.problems) && d.categories.length && d.items.length);
}

/* ═════════ الكائن العام CAT ═════════ */
const CAT = (() => {
  const KEY='hs_catalog_v1';   /* نحتفظ بنفس المفتاح — الإصدار يُدار عبر db.v */
  const PUB_KEY='hs_catalog_pub';   /* the last published catalogue from the server (wins over the built-in seed) */
  let db;
  const load=()=>{
    try{ const p=localStorage.getItem(PUB_KEY); if(p){ const d=JSON.parse(p); if(validPublished(d)){ db=d; return; } } }catch{}
    try{ const r=localStorage.getItem(KEY); db=r?JSON.parse(r):buildSeed(); }catch{ db=buildSeed(); }
    /* a device copy older than the built-in seed's version (v2 → v3 bank) is rebuilt */
    const seedV = (typeof globalThis!=='undefined' && Array.isArray(globalThis.HS_Q_BANK)) ? 3 : 2;
    if(!db||!db.v||db.v<seedV){ db=buildSeed(); } };
  const save=()=>{ try{ localStorage.setItem(db && db.rev ? PUB_KEY : KEY,JSON.stringify(db)); }catch(e){ console.warn('catalog storage',e); } if(api.onChange) api.onChange(); };
  load();
  const ord=(a,b)=>a.order-b.order;
  const act=(l,all)=>all?l.slice().sort(ord):l.filter(x=>x.active).sort(ord);
  const api={
    db:()=>db,
    categories:(all)=>act(db.categories,all),
    category:id=>db.categories.find(c=>c.id===id),
    items:(cat,all)=>act(db.items.filter(i=>i.cat===cat),all),
    item:id=>db.items.find(i=>i.id===id),
    problems:(item,all)=>act(db.problems.filter(p=>p.item===item),all),
    problem:id=>db.problems.find(p=>p.id===id),
    valid(sel){ const out={cat:'',item:'',problem:''};
      if(sel.cat && api.category(sel.cat) && api.category(sel.cat).active) out.cat=sel.cat;
      if(out.cat && sel.item){ const i=api.item(sel.item); if(i && i.cat===out.cat && i.active) out.item=i.id; }
      if(out.item && sel.problem){ const p=api.problem(sel.problem); if(p && p.item===out.item && p.active) out.problem=p.id; }
      return out; },
    breadcrumb(sel){ const r=[]; const c=api.category(sel.cat), i=api.item(sel.item), p=api.problem(sel.problem);
      if(c) r.push({k:'cat',id:c.id,name:c.name}); if(i) r.push({k:'item',id:i.id,name:i.name}); if(p) r.push({k:'problem',id:p.id,name:p.name}); return r; },

    /* ═════════ أسئلة المستوى 4 — V7 ═════════
       التركيب:
       1) أسئلة قسم (حسب kind): fault/job/paint/clean
       2) أسئلة qset إضافية (حسب نوع الجهاز)
       3) أسئلة Q_BY_ITEM (مخصصة للجهاز — لها الأولوية)
       4) أسئلة المشكلة (extraQuestions)
       ترتيب: قسم ثم qset ثم جهاز ثم مشكلة. تُزال التكرارات بـ id. */
    questionsFor(itemId, problemId){
      const i = api.item(itemId); if(!i) return [];
      const c = api.category(i.cat), p = problemId && api.problem(problemId);
      /* bank catalogue (v3): the item's chosen questions, then the problem's — each resolved from the bank */
      if (Array.isArray(i.qs) && Array.isArray(db.bank)) {
        const seenB = new Set(), out = [];
        [].concat(i.qs, (p && Array.isArray(p.qs)) ? p.qs : []).forEach(r => {
          const q = r && db.bank.find(b => b.id === r.id);
          if (!q || seenB.has(q.id)) return; seenB.add(q.id);
          out.push(Object.assign({}, q, {required: !!r.required}, q.options ? {options: q.options.slice()} : {}));
        });
        return out;
      }
      const catKind = c ? c.kind : 'fault';
      const base = Array.isArray(Q_SETS[catKind]) ? Q_SETS[catKind].slice() : [];
      const ex = (i.qset && Q_SETS[i.qset]) ? Q_SETS[i.qset].slice() : [];
      const itemExtra = Q_BY_ITEM[i.id] || [];
      const probExtra = (p && p.extraQuestions) ? p.extraQuestions.slice() : [];
      /* ترتيب: base + ex + itemExtra + probExtra ثم إزالة التكرار */
      const seen = new Set();
      const all = [].concat(base, ex, itemExtra, probExtra).filter(q => {
        if (!q || !q.id) return false;
        if (seen.has(q.id)) return false;
        seen.add(q.id); return true;
      });
      return all;
    },

    safetyFor(itemId, problemId){ const i=api.item(itemId); if(!i) return []; const c=api.category(i.cat), p=problemId&&api.problem(problemId);
      return [].concat(c.safety||[], i.safety||[], p&&p.warn?[p.warn]:[]).filter((x,k,a)=>x&&a.indexOf(x)===k); },

    needsVisit(itemId, problemId){ const p=problemId&&api.problem(problemId), i=api.item(itemId); return p?p.needsVisit:(i?i.needsVisit:true); },

    /* ═════════ البحث — V7 ═════════
       يعتمد على تطبيع + توسيع مرادفات HS_SEARCH إن وُجد، وإلا يعود للتطبيع الأساسي.
       لا يكسر التوقيع القديم (نفس الشكل: array of results). */
    search(q){
      const raw = String(q || '').trim();
      if (raw.length < 2) return [];
      let tokens;
      try {
        if (typeof HS_SEARCH !== 'undefined' && HS_SEARCH && typeof HS_SEARCH.synonyms === 'function') {
          const syn = HS_SEARCH.synonyms();
          const base = cnorm(raw).split(/\s+/).filter(Boolean);
          const expanded = new Set(base);
          for (const t of base) { const arr = syn[t]; if (arr) arr.forEach(a => expanded.add(a)); }
          tokens = Array.from(expanded);
        } else {
          tokens = cnorm(raw).split(/\s+/).filter(Boolean);
        }
      } catch { tokens = cnorm(raw).split(/\s+/).filter(Boolean); }
      if (!tokens.length) return [];
      const match = (hay) => { if (!hay) return false; const n = cnorm(hay); return tokens.every(t => n.includes(t)); };
      const out=[];
      db.categories.filter(c=>c.active && match(c.name)).forEach(c=>out.push({type:'cat',id:c.id,name:c.name,path:''}));
      db.items.filter(i=>i.active && match(i.name)).forEach(i=>out.push({type:'item',id:i.id,cat:i.cat,name:i.name,path:api.category(i.cat).name}));
      db.problems.filter(p=>p.active && !p.isOther && match(p.name)).forEach(p=>{
        const i = api.item(p.item);
        out.push({type:'problem',id:p.id,item:p.item,cat:p.cat,name:p.name,path:api.category(p.cat).name+' ← '+i.name});
      });
      return out.slice(0,40);
    },

    /* ── إدارة (تُستخدم من لوحة الإدارة لاحقاً) ── */
    upsert(col,obj){ const k={cat:'categories',item:'items',problem:'problems'}[col], list=db[k]; let o=list.find(x=>x.id===obj.id);
      if(o) Object.assign(o,obj); else { o=Object.assign({active:true,order:list.length,needsVisit:true,safety:[],extraQuestions:[]},obj); list.push(o); } save(); return o; },
    setActive(col,id,v){ const o=api.upsert(col,{id,active:!!v}); if(col==='cat') db.items.filter(i=>i.cat===id).forEach(i=>i.active=!!v&&i.active); save(); return o; },
    move(col,id,dir){ const k={cat:'categories',item:'items',problem:'problems'}[col], o=db[k].find(x=>x.id===id); if(!o) return;
      const sib=db[k].filter(x=>(col==='cat')||(col==='item'?x.cat===o.cat:x.item===o.item)).sort(ord); const i=sib.indexOf(o), j=i+dir; if(j<0||j>=sib.length) return;
      const t=sib[j].order; sib[j].order=o.order; o.order=t; save(); },
    remove(col,id){ const k={cat:'categories',item:'items',problem:'problems'}[col];
      if(col==='cat'){ db.items.filter(i=>i.cat===id).forEach(i=>api.remove('item',i.id)); }
      if(col==='item'){ db.problems=db.problems.filter(p=>p.item!==id); }
      db[k]=db[k].filter(x=>x.id!==id); save(); },
    reset(){ db=buildSeed(); save(); },
    /* ── server-published catalogue (admin «انشر» → GET /catalog-feed) ── */
    bank:()=>Array.isArray(db.bank)?db.bank:[],
    rev:()=>+db.rev||0,
    /* the governorates the platform serves (null = all of them) */
    govs(){ const all=(typeof MP!=='undefined'&&MP&&MP.GOVS)||[]; return Array.isArray(db.govs)&&db.govs.length ? all.filter(g=>db.govs.includes(g)).concat(db.govs.filter(g=>!all.includes(g))) : all.slice(); },
    /* adopt a newer published catalogue; returns true when it changed what customers see */
    applyRemote(d){ if(!validPublished(d) || (+d.rev||0) <= api.rev() && db.rev) return false; db=d; save(); return true; },
    /* back to the built-in seed (e.g. the server has nothing published yet) */
    dropRemote(){ try{ localStorage.removeItem(PUB_KEY); }catch{} if(db.rev){ db=null; load(); if(!db) db=buildSeed(); if(api.onChange) api.onChange(); } },
    seed:()=>buildSeed(),
    valid3:validPublished,
    onChange:null
  };
  return api;
})();

function cnorm(s){ return String(s||'').replace(/[\u064B-\u065F\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').toLowerCase().trim(); }

if(typeof module!=='undefined') module.exports={CAT,Q_SETS,Q_BY_ITEM,Q_BY_PROBLEM};