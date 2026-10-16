/* sync2.js 的測試：用假的 GitHub API（不連網、不碰真的 gist）。
   檢查：只寫 v2 的檔案、不改舊版的同步設定、答題事件依月份分檔且上傳後才刪、
   上傳途中本機的變動不會不見、第二台裝置找得到 gist、超過 1MB 的檔走 raw_url。 */
var assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
var L = require("./lib.js"), V = L.V2;
V.init(L.loadBank());
var SRC = fs.readFileSync(path.join(__dirname, "..", "sync2.js"), "utf8");
var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

/* 一個假環境：localStorage、fetch（假 GitHub）、APP（假畫面） */
function env(opts) {
  opts = opts || {};
  var store = {}, calls = [];
  var ls = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
  var gist = opts.gist === undefined ? { id: "g1", files: {} } : opts.gist;
  function json(o) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(JSON.parse(JSON.stringify(o))); } }); }
  function fetchFn(url, o) {
    o = o || {};
    calls.push({ url: url, method: o.method || "GET", body: o.body ? JSON.parse(o.body) : null });
    if (url.indexOf("https://raw/") === 0) return json(JSON.parse(gist.files[url.slice(12)].content));
    var p = url.replace("https://api.github.com", "");
    if (p === "/gists?per_page=100") return json(gist ? [{ id: gist.id, files: Object.keys(gist.files).reduce(function (a, k) { a[k] = {}; return a; }, {}) }] : []);
    if (p === "/gists" && o.method === "POST") {
      gist = { id: "new", files: {} };
      Object.keys(JSON.parse(o.body).files).forEach(function (k) { gist.files[k] = JSON.parse(o.body).files[k]; });
      return json({ id: "new" });
    }
    if (!gist || p !== "/gists/" + gist.id) return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); } });
    if (o.method === "PATCH") {
      var body = JSON.parse(o.body);
      if (opts.onPatch) opts.onPatch();
      Object.keys(body.files).forEach(function (k) { gist.files[k] = { content: body.files[k].content }; });
      return json({ id: gist.id });
    }
    var out = { id: gist.id, files: {} };
    Object.keys(gist.files).forEach(function (k) {
      var big = (opts.truncate || []).indexOf(k) > -1;
      out.files[k] = { content: big ? "{" : gist.files[k].content, truncated: big, raw_url: "https://raw/" + k };
    });
    return json(out);
  }
  var state = { s: opts.local || V.blank(Date.now()) };
  if (!opts.local) state.s.born = 0;   // 預設不比對搬家時間（避免同一毫秒才相同的不穩定）；衝突的測試自己設定
  var ctx = {
    localStorage: ls, fetch: fetchFn, V2: V, console: console, Promise: Promise, JSON: JSON, Date: Date, Math: Math, Object: Object,
    setTimeout: function () { return 0; }, clearTimeout: function () { },
    document: { addEventListener: function () { }, visibilityState: "visible" },
    APP: {
      dev: function () { return "pc"; },
      getS: function () { return state.s; },
      setS: function (s) { state.s = V.normalize(s); },
      events: function () { return JSON.parse(ls.getItem("vocab2_events") || "[]"); },
      dropEvents: function (n) { ls.setItem("vocab2_events", JSON.stringify(JSON.parse(ls.getItem("vocab2_events") || "[]").slice(n))); },
      refresh: function () { },
      conflict: function (r) { ctx.__conflict = r; }
    }
  };
  ctx.window = ctx;
  if (opts.token !== false) ls.setItem("vocabSync_v1", JSON.stringify({ token: "t0k", gistId: opts.noId ? undefined : "g1", lastSync: 5 }));
  if (opts.events) ls.setItem("vocab2_events", JSON.stringify(opts.events));
  if (opts.mine) ls.setItem("vocab2_sync", JSON.stringify(opts.mine));
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "sync2.js" });
  return { SYNC2: ctx.SYNC2, ls: ls, calls: calls, gist: function () { return gist; }, state: state };
}
function put(S, id, f) { var s = V.sense(id), it = V.newItem(s, Date.now(), "new"); for (var k in f) it[k] = f[k]; S.items[s.id] = it; return it; }
var OLD = { content: JSON.stringify({ v: 1, items: { "abandon::0": { w: "abandon", si: 0, box: 3, seen: 2 } } }) };
var T1 = Date.UTC(2026, 9, 20) / 1000, T2 = Date.UTC(2026, 10, 2) / 1000;   // 10 月、11 月各一筆

test("沒設定 token → 不連網", function () {
  var e = env({ token: false });
  return e.SYNC2.run().then(function (r) {
    assert.ok(r.skipped); assert.strictEqual(e.calls.length, 0);
  });
});
test("只寫 v2 的檔案；舊版的進度檔與同步設定都不動", function () {
  var e = env({ gist: { id: "g1", files: { "vocab-progress.json": OLD } } });
  var oldCfg = e.ls.getItem("vocabSync_v1");
  put(e.state.s, "abandon::0", { seen: 3 });
  return e.SYNC2.run().then(function () {
    var patches = e.calls.filter(function (c) { return c.method === "PATCH"; });
    assert.strictEqual(patches.length, 1);
    assert.deepStrictEqual(Object.keys(patches[0].body.files), ["vocab2-progress.json"]);
    assert.strictEqual(e.gist().files["vocab-progress.json"], OLD);
    assert.strictEqual(e.ls.getItem("vocabSync_v1"), oldCfg);
    assert.ok(JSON.parse(e.ls.getItem("vocab2_sync")).lastSync > 0);
    assert.ok(JSON.parse(e.gist().files["vocab2-progress.json"].content).items["abandon::0"]);
  });
});
test("雲端比較新的字義會合併進本機，本機獨有的保留", function () {
  var remote = V.blank(Date.now()); put(remote, "abandon::0", { seen: 9, pos: 5 });
  var e = env({ gist: { id: "g1", files: { "vocab2-progress.json": { content: JSON.stringify(remote) } } } });
  put(e.state.s, "abandon::0", { seen: 2, pos: 1 }); put(e.state.s, "bank::0", { seen: 1 });
  return e.SYNC2.run().then(function () {
    assert.strictEqual(e.state.s.items["abandon::0"].pos, 5);
    assert.ok(e.state.s.items["bank::0"]);
  });
});
test("上傳途中又答了一題 → 不會被雲端的舊快照蓋掉", function () {
  var e;
  e = env({ onPatch: function () { put(e.state.s, "career::0", { seen: 4, pos: 2 }); } });
  put(e.state.s, "abandon::0", { seen: 1 });
  return e.SYNC2.run().then(function () {
    assert.ok(e.state.s.items["career::0"], "上傳途中加的字義不見了");
    assert.ok(e.state.s.items["abandon::0"]);
  });
});
test("答題事件：依月份分檔、跟雲端合併去重、送出後才從本機刪", function () {
  var ev1 = [T1, "abandon::0", "A", 1, 3000, "abandon::0", 1, 2, "pc"], ev2 = [T2, "bank::0", "S", 0, 2000, "x", 2, 1, "pc"];
  var old = [T1 - 100, "career::0", "B", 1, 4000, "career::0", 0, 1, "phone"];
  var e = env({ events: [ev1, ev2], gist: { id: "g1", files: { "vocab2-events-2026-10.json": { content: JSON.stringify([old, ev1]) } } } });
  return e.SYNC2.run({ events: true }).then(function (r) {
    assert.strictEqual(r.events, 2);
    var p = e.calls.filter(function (c) { return c.method === "PATCH"; })[0].body.files;
    assert.deepStrictEqual(Object.keys(p).sort(), ["vocab2-events-2026-10.json", "vocab2-events-2026-11.json", "vocab2-progress.json"]);
    assert.deepStrictEqual(JSON.parse(p["vocab2-events-2026-10.json"].content), [old, ev1]);
    assert.deepStrictEqual(JSON.parse(p["vocab2-events-2026-11.json"].content), [ev2]);
    assert.deepStrictEqual(e.APP_events = JSON.parse(e.ls.getItem("vocab2_events")), []);
  });
});
test("答題事件：距離上次不到一小時、也不是練習結束 → 先不傳", function () {
  var e = env({ events: [[T1, "abandon::0", "A", 1, 3000, "abandon::0", 1, 2, "pc"]], mine: { lastEv: Date.now() - 60000 } });
  return e.SYNC2.run().then(function (r) {
    var p = e.calls.filter(function (c) { return c.method === "PATCH"; })[0].body.files;
    assert.deepStrictEqual(Object.keys(p), ["vocab2-progress.json"]);
    assert.strictEqual(JSON.parse(e.ls.getItem("vocab2_events")).length, 1);
  });
});
test("第二台裝置沒有 gist id → 用 token 找到放著舊進度檔的那個 gist，不另外建新的", function () {
  var e = env({ noId: true, gist: { id: "g1", files: { "vocab-progress.json": OLD } } });
  return e.SYNC2.run().then(function () {
    assert.strictEqual(e.calls.filter(function (c) { return c.method === "POST"; }).length, 0);
    assert.strictEqual(JSON.parse(e.ls.getItem("vocab2_sync")).gistId, "g1");
    assert.ok(e.gist().files["vocab2-progress.json"]);
  });
});
test("第一次打開：pullFirst 拿得到雲端的 v2 與舊版進度", function () {
  var remote = V.blank(Date.now()); put(remote, "abandon::0", { seen: 9 });
  var e = env({ gist: { id: "g1", files: { "vocab-progress.json": OLD, "vocab2-progress.json": { content: JSON.stringify(remote) } } } });
  return e.SYNC2.pullFirst().then(function (r) {
    assert.ok(r.v2.items["abandon::0"]); assert.ok(r.v1.items["abandon::0"]);
    assert.strictEqual(e.calls.filter(function (c) { return c.method !== "GET"; }).length, 0);
  });
});
test("超過 1MB 被截斷的檔 → 改抓 raw_url", function () {
  var remote = V.blank(Date.now()); put(remote, "abandon::0", { seen: 9, pos: 4 });
  var e = env({ truncate: ["vocab2-progress.json"], gist: { id: "g1", files: { "vocab2-progress.json": { content: JSON.stringify(remote) } } } });
  return e.SYNC2.run().then(function () {
    assert.ok(e.calls.some(function (c) { return c.url === "https://raw/vocab2-progress.json"; }));
    assert.strictEqual(e.state.s.items["abandon::0"].pos, 4);
  });
});
test("gist 被刪掉了 → 重建一個新的（舊的 id 不再用）", function () {
  var e = env({ gist: null });
  return e.SYNC2.run().then(function () {
    assert.strictEqual(e.calls.filter(function (c) { return c.method === "POST"; }).length, 1);
    assert.strictEqual(JSON.parse(e.ls.getItem("vocab2_sync")).gistId, "new");
  });
});

test("讀不到舊版的 token（iPhone 主畫面圖示）→ 用 v2 設定頁貼的 token 同步，不寫舊版設定", function () {
  var e = env({ token: false, mine: { token: "mineTok" }, gist: { id: "g1", files: { "vocab-progress.json": OLD } } });
  assert.strictEqual(e.SYNC2.info().from, "mine");
  return e.SYNC2.run().then(function () {
    var patch = e.calls.filter(function (c) { return c.method === "PATCH"; });
    assert.strictEqual(patch.length, 1);
    assert.strictEqual(e.ls.getItem("vocabSync_v1"), null);
    assert.strictEqual(JSON.parse(e.ls.getItem("vocab2_sync")).gistId, "g1");
  });
});
test("舊版有 token 時用舊版的；setToken 只動 v2 自己的設定，清空就關掉", function () {
  var e = env({ mine: { token: "mineTok" } });
  var oldCfg = e.ls.getItem("vocabSync_v1");
  assert.strictEqual(e.SYNC2.info().from, "old");
  var e2 = env({ token: false });
  assert.strictEqual(e2.SYNC2.enabled(), false);
  e2.SYNC2.setToken("  abc  ");
  assert.strictEqual(e2.SYNC2.enabled(), true);
  assert.strictEqual(JSON.parse(e2.ls.getItem("vocab2_sync")).token, "abc");
  e2.SYNC2.setToken("");
  assert.strictEqual(e2.SYNC2.enabled(), false);
  assert.strictEqual(e.ls.getItem("vocabSync_v1"), oldCfg);
});

test("雲端是另一次搬家的 v2（born 不同）→ 不上傳、不默默合併，交給使用者選；選完 force 才上傳", function () {
  var remote = V.blank(Date.now()); remote.born = 111; put(remote, "abandon::0", { seen: 9 });
  var e = env({ gist: { id: "g1", files: { "vocab2-progress.json": { content: JSON.stringify(remote) } } } });
  e.state.s.born = 222; put(e.state.s, "bank::0", { seen: 1 });
  var called = null;
  return e.SYNC2.run().then(function (r) {
    assert.ok(r.conflict);
    assert.strictEqual(e.calls.filter(function (c) { return c.method === "PATCH"; }).length, 0);
    assert.ok(e.state.s.items["bank::0"]); assert.ok(!e.state.s.items["abandon::0"]);
    return e.SYNC2.run({ force: true });
  }).then(function () {
    var up = JSON.parse(e.gist().files["vocab2-progress.json"].content);
    assert.strictEqual(up.born, 222);                       // 用這台的
    assert.ok(up.items["bank::0"]);
  });
});

/* 依序跑（每個都是非同步） */
var pass = 0, fail = [];
tests.reduce(function (p, t) {
  return p.then(function () { return t.fn(); }).then(function () { pass++; }, function (err) { fail.push({ name: t.name, err: err }); });
}, Promise.resolve()).then(function () {
  console.log("\n== 同步（假 GitHub）：" + pass + " / " + tests.length + " 通過");
  fail.forEach(function (f) { console.log("  ✗ " + f.name + "\n    " + String(f.err && f.err.stack || f.err).split("\n").slice(0, 4).join("\n    ")); });
  process.exitCode = fail.length ? 1 : 0;
});
