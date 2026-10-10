const CACHE = 'lottolens-v2';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'archive-lookup.js', 'config.js',
  'methodology.html', 'privacy.html', 'responsible-play.html', 'about.html',
  'data/results.json', 'data/history.json', 'data/coverage.json'];
const ASSET_URLS = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(ASSETS))
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('lottolens-') && key !== CACHE).map(key => caches.delete(key))
  ))
));
self.addEventListener('fetch', event => {
  // Date lookups are temporary: never cache API responses or third-party requests.
  if (event.request.method !== 'GET' || !ASSET_URLS.has(event.request.url)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || new Response('Offline', {status: 503})));
});
