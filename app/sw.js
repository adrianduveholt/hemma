// Cachar appens filer så att den startar utan nät. Höj VERSION vid varje ändring.
const VERSION = 'hemma-v25';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'db.js', 'sync.js', 'config.js', 'catalog.js', 'recipes.js', 'recipe-view.js', 'shop-view.js', 'scan.js', 'ai-export.js', 'offers.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-180.png'];

self.addEventListener('install', e => {
  // cache: 'reload' – hämta förbi webbläsarens cache så att offlinekopian alltid är den nya versionen.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Nätet först så att uppdateringar syns direkt, cachen när nätet saknas.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Databasens anrop ska alltid gå direkt och aldrig sparas.
  if (url.hostname.endsWith('supabase.co')) return;
  // Egna filer: fråga alltid servern om de ändrats, annars kan webbläsarens cache
  // blanda gamla och nya filer efter en uppdatering.
  const req = url.origin !== location.origin ? e.request
    : e.request.mode === 'navigate' ? new Request(url.href, { cache: 'no-cache' })
    : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
