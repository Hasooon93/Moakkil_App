// sw.js - Service Worker V4.0 (Cloudflare Analytics Fix & Offline Cache)

const CACHE_NAME = 'moakkil-cache-v4.0';
const STATIC_ASSETS = [
    '/',
    '/login.html',
    '/app.html',
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

    // 🛡️ التحديث الجوهري: تجاهل تام لأي رابط خارجي (يحل خطأ 408 لـ Cloudflare Insights) وتجاهل الـ API
    if (requestUrl.origin !== location.origin || requestUrl.pathname.startsWith('/api/')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
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
            data: { url: payload.url || '/app.html' }
        };
        event.waitUntil(self.registration.showNotification(payload.title || 'موكّل', options));
    } catch (e) {
        event.waitUntil(self.registration.showNotification('موكّل', { body: event.data.text(), dir: 'rtl' }));
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url || '/app.html'));
});