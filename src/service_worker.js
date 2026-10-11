// Service worker: keeps the whole game on the device, so it starts from the
// home screen without a network, like Chrome's dino. The build (see
// serviceWorker() in vite.config.ts) fills in the file list and version.

const VERSION = __VERSION__;
const FILES = __FILES__;
const CACHE = `chrome-dino-${VERSION}`;
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', event => {
  event.waitUntil(
      caches.open(CACHE).then(cache => cache.addAll(['./', ...FILES])));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Drop the files of older builds.
  event.waitUntil(
      caches.keys()
          .then(keys => Promise.all(
              keys.filter(key => key.startsWith('chrome-dino-') && key !== CACHE)
                  .map(key => caches.delete(key))))
          .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET' ||
      new URL(request.url).origin !== self.location.origin) {
    return;
  }
  // Pages come from the network when it's there, so a new build shows up
  // right away; everything else has a hashed name and never changes.
  if (request.mode === 'navigate') {
    const cached = () => caches.match(request, {ignoreSearch: true, ignoreVary: true})
                             .then(response => response || caches.match('./'));
    // A bad connection shouldn't keep the game from starting.
    const timeout = new Promise(
        (_resolve, reject) => setTimeout(reject, NETWORK_TIMEOUT_MS));
    event.respondWith(
        Promise.race([fetch(request), timeout])
            .catch(() => cached().then(response => response || fetch(request))));
    return;
  }
  // Module scripts are requested with an Origin header the cached copies
  // didn't have, so Vary must not tell them apart.
  event.respondWith(
      caches.match(request, {ignoreVary: true})
          .then(response => response || fetch(request)));
});
