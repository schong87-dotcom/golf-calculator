// 오프라인에서도 타이머 화면을 불러오도록 앱 파일을 보관하고, 타이머가 끝났다는 푸시를 받으면 휴대폰 알림을 띄운다.
const cachePrefix = 'pomodoro-dial-';
const cacheName = `${cachePrefix}v9`;
const appFiles = [
  './', './index.html', './styles.css', './task-log.js', './push-alarm.js', './app.js', './manifest.webmanifest',
  './assets/icon.svg', './assets/icon-192.png',
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

// 소리로 울릴지 진동으로 울릴지는 휴대폰이 정한다(소리 모드면 소리, 진동 모드면 진동). 앱 화면이 떠 있어도 띄운다.
self.addEventListener('push', (event) => {
  let alarm = {};
  try {
    alarm = event.data?.json() || {};
  } catch { /* 글자만 온 푸시도 기본 문구로 띄운다. */ }
  event.waitUntil(self.registration.showNotification(alarm.title || '뽀모도로 타이머', {
    body: alarm.body || '시간이 끝났습니다.',
    tag: 'pomodoro-alarm',
    renotify: true,
    requireInteraction: true,
    vibrate: [500, 250, 500, 250, 500],
    icon: './assets/icon-192.png',
    badge: './assets/icon-192.png',
    timestamp: Number(alarm.fireAt) || Date.now(),
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const scope = new URL(self.registration.scope).pathname;
    const open = windows.find((client) => new URL(client.url).pathname.startsWith(scope));
    return open ? open.focus() : self.clients.openWindow(self.registration.scope);
  }));
});
