// service-worker.js - محرك الكاش والتثبيت لتطبيق موكّل (استراتيجية الشبكة أولاً)

const CACHE_NAME = 'moakkil-v3-cache-1';

// قائمة بالملفات الأساسية التي يجب تخزينها ليتمكن التطبيق من الإقلاع والعمل السريع
const urlsToCache = [
    './',
    './index.html',
    './login.html',
    './app.html',
    './ai-chat.html',
    './case-details.html',
    './client-details.html',
    './client.html',
    './reports.html',
    './css/style.css',
    './js/config.js',
    './js/api.js',
    './js/app.js',
    './js/auth.js',
    './js/case-details.js',
    './js/client-details.js',
    './manifest.json'
];

// حدث التثبيت (Install) - يتم فيه تخزين الملفات الأساسية
self.addEventListener('install', event => {
    self.skipWaiting(); // إجبار السيرفر ووركر الجديد على التثبيت فوراً
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('✅ تم فتح الكاش وتخزين الملفات الأساسية');
                return cache.addAll(urlsToCache);
            })
            .catch(err => console.error('خطأ في تخزين الكاش:', err))
    );
});

// حدث التفعيل (Activate) - يتم فيه تنظيف أي نسخ كاش قديمة
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('🧹 جاري حذف الكاش القديم:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim(); // السيطرة الفورية على كافة صفحات التطبيق المفتوحة
});

// حدث الجلب (Fetch) - استراتيجية الشبكة أولاً للتطبيقات الديناميكية
self.addEventListener('fetch', event => {
    // نتجاهل الطلبات التي ليست GET والطلبات التي لا تبدأ بـ http/https (مثل إضافات المتصفح)
    // كما نتجاهل طلبات الـ API بقاعدة البيانات لضمان عدم كيش البيانات الحساسة
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http') || event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // إذا كانت الاستجابة سليمة، نقوم بتحديث الكاش بالنسخة الجديدة
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // في حالة انقطاع الإنترنت، نحاول جلب الملف من الكاش
                return caches.match(event.request);
            })
    );
});