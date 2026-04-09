// moakkil-sw.js (Service Worker)
// الدستور المطبق: PWA، Offline Mode، Web Push Notifications

const CACHE_NAME = 'moakkil-cache-v1.0';

// الملفات الأساسية التي سيتم تخزينها للعمل دون إنترنت
const URLS_TO_CACHE = [
    '/',
    '/login.html',
    '/app.html',
    '/assets/css/style.css',
    '/assets/js/api.js',
    '/assets/js/auth.js',
    '/assets/js/app.js',
    // مكتبة الأيقونات والخطوط لضمان عملها أوفلاين
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap'
];

// ==========================================
// 1. التثبيت والتخزين المؤقت (Install)
// ==========================================
self.addEventListener('install', (event) => {
    // فرض تفعيل الـ Service Worker الجديد فوراً
    self.skipWaiting();
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('تم فتح الكاش وجاري تخزين الملفات الأساسية');
                return cache.addAll(URLS_TO_CACHE);
            })
    );
});

// ==========================================
// 2. التفعيل وتنظيف الكاش القديم (Activate)
// ==========================================
self.addEventListener('activate', (event) => {
    // السيطرة على كل الصفحات المفتوحة فوراً
    event.waitUntil(self.clients.claim());

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('جاري حذف الكاش القديم:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// ==========================================
// 3. اعتراض الطلبات (Fetch / Offline Mode)
// ==========================================
self.addEventListener('fetch', (event) => {
    // نتجاهل طلبات الـ API (يجب أن تذهب للخادم دائماً أو تفشل إذا لم يوجد إنترنت)
    if (event.request.url.includes('/api/')) {
        return; 
    }

    // استراتيجية (Network First, falling back to cache) لملفات الـ HTML
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request).then((response) => {
                if (response) {
                    return response;
                }
                // إذا لم يجد الملف في الكاش، يمكن توجيهه لصفحة "لا يوجد اتصال"
                // return caches.match('/offline.html'); 
            });
        })
    );
});

// ==========================================
// 4. استلام الإشعارات الفورية (Push Notifications)
// ==========================================
self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        // البيانات القادمة من الـ Cloudflare Worker
        const payload = event.data.json();
        
        const title = payload.title || 'إشعار من نظام موكّل';
        const options = {
            body: payload.body || payload.message,
            icon: '/assets/img/icon-192x192.png', // مسار أيقونة التطبيق (تأكد من إضافتها لاحقاً)
            badge: '/assets/img/badge-72x72.png', // أيقونة صغيرة تظهر في شريط الإشعارات
            vibrate: [200, 100, 200],
            data: {
                url: payload.url || payload.action_url || '/app.html' // الرابط الذي سيفتح عند النقر
            },
            requireInteraction: true // إبقاء الإشعار ظاهراً حتى يغلقه المستخدم
        };

        event.waitUntil(
            self.registration.showNotification(title, options)
        );
    } catch (e) {
        // في حال كانت الداتا نص عادي وليس JSON
        event.waitUntil(
            self.registration.showNotification('نظام موكّل', {
                body: event.data.text(),
                icon: '/assets/img/icon-192x192.png'
            })
        );
    }
});

// ==========================================
// 5. التفاعل مع النقر على الإشعار (Notification Click)
// ==========================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // إغلاق الإشعار

    const urlToOpen = event.notification.data.url;

    // البحث عما إذا كان التطبيق مفتوحاً في إحدى النوافذ (Tabs)
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // إذا كان التطبيق مفتوحاً، نركز عليه ونوجهه للرابط
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    if (urlToOpen && urlToOpen !== '/app.html') {
                        client.navigate(urlToOpen);
                    }
                    return;
                }
            }
            // إذا كان التطبيق مغلقاً بالكامل، نفتح نافذة جديدة
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});