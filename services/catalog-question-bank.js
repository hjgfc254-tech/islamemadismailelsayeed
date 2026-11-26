'use strict';
/* ═════════ بنك الأسئلة الافتراضي (HS_Q_BANK) ═════════
   Default question bank: short Egyptian-Arabic questions with one-tap answers.
   - HS_Q_BANK    : every question once (id, label, type, options).
   - HS_Q_ITEM    : itemId (cat/slug, as buildSeed() makes it from DEF) -> [{id, required}] (max 2).
   - HS_Q_PROBLEM : problemId (cat/slug/problemSlug) -> [{id, required}] (max 2).
   Reader: services/local-catalog.js buildSeed -> CAT.questionsFor; the admin will later
   pick questions per service from this bank. Data only — local fixtures, no backend. */

const HS_Q_BANK = [
  /* ── عام ── */
  { id: 'item_count', label: 'العدد كام تقريبًا؟', type: 'number' },
  { id: 'area', label: 'المساحة تقريبًا (متر مربع)', type: 'number' },
  { id: 'rooms', label: 'عدد الأوض', type: 'number' },
  { id: 'floors', label: 'عدد الأدوار', type: 'number' },
  { id: 'part_by', label: 'مين هيجيب الخامات أو القطعة؟', type: 'select', options: ['أنا عندي', 'الفني يجيبها', 'مش عارف'] },
  { id: 'wall_type', label: 'الحيطة طوب ولا خرسانة؟', type: 'select', options: ['طوب', 'خرسانة', 'مش عارف'] },
  { id: 'valve_close', label: 'تقدر تقفل محبس المية؟', type: 'select', options: ['أيوه', 'لا', 'مش عارف'] },
  { id: 'sparks', label: 'فيه شرر أو ريحة حريق؟', type: 'select', options: ['لا', 'أيوه'] },
  { id: 'unplugged', label: 'فصلت الجهاز من الكهربا؟', type: 'select', options: ['أيوه', 'لا'] },
  { id: 'power_off', label: 'قدرت تفصل السكينة الرئيسية؟', type: 'select', options: ['أيوه', 'لا', 'مش عارف'] },
  { id: 'heater_size', label: 'سعة السخان كام؟', type: 'select', options: ['30 لتر', '50 لتر', '80 لتر أو أكتر', 'مش عارف'] },
  { id: 'ceiling_type', label: 'السقف عادي ولا جبس بورد؟', type: 'select', options: ['عادي', 'جبس بورد', 'مش عارف'] },

  /* ── أجهزة ── */
  { id: 'brand', label: 'الماركة', type: 'select', options: ['توشيبا / العربي', 'LG', 'سامسونج', 'تانية / مش عارف'] },
  { id: 'pattern', label: 'العطل مستمر ولا بييجي ويروح؟', type: 'select', options: ['مستمر', 'بييجي ويروح', 'مش عارف'] },
  { id: 'cool_level', label: 'التبريد عامل إزاي؟', type: 'select', options: ['ضعيف', 'مش بيبرد خالص', 'بيقطع'] },
  { id: 'leak_water', label: 'فيه مية بتنقط من الجهاز؟', type: 'select', options: ['أيوه', 'لا'] },
  { id: 'leak_where', label: 'المية بتنزل منين؟', type: 'select', options: ['من تحت', 'من الباب', 'من الخرطوم', 'مش عارف'] },
  { id: 'power_ok', label: 'الجهاز بينوّر أو بيدي أي صوت؟', type: 'select', options: ['أيوه', 'لا'] },
  { id: 'tap_open', label: 'حنفية الغسالة مفتوحة والمية واصلة؟', type: 'select', options: ['أيوه', 'لا', 'مش عارف'] },
  { id: 'gas_last', label: 'آخر مرة اتملى فريون إمتى؟', type: 'select', options: ['من أقل من سنة', 'من سنة أو أكتر', 'مش عارف'] },
  { id: 'ac_units', label: 'عدد التكييفات', type: 'number' },
  { id: 'gas_smell', label: 'شامم ريحة غاز؟', type: 'select', options: ['لا', 'خفيفة', 'قوية'] },
  { id: 'gas_valve', label: 'قفلت محبس الغاز؟', type: 'select', options: ['أيوه', 'لا، محتاج مساعدة'] },
  { id: 'cooker_type', label: 'البوتاجاز شغّال بإيه؟', type: 'select', options: ['غاز طبيعي', 'أنبوبة', 'مش عارف'] },

  /* ── كهرباء ── */
  { id: 'wall_finish', label: 'الشقة متشطبة ولا لسه على المحارة؟', type: 'select', options: ['متشطبة', 'على المحارة', 'مش عارف'] },
  { id: 'points_count', label: 'عدد النقط تقريبًا', type: 'number' },
  { id: 'cable_length', label: 'الطول تقريبًا بالمتر', type: 'number' },
  { id: 'fan_hook', label: 'فيه شنكل في السقف للمروحة؟', type: 'select', options: ['أيوه', 'لا', 'مش عارف'] },
  { id: 'trip_when', label: 'بيفصل لما تشغّل جهاز معيّن؟', type: 'select', options: ['أيوه', 'لا', 'مش عارف'] },
  { id: 'neighbors', label: 'الكهربا قاطعة عند الجيران كمان؟', type: 'select', options: ['أيوه', 'لا', 'مش عارف'] },

  /* ── سباكة ── */
  { id: 'pipe_type', label: 'المواسير نوعها إيه؟', type: 'select', options: ['حديد', 'بلاستيك', 'مش عارف'] },
  { id: 'pipe_leak_where', label: 'التسريب ظاهر ولا جوه الحيطة؟', type: 'select', options: ['ظاهر', 'جوه الحيطة', 'تحت الأرض', 'مش عارف'] },
  { id: 'overflow_now', label: 'فيه طفح دلوقتي؟', type: 'select', options: ['أيوه', 'لا'] },
  { id: 'tank_place', label: 'الخزان فين؟', type: 'select', options: ['فوق السطح', 'أرضي', 'الاتنين'] },

  /* ── نجارة ── */
  { id: 'door_count', label: 'عدد الأبواب', type: 'number' },
  { id: 'door_material', label: 'الباب نوعه إيه؟', type: 'select', options: ['خشب', 'ألوميتال', 'حديد', 'مش عارف'] },
  { id: 'door_frame', label: 'حلق الباب (الفريم) متركب؟', type: 'select', options: ['أيوه', 'لا', 'مش عارف'] },
  { id: 'door_ready', label: 'الباب نفسه جاهز عندك؟', type: 'select', options: ['أيوه', 'لا، الفني يجيبه', 'مش عارف'] },
  { id: 'window_material', label: 'الشباك نوعه إيه؟', type: 'select', options: ['خشب', 'ألوميتال', 'مش عارف'] },
  { id: 'kitchen_length', label: 'طول المطبخ تقريبًا بالمتر', type: 'number' },

  /* ── دهانات ── */
  { id: 'include_ceiling', label: 'السقف كمان؟', type: 'select', options: ['أيوه', 'لا'] },
  { id: 'wall_state', label: 'حالة الحيطان', type: 'select', options: ['كويسة', 'فيها تقشير', 'فيها رطوبة أو شروخ'] },
  { id: 'damp_where', label: 'الرطوبة فين؟', type: 'select', options: ['جنب الحمام أو المطبخ', 'تحت السطح', 'حيطة برّانية', 'مش عارف'] },
  { id: 'empty_flat', label: 'الشقة فاضية؟', type: 'select', options: ['أيوه', 'لا، فيها عفش'] },

  /* ── سيارات ── */
  { id: 'make', label: 'نوع العربية والموديل والسنة', type: 'input' },
  { id: 'car_moves', label: 'العربية بتتحرك دلوقتي؟', type: 'select', options: ['أيوه', 'لا، واقفة', 'بصعوبة'] },
  { id: 'car_place', label: 'العربية فين دلوقتي؟', type: 'select', options: ['قدام البيت أو في جراج', 'على الطريق', 'في ورشة'] },
  { id: 'lights_ok', label: 'أنوار العربية شغّالة؟', type: 'select', options: ['أيوه', 'ضعيفة', 'لا'] },
  { id: 'safe_drive', label: 'تقدر تسوقها بأمان دلوقتي؟', type: 'select', options: ['أيوه بحذر', 'لا'] },
  { id: 'spare_tire', label: 'معاك استبن سليم؟', type: 'select', options: ['أيوه', 'لا', 'مش عارف'] },

  /* ── تنظيف ── */
  { id: 'elevator', label: 'فيه أسانسير؟', type: 'select', options: ['أيوه', 'لا', 'دور أرضي'] },
  { id: 'stain_type', label: 'البقع من إيه؟', type: 'select', options: ['أكل أو مشروبات', 'حبر', 'مش عارف'] }
];

const HS_Q_ITEM = {
  /* أجهزة */
  'appliances/fridge': [{ id: 'brand', required: false }, { id: 'cool_level', required: false }],
  'appliances/washer-auto': [{ id: 'brand', required: false }, { id: 'pattern', required: false }],
  'appliances/washer-semi': [{ id: 'leak_water', required: false }],
  'appliances/ac': [{ id: 'brand', required: false }, { id: 'ac_units', required: false }],
  'appliances/heater-electric': [{ id: 'heater_size', required: false }],
  'appliances/heater-gas': [{ id: 'gas_smell', required: false }],
  'appliances/dishwasher': [{ id: 'leak_water', required: false }],
  'appliances/deep-freezer': [{ id: 'cool_level', required: false }],
  'appliances/microwave': [{ id: 'sparks', required: false }],
  'appliances/cooker': [{ id: 'gas_smell', required: false }, { id: 'cooker_type', required: false }],
  'appliances/hood': [],
  'appliances/other-appliance': [],

  /* كهرباء */
  'electric/wiring': [{ id: 'wall_finish', required: false }, { id: 'points_count', required: false }],
  'electric/dist-board': [{ id: 'sparks', required: false }],
  'electric/switches': [{ id: 'item_count', required: false }],
  'electric/lighting': [{ id: 'item_count', required: false }, { id: 'ceiling_type', required: false }],
  'electric/fans': [],
  'electric/elec-heaters': [{ id: 'heater_size', required: false }],
  'electric/cables': [{ id: 'cable_length', required: false }],
  'electric/electrical-devices': [],
  'electric/other-electric': [],

  /* سباكة */
  'plumbing/faucets': [{ id: 'item_count', required: false }],
  'plumbing/sinks': [],
  'plumbing/toilet': [],
  'plumbing/siphon': [],
  'plumbing/pipes': [{ id: 'pipe_type', required: false }],
  'plumbing/heaters-plumb': [{ id: 'heater_size', required: false }],
  'plumbing/sewage': [{ id: 'overflow_now', required: false }],
  'plumbing/water-tanks': [{ id: 'tank_place', required: false }],
  'plumbing/pumps': [],
  'plumbing/other-plumbing': [],

  /* نجارة */
  'carpentry/doors': [{ id: 'door_count', required: false }, { id: 'door_material', required: false }],
  'carpentry/windows': [{ id: 'window_material', required: false }],
  'carpentry/wardrobes': [],
  'carpentry/kitchens': [{ id: 'kitchen_length', required: false }],
  'carpentry/furniture': [],
  'carpentry/chairs-tables': [{ id: 'item_count', required: false }],
  'carpentry/hinges-locks': [{ id: 'item_count', required: false }],
  'carpentry/assemble': [{ id: 'item_count', required: false }],
  'carpentry/other-carpentry': [],

  /* دهانات */
  'painting/room': [{ id: 'include_ceiling', required: false }, { id: 'wall_state', required: false }],
  'painting/full-apartment': [{ id: 'rooms', required: true }, { id: 'area', required: false }],
  'painting/facades': [{ id: 'floors', required: false }],
  'painting/ceilings': [{ id: 'ceiling_type', required: false }],
  'painting/damp': [{ id: 'damp_where', required: false }],
  'painting/cracks': [],
  'painting/wallpaper': [{ id: 'area', required: false }],
  'painting/decor-paint': [{ id: 'area', required: false }],
  'painting/other-painting': [],

  /* سيارات — الموديل مطلوب دائمًا */
  'cars/engine': [{ id: 'make', required: true }, { id: 'car_moves', required: false }],
  'cars/brakes': [{ id: 'make', required: true }, { id: 'car_moves', required: false }],
  'cars/battery': [{ id: 'make', required: true }, { id: 'car_place', required: false }],
  'cars/car-electric': [{ id: 'make', required: true }],
  'cars/car-ac': [{ id: 'make', required: true }],
  'cars/tires': [{ id: 'make', required: true }, { id: 'car_place', required: false }],
  'cars/gearbox': [{ id: 'make', required: true }, { id: 'car_moves', required: false }],
  'cars/suspension': [{ id: 'make', required: true }],
  'cars/oil-change': [{ id: 'make', required: true }],
  'cars/towing': [{ id: 'make', required: true }, { id: 'car_place', required: false }],
  'cars/other-car': [{ id: 'make', required: true }],

  /* تنظيف */
  'cleaning/apartments': [{ id: 'area', required: false }, { id: 'elevator', required: false }],
  'cleaning/villas': [{ id: 'area', required: false }, { id: 'floors', required: false }],
  'cleaning/offices': [{ id: 'area', required: false }],
  'cleaning/sofas': [{ id: 'item_count', required: false }],
  'cleaning/carpets': [{ id: 'item_count', required: false }],
  'cleaning/mattresses': [{ id: 'item_count', required: false }],
  'cleaning/kitchens-clean': [],
  'cleaning/bathrooms': [{ id: 'item_count', required: false }],
  'cleaning/tanks-clean': [{ id: 'tank_place', required: false }],
  'cleaning/post-finishing': [{ id: 'area', required: false }],
  'cleaning/other-cleaning': []
};

const HS_Q_PROBLEM = {
  /* أجهزة */
  'appliances/fridge/dead': [{ id: 'power_ok', required: false }],
  'appliances/washer-auto/dead': [{ id: 'power_ok', required: false }],
  'appliances/washer-auto/no-water-intake': [{ id: 'tap_open', required: false }],
  'appliances/washer-auto/leakage': [{ id: 'leak_where', required: false }],
  'appliances/washer-semi/shock': [{ id: 'unplugged', required: false }],
  'appliances/ac/no-cooling': [{ id: 'gas_last', required: false }],
  'appliances/heater-gas/gas-smell': [{ id: 'gas_valve', required: false }],
  'appliances/microwave/sparks': [{ id: 'unplugged', required: false }],
  'appliances/cooker/gas-smell': [{ id: 'gas_valve', required: false }],

  /* كهرباء */
  'electric/wiring/short': [{ id: 'power_off', required: false }],
  'electric/dist-board/breaker-trips': [{ id: 'trip_when', required: false }],
  'electric/dist-board/sparks': [{ id: 'power_off', required: false }],
  'electric/dist-board/main-off': [{ id: 'neighbors', required: false }],
  'electric/switches/hot-plug': [{ id: 'power_off', required: false }],
  'electric/switches/sparks': [{ id: 'power_off', required: false }],
  'electric/lighting/install-chandelier': [{ id: 'part_by', required: false }],
  'electric/fans/install': [{ id: 'fan_hook', required: false }, { id: 'part_by', required: false }],

  /* سباكة */
  'plumbing/faucets/leak': [{ id: 'valve_close', required: false }],
  'plumbing/faucets/install': [{ id: 'part_by', required: false }],
  'plumbing/faucets/replace': [{ id: 'part_by', required: false }],
  'plumbing/faucets/mixer': [{ id: 'part_by', required: false }],
  'plumbing/sinks/install': [{ id: 'part_by', required: false }],
  'plumbing/sinks/leak-under': [{ id: 'valve_close', required: false }],
  'plumbing/toilet/install': [{ id: 'part_by', required: false }],
  'plumbing/toilet/leak-base': [{ id: 'valve_close', required: false }],
  'plumbing/pipes/leak': [{ id: 'pipe_leak_where', required: false }, { id: 'valve_close', required: false }],
  'plumbing/pipes/burst': [{ id: 'valve_close', required: false }],
  'plumbing/heaters-plumb/install': [{ id: 'part_by', required: false }],
  'plumbing/water-tanks/clean-install': [{ id: 'part_by', required: false }],
  'plumbing/pumps/install': [{ id: 'part_by', required: false }],

  /* نجارة */
  'carpentry/doors/install': [{ id: 'door_frame', required: false }, { id: 'door_ready', required: false }],
  'carpentry/doors/replace': [{ id: 'door_frame', required: false }, { id: 'door_ready', required: false }],
  'carpentry/kitchens/install': [{ id: 'wall_type', required: false }],
  'carpentry/assemble/tv-unit': [{ id: 'wall_type', required: false }],

  /* دهانات */
  'painting/room/full-room': [{ id: 'part_by', required: false }],
  'painting/full-apartment/new-finish': [{ id: 'part_by', required: false }],
  'painting/full-apartment/repaint': [{ id: 'empty_flat', required: false }, { id: 'part_by', required: false }],

  /* سيارات */
  'cars/engine/wont-start': [{ id: 'lights_ok', required: false }],
  'cars/battery/dead': [{ id: 'lights_ok', required: false }],
  'cars/brakes/weak-brake': [{ id: 'safe_drive', required: false }],
  'cars/tires/flat': [{ id: 'spare_tire', required: false }],

  /* تنظيف */
  'cleaning/sofas/stains': [{ id: 'stain_type', required: false }]
};

if (typeof globalThis !== 'undefined') Object.assign(globalThis, { HS_Q_BANK, HS_Q_ITEM, HS_Q_PROBLEM });
if (typeof module !== 'undefined') module.exports = { HS_Q_BANK, HS_Q_ITEM, HS_Q_PROBLEM };
