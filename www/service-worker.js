/*
 * Atualização interna da Sacolinha.
 *
 * Este service worker nunca baixa APK. Ele mantém os arquivos web do PWA
 * no Cache Storage e troca os arquivos antigos pelos novos quando recebe
 * FORCE_UPDATE do update-checker.js.
 */
const CACHE_NAME = 'sacolinha-cache-v9';

const APP_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './version.txt',
  './update-checker.js',
  './service-worker.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

const STATIC_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com',
  'cdnjs.cloudflare.com'
];

function assetUrl(path) {
  return new URL(path, self.registration.scope).href;
}

async function refreshAppCache() {
  const cache = await caches.open(CACHE_NAME);

  await Promise.all(APP_ASSETS.map(async function (path) {
    const originalUrl = assetUrl(path);
    const separator = originalUrl.indexOf('?') >= 0 ? '&' : '?';
    const freshUrl = originalUrl + separator + 'sw-update=' + Date.now();
    const response = await fetch(freshUrl, {
      cache: 'no-store',
      credentials: 'same-origin'
    });

    if (!response.ok) {
      throw new Error('Não foi possível atualizar ' + path);
    }

    await cache.put(originalUrl, response.clone());
  }));
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(APP_ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    Promise.all([
      caches.keys().then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
        );
      }),
      self.clients.claim()
    ])
  );
});

self.addEventListener('message', function (event) {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (data.type !== 'FORCE_UPDATE') return;

  event.waitUntil(
    refreshAppCache()
      .then(function () {
        return self.skipWaiting().then(function () {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ ok: true });
          }
        });
      })
      .catch(function (error) {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({
            ok: false,
            error: error && error.message ? error.message : 'falha'
          });
        }
        throw error;
      })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isVersionFile = url.pathname.endsWith('/version.txt');
  const isStaticVendor = STATIC_HOSTS.includes(url.hostname);

  /*
   * A versão publicada precisa ser consultada sem ficar presa no cache.
   * Se estiver sem internet, o arquivo já salvo permite que o app continue
   * abrindo normalmente.
   */
  if (isVersionFile) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(function () { return caches.match(event.request); })
    );
    return;
  }

  if (isStaticVendor) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        if (cached) return cached;
        return fetch(event.request).then(function (response) {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, response.clone());
            });
          }
          return response;
        });
      })
    );
    return;
  }

  /*
   * App shell: cache-first para funcionar sem internet. A atualização
   * explícita feita pelo update-checker grava os arquivos novos neste mesmo
   * cache e a próxima navegação já usa a versão nova.
   */
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, response.clone());
          });
        }
        return response;
      }).catch(function () { return cached; });
    })
  );
});
