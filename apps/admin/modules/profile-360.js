/**
 * MODULE: profile-360 (HSAdminProfile) — one full page per customer, provider and order (2026-11-27).
 *   #/customer/<id>  ·  #/provider/<id>  ·  #/order/<id>
 * Everything about one record in one place, with links between them (order ↔ customer ↔ provider) and the actions
 * the server already supports, so an employee does not jump between list pages. Each profile has its own link: an
 * employee can send it to a colleague («انسخ الرابط»).
 * Data: the synced read model (MP — local demo store, or the admin window synced from the server in Firebase mode).
 * Actions: the existing API adapters only (HSAdminApi / HSOrdersApi / HSSupportApi / HSApiClient) — the server
 * re-checks the admin role, RBAC and the business rules; buttons are hidden when the employee lacks the permission.
 * Nothing here is new business logic and no existing page changed behaviour.
 */
'use strict';
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n) => { try { return new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 2 }).format(+n || 0); } catch (e) { return String(+n || 0); } };
  const money = (n) => nf(n) + ' ج.م';
  const dt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(t); } catch (e) { return String(iso); } };
  const day = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; try { return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' }).format(t); } catch (e) { return String(iso).slice(0, 10); } };
  const M = () => (typeof MP !== 'undefined' ? MP : null);
  const LABEL = () => (typeof STATUS_LABEL !== 'undefined' ? STATUS_LABEL : {});
  const FINAL = ['closed', 'cancelled', 'failed'];
  const DONE = ['completed', 'closed'];
  const CANCELLABLE = ['received', 'searching', 'sent', 'accepted', 'scheduled', 'enroute', 'arrived'];
  const PSTATUS = { pending: 'قيد المراجعة', approved: 'معتمد', suspended: 'موقوف', rejected: 'مرفوض' };
  const PAY = { cash: 'كاش للفني', pending: 'مستني الدفع أونلاين', topup: 'مستني فرق السعر', held: 'محجوز عند المنصة', released: 'اتحوّل للفني', refunded: 'اترجع للعميل' };
  const COLL = { pending: 'لسه ما اتحصّلتش', collected: 'اتحصّلت', settled: 'اتسوّت' };
  const by = (k) => (a, b) => String(b[k] || '').localeCompare(String(a[k] || ''));
  const sum = (l, k) => Math.round(l.reduce((a, x) => a + (+x[k] || 0), 0) * 100) / 100;

  /* ───────── links ───────── */
  const href = (kind, id) => '#/' + kind + '/' + encodeURIComponent(String(id || ''));
  const link = (kind, id, text) => (id ? `<a href="${esc(href(kind, id))}" data-pf-link="${esc(kind)}">${esc(text || '—')}</a>` : esc(text || '—'));
  const idFromHash = (hash) => { const p = String(hash || '').replace(/^#\/?/, '').split('?')[0].split('/'); try { return decodeURIComponent(p[1] || ''); } catch (e) { return p[1] || ''; } };

  /* ───────── pure view models (unit-tested) ───────── */
  const list = (d, k) => (d && Array.isArray(d[k]) ? d[k] : []);
  const find = (d, k, id) => list(d, k).find((x) => x.id === id) || null;
  const providerOfReq = (d, reqId) => {
    const a = list(d, 'assignments').find((x) => x.reqId === reqId && x.status === 'accepted') || list(d, 'assignments').find((x) => x.reqId === reqId && x.status === 'offered');
    return a ? find(d, 'providers', a.providerId) : null;
  };
  const amountOf = (d, r) => {
    const t = list(d, 'transactions').find((x) => x.reqId === r.id);
    if (t) return +t.value || 0;
    return +r.agreedValue || (r.pricing ? +r.pricing.customerPrice || 0 : 0);
  };
  const complaintsOf = (d, pred) => list(d, 'complaints').filter(pred).slice().sort(by('at'));

  function customerModel(d, id) {
    const c = find(d, 'customers', id); if (!c) return null;
    const reqs = list(d, 'serviceRequests').filter((r) => r.customerId === id).sort(by('createdAt'));
    const reqIds = new Set(reqs.map((r) => r.id));
    const txs = list(d, 'transactions').filter((t) => t.customerId === id || reqIds.has(t.reqId));
    return {
      c, reqs: reqs.map((r) => ({ r, provider: providerOfReq(d, r.id), amount: amountOf(d, r) })),
      complaints: complaintsOf(d, (k) => k.by === 'customer:' + id || (k.reqId && reqIds.has(k.reqId))),
      reviews: list(d, 'reviews').filter((v) => v.customerId === id).sort(by('at')),
      stats: { total: reqs.length, active: reqs.filter((r) => !FINAL.includes(r.status) && r.status !== 'completed').length, done: reqs.filter((r) => DONE.includes(r.status)).length,
        cancelled: reqs.filter((r) => r.status === 'cancelled').length, spent: sum(txs.filter((t) => !t.free), 'value') }
    };
  }

  function providerModel(d, id) {
    const p = find(d, 'providers', id); if (!p) return null;
    const asg = list(d, 'assignments').filter((a) => a.providerId === id);
    const accepted = new Set(asg.filter((a) => a.status === 'accepted').map((a) => a.reqId));
    const reqs = list(d, 'serviceRequests').filter((r) => accepted.has(r.id)).sort(by('createdAt'));
    const txs = list(d, 'transactions').filter((t) => t.providerId === id && !t.free);
    const reviews = list(d, 'reviews').filter((v) => v.providerId === id).sort(by('at'));
    const shown = reviews.filter((v) => !v.hidden);
    const online = list(d, 'serviceRequests').filter((r) => accepted.has(r.id) && r.payment && r.payment.method === 'online');
    return {
      p, reqs: reqs.map((r) => ({ r, customer: find(d, 'customers', r.customerId), amount: amountOf(d, r) })),
      complaints: complaintsOf(d, (k) => k.providerId === id || k.by === 'provider:' + id || (k.reqId && accepted.has(k.reqId))),
      reviews,
      money: { pending: sum(txs.filter((t) => t.collection === 'pending'), 'commission'), collected: sum(txs.filter((t) => t.collection !== 'pending'), 'commission'),
        value: sum(txs, 'value'), held: online.filter((r) => r.payment.status === 'held').reduce((a, r) => a + (+r.payment.paid || 0), 0) },
      stats: { offers: asg.length, accepted: accepted.size, done: reqs.filter((r) => DONE.includes(r.status)).length,
        declined: asg.filter((a) => a.status === 'declined' || a.status === 'rejected').length,
        rating: shown.length ? Math.round((shown.reduce((a, v) => a + (+v.stars || 0), 0) / shown.length) * 10) / 10 : (+p.rating || 0) }
    };
  }

  function orderModel(d, id) {
    const r = find(d, 'serviceRequests', id); if (!r) return null;
    const asg = list(d, 'assignments').filter((a) => a.reqId === id);
    return {
      r, customer: find(d, 'customers', r.customerId), provider: providerOfReq(d, id),
      offers: asg.map((a) => ({ a, provider: find(d, 'providers', a.providerId) })),
      quotes: list(d, 'quotes').filter((q) => q.reqId === id).sort(by('at')),
      tx: list(d, 'transactions').find((t) => t.reqId === id) || null,
      complaints: complaintsOf(d, (k) => k.reqId === id),
      review: list(d, 'reviews').find((v) => v.reqId === id) || null,
      amount: amountOf(d, r),
      assignable: ['received', 'searching'].includes(r.status), cancellable: CANCELLABLE.includes(r.status)
    };
  }

  /* ───────── permissions (presentation; the server re-checks) ───────── */
  const can = (module, action) => {
    const G = root.HSAdminPermissionGuard, S = root.HSAdminSession;
    if (!G || !S || typeof S.current !== 'function') return true;
    const emp = S.current(); return !!emp && G.can(emp, module, action);
  };

  /* ───────── view helpers ───────── */
  const facts = (rows) => `<dl class="ord-facts pf-facts">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const card = (title, body, extra) => `<section class="pf-card"${extra || ''}><h2 class="pf-h">${esc(title)}</h2>${body}</section>`;
  const table = (heads, rows, empty) => rows.length
    ? `<div class="hs-grid-scroll"><table class="hs-grid-table"><thead><tr>${heads.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : `<p class="ord-muted">${esc(empty || 'مفيش لسه.')}</p>`;
  const badge = (text, tone) => `<span class="pf-badge${tone ? ' is-' + tone : ''}">${esc(text)}</span>`;
  const btn = (act, text, kind, extra) => `<button type="button" class="adm-btn${kind === 'p' ? ' adm-btn-p' : kind === 'd' ? ' adm-btn-d' : ''}" data-pf-act="${esc(act)}"${extra || ''}>${esc(text)}</button>`;
  const phoneHtml = (ph) => (ph ? `<a href="tel:${esc(String(ph).replace(/[^\d+]/g, ''))}"><bdi dir="ltr">${esc(ph)}</bdi></a>` : '—');
  const statusText = (s) => LABEL()[s] || s || '—';
  const stars = (n) => (+n ? nf(n) + ' / 5' : '—');
  const head = (title, sub, badges, actions) => `<header class="pf-head"><div><h2 class="pf-name">${title}</h2>${sub ? `<p class="ord-muted">${sub}</p>` : ''}<p class="pf-badges">${badges}</p></div>
    <div class="pf-acts">${actions}${btn('copy', 'انسخ الرابط')}</div></header>`;
  const complaintsTable = (l) => table(['التاريخ', 'الشكوى', 'الحالة', ''], l.map((k) => [esc(day(k.at)), esc(String(k.text || k.subject || '').slice(0, 120)),
    k.status === 'resolved' ? badge('اتحلّت', 'ok') + (k.resolution ? `<br><small class="ord-muted">${esc(k.resolution)}</small>` : '') : badge('مفتوحة', 'warn'),
    k.status === 'resolved' || !can('complaints', 'decide') ? '' : btn('resolve', 'سجّل الحل', '', ` data-id="${esc(k.id)}"`)]), 'مفيش شكاوى.');

  function customerView(m) {
    const c = m.c, st = c.status === 'suspended';
    const acts = can('customers', 'decide') ? btn('csusp', st ? 'رجّع تفعيل العميل' : 'إيقاف العميل', st ? 'p' : 'd') : '';
    return head(esc(c.name || 'عميل'), phoneHtml(c.phone) + (c.createdAt ? ' · عميل من ' + esc(day(c.createdAt)) : ''), badge(st ? 'موقوف' : 'نشط', st ? 'bad' : 'ok'), acts) +
      facts([['كل الطلبات', esc(nf(m.stats.total))], ['شغالة دلوقتي', esc(nf(m.stats.active))], ['خلصت', esc(nf(m.stats.done))], ['اتلغت', esc(nf(m.stats.cancelled))], ['دفع إجمالي', esc(money(m.stats.spent))]]) +
      card('الطلبات', table(['الطلب', 'الخدمة', 'الحالة', 'الفني', 'المبلغ', 'التاريخ'], m.reqs.map(({ r, provider, amount }) => [link('order', r.id, r.no || r.id), esc(r.serviceName || ''), esc(statusText(r.status)),
        provider ? link('provider', provider.id, provider.name) : '—', amount ? esc(money(amount)) : '—', esc(day(r.createdAt))]), 'العميل ده ما عملش طلبات.')) +
      card('الشكاوى', complaintsTable(m.complaints)) +
      card('التقييمات اللي كتبها', table(['التاريخ', 'الفني', 'التقييم', 'التعليق'], m.reviews.map((v) => { const p = find(M().db(), 'providers', v.providerId);
        return [esc(day(v.at)), p ? link('provider', p.id, p.name) : '—', esc(stars(v.stars)), esc(v.comment || '') + (v.hidden ? ' ' + badge('مخفي') : '')]; }), 'ما كتبش تقييمات.'));
  }

  function providerView(m) {
    const p = m.p, s = p.status;
    const dec = can('providers', 'decide'), edit = can('providers', 'edit');
    const acts = !dec ? '' : s === 'pending' ? btn('padmit', 'قبول الانضمام', 'p') + btn('preject', 'رفض', 'd')
      : s === 'approved' ? btn('pwarn', 'إنذار') + btn('psusp', 'إيقاف الفني', 'd')
      : s === 'suspended' ? btn('pon', 'رجّع تفعيل الفني', 'p') : btn('padmit', 'قبول بعد المراجعة');
    const tone = s === 'approved' ? 'ok' : s === 'pending' ? 'warn' : 'bad';
    const M0 = M();
    const cats = (p.cats || []).map((c) => { try { return M0.catName(c); } catch (e) { return c; } }).join('، ');
    return head(esc(p.name || 'فني'), phoneHtml(p.phone) + (p.createdAt ? ' · انضم ' + esc(day(p.createdAt)) : ''),
      badge(PSTATUS[s] || s, tone) + (p.available ? badge('متاح دلوقتي', 'ok') : badge('مش متاح')) + (+p.warnings ? badge('إنذارات: ' + nf(p.warnings), 'warn') : ''), acts) +
      facts([['التقييم', esc(stars(m.stats.rating))], ['عروض اتبعتتله', esc(nf(m.stats.offers))], ['قبلها', esc(nf(m.stats.accepted))], ['خلّصها', esc(nf(m.stats.done))],
        ['حصة المنصة اللي عليه', esc(money(m.money.pending))], m.money.held ? ['فلوس محجوزة لشغله', esc(money(m.money.held))] : null]) +
      card('بيانات الفني', facts([['التخصصات', esc(cats || '—')], ['المحافظات', esc((p.govs || []).join('، ') || '—')], ['المناطق', esc((p.areas || []).join('، ') || '—')],
        ['محفظة التحويل', esc(p.payoutWallet || 'ما حطّش محفظة')], ['المستندات', esc(p.docs && String(p.docs).trim() ? 'اترفعت' : 'لسه')]]) +
        `<form class="pf-rate" data-pf-rate><label class="hs-grid-field"><span>نسبة خاصة للفني ده (٪) — فاضي = النسبة العامة</span><input type="number" min="0" max="100" step="0.5" name="rate" value="${p.specialRate == null ? '' : esc(p.specialRate)}" ${edit ? '' : 'disabled'}></label>${edit ? btn('prate', 'حفظ النسبة') : ''}</form>`) +
      card('الشغل', table(['الطلب', 'الخدمة', 'العميل', 'الحالة', 'المبلغ', 'التاريخ'], m.reqs.map(({ r, customer, amount }) => [link('order', r.id, r.no || r.id), esc(r.serviceName || ''),
        customer ? link('customer', customer.id, customer.name) : '—', esc(statusText(r.status)), amount ? esc(money(amount)) : '—', esc(day(r.createdAt))]), 'لسه ما استلمش شغل.')) +
      card('الفلوس', facts([['قيمة الشغل المكتمل', esc(money(m.money.value))], ['حصة المنصة المحصّلة', esc(money(m.money.collected))], ['حصة المنصة اللي لسه عليه', esc(money(m.money.pending))]]) +
        '<p class="ord-muted">تحصيل حصة المنصة من «الفلوس › التسويات والتحصيل».</p>') +
      card('الشكاوى', complaintsTable(m.complaints)) +
      card('التقييمات', table(['التاريخ', 'العميل', 'التقييم', 'التعليق'], m.reviews.map((v) => { const c = find(M0.db(), 'customers', v.customerId);
        return [esc(day(v.at)), c ? link('customer', c.id, c.name) : '—', esc(stars(v.stars)), esc(v.comment || '') + (v.hidden ? ' ' + badge('مخفي') : '')]; }), 'مفيش تقييمات.'));
  }

  function orderView(m) {
    const r = m.r, M0 = M();
    const okOrders = can('orders', 'decide');
    let assign = '';
    if (m.assignable && okOrders) {
      let cands = []; try { cands = M0.candidates(r) || []; } catch (e) { cands = []; }
      const others = list(M0.db(), 'providers').filter((p) => p.status === 'approved' && (p.cats || []).includes(r.cat) && !cands.includes(p));
      assign = `<div class="pf-assign"><label class="hs-grid-field"><span>إسناد لفني</span><select data-pf-pick><option value="">اختار فني</option>${cands.length ? `<optgroup label="مناسبين">${cands.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</optgroup>` : ''}${others.length ? `<optgroup label="نفس التخصص">${others.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.available ? '' : ' (مش متاح)'}</option>`).join('')}</optgroup>` : ''}</select></label>${btn('assign', 'إسناد', 'p')}${btn('automatch', 'اختيار تلقائي')}</div>`;
    }
    const acts = m.cancellable && okOrders ? btn('cancel', 'إلغاء الطلب', 'd') : '';
    const pay = r.payment, okFin = can('finance', 'edit');
    const payActs = pay && pay.method === 'online' && pay.status === 'held' && okFin ? btn('release', 'حوّل للفني') + btn('refund', 'رجّع للعميل', 'd') : '';
    const where = [r.area, r.gov].filter(Boolean).join('، ');
    const final = FINAL.includes(r.status);
    return head('طلب <bdi dir="ltr">' + esc(r.no || r.id) + '</bdi>', esc(r.serviceName || '') + (where ? ' · ' + esc(where) : '') + ' · ' + esc(dt(r.createdAt)),
      badge(statusText(r.status), r.status === 'cancelled' || r.status === 'failed' ? 'bad' : final || r.status === 'completed' ? 'ok' : 'warn') + (pay ? badge(pay.method === 'online' ? 'أونلاين' : 'كاش') : ''), acts) +
      assign +
      `<div class="pf-two">${card('العميل', m.customer ? facts([['الاسم', link('customer', m.customer.id, m.customer.name)], ['الموبايل', phoneHtml(m.customer.phone)]]) : '<p class="ord-muted">—</p>')}
        ${card('الفني', m.provider ? facts([['الاسم', link('provider', m.provider.id, m.provider.name)], ['الموبايل', phoneHtml(m.provider.phone)]]) : '<p class="ord-muted">لسه ما اتسندش لفني.</p>')}</div>` +
      card('السعر والدفع', facts([['المبلغ', m.amount ? esc(money(m.amount)) : 'لسه ما اتحددش'],
        r.pricing ? ['نصيب الفني', esc(money(r.pricing.providerAmount))] : null, r.pricing ? ['حصة المنصة', esc(money(r.pricing.platformFee))] : null,
        pay ? ['طريقة الدفع', esc(PAY[pay.status] || pay.status)] : ['طريقة الدفع', 'لسه ما اختارش'],
        pay && pay.paid ? ['اتدفع أونلاين', esc(money(pay.paid))] : null,
        pay && pay.refund ? ['استرجاع', esc(money(pay.refund.amount) + ' — ' + (pay.refund.status === 'done' ? 'اترجع' : 'جاري'))] : null,
        m.tx ? ['حصة المنصة من الفني', esc(COLL[m.tx.collection] || (m.tx.free ? 'خدمة مجانية' : m.tx.collection || '—'))] : null,
        r.warrantyVoucher ? ['ضمان هنصلحلك', esc(r.warrantyVoucher.code + ' — لحد ' + day(r.warrantyVoucher.until))] : null]) + (payActs ? `<p class="pf-acts">${payActs}</p>` : '')) +
      card('تفاصيل المشكلة', facts([['الخدمة', esc([r.catName, r.itemName, r.serviceName].filter(Boolean).join(' › ') || '—')], r.desc || r.details ? ['الوصف', esc(r.desc || r.details)] : null,
        r.schedule ? ['الموعد', esc(r.schedule.flexible ? 'مرن' : [r.schedule.date, r.schedule.slot].filter(Boolean).join(' — ') || '—')] : null])) +
      card('مراحل الطلب', (r.history || []).length ? `<ol class="pf-timeline">${(r.history || []).map((h) => `<li><b>${esc(statusText(h.s))}</b> <span class="ord-muted">${esc(dt(h.at))}${h.note ? ' — ' + esc(h.note) : ''}</span></li>`).join('')}</ol>` : '<p class="ord-muted">—</p>') +
      card('العروض اللي اتبعتت للفنيين', table(['الفني', 'الحالة', 'الوقت'], m.offers.map(({ a, provider }) => [provider ? link('provider', provider.id, provider.name) : '—',
        esc(({ offered: 'مستني رد', accepted: 'قبل', declined: 'رفض', rejected: 'رفض', expired: 'انتهى', cancelled: 'اتلغى' })[a.status] || a.status), esc(dt(a.at || a.createdAt))]), 'مفيش عروض لسه.')) +
      (m.quotes.length ? card('عروض الأسعار', table(['المبلغ', 'الحالة', 'الوقت'], m.quotes.map((q) => [esc(money(q.total)), esc(({ pending: 'مستني العميل', approved: 'اتوافق عليه', rejected: 'اترفض', superseded: 'اتغيّر' })[q.status] || q.status), esc(dt(q.at))]))) : '') +
      card('الشكاوى', complaintsTable(m.complaints)) +
      (m.review ? card('تقييم العميل', facts([['التقييم', esc(stars(m.review.stars))], ['التعليق', esc(m.review.comment || '—') + (m.review.hidden ? ' ' + badge('مخفي') : '')]])) : '');
  }

  /* ───────── page ───────── */
  const KINDS = {
    customer: { title: 'ملف العميل', model: customerModel, view: customerView, missing: 'العميل ده مش موجود في البيانات المحمّلة.' },
    provider: { title: 'ملف الفني', model: providerModel, view: providerView, missing: 'الفني ده مش موجود في البيانات المحمّلة.' },
    order: { title: 'ملف الطلب', model: orderModel, view: orderView, missing: 'الطلب ده مش موجود في البيانات المحمّلة.' }
  };

  function render(kind, ctx) {
    const K = KINDS[kind];
    const wrap = root.document.createElement('div'); wrap.className = 'pf';
    const id = idFromHash(root.location && root.location.hash);
    const A = { admin: root.HSAdminApi, orders: root.HSOrdersApi, support: root.HSSupportApi };
    let busy = false, lastMsg = '';
    /* internal notes (GET/POST /admin/notes): employees only, kept on the server per record */
    const subject = kind + ':' + id;
    let notes = null, notesErr = '';
    const notesHtml = () => card('ملاحظات داخلية', `<p class="ord-muted">للفريق بس — العميل والفني مش بيشوفوها.</p>` +
      (notesErr ? `<p class="ord-muted">${esc(notesErr)}</p>` : notes == null ? '<p class="ord-muted">جاري التحميل…</p>'
        : notes.length ? `<ul class="pf-notes">${notes.map((n) => `<li><p>${esc(n.text)}</p><small class="ord-muted">${esc((n.by && n.by.name) || 'موظف')} · ${esc(dt(n.at))}</small></li>`).join('')}</ul>` : '<p class="ord-muted">مفيش ملاحظات لسه.</p>') +
      (notesErr && !notes ? '' : `<form class="pf-rate" data-pf-note><label class="hs-grid-field"><span>ملاحظة جديدة</span><textarea name="text" rows="2" minlength="2" maxlength="500" required></textarea></label><button type="submit" class="adm-btn adm-btn-p">احفظ الملاحظة</button></form>`), ' data-pf-notes');
    const loadNotes = async () => {
      if (!A.admin || typeof A.admin.notes !== 'function' || !id) { notesErr = 'الملاحظات مش متاحة هنا.'; return; }
      try { const r = await A.admin.notes(subject); if (r && r.ok) { notes = r.data.items || []; notesErr = ''; } else { notesErr = err(r); } } catch (e) { notesErr = 'تعذّر تحميل الملاحظات.'; }
    };
    const paint = (focusSel) => {
      const m0 = M();
      const m = m0 && id ? K.model(m0.db(), id) : null;
      wrap.innerHTML = `<p class="pf-back"><button type="button" class="adm-btn" data-pf-act="back">رجوع</button></p>` +
        (m ? K.view(m) + notesHtml() : `<div class="adm-state is-empty"><h2>${esc(K.missing)}</h2><p>ممكن يكون اتمسح أو لسه ما وصلش. جرّب «رجوع» أو البحث السريع (Ctrl+K).</p></div>`) +
        `<p class="ord-muted" role="status" aria-live="polite" data-pf-live>${esc(lastMsg)}</p>`;
      const f = focusSel && wrap.querySelector(focusSel); if (f) f.focus();
    };
    const say = (msg) => { lastMsg = msg || ''; paint(); };
    const err = (res) => (res && res.error && res.error.message) || 'تعذّر تنفيذ الإجراء.';
    const ask = (q, danger) => (root.HSUiDialog ? root.HSUiDialog.confirm(q, { danger: !!danger }) : Promise.resolve(root.confirm ? root.confirm(q) : true));
    const askText = (q, opts) => (root.HSUiDialog ? root.HSUiDialog.prompt(q, opts || {}) : Promise.resolve(root.prompt ? root.prompt(q) : ''));
    const run = async (fn, okMsg) => {
      if (busy) return; busy = true;
      try { const res = await fn(); say(res && res.ok ? okMsg : err(res)); } catch (e) { say('تعذّر تنفيذ الإجراء.'); } finally { busy = false; }
    };
    const call = (method, path, body) => (root.HSBackend && typeof root.HSBackend.admin === 'function' ? root.HSBackend.admin(method, path, body) : root.HSApiClient.request(method, path, { body }));

    wrap.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pf-act]'); if (!b || b.disabled) return;
      const a = b.dataset.pfAct, d = M() ? M().db() : {};
      if (a === 'back') { if (root.history && root.history.length > 1) root.history.back(); else root.location.hash = '#/' + ({ customer: 'customers', provider: 'providers', order: 'orders' })[kind]; return; }
      if (a === 'copy') {
        const url = String(root.location.href);
        try { await root.navigator.clipboard.writeText(url); say('اتنسخ رابط الملف — ابعته لزميلك.'); } catch (x) { say('انسخ الرابط من شريط العنوان: ' + url); }
        return;
      }
      if (a === 'csusp') { const was = (find(d, 'customers', id) || {}).status === 'suspended';
        if (!was && !(await ask('إيقاف العميل ده؟ مش هيقدر يعمل طلبات جديدة لحد ما ترجّع تفعيله.', true))) return;
        return run(() => A.admin.setCustomerStatus(id, was ? 'active' : 'suspended'), was ? 'العميل رجع نشط.' : 'العميل اتوقف.'); }
      if (a === 'padmit') return run(() => A.admin.setProviderStatus(id, 'approved'), 'الفني اتقبل وبقى يقدر يستلم شغل.');
      if (a === 'pon') return run(() => A.admin.setProviderStatus(id, 'approved'), 'الفني رجع شغال.');
      if (a === 'preject') { if (!(await ask('رفض طلب انضمام الفني ده؟', true))) return; return run(() => A.admin.setProviderStatus(id, 'rejected'), 'طلب الانضمام اترفض.'); }
      if (a === 'psusp') { if (!(await ask('إيقاف الفني ده؟ مش هيستلم شغل جديد لحد ما ترجّع تفعيله.', true))) return; return run(() => A.admin.setProviderStatus(id, 'suspended'), 'الفني اتوقف.'); }
      if (a === 'pwarn') { const reason = await askText('سبب الإنذار (الإنذار التاني بيوقف الفني):', { placeholder: 'مثلًا: اتفق مع عميل بره المنصة' }); if (reason == null) return;
        return run(() => A.admin.warnProvider(id, String(reason).trim() || 'اتفاق مع العملاء بره المنصة'), 'اتبعت إنذار للفني.'); }
      if (a === 'prate') { const v = String((wrap.querySelector('[data-pf-rate] [name=rate]') || {}).value || '').trim();
        if (v !== '' && (!Number.isFinite(+v) || +v < 0 || +v > 100)) return say('النسبة لازم تبقى رقم من 0 لـ 100، أو سيبها فاضية.');
        return run(() => A.admin.setSpecialRate(id, v === '' ? null : +v), v === '' ? 'الفني رجع للنسبة العامة.' : 'النسبة الخاصة اتحفظت.'); }
      if (a === 'assign') { const pid = (wrap.querySelector('[data-pf-pick]') || {}).value; if (!pid) { say('اختار فني الأول.'); return; }
        return run(() => A.admin.assign(id, pid), 'الطلب اتبعت لـ ' + ((find(d, 'providers', pid) || {}).name || 'الفني') + '.'); }
      if (a === 'automatch') return run(() => A.admin.assign(id), 'اتختار فني تلقائيًا.');
      if (a === 'cancel') { const reason = await askText('سبب الإلغاء (بيوصل للعميل والفني):', { placeholder: 'مثلًا: طلب العميل في مكالمة', danger: true }); if (reason == null) return;
        return run(() => A.orders.cancel(id, String(reason).trim() || 'إلغاء من الإدارة'), 'الطلب اتلغى.'); }
      if (a === 'resolve') { const note = await askText('اكتب الحل اللي اتعمل (بيوصل لصاحب الشكوى):', {}); if (note == null || !String(note).trim()) return;
        return run(() => A.support.resolve(b.dataset.id, String(note).trim()), 'الشكوى اتسجّلت محلولة.'); }
      if (a === 'release') { if (!(await ask('تحويل المبلغ المحجوز للفني؟', false))) return; return run(() => call('POST', '/admin/payments/' + encodeURIComponent(id) + '/release', {}), 'المبلغ اتحوّل للفني (بيدخل التحويل الأسبوعي).'); }
      if (a === 'refund') { const amt = await askText('المبلغ اللي يرجع للعميل (فاضي = كله):', { danger: true }); if (amt == null) return;
        const s = String(amt).trim(); if (s !== '' && !(+s > 0)) { say('اكتب مبلغ صحيح أو سيبه فاضي.'); return; }
        return run(() => call('POST', '/admin/payments/' + encodeURIComponent(id) + '/refund', s === '' ? {} : { amount: +s }), 'الاسترجاع اتسجّل وهيتبعت للعميل.'); }
    });
    wrap.addEventListener('submit', async (e) => {
      const f = e.target.closest('[data-pf-note]'); if (!f) return; e.preventDefault();
      const text = String((f.text && f.text.value) || '').trim();
      if (text.length < 2) { say('اكتب الملاحظة الأول.'); return; }
      if (busy) return; busy = true;
      try { const r = await A.admin.addNote(subject, text); if (r && r.ok) { await loadNotes(); say('الملاحظة اتحفظت.'); } else say(err(r)); } catch (x) { say('تعذّر حفظ الملاحظة.'); } finally { busy = false; }
    });
    paint();
    loadNotes().then(() => paint());
    /* the read model changed (server sync or another tab): repaint while this page is open */
    if (root.HSRealtimeClient && typeof root.HSRealtimeClient.subscribe === 'function') {
      const off = root.HSRealtimeClient.subscribe('market:changed', () => { if (!wrap.isConnected) { off(); return; } if (!busy) paint(); });
      if (ctx && ctx.signal && typeof ctx.signal.addEventListener === 'function') ctx.signal.addEventListener('abort', off, { once: true });
    }
    return wrap;
  }

  const api = { customerModel, providerModel, orderModel, href, idFromHash, render, KINDS: Object.keys(KINDS) };
  root.HSAdminProfile = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  /* the three routes are registered by pages/profiles.page.js */
})(typeof globalThis !== 'undefined' ? globalThis : this);
