/*
 * Cache da Sacolinha (PWA).
 *
 * Não existe checagem de atualização nem download de APK aqui. Os arquivos do
 * app são guardados no Cache Storage só pra ele abrir sem internet; quando há
 * internet, a versão da rede vem primeiro, então o app já abre atualizado
 * sozinho, sem pop-up e sem botão de atualizar.
 */
const CACHE_NAME = 'sacolinha-cache-v10';

const APP_ASSETS = [
  './',
  './index.html',
  './manifest.json',
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

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(APP_ASSETS); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { return self.skipWaiting(); })
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
  if (data.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  /* Fontes e bibliotecas de fora: cache primeiro, porque não mudam. */
  if (STATIC_HOSTS.includes(url.hostname)) {
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

  if (url.origin !== self.location.origin) return;

  /*
   * Arquivos do próprio app: rede primeiro, cache como reserva. Com internet
   * a pessoa sempre pega a versão mais nova; sem internet, abre a que já
   * estava salva.
   */
  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, copy);
          });
        }
        return response;
      })
      .catch(function () {
        return caches.match(event.request).then(function (cached) {
          if (cached) return cached;
          if (event.request.mode === 'navigate') return caches.match('./index.html');
          return Promise.reject(new Error('offline'));
        });
      })
  );
});
