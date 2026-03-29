// sw.js - Service Worker (معزز بدعم إشعارات الخلفية Push Notifications والكاش)

const CACHE_NAME = 'moakkil-v13-ultimate';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './app.html',
  './client.html',
  './case-details.html',
  './client-details.html',
  './verify.html',
  './css/style.css',
  './js/config.js',
  './js/api.js',
  './js/app.js',
  './js/case-details.js',
  './js/client-details.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// 1. تثبيت الـ Service Worker وتخزين الملفات في الكاش
self.addEventListener('install', (event) => {
  self.skipWaiting(); // تفعيل النسخة الجديدة فوراً
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. تنظيف الكاش القديم عند التحديث
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. جلب الملفات (Network First then Cache) لضمان أحدث نسخة من البيانات
self.addEventListener('fetch', (event) => {
  // استثناء طلبات الـ API (تتصل بالسيرفر مباشرة)
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// 4. الاستماع لإشعارات الـ Push في الخلفية (حتى لو كان التطبيق مغلقاً)
self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body || data.message || 'لديك إشعار جديد في نظام موكّل',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        vibrate: [200, 100, 200, 100, 200, 100, 200], // اهتزاز مميز
        data: {
          url: data.url || './app.html'
        },
        requireInteraction: true
      };

      event.waitUntil(
        self.registration.showNotification(data.title || 'نظام موكّل', options)
      );
    } catch (e) {
      // في حال كان الإشعار نصاً عادياً وليس JSON
      const options = {
        body: event.data.text(),
        icon: './icons/icon-192.png',
        vibrate: [200, 100, 200]
      };
      event.waitUntil(
        self.registration.showNotification('إشعار من موكّل', options)
      );
    }
  }
});

// 5. التفاعل عند الضغط على الإشعار من شاشة الهاتف
self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // إغلاق الإشعار بعد الضغط عليه
  
  const targetUrl = event.notification.data ? event.notification.data.url : './app.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // إذا كان التطبيق مفتوحاً، قم بالتركيز عليه (Focus)
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // إذا لم يكن مفتوحاً، افتح نافذة جديدة للتطبيق
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});