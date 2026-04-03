// sw.js - Service Worker لمشروع موكّل الذكي (الكاش والإشعارات)

const CACHE_NAME = 'moakkil-cache-v4.0'; // تم التحديث لضمان جلب النسخ الجديدة من الملفات والصفحات المضافة
const urlsToCache = [
    './',
    './index.html',
    './login.html',
    './app.html',
    './client.html',
    './client-details.html',
    './staff.html',
    './register.html',
    './verify.html',
    './library.html',
    './calculators.html',
    './reports.html',
    './ai-chat.html',
    './css/style.css',
    './js/config.js',
    './js/api.js',
    './js/auth.js',
    './js/app.js',
    './js/client.js',
    './js/client-details.js',
    './js/staff.js',
    './js/register.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css',
    'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap'
];

// 1. تنصيب الـ Service Worker وحفظ الملفات في الكاش
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache and cached essential files');
                return cache.addAll(urlsToCache);
            })
    );
});

// 2. تنشيط وحذف الكاش القديم (لضمان حصول المستخدمين على التحديثات الجديدة تلقائياً)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 3. استراتيجية جلب البيانات (الشبكة أولاً للـ API، والكاش كخيار احتياطي للصفحات)
self.addEventListener('fetch', event => {
    // تجاوز طلبات الـ API وقواعد البيانات لتذهب للشبكة دائماً ولا تحفظ في الكاش (لضمان البيانات اللحظية)
    if (event.request.url.includes('/api/') || event.request.url.includes('supabase') || event.request.url.includes('googleusercontent')) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        fetch(event.request).catch(() => {
            // في حال انقطاع الإنترنت، يعتمد على الكاش لعرض الواجهات بسلاسة
            return caches.match(event.request);
        })
    );
});

// 4. التعامل مع استقبال الإشعارات (Push Notifications) والتطبيق مغلق
self.addEventListener('push', event => {
    let data = { title: 'إشعار من موكّل', body: 'لديك تنبيه جديد في النظام.', url: './app.html' };
    
    if (event.data) {
        try {
            const parsed = event.data.json();
            data.title = parsed.title || data.title;
            data.body = parsed.body || parsed.message || data.message || data.body;
            data.url = parsed.url || data.url;
        } catch(e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        vibrate: [200, 100, 200, 100, 200, 100, 200], // اهتزاز قوي ومميز للتنبيهات القانونية والمواعيد
        data: {
            url: data.url
        },
        requireInteraction: true // يبقى الإشعار ظاهراً في الهاتف حتى يتفاعل معه المستخدم أو يمسحه
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// 5. عند النقر على الإشعار من شاشة الهاتف
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // التحقق مما إذا كان التطبيق مفتوحاً بالفعل في الخلفية لعمل فوكس عليه (بدلاً من فتح نسخة جديدة)
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes('app.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // إذا لم يكن مفتوحاً، افتح التطبيق من جديد
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url);
            }
        })
    );
});