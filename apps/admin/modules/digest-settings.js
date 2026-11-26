/**
 * MODULE: digest-settings (HSDigestSettings) — the daily / weekly e-mail digests in the Admin Center (live mode only).
 *   mount(host)   owner panel in Admin › الإعدادات: sending status (what is missing), schedule, extra recipients,
 *                 last runs, recipients (e-mails masked), «معاينة الملخص» in a script-free sandboxed iframe and
 *                 «ابعت تجربة لإيميلي»; plus «ملخصاتي».
 *   openMine()    small dialog for ANY admin (header button «الملخصات»): stop / resume my own digest, preview my team's
 *                 digest, send myself a test.
 * Routes: GET/POST /admin/digest/config, GET /admin/digest/preview, POST /admin/digest/test, GET/POST /admin/digest/me
 * (functions/src/digest-admin.js). The server decides who may do what; this module only shows it.
 */
'use strict';
(function (root) {
  const doc = root.document;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = () => root.HSApiClient;
  const live = () => !!(root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase');
  const errText = (r) => (r && r.error && (r.error.details ? Object.values(r.error.details)[0] : r.error.message)) || 'تعذّر تنفيذ الطلب';
  const ar = (n) => Number(n).toLocaleString('ar-EG-u-nu-latn');
  const hourLabel = (h) => `${Number(h).toLocaleString('ar-EG-u-nu-latn', { minimumIntegerDigits: 2 })}:00`;
  const STATUS = { sent: 'اتبعت', partial: 'اتبعت لبعض المستلمين', failed: 'فشل', stored: 'اتجهّز واتخزّن من غير إرسال', sending: 'بيتبعت دلوقتي', skipped: 'اتخطّى' };
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(t); } catch (e) { return iso; } };

  const options = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const hours = Array.from({ length: 24 }, (_, h) => [h, hourLabel(h)]);

  /** «ملخصاتي» + preview / test, shared by the panel and the header dialog */
  function mineHtml(me) {
    const teams = Object.entries(me.teams || {});
    return `<fieldset class="ord-dlg-in dg-mine"><legend>ملخصاتي</legend>
      <label class="hs-grid-field"><span>ابعتلي الملخص اليومي والأسبوعي على إيميلي (${esc(me.email || '—')})</span><input type="checkbox" data-dg-me ${me.off ? '' : 'checked'}></label>
      <div class="dg-actions"><label class="hs-grid-field"><span>النوع</span><select data-dg-type>${options([['daily', 'اليومي'], ['weekly', 'الأسبوعي']], 'daily')}</select></label>
      ${teams.length > 1 ? `<label class="hs-grid-field"><span>الفريق</span><select data-dg-team>${options(teams, me.team)}</select></label>` : `<input type="hidden" data-dg-team value="${esc(me.team)}">`}
      <button type="button" class="adm-btn" data-dg-preview>معاينة الملخص</button><button type="button" class="adm-btn" data-dg-test>ابعت تجربة لإيميلي</button></div>
      <p role="status" aria-live="polite" class="ord-muted" data-dg-status></p>
      <iframe class="dg-frame" title="معاينة الملخص" sandbox="" referrerpolicy="no-referrer" hidden></iframe></fieldset>`;
  }
  function bindMine(host) {
    const say = (m) => { const s = host.querySelector('[data-dg-status]'); if (s) s.textContent = m || ''; };
    const type = () => host.querySelector('[data-dg-type]').value, team = () => host.querySelector('[data-dg-team]').value;
    const box = host.querySelector('[data-dg-me]');
    if (box) box.addEventListener('change', async () => {
      const r = await C().request('POST', '/admin/digest/me', { body: { off: !box.checked } });
      if (!r.ok) { box.checked = !box.checked; say(errText(r)); return; }
      say(box.checked ? 'هتستلم الملخصات على إيميلك.' : 'وقّفنا الملخصات عندك.');
    });
    const pv = host.querySelector('[data-dg-preview]');
    if (pv) pv.addEventListener('click', async () => {
      say('بنجهّز المعاينة…'); pv.disabled = true;
      const r = await C().request('GET', '/admin/digest/preview', { query: { type: type(), team: team() } });
      pv.disabled = false;
      if (!r.ok) { say(errText(r)); return; }
      const f = host.querySelector('.dg-frame'); f.srcdoc = r.data.html; f.hidden = false; say(r.data.subject);
    });
    const tb = host.querySelector('[data-dg-test]');
    if (tb) tb.addEventListener('click', async () => {
      tb.disabled = true;
      const r = await C().request('POST', '/admin/digest/test', { body: { type: type(), team: team() } });
      tb.disabled = false;
      if (!r.ok) say(errText(r));
      else say(r.data.sent ? `اتبعتت تجربة على ${r.data.to}.` : `الإرسال مش مفعّل — ناقص: ${(r.data.missing || []).join(' / ')}`);
    });
  }

  function stateRow(label, s) {
    if (!s) return `<tr><td>${label}</td><td colspan="4">لسه ما اتبعتش</td></tr>`;
    return `<tr><td>${label}</td><td>${esc(s.key || '—')}</td><td>${esc(STATUS[s.status] || s.status || '—')}</td><td>${ar(s.sent || 0)} / ${ar(s.recipients || 0)}${s.failed ? ` (فشل ${ar(s.failed)})` : ''}</td><td>${esc(s.error || '')}${s.at ? `<br><small class="ord-muted">${esc(dt(s.at))}</small>` : ''}</td></tr>`;
  }

  async function mount(host) {
    if (!host || !C() || !live()) return;
    host.innerHTML = '<div aria-busy="true" class="sk sk-bar"></div>';
    const [cfgRes, meRes] = await Promise.all([C().request('GET', '/admin/digest/config'), C().request('GET', '/admin/digest/me')]);
    const mine = meRes.ok ? mineHtml(meRes.data) : '';
    if (!cfgRes.ok) { host.innerHTML = `<section class="adm-live-panel dg-set" aria-label="الملخصات بالإيميل"><h3>الملخصات بالإيميل</h3>${mine}</section>`; bindMine(host); return; }
    const { config: c, state, transport: t, recipients, teams, weekdays } = cfgRes.data;
    const wd = weekdays.map((l, i) => [i, l]);
    host.innerHTML = `<section class="adm-live-panel dg-set" aria-label="الملخصات بالإيميل"><h3>الملخصات اليومية والأسبوعية بالإيميل</h3>
      <p class="ord-muted">أرقام مجمّعة من غير بيانات عملاء. كل فريق بيستلم الجزء الخاص بيه: المالك الكل، والعمليات والدعم، والمالية، والمحتوى، والتقنية. المواعيد بتوقيت القاهرة.</p>
      <p class="dg-transport ${t.configured ? 'is-ok' : 'is-warn'}" role="status">${t.configured ? `الإرسال مفعّل (${esc(t.transport === 'resend' ? 'Resend' : 'SMTP')}).` : `الإرسال مش مفعّل — الملخصات بتتجهّز وتتخزّن بس. ناقص: <b dir="ltr">${t.missing.map(esc).join(' &nbsp;|&nbsp; ')}</b><br><small>حطها في <code dir="ltr">functions/.env</code> وانشر الدوال (الخطوات في docs/DEPLOY_CHECKLIST.md).</small>`}</p>
      <form class="ord-dlg-in" data-dg-form>
        <fieldset><legend>الجدول</legend>
          <label class="hs-grid-field"><span>الملخص اليومي</span><input type="checkbox" name="dOn" ${c.daily.on ? 'checked' : ''}></label>
          <label class="hs-grid-field"><span>الساعة</span><select name="dHour">${options(hours, c.daily.hour)}</select></label>
          <label class="hs-grid-field"><span>الملخص الأسبوعي</span><input type="checkbox" name="wOn" ${c.weekly.on ? 'checked' : ''}></label>
          <label class="hs-grid-field"><span>اليوم</span><select name="wDay">${options(wd, c.weekly.weekday)}</select></label>
          <label class="hs-grid-field"><span>الساعة</span><select name="wHour">${options(hours, c.weekly.hour)}</select></label>
        </fieldset>
        <label class="hs-grid-field"><span>مستلمين إضافيين — واحد في كل سطر: <code dir="ltr">email</code> أو <code dir="ltr">email, ops|finance|content|tech|owner</code> (الافتراضي ops)</span>
          <textarea name="extra" rows="3" dir="ltr" placeholder="partner@example.com, finance">${esc(c.extraRecipients.map((x) => `${x.email}, ${x.team}`).join('\n'))}</textarea></label>
        <p><button type="submit" class="adm-btn adm-btn-p">حفظ</button> <span role="status" aria-live="polite" class="ord-muted" data-dg-save></span></p>
      </form>
      <table class="hs-grid-table dg-table"><caption>آخر إرسال</caption><thead><tr><th scope="col">النوع</th><th scope="col">اليوم</th><th scope="col">الحالة</th><th scope="col">وصل لـ</th><th scope="col">ملاحظة</th></tr></thead><tbody>${stateRow('يومي', state.daily)}${stateRow('أسبوعي', state.weekly)}</tbody></table>
      <details class="dg-rec"><summary>المستلمين (${ar(recipients.length)})</summary><table class="hs-grid-table"><thead><tr><th scope="col">الاسم</th><th scope="col">الفريق</th><th scope="col">الإيميل</th><th scope="col">الحالة</th></tr></thead><tbody>${recipients.map((r) => `<tr><td>${esc(r.name || '—')}</td><td>${esc(teams[r.team] || r.team)}</td><td dir="ltr">${esc(r.email)}</td><td>${r.off ? 'موقّف' : r.source === 'extra' ? 'إضافي' : 'شغّال'}</td></tr>`).join('')}</tbody></table></details>
      ${mine}</section>`;
    bindMine(host);
    const form = host.querySelector('[data-dg-form]'), say = (m) => { const s = host.querySelector('[data-dg-save]'); if (s) s.textContent = m; };
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = form.elements;
      const extra = String(f.extra.value || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [email, team] = l.split(',').map((x) => x.trim()); return team ? { email, team } : { email, team: 'ops' }; });
      say('بنحفظ…');
      const r = await C().request('POST', '/admin/digest/config', { body: { daily: { on: f.dOn.checked, hour: +f.dHour.value }, weekly: { on: f.wOn.checked, weekday: +f.wDay.value, hour: +f.wHour.value }, extraRecipients: extra } });
      say(r.ok ? 'اتحفظ.' : errText(r));
    });
  }

  async function openMine() {
    if (!doc || !live() || !C()) return;
    const me = await C().request('GET', '/admin/digest/me');
    if (!me.ok) { try { root.alert(errText(me)); } catch (e) { /* no dialogs */ } return; }
    const d = doc.createElement('dialog'); d.className = 'ord-dlg dg-dialog'; d.setAttribute('aria-labelledby', 'dg-t');
    d.innerHTML = `<div class="ord-dlg-in"><h2 id="dg-t">الملخصات بالإيميل</h2><p class="ord-muted">فريقك: ${esc(me.data.teamLabel)}</p>${mineHtml(me.data)}<p><button type="button" class="adm-btn" data-dg-close>إغلاق</button></p></div>`;
    doc.body.appendChild(d); bindMine(d);
    d.addEventListener('click', (e) => { if (e.target.closest('[data-dg-close]')) d.close(); });
    d.addEventListener('close', () => d.remove());
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }

  root.HSDigestSettings = Object.freeze({ mount, openMine });
})(typeof globalThis !== 'undefined' ? globalThis : this);
