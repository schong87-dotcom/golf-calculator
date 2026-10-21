// 오프라인에서도 타이머 화면을 불러오도록 앱 파일을 보관한다.
const cachePrefix = 'pomodoro-dial-';
const cacheName = `${cachePrefix}v8`;
const appFiles = [
  './', './index.html', './styles.css', './task-log.js', './app.js', './manifest.webmanifest', './assets/icon.svg',
  './assets/sounds/singing-bowl.mp3', './assets/sounds/tibetan-bell.mp3', './assets/sounds/tubular-bell.mp3',
  './assets/sounds/wind-chime.mp3', './assets/sounds/koshi-chime.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(appFiles)));
  self.skipWaiting();
});

// 앱 모음의 다른 앱과 같은 사이트를 쓰므로 뽀모도로의 옛 캐시만 지운다.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

// 구글 로그인, 구글 태스크와 노션 요청은 서비스 워커를 거치지 않고 바로 나간다.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
