/* v2 自己的離線快取。scope 是 ./（/vocab/v2/），比舊版 sw.js 的 /vocab/ 更精確，所以 v2 的頁面由這支接管。
   字庫沿用舊版的 ../data/*.js；做法同舊版：先用網路、沒網路用快取。 */
var CACHE = "vocab2-v1";
var FILES = ["./", "./index.html", "./core.js", "./app.js", "./sync2.js", "./manifest.json", "../icon.svg", "../data/bank.js", "../data/p1.js", "../data/prio.js"];
for (var i = 1; i <= 47; i++) FILES.push("../data/w" + i + ".js");

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () { }); }));
  }));
});
/* 只清 v2 自己的舊快取，不碰舊版的 vocab-vNN */
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k.indexOf("vocab2-") === 0 && k !== CACHE ? caches.delete(k) : null; }));
  }).then(function () { return self.clients.claim(); }));
});
/* { cache: "no-cache" }：強制跟伺服器確認一次（沒變就 304），GitHub Pages 的 max-age=600 才不會讓更新晚十分鐘 */
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || e.request.url.indexOf(self.location.origin) !== 0) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (r) {
        return r || caches.match("./index.html");
      });
    })
  );
});
