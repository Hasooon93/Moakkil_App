/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: sw.js (Service Worker - Enterprise Offline & Sync Edition V5.1)
 * الوصف: المحرك السحابي المحلي لضمان عمل النظام كـ (PWA) وتوفير تجربة
 * الموبايل الأصلية (Native App) حتى عند انقطاع الإنترنت.
 * الميزات:
 * 1. استراتيجيات كاش ذكية (Network-First للبيانات، Stale-While-Revalidate للملفات).
 * 2. اعتراض الأخطاء القاتلة (TypeError Fallback) لتجنب انهيار المتصفح.
 * 3. نظام الإشعارات الفورية (Push Notifications) المتوافق مع بيئة Worker (self).
 * 4. المزامنة في الخلفية (Background Sync) عند عودة الإنترنت.
 * ============================================================================
 */

// ============================================================================
// [1] إعدادات الكاش والملفات الأساسية (Cache Configuration)
// ============================================================================
const CACHE_NAME = 'moakkil-cache-v5.6-enterprise';

// الأيقونة الرسمية المعتمدة في manifest.json وملفات الواجهة
const DEFAULT_ICON_URL = 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEg4PE-keniz_4Af49kFkt6o_JmNj4K1yDZpdoDpXtzZcw6Zylh6l3MKyG186d2NmFov_1xIZ8qhXY136PeE5OpQlWQgR45YFvKo9MdMlL6K0rE-IqIyiMINdIrAynb44a2V_177s_xcULbLfMWgLuXJP4-uQ8zx3V-Cl3HNwXucegTli7-sDlUnAIGS__M/s320/icon-512.png.png';

// قائمة الملفات الثابتة التي يجب تخزينها ليعمل النظام دون إنترنت.
// ملاحظة: استخدام المسارات النسبية (./) يمنع أخطاء الـ Live Server والاستضافات الفرعية.
const STATIC_ASSETS = [
    './',
    './index.html',
    './login.html',
    './app.html',
    './case-details.html',
    './client-details.html',
    './client.html',
    './staff.html',
    './library.html',
    './reports.html',
    './calculators.html',
    './ai-chat.html',
    './privacy.html',
    './css/style.css',
    './js/config.js',
    './js/api.js',
    './js/auth.js',
    './js/app-core.js',
    './js/app-cases.js',
    './js/app-clients.js',
    './js/app-agenda.js',
    './js/app-settings.js',
    './js/case-details.js',
    './js/client-details.js',
    './js/client.js',
    './js/staff.js',
    './js/library.js',
    './js/ai-handler.js',
    './js/ai-chat.js',
    './manifest.json'
];

// ============================================================================
// [2] دورة حياة السيرفس وركر (Install & Activate Events)
// ============================================================================

// حدث التثبيت: يتم فيه تخزين الملفات الأساسية مسبقاً (Pre-caching) بشكل مرن وآمن
self.addEventListener('install', (event) => {
    self.skipWaiting(); // فرض تفعيل النسخة الجديدة فوراً دون انتظار إغلاق التبويبات
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[Service Worker] جاري تخزين ملفات النظام للعمل دون اتصال...');
            // تخزين كل ملف على حدة لضمان عدم فشل الكاش بالكامل إذا كان أحد الملفات الفرعية غير موجود
            await Promise.allSettled(
                STATIC_ASSETS.map((assetUrl) =>
                    cache.add(assetUrl).catch((err) => {
                        console.warn(`[Service Worker] تعذر تخزين الملف (${assetUrl})، تم تجاوزه:`, err);
                    })
                )
            );
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
        requestUrl.hostname.includes('googleapis.com') ||
        requestUrl.hostname.includes('fbcdn.net')
    ) {
        return;
    }

    // تحديد ما إذا كان الطلب لصفحة HTML أم لملف ساكن (صورة، CSS، JS) بأمان
    const acceptHeader = event.request.headers.get('accept') || '';
    const isHtml = event.request.mode === 'navigate' || acceptHeader.includes('text/html');

    if (isHtml) {
        // 🧠 خوارزمية الصفحات (Network-First, Fallback to Cache)
        // نحاول جلب أحدث نسخة من السيرفر أولاً، وإذا انقطع الإنترنت نعرض النسخة المخزنة.
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200 && !networkResponse.redirected) {
                        const clone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    console.warn(`[Service Worker] أنت Offline. جلب صفحة ${requestUrl.pathname} من الكاش.`);
                    return caches.match(event.request, { ignoreSearch: true }).then((cachedRes) => {
                        // إذا كانت الصفحة غير مخزنة، نعرض الصفحة الرئيسية كبديل آمن
                        if (cachedRes) return cachedRes;
                        return caches.match('./app.html', { ignoreSearch: true }).then((appRes) => {
                            return appRes || caches.match('./index.html', { ignoreSearch: true });
                        });
                    });
                })
        );
    } else {
        // 🧠 خوارزمية الملفات الساكنة (Stale-While-Revalidate)
        // نعرض الملف المخزن فوراً لسرعة البرق، وفي الخلفية نحدث الكاش للزيارة القادمة.
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
                const networkFetchPromise = fetch(event.request)
                    .then((networkResponse) => {
                        // فلترة الاستجابات غير الصالحة لحماية الكاش ومنع خطأ Redirected في Safari
                        if (
                            !networkResponse ||
                            networkResponse.status !== 200 ||
                            networkResponse.type !== 'basic' ||
                            networkResponse.redirected
                        ) {
                            return networkResponse;
                        }
                        // استنساخ متزامن فوري قبل استهلاك الـ Body لمنع خطأ Response body is already used
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                        return networkResponse;
                    })
                    .catch(() => {
                        // 🔥 الإصلاح الجذري (TypeError Fallback) عند انقطاع الإنترنت تماماً
                        if (cachedResponse) return cachedResponse;

                        // إذا كان الطلب لصورة، نعرض صورة SVG بديلة توضح الانقطاع
                        if (event.request.destination === 'image') {
                            const fallbackSvg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
                                <rect width="200" height="200" fill="#e2e8f0"/>
                                <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="16" fill="#94a3b8">أنت Offline</text>
                            </svg>`;
                            return new Response(fallbackSvg, {
                                headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }
                            });
                        }

                        // إرجاع استجابة فارغة وآمنة لأي ملف آخر حتى لا ينهار المتصفح بـ TypeError
                        return new Response('', {
                            status: 503,
                            statusText: 'Service Unavailable (Offline)',
                            headers: new Headers({ 'Content-Type': 'text/plain' })
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

/**
 * التحقق من أن رابط التوجيه ينتمي لنفس النطاق (Same-Origin) لمنع ثغرة التوجيه الخارجي (Open Redirect)
 */
function resolveSafeNotificationUrl(rawUrl, fallbackPath = './app.html') {
    const safeFallback = new URL(fallbackPath, self.location.origin).href;
    if (!rawUrl || typeof rawUrl !== 'string') return safeFallback;
    try {
        const parsed = new URL(rawUrl.trim(), self.location.origin);
        if (
            parsed.origin === self.location.origin &&
            (parsed.protocol === 'http:' || parsed.protocol === 'https:')
        ) {
            return parsed.href;
        }
        console.warn(`[Service Worker] تم حظر توجيه خارجي غير مصرح به في الإشعار: ${rawUrl}`);
    } catch (e) {
        console.warn(`[Service Worker] رابط إشعار غير صالح: ${rawUrl}`);
    }
    return safeFallback;
}

// استلام الإشعار من الباك إند (Cloudflare Worker)
self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        const payload = event.data.json();
        const safeActionUrl = resolveSafeNotificationUrl(payload.action_url || payload.url, './app.html');
        const options = {
            body: payload.message || payload.body || 'يوجد تحديث جديد في النظام.',
            icon: payload.icon || DEFAULT_ICON_URL,
            badge: payload.badge || DEFAULT_ICON_URL,
            dir: 'rtl',
            lang: 'ar',
            vibrate: [200, 100, 200, 100, 200],
            requireInteraction: true,
            data: { url: safeActionUrl }
        };
        event.waitUntil(self.registration.showNotification(payload.title || 'تنبيه من موكّل', options));
    } catch (e) {
        // في حال كان الـ Payload نصاً عادياً وليس JSON
        event.waitUntil(
            self.registration.showNotification('تنبيه من موكّل', {
                body: event.data.text(),
                dir: 'rtl',
                lang: 'ar',
                icon: DEFAULT_ICON_URL,
                badge: DEFAULT_ICON_URL,
                data: { url: resolveSafeNotificationUrl('./app.html') }
            })
        );
    }
});

// التفاعل مع الإشعار عند النقر عليه (تم إصلاح خطأ window غير المعرف واستبداله بـ self مع التحقق من النطاق)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const rawTargetUrl = event.notification.data?.url || './app.html';
    const targetUrl = resolveSafeNotificationUrl(rawTargetUrl, './app.html');

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // إذا كان النظام مفتوحاً مسبقاً في إحدى النوافذ، قم بتنشيطه وتوجيهه للرابط
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                    if ('navigate' in client) {
                        return client.navigate(targetUrl).then(() => client.focus()).catch(() => client.focus());
                    }
                    return client.focus();
                }
            }
            // إذا لم يكن مفتوحاً، افتح نافذة جديدة
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
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
            self.clients.matchAll({ includeUncontrolled: true }).then((clientsList) => {
                // نرسل إشارة لملف api.js لكي يبدأ برفع البيانات المتراكمة في الطابور المحلي
                clientsList.forEach((client) => client.postMessage({ type: 'START_OFFLINE_SYNC' }));
            })
        );
    }
});