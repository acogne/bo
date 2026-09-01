// Service worker minimal : cache le shell de l'app pour un usage hors-ligne
// basique. Les appels à l'API Google (Sheets/Calendar/OAuth) ne sont jamais
// mis en cache — ils doivent toujours passer par le réseau.

const CACHE_NAME = 'dashboard-foyer-v32';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './css/style.css',
  './font/MADE Tommy Soft Medium PERSONAL USE.otf',
  './font/MADE Tommy Soft Bold PERSONAL USE.otf',
  './font/MADE Tommy Soft ExtraBold PERSONAL USE.otf',
  './js/config.js',
  './js/auth.js',
  './js/sheets-api.js',
  './js/calendar-api.js',
  './js/date-utils.js',
  './js/task-reset.js',
  './js/confetti.js',
  './js/theme.js',
  './js/icons.js',
  './js/tab-registry.js',
  './js/app.js',
  './js/tabs/menage.js',
  './js/tabs/courses.js',
  './js/tabs/enfant.js',
  './js/tabs/chat.js',
  './js/tabs/todo-list.js',
  './js/tabs/jardin.js',
  './js/tabs/bricolage.js',
  './js/tabs/compteurs.js',
  './js/tabs/vehicule.js',
  './js/tabs/contacts.js',
  './js/tabs/budget.js',
  './js/tabs/admin.js',
  './js/tabs/stock.js',
  './js/tabs/repas.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ne jamais intercepter les appels vers les API Google.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Réseau d'abord : pendant que l'app évolue, servir une version en cache
  // périmée casserait des choses silencieusement. Le cache ne sert que de
  // filet de secours si le réseau est indisponible (usage hors-ligne).
  // cache: 'no-store' contourne aussi le cache HTTP normal du navigateur —
  // GitHub Pages sert ces fichiers avec Cache-Control: max-age=600, ce qui
  // sans ça pouvait resservir une version vieille de 10 min malgré ce
  // handler "network-first" (fetch() respecte le cache HTTP par défaut).
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
