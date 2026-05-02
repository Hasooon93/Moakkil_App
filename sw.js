// sw.js - Service Worker V5.0 (Bulletproof Offline Cache & Redirect Fix)

const CACHE_NAME = 'moakkil-cache-v5.0';
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
            console.log('[Service Worker] جاري تخزين ملفات النظام...');
            return cache.addAll(STATIC_ASSETS).catch((err) => console.warn('Cache warning:', err));
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // 🛡️ تجاهل الروابط الخارجية، وطلبات الـ API لعدم تكييشها
    if (requestUrl.origin !== location.origin || requestUrl.pathname.startsWith('/api/')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                // 🛡️ الحل الجذري لمشكلة الـ Redirect Error: تمرير الرد الموجه بدون تكييش
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' || networkResponse.redirected) {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            }).catch(() => null);

            return cachedResponse || fetchPromise;
        })
    );
});

self.addEventListener('push', (event) => {
    if (!event.data) return;
    try {
        const payload = event.data.json();
        const options = {
            body: payload.message || payload.body || 'تحديث جديد',
            icon: '/icons/icon-192.png',
            dir: 'rtl', lang: 'ar',
            vibrate: [200, 100, 200],
            data: { url: payload.url || '/app' }
        };
        event.waitUntil(self.registration.showNotification(payload.title || 'موكّل', options));
    } catch (e) {
        event.waitUntil(self.registration.showNotification('موكّل', { body: event.data.text(), dir: 'rtl' }));
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url || '/app'));
});