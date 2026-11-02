// 오프라인 지원: 앱 파일을 저장해 두고, 인터넷이 없어도 열리게 한다.
const CACHE = 'safety-edu-v1.0.0';
const CORE = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/codec.js', 'js/db.js', 'js/sig.js', 'js/qr.js', 'js/report.js', 'js/app.js', 'data/topics.json',
  'vendor/qrcode.js', 'vendor/jsQR.js', 'vendor/html2canvas.min.js', 'vendor/jspdf.umd.min.js', 'vendor/jszip.min.js'
];
const IMGS = Array.from({ length: 18 }, (_, i) => String(i + 1).padStart(2, '0'))
  .flatMap(n => [`img/t${n}_photo.jpg`, `img/t${n}_illust.jpg`]);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).then(() => c.addAll(IMGS).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 먼저 저장본을 보여주고, 뒤에서 최신 파일로 갱신한다.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
