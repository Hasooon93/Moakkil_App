// تم تحديث رقم الإصدار لضمان جلب التعديلات الجديدة (النماذج، الفواتير، الصلاحيات)
const CACHE_NAME = 'moakkil-v4.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/client.html',
  '/reports.html',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName); // حذف النسخ القديمة
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // 1. تجاهل أي طلبات من إضافات المتصفح (Chrome Extensions)
  if (!event.request.url.startsWith('http')) {
      return;
  }
  
  // 2. تجاهل تخزين بيانات الـ API وسيرفر Google Drive لضمان جلب البيانات الحية دائماً
  if (event.request.url.includes('/api/') || event.request.url.includes('workers.dev') || event.request.url.includes('script.google.com')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // في حالة انقطاع الإنترنت، جلب النسخة المخزنة
        return caches.match(event.request);
      })
  );
});

// ===== PUSH NOTIFICATIONS (استقبال التنبيهات في الخلفية) =====
self.addEventListener('push', event => {
  let data = { title: 'موكّل', body: 'لديك إشعار جديد', url: '/dashboard.html' };
  
  if (event.data) {
    try {
        data = event.data.json();
    } catch(e) {
        data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png', // أيقونة صغيرة تظهر في شريط الإشعارات العلوي
    vibrate: [200, 100, 200], // نمط الاهتزاز
    data: {
        url: data.url || '/dashboard.html' // الرابط الذي سيفتح عند الضغط
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ===== NOTIFICATION CLICK (التعامل مع ضغطة المستخدم على الإشعار) =====
self.addEventListener('notificationclick', event => {
  event.notification.close(); // إغلاق الإشعار عند الضغط عليه
  const urlToOpen = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // إذا كان التطبيق مفتوحاً بالفعل في الخلفية، قم بجلبه للأمام
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes('dashboard.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // إذا كان التطبيق مغلقاً تماماً، افتح نافذة جديدة
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});