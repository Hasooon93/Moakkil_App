const CACHE_NAME = 'moakkil-v2-cache-1';

// قائمة بالملفات الأساسية التي يجب تخزينها ليتمكن التطبيق من الإقلاع والعمل السريع
const urlsToCache = [
    './',
    './index.html',
    './login.html',
    './app.html',
    './ai-chat.html',
    './case-details.html',
    './client.html',
    './css/style.css',
    './js/config.js',
    './js/api.js',
    './js/app.js',
    './js/auth.js',
    './js/case-details.js',
    './manifest.json'
];

// حدث التثبيت (Install) - يتم فيه تخزين الملفات الأساسية
self.addEventListener('install', event => {
    self.skipWaiting();
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
    self.clients.claim();
});

// حدث الجلب (Fetch) - استراتيجية الشبكة أولاً (Network First) للتطبيقات الديناميكية
self.addEventListener('fetch', event => {
    // نتجاهل الطلبات التي ليست من نوع GET (مثل POST لرفع الملفات أو حفظ البيانات)
    if (event.request.method !== 'GET') return;

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