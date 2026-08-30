const CACHE_NAME = 'sacolinha-cache-v7';

// Arquivos do próprio app: quase nunca mudam de conteúdo sem trocar de
// versão (o update-checker.js avisa quando sai uma versão nova), então
// cache-first é seguro e economiza internet.
const APP_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

// Domínios de recursos estáticos externos (fontes, SDK do Firebase) que
// também são cache-first: o conteúdo desses arquivos não muda para uma
// mesma URL, então baixar de novo a cada vez que o app abre é dinheiro
// jogado fora.
const STATIC_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // version.txt precisa ser sempre buscado da rede (é assim que o app
  // detecta atualização), então deixamos passar direto sem cache.
  if (url.pathname.endsWith('/version.txt')) return;

  const isStaticVendor = STATIC_HOSTS.includes(url.hostname);

  if (isStaticVendor) {
    // Fontes e SDK do Firebase: cache-first. Se já temos, usa do cache e
    // não gasta internet nenhuma; só busca na rede se nunca baixamos.
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Arquivos do próprio app: cache-first também. Uma atualização nova só
  // chega quando o usuário instala uma versão nova do app (o
  // update-checker cuida de avisar), então não precisamos "revalidar" a
  // cada abertura gastando internet à toa.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => cached);
    })
  );
});
