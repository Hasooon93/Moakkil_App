// sw.js - Service Worker V3.2 (Smart Fetch & Safari Fixes)

const CACHE_NAME = 'moakkil-cache-v3.2'; // تم تحديث الإصدار لإجبار المتصفح على التحديث
// استخدام الروابط النظيفة بدون .html لتجنب أخطاء التوجيه في كلاودفلير وسفاري
const STATIC_ASSETS = [
    '/',
    '/login',
    '/app',
    '/css/style.css',
    '/js/config.js',
    '/js/api.js',
    '/js/auth.js',
    '/js/app.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] جاري تخزين الملفات...');
            return cache.addAll(STATIC_ASSETS).catch((err) => console.warn('Cache warning:', err));
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // 1. تجاهل إضافات المتصفح والطلبات غير الـ HTTP
    if (!event.request.url.startsWith('http')) return;

    const requestUrl = new URL(event.request.url);

    // 2. التجاهل الذكي: لا تتدخل في طلبات الـ API، وسكربتات كلاودفلير، وصور فيسبوك الخارجية
    if (requestUrl.pathname.startsWith('/api/') || 
        requestUrl.hostname.includes('cloudflareinsights.com') ||
        requestUrl.hostname.includes('fbcdn.net')) {
        return; // دع المتصفح يتعامل معها مباشرة دون تدخل الـ Service Worker
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // إذا كان الملف في الكاش، أرجعه فوراً
            if (cachedResponse) {
                return cachedResponse;
            }

            // إذا لم يكن في الكاش، اطلبه من الشبكة
            return fetch(event.request).then((networkResponse) => {
                // إصلاح مشكلة Safari: عدم تخزين أي رد يحتوي على توجيه (Redirected)
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' || networkResponse.redirected) {
                    return networkResponse;
                }

                // تخزين النسخة الناجحة في الكاش
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    if (event.request.url.startsWith('http')) {
                        cache.put(event.request, responseToCache);
                    }
                });

                return networkResponse;
            }).catch(() => {
                // 3. إصلاح خطأ TypeError الجذري: إرجاع Response صالح دائماً في حال انقطاع النت أو حظر الطلب

                // إذا كان الطلب لصورة وفشل تحميلها (مثل صورة فيسبوك مكسورة أو انقطاع نت)
                if (event.request.destination === 'image') {
                    // إرجاع صورة SVG افتراضية أنيقة (Placeholder)
                    const fallbackSvg = `
                        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
                            <rect width="200" height="200" fill="#e2e8f0"/>
                            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#94a3b8">لا توجد صورة</text>
                        </svg>`;
                    return new Response(fallbackSvg, {
                        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }
                    });
                }

                // للطلبات الأخرى، نرجع استجابة خطأ وهمية لتجنب انهيار المتصفح
                return new Response('Offline or Network Error', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'text/plain' }
                });
            });
        })
    );
});

// =================================================================
// إشعارات الدفع (Push Notifications)
// =================================================================
self.addEventListener('push', (event) => {
    if (!event.data) return;
    try {
        const payload = event.data.json();
        const options = {
            body: payload.message || payload.body || 'يوجد تحديث جديد.',
            icon: '/assets/img/icon-192x192.png',
            badge: '/assets/img/badge.png',
            dir: 'rtl',
            lang: 'ar',
            vibrate: [200, 100, 200, 100, 200],
            requireInteraction: true,
            data: { url: payload.action_url || payload.url || '/app' }
        };
        event.waitUntil(self.registration.showNotification(payload.title || 'موكّل', options));
    } catch (e) {
        event.waitUntil(self.registration.showNotification('موكّل', { body: event.data.text(), dir: 'rtl' }));
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || '/app';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(window.location.origin) && 'focus' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(urlToOpen);
        })
    );
});