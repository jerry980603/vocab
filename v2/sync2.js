/* ============================================================
   v2 雲端同步（改自舊版 sync.js）
   - token：先讀舊版的 localStorage["vocabSync_v1"]（**只讀不寫**）；讀不到（例如 iPhone 主畫面圖示跟
     Safari 分開存）就用 v2 設定頁自己貼的 token，存在 vocab2_sync.token
   - 同一個 gist，不同檔案：進度 vocab2-progress.json；答題事件依月份分檔 vocab2-events-YYYY-MM.json
     （一個檔到考前會有幾萬筆、超過 2MB，手機每小時重傳一次太重，所以按月切）
   - PATCH 只帶 v2 的檔案，舊版的 vocab-progress.json 不會被動到
   - v2 自己的同步狀態（gistId、上次同步、上次傳事件）存在 vocab2_sync
   ============================================================ */
var SYNC2 = (function () {
  var OLD = "vocabSync_v1", MINE = "vocab2_sync";
  var FILE = "vocab2-progress.json", OLDFILE = "vocab-progress.json", EVP = "vocab2-events-";
  var API = "https://api.github.com";
  var DESC = "英文單字練習 — 學習進度（由 App 自動維護，請勿手動編輯）";
  var EV_EVERY = 3600000;   // 答題事件最多每小時傳一次（練習結束時另外強制傳）

  var busy = false, dirtyTimer = null, dirtyWhileBusy = false, applying = false;

  function read(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }
  function mine() { return read(MINE); }
  function saveMine(o) { try { localStorage.setItem(MINE, JSON.stringify(o)); } catch (e) { } }
  function token() { return (read(OLD).token || mine().token || "").trim(); }
  /* 這個 token 是哪裡來的：old ＝ 共用舊版的設定（v2 不能關）；mine ＝ v2 設定頁貼的 */
  function tokenFrom() { return (read(OLD).token || "").trim() ? "old" : mine().token ? "mine" : ""; }
  function setToken(t) { var m = mine(); m.token = String(t || "").trim(); if (!m.token) delete m.token; saveMine(m); }
  /* 舊版設定裡的 gist id 只讀；那個 gist 被刪掉時記在自己的 dead，不然會一直回去打同一個 404 */
  function gistId() {
    var m = mine(), o = read(OLD).gistId || "";
    return m.gistId || (o && o !== m.dead ? o : "");
  }
  function enabled() { return !!token(); }
  function info() { var m = mine(); return { enabled: enabled(), from: tokenFrom(), lastSync: m.lastSync || 0, lastEv: m.lastEv || 0 }; }

  function req(path, opts) {
    opts = opts || {};
    opts.headers = { "Authorization": "Bearer " + token(), "Accept": "application/vnd.github+json" };
    return fetch(API + path, opts).then(function (r) {
      if (r.status === 401 || r.status === 403) { var e = new Error("token 無效或權限不足"); e.code = "auth"; throw e; }
      if (r.status === 404) { var e2 = new Error("找不到這個 gist"); e2.code = "missing"; throw e2; }
      if (!r.ok) throw new Error("GitHub 回應 " + r.status);
      return r.json();
    });
  }
  /* 第二台裝置可能還沒有 gist id：用 token 找放著進度檔（新或舊）的那個 gist */
  function findGist() {
    return req("/gists?per_page=100").then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var f = list[i].files || {};
        if (f[FILE] || f[OLDFILE]) return list[i].id;
      }
      return null;
    });
  }
  function ensureId() {
    if (gistId()) return Promise.resolve(gistId());
    return findGist().then(function (id) {
      if (id) { var m = mine(); m.gistId = id; saveMine(m); }
      return id;
    });
  }
  function getGist() { return gistId() ? req("/gists/" + gistId()) : Promise.resolve(null); }
  /* 讀 gist 裡的某個檔；超過 1MB 時 content 會被截斷，要改抓 raw_url */
  function fileOf(g, name) {
    var f = g && g.files && g.files[name];
    if (!f) return Promise.resolve(null);
    if (f.truncated && f.raw_url) return fetch(f.raw_url).then(function (r) { return r.json(); });
    return Promise.resolve(JSON.parse(f.content));
  }
  function write(files) {
    var payload = { description: DESC, files: {} };
    Object.keys(files).forEach(function (k) { payload.files[k] = { content: JSON.stringify(files[k]) }; });
    if (gistId()) return req("/gists/" + gistId(), { method: "PATCH", body: JSON.stringify(payload) });
    payload.public = false;
    return req("/gists", { method: "POST", body: JSON.stringify(payload) }).then(function (g) {
      var m = mine(); m.gistId = g.id; saveMine(m); return g;
    });
  }

  /* 第一次打開 v2：雲端有沒有別台裝置已經搬好的 v2 進度？沒有的話，有沒有舊版進度？ */
  function pullFirst() {
    if (!enabled()) return Promise.resolve({});
    return ensureId().then(getGist).then(function (g) {
      return Promise.all([fileOf(g, FILE), fileOf(g, OLDFILE)]);
    }).then(function (r) { return { v2: r[0], v1: r[1] }; });
  }

  /* 完整一輪：抓下來 → 合併 → 寫回去 → 再跟當下的本機合併一次（上傳途中答的題才不會不見） */
  function run(opts) {
    opts = opts || {};
    if (!enabled()) return Promise.resolve({ skipped: "沒有設定 token" });
    if (busy) { dirtyWhileBusy = true; return Promise.resolve({ skipped: "同步進行中" }); }
    busy = true;
    var dev = APP.dev(), sentEv = 0, g0 = null;
    return ensureId().then(getGist).catch(function (e) {
      if (e.code === "missing") { var m = mine(); m.dead = gistId(); m.gistId = ""; saveMine(m); return null; }
      throw e;
    }).then(function (g) {
      g0 = g;
      return fileOf(g, FILE);
    }).then(function (remote) {
      dirtyWhileBusy = false;
      var merged = V2.merge(APP.getS(), remote, dev), files = {};
      files[FILE] = merged;
      var pend = APP.events(), m = mine();
      var sendEv = pend.length && (opts.events || Date.now() - (m.lastEv || 0) >= EV_EVERY);
      if (!sendEv) return write(files).then(function () { return merged; });
      /* 答題事件：依月份分組，跟雲端那個月的檔合併 */
      sentEv = pend.length;
      var byMon = {};
      pend.forEach(function (e) {
        var k = EVP + V2.dateStr(e[0] * 1000).slice(0, 7) + ".json";
        (byMon[k] = byMon[k] || []).push(e);
      });
      var names = Object.keys(byMon);
      return Promise.all(names.map(function (n) { return fileOf(g0, n); })).then(function (rs) {
        names.forEach(function (n, i) { files[n] = V2.mergeEvents(rs[i] || [], byMon[n]); });
        return write(files);
      }).then(function () {
        APP.dropEvents(sentEv);          // 只丟掉這次送出的；上傳途中新增的留著
        var m2 = mine(); m2.lastEv = Date.now(); saveMine(m2);
        return merged;
      });
    }).then(function (merged) {
      var fresh = V2.merge(APP.getS(), merged, dev);
      applying = true;
      APP.setS(fresh);
      applying = false;
      clearTimeout(dirtyTimer);
      busy = false;
      if (dirtyWhileBusy) { dirtyWhileBusy = false; touch(); }
      var m3 = mine(); m3.lastSync = Date.now(); saveMine(m3);
      return { ok: true, events: sentEv };
    }).catch(function (e) {
      applying = false; busy = false;
      throw e;
    });
  }
  /* 存檔就標記一次，停 8 秒才真的送（避免每題都打 API） */
  function touch() {
    if (!enabled() || applying) return;
    if (busy) dirtyWhileBusy = true;
    clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(function () { run().catch(function () { }); }, 8000);
  }
  /* 開 App 時拉一次；切走或關掉時補送一次（含答題事件） */
  function auto() {
    if (!enabled()) return;
    run().then(function () { APP.refresh(); }).catch(function () { });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        clearTimeout(dirtyTimer);
        run({ events: true }).catch(function () { });
      }
    });
  }
  return { enabled: enabled, info: info, setToken: setToken, run: run, touch: touch, auto: auto, pullFirst: pullFirst };
})();
