// Service worker: la app se abre sin conexión; los datos siempre vienen de Supabase.
const VERSION = 'v1';
const CACHE = `suministros-${VERSION}`;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/calc.js', 'js/config.js', 'js/db.js', 'js/forms.js', 'js/ui.js', 'js/views.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Nunca interceptar Supabase ni peticiones que no sean GET
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Red primero (para recibir actualizaciones), caché como respaldo sin conexión
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html'))),
  );
});
