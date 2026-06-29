/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: sw.js (Service Worker - Enterprise Offline & Sync Edition)
 * الوصف: المحرك السحابي المحلي لضمان عمل النظام كـ (PWA) وتوفير تجربة
 * الموبايل الأصلية (Native App) حتى عند انقطاع الإنترنت.
 * الميزات:
 * 1. استراتيجيات كاش ذكية (Network-First للبيانات، Stale-While-Revalidate للملفات).
 * 2. اعتراض الأخطاء القاتلة (TypeError Fallback) لتجنب انهيار المتصفح.
 * 3. نظام الإشعارات الفورية (Push Notifications).
 * 4. المزامنة في الخلفية (Background Sync) عند عودة الإنترنت.
 * ============================================================================
 */

// ============================================================================
// [1] إعدادات الكاش والملفات الأساسية (Cache Configuration)
// ============================================================================
const CACHE_NAME = 'moakkil-cache-v4.2-enterprise';

// قائمة الملفات الثابتة التي يجب تخزينها ليعمل النظام دون إنترنت.
// ملاحظة: استخدام المسارات النسبية (./) يمنع أخطاء الـ Live Server والاستضافات الفرعية.
const STATIC_ASSETS = [
    './',
    './index.html',
    './login.html',
    './app.html',
    './case-details.html',
    './client-details.html',
    './staff.html',
    './library.html',
    './reports.html',
    './calculators.html',
    './ai-chat.html',
    './css/style.css',
    './js/config.js',
    './js/api.js',
    './js/auth.js',
    './js/app-core.js', // تأكدت من أن الاسم يطابق الهيكلة الجديدة
    './js/app-cases.js',
    './js/app-clients.js',
    './js/app-agenda.js',
    './js/app-settings.js',
    './js/case-details.js',
    './js/client-details.js',
    './js/staff.js',
    './js/library.js',
    './js/ai-handler.js',
    './manifest.json'
];

// ============================================================================
// [2] دورة حياة السيرفس وركر (Install & Activate Events)
// ============================================================================

// حدث التثبيت: يتم فيه تخزين الملفات الأساسية مسبقاً (Pre-caching)
self.addEventListener('install', (event) => {
    self.skipWaiting(); // فرض تفعيل النسخة الجديدة فوراً دون انتظار إغلاق التبويبات
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] جاري تخزين ملفات النظام للعمل دون اتصال...');
            // استخدام catch يضمن عدم فشل التثبيت بالكامل إذا كان هناك ملف مفقود 404
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[Service Worker] تحذير: تعذر تخزين بعض الملفات، سيتم تجاهلها.', err);
            });
        })
    );
});

// حدث التفعيل: يتم فيه تنظيف مخلفات النسخ القديمة لتوفير مساحة في جهاز المستخدم
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log(`[Service Worker] تنظيف الكاش القديم: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // السيطرة الفورية على جميع الصفحات المفتوحة
    );
});

// ============================================================================
// [3] محرك اعتراض الطلبات (Fetch Interceptor & Offline Strategies)
// ============================================================================
self.addEventListener('fetch', (event) => {
    // تجاهل الطلبات غير الـ GET، وتجاهل إضافات المتصفح (chrome-extension://)
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

    const requestUrl = new URL(event.request.url);

    // 🛡️ الجدار الناري: تجاهل مسارات الـ API والخدمات الخارجية (يجب أن تكون حية دائماً)
    if (
        requestUrl.pathname.startsWith('/api/') || 
        requestUrl.hostname.includes('cloudflareinsights.com') ||
        requestUrl.hostname.includes('googleapis.com')
    ) {
        return; 
    }

    // تحديد ما إذا كان الطلب لصفحة HTML أم لملف ساكن (صورة، CSS، JS)
    const isHtml = event.request.mode === 'navigate' || event.request.headers.get('accept').includes('text/html');

    if (isHtml) {
        // 🧠 خوارزمية الصفحات (Network-First, Fallback to Cache)
        // نحاول جلب أحدث نسخة من السيرفر أولاً، وإذا انقطع الإنترنت نعرض النسخة المخزنة.
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return networkResponse;
                })
                .catch(() => {
                    console.warn(`[Service Worker] أنت Offline. جلب صفحة ${requestUrl.pathname} من الكاش.`);
                    return caches.match(event.request).then(cachedRes => {
                        // إذا كانت الصفحة غير مخزنة، نعرض الصفحة الرئيسية كبديل آمن
                        return cachedRes || caches.match('./app.html'); 
                    });
                })
        );
    } else {
        // 🧠 خوارزمية الملفات الساكنة (Stale-While-Revalidate)
        // نعرض الملف المخزن فوراً لسرعة البرق، وفي الخلفية نحدث الكاش للزيارة القادمة.
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                const networkFetchPromise = fetch(event.request).then(networkResponse => {
                    // فلترة الاستجابات غير الصالحة لحماية الكاش
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' || networkResponse.redirected) {
                        return networkResponse;
                    }
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
                    return networkResponse;
                }).catch(() => {
                    // 🔥 الإصلاح الجذري (TypeError Fallback) عند انقطاع الإنترنت تماماً
                    
                    // إذا كان الطلب لصورة، نعرض صورة SVG بديلة توضح الانقطاع
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
                    
                    // إرجاع استجابة فارغة وآمنة لأي ملف آخر (مثل JS/CSS مفقود) حتى لا ينهار المتصفح
                    return new Response('', { 
                        status: 503, 
                        statusText: 'Service Unavailable (Offline)',
                        headers: new Headers({'Content-Type': 'text/plain'})
                    });
                });

                return cachedResponse || networkFetchPromise;
            })
        );
    }
});

// ============================================================================
// [4] إشعارات الدفع (Web Push Notifications)
// ============================================================================

// استلام الإشعار من الباك إند (Cloudflare Worker)
self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    try {
        const payload = event.data.json();
        const options = {
            body: payload.message || payload.body || 'يوجد تحديث جديد في النظام.',
            icon: './icons/icon-192.png', // المسار الافتراضي لأيقونات الـ PWA
            badge: './icons/icon-192.png', 
            dir: 'rtl',
            lang: 'ar',
            vibrate: [200, 100, 200, 100, 200], // اهتزاز مميز
            requireInteraction: true, // الإشعار يبقى حتى يتفاعل معه المستخدم
            data: { url: payload.action_url || payload.url || './app.html' }
        };
        event.waitUntil(self.registration.showNotification(payload.title || 'تنبيه من موكّل', options));
    } catch (e) {
        // في حال كان الـ Payload نصاً عادياً وليس JSON
        event.waitUntil(self.registration.showNotification('تنبيه من موكّل', { body: event.data.text(), dir: 'rtl' }));
    }
});

// التفاعل مع الإشعار عند النقر عليه
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || './app.html';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // إذا كان النظام مفتوحاً مسبقاً، قم بتنشيطه وتوجيهه للرابط
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(window.location.origin) && 'focus' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            // إذا لم يكن مفتوحاً، افتح نافذة جديدة
            if (clients.openWindow) return clients.openWindow(urlToOpen);
        })
    );
});

// ============================================================================
// [5] التزامن في الخلفية (Background Sync API)
// ============================================================================
// يتم تفعيل هذا الحدث تلقائياً بواسطة المتصفح فور عودة الاتصال بالإنترنت
self.addEventListener('sync', (event) => {
    if (event.tag === 'moakkil-offline-sync') {
        console.log('[Service Worker] تم رصد عودة الإنترنت، جاري بدء المزامنة الخلفية...');
        event.waitUntil(
            self.clients.matchAll().then(clients => {
                // نرسل إشارة لملف api.js لكي يبدأ برفع البيانات المتراكمة في الـ IndexedDB
                clients.forEach(client => client.postMessage({ type: 'START_OFFLINE_SYNC' }));
            })
        );
    }
});