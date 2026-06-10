const SHELL_CACHE = 'travel-shell-v109';
const ASSET_CACHE = 'travel-assets-v109';

/** Critical path - small files only; must finish before SW takes over. */
const CORE_SHELL_URLS = [
    './index.html',
    './styles.css',
    './app.js',
    './js/share-print.js',
    './js/reminders.js',
    './js/weather-locations.js',
    './js/demo-data.js',
    './js/onboarding.js',
    './js/ui-ux.js',
    './js/trip-calendar.js',
    './manifest.webmanifest',
    './vendor/tailwind.css',
    './vendor/fontawesome/all.min.css',
    './vendor/fontawesome/webfonts/fa-solid-900.woff2',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
];

/** Large assets - cached in background after first paint. */
const DEFERRED_ASSET_URLS = [
    './vendor/fonts/noto-sans-tc.css',
    './vendor/fonts/NotoSansTC-400.ttf',
    './vendor/fonts/NotoSansTC-700.ttf',
    './vendor/fonts/NotoSansTC-900.ttf',
    './vendor/fontawesome/webfonts/fa-brands-400.woff2',
    './vendor/fontawesome/webfonts/fa-regular-400.woff2',
];

const OFFLINE_FALLBACK_HTML =
    '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>\u65c5\u884c\u7b46\u8a18</title></head>' +
    '<body style="font-family:system-ui;padding:2rem;text-align:center">' +
    '<p>\u76ee\u524d\u96e2\u7dda\uff0c\u8acb\u5148\u9023\u7dda\u958b\u555f\u4e00\u6b21\u5f8c\u518d\u4f7f\u7528\u3002</p></body></html>';

function scopeUrl(path) {
    return new URL(path, self.registration.scope).href;
}

function cacheAddSafe(cache, url) {
    return cache.add(url).catch(() => cache.add(scopeUrl(url)).catch(() => {}));
}

async function cacheUrlList(cacheName, urls) {
    const cache = await caches.open(cacheName);
    await Promise.all(urls.map((u) => cacheAddSafe(cache, u)));
}

function isApiRequest(url) {
    return (
        url.hostname.includes('open-meteo.com') ||
        url.hostname.includes('unsplash.com') ||
        url.hostname.includes('frankfurter.dev') ||
        url.hostname.includes('frankfurter.app') ||
        url.hostname.includes('open.er-api.com')
    );
}

async function matchShellDocument() {
    const cache = await caches.open(SHELL_CACHE);
    const candidates = [
        scopeUrl('index.html'),
        scopeUrl('./index.html'),
        './index.html',
        'index.html',
    ];
    for (const key of candidates) {
        const hit = (await cache.match(key)) || (await caches.match(key));
        if (hit) return hit;
    }
    const keys = await cache.keys();
    const doc = keys.find((req) => {
        try {
            const p = new URL(req.url).pathname;
            return p.endsWith('/index.html') || p.endsWith('/');
        } catch (_) {
            return false;
        }
    });
    return doc ? cache.match(doc) : undefined;
}

async function cacheNavigateResponse(request, response) {
    if (!response || !response.ok) return;
    const cache = await caches.open(SHELL_CACHE);
    const copy = response.clone();
    await cache.put(scopeUrl('index.html'), copy);
    try {
        await cache.put(request, response.clone());
    } catch (_) {
        /* ignore duplicate put */
    }
}

async function handleNavigate(request) {
    try {
        const res = await fetch(request);
        if (res.ok) await cacheNavigateResponse(request, res);
        return res;
    } catch (_) {
        const cached = (await caches.match(request)) || (await matchShellDocument());
        if (cached) return cached;
        return new Response(OFFLINE_FALLBACK_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        cacheUrlList(SHELL_CACHE, CORE_SHELL_URLS).then(() => {
            self.skipWaiting();
            cacheUrlList(ASSET_CACHE, DEFERRED_ASSET_URLS);
        }),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)),
            ),
        ),
    );
    self.clients.claim();
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (isApiRequest(url)) return;

    if (request.mode === 'navigate') {
        event.respondWith(handleNavigate(request));
        return;
    }

    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(request).then(
            (cached) =>
                cached ||
                fetch(request).then((res) => {
                    if (res.ok) {
                        const isHeavy =
                            url.pathname.includes('/fonts/') ||
                            url.pathname.includes('/webfonts/fa-brands') ||
                            url.pathname.includes('/webfonts/fa-regular');
                        const bucket = isHeavy ? ASSET_CACHE : SHELL_CACHE;
                        const copy = res.clone();
                        caches.open(bucket).then((cache) => cache.put(request, copy));
                    }
                    return res;
                }),
        ),
    );
});
