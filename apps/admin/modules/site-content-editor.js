/**
 * MODULE: site-content-editor (HSSiteContentEditor) — Admin Center editor for the Customer Home hero, the discover
 * slides and the service icons (Firebase mode; mounted inside the «إعدادات النظام» live panel).
 * Images are resized and compressed in the browser (WebP) before upload and stored server-side in Firestore
 * (POST /admin/media); texts and image references are saved with one PATCH /admin/content (a new content version that
 * open Customer pages pick up live). No Firebase Storage is used.
 */
'use strict';
(function (root) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = () => root.HSApiClient;
  const req = (m, p, body) => C().request(m, p, { body });
  const errText = r => (r && r.error && r.error.message) || 'تعذّر تنفيذ الإجراء.';
  const SC = () => root.HSSiteContent;
  const LIMIT = 380000;                                            // data-URL chars accepted by the server (with margin)
  const SIZES = { hero: [1400, 1000], slide: [1200, 900], icon: [256, 256] };
  const ACTIONS = [['wizard', 'بدء طلب'], ['services', 'صفحة الخدمات'], ['orders', 'طلباتي'], ['none', 'بدون زر']];
  const DEFAULT_ACTION = { steps: 'wizard', specialists: 'services', track: 'orders' };

  /** File → {data (WebP data URL ≤ LIMIT), w, h}: scale to fit, then lower quality / size until it fits. */
  function compress(file, kind) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error('اختر ملف صورة'));
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let [mw, mh] = SIZES[kind];
        for (let pass = 0; pass < 6; pass++) {
          const r = Math.min(1, mw / img.naturalWidth, mh / img.naturalHeight);
          const w = Math.max(1, Math.round(img.naturalWidth * r)), h = Math.max(1, Math.round(img.naturalHeight * r));
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const g = cv.getContext('2d');
          if (kind === 'icon') {                                     // square, centre-cropped
            const s = Math.min(img.naturalWidth, img.naturalHeight); cv.width = cv.height = Math.min(mw, s);
            g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, cv.width, cv.height);
          } else g.drawImage(img, 0, 0, w, h);
          for (const q of [0.86, 0.78, 0.7, 0.6, 0.5]) {
            const data = cv.toDataURL('image/webp', q);
            if (!/^data:image\/webp/.test(data)) { const j = cv.toDataURL('image/jpeg', q); if (j.length <= LIMIT) return resolve({ data: j, w: cv.width, h: cv.height }); continue; }
            if (data.length <= LIMIT) return resolve({ data, w: cv.width, h: cv.height });
          }
          mw = Math.round(mw * 0.8); mh = Math.round(mh * 0.8);
        }
        reject(new Error('الصورة كبيرة جدًا حتى بعد الضغط'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذّر قراءة الصورة')); };
      img.src = url;
    });
  }

  async function mount(host) {
    const res = await req('GET', '/admin/content');
    if (!res.ok) { host.innerHTML = `<p>${esc(errText(res))}</p>`; return; }
    const cur = res.data || {};
    const D = (SC() && SC().DEFAULTS) || { hero: { eyebrow: '', title: '', accent: '', sub: '', cta: '' } };
    const guides = typeof GUIDES !== 'undefined' ? GUIDES : [];
    const work = {
      hero: { ...D.hero, media: null, ...(cur.hero || {}) },
      slides: (cur.slides || guides.map(g => ({ id: g.id, title: g.title, desc: g.desc, cta: g.cta, action: DEFAULT_ACTION[g.id] || 'none', media: null, active: true }))).map(s => ({ ...s })),
      icons: { ...(cur.icons || {}) }
    };
    const previews = {};                                             // mediaId → data URL uploaded in this session
    const bundled = name => (typeof ICON_PHOTOS !== 'undefined' && ICON_PHOTOS[name] ? ICON_PHOTO_BASE + ICON_PHOTOS[name] + '.webp' : '');
    const published = (kind, key) => {
      const s = SC(); if (!s) return '';
      if (kind === 'hero') { const h = s.hero(); return h && h.img || ''; }
      if (kind === 'slide') { const sl = (s.slides() || []).find(x => x.id === key); return sl && sl.img || ''; }
      return s.iconUrl(key);
    };
    const imgOf = (kind, key, media) => (media && previews[media]) || (media && published(kind, key)) || (kind === 'icon' ? bundled(key) : '');
    let group = 'electric';

    const status = msg => { const s = host.querySelector('[data-sc-status]'); if (s) s.textContent = msg || ''; };
    const thumb = (src, alt) => src ? `<img src="${esc(src)}" alt="${esc(alt || '')}" style="width:96px;height:64px;object-fit:cover;border-radius:10px;border:1px solid var(--border-subtle)">` : '<span class="ord-muted">الصورة الافتراضية</span>';
    const pick = (attr, kind, key) => `<label class="adm-btn" style="cursor:pointer">رفع صورة<input type="file" accept="image/*" hidden data-sc-file="${esc(kind)}" ${attr}="${esc(key)}"></label>`;

    function iconRows() {
      const cats = typeof CAT !== 'undefined' && CAT.categories ? CAT.categories() : [];
      const items = typeof CAT !== 'undefined' && CAT.items ? CAT.items(group) : [];
      const entries = [['c-' + group, 'أيقونة القسم']].concat(items.map(it => ['d-' + String(it.id).split('/').pop(), it.name]));
      return `<p><label>القسم <select data-sc-group>${cats.map(c => `<option value="${esc(c.id)}" ${c.id === group ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">${entries.map(([name, label]) => {
          const src = imgOf('icon', name, work.icons[name]);
          return `<div style="display:grid;gap:6px;justify-items:center;padding:10px;border:1px solid var(--border-subtle);border-radius:12px;text-align:center">
            ${src ? `<img src="${esc(src)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:14px">` : '<span class="ord-muted">—</span>'}
            <small>${esc(label)}</small>${pick('data-sc-key', 'icon', name)}
            ${work.icons[name] ? `<button type="button" class="adm-btn" data-sc-reset="${esc(name)}">الأصلية</button>` : ''}</div>`;
        }).join('')}</div>`;
    }

    function render() {
      const h = work.hero;
      host.innerHTML = `<section class="adm-live-panel" aria-label="واجهة الموقع">
        <h3>واجهة الموقع (الصفحة الرئيسية)</h3>
        <p class="ord-muted">التغييرات تظهر للعملاء فورًا بعد الحفظ. الصور تُصغَّر وتُضغط تلقائيًا قبل الرفع.</p>
        <p data-sc-status role="status" aria-live="polite" class="ord-muted"></p>
        <fieldset class="ord-dlg-in"><legend>الهيرو</legend>
          <label class="hs-grid-field"><span>سطر صغير فوق العنوان</span><input data-sc-hero="eyebrow" maxlength="60" value="${esc(h.eyebrow)}"></label>
          <label class="hs-grid-field"><span>العنوان</span><input data-sc-hero="title" maxlength="80" required value="${esc(h.title)}"></label>
          <label class="hs-grid-field"><span>تكملة العنوان (بلون مميز)</span><input data-sc-hero="accent" maxlength="60" value="${esc(h.accent)}"></label>
          <label class="hs-grid-field"><span>الوصف</span><textarea data-sc-hero="sub" maxlength="200" rows="2">${esc(h.sub)}</textarea></label>
          <label class="hs-grid-field"><span>نص الزر</span><input data-sc-hero="cta" maxlength="30" value="${esc(h.cta)}"></label>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${thumb(imgOf('hero', 'hero', h.media), 'صورة الهيرو')}${pick('data-sc-key', 'hero', 'hero')}${h.media ? '<button type="button" class="adm-btn" data-sc-hero-reset>الصورة الافتراضية</button>' : ''}</div>
        </fieldset>
        <fieldset class="ord-dlg-in"><legend>شرائح «اكتشف خدمات هنصلحلك»</legend>
          ${work.slides.map((s, i) => `<div style="display:grid;gap:8px;padding:12px;border:1px solid var(--border-subtle);border-radius:12px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>شريحة ${i + 1}</b>
              <span style="display:flex;gap:6px"><button type="button" class="adm-btn" data-sc-up="${i}" ${i ? '' : 'disabled'} aria-label="لأعلى">▲</button><button type="button" class="adm-btn" data-sc-down="${i}" ${i < work.slides.length - 1 ? '' : 'disabled'} aria-label="لأسفل">▼</button><button type="button" class="adm-btn" data-sc-del="${i}">حذف</button></span></div>
            <label class="hs-grid-field"><span>العنوان</span><input data-sc-slide="${i}" data-f="title" maxlength="60" value="${esc(s.title)}"></label>
            <label class="hs-grid-field"><span>النص</span><textarea data-sc-slide="${i}" data-f="desc" maxlength="160" rows="2">${esc(s.desc)}</textarea></label>
            <label class="hs-grid-field"><span>نص الزر</span><input data-sc-slide="${i}" data-f="cta" maxlength="30" value="${esc(s.cta)}"></label>
            <label class="hs-grid-field"><span>الزر يفتح</span><select data-sc-slide="${i}" data-f="action">${ACTIONS.map(([v, l]) => `<option value="${v}" ${s.action === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="hs-grid-field"><span>ظاهرة للعملاء</span><input type="checkbox" data-sc-slide="${i}" data-f="active" ${s.active !== false ? 'checked' : ''}></label>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${thumb(imgOf('slide', s.id, s.media), s.title)}${pick('data-sc-key', 'slide', String(i))}${s.media ? `<button type="button" class="adm-btn" data-sc-slide-noimg="${i}">بدون صورة</button>` : ''}</div>
          </div>`).join('')}
          ${work.slides.length < 8 ? '<button type="button" class="adm-btn" data-sc-add>إضافة شريحة</button>' : ''}
        </fieldset>
        <fieldset class="ord-dlg-in"><legend>صور الأقسام والخدمات</legend>${iconRows()}</fieldset>
        <p><button type="button" class="adm-btn adm-btn-p" data-sc-save>حفظ ونشر للعملاء</button></p>
      </section>`;
    }

    host.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.scHero) work.hero[t.dataset.scHero] = t.value;
      if (t.dataset.scSlide !== undefined && t.dataset.f !== 'active' && t.dataset.f !== 'action') work.slides[+t.dataset.scSlide][t.dataset.f] = t.value;
    });
    host.addEventListener('change', async e => {
      const t = e.target;
      if (t.dataset.scGroup !== undefined) { group = t.value; render(); return; }
      if (t.dataset.scSlide !== undefined && t.dataset.f === 'active') work.slides[+t.dataset.scSlide].active = t.checked;
      if (t.dataset.scSlide !== undefined && t.dataset.f === 'action') work.slides[+t.dataset.scSlide].action = t.value;
      if (t.dataset.scFile && t.files && t.files[0]) {
        const kind = t.dataset.scFile, key = t.dataset.scKey;
        status('جارٍ ضغط الصورة ورفعها…');
        try {
          const img = await compress(t.files[0], kind);
          const r = await req('POST', '/admin/media', { kind, data: img.data, w: img.w, h: img.h });
          if (!r.ok) { status(errText(r)); return; }
          previews[r.data.id] = img.data;
          if (kind === 'hero') work.hero.media = r.data.id;
          else if (kind === 'slide') work.slides[+key].media = r.data.id;
          else work.icons[key] = r.data.id;
          render(); status(`تم رفع الصورة (${Math.round(r.data.bytes / 1024)} KB) — اضغط «حفظ ونشر» لتظهر للعملاء.`);
        } catch (err) { status(err.message || 'تعذّر رفع الصورة'); }
      }
    });
    host.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.scUp !== undefined) { const i = +d.scUp; [work.slides[i - 1], work.slides[i]] = [work.slides[i], work.slides[i - 1]]; render(); }
      else if (d.scDown !== undefined) { const i = +d.scDown; [work.slides[i + 1], work.slides[i]] = [work.slides[i], work.slides[i + 1]]; render(); }
      else if (d.scDel !== undefined) { work.slides.splice(+d.scDel, 1); render(); }
      else if (d.scAdd !== undefined) { work.slides.push({ id: 's' + Date.now().toString(36).slice(-6), title: 'شريحة جديدة', desc: '', cta: 'ابدأ طلبك', action: 'wizard', media: null, active: true }); render(); }
      else if (d.scReset !== undefined) { delete work.icons[d.scReset]; render(); }
      else if (d.scHeroReset !== undefined) { work.hero.media = null; render(); }
      else if (d.scSlideNoimg !== undefined) { work.slides[+d.scSlideNoimg].media = null; render(); }
      else if (d.scSave !== undefined) {
        if (!String(work.hero.title || '').trim()) { status('عنوان الهيرو مطلوب'); return; }
        if (work.slides.some(s => !String(s.title || '').trim())) { status('كل شريحة تحتاج عنوانًا'); return; }
        b.disabled = true; status('جارٍ الحفظ والنشر…');
        const r = await req('PATCH', '/admin/content', { hero: work.hero, slides: work.slides, icons: work.icons });
        b.disabled = false;
        status(r.ok ? `تم النشر (الإصدار ${r.data.v}) — تظهر التغييرات للعملاء الآن.` : errText(r));
      }
    });
    render();
  }

  const api = Object.freeze({ mount, compress });
  root.HSSiteContentEditor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
