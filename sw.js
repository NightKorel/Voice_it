// 1+1=? 的離線快取：讓遊戲加到主畫面後，沒網路也打得開（合過的配方照樣能玩）。
// 策略：先上網拿最新版，拿不到才用快取，所以更新會馬上生效。
// 新增遊戲需要的檔案時，記得加進下面的 FILES。
const CACHE = '1plus1-v1';
const FILES = ['./', './index.html', './starter.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  // 只管自己網站的檔案；問 AI 的請求一律直接上網，不經過快取
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
