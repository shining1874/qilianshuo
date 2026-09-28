// 祁连说工作室管理系统 — Service Worker（离线缓存 + 可安装 PWA）
const CACHE = "qilian-studio-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/logo.svg",
  "./css/styles.css",
  "./js/app.js",
  "./js/ui.js",
  "./js/store.js",
  "./js/ima.js",
  "./js/push.js",
  "./js/modules.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // 不走缓存：IMA / 平台推送等外部接口
  if (url.hostname.includes("ima") || url.hostname.includes("qq.com") || url.hostname.includes("weixin") || e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
