// sw.js - Service Worker (المحدث لضمان تحميل النسخة الجديدة ودعم كافة الأدوات والذكاء الاصطناعي)

const CACHE_NAME = 'moakkil-v14-ultimate'; // تم تحديث رقم الإصدار لضمان تحديث الكاش لدى المستخدمين
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './app.html',
  './client.html',
  './case-details.html',
  './client-details.html',
  './ai-chat.html',
  './calculators.html',
  './library.html',
  './reports.html',
  './verify.html',
  './css/style.css',
  './js/config.js',
  './js/api.js',
  './js/auth.js',
  './js/app.js',
  './js/case-details.js',
  './js/client-details.js',
  './js/reports.js',
  './js/library.js',
  './js/loan.js',
  './js/compound.js',
  './js/breakeven.js',
  './js/discount.js',
  './js/share.js',
  './js/inheritance.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// 1. تثبيت الـ Service Worker وتخزين الملفات في الكاش
self.addEventListener('install', (event) => {
  self.skipWaiting(); // تفعيل النسخة الجديدة فوراً بمجرد تحميلها
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache: ' + CACHE_NAME);
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. تنظيف الكاش القديم عند التحديث (Activation Phase)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Deleting old cache version:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. استراتيجية جلب الملفات (Network First then Cache)
// تضمن هذه الاستراتيجية تحميل أحدث نسخة من السيرفر، وفي حال انقطاع الإنترنت يتم استخدام الكاش
self.addEventListener('fetch', (event) => {
  // استثناء طلبات الـ API تماماً من الكاش لضمان جلب البيانات الحية من السيرفر دائماً
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// 4. معالجة إشعارات الـ Push في الخلفية (Push Notifications)
self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body || data.message || 'لديك إشعار جديد في نظام موكّل',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        vibrate: [200, 100, 200, 100, 200, 100, 200],
        data: {
          url: data.url || './app.html'
        },
        requireInteraction: true
      };

      event.waitUntil(
        self.registration.showNotification(data.title || 'نظام موكّل', options)
      );
    } catch (e) {
      // في حال كان الإشعار نصاً بسيطاً
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

// 5. التحكم في التفاعل عند النقر على الإشعار
self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // إغلاق الإشعار فور النقر عليه
  
  const targetUrl = event.notification.data ? event.notification.data.url : './app.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // البحث عن أي نافذة مفتوحة للتطبيق لنقل المستخدم إليها
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // إذا لم يكن التطبيق مفتوحاً، افتحه في نافذة جديدة
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});