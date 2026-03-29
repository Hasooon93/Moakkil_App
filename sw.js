// sw.js - Service Worker لمشروع موكّل الذكي (الكاش والإشعارات)

const CACHE_NAME = 'moakkil-cache-v3.0'; // تم التحديث لضمان جلب النسخ الجديدة من الملفات
const urlsToCache = [
    './',
    './index.html',
    './login.html',
    './app.html',
    './client.html',
    './library.html',
    './calculators.html',
    './reports.html',
    './ai-chat.html',
    './css/style.css',
    './js/config.js',
    './js/api.js',
    './js/auth.js',
    './js/app.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css',
    'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap'
];

// تنصيب الـ Service Worker وحفظ الملفات في الكاش
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// تنشيط وحذف الكاش القديم
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

// استراتيجية جلب البيانات (الشبكة أولاً للـ API، والكاش كخيار احتياطي للصفحات)
self.addEventListener('fetch', event => {
    // تجاوز طلبات الـ API لتذهب للشبكة دائماً ولا تحفظ في الكاش (لضمان البيانات اللحظية)
    if (event.request.url.includes('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});

// التعامل مع استقبال الإشعارات (Push Notifications)
self.addEventListener('push', event => {
    let data = { title: 'إشعار من موكّل', body: 'لديك تنبيه جديد في النظام.' };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch(e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.message || data.body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        vibrate: [200, 100, 200, 100, 200, 100, 200], // اهتزاز قوي للتنبيهات القانونية
        data: {
            url: data.url || './app.html'
        },
        requireInteraction: true // يبقى الإشعار ظاهراً حتى يتفاعل معه المستخدم
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// عند النقر على الإشعار
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(windowClients => {
            // التحقق مما إذا كان التطبيق مفتوحاً بالفعل
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes('app.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // إذا لم يكن مفتوحاً، افتح نافذة جديدة
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url);
            }
        })
    );
});