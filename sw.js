/* 離線快取：第一次開啟後，之後沒網路也能用 */
var CACHE = "vocab-v4";
var FILES = [
  "./", "./index.html", "./app.js", "./manifest.json", "./icon.svg",
  "./data/official.js", "./data/bank.js",
  "./data/w1.js", "./data/w2.js", "./data/w3.js", "./data/w4.js",
  "./data/w5.js", "./data/w6.js", "./data/w7.js", "./data/p1.js"
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (f) {
      return c.add(f).catch(function () { });
    }));
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* 先用網路（拿得到就順便更新快取），沒網路就用快取 */
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (r) {
        return r || caches.match("./index.html");
      });
    })
  );
});
