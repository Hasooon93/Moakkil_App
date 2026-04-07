// sw.js - Service Worker V3.0 (Enterprise Edition)
// الدعم: إشعارات الدفع (Push Notifications)، التخزين المؤقت المتقدم (Offline Caching)، وفتح الروابط الذكي.

const CACHE_NAME = 'moakkil-cache-v3.0';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/app.html',
    '/css/style.css',
    '/js/config.js',
    '/js/api.js',
    '/js/auth.js',
    '/js/app.js'
    // سيتم تخزين باقي الملفات ديناميكياً عند زيارتها
];

// =================================================================
// 1. التثبيت (Install) - تخزين ملفات النظام الأساسية
// =================================================================
self.addEventListener('install', (event) => {
    self.skipWaiting(); // تفعيل الخدمة فوراً دون انتظار
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] جاري تخزين ملفات النظام الأساسية (Offline Mode)...');
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[Service Worker] تحذير: بعض الملفات غير موجودة لتخزينها', err);
            });
        })
    );
});

// =================================================================
// 2. التفعيل (Activate) - تنظيف النسخ القديمة
// =================================================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] حذف النسخة القديمة:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // السيطرة على كل الصفحات المفتوحة حالياً
    );
});

// =================================================================
// 3. الاعتراض (Fetch) - استراتيجية الشبكة أولاً مع التخزين المؤقت
// =================================================================
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // أ) لا نتدخل في طلبات الـ API (نتعامل معها في api.js عبر طابور الاوفلاين)
    if (requestUrl.pathname.startsWith('/api/')) {
        return; 
    }

    // ب) استراتيجية Stale-While-Revalidate للملفات الساكنة (HTML, CSS, JS)
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                // تحديث الكاش بالنسخة الجديدة في الخلفية
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // إذا فشل الاتصال وليس لدينا كاش، يمكن إرجاع صفحة اوفلاين (اختياري)
                return null; 
            });

            // إرجاع الكاش فوراً إن وجد، أو انتظار الشبكة
            return cachedResponse || fetchPromise;
        })
    );
});

// =================================================================
// 4. الإشعارات الفورية (Push Notifications)
// =================================================================
self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        const payload = event.data.json();
        
        // إعدادات الإشعار التي تظهر للمستخدم
        const options = {
            body: payload.message || payload.body || 'يوجد تحديث جديد في النظام.',
            icon: '/assets/img/icon-192x192.png', // أيقونة التطبيق (يجب التأكد من وجودها)
            badge: '/assets/img/badge.png',       // أيقونة شريط الإشعارات الصغير
            dir: 'rtl',
            lang: 'ar',
            vibrate: [200, 100, 200, 100, 200], // اهتزاز مميز
            requireInteraction: true, // بقاء الإشعار حتى يتفاعل معه المستخدم
            data: {
                url: payload.action_url || payload.url || '/app.html' // الرابط المخفي ليتم فتحه عند النقر
            }
        };

        const title = payload.title || 'نظام موكّل القانوني';

        event.waitUntil(
            self.registration.showNotification(title, options)
        );

    } catch (e) {
        // في حال كان الإرسال نصياً وليس JSON
        event.waitUntil(
            self.registration.showNotification('نظام موكّل القانوني', {
                body: event.data.text(),
                dir: 'rtl',
                icon: '/assets/img/icon-192x192.png'
            })
        );
    }
});

// =================================================================
// 5. التفاعل مع الإشعارات (Notification Click)
// =================================================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // إغلاق الإشعار بعد النقر

    const urlToOpen = event.notification.data?.url || '/app.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // التحقق مما إذا كان التطبيق مفتوحاً بالفعل في تبويبة
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                // إذا كان مفتوحاً، قم بتحديث الرابط وجعله في الواجهة (Focus)
                if (client.url.includes(window.location.origin) && 'focus' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            // إذا كان التطبيق مغلقاً بالكامل، افتح نافذة جديدة
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});