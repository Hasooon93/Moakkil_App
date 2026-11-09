/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: sw.js (Service Worker - Enterprise Offline & Sync Edition V5.6)
 * الوصف: المحرك السحابي المحلي لضمان عمل النظام كـ (PWA) وتوفير تجربة
 * الموبايل الأصلية (Native App) بأعلى معايير الأمان (Zero-Trust) والعمل دون إنترنت.
 * 
 * الميزات:
 * 1. استراتيجيات كاش ذكية (Network-First للبيانات والصفحات، Stale-While-Revalidate للملفات الساكنة).
 * 2. عزل وحماية البيانات الحساسة: تجاوز الكاش تلقائياً لأي مسار API أو اتصالات Supabase أو روابط تحتوي على رموز مصادقة (Tokens/PINs).
 * 3. حماية الانهيار (TypeError Fallback) لضمان عدم توقف المتصفح عند انقطاع الشبكة.
 * 4. نظام الإشعارات الفورية (Web Push Notifications) المرتبط بأيقونات PWA المحلية وبوابات التوجيه الآمنة (Same-Origin Safe Routing).
 * 5. المزامنة في الخلفية (Background Sync API) لرفع التغييرات عند استعادة الاتصال.
 * ============================================================================
 */

// ============================================================================
// [1] إعدادات الكاش والملفات الأساسية (Cache Configuration)
// ============================================================================
const CACHE_NAME = 'moakkil-cache-v5.6-enterprise';

// الأيقونة الرسمية المعتمدة محلياً لدعم الـ PWA دون الاعتماد على خوادم خارجية
const DEFAULT_ICON_URL = './icons/icon-512.png';

// قائمة الملفات الثابتة الكاملة التي يجب تخزينها مسبقاً لضمان عمل النظام دون إنترنت.
// تشمل جميع صفحات HTML والأنظمة الفرعية (الحاسبات، التقارير، المكتبة القانونية، المصادقة)
const STATIC_ASSETS = [
    './',
    './index.html',
    './login.html',
    './register.html',
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
    './terms.html',
    './verify.html',
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
    './js/reports.js',
    './js/register.js',
    './js/share.js',
    './js/breakeven.js',
    './js/compound.js',
    './js/discount.js',
    './js/inheritance.js',
    './js/loan.js',
    './js/ai-handler.js',
    './js/ai-chat.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './manifest.json'
];

// ============================================================================
// [2] دورة حياة السيرفس وركر (Install & Activate Events)
// ============================================================================

// حدث التثبيت: تخزين الأصول الأساسية مسبقاً (Pre-caching) بمرونة وأمان عالي
self.addEventListener('install', (event) => {
    self.skipWaiting(); // فرض تفعيل الإصدار الجديد فوراً دون انتظار إغلاق النوافذ
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[Service Worker V5.6] جاري تخزين حزمة النظام الأساسية للعمل دون اتصال...');
            // تخزين كل ملف على حدة لضمان عدم توقف الكاش بالكامل إذا تأخر أو تعذر أحد الملفات
            await Promise.allSettled(
                STATIC_ASSETS.map((assetUrl) =>
                    cache.add(assetUrl).catch((err) => {
                        console.warn(`[Service Worker] تعذر تخزين الأصل (${assetUrl})، تم تجاوزه بأمان:`, err);
                    })
                )
            );
        })
    );
});

// حدث التفعيل: تنظيف مخلفات الإصدارات السابقة وتأمين تحرير الذاكرة
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log(`[Service Worker V5.6] حذف الكاش القديم: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // السيطرة الفورية على كل التبويبات المفتوحة
    );
});

// ============================================================================
// [3] محرك اعتراض وتوجيه الطلبات (Fetch Interceptor & Security Firewall)
// ============================================================================
self.addEventListener('fetch', (event) => {
    // تجاهل الطلبات غير الـ GET وتجاهل بروتوكولات الإضافات مثل chrome-extension://
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

    const requestUrl = new URL(event.request.url);

    // 🛡️ الجدار الناري الصارم (Zero-Trust Security Filter):
    // تجاوز الكاش تماماً لمسارات الـ API الحساسة، وقاعدة بيانات Supabase، وتحليلات الشبكة،
    // وأي طلب يحتوي على معاملات أمان حساسة (Tokens / PINs) لعدم تسريبها في الذاكرة التخزينية.
    if (
        requestUrl.pathname.startsWith('/api/') ||
        requestUrl.hostname.includes('supabase.co') ||
        requestUrl.hostname.includes('cloudflareinsights.com') ||
        requestUrl.hostname.includes('googleapis.com') ||
        requestUrl.hostname.includes('fbcdn.net') ||
        requestUrl.searchParams.has('token') ||
        requestUrl.searchParams.has('pin') ||
        requestUrl.searchParams.has('auth')
    ) {
        return; // ترك الطلب يمر مباشرة إلى الشبكة دون أي تدخل أو تخزين مؤقت
    }

    // تحديد نوع الطلب بأمان (صفحة تنقل HTML أم أصل ساكن)
    const acceptHeader = event.request.headers.get('accept') || '';
    const isHtml = event.request.mode === 'navigate' || acceptHeader.includes('text/html');

    if (isHtml) {
        // 🧠 استراتيجية الصفحات (Network-First مع التراجع للكاش المحلي)
        // نحاول جلب أحدث نسخة من السيرفر، وإن تعذر الاتصال يتم تقديم النسخة المحلية المخزنة
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
                    console.warn(`[Service Worker] أنت في وضع Offline. جلب الصفحة (${requestUrl.pathname}) من الكاش المحلي.`);
                    return caches.match(event.request, { ignoreSearch: true }).then((cachedRes) => {
                        if (cachedRes) return cachedRes;
                        // إن لم تكن الصفحة مخزنة، يتم التراجع إلى لوحة التحكم أو الصفحة الرئيسية
                        return caches.match('./app.html', { ignoreSearch: true }).then((appRes) => {
                            return appRes || caches.match('./index.html', { ignoreSearch: true });
                        });
                    });
                })
        );
    } else {
        // 🧠 استراتيجية الأصول الساكنة (Stale-While-Revalidate)
        // الاستجابة الفورية من الكاش لتجربة فائقة السرعة، ثم تحديث النسخة في الخلفية
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
                const networkFetchPromise = fetch(event.request)
                    .then((networkResponse) => {
                        // فلترة الاستجابات غير الصالحة لحماية الكاش ومنع مشاكل التوجيه
                        if (
                            !networkResponse ||
                            networkResponse.status !== 200 ||
                            networkResponse.type !== 'basic' ||
                            networkResponse.redirected
                        ) {
                            return networkResponse;
                        }
                        // استنساخ متزامن فوري قبل قراءة جسم الاستجابة
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                        return networkResponse;
                    })
                    .catch(() => {
                        // معالجة انقطاع الاتصال الجذري دون التسبب في TypeError
                        if (cachedResponse) return cachedResponse;

                        // إذا كان الطلب لصورة مفقودة، يتم إرجاع SVG خفيف يوضح حالة عدم الاتصال
                        if (event.request.destination === 'image') {
                            const fallbackSvg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
                                <rect width="200" height="200" fill="#0B132B"/>
                                <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="14" fill="#D4AF37">موكّل - دون اتصال</text>
                            </svg>`;
                            return new Response(fallbackSvg, {
                                headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }
                            });
                        }

                        // إرجاع استجابة 503 آمنة للملفات الأخرى لتفادي تعليق المتصفح
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
// [4] نظام إشعارات الويب الفورية (Web Push Notifications)
// ============================================================================

/**
 * التحقق الأمني من مسار التوجيه عند النقر على الإشعار لضمان انتمائه لنفس النطاق (Same-Origin)
 * ومنع ثغرات إعادة التوجيه الخبيثة (Open Redirect Protection)
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
        console.warn(`[Service Worker] تم حظر توجيه خارجي مشبوه من الإشعار: ${rawUrl}`);
    } catch (e) {
        console.warn(`[Service Worker] مسار إشعار غير صالح: ${rawUrl}`);
    }
    return safeFallback;
}

// استلام ومعالجة إشعار الدفع المشفر من الخادم (Push Event)
self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        const payload = event.data.json();
        const safeActionUrl = resolveSafeNotificationUrl(payload.action_url || payload.url, './app.html');
        const options = {
            body: payload.message || payload.body || 'يوجد تنبيه جديد في نظام موكّل.',
            icon: payload.icon || DEFAULT_ICON_URL,
            badge: payload.badge || DEFAULT_ICON_URL,
            dir: 'rtl',
            lang: 'ar',
            vibrate: [200, 100, 200, 100, 200],
            requireInteraction: true,
            data: { url: safeActionUrl }
        };
        event.waitUntil(self.registration.showNotification(payload.title || 'موكّل ERP', options));
    } catch (e) {
        // في حال كان المحتوى نصاً غير مشفر كـ JSON
        event.waitUntil(
            self.registration.showNotification('موكّل ERP', {
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

// التعامل الآمن مع حدث النقر على الإشعار (Notification Click)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const rawTargetUrl = event.notification.data?.url || './app.html';
    const targetUrl = resolveSafeNotificationUrl(rawTargetUrl, './app.html');

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // إذا كان التطبيق مفتوحاً في نافذة سابقة، تنشيطه وتوجيهه للمسار المطلوب
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                    if ('navigate' in client) {
                        return client.navigate(targetUrl).then(() => client.focus()).catch(() => client.focus());
                    }
                    return client.focus();
                }
            }
            // فتح نافذة جديدة إذا لم تكن هناك نافذة مفتوحة
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        })
    );
});

// ============================================================================
// [5] المزامنة في الخلفية (Background Sync API)
// ============================================================================
// إشعار التطبيق تلقائياً فور عودة الاتصال لمعالجة طابور العمليات غير المتزامنة (Offline Queue)
self.addEventListener('sync', (event) => {
    if (event.tag === 'moakkil-offline-sync') {
        console.log('[Service Worker] رصد عودة الاتصال بالإنترنت - إطلاق المزامنة الخلفية...');
        event.waitUntil(
            self.clients.matchAll({ includeUncontrolled: true }).then((clientsList) => {
                clientsList.forEach((client) => client.postMessage({ type: 'START_OFFLINE_SYNC' }));
            })
        );
    }
});
