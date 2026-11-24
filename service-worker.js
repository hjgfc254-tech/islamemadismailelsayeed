/* ═══════════════════════════════════════════════════════════════
   هنصلحلك — Service Worker — V7 (مرحلة E3)
   ───────────────────────────────────────────────────────────────
   V7-E3 — تغييرات عن V7-E2 السابق:
   • رفع إصدار الكاش إلى v7-2 (لاستبدال أي كاش سابق).
   • إضافة الملفات الجديدة: addresses.js, account.js, support.js.
   • إضافة search.js و attachments.js (كانت في A5).
   • تنظيف أي كاش قديم عند التنشيط.

   استراتيجيات التخزين:
   • التنقل (navigate): Network First ثم fallback إلى index.html.
   • الأصول (JS/CSS/صور): Cache First ثم Network.
   • الخطوط (Google Fonts): Cache First مع fallback.
   • IndexedDB (المرفقات) لا يمر عبر SW.

   رسائل من الصفحة (اختيارية):
   • SKIP_WAITING — تفعيل SW جديد فورًا.
   • CLEAR_CACHE  — مسح كل الكاش (لأدوات العرض التجريبي).
   ═══════════════════════════════════════════════════════════════ */

const CACHE = 'hansalhlak-v11-firebase-91';

/* الملفات الأساسية — يجب أن تعمل offline بعد أول زيارة */
const FILES = [
  './',
  'index.html',
  'apps/customer/index.html',
  'apps/customer/styles/customer.css',
  'apps/customer/styles/overrides.css',
  'apps/customer/styles/brand-2026.css',
  'apps/customer/brand-icons.js',
  'apps/customer/experience.js',
  'apps/customer/pages/smart-help.js',
  'apps/provider/styles/brand-2026.css',
  'shared/design-system/design-system.css',
  'shared/utils/error-reporter.js',
  'shared/icons/icon-registry.js',
  'shared/components/accessible-tabs.js',
  'shared/config/legacy-data.js',
  'services/local-catalog.js',
  'services/local-market-store.js',
  'services/api-client.js',
  'services/auth-api.js',
  'services/orders-api.js',
  'services/quotes-api.js',
  'services/customer-api.js',
  'services/support-api.js',
  'services/notifications-api.js',
  'services/provider-api.js',
  'services/realtime-client.js',
  'shared/components/platform-status.js',
  'shared/components/live-clean.js',
  'shared/components/support-contacts.js',
  'apps/admin/modules/support-settings.js',
  'apps/admin/modules/digest-settings.js',
  'shared/components/hs-dialog.js',
  'apps/admin/pages/insights.page.js',
  'apps/admin/pages/controls.page.js',
  'apps/admin/pages/tech-center.page.js',
  'apps/admin/modules/ops-core.js',
  'apps/admin/modules/ops-routes.js',
  'apps/admin/modules/ops-center.js',
  'apps/admin/pages/alerts.page.js',
  'services/ops-api.js',
  'apps/customer/customer-session.js',
  'apps/customer/customer-router.js',
  'apps/guest/guest-policy.js',
  'apps/guest/guest-entry.js',
  'apps/customer/pages/home.page.js',
  'apps/customer/app.js',
  'shared/components/ui-kit.js',
  'apps/customer/pages/orders.page.js',
  'apps/customer/pages/order-details.page.js',
  'apps/customer/pages/trust-features.js',
  'apps/customer/pages/offers.js',
  'apps/customer/pages/offer-alerts.js',
  'apps/customer/pages/live-map.js',
  'shared/components/hs-map.js',
  'apps/customer/pages/onboarding.js',
  'apps/customer/pages/ai-assist.js',
  'apps/customer/pages/providers.page.js',
  'apps/customer/pages/market-ui.page.js',
  'apps/customer/pages/request-wizard.page.js',
  'apps/customer/pages/request-create.page.js',
  'apps/provider/index.html',
  'apps/provider/styles/provider.css',
  'apps/provider/styles/overrides.css',
  'apps/provider/provider-request-domain.js',
  'apps/provider/provider-domain.js',
  'apps/provider/provider-location.js',
  'apps/provider/provider-auth.js',
  'apps/provider/provider-session.js',
  'apps/provider/provider-router.js',
  'apps/provider/provider-shell.js',
  'apps/provider/app.js',
  'apps/provider/pages/dashboard.page.js',
  'apps/provider/pages/incoming-requests.page.js',
  'apps/provider/pages/active-jobs.page.js',
  'apps/provider/pages/quotes.page.js',
  'apps/provider/pages/schedule.page.js',
  'apps/provider/pages/reviews.page.js',
  'apps/provider/pages/transactions.page.js',
  'apps/provider/pages/earnings.page.js',
  'apps/provider/pages/profile.page.js',
  'apps/provider/pages/services.page.js',
  'apps/provider/pages/notifications.page.js',
  'apps/provider/pages/request-details.page.js',
  'services/local-attachments.js',
  'apps/customer/pages/search.page.js',
  'apps/customer/pages/discover.page.js',
  'apps/customer/pages/addresses.page.js',
  'apps/customer/pages/account.page.js',
  'apps/customer/pages/support.page.js',
  'manifest.json',
  'services/firebase-config.js',
  'services/firebase-backend.js',
  'apps/admin/modules/admin-live.js',
  'apps/admin/modules/admin-live-panels.js',
  'apps/admin/modules/client-errors.js',
  'apps/admin/modules/site-content-editor.js',
  'apps/admin/modules/marketing-editor.js',
  'apps/admin/modules/mini-charts.js',
  'apps/admin/modules/command-palette.js',
  'shared/content/site-content.js',
  'assets/vendor/firebase/13.1.0/firebase-app.js',
  'assets/vendor/firebase/13.1.0/firebase-auth.js',
  'assets/vendor/firebase/13.1.0/firebase-functions.js',
  'assets/vendor/firebase/13.1.0/firebase-database.js',
  'assets/vendor/firebase/13.1.0/firebase-messaging.js',
  'assets/app-icon-192.png',
  'assets/app-icon-512.png',
  'assets/brand/logo-v10-mark.webp',
  'assets/brand/logo-v10-word.webp',
  'assets/brand/logo-v10-lockup.webp',
  'assets/brand/logo-v10-lockup-light.webp',
  'assets/icons/svc/home/electric.webp',
  'assets/icons/svc/home/plumbing.webp',
  'assets/icons/svc/home/carpentry.webp',
  'assets/icons/svc/home/painting.webp',
  'assets/icons/svc/home/cars.webp',
  'assets/icons/svc/home/cleaning.webp',
  'assets/icons/svc/home/appliances.webp',
  'assets/brand/hero-tech-v2.webp',
  'assets/brand/hero-tech-v3.jpg',
  'assets/brand/hsl-mark.svg',
  'assets/brand/hsl-lockup.png',
  'assets/brand/hsl-lockup-light.png',
  'assets/brand/hsl-word.png',
  'assets/brand/bg-navy.svg',
  'assets/brand/bg-red.svg',
  'assets/brand/bg-light.svg',
  'shared/design-system/brand-2026-tokens.css',
  'assets/brand/onboard-1.webp',
  'assets/brand/trust-handshake.jpg',
]

/* ═════════ تثبيت: تخزين مسبق بمرونة ═════════
   لا نُفشل التثبيت لو فشل ملف واحد (مثلاً icon.svg مفقود أو asset ناقص). */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map(async url => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (e) {
        /* تجاهل الملفات غير المتاحة — التطبيق يعمل ببقية الملفات */
      }
    }));
    try { await self.skipWaiting(); } catch {}
  })());
});

/* ═════════ تنشيط: تنظيف كل الكاشات القديمة ═════════ */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    try { await self.clients.claim(); } catch {}
  })());
});

/* ═════════ اعتراض الطلبات ═════════ */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* تجاهل أي مخطط غير HTTP/HTTPS (chrome-extension, blob, data, …) */
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  /* Firebase backend traffic (Auth, callable Functions, Realtime Database, reCAPTCHA) is never intercepted or cached:
     authenticated responses must not land in the offline cache. */
  if (/(^|\.)(googleapis\.com|firebaseio\.com|firebasedatabase\.app|cloudfunctions\.net|firebaseapp\.com|recaptcha\.net)$/.test(url.hostname) && !/^fonts\./.test(url.hostname)) return;
  if (url.hostname === 'www.google.com' && url.pathname.startsWith('/recaptcha')) return;

  const isFont = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);

  /* ── التنقل (فتح الصفحة) ── */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const copy = fresh.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return fresh;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        return (await caches.match('index.html')) || new Response('', { status: 503, statusText: 'offline' });
      }
    })());
    return;
  }

  /* ── الأصول ── */
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        if (url.origin === location.origin || (isFont && (res.ok || res.type === 'opaque'))) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
      }
      return res;
    } catch {
      if (req.destination === 'document') {
        const idx = await caches.match('index.html');
        if (idx) return idx;
      }
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});

/* ═════════ رسائل من الصفحة ═════════ */
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  }
});
/* ═════════ Web push (FCM, data-only) ═════════
   The server sends {title, body, link, tag}. Shown as a system notification unless the app is open and focused (the
   in-app notifications already update live). Tapping opens/focuses the app at the deep link (relative to this scope). */
self.addEventListener('push', event => {
  let d = {};
  try { const p = event.data ? event.data.json() : {}; d = p.data || p; } catch (e) { d = {}; }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(w => w.focused && w.visibilityState === 'visible')) return;
    await self.registration.showNotification(d.title || 'هنصلحلك', {
      body: d.body || '', icon: 'assets/app-icon-192.png', badge: 'assets/app-icon-192.png',
      dir: 'rtl', lang: 'ar', tag: d.tag || 'hs', renotify: true, data: { link: d.link || 'apps/customer/index.html' }
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.link) || 'apps/customer/index.html', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = wins.find(w => w.url.split('#')[0] === url.split('#')[0]);
    if (same) { try { await same.navigate(url); } catch (e) {} return same.focus(); }
    return self.clients.openWindow(url);
  })());
});