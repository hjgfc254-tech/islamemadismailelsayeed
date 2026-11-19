/**
 * MODULE: ai-assist (HSAiAssist) — «اكتب مشكلتك بكلامك» and «صوّر المشكلة» on the customer Home.
 * The server (session op `ai`) maps the words / photo to a catalogue item + problem; the customer confirms
 * («أيوه، كمّل» opens the request on the details screen) or picks manually. Shown only when the admin switched the feature
 * on (public flags settings.ai = {text, photo}) and the app runs on the real server. No «AI» wording in the UI.
 * Uses Customer app globals: MP, CAT, esc, ic, sheet, closeSheet, toast, show, startRequest.
 */
'use strict';
(function (root) {
  const flags = () => { try { return (root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase' && root.HSBackend && typeof root.HSBackend.ai === 'function') ? ((MP.db().settings || {}).ai || {}) : {}; } catch (e) { return {}; } };
  let last = null;                                     // {result, text}

  /* photo → small JPEG/WebP data URL for analysis (never stored) */
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let q = 0.75, out = c.toDataURL('image/jpeg', q);
        while (out.length > 400000 && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
      img.src = url;
    });
  }

  function loading(msg) { sheet(`<div class="ai-wait" role="status"><span class="ai-dots" aria-hidden="true"><i></i><i></i><i></i></span><b>${esc(msg)}</b><small>ثواني وهنقولك</small></div>`); }

  function showResult(r, text) {
    last = { result: r, text };
    if (!r || !r.item) {
      sheet(`<h4>${ic('search')} مش قادرين نحدد بالظبط</h4><div class="sub">اختار القسم وإحنا نكمّل معاك</div>${typeof tiles === 'function' ? tiles(true) : ''}`);
      return;
    }
    const extra = [r.brand && ['الماركة', r.brand], r.model && ['الموديل', r.model], r.code && ['كود العطل', r.code]].filter(Boolean);
    sheet(`<h4>${ic('check')} فهمنا إن المشكلة:</h4>
      <div class="ai-pick">${typeof icImg === 'function' && icImg('c-' + r.cat) ? `<span class="ai-ic">${icImg('c-' + r.cat)}</span>` : ''}<span><small>${esc(r.catName)}</small><b>${esc(r.itemName)}${r.problemName ? ` ← ${esc(r.problemName)}` : ''}</b></span></div>
      ${extra.length ? `<ul class="ai-facts">${extra.map(([k, v]) => `<li><small>${k}</small><b dir="auto">${esc(v)}</b></li>`).join('')}</ul>` : ''}
      <div class="row2 ai-actions"><button type="button" class="cta" data-ai-accept>${ic('check')} أيوه، كمّل</button><button type="button" class="cta ghost" data-ai-manual>لأ، هختار بنفسي</button></div>`);
  }

  async function routeText(text) {
    loading('بنحدد المشكلة…');
    try { showResult(await root.HSBackend.ai({ kind: 'text', text }), text); }
    catch (e) { closeSheet(true); toast((e && e.message) || 'مش قادرين نحدد دلوقتي — اختار بنفسك'); }
  }
  async function routePhoto(file) {
    loading('بنشوف الصورة…');
    try { const image = await shrink(file); showResult(await root.HSBackend.ai({ kind: 'photo', image }), ''); }
    catch (e) { closeSheet(true); toast((e && e.message) || 'مش قادرين نحلل الصورة — اختار القسم بنفسك'); return false; }
    return true;
  }

  function accept() {
    const r = last && last.result; if (!r || !r.item) return;
    closeSheet(true);
    startRequest(r.cat, r.item);
    if (typeof WZ !== 'undefined' && WZ) {
      if (r.problem) WZ.problem = r.problem;
      const desc = (last.text || r.summary || '').trim(); if (desc) WZ.desc = desc;
      const facts = [r.brand && 'الماركة: ' + r.brand, r.model && 'الموديل: ' + r.model, r.code && 'كود العطل: ' + r.code].filter(Boolean).join(' • ');
      if (facts) WZ.note = facts;
      WZ.step = r.problem ? 3 : 2;
      show('wizard');
    }
  }

  /* «وجّهني» under the Home search once the customer types a sentence */
  document.addEventListener('input', (e) => {
    if (!e.target || e.target.id !== 'q' || !flags().text) return;
    const box = e.target.closest('.hero-search'); if (!box) return;
    let b = document.getElementById('ai-guide');
    const v = e.target.value.trim();
    if (v.length < 8 || v.split(/\s+/).length < 2) { if (b) b.hidden = true; return; }
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.id = 'ai-guide'; b.className = 'ai-guide'; b.innerHTML = `${ic('send')}<span>وجّهني للمشكلة دي</span>`; box.insertAdjacentElement('afterend', b); }
    b.hidden = false;
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('#ai-guide,[data-ai-accept],[data-ai-manual]'); if (!t) return;
    e.preventDefault();
    if (t.id === 'ai-guide') { const q = document.getElementById('q'); if (q && q.value.trim()) routeText(q.value.trim()); return; }
    if (t.hasAttribute('data-ai-accept')) return accept();
    if (t.hasAttribute('data-ai-manual')) sheet(`<h4>${ic('grid')} اختار القسم</h4>${typeof tiles === 'function' ? tiles(true) : ''}`);
  });

  root.HSAiAssist = Object.freeze({ flags, routePhoto, routeText, showResult });
})(typeof globalThis !== 'undefined' ? globalThis : this);
