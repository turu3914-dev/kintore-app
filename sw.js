// オフライン対応のサービスワーカー。
// アプリ本体(HTML/CSS/JS/アイコン)をキャッシュし、同じオリジンの GET だけを扱う。
// Anthropic API など外部への通信には一切関与しない。
// ファイルを更新したら CACHE のバージョンを上げる(古いキャッシュは起動時に消える)。
const CACHE = "kintore-v5";
const ASSETS = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "js/data.js", "js/storage.js", "js/calc.js", "js/charts.js", "js/foodknowledge.js",
  "js/foodai.js", "js/coachai.js", "js/demo.js", "js/app.js", "js/pwa.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// キャッシュを即返し、裏で最新を取り直して次回に反映する(stale-while-revalidate)
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || (req.mode === "navigate" ? cache.match("index.html") : Response.error());
    })
  );
});
