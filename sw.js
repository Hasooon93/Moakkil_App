// sw.js - Service Worker for Moakkil System (Offline Mode & Push Notifications)
const CACHE_NAME = 'moakkil-v1-2026';
const STATIC_ASSETS = [
    '/', '/index.html', '/login.html', '/app.html', '/css/style.css',
    '/js/app.js', '/js/api.js', '/js/auth.js', '/manifest.json'
];

// 1. تنصيب وتخزين الملفات الأساسية
self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
    self.skipWaiting();
});

// 2. تفعيل وحذف الكاش القديم
self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k)))));
    self.clients.claim();
});

// 3. استراتيجية (Network First) لدعم الأوفلاين
self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('/api/')) return;
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// 🔔 4. استلام الإشعارات الفورية (Push Notifications)
self.addEventListener('push', (event) => {
    if (!event.data) return;
    try {
        const data = event.data.json();
        const options = {
            body: data.message || 'لديك تحديث جديد في نظام موكّل.',
            icon: '/assets/icon-192.png',
            badge: '/assets/badge.png',
            vibrate: [200, 100, 200],
            data: { url: data.action_url || '/app.html' },
            requireInteraction: true
        };
        event.waitUntil(self.registration.showNotification(data.title || 'إشعار جديد', options));
    } catch (e) {
        event.waitUntil(self.registration.showNotification('نظام موكّل', { body: event.data.text() }));
    }
});

// 5. التفاعل عند النقر على الإشعار
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data.url;
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let client of windowClients) {
                if (client.url.includes(urlToOpen) && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(urlToOpen);
        })
    );
});