/* Customer location for an accepted job (provider app).
   On each press of "موقع العميل" the provider sees the customer's address, contact links, a map link and the
   straight-line distance in kilometres. There is NO live tracking: the provider's own position is read once per
   press (browser permission), used only on this device for the distance, and never sent or stored. The customer
   sees request status only. The server releases phone/address/geo to the assigned provider only after acceptance
   (functions/src/scope.js). Map links are plain URLs (no paid Maps API). */
(function (root) {
  'use strict';
  const EARTH_KM = 6371;
  /* Statuses in which an accepted job is still being worked on (contact details are useful). */
  const ACTIVE = Object.freeze(['accepted', 'scheduled', 'enroute', 'arrived', 'started', 'quote']);

  /** A usable {lat,lng} or null (rejects missing, non-numeric, out-of-range and the 0,0 placeholder). */
  function validGeo(g) {
    if (!g || typeof g !== 'object') return null;
    const lat = Number(g.lat), lng = Number(g.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
    return { lat, lng };
  }

  /** Great-circle (haversine) distance in km between two valid points; NaN if either is invalid. */
  function distanceKm(a, b) {
    const p = validGeo(a), q = validGeo(b);
    if (!p || !q) return NaN;
    const rad = d => d * Math.PI / 180;
    const dLat = rad(q.lat - p.lat), dLng = rad(q.lng - p.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** "2.4 كم" under 10 km (one decimal), whole km above. */
  function formatKm(km) {
    if (!Number.isFinite(km) || km < 0) return '';
    const v = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
    return v.toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: 1 }) + ' كم';
  }

  /** Directions to the customer's pin, or a search by the written address when no pin exists. */
  function mapsUrl(r) {
    const g = validGeo(r && r.geo);
    if (g) return `https://www.google.com/maps/dir/?api=1&destination=${g.lat},${g.lng}`;
    const q = [r && r.addr, r && r.area, r && r.gov].map(x => String(x || '').trim()).filter(Boolean).join('، ');
    return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
  }

  function telHref(phone) {
    const s = String(phone || '').replace(/[^\d+]/g, '');
    return s.replace(/\D/g, '').length >= 8 ? 'tel:' + s : '';
  }

  /** wa.me link; Egyptian local mobiles (01xxxxxxxxx) are converted to the 20 country code. */
  function whatsappHref(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    else if (/^0\d{10}$/.test(d)) d = '20' + d.slice(1);
    return d.length >= 10 ? 'https://wa.me/' + d : '';
  }

  /** The button is offered only to the provider who accepted the job, while the job is active. */
  function available(r, a) {
    return !!(r && a && a.status === 'accepted' && ACTIVE.includes(r.status));
  }

  const DISTANCE_TEXT = {
    locating: 'جارٍ تحديد موقعك لحساب المسافة…',
    nogeo: 'العميل لم يحدد موقعه على الخريطة؛ اعتمد على العنوان المكتوب.',
    denied: 'لم تسمح بتحديد موقعك، لذلك لا يمكن حساب المسافة.',
    unsupported: 'المتصفح لا يدعم تحديد الموقع.',
    error: 'تعذر تحديد موقعك الآن؛ حاول مرة أخرى.'
  };

  /** Panel markup. state: {status:'locating'|'ok'|'nogeo'|'denied'|'unsupported'|'error', km?} */
  function panelHtml(r, customerName, state, esc) {
    const st = state || { status: 'locating' };
    const address = [r.gov, r.area, r.addr].map(x => String(x || '').trim()).filter(Boolean).join(' · ') || 'لم يُسجَّل عنوان';
    const tel = telHref(r.phone), wa = whatsappHref(r.phone), map = mapsUrl(r);
    const ext = 'target="_blank" rel="noopener noreferrer"';
    const distance = st.status === 'ok'
      ? `المسافة التقريبية: <b>${esc(formatKm(st.km))}</b> (خط مستقيم؛ الطريق الفعلي قد يكون أطول)`
      : esc(DISTANCE_TEXT[st.status] || DISTANCE_TEXT.error);
    const links = [
      tel ? `<a class="pv-btn" href="${esc(tel)}" data-pv-contact="call">اتصال</a>` : '',
      wa ? `<a class="pv-btn" href="${esc(wa)}" ${ext} data-pv-contact="whatsapp">واتساب</a>` : '',
      map ? `<a class="pv-btn pv-btn-primary" href="${esc(map)}" ${ext} data-pv-contact="map">افتح في الخرائط</a>` : ''
    ].join('');
    return `<div class="pv-location" role="region" aria-label="موقع العميل" data-pv-location="${esc(r.id)}">
      <dl class="pv-details"><div><dt>العميل</dt><dd>${esc(customerName || 'العميل')}</dd></div><div><dt>العنوان</dt><dd>${esc(address)}</dd></div><div><dt>الموبايل</dt><dd dir="ltr">${esc(r.phone || 'غير متاح')}</dd></div></dl>
      <p class="pv-location-distance" aria-live="polite" data-pv-distance="${esc(st.status)}">${distance}</p>
      <div class="pv-actions">${links}<button type="button" class="pv-btn" data-pv-action="customer-location-close" data-id="${esc(r.id)}">إخفاء</button></div>
      <p class="pv-hint">موقعك يُستخدم على جهازك لحساب المسافة فقط، ولا يُرسل ولا يراه العميل.</p>
    </div>`;
  }

  root.HSProviderLocation = Object.freeze({ ACTIVE, validGeo, distanceKm, formatKm, mapsUrl, telHref, whatsappHref, available, panelHtml });
})(globalThis);
