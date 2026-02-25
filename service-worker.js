const CACHE_NAME = 'moakkil-v2.0.0';
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

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Cache opened - v2.0.0');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate Service Worker & Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch & Cache Strategy (Network First, falling back to cache)
self.addEventListener('fetch', event => {
  // لا تقم بتخزين طلبات الـ API في الكاش لضمان جلب البيانات الحية دائماً
  if (event.request.url.includes('/api/') || event.request.url.includes('workers.dev')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // إذا كان الرد صالحاً، احفظ نسخة جديدة في الكاش
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
        // في حال انقطاع الإنترنت، جلب النسخة المخزنة
        return caches.match(event.request);
      })
  );
});

// Push Notifications
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'لديك تحديث جديد في النظام',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'moakkil-update',
    data: data.data || {},
    actions: [
      {
        action: 'open',
        title: 'فتح التطبيق',
        icon: '/icons/icon-96.png'
      },
      {
        action: 'close',
        title: 'إغلاق'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'موكّل', options)
  );
});

// Notification Click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action !== 'close') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        // إذا كان التطبيق مفتوحاً، قم بالتركيز عليه
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // إذا لم يكن مفتوحاً، افتح نافذة جديدة
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url || '/dashboard.html');
        }
      })
    );
  }
});