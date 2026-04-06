// sw.js - Service Worker for Moakkil System (Offline Mode & Push Notifications)
const CACHE_NAME = 'moakkil-v1-2026';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/app.html',
    '/css/style.css',
    '/js/app.js',
    '/js/api.js',
    '/js/auth.js',
    '/manifest.json'
];

// 1. تنصيب ملف الـ Service Worker وتخزين الملفات الأساسية
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Opened cache and storing static assets.');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// 2. تفعيل الـ Service Worker وحذف الكاش القديم إن وجد
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
        })
    );
    self.clients.claim();
});

// 3. استراتيجية (Network First) لضمان أحدث البيانات مع دعم الأوفلاين
self.addEventListener('fetch', (event) => {
    // تجاهل استعلامات الـ API من الكاش (يجب أن تأتي دائماً من السيرفر)
    if (event.request.url.includes('/api/')) {
        return; 
    }

    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});

// =========================================================
// 🔔 [ الإشعارات الفورية - Push Notifications ] 🔔
// =========================================================

// 4. استلام الإشعار من الباك إند (حتى لو كان المتصفح/التطبيق مغلقاً)
self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        const data = event.data.json();
        const title = data.title || 'إشعار جديد - نظام موكّل';
        const options = {
            body: data.message || 'لديك تحديث جديد في النظام.',
            icon: '/assets/icon-192.png', // تأكد من وضع أيقونة التطبيق في مجلد assets
            badge: '/assets/badge.png',   // أيقونة شريط الإشعارات الصغير
            vibrate: [200, 100, 200],     // هزاز الهاتف
            data: {
                url: data.action_url || '/app.html' // الصفحة التي سيتم فتحها عند النقر
            },
            requireInteraction: true // يبقى الإشعار ظاهراً حتى يتفاعل معه المستخدم
        };

        event.waitUntil(self.registration.showNotification(title, options));
    } catch (e) {
        console.error("Error parsing push data:", e);
        // إشعار احتياطي في حال فشل قراءة الـ JSON
        event.waitUntil(self.registration.showNotification('نظام موكّل', {
            body: event.data.text(),
            icon: '/assets/icon-192.png'
        }));
    }
});

// 5. التفاعل عند النقر على الإشعار (فتح التطبيق وتوجيه المستخدم)
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // إغلاق الإشعار بعد النقر

    const urlToOpen = event.notification.data.url;

    // فحص ما إذا كان التطبيق مفتوحاً بالفعل لعمل Focus بدلاً من فتح نافذة جديدة
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            let matchingClient = null;

            for (let i = 0; i < windowClients.length; i++) {
                const windowClient = windowClients[i];
                if (windowClient.url.includes(urlToOpen)) {
                    matchingClient = windowClient;
                    break;
                }
            }

            if (matchingClient) {
                return matchingClient.focus();
            } else {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});