// sw.js - Service Worker V3.1 (Safari & iOS Fixes)

const CACHE_NAME = 'moakkil-cache-v3.1';
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
    // 1. تجاهل إضافات المتصفح
    if (!event.request.url.startsWith('http')) return;

    const requestUrl = new URL(event.request.url);

    // 2. تجاهل طلبات الـ API والمزامنة
    if (requestUrl.pathname.startsWith('/api/')) return; 

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                // إصلاح مشكلة Safari: عدم تخزين أي رد يحتوي على توجيه (Redirected)
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' || networkResponse.redirected) {
                    return networkResponse;
                }

                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    if (event.request.url.startsWith('http')) {
                        cache.put(event.request, responseToCache);
                    }
                });

                return networkResponse;
            }).catch(() => {
                // الحل الجراحي: إرجاع استجابة صالحة (Response Object) بدلاً من null لتجنب الانهيار
                return new Response('Network error occurred or resource blocked.', {
                    status: 408,
                    headers: { 'Content-Type': 'text/plain' },
                });
            });

            return cachedResponse || fetchPromise;
        })
    );
});

// إشعارات الدفع (Push Notifications)
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