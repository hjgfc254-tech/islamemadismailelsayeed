/**
 * MODULE: payment-card (HSPayCard) — how the customer pays the agreed price (round 12 payments UI, 2026-11-27).
 *   • choice card once a price is agreed: «ادفع أونلاين — فيزا أو محفظة» (held until the customer confirms + the
 *     «ضمان هنصلحلك» voucher) or «كاش للفني بعد الشغل». Cash is presented neutrally — the voucher is a bonus of online.
 *   • status line afterwards: held / released / refund pending or done / top-up due / cash / waiting for the gateway.
 * Online: POST /requests/:id/pay {method:'online'} → the server returns data.checkoutUrl (Paymob page) — the app goes
 * there and the realtime sync brings the result back; the local demo (gateway 'demo') confirms with /pay/demo.
 * Classic script on the Customer app globals (MP, esc, ic, money, apiCall, show, toast, state, HSOrdersApi).
 */
'use strict';
(function (root) {
  const FINAL = ['completed', 'closed', 'cancelled', 'failed'];
  const cfg = () => { try { return MP.payConfig(); } catch (e) { return { online: false, gateway: null, warrantyDays: 20 }; } };
  const due = (r) => { try { return MP.payDue(r); } catch (e) { return 0; } };
  const onlineReady = () => { const c = cfg(); return !!(c.online && c.gateway); };

  /** What to show for a request (pure; unit-tested): 'choose' | 'pending' | 'topup' | 'held' | 'released' | 'refund' | 'refunded' | 'cash' | '' */
  function stateOf(r) {
    if (!r) return '';
    const p = r.payment;
    if (p && p.refund && +p.refund.amount > 0) return p.refund.status === 'done' ? 'refunded' : 'refund';
    if (p && p.method === 'online') return p.status === 'held' ? 'held' : p.status === 'released' ? 'released' : p.status === 'topup' ? 'topup' : p.status === 'refunded' ? 'refunded' : 'pending';
    if (p && p.method === 'cash') return FINAL.includes(r.status) ? '' : 'cash';
    if (+r.agreedValue > 0 && !FINAL.includes(r.status) && !r.freeService) return 'choose';
    return '';
  }

  function block(r) {
    const s = stateOf(r); if (!s) return '';
    const c = cfg(), days = c.warrantyDays || 20, p = r.payment || {};
    const line = (cls, icon, html) => `<div class="need pay-line ${cls}">${ic(icon)}<span>${html}</span></div>`;
    /* online not available: nothing to choose — cash after the job, said plainly */
    if (s === 'choose' && !onlineReady()) return line('', 'wallet', `هتدفع للفني كاش بعد الشغل — <b>${money(r.agreedValue)}</b>`);
    if (s === 'choose' || (s === 'pending' && !FINAL.includes(r.status))) {
      const online = onlineReady();
      const waiting = s === 'pending' ? `<p class="pay-wait" role="status">${ic('clock')} بنأكد الدفع… لو قفلت صفحة الدفع من غير ما تدفع تقدر تختار تاني.</p>` : '';
      return `<section class="pay-card glass neon" aria-labelledby="pay-h"><h2 class="sec-title" id="pay-h">${ic('wallet')}هتدفع إزاي؟ <small>${money(r.agreedValue)}</small></h2>${waiting}
        <div class="pay-opts">
          ${online ? `<button type="button" class="pay-opt is-online" data-pay-method="online"><b>${ic('shield')} ادفع أونلاين — فيزا أو محفظة</b><span>فلوسك محجوزة عندنا لحد ما تتأكد إن الشغل تمام + قسيمة ضمان هنصلحلك ${days} يوم</span></button>` : ''}
          <button type="button" class="pay-opt" data-pay-method="cash"><b>${ic('wallet')} كاش للفني بعد الشغل</b><span>تدفع للفني بعد ما يخلّص، بالسعر المتفق عليه</span></button>
        </div></section>`;
    }
    if (s === 'held') return line('is-ok', 'check', `<b>مدفوع ✓</b> — فلوسك محجوزة عندنا لحد ما تأكد إن الشغل تمام${r.warrantyVoucher ? '، ومعاك قسيمة ضمان هنصلحلك' : ''}`);
    if (s === 'released') return line('is-ok', 'check', 'دفعت أونلاين ✓ — الفلوس اتحوّلت للفني');
    if (s === 'refund') return line('', 'wallet', `هنرجّعلك <b>${money(p.refund.amount)}</b> خلال أيام على نفس وسيلة الدفع`);
    if (s === 'refunded') return line('is-ok', 'check', `رجعتلك <b>${money(p.refund ? p.refund.amount : p.paid)}</b>`);
    if (s === 'topup') return `<section class="pay-card glass neon">${line('', 'wallet', `السعر زاد بعد الموافقة — فاضل <b>${money(due(r))}</b>`)}<button type="button" class="cta" data-pay-method="online">${ic('wallet')} ادفع الباقي أونلاين</button></section>`;
    if (s === 'cash') return line('', 'wallet', `هتدفع للفني كاش بعد الشغل — <b>${money(r.agreedValue)}</b>${onlineReady() ? ' <button type="button" class="link-btn" data-pay-method="online">أو ادفع أونلاين</button>' : ''}`);
    return '';
  }

  /* `state` is the Customer app's top-level binding (app.js), not a window property */
  const curId = () => { try { return (typeof state !== 'undefined' && state.lastShown && state.lastShown.arg) || ''; } catch (e) { return ''; } };
  async function choose(method, btn) {
    const id = curId(); if (!id || typeof apiCall !== 'function') return;
    apiCall('pay:' + id, btn, () => HSOrdersApi.pay(id, method), async (res) => {
      const d = (res && res.data) || {};
      if (method === 'cash') { show('tracking', id); toast('تمام — هتدفع للفني كاش بعد الشغل'); return; }
      if (d.checkoutUrl && /^https:\/\/accept\.paymob\.com\//.test(String(d.checkoutUrl))) { toast('بنفتح صفحة الدفع…'); root.location.href = d.checkoutUrl; return; }   /* only the Paymob checkout host */
      if (d.checkoutError) { show('tracking', id); toast('صفحة الدفع مش متاحة دلوقتي — جرّب تاني أو اختار كاش'); return; }
      if (d.gateway === 'demo') {
        const ok = root.HSUiDialog ? await root.HSUiDialog.confirm(`دفع تجريبي بمبلغ ${money(d.due)} — مفيش فلوس حقيقية في الوضع التجريبي.`, { title: 'دفع تجريبي', ok: 'ادفع' }) : true;
        if (!ok) { show('tracking', id); return; }
        apiCall('paydemo:' + id, null, () => HSOrdersApi.payDemo(id), () => { show('tracking', id); toast('تم الدفع ✓ فلوسك محجوزة عندنا لحد ما تأكد إن الشغل تمام'); });
        return;
      }
      show('tracking', id);
    });
  }
  if (root.document) root.document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-pay-method]'); if (!b) return;
    e.preventDefault(); choose(b.dataset.payMethod, b);
  });

  root.HSPayCard = Object.freeze({ block, stateOf, onlineReady });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HSPayCard;
})(typeof globalThis !== 'undefined' ? globalThis : this);
