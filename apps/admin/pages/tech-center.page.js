/**
 * MODULE: tech-center.page — «مركز التقنية» for the engineers / maintenance team.
 * System information only (never customer / provider / order data): status lights, deploy info, grouped errors with
 * «حل / تجاهل», usage & estimated cost vs the monthly budget, latency per route group, limits and emergency switches
 * (read-only). Data: GET /admin/tech/status (functions/src/tech-status.js); refreshes every 60 s while the page is open.
 * Local demo mode has no server to inspect, so it says so instead of showing invented numbers.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n, d = 0) => { try { return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: d }).format(+n || 0); } catch (e) { return String(n); } };
  const live = () => !!(root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase');
  const isOwner = () => { try { const R = root.HSAdminRbac; return !!(R && R.state && R.state.actor === 'owner'); } catch (e) { return false; } };
  const api = () => root.HSApiClient;
  const ago = (iso) => {
    const t = Date.parse(iso); if (!Number.isFinite(t)) return '—';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'من لحظات'; if (s < 3600) return 'من ' + nf(Math.round(s / 60)) + ' دقيقة'; if (s < 86400) return 'من ' + nf(Math.round(s / 3600)) + ' ساعة';
    return 'من ' + nf(Math.round(s / 86400)) + ' يوم';
  };
  const when = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(t); } catch (e) { return iso; } };
  const APP = { customer: 'العميل', provider: 'مقدم الخدمة', admin: 'الإدارة', server: 'السيرفر', other: 'أخرى' };
  const STATE = { ok: ['✓', 'سليم', 'ok'], warn: ['!', 'بطيء', 'warn'], down: ['✗', 'واقع', 'down'], unknown: ['—', 'غير معروف', 'unknown'] };
  const AREAS = [['firestore', 'قاعدة البيانات'], ['rtdb', 'الإشارات اللحظية'], ['auth', 'تسجيل الدخول']];

  function reportText(g) {
    return [`[هنصلحلك] خطأ في ${APP[g.app] || g.app} — اتكرر ${g.count} مرة`, `الرسالة: ${g.msg}`, `المكان: ${g.src || '—'}`, `الشاشة: ${g.route || '—'}`,
      `أول مرة: ${g.first || '—'} · آخر مرة: ${g.last || '—'}`, g.stack ? 'التتبع:\n' + g.stack : ''].filter(Boolean).join('\n');
  }
  function copy(text) {
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) return root.navigator.clipboard.writeText(text).then(() => true, () => fallback(text));
    return Promise.resolve(fallback(text));
  }
  function fallback(text) {
    try { const t = root.document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; root.document.body.appendChild(t); t.select(); const ok = root.document.execCommand('copy'); t.remove(); return ok; } catch (e) { return false; }
  }

  /* ───── markup ───── */
  const light = (name, a, extra) => {
    const s = STATE[(a && a.state) || 'unknown'] || STATE.unknown;
    return `<div class="tech-light is-${s[2]}" role="group" aria-label="${esc(name)}: ${s[1]}"><span class="tech-light-ic" aria-hidden="true">${s[0]}</span><div><b>${esc(name)}</b><small>${s[1]}${a && a.ms != null ? ' · ' + nf(a.ms) + ' مللي ثانية' : ''}${extra ? ' · ' + esc(extra) : ''}</small>${a && a.error ? `<small class="tech-err">${esc(a.error)}</small>` : ''}</div></div>`;
  };
  function lightsHtml(d) {
    const o = d.clocks && d.clocks.offers;
    const clock = o ? { state: !o.ok ? 'down' : o.stale ? 'warn' : 'ok', ms: null } : { state: 'unknown' };
    return `<section class="tech-card" aria-labelledby="tech-h-health"><div class="tech-head"><h2 id="tech-h-health">حالة الأنظمة</h2><span class="tech-pill is-${(STATE[d.health.overall] || STATE.unknown)[2]}">${(STATE[d.health.overall] || STATE.unknown)[0]} ${(STATE[d.health.overall] || STATE.unknown)[1]}</span></div>
      <div class="tech-lights">${AREAS.map(([k, n]) => light(n, d.health.areas[k])).join('')}${light('ساعة جولات العروض', clock, o ? ago(o.at) : 'لسه ما اشتغلتش')}</div>
      <p class="tech-note">آخر فحص ${esc(ago(d.health.checkedAt))} (${d.health.source === 'live' ? 'فحص جديد' : 'من آخر فحص دوري كل ١٠ دقايق'}).</p></section>`;
  }
  function deployHtml(d) {
    const dep = d.deploy;
    return `<section class="tech-card" aria-labelledby="tech-h-deploy"><h2 id="tech-h-deploy">النشر والنسخة</h2><dl class="tech-facts">
      <div><dt>آخر نسخة كود اتشافت</dt><dd>${dep ? esc(when(dep.firstSeenAt)) + ' <small>(' + esc(ago(dep.firstSeenAt)) + ')</small>' : 'لسه ما اتسجّلتش'}</dd></div>
      <div><dt>النشر المسجّل بالسكريبت</dt><dd>${dep && dep.release ? `<span dir="ltr">${esc(dep.release.commit)}</span> · <span dir="ltr">${esc(dep.release.cache)}</span> · ${esc(ago(dep.release.at))}` : 'مفيش — شغّل <span dir="ltr">npm run deploy:record</span> بعد النشر'}</dd></div>
      <div><dt>البيئة</dt><dd><span dir="ltr">Node ${esc(String(d.runtime.node).replace(/^v/, ''))} · ${esc(d.runtime.region)}</span></dd></div></dl></section>`;
  }
  function errorsHtml(d) {
    const e = d.errors, groups = e.groups;
    const rows = groups.map((g) => `<li class="tech-error is-${esc(g.status)}" data-err="${esc(g.id)}">
      <div class="tech-error-top"><span class="tech-tag">${esc(APP[g.app] || g.app)}</span><b>${esc(nf(g.count))}×</b><small>${esc(ago(g.last))}${g.reopened ? ' · رجع بعد ما اتحل' : ''}</small>${g.status !== 'open' ? `<span class="tech-tag is-muted">${g.status === 'resolved' ? 'اتحل' : 'متجاهَل'}</span>` : ''}</div>
      <p class="tech-error-msg">${esc(g.msg)}</p><small class="tech-error-src" dir="ltr">${esc(g.src)}${g.route ? ' · ' + esc(g.route) : ''}</small>
      <details class="tech-stack"><summary>التتبع</summary><pre dir="ltr">${esc(g.stack || 'لا يوجد تتبع')}</pre></details>
      <div class="tech-actions">${g.status === 'open' ? `<button type="button" class="adm-btn" data-err-set="resolved" data-id="${esc(g.id)}">حل</button><button type="button" class="adm-btn" data-err-set="ignored" data-id="${esc(g.id)}">تجاهل</button>` : `<button type="button" class="adm-btn" data-err-set="open" data-id="${esc(g.id)}">إعادة فتح</button>`}<button type="button" class="adm-btn" data-err-copy="${esc(g.id)}">نسخ التقرير</button></div></li>`).join('');
    return `<section class="tech-card" aria-labelledby="tech-h-errors"><div class="tech-head"><h2 id="tech-h-errors">الأخطاء <span class="tech-count">${nf(e.counts.open)} مفتوحة</span></h2>${e.counts.open ? '<button type="button" class="adm-btn" data-err-copy-all>نسخ كل المفتوحة</button>' : ''}</div>
      ${groups.length ? `<ol class="tech-errors">${rows}</ol><p class="tech-note">أعلى ${nf(groups.length)} مجموعة من ${nf(e.counts.total)} (المفتوحة الأول). الرسائل بتتنضّف من الأرقام والإيميلات وأرقام الطلبات قبل ما تظهر.</p>` : '<p class="tech-empty">مفيش أخطاء متسجلة.</p>'}</section>`;
  }
  const bar = (label, value, max, text, level) => `<div class="tech-bar"><div class="tech-bar-l"><span>${esc(label)}</span><b>${esc(text)}</b></div><div class="tech-bar-t" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(max ? value / max * 100 : 0))}"><i class="is-${esc(level || 'ok')}" style="width:${Math.min(100, Math.round(max ? value / max * 100 : 0))}%"></i></div></div>`;
  function usageHtml(d) {
    const c = d.cost, t = d.usage.today, LV = { ok: 'ok', watch: 'warn', warn: 'warn', critical: 'down', unknown: 'unknown' }, MSG = { ok: 'ضمن الميزانية', watch: 'قربت من الميزانية', warn: 'عدّت الميزانية', critical: 'عدّت الميزانية بكتير', unknown: 'الميزانية مش مضبوطة' };
    const owner = isOwner();
    return `<section class="tech-card" aria-labelledby="tech-h-usage"><h2 id="tech-h-usage">الاستخدام والتكلفة</h2>
      ${bar('المتوقع للشهر', c.projectedEGP, c.budgetEGP * 1.3 || c.projectedEGP || 1, `${nf(c.projectedEGP)} من ${nf(c.budgetEGP)} ج.م`, LV[c.level])}
      <p class="tech-note"><b class="tech-lv is-${LV[c.level]}">${MSG[c.level]}</b> · لحد دلوقتي ${nf(c.monthToDateEGP)} ج.م (يوم ${nf(c.daysElapsed)} من ${nf(c.daysInMonth)}). ${esc(c.note)}.</p>
      <dl class="tech-grid"><div><dt>طلبات API النهارده</dt><dd>${nf(t.api)}</dd></div><div><dt>مزامنات</dt><dd>${nf(t.session)}</dd></div><div><dt>قراءات قاعدة البيانات</dt><dd>${nf(t.reads)}</dd></div><div><dt>كتابات</dt><dd>${nf(t.writes)}</dd></div><div><dt>إشعارات موبايل</dt><dd>${nf(t.pushes)}</dd></div><div><dt>أخطاء سيرفر</dt><dd>${nf(t.errors)}</dd></div></dl>
      ${owner ? `<form class="tech-budget" data-budget-form><label class="hs-grid-field"><span>الميزانية الشهرية (ج.م)</span><input name="budgetEGP" type="number" inputmode="numeric" min="1" step="1" value="${esc(c.budgetEGP)}" required></label><label class="hs-grid-field"><span>سعر الدولار (ج.م)</span><input name="usdToEgp" type="number" inputmode="decimal" min="1" step="0.01" value="${esc(c.usdToEgp)}" required></label><button type="submit" class="adm-btn adm-btn-p">حفظ</button><span role="status" aria-live="polite" class="ord-muted" data-budget-status></span></form>` : ''}</section>`;
  }
  function perfHtml(d) {
    const p = d.performance, scope = d.performanceScope === 'today' ? 'النهارده' : 'الشهر';
    const rows = p.groups.map((g) => `<div role="row" class="tech-row${g.slow ? ' is-slow' : ''}"><span role="rowheader">${esc(g.label)}</span><span role="cell">${nf(g.count)}</span><span role="cell">${g.p50 == null ? '—' : nf(g.p50)}</span><span role="cell">${g.p95 == null ? '—' : (g.p95 >= p.cappedAt ? '+' : '') + nf(g.p95)}</span></div>`).join('');
    return `<section class="tech-card" aria-labelledby="tech-h-perf"><h2 id="tech-h-perf">السرعة (${scope})</h2>
      ${p.groups.length ? `<div role="table" class="tech-table" aria-label="زمن الاستجابة بالمللي ثانية لكل مجموعة طلبات"><div role="row" class="tech-row tech-row-h"><span role="columnheader">المجموعة</span><span role="columnheader">طلبات</span><span role="columnheader">P50 (ms)</span><span role="columnheader">P95 (ms)</span></div>${rows}</div>` : '<p class="tech-empty">لسه مفيش طلبات متسجلة.</p>'}
      <p class="tech-note">نسبة أخطاء السيرفر: <b>${nf(p.errorRate * 100, 1)}٪</b> من ${nf(p.calls)} طلب · مرفوضة (٤xx): ${nf(p.rejected)}. الأزمنة تقريبية (أعلى حد للفئة).</p></section>`;
  }
  function limitsHtml(d) {
    const l = d.limits, yes = (v, a, b) => `<b class="tech-lv is-${v ? 'warn' : 'ok'}">${v ? a : b}</b>`;
    return `<section class="tech-card" aria-labelledby="tech-h-limits"><h2 id="tech-h-limits">الحدود والطوارئ</h2><dl class="tech-facts">
      <div><dt>طلبات اتوقفت بحد المعدل (النهارده)</dt><dd>${nf(l.rateLimitedToday)}</dd></div>
      <div><dt>App Check</dt><dd><b class="tech-lv is-${l.appCheckEnforced ? 'ok' : 'warn'}">${l.appCheckEnforced ? 'مفعّل' : 'مقفول'}</b></dd></div>
      <div><dt>وضع الصيانة</dt><dd>${yes(l.maintenance, 'شغّال', 'مقفول')}</dd></div><div><dt>إيقاف الطلبات الجديدة</dt><dd>${yes(l.pauseOrders, 'شغّال', 'مقفول')}</dd></div><div><dt>إيقاف تسجيل المزودين</dt><dd>${yes(l.pauseSignups, 'شغّال', 'مقفول')}</dd></div></dl>
      <p class="tech-note">المفاتيح للقراءة فقط هنا — التشغيل من «الطوارئ والصيانة» (للمالك).</p></section>`;
  }
  const view = (d) => lightsHtml(d) + errorsHtml(d) + usageHtml(d) + perfHtml(d) + deployHtml(d) + limitsHtml(d);

  /* ───── page ───── */
  function render(ctx) {
    const wrap = root.document.createElement('div'); wrap.className = 'tech';
    if (!live()) { wrap.innerHTML = '<div class="adm-state"><h2>غير متصل بالسيرفر</h2><p>مركز التقنية بيعرض حالة السيرفر الحقيقي، ومفيش سيرفر في وضع العرض المحلي. افتح لوحة الإدارة على الموقع الحقيقي.</p></div>'; return wrap; }
    let data = null, timer = 0, busy = false;
    const live_ = () => `<p class="tech-bar-top" role="status" aria-live="polite" data-tech-status></p>`;
    const status = (m) => { const n = wrap.querySelector('[data-tech-status]'); if (n) n.textContent = m || ''; };
    const paint = () => {
      const keepOpen = [...wrap.querySelectorAll('details[open]')].map((d) => d.closest('[data-err]') && d.closest('[data-err]').dataset.err).filter(Boolean);
      wrap.innerHTML = `<div class="tech-toolbar"><button type="button" class="adm-btn adm-btn-p" data-tech-check>تشغيل فحص الآن</button><button type="button" class="adm-btn" data-tech-refresh>تحديث</button><small class="ord-muted">${data ? 'اتحدّث ' + esc(ago(data.generatedAt)) + ' · تحديث تلقائي كل دقيقة' : ''}</small></div>${live_()}${data ? view(data) : '<div aria-busy="true" role="status" aria-label="جارٍ التحميل"><div class="sk sk-bar"></div><div class="sk-card"><span class="sk sk-line w80"></span><span class="sk sk-line w60"></span></div></div>'}`;
      keepOpen.forEach((id) => { const d = wrap.querySelector(`[data-err="${id}"] details`); if (d) d.open = true; });
    };
    async function load(msg) {
      if (busy) return; busy = true;
      try {
        const r = await api().request('GET', '/admin/tech/status');
        if (!r.ok) { wrap.innerHTML = `<div class="adm-state"><h2>تعذّر تحميل حالة النظام</h2><p>${esc((r.error && r.error.message) || 'خطأ غير معروف')}</p><button type="button" class="adm-btn" data-tech-refresh>إعادة المحاولة</button></div>`; return; }
        data = r.data; paint(); if (msg) status(msg);
      } catch (e) { status('تعذّر الاتصال بالسيرفر.'); } finally { busy = false; }
    }
    paint(); load();
    timer = root.setInterval(() => { if (ctx && ctx.signal && ctx.signal.aborted) { root.clearInterval(timer); return; } if (root.document.visibilityState !== 'hidden') load(); }, 60000);
    if (ctx && ctx.signal && ctx.signal.addEventListener) ctx.signal.addEventListener('abort', () => root.clearInterval(timer));

    wrap.addEventListener('click', async (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-tech-refresh')) return load('اتحدّثت البيانات.');
      if (t.hasAttribute('data-tech-check')) {
        t.disabled = true; status('بنفحص الأنظمة…');
        const r = await api().request('POST', '/admin/tech/check', { body: {} });
        t.disabled = false;
        if (!r.ok) return status((r.error && r.error.message) || 'تعذّر الفحص.');
        await load('خلص الفحص: ' + ((STATE[r.data.overall] || STATE.unknown)[1]) + '.'); return;
      }
      if (t.dataset.errSet) {
        t.disabled = true;
        const r = await api().request('POST', '/admin/tech/errors/' + encodeURIComponent(t.dataset.id), { body: { status: t.dataset.errSet } });
        if (!r.ok) { t.disabled = false; return status((r.error && r.error.message) || 'تعذّر التحديث.'); }
        return load(({ resolved: 'اتعلّم إنه اتحل.', ignored: 'اتجاهلنا الخطأ ده.', open: 'اتفتح تاني.' })[t.dataset.errSet]);
      }
      if (t.dataset.errCopy && data) { const g = data.errors.groups.find((x) => x.id === t.dataset.errCopy); if (g) return status((await copy(reportText(g))) ? 'اتنسخ التقرير — الصقه في البلاغ.' : 'تعذّر النسخ.'); }
      if (t.hasAttribute('data-err-copy-all') && data) { const txt = data.errors.groups.filter((g) => g.status === 'open').map(reportText).join('\n\n———\n\n'); return status((await copy(txt)) ? 'اتنسخت كل الأخطاء المفتوحة.' : 'تعذّر النسخ.'); }
    });
    wrap.addEventListener('submit', async (e) => {
      const f = e.target.closest('[data-budget-form]'); if (!f) return; e.preventDefault();
      const r = await api().request('POST', '/admin/tech/config', { body: { budgetEGP: Number(f.budgetEGP.value), usdToEgp: Number(f.usdToEgp.value) } });
      if (!r.ok) { const s = f.querySelector('[data-budget-status]'); if (s) s.textContent = (r.error && r.error.message) || 'تعذّر الحفظ.'; return; }
      await load('اتحفظت الميزانية.');
    });
    return wrap;
  }

  const pageApi = { render, reportText, STATE };
  root.HSAdminTechCenterPage = pageApi;
  if (typeof module !== 'undefined' && module.exports) module.exports = pageApi;
  if (root.HSAdminShell && typeof root.HSAdminShell.registerPage === 'function') {
    root.HSAdminShell.registerPage('tech', {
      title: 'مركز التقنية',
      description: 'حالة الأنظمة والأخطاء والتكلفة والسرعة للفريق التقني — معلومات النظام بس، من غير أي بيانات عملاء.',
      render
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
