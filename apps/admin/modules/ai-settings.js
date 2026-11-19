/**
 * MODULE: ai-settings (HSAiSettings) — Admin Center editor for the AI providers behind «اكتب مشكلتك» / «صوّر المشكلة»
 * (GET/PATCH /admin/ai, POST /admin/ai/test). Keys are typed here and sent once; the server only ever returns the last
 * 4 characters, and an empty key field keeps the saved key. Order in the list = priority (the next one is used when one
 * fails). Live (Firebase) mode only: the AI calls run on the server.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = () => root.HSApiClient;
  const errText = (r) => (r && r.error && (r.error.details ? Object.values(r.error.details)[0] : r.error.message)) || 'تعذّر الحفظ';
  const KINDS = [['deepseek', 'DeepSeek'], ['gemini', 'Google Gemini'], ['openai', 'متوافق مع OpenAI (رابط مخصص)']];
  const MODEL_HINT = { deepseek: 'deepseek-chat', gemini: 'gemini-2.5-flash', openai: 'gpt-4o-mini' };

  async function mount(host) {
    if (!host || !C()) return;
    const res = await C().request('GET', '/admin/ai');
    if (!res.ok) { host.innerHTML = `<p>${esc(errText(res))}</p>`; return; }
    const work = { features: { ...res.data.features }, dailyLimit: res.data.dailyLimit, globalDailyLimit: res.data.globalDailyLimit,
      providers: res.data.providers.map((p) => ({ ...p, apiKey: '' })) };
    const status = (m) => { const s = host.querySelector('[data-ai-status]'); if (s) s.textContent = m || ''; };

    function render() {
      host.innerHTML = `<section class="adm-live-panel ai-set" aria-label="التوجيه الذكي">
        <h3>التوجيه الذكي (اكتب مشكلتك / صوّر المشكلة)</h3>
        <p class="ord-muted">العميل يكتب مشكلته بكلامه أو يصوّرها، والخادم يختار القسم والجهاز والمشكلة من قائمتك. بيتبعت نص المشكلة أو الصورة بس — من غير اسم أو رقم أو عنوان، والصور مش بتتحفظ. لو كل المزوّدين وقعوا، العميل بيختار بإيده عادي.</p>
        <p data-ai-status role="status" aria-live="polite" class="ord-muted"></p>
        <fieldset class="ord-dlg-in"><legend>تشغيل</legend>
          <label class="hs-grid-field"><span>«اكتب مشكلتك» (نص)</span><input type="checkbox" data-ai-f="text" ${work.features.text ? 'checked' : ''}></label>
          <label class="hs-grid-field"><span>«صوّر المشكلة» (صور — محتاج مزوّد بيفهم الصور زي Gemini)</span><input type="checkbox" data-ai-f="photo" ${work.features.photo ? 'checked' : ''}></label>
          <label class="hs-grid-field"><span>الحد لكل عميل في اليوم</span><input type="number" min="0" max="500" data-ai-n="dailyLimit" value="${esc(work.dailyLimit)}"></label>
          <label class="hs-grid-field"><span>الحد للمنصة كلها في اليوم (حماية للتكلفة)</span><input type="number" min="0" max="100000" data-ai-n="globalDailyLimit" value="${esc(work.globalDailyLimit)}"></label>
        </fieldset>
        <fieldset class="ord-dlg-in"><legend>المزوّدين — بالترتيب (لو واحد وقع بيستخدم اللي بعده)</legend>
          ${work.providers.length ? work.providers.map((p, i) => `<div class="mk-row ai-row ${p.enabled ? '' : 'is-off'}" data-i="${i}">
            <label class="hs-grid-field"><span>الاسم</span><input data-ai-p="label" value="${esc(p.label)}" maxlength="40"></label>
            <label class="hs-grid-field"><span>المزوّد</span><select data-ai-p="kind">${KINDS.map(([v, l]) => `<option value="${v}" ${p.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="hs-grid-field"><span>الموديل</span><input data-ai-p="model" value="${esc(p.model)}" placeholder="${esc(MODEL_HINT[p.kind] || '')}" dir="ltr"></label>
            ${p.kind === 'openai' ? `<label class="hs-grid-field"><span>الرابط (https://…/v1)</span><input data-ai-p="baseUrl" value="${esc(p.baseUrl)}" dir="ltr"></label>` : ''}
            <label class="hs-grid-field"><span>مفتاح API ${p.hasKey ? `(محفوظ …${esc(p.keyLast4)} — سيبه فاضي عشان يفضل)` : ''}</span><input type="password" data-ai-p="apiKey" autocomplete="off" dir="ltr" placeholder="${p.hasKey ? '••••••••' : 'الصق المفتاح هنا'}"></label>
            <label class="hs-grid-field"><span>نص</span><input type="checkbox" data-ai-role="text" ${p.roles.includes('text') ? 'checked' : ''}></label>
            <label class="hs-grid-field"><span>صور</span><input type="checkbox" data-ai-role="vision" ${p.roles.includes('vision') ? 'checked' : ''}></label>
            <label class="hs-grid-field"><span>شغّال</span><input type="checkbox" data-ai-p="enabled" ${p.enabled ? 'checked' : ''}></label>
            <span class="ai-actions"><button type="button" class="adm-btn" data-ai-up="${i}" ${i ? '' : 'disabled'} aria-label="أعلى">▲</button><button type="button" class="adm-btn" data-ai-down="${i}" ${i < work.providers.length - 1 ? '' : 'disabled'} aria-label="أسفل">▼</button>
              ${p.id ? `<button type="button" class="adm-btn" data-ai-test="${i}">تجربة</button>` : ''}<button type="button" class="adm-btn" data-ai-del="${i}">حذف</button></span>
            <p class="ord-muted ai-test-out" data-ai-out="${i}"></p></div>`).join('') : '<p class="ord-muted">مفيش مزوّدين لسه — ضيف واحد.</p>'}
          ${work.providers.length < 10 ? '<p class="ai-add"><button type="button" class="adm-btn" data-ai-add="deepseek">+ DeepSeek</button><button type="button" class="adm-btn" data-ai-add="gemini">+ Gemini</button><button type="button" class="adm-btn" data-ai-add="openai">+ مزوّد متوافق مع OpenAI</button></p>' : ''}
        </fieldset>
        <p><button type="button" class="adm-btn adm-btn-p" data-ai-save>حفظ</button></p>
      </section>`;
    }
    const row = (t) => work.providers[+t.closest('[data-i]').dataset.i];
    const onEdit = (e) => {
      const t = e.target, d = t.dataset;
      if (d.aiF) work.features[d.aiF] = t.checked;
      if (d.aiN) work[d.aiN] = Number(t.value);
      if (d.aiP) { const p = row(t); p[d.aiP] = t.type === 'checkbox' ? t.checked : t.value; if (d.aiP === 'kind') { p.model = ''; render(); } }
      if (d.aiRole) { const p = row(t); p.roles = t.checked ? [...new Set(p.roles.concat(d.aiRole))] : p.roles.filter((r) => r !== d.aiRole); }
    };
    host.addEventListener('input', onEdit);
    host.addEventListener('change', onEdit);
    host.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.aiAdd) { work.providers.push({ id: '', label: d.aiAdd === 'deepseek' ? 'DeepSeek ' + (work.providers.filter((p) => p.kind === 'deepseek').length + 1) : d.aiAdd === 'gemini' ? 'Gemini' : 'مزوّد', kind: d.aiAdd, model: '', baseUrl: '', apiKey: '', roles: d.aiAdd === 'gemini' ? ['text', 'vision'] : ['text'], enabled: true, hasKey: false }); render(); return; }
      if (d.aiDel !== undefined) { work.providers.splice(+d.aiDel, 1); render(); return; }
      if (d.aiUp !== undefined) { const i = +d.aiUp; [work.providers[i - 1], work.providers[i]] = [work.providers[i], work.providers[i - 1]]; render(); return; }
      if (d.aiDown !== undefined) { const i = +d.aiDown; [work.providers[i + 1], work.providers[i]] = [work.providers[i], work.providers[i + 1]]; render(); return; }
      if (d.aiTest !== undefined) {
        const p = work.providers[+d.aiTest], out = host.querySelector(`[data-ai-out="${d.aiTest}"]`);
        if (out) out.textContent = 'جارٍ التجربة…';
        const r = await C().request('POST', '/admin/ai/test', { body: { id: p.id } });
        if (out) out.textContent = r.ok ? (r.data.ok ? `شغّال ✓ (${r.data.ms} ms) — فهم: ${r.data.result.itemName || '؟'}${r.data.result.problemName ? ' ← ' + r.data.result.problemName : ''}` : `مش شغّال (${r.data.ms} ms): ${r.data.error || 'رد غير مفهوم'}`) : errText(r);
        return;
      }
      if (d.aiSave !== undefined) {
        b.disabled = true; status('جارٍ الحفظ…');
        const r = await C().request('PATCH', '/admin/ai', { body: { features: work.features, dailyLimit: work.dailyLimit, globalDailyLimit: work.globalDailyLimit,
          providers: work.providers.map((p) => ({ id: p.id || undefined, label: p.label, kind: p.kind, model: p.model, baseUrl: p.baseUrl, apiKey: p.apiKey || undefined, roles: p.roles, enabled: p.enabled })) } });
        b.disabled = false;
        if (r.ok) { work.providers = r.data.providers.map((p) => ({ ...p, apiKey: '' })); render(); status('تم الحفظ. المفاتيح محفوظة على الخادم بس.'); }
        else status(errText(r));
      }
    });
    render();
  }

  const api = Object.freeze({ mount });
  root.HSAiSettings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
