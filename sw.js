// 오프라인 지원: 앱 파일을 저장해 두고, 인터넷이 없어도 열리게 한다.
const CACHE = 'safety-edu-v1.22.1';
const CORE = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/app-192.png', 'icons/app-512.png',
  'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-180.png', 'icons/favicon-64.png', 'img/brand-logo.png', 'img/brand-mark.png',
  'js/codec.js', 'js/db.js', 'js/sig.js', 'js/qr.js', 'js/report.js', 'js/registry.js', 'js/lock.js', 'js/pages.js', 'js/kit.js', 'js/tbm.js', 'js/meas.js', 'js/law.js', 'js/sapa.js', 'js/sif.js', 'js/sync.js', 'js/rsig.js', 'js/app.js', 'data/topics.json',
  'vendor/qrcode.js', 'vendor/jsQR.js', 'vendor/html2canvas.min.js', 'vendor/jspdf.umd.min.js', 'vendor/jszip.min.js'
];
const IMGS = Array.from({ length: 18 }, (_, i) => String(i + 1).padStart(2, '0'))
  .flatMap(n => [`img/t${n}_photo.jpg`, `img/t${n}_illust.jpg`])
  .concat(['data/extra.json', 'data/sif.json', 'vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js'])
  .concat(Array.from({ length: 36 }, (_, i) => `img/src/p${String(i + 1).padStart(2, '0')}.jpg`)); // 와이파이 없는 곳에서도 쓰도록 미리 저장

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))).then(() => c.addAll(IMGS.map(u => new Request(u, { cache: 'reload' }))).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 화면·코드·자료는 인터넷이 되면 최신본을 먼저 받고(안 되면 저장본),
// 그림·라이브러리는 저장본을 먼저 쓴다.
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const stable = /\/(img|vendor|icons)\//.test(url.pathname);
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    if (stable && hit) return hit;
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) c.put(req, res.clone());
      return res;
    } catch (err) {
      return hit || Response.error();
    }
  }));
});
