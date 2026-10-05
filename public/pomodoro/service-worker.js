// 오프라인에서도 타이머 화면을 불러오도록 앱 파일을 보관한다.
const cacheName = 'pomodoro-dial-v6';
const appFiles = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './assets/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(appFiles)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
