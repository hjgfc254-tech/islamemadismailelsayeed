/**
 * MODULE: support-chat (HSSupportChat) — «مساعد هنصلحلك», the AI support employee chat (2026-11-25).
 * Live mode: every message goes to the server (session op `chat`, functions/src/support-chat.js) which runs the model,
 * the tools and all the security layers; this file only draws the conversation. Replies are rendered as TEXT (esc), never HTML.
 * Prepared actions arrive as server-built cards; nothing is created / cancelled / sent until the customer presses the
 * card's confirm button. Local demo mode: fixed on-device answers, clearly labelled as a demo (no model, no server).
 * Opened by any element with [data-chat-open] (support centre row). Uses Customer app globals when present:
 * esc, ic, toast, show, go, openRoute, me, MP, Support.
 */
'use strict';
(function (root) {
  const live = () => !!(root.HSFirebaseConfig && root.HSFirebaseConfig.mode === 'firebase' && root.HSBackend && typeof root.HSBackend.chat === 'function');
  const enabled = () => { if (!live()) return true; try { return !!(((MP.db().settings || {}).ai || {}).chat); } catch (e) { return false; } };
  const E = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const I = (n) => (typeof ic === 'function' ? ic(n) : '');
  const say = (m) => (typeof toast === 'function' ? toast(m) : void 0);
  const QUICK = ['فين طلبي؟', 'عايز فني تكييف', 'الفني بعت سعر', 'عايز ألغي طلب', 'المشكلة رجعت', 'عندي شكوى'];
  const LINK = { home: 'الرئيسية', orders: 'طلباتي', order: 'افتح الطلب', new_request: 'اطلب خدمة', account: 'حسابي', addresses: 'عناويني', my_home: '«بيتي»', support: 'مركز الدعم', complaint: 'تقديم شكوى' };
  let state = { messages: [], cards: [], busy: false }, box = null, lastFocus = null;

  /* ── demo answers (local mode only — no model, no server) ── */
  function demoReply(text) {
    const t = text.replace(/[أإآ]/g, 'ا');
    let reqs = [];
    try { const u = typeof me === 'function' ? me() : null; reqs = u ? MP.reqs().filter((r) => r.customerId === u.id).slice(0, 3) : []; } catch (e) { /* demo */ }
    if (/غاز|شرار|ماس|كهربا.*(مي|ميا)|حريق/.test(t)) return 'سلامتك أولًا: لو فيه ريحة غاز اقفل المحبس وافتح الشبابيك واتصل 129. حريق 180، إسعاف 123، طوارئ الكهرباء 121.';
    if (/فين|طلبي|حال/.test(t)) return reqs.length ? 'طلباتك الأخيرة: ' + reqs.map((r) => (r.no || r.id) + ' — ' + ((MP.STATUS_LABEL || {})[r.status] || r.status)).join('، ') + '.' : 'مفيش طلبات على الحساب ده لسه. تحب تطلب خدمة؟';
    if (/الغ/.test(t)) return 'تقدر تلغي من «طلباتي» ← الطلب ← إلغاء. الإلغاء مجاني طول ما الفني ما اتحركش.';
    if (/شكو|زعلان|وحش/.test(t)) return 'آسفين جدًا. ابعت الشكوى من «مركز الدعم» ← «تقديم شكوى» وهنتابعها.';
    if (/دفع|فلوس|سعر|بكام/.test(t)) return 'الدفع كاش للفني بعد ما الشغل يخلص، والسعر بيظهر لك قبل ما توافق ومايتغيرش إلا بموافقتك.';
    if (/عايز|محتاج|فني|تصليح/.test(t)) return 'تمام! اضغط «اطلب خدمة الآن» من الرئيسية واختار القسم — في النسخة الحقيقية أقدر أجهّز لك الطلب هنا وتأكده بضغطة.';
    return 'أنا المساعد التجريبي. في النسخة الحقيقية بفهم كلامك وبتابع طلباتك وبجهّز طلب أو إلغاء أو شكوى تأكدها بضغطة.';
  }

  /* ── drawing ── */
  const fmt = (s) => E(s).replace(/\n/g, '<br>');
  function bubble(m) {
    if (m.role === 'sys') return `<li class="hc-sys">${E(m.text)}</li>`;
    const mine = m.role === 'me';
    return `<li class="hc-msg ${mine ? 'me' : 'bot'}${m.fail ? ' fail' : ''}${m.ok ? ' ok' : ''}"><p dir="auto">${fmt(m.text)}</p>${m.handoff ? `<small class="hc-tag">${I('user')} اتحوّلت لموظف — هيكلمك على رقمك</small>` : ''}${Array.isArray(m.links) && m.links.length ? `<div class="hc-links">${m.links.filter((l) => LINK[l.screen]).map((l) => `<button type="button" data-chat-link="${E(l.screen)}" data-id="${E(l.id || '')}">${E(LINK[l.screen])} ←</button>`).join('')}</div>` : ''}</li>`;
  }
  function card(c) {
    return `<li class="hc-card" data-card="${E(c.id)}"><b>${E(c.title)}</b><dl>${(c.lines || []).map((l) => `<div><dt>${E(l.k)}</dt><dd dir="auto">${E(l.v)}</dd></div>`).join('')}</dl>
      <div class="hc-card-act"><button type="button" class="cta" data-chat-yes="${E(c.id)}">${I('check')} ${E(c.confirm || 'تأكيد')}</button><button type="button" class="cta ghost" data-chat-no="${E(c.id)}">لأ</button></div>
      <small>التأكيد صالح لحد ${E(new Date(c.exp).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }))}</small></li>`;
  }
  function paint() {
    if (!box) return;
    const list = box.querySelector('.hc-list');
    const empty = !state.messages.length;
    list.innerHTML = (empty ? `<li class="hc-msg bot"><p>أهلًا بيك 👋 أنا مساعد هنصلحلك. قولّي محتاج إيه — أتابع طلبك، أجهّز لك طلب جديد، ألغي، أو أوصّلك لموظف.</p></li>` : '')
      + state.messages.map(bubble).join('') + state.cards.map(card).join('')
      + (state.busy ? '<li class="hc-msg bot typing" aria-label="المساعد بيكتب"><span class="ai-dots" aria-hidden="true"><i></i><i></i><i></i></span></li>' : '');
    box.querySelector('.hc-quick').hidden = !empty || state.busy;
    box.querySelector('[data-chat-send]').disabled = state.busy;
    list.scrollTop = list.scrollHeight;
  }

  function build() {
    box = document.createElement('div');
    box.id = 'hs-chat'; box.className = 'hc'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'hcT');
    box.innerHTML = `<div class="hc-panel">
      <header class="hc-head"><span class="hc-av" aria-hidden="true">${I('chat')}</span><span class="hc-who"><b id="hcT">مساعد هنصلحلك</b><small>${live() ? 'بيرد فورًا — وأي إجراء بيتنفذ بتأكيدك' : 'نسخة تجريبية — ردود ثابتة على جهازك'}</small></span>
        <button type="button" class="hc-ic" data-chat-human aria-label="كلّم موظف">${I('user')}</button><button type="button" class="hc-ic" data-chat-reset aria-label="محادثة جديدة"><span aria-hidden="true">↻</span></button><button type="button" class="hc-ic" data-chat-close aria-label="إغلاق">✕</button></header>
      <ol class="hc-list" role="log" aria-live="polite" aria-label="المحادثة"></ol>
      <div class="hc-quick">${QUICK.map((q) => `<button type="button" data-chat-q="${E(q)}">${E(q)}</button>`).join('')}</div>
      <form class="hc-form" data-chat-form><label class="sr-only" for="hcIn">رسالتك</label><textarea id="hcIn" rows="1" maxlength="800" placeholder="اكتب رسالتك…" enterkeyhint="send"></textarea>
        <button type="submit" class="hc-send" data-chat-send aria-label="إرسال">${I('send')}</button></form>
      <p class="hc-note">${I('shield')} متكتبش أرقام كروت أو أكواد تحقق — محدش من هنصلحلك هيطلبها.</p></div>`;
    document.body.appendChild(box);
    box.addEventListener('click', onClick);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'hcIn') { e.preventDefault(); submit(); }
    });
    box.querySelector('[data-chat-form]').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  }

  async function call(payload) {
    if (!live()) return null;
    return root.HSBackend.chat(payload);
  }
  const apply = (r) => { if (r) { state.messages = r.messages || []; state.cards = r.cards || []; } };

  async function send(text) {
    const t = String(text || '').trim().slice(0, 800);
    if (!t || state.busy) return;
    state.messages.push({ role: 'me', text: t }); state.busy = true; paint();
    if (!live()) { setTimeout(() => { state.busy = false; state.messages.push({ role: 'bot', text: demoReply(t) }); paint(); }, 500); return; }
    try { apply(await call({ action: 'send', text: t })); }
    catch (e) { state.messages.push({ role: 'bot', text: (e && e.message) || 'حصلت مشكلة في الاتصال — جرّب تاني', fail: true }); }
    state.busy = false; paint();
  }
  async function decide(id, yes) {
    if (state.busy) return;
    state.busy = true; paint();
    try { apply(await call({ action: 'confirm', id, yes })); }
    catch (e) { say((e && e.message) || 'مقدرناش ننفذ — جرّب تاني'); state.cards = state.cards.filter((c) => c.id !== id); }
    state.busy = false; paint();
  }
  function submit() { const i = box.querySelector('#hcIn'); const v = i.value; i.value = ''; send(v); }

  async function onClick(e) {
    const b = e.target.closest('button'); if (!b) { if (e.target === box) close(); return; }
    const d = b.dataset;
    if (d.chatClose !== undefined) return close();
    if (d.chatQ) return send(d.chatQ);
    if (d.chatLink) return openLink(d.chatLink, d.id || '');
    if (d.chatYes) return decide(d.chatYes, true);
    if (d.chatNo) return decide(d.chatNo, false);
    if (d.chatHuman !== undefined) { if (live()) return send('عايز أكلم موظف من خدمة العملاء'); close(); if (root.Support && root.Support.openContact) root.Support.openContact(''); return; }
    if (d.chatReset !== undefined) {
      if (state.busy) return;
      if (!live()) { state = { messages: [], cards: [], busy: false }; return paint(); }
      try { state.busy = true; paint(); apply(await call({ action: 'reset' })); } catch (x) { say((x && x.message) || 'جرّب تاني'); }
      state.busy = false; paint();
    }
  }

  /* buttons the assistant adds under a reply (open_screen tool) — app navigation only */
  function openLink(screen, id) {
    close();
    try {
      if (screen === 'order' && id && typeof openRoute === 'function') return openRoute({ screen: 'tracking', tab: 'orders', id });
      if (screen === 'complaint' && root.Support) return root.Support.openComplaint(id || '');
      const tab = { new_request: 'sections', my_home: 'home' }[screen] || screen;
      if (typeof go === 'function') go(tab);
    } catch (e) { say('مقدرناش نفتح الشاشة'); }
  }

  async function open() {
    if (!enabled()) { if (root.Support && root.Support.openContact) root.Support.openContact(''); return; }
    if (live() && !(typeof me === 'function' && me())) { say('سجّل الدخول الأول عشان المساعد يقدر يتابع طلباتك'); if (typeof show === 'function') show('account'); return; }
    lastFocus = document.activeElement;
    if (!box) build();
    box.hidden = false; document.documentElement.classList.add('hc-open');
    paint();
    box.querySelector('#hcIn').focus();
    if (live()) {
      state.busy = true; paint();
      try { apply(await call({ action: 'history' })); } catch (e) { say((e && e.message) || 'مقدرناش نفتح المحادثة'); }
      state.busy = false; paint();
    }
  }
  function close() {
    if (!box) return;
    box.hidden = true; document.documentElement.classList.remove('hc-open');
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) { /* gone */ }
  }

  document.addEventListener('click', (e) => { const t = e.target.closest('[data-chat-open]'); if (t) { e.preventDefault(); open(); } });

  root.HSSupportChat = Object.freeze({ open, close, enabled, live, _demoReply: demoReply });
})(typeof globalThis !== 'undefined' ? globalThis : this);
