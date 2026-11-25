/* BEM Incoming Inspection System - service-worker.js
   Caches all app files so the app opens and works without internet.
   When you change any app file, increase CACHE_VERSION so phones download the new version. */
'use strict';

const CACHE_VERSION = 'bem-iqc-v1.0.0';
const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './db.js',
  './ui.js',
  './inspection.js',
  './ncr.js',
  './dashboard.js',
  './reports.js',
  './masters.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_FILES.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Cache first (works offline); anything not cached is fetched and stored for next time. */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('Offline and not cached', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
