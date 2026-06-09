const SHELL_CACHE = 'travel-shell-v62';
const ASSET_CACHE = 'travel-assets-v62';

const SHELL_URLS = [
    './index.html',
    './styles.css',
    './app.js',
    './js/share-print.js',
    './js/reminders.js',
    './js/weather-locations.js',
    './js/demo-data.js',
    './js/onboarding.js',
    './js/ui-ux.js',
    './manifest.webmanifest',
    './vendor/tailwind.css',
    './vendor/fonts/noto-sans-tc.css',
    './vendor/fonts/NotoSansTC-400.ttf',
    './vendor/fonts/NotoSansTC-700.ttf',
    './vendor/fonts/NotoSansTC-900.ttf',
    './vendor/fontawesome/all.min.css',
    './vendor/fontawesome/webfonts/fa-solid-900.woff2',
    './vendor/fontawesome/webfonts/fa-brands-400.woff2',
    './vendor/fontawesome/webfonts/fa-regular-400.woff2',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
];

function isApiRequest(url) {
    return (
        url.hostname.includes('open-meteo.com') ||
        url.hostname.includes('unsplash.com') ||
        url.hostname.includes('frankfurter.dev') ||
        url.hostname.includes('frankfurter.app') ||
        url.hostname.includes('open.er-api.com')
    );
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) =>
            cache.addAll(SHELL_URLS).catch(() => Promise.all(SHELL_URLS.map((u) => cache.add(u).catch(() => {})))),
        ),
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))),
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
        event.respondWith(
            fetch(request)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(SHELL_CACHE).then((cache) => cache.put('./index.html', copy));
                    return res;
                })
                .catch(() => caches.match('./index.html')),
        );
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(request).then(
                (cached) =>
                    cached ||
                    fetch(request).then((res) => {
                        if (res.ok) {
                            const copy = res.clone();
                            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
                        }
                        return res;
                    }),
            ),
        );
    }
});
