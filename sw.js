// sw.js - Service Worker V4.0 (Enterprise Offline & R2 Sync Edition)
// التحديثات: خوارزمية Stale-While-Revalidate، التوافق التام مع عدم الاتصال، دعم كل شاشات التطبيق، وحماية الـ API.

const CACHE_NAME = 'moakkil-cache-v4.0-enterprise';

// 🚀 تغطية شاملة لجميع واجهات وملفات النظام ليعمل كـ Native App
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/app.html',
    '/case-details.html',
    '/client-details.html',
    '/staff.html',
    '/library.html',
    '/reports.html',
    '/calculators.html',
    '/ai-chat.html',
    '/css/style.css',
    '/js/config.js',
    '/js/api.js',
    '/js/auth.js',
    '/js/app.js',
    '/js/case-details.js',
    '/js/client-details.js',
    '/js/staff.js',
    '/js/library.js',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // تفعيل النسخة الجديدة فوراً دون انتظار إغلاق المتصفح
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] جاري تخزين ملفات النظام للعمل دون اتصال...');
            return cache.addAll(STATIC_ASSETS).catch((err) => console.warn('Cache Warning (بعض الملفات غير موجودة، سيتم تجاهلها):', err));
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // حذف أي كاش قديم لتوفير مساحة وحل مشكلة تداخل الأكواد
                    if (cacheName !== CACHE_NAME) {
                        console.log(`[Service Worker] تنظيف الكاش القديم: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // إجبار جميع النوافذ المفتوحة على استخدام الـ SW الجديد
    );
});

self.addEventListener('fetch', (event) => {
    // 1. تجاهل الطلبات غير الـ GET (مثل POST للمزامنة) وتجاهل إضافات كروم
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

    const requestUrl = new URL(event.request.url);

    // 2. الجدار الناري (Firewall Bypass): تجاهل مسارات الـ API السحابية (لأن api.js هو من يدير المزامنة المحلية)
    if (requestUrl.pathname.startsWith('/api/') || 
        requestUrl.hostname.includes('cloudflareinsights.com') ||
        requestUrl.hostname.includes('googleapis.com')) {
        return; 
    }

    // فحص ما إذا كان الطلب لصفحة HTML
    const isHtml = event.request.mode === 'navigate' || event.request.headers.get('accept').includes('text/html');

    if (isHtml) {
        // 🧠 خوارزمية للصفحات: (Network-First, Fallback to Cache)
        // نحاول جلب أحدث صفحة من السيرفر، وإذا انقطع النت نجلبها من الكاش
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    // تحديث الكاش بالنسخة الأحدث
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return networkResponse;
                })
                .catch(() => {
                    // انقطاع إنترنت -> جلب الصفحة من الكاش
                    return caches.match(event.request).then(cachedRes => {
                        return cachedRes || caches.match('/app.html'); // إذا لم تكن الصفحة مخبأة، وجهه للوحة الرئيسية
                    });
                })
        );
    } else {
        // 🧠 خوارزمية للملفات الساكنة CSS/JS/Images: (Stale-While-Revalidate)
        // نعرض النسخة المخبأة فوراً لسرعة البرق، ونجلب النسخة الأحدث بالخلفية
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                const networkFetchPromise = fetch(event.request).then(networkResponse => {
                    // إصلاح خطأ سفاري (Redirects)
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' || networkResponse.redirected) {
                        return networkResponse;
                    }
                    // تحديث الكاش في الخلفية
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
                    return networkResponse;
                }).catch(() => {
                    // إصلاح خطأ الصور المكسورة في وضع الأوفلاين
                    if (event.request.destination === 'image') {
                        const fallbackSvg = `
                            <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
                                <rect width="200" height="200" fill="#e2e8f0"/>
                                <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="16" fill="#94a3b8">أنت Offline</text>
                            </svg>`;
                        return new Response(fallbackSvg, {
                            headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }
                        });
                    }
                });

                // إرجاع الكاش فوراً إذا وجد، أو انتظار السيرفر
                return cachedResponse || networkFetchPromise;
            })
        );
    }
});

// =================================================================
// 🔔 إشعارات الدفع (Push Notifications) وارتباطها بالنوافذ المفتوحة
// =================================================================
self.addEventListener('push', (event) => {
    if (!event.data) return;
    try {
        const payload = event.data.json();
        const options = {
            body: payload.message || payload.body || 'يوجد تحديث جديد في النظام.',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png', // أيقونة صغيرة تظهر في شريط المهام للأندرويد
            dir: 'rtl',
            lang: 'ar',
            vibrate: [200, 100, 200, 100, 200], // نمط اهتزاز مميز
            requireInteraction: true, // يبقى الإشعار ظاهراً حتى يغلقه المستخدم
            data: { url: payload.action_url || payload.url || '/app.html' }
        };
        event.waitUntil(self.registration.showNotification(payload.title || 'تنبيه من موكّل', options));
    } catch (e) {
        event.waitUntil(self.registration.showNotification('تنبيه من موكّل', { body: event.data.text(), dir: 'rtl', icon: '/icons/icon-192.png' }));
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || '/app.html';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // التحقق مما إذا كان التطبيق مفتوحاً بالفعل، فيتم التركيز عليه (Focus)
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(window.location.origin) && 'focus' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            // إذا لم يكن مفتوحاً، نفتح نافذة جديدة
            if (clients.openWindow) return clients.openWindow(urlToOpen);
        })
    );
});

// =================================================================
// 📡 التزامن في الخلفية (Background Sync API)
// =================================================================
self.addEventListener('sync', (event) => {
    if (event.tag === 'moakkil-offline-sync') {
        console.log('[Service Worker] تم رصد عودة الإنترنت، جاري توجيه التطبيق للمزامنة...');
        // نطلب من كل النوافذ المفتوحة للتطبيق أن تقوم بتشغيل دالة processOfflineQueue()
        event.waitUntil(
            self.clients.matchAll().then(clients => {
                clients.forEach(client => client.postMessage({ type: 'START_OFFLINE_SYNC' }));
            })
        );
    }
});