/* ============================================================
   雲端同步 — 把學習進度存到你自己 GitHub 帳號底下的一個 secret gist

   為什麼要這個：進度存在 localStorage，是每個瀏覽器各自獨立的。
   手機練的字電腦看不到，複習排程會分裂成兩份，間隔重複就失效了。

   為什麼選 gist：不用架伺服器、不用註冊新服務、完全免費，
   而且資料放在使用者自己的帳號裡，隨時看得到、刪得掉。

   設定（token）存在另一個 localStorage key，不會被同步上去。
   ============================================================ */
var SYNC = (function () {
  var LSK = "vocabSync_v1";
  var FILE = "vocab-progress.json";
  var API = "https://api.github.com";
  var DESC = "英文單字練習 — 學習進度（由 App 自動維護，請勿手動編輯）";

  var cfg = loadCfg();
  var busy = false;
  var dirtyTimer = null;
  /* 同步完成要把結果寫回本機，那會呼叫 save()，而 save() 又會呼叫 touch()。
     沒有這個旗標的話就變成「同步 → 存檔 → 排下一次同步」的無限迴圈。 */
  var applying = false;

  function loadCfg() {
    try { return JSON.parse(localStorage.getItem(LSK)) || {}; }
    catch (e) { return {}; }
  }
  function saveCfg() {
    try { localStorage.setItem(LSK, JSON.stringify(cfg)); } catch (e) { }
  }

  /* ---------- 合併 ----------
     兩台裝置各自練過之後，誰也不該蓋掉誰。這裡逐筆合併，
     不是整份覆蓋，所以手機練的 30 題和電腦練的 20 題都會留著。 */
  function merge(a, b) {
    if (!a || !a.items) return b;
    if (!b || !b.items) return a;

    var out = {
      v: 1,
      items: {},
      todo: [],
      bad: [],
      log: {},
      known: {}
    };

    /* items：取「練得比較多」的那一筆。
       seen 只增不減，所以它可以當作「這筆狀態有多新」的判準。
       seen 一樣時取 due 較晚的（代表剛答對、被排到更後面）。 */
    var keys = {};
    Object.keys(a.items).forEach(function (k) { keys[k] = 1; });
    Object.keys(b.items).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var x = a.items[k], y = b.items[k];
      if (!x) { out.items[k] = y; return; }
      if (!y) { out.items[k] = x; return; }
      var sx = x.seen || 0, sy = y.seen || 0;
      var pick;
      if (sx > sy) pick = x;
      else if (sy > sx) pick = y;
      else pick = (x.due || 0) >= (y.due || 0) ? x : y;
      /* 錯題標記取聯集：任何一台標記過答錯，合併後就保留。
         漏掉會讓該補練的字悄悄消失，寧可多練一次。 */
      if (!pick.wb && (x.wb || y.wb)) {
        var c = {};
        for (var f in pick) if (Object.prototype.hasOwnProperty.call(pick, f)) c[f] = pick[f];
        c.wb = true; pick = c;
      }
      out.items[k] = pick;
    });

    /* log：取較大值而不是相加。
       相加會在同一台裝置重複同步時把數字灌大，
       取 max 頂多在「同一天兩台都練」時少算一些。
       log 只影響今日題數的顯示，不影響複習排程（那是 items.due 決定的）。 */
    var days = {};
    Object.keys(a.log || {}).forEach(function (d) { days[d] = 1; });
    Object.keys(b.log || {}).forEach(function (d) { days[d] = 1; });
    Object.keys(days).forEach(function (d) {
      var x = (a.log || {})[d] || { a: 0, c: 0 };
      var y = (b.log || {})[d] || { a: 0, c: 0 };
      out.log[d] = { a: Math.max(x.a || 0, y.a || 0), c: Math.max(x.c || 0, y.c || 0) };
    });

    /* todo / known：聯集 */
    var seenTodo = {};
    (a.todo || []).concat(b.todo || []).forEach(function (w) {
      if (!seenTodo[w]) { seenTodo[w] = 1; out.todo.push(w); }
    });
    [a.known || {}, b.known || {}].forEach(function (src) {
      Object.keys(src).forEach(function (w) { out.known[w] = 1; });
    });

    /* bad：用「單字＋例句」去重的聯集 */
    var seenBad = {};
    (a.bad || []).concat(b.bad || []).forEach(function (it) {
      var k = (it.w || "") + "|" + (it.en || "");
      if (!seenBad[k]) { seenBad[k] = 1; out.bad.push(it); }
    });

    /* 純量設定（每日題數、考試日期…）：取最後修改時間較新的那份 */
    var newer = (a.mtime || 0) >= (b.mtime || 0) ? a : b;
    ["perDay", "examDate", "learnEndDate", "mixLevels", "finalReview"].forEach(function (k) {
      if (newer[k] !== undefined) out[k] = newer[k];
    });
    out.mtime = Math.max(a.mtime || 0, b.mtime || 0);
    return out;
  }

  /* ---------- GitHub API ---------- */
  function req(path, opts) {
    opts = opts || {};
    opts.headers = {
      "Authorization": "Bearer " + cfg.token,
      "Accept": "application/vnd.github+json"
    };
    return fetch(API + path, opts).then(function (r) {
      if (r.status === 401 || r.status === 403) {
        var e = new Error("token 無效或權限不足");
        e.code = "auth"; throw e;
      }
      if (r.status === 404) {
        var e2 = new Error("找不到這個 gist");
        e2.code = "missing"; throw e2;
      }
      if (!r.ok) throw new Error("GitHub 回應 " + r.status);
      return r.json();
    });
  }

  /* 第二台裝置只會拿到 token，本機沒有 gist id。
     少了這一步，它會自己建一個新 gist，兩台各存各的，永遠對不起來。
     所以先用 token 去帳號裡找那個放著進度檔的 gist。 */
  function findGist() {
    return req("/gists?per_page=100").then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].files && list[i].files[FILE]) return list[i].id;
      }
      return null;
    });
  }

  function readGist() {
    return req("/gists/" + cfg.gistId).then(function (g) {
      var f = g.files && g.files[FILE];
      if (!f) { var e = new Error("gist 裡沒有進度檔"); e.code = "missing"; throw e; }
      /* 超過 1MB 時 content 會被截斷，要改抓 raw_url */
      if (f.truncated && f.raw_url) {
        return fetch(f.raw_url).then(function (r) { return r.json(); });
      }
      return JSON.parse(f.content);
    });
  }

  function writeGist(state) {
    var payload = { description: DESC, files: {} };
    payload.files[FILE] = { content: JSON.stringify(state) };
    if (cfg.gistId) {
      return req("/gists/" + cfg.gistId, {
        method: "PATCH", body: JSON.stringify(payload)
      });
    }
    payload.public = false;
    return req("/gists", { method: "POST", body: JSON.stringify(payload) })
      .then(function (g) { cfg.gistId = g.id; saveCfg(); return g; });
  }

  /* ---------- 對外 ---------- */
  function enabled() { return !!cfg.token; }
  function info() {
    return { token: cfg.token || "", gistId: cfg.gistId || "", lastSync: cfg.lastSync || 0 };
  }
  function setToken(t) {
    cfg.token = (t || "").trim();
    if (!cfg.token) { cfg.gistId = ""; cfg.lastSync = 0; }
    saveCfg();
  }
  function forget() {
    cfg = {}; saveCfg();
  }

  /* 完整一輪：抓下來 → 合併 → 寫回去 → 套用到本機 */
  function run(opts) {
    opts = opts || {};
    if (!enabled()) return Promise.resolve({ skipped: "沒有設定 token" });
    if (busy) return Promise.resolve({ skipped: "同步進行中" });
    busy = true;

    /* 沒有 gist id 就先找一次；找不到才會在寫入時建新的 */
    var ready = cfg.gistId
      ? Promise.resolve()
      : findGist().then(function (id) {
        if (id) { cfg.gistId = id; saveCfg(); }
      });

    var pull = ready.then(function () {
      return cfg.gistId ? readGist() : null;
    });

    return pull.catch(function (e) {
      /* gist 被刪掉了就重建一個，其他錯誤往上拋 */
      if (e.code === "missing") { cfg.gistId = ""; saveCfg(); return null; }
      throw e;
    }).then(function (remote) {
      var merged = merge(window.S, remote);
      return writeGist(merged).then(function () { return merged; });
    }).then(function (merged) {
      window.S = merged;
      applying = true;
      if (typeof save === "function") save();
      applying = false;
      /* 剛送出過，把待送的排程取消，不然 8 秒後會再打一次 */
      clearTimeout(dirtyTimer);
      cfg.lastSync = Date.now(); saveCfg();
      busy = false;
      return { ok: true, at: cfg.lastSync };
    }).catch(function (e) {
      applying = false;
      busy = false;
      throw e;
    });
  }

  /* 練完一題就標記一次，停下來 8 秒才真的送出，避免每題都打 API */
  function touch() {
    if (!enabled() || applying) return;
    clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(function () {
      run().catch(function () { });
    }, 8000);
  }

  /* 開 App 時拉一次；切走或關掉時補送一次 */
  function auto() {
    if (!enabled()) return;
    run().then(function () {
      if (typeof refreshHeader === "function") refreshHeader();
    }).catch(function () { });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        clearTimeout(dirtyTimer);
        run().catch(function () { });
      }
    });
  }

  return {
    enabled: enabled, info: info, setToken: setToken, forget: forget,
    run: run, touch: touch, auto: auto, merge: merge
  };
})();
