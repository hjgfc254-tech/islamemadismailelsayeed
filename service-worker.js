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

const CACHE = 'hansalhlak-v8-architecture-19';

/* الملفات الأساسية — يجب أن تعمل offline بعد أول زيارة */
const FILES = [
  './',
  'index.html',
  'apps/customer/index.html',
  'apps/customer/styles/customer.css',
  'shared/design-system/design-system.css',
  'shared/icons/icon-registry.js',
  'shared/components/accessible-tabs.js',
  'shared/config/legacy-data.js',
  'services/local-catalog.js',
  'services/local-market-store.js',
  'apps/customer/customer-session.js',
  'apps/customer/customer-router.js',
  'apps/guest/guest-policy.js',
  'apps/guest/guest-entry.js',
  'apps/customer/pages/home.page.js',
  'apps/customer/app.js',
  'shared/components/ui-kit.js',
  'apps/customer/pages/orders.page.js',
  'apps/customer/pages/order-details.page.js',
  'apps/customer/pages/providers.page.js',
  'apps/customer/pages/market-ui.page.js',
  'apps/customer/pages/request-wizard.page.js',
  'apps/customer/pages/request-create.page.js',
  'apps/provider/index.html',
  'apps/provider/styles/provider.css',
  'apps/provider/provider-request-domain.js',
  'apps/provider/provider-domain.js',
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
  'assets/icon.svg',
  'assets/logo-mark.webp',
  'assets/logo-word.webp',
  'assets/slide-guide.svg',
  'assets/slide-popular.svg',
  'assets/slide-latest.svg',
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