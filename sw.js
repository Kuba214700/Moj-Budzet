// Service Worker dla aplikacji budżetowej - cache offline
const CACHE_NAME = 'budzet-v2'; // Zwiększ wersję przy każdej aktualizacji
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json'
];

// Instalacja - cache'owanie zasobów
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache otwarty:', CACHE_NAME);
        return cache.addAll(urlsToCache.map(url => {
          try {
            return new Request(url, { mode: 'no-cors' });
          } catch (e) {
            return url;
          }
        }));
      })
      .catch(err => {
        console.log('Błąd cache:', err);
        // Cache'uj tylko podstawowe pliki lokalne
        return caches.open(CACHE_NAME).then(cache => {
          return cache.addAll(['./index.html', './app.js', './styles.css', './manifest.json']);
        });
      })
  );
  // Wymuś aktywację nowego Service Workera
  self.skipWaiting();
});

// Fetch - serwuj z cache jeśli offline
self.addEventListener('fetch', (event) => {
  // Pomiń nie-GET requesty
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Zwróć z cache jeśli dostępne
        if (response) {
          return response;
        }
        
        // Pobierz z sieci
        return fetch(event.request).then((response) => {
          // Sprawdź czy odpowiedź jest poprawna
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          
          // Cache'uj tylko lokalne pliki i Chart.js
          const url = new URL(event.request.url);
          const isLocal = url.origin === location.origin;
          const isChartJS = url.href.includes('cdn.jsdelivr.net/npm/chart.js');
          
          if (isLocal || isChartJS) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          
          return response;
        }).catch(() => {
          // Jeśli offline i nie ma w cache
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
          // Dla Chart.js - zwróć pustą odpowiedź jeśli offline
          return new Response('', { status: 408, statusText: 'Offline' });
        });
      })
  );
});

// Aktywacja - usuń stare cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all([
        // Usuń stare cache
        ...cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Usuwam stary cache:', cacheName);
            return caches.delete(cacheName);
          }
        }),
        // Przejmij kontrolę nad wszystkimi klientami (oknami)
        self.clients.claim()
      ]);
    })
  );
});

