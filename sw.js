/* 離線快取：第一次開啟後，之後沒網路也能用 */
var CACHE = "vocab-v23";
var FILES = [
  "./", "./index.html", "./app.js", "./manifest.json", "./icon.svg",
  "./data/official.js", "./data/bank.js",
  "./data/w1.js", "./data/w2.js", "./data/w3.js", "./data/w4.js", "./data/w5.js",
  "./data/w6.js", "./data/w7.js", "./data/w8.js", "./data/w9.js",
  "./data/w10.js", "./data/w11.js", "./data/w12.js", "./data/w13.js",
  "./data/w14.js", "./data/w15.js", "./data/w16.js", "./data/w17.js", "./data/w18.js", "./data/w19.js", "./data/w20.js", "./data/w21.js", "./data/p1.js"
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

/* 先用網路（拿得到就順便更新快取），沒網路就用快取。

   注意 { cache: "no-cache" }：少了它，這個 fetch 會走瀏覽器自己的 HTTP 快取，
   而 GitHub Pages 給的是 max-age=600，等於補完新單字後手機最久要等十分鐘
   才看得到，PWA 情境下還可能更久。no-cache 不是不用快取，
   是強制跟伺服器確認一次（沒變就回 304，很便宜），這樣更新才會即時。 */
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then(function (res) {
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
