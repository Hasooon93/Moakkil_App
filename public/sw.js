/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: public/sw.js (Service Worker - Enterprise Offline & Sync Edition V5.4)
 * مطابق 100% لـ sw.js الأصلي مع دعم مسارات SPA والمسارات التقليدية
 * ============================================================================
 */

const CACHE_NAME = 'moakkil-cache-v5.4-enterprise';
const DEFAULT_ICON_URL = 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEg4PE-keniz_4Af49kFkt6o_JmNj4K1yDZpdoDpXtzZcw6Zylh6l3MKyG186d2NmFov_1xIZ8qhXY136PeE5OpQlWQgR45YFvKo9MdMlL6K0rE-IqIyiMINdIrAynb44a2V_177s_xcULbLfMWgLuXJP4-uQ8zx3V-Cl3HNwXucegTli7-sDlUnAIGS__M/s320/icon-512.png.png';

const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            await Promise.allSettled(
                STATIC_ASSETS.map((assetUrl) =>
                    cache.add(assetUrl).catch((err) => {
                        console.warn(`[Service Worker] تعذر تخزين الملف (${assetUrl})، تم تجاوزه:`, err);
                    })
                )
            );
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;
    const requestUrl = new URL(event.request.url);

    if (
        requestUrl.pathname.startsWith('/api/') ||
        requestUrl.hostname.includes('workers.dev') ||
        requestUrl.hostname.includes('cloudflareinsights.com') ||
        requestUrl.hostname.includes('googleapis.com') ||
        requestUrl.hostname.includes('fbcdn.net')
    ) {
        return;
    }

    const acceptHeader = event.request.headers.get('accept') || '';
    const isHtml = event.request.mode === 'navigate' || acceptHeader.includes('text/html');

    if (isHtml) {
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
                    return caches.match(event.request, { ignoreSearch: true }).then((cachedRes) => {
                        if (cachedRes) return cachedRes;
                        return caches.match('./index.html', { ignoreSearch: true });
                    });
                })
        );
    } else {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
                const networkFetchPromise = fetch(event.request)
                    .then((networkResponse) => {
                        if (
                            !networkResponse ||
                            networkResponse.status !== 200 ||
                            networkResponse.type !== 'basic' ||
                            networkResponse.redirected
                        ) {
                            return networkResponse;
                        }
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                        return networkResponse;
                    })
                    .catch(() => {
                        if (cachedResponse) return cachedResponse;
                        if (event.request.destination === 'image') {
                            const fallbackSvg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
                                <rect width="200" height="200" fill="#e2e8f0"/>
                                <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="16" fill="#94a3b8">أنت Offline</text>
                            </svg>`;
                            return new Response(fallbackSvg, {
                                headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }
                            });
                        }
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
    } catch (e) {}
    return safeFallback;
}

self.addEventListener('push', (event) => {
    if (!event.data) return;
    try {
        const payload = event.data.json();
        const safeActionUrl = resolveSafeNotificationUrl(payload.action_url || payload.url, './app.html');
        const options = {
            body: payload.message || payload.body || 'يوجد تحديث جديد في النظام.',
            icon: payload.icon || DEFAULT_ICON_URL,
            badge: payload.badge || DEFAULT_ICON_URL,
            dir: 'rtl',
            lang: 'ar',
            vibrate: [200, 100, 200, 100, 200],
            requireInteraction: true,
            data: { url: safeActionUrl }
        };
        event.waitUntil(self.registration.showNotification(payload.title || 'تنبيه من موكّل', options));
    } catch (e) {
        event.waitUntil(
            self.registration.showNotification('تنبيه من موكّل', {
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

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const rawTargetUrl = event.notification.data?.url || './app.html';
    const targetUrl = resolveSafeNotificationUrl(rawTargetUrl, './app.html');

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                    if ('navigate' in client) {
                        return client.navigate(targetUrl).then(() => client.focus()).catch(() => client.focus());
                    }
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        })
    );
});

self.addEventListener('sync', (event) => {
    if (event.tag === 'moakkil-offline-sync') {
        event.waitUntil(
            self.clients.matchAll({ includeUncontrolled: true }).then((clientsList) => {
                clientsList.forEach((client) => client.postMessage({ type: 'START_OFFLINE_SYNC' }));
            })
        );
    }
});
