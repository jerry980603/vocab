/* ============================================================
   單字練習 App — 主程式
   所有資料存在瀏覽器本機（localStorage），不需要網路、不需要帳號。
   ============================================================ */

/* ---------- 0. 小工具 ---------- */
var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
};
var DAY = 86400000;
var toastTimer = null;
function toast(msg) {
  var t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove("on"); }, 1900);
}
function today() {
  var d = new Date();
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}
function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ---------- 1. 字典索引 ---------- */
var BANK = window.WORD_BANK || [];
var DICT = {};
BANK.forEach(function (e) { DICT[e.w.toLowerCase()] = e; });

/* 大考中心官方詞彙表索引：6114 個字的分級與詞性（沒有釋義與例句） */
var OFFICIAL = {}, OFF_COUNT = 0;
(function () {
  var raw = window.OFFICIAL_RAW || {};
  Object.keys(raw).forEach(function (lv) {
    raw[lv].split(",").forEach(function (item) {
      var sp = item.lastIndexOf(" ");
      if (sp < 1) return;
      OFFICIAL[item.slice(0, sp)] = { lv: +lv, pos: item.slice(sp + 1) };
      OFF_COUNT++;
    });
  });
})();
/* 已經編好釋義與例句、真的能拿來練的字 */
function writtenCount() { return BANK.filter(function (e) { return !e.ph; }).length; }

/* 把 running / studies / bigger 之類的變化形，還原成字典裡的原形 */
function lookup(raw) {
  var w = String(raw).toLowerCase().replace(/[^a-z' -]/g, "").replace(/\s+/g, " ").trim();
  if (!w) return null;
  if (DICT[w]) return DICT[w];
  if (w.indexOf(" ") > -1) return null;   // 片語只做完全比對，不做字尾還原
  var c = [];
  if (/ies$/.test(w)) c.push(w.slice(0, -3) + "y");
  if (/ied$/.test(w)) c.push(w.slice(0, -3) + "y");
  if (/ier$/.test(w)) c.push(w.slice(0, -3) + "y");
  if (/iest$/.test(w)) c.push(w.slice(0, -4) + "y");
  if (/es$/.test(w)) c.push(w.slice(0, -2));
  if (/s$/.test(w)) c.push(w.slice(0, -1));
  if (/ed$/.test(w)) { c.push(w.slice(0, -1), w.slice(0, -2)); if (/(.)\1ed$/.test(w)) c.push(w.slice(0, -3)); }
  if (/ing$/.test(w)) { c.push(w.slice(0, -3), w.slice(0, -3) + "e"); if (/(.)\1ing$/.test(w)) c.push(w.slice(0, -4)); }
  if (/est$/.test(w)) c.push(w.slice(0, -3), w.slice(0, -2));
  if (/er$/.test(w)) c.push(w.slice(0, -2), w.slice(0, -1));
  if (/ly$/.test(w)) c.push(w.slice(0, -2), w.slice(0, -2) + "e");
  for (var i = 0; i < c.length; i++) if (DICT[c[i]]) return DICT[c[i]];
  return null;
}

/* ---------- 2. 進度存檔 ---------- */
var LS = "vocabApp_v1";
var S = load();

function load() {
  try {
    var o = JSON.parse(localStorage.getItem(LS));
    if (o && o.items) {
      o.todo = o.todo || []; o.bad = o.bad || []; o.log = o.log || {};
      o.known = o.known || {};   /* 快篩標記「我已經會了」的字，不進練習清單 */
      return o;
    }
  } catch (e) { }
  return { v: 1, items: {}, todo: [], bad: [], log: {}, known: {} };
}
function save() {
  /* mtime 給雲端同步用：兩台裝置的純量設定（每日題數、考試日期）
     起衝突時，靠它決定哪一份比較新。 */
  S.mtime = Date.now();
  try { localStorage.setItem(LS, JSON.stringify(S)); }
  catch (e) { toast("儲存失敗，可能是瀏覽器空間不足"); }
  if (window.SYNC) SYNC.touch();
}

/* 間隔重複的階梯：10 分鐘 → 1 天 → 4 天 → 14 天 → 30 天 → 60 天 → 120 天

   為什麼中段跳這麼開？依 Cepeda et al. (2008) 的大規模研究，
   最佳複習間隔取決於「你要記住多久」：目標 70 天時最佳間隔約 21 天，
   目標 350 天時也約 21 天。學測距今在這個區間內，
   所以 1 天、2 天、4 天那種密集複習是落在效率曲線的低效區——
   花很多時間，換到的長期保留卻不成比例。
   模擬顯示改用這組階梯，每天題數比原本的加倍階梯少約 23%。

   第一格仍然只隔 10 分鐘，確保同一次讀書時間內一定會再遇到一次。 */
var INT = [0, 10 * 60000, 1 * DAY, 4 * DAY, 14 * DAY, 30 * DAY, 60 * DAY, 120 * DAY];
var MAXBOX = INT.length - 1;

function idOf(w, si) { return w + "::" + si; }
function hasItem(w, si) { return !!S.items[idOf(w, si)]; }

function addItem(w, si) {
  var id = idOf(w, si);
  if (S.items[id]) return false;
  S.items[id] = { w: w, si: si, box: 0, due: Date.now(), seen: 0, right: 0, wrong: 0, st: 0, wb: false };
  save();
  return true;
}
function delItem(w, si) { delete S.items[idOf(w, si)]; save(); }

function allItems() {
  return Object.keys(S.items).map(function (k) { return S.items[k]; })
    .filter(function (it) { return DICT[it.w.toLowerCase()]; });
}
function dueItems() {
  var now = Date.now();
  return allItems().filter(function (it) { return it.due <= now; });
}
function wrongItems() { return allItems().filter(function (it) { return it.wb; }); }

function senseOf(it) {
  var e = DICT[it.w.toLowerCase()];
  return e ? e.s[it.si] : null;
}
function logAnswer(correct) {
  var d = today();
  if (!S.log[d]) S.log[d] = { a: 0, c: 0 };
  S.log[d].a++;
  if (correct) S.log[d].c++;
}

/* ---------- 3. 例句處理 ---------- */
/* 把 "He {{abandoned}} the plan." 拆成 前段 / 答案 / 後段 */
function splitEx(en) {
  var m = en.match(/\{\{(.+?)\}\}/);
  if (!m) return { pre: en, ans: "", post: "" };
  return { pre: en.slice(0, m.index), ans: m[1], post: en.slice(m.index + m[0].length) };
}
function plainEx(en) { return en.replace(/\{\{(.+?)\}\}/g, "$1"); }
function boldEx(en) { return esc(en).replace(/\{\{(.+?)\}\}/g, "<em>$1</em>"); }

/* 例句要同時能點字查詢，又要把目標字標粗 */
function clickableBold(en) {
  var p = splitEx(en);
  if (!p.ans) return clickable(en);
  return clickable(p.pre) + "<em>" + clickable(p.ans) + "</em>" + clickable(p.post);
}

/* 答完題之後，把這個字所有義項的例句都列出來。
   同一個字在多個情境裡再出現一次，正是情境記憶法要的。 */
function allExamplesHTML(w, curSi, curEx) {
  var e = DICT[String(w).toLowerCase()];
  if (!e) return "";
  var h = '<div class="alleg" id="allEg">';
  e.s.forEach(function (sn, i) {
    h += '<div class="egsense"><div class="eghd">' +
      '<span class="tag gray">' + esc(sn.p) + "</span> " +
      '<span class="zh">' + esc(sn.zh) + "</span></div>";
    sn.ex.forEach(function (x) {
      h += '<div class="eg' + (i === curSi && x === curEx ? " now" : "") + '">' +
        '<div class="en">' + clickableBold(x.en) + "</div>" +
        '<div class="zh">' + esc(x.zh) + "</div></div>";
    });
    h += "</div>";
  });
  return h + "</div>";
}

/* 中文提示預設蓋著，點一下才翻開；作答後自動翻開 */
function revealHint(sn) {
  var el = $("#posZh");
  if (!el || el.className.indexOf("posmask") < 0) return;
  el.className = "";
  el.innerHTML = '<span class="tag">' + esc(sn.p) + "</span> " +
    '<span class="zh">' + esc(sn.zh) + "</span>";
}

/* 把句子切成一個個可以點的單字 */
function clickable(text) {
  return esc(text).split(/([A-Za-z][A-Za-z'-]*)/).map(function (p, i) {
    return i % 2 ? '<span class="tk" data-look="' + p + '">' + p + "</span>" : p;
  }).join("");
}
function norm(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9' -]/g, "").replace(/\s+/g, " ").trim();
}

/* 判斷答案是原形的哪一種變化。
   規則變化（直接加 d/ed/s/es/ing）→ 把字尾標在輸入框旁邊，你只要打字根就算對。
   不規則或字根有變（freeze→froze、study→studied）→ 不幫你打，改成提醒你注意時態。 */
function formInfo(word, ans) {
  var w = String(word).toLowerCase(), a = String(ans).toLowerCase();
  if (a === w) return { suffix: "", tip: "" };
  /* 片語：變化一定在某一個字上，找出那個字來判斷，但不幫忙補字尾
     （整串片語補字尾會變成 "look forward to" + "ing"，沒有意義） */
  if (w.indexOf(" ") > -1) {
    var ws = w.split(" "), as = a.split(" ");
    for (var k = 0; k < Math.min(ws.length, as.length); k++) {
      if (ws[k] !== as[k]) return { suffix: "", tip: formInfo(ws[k], as[k]).tip };
    }
    return { suffix: "", tip: "" };
  }
  var reg = [
    ["d", "過去式／過去分詞"], ["ed", "過去式／過去分詞"],
    ["ing", "現在分詞／動名詞"], ["es", "第三人稱單數／複數"], ["s", "第三人稱單數／複數"]
  ];
  for (var i = 0; i < reg.length; i++) {
    if (a === w + reg[i][0]) return { suffix: reg[i][0], tip: reg[i][1] };
  }
  if (/ing$/.test(a)) return { suffix: "", tip: "現在分詞，注意拼字變化" };
  if (/ied$/.test(a) || /ed$/.test(a)) return { suffix: "", tip: "過去式，注意拼字變化" };
  if (/ies$/.test(a)) return { suffix: "", tip: "複數／單三，注意拼字變化" };
  return { suffix: "", tip: "不規則變化，注意時態" };
}

/* 變化形還原後再查官方詞彙表 */
function officialLemma(w) {
  if (!w || w.indexOf(" ") > -1) return null;
  var c = [];
  if (/ies$/.test(w)) c.push(w.slice(0, -3) + "y");
  if (/ied$/.test(w)) c.push(w.slice(0, -3) + "y");
  if (/es$/.test(w)) c.push(w.slice(0, -2));
  if (/s$/.test(w)) c.push(w.slice(0, -1));
  if (/ed$/.test(w)) { c.push(w.slice(0, -1), w.slice(0, -2)); if (/(.)\1ed$/.test(w)) c.push(w.slice(0, -3)); }
  if (/ing$/.test(w)) { c.push(w.slice(0, -3), w.slice(0, -3) + "e"); if (/(.)\1ing$/.test(w)) c.push(w.slice(0, -4)); }
  if (/ly$/.test(w)) c.push(w.slice(0, -2), w.slice(0, -2) + "e");
  for (var i = 0; i < c.length; i++) if (OFFICIAL[c[i]]) return OFFICIAL[c[i]];
  return null;
}

/* 大考中心《高中英文參考詞彙表》分級標籤 */
function lvTag(e) {
  if (e.ph) return '<span class="lv ph">片語</span>';
  if (e.lv === 0) return '<span class="lv out">表外</span>';
  if (!e.lv) return "";
  return '<span class="lv l' + e.lv + '">' + e.lv + "級</span>";
}
function lvText(e) {
  if (e.ph) return "片語（官方詞彙表不收片語）";
  if (e.lv === 0) return "不在大考中心詞彙表內";
  if (!e.lv) return "";
  return "大考中心第 " + e.lv + " 級";
}

/* ---------- 4. 頁面切換 ---------- */
var VIEWS = {
  drill: { t: "練習", r: drawDrill },
  plan: { t: "每日課表", r: drawPlan },
  find: { t: "查單字", r: drawFind },
  mine: { t: "我的字", r: drawMine },
  wrong: { t: "錯題本", r: drawWrong },
  set: { t: "設定", r: drawSet }
};
var cur = "drill";

function go(v) {
  cur = v;
  document.querySelectorAll(".view").forEach(function (s) { s.classList.remove("on"); });
  $("#v-" + v).classList.add("on");
  document.querySelectorAll("#nav button").forEach(function (b) {
    b.classList.toggle("on", b.dataset.v === v);
  });
  $("#title").textContent = VIEWS[v].t;
  window.scrollTo(0, 0);
  refreshHeader();
  VIEWS[v].r();
}
$("#nav").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-v]");
  if (b) go(b.dataset.v);
});

function refreshHeader() {
  var l = S.log[today()] || { a: 0, c: 0 };
  var d = dueItems().length;
  $("#daily").textContent = "今日 " + l.a + " 題・待複習 " + d;
  var nb = $("#nav").querySelector('button[data-v="wrong"]');
  var old = nb.querySelector(".badge");
  if (old) old.remove();
  var n = wrongItems().length;
  if (n) {
    var s = document.createElement("span");
    s.className = "badge"; s.textContent = n > 99 ? "99+" : n;
    nb.appendChild(s);
  }
}

/* ============================================================
   練習
   ============================================================ */
var queue = [], qTotal = 0, qCur = null, answered = false, hinted = 0, drillMode = "normal";

/* 一般練習「不含」錯題本裡的字——錯題有自己獨立的一輪，
   混在一起會讓你在同一輪反覆撞同一個不會的字，很挫折也沒效率。 */
function normalDue() { return dueItems().filter(function (i) { return !i.wb; }); }

function buildQueue(mode) {
  drillMode = mode || "normal";
  var list;
  if (drillMode === "wrong") list = shuffle(wrongItems().slice());
  else if (drillMode === "extra") list = shuffle(allItems().filter(function (i) { return !i.wb; }));
  else list = shuffle(normalDue());
  queue = list;
  qTotal = queue.length;
}

/* ============================================================
   每日自動補新字

   課表本來就把整個字庫排成一天一組了（見 planUnits／dayGroups），
   但要用得先切到「課表」、找出今天該吃哪一組、再按加入。
   這裡把那件事收斂成一個動作：照同樣的順序，把今天缺的額度補滿。

   「今天補了幾個」單獨記在 S.auto[日期]，不跟手動加入的混在一起，
   這樣手動多加幾個字不會害今天的自動額度被吃掉。
   ============================================================ */
function loadedToday() { return (S.auto || {})[today()] || 0; }
function autoLoadOn() { return !!S.autoLoad; }

/* 照課表順序挑出接下來 n 個還沒進清單的字義。
   跳過快篩標記「我早就會了」的字，那是使用者明確說不用練的。 */
function nextNewUnits(n) {
  var out = [], us = planUnits();
  for (var i = 0; i < us.length && out.length < n; i++) {
    var u = us[i];
    if (S.known[u.w] || hasItem(u.w, u.si)) continue;
    out.push(u);
  }
  return out;
}

/* 把今天還沒補足的新字加進清單，回傳實際加入的數量 */
function loadTodayNew() {
  var need = perDay() - loadedToday();
  if (need <= 0) return 0;
  var picked = nextNewUnits(need);
  picked.forEach(function (u) { addItem(u.w, u.si); });
  if (picked.length) {
    S.auto = S.auto || {};
    S.auto[today()] = loadedToday() + picked.length;
    queue = [];
    save();
  }
  return picked.length;
}

function drawDrill() {
  var el = $("#v-drill");
  /* 開自動的話，進練習頁就先把今天的份補上。
     loadedToday() 會擋住重複執行，所以切頁切來切去也只會補一次。 */
  if (autoLoadOn()) loadTodayNew();
  if (!allItems().length) {
    var canLoad = nextNewUnits(1).length;
    el.innerHTML =
      '<div class="empty"><span class="big">📖</span>' +
      "你的練習清單還是空的。<br>" +
      (canLoad ? "按下面那顆按鈕就會照課表順序載入今天的份。" : "字庫裡的字都排完了。") +
      "</div>" +
      (canLoad
        ? '<button class="btn" id="btnFirstLoad">載入今天的新字（' + perDay() + " 個字義）</button>" +
          '<p style="font-size:13px;color:var(--sub);margin:9px 4px 14px;line-height:1.7">' +
          "想每天自動載入、不用手動按，到「課表」把<b>每天自動載入</b>打開。</p>"
        : "") +
      '<div class="row"><button class="btn ghost" id="goPlan">去看課表</button>' +
      '<button class="btn ghost" id="goFind">自己查單字</button></div>';
    var bf = $("#btnFirstLoad");
    if (bf) bf.onclick = function () {
      var n = loadTodayNew();
      toast(n ? "已載入 " + n + " 個新字義" : "沒有可以載入的新字了");
      refreshHeader(); drawDrill();
    };
    $("#goPlan").onclick = function () { go("plan"); };
    $("#goFind").onclick = function () { go("find"); };
    return;
  }
  if (!queue.length) { drawDrillStart(el); return; }
  qCur = queue[0]; answered = false; hinted = 0;
  renderCard();
}

/* 未來七天各有幾個字到期，讓你提前看到複習量會不會爆掉 */
function loadForecast() {
  var now = Date.now(), start = new Date(); start.setHours(0, 0, 0, 0);
  var days = [0, 0, 0, 0, 0, 0, 0], overdue = 0;
  allItems().forEach(function (it) {
    if (it.due <= now) { overdue++; return; }
    var d = Math.floor((it.due - start.getTime()) / DAY);
    if (d >= 0 && d < 7) days[d]++;
  });
  var max = Math.max.apply(null, days.concat([overdue, 1]));
  var names = ["今天", "明天", "後天", "第4天", "第5天", "第6天", "第7天"];
  var rows = days.map(function (n, i) {
    var total = i === 0 ? n + overdue : n;
    return '<div style="display:flex;align-items:center;gap:9px;margin-bottom:6px">' +
      '<span style="width:44px;font-size:12px;color:var(--sub)">' + names[i] + "</span>" +
      '<span class="bar" style="flex:1;margin:0"><i style="width:' +
      Math.round(total / max * 100) + '%"></i></span>' +
      '<span style="width:34px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums">' +
      total + "</span></div>";
  }).join("");
  var week = days.reduce(function (a, b) { return a + b; }, 0) + overdue;
  return rows + '<p style="font-size:13px;color:var(--sub);margin:10px 4px 0;line-height:1.7">' +
    "七天內共 <b>" + week + "</b> 題。抓一題 12 秒，大約是 " +
    Math.max(1, Math.round(week * 12 / 60)) + " 分鐘。<br>" +
    "覺得太多就到「課表」把每天的新字數調低——<b>新字數是唯一能控制複習量的閥門</b>。</p>";
}

/* 練習頁最上面那塊「今天的新字」。
   開了自動就只回報結果，沒開就給一顆按鈕，兩種情況都不必再切去課表。 */
function todayNewHTML() {
  var done = loadedToday(), quota = perDay(), left = quota - done;
  var pool = nextNewUnits(left > 0 ? left : 1).length;

  if (!pool) {
    return '<h2 class="sec">今天的新字</h2>' +
      '<div class="empty" style="padding:20px 8px">' +
      "字庫裡已編好例句的字都排進清單了 🎉<br>" +
      '<span style="font-size:13px">叫 Claude 再補一批，或先把現有的複習到熟。</span></div>';
  }
  if (left <= 0) {
    return '<h2 class="sec">今天的新字</h2>' +
      '<div class="empty" style="padding:20px 8px">' +
      "今天的 <b>" + done + "</b> 個新字義已經載入了。<br>" +
      '<span style="font-size:13px">想多學就按下面的「再多load一組」。</span></div>' +
      '<button class="btn ghost" id="btnMoreNew">再載入 ' + quota + " 個新字義</button>";
  }
  return '<h2 class="sec">今天的新字</h2>' +
    '<button class="btn" id="btnLoadNew">載入今天的新字（' + left + " 個字義）</button>" +
    '<p style="font-size:13px;color:var(--sub);margin:9px 4px 0;line-height:1.7">' +
    "照課表的順序自動挑，快篩標記「已經會了」的字會跳過。<br>" +
    "不想每天按的話，到「課表」把<b>每天自動載入</b>打開。</p>";
}

/* 開始畫面：一般練習與錯題練習分開兩個入口 */
function drawDrillStart(el) {
  var due = normalDue().length, wrong = wrongItems().length, all = allItems().length;
  var doneToday = (S.log[today()] || { a: 0 }).a;
  var quota = perDay();

  var nxt = allItems().sort(function (a, b) { return a.due - b.due; })[0];
  var wait = nxt ? Math.max(0, nxt.due - Date.now()) : 0;
  var waitTxt = wait < 60000 ? "馬上"
    : wait < 3600000 ? Math.ceil(wait / 60000) + " 分鐘後"
    : wait < DAY ? Math.ceil(wait / 3600000) + " 小時後"
    : Math.ceil(wait / DAY) + " 天後";

  el.innerHTML =
    '<div class="plan-head">' +
    '<div class="big">' + doneToday + ' <span style="font-size:15px;color:var(--sub);font-weight:500">題／今天</span></div>' +
    '<div class="bar"><i style="width:' + Math.min(100, Math.round(doneToday / quota * 100)) + '%"></i></div>' +
    '<div class="cap">' +
    (doneToday >= quota
      ? "已達成今天設定的最低額度（" + quota + " 題），想繼續練隨時都可以。"
      : "今天的最低額度是 " + quota + " 題，還差 " + (quota - doneToday) + " 題。") +
    "</div></div>" +

    /* 把清單的去向攤開來。不然你會看到「清單有 132 個字」
       但一般練習只剩 9 個，以為字不見了。 */
    '<div class="plan-head"><div class="cap" style="line-height:1.9">' +
    "<b>清單裡的 " + all + " 個字義現在在哪</b><br>" +
    "・<b>" + due + "</b> 個到期，可以現在練<br>" +
    "・<b>" + wrong + "</b> 個在錯題本（不混進一般練習）<br>" +
    "・<b>" + (all - due - wrong) + "</b> 個還沒到複習時間，最近一批 " + waitTxt +
    "</div></div>" +

    todayNewHTML() +

    '<h2 class="sec">一般練習</h2>' +
    (due
      ? '<button class="btn" id="btnNormal">開始（' + due + " 個字到期）</button>"
      : '<div class="empty" style="padding:20px 8px">到期的字都複習完了，下一批 <b>' + waitTxt + "</b> 到期。</div>") +

    '<h2 class="sec">錯題練習（獨立計算）</h2>' +
    (wrong
      ? '<button class="btn bad" id="btnWrongDrill">只練錯題（' + wrong + " 個字）</button>" +
        '<p style="font-size:13px;color:var(--sub);margin:9px 4px 0;line-height:1.7">' +
        "錯題不會混進一般練習。在這裡答對一次就會移出錯題本。</p>"
      : '<div class="empty" style="padding:20px 8px">錯題本是空的 🎉</div>') +

    '<h2 class="sec">還想多練</h2>' +
    '<button class="btn ghost" id="btnExtra">從清單裡隨機加練（共 ' + all + " 個字）</button>" +

    '<h2 class="sec">快篩（把已經會的字先篩掉）</h2>' +
    '<p style="font-size:13px;color:var(--sub);margin:0 4px 10px;line-height:1.75">' +
    "第 1、2 級大多是國中就會的字，用完整的拼字練習去篩太浪費時間。" +
    "這裡只問你「會不會」，會的直接跳過、永遠不排進練習，" +
    "<b>不會的才整個字加進清單</b>。已篩掉 <b>" + Object.keys(S.known).length + "</b> 個字。</p>" +
    scrButtons() +

    '<h2 class="sec">未來七天的複習量</h2>' + loadForecast();

  var bLoad = $("#btnLoadNew"), bMore = $("#btnMoreNew");
  if (bLoad) bLoad.onclick = function () {
    var n = loadTodayNew();
    toast(n ? "已載入 " + n + " 個新字義" : "沒有可以載入的新字了");
    refreshHeader(); drawDrill();
  };
  if (bMore) bMore.onclick = function () {
    /* 再來一組：把今天的計數往前推一個額度，等於「多吃一天的份」 */
    var extra = nextNewUnits(perDay());
    extra.forEach(function (u) { addItem(u.w, u.si); });
    if (extra.length) {
      S.auto = S.auto || {};
      S.auto[today()] = loadedToday() + extra.length;
      queue = []; save();
    }
    toast(extra.length ? "又載入 " + extra.length + " 個新字義" : "沒有可以載入的新字了");
    refreshHeader(); drawDrill();
  };

  if (due) $("#btnNormal").onclick = function () { buildQueue("normal"); drawDrill(); };
  if (wrong) $("#btnWrongDrill").onclick = function () { buildQueue("wrong"); drawDrill(); };
  $("#btnExtra").onclick = function () { buildQueue("extra"); drawDrill(); };
  el.querySelectorAll("[data-scr]").forEach(function (b) {
    b.onclick = function () { startScreen(+b.dataset.scr); };
  });
}

/* 各級還剩幾個字沒篩也沒加入清單 */
function scrButtons() {
  var html = "", any = false;
  for (var lv = 1; lv <= 6; lv++) {
    var n = screenPool(lv).length;
    if (!n) continue;
    any = true;
    html += '<button class="btn ghost sm" data-scr="' + lv + '" ' +
      'style="margin:0 8px 8px 0">第 ' + lv + " 級（" + n + "）</button>";
  }
  return any ? '<div>' + html + "</div>"
             : '<div class="empty" style="padding:20px 8px">所有字都篩過了 🎉</div>';
}

function renderCard() {
  var it = qCur, sn = senseOf(it);
  if (!sn || !sn.ex.length) { queue.shift(); drawDrill(); return; }
  var ex = sn.ex[it.seen % sn.ex.length];
  var p = splitEx(ex.en);
  var fi = formInfo(it.w, p.ans);
  var done = qTotal - queue.length + 1;
  var dots = "";
  for (var i = 1; i <= MAXBOX; i++) dots += "<i" + (i <= it.box ? ' class="f"' : "") + "></i>";

  $("#v-drill").innerHTML =
    '<div class="card">' +
    '<div class="qmeta"><span>' +
    (drillMode === "wrong" ? '<span class="lv out">錯題</span> ' : "") +
    "第 " + done + " / " + qTotal + " 題</span>" +
    '<span class="dots" title="熟練度">' + dots + "</span></div>" +
    '<p class="zhline">' + esc(ex.zh) + "</p>" +
    '<p class="enline" id="enLine">' + clickable(p.pre) +
    '<span class="blank" id="blank">' + "_".repeat(Math.min(p.ans.replace(/\s/g, "").length, 12)) + "</span>" +
    clickable(p.post) + "</p>" +
    '<div class="hintbar">' +
    '<span class="posmask" id="posZh">詞性與中文（點一下顯示）<span class="kbd">Shift</span></span>' +
    (fi.tip ? '<span class="tag gray">' + esc(fi.tip) + "</span>" : "") + "</div>" +
    '<div class="inwrap">' +
    '<input id="ansIn" placeholder="在這裡拼出單字" autocomplete="off" autocorrect="off" ' +
    'autocapitalize="none" spellcheck="false" enterkeyhint="done">' +
    (fi.suffix ? '<span class="sfx">' + esc(fi.suffix) + "</span>" : "") + "</div>" +
    '<div class="row" style="margin-top:12px">' +
    '<button class="btn" id="btnGo">送出</button></div>' +
    '<div class="row" style="margin-top:9px" id="rowAid">' +
    '<button class="btn ghost" id="btnHint">提示</button>' +
    '<button class="btn ghost" id="btnGiveUp">不會<span class="kbd">Alt</span></button></div>' +
    '<div id="fb"></div>' +
    '<div style="text-align:center;margin-top:14px" id="rowSkip">' +
    '<button class="minilink" id="btnKnow">這個我早就會了，不用再排複習</button></div>' +
    '<div style="text-align:center;margin-top:10px">' +
    '<button class="minilink" id="btnBad">這句怪怪的，回報給 Claude</button></div>' +
    "</div>";

  $("#btnGo").onclick = function () { submit(); };
  $("#btnHint").onclick = giveHint;
  $("#btnGiveUp").onclick = giveUp;
  $("#btnKnow").onclick = alreadyKnow;
  $("#btnBad").onclick = reportBad;
  $("#ansIn").addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    /* 一定要擋下冒泡：不然這個事件會再傳到 document 上的全域監聽，
       那裡看到 answered 已經被這次 submit() 設成 true，就會再跳一次 next()，
       等於按一下 Enter 直接略過答案畫面衝到下一題。 */
    e.stopPropagation();
    submit();
  });
  $("#posZh").onclick = function () { revealHint(sn); };
  $("#enLine").addEventListener("click", onTokenClick);
  refreshHeader();
}

/* 提示規則：
   單字 → 最多只給前兩個字母
   片語 → 給每一個字的開頭字母（因為片語難在「是哪幾個字」，不是拼字） */
function maxHint() {
  var sn = senseOf(qCur);
  var ans = splitEx(sn.ex[qCur.seen % sn.ex.length].en).ans;
  return ans.indexOf(" ") > -1 ? 1 : 2;
}

function giveHint() {
  var sn = senseOf(qCur);
  var ans = splitEx(sn.ex[qCur.seen % sn.ex.length].en).ans;
  var isPhrase = ans.indexOf(" ") > -1;
  hinted = Math.min(hinted + 1, maxHint());

  var masked;
  if (isPhrase) {
    masked = ans.split(" ").map(function (w) {
      return w.charAt(0) + "_".repeat(Math.max(w.length - 1, 0));
    }).join(" ");
    toast("提示：共 " + ans.split(" ").length + " 個字，這是每個字的開頭");
  } else {
    masked = ans.split("").map(function (ch, i) {
      return (i < hinted || ch === "-") ? ch : "_";
    }).join("");
    toast(hinted === 1
      ? "提示：共 " + ans.length + " 個字母，開頭是 " + ans.charAt(0)
      : "再給一個字母，提示到這裡為止");
  }
  $("#blank").textContent = masked;
  $("#blank").style.letterSpacing = ".1em";
  if (hinted >= maxHint()) {
    $("#btnHint").disabled = true;
    $("#btnHint").style.opacity = ".45";
  }
}

/* 「不會」＝直接認輸看答案，等同答錯：熟練度歸零並進錯題本 */
function giveUp() {
  if (answered) return;
  $("#ansIn").value = "";
  submit(true);
}

/* 「我早就會了」＝把熟練度直接推到接近滿級，只留一次很久以後的抽查。
   每天七十個字時，簡單字如果照normal排程走，會吃掉大半練習時間。 */
function alreadyKnow() {
  if (answered) return;
  var it = qCur;
  it.box = MAXBOX - 1;
  it.due = Date.now() + INT[it.box];
  it.st = 2; it.wb = false;
  save();
  toast(it.w + " 已跳過，" + Math.round(INT[it.box] / DAY) + " 天後才會再抽查一次");
  queue.shift(); qTotal--;
  refreshHeader();
  if (!queue.length) { drawDrill(); return; }
  qCur = queue[0]; answered = false; hinted = 0;
  renderCard();
}

/* ============================================================
   快篩：第 1、2 級大多是國中就會的字，用完整的拼字練習去篩太浪費。
   這裡只問「這個字你會不會」，會的直接標記起來、永遠不進練習清單。
   ============================================================ */
var scrQueue = [], scrTotal = 0;

function screenPool(lv) {
  return BANK.filter(function (e) {
    if (e.ph || (e.lv || 9) !== lv) return false;
    if (S.known[e.w]) return false;
    return !e.s.some(function (sn, i) { return hasItem(e.w, i); });
  });
}

function startScreen(lv) {
  scrQueue = shuffle(screenPool(lv));
  scrTotal = scrQueue.length;
  if (!scrTotal) { toast("第 " + lv + " 級沒有可篩的字了"); return; }
  drillMode = "screen";
  renderScreenCard();
}

function renderScreenCard() {
  if (!scrQueue.length) {
    drillMode = "normal";
    toast("這一級篩完了");
    drawDrill();
    return;
  }
  var e = scrQueue[0], done = scrTotal - scrQueue.length + 1;
  var zh = e.s.map(function (sn) { return sn.p + " " + sn.zh; }).join("　");

  $("#v-drill").innerHTML =
    '<div class="card">' +
    '<div class="qmeta"><span>' + lvTag(e) + " 快篩 " + done + " / " + scrTotal + "</span>" +
    '<span>已篩掉 ' + Object.keys(S.known).length + " 個</span></div>" +
    '<p style="font-size:31px;font-weight:700;text-align:center;margin:14px 0 18px;' +
    'letter-spacing:.01em">' + esc(e.w) + "</p>" +
    '<p class="zhline masked" id="scrZh">想不出來？點一下看中文</p>' +
    '<div class="row" style="margin-top:18px">' +
    '<button class="btn ghost" id="scrKnow">我會，跳過</button>' +
    '<button class="btn" id="scrLearn">不會，加入練習</button></div>' +
    '<div style="text-align:center;margin-top:14px">' +
    '<button class="minilink" id="scrQuit">結束快篩</button></div>' +
    "</div>";

  $("#scrZh").onclick = function () {
    this.className = "zhline"; this.textContent = zh;
  };
  $("#scrKnow").onclick = function () {
    S.known[e.w] = 1; save(); scrQueue.shift(); renderScreenCard();
  };
  $("#scrLearn").onclick = function () {
    e.s.forEach(function (sn, i) { addItem(e.w, i); });
    scrQueue.shift(); refreshHeader(); renderScreenCard();
  };
  $("#scrQuit").onclick = function () {
    drillMode = "normal"; scrQueue = []; drawDrill();
  };
  refreshHeader();
}

function submit(gaveUp) {
  if (answered) { next(); return; }
  var it = qCur, sn = senseOf(it);
  var ex = sn.ex[it.seen % sn.ex.length];
  var ans = splitEx(ex.en).ans;
  var input = $("#ansIn").value;
  if (!gaveUp && !norm(input)) { $("#ansIn").focus(); return; }

  answered = true;
  /* 字尾已經幫你標在框旁邊了，所以打字根或打完整形都算對 */
  var fi = formInfo(it.w, ans);
  var ok = !gaveUp && (norm(input) === norm(ans) ||
    (!!fi.suffix && norm(input + fi.suffix) === norm(ans)));
  it.seen++;
  logAnswer(ok);

  if (ok) {
    it.right++; it.st++;
    if (hinted === 0) {
      /* 第一次看到就答對，代表這個字你本來就會 —— 直接跳三級，
         不要浪費你的時間陪它從頭走一次完整的間隔重複。 */
      var jump = (it.seen === 1 && it.wrong === 0) ? 3 : 1;
      it.box = Math.min(it.box + jump, MAXBOX);
    }
    /* 答對一次就移出錯題本。原本要連續兩次，但那會讓錯題本一直積著，
       而且同一個字在一般練習答對了卻還掛在錯題本，看起來像壞掉。 */
    it.wb = false;
    it.due = Date.now() + INT[it.box];
  } else {
    it.wrong++; it.st = 0; it.wb = true;
    /* 答錯退兩級，不打回原點。
       FSRS 與 Anki 的 relearning steps 都不是全歸零：全歸零會讓一個
       已經複習到 60 天間隔的字重走整條階梯，每日複習量因此暴增。
       退兩級 ＋ 10 分鐘後重考，等於「這次答對就回到大約一半的間隔」。 */
    it.box = Math.max(0, it.box - 2);
    it.due = Date.now() + INT[1];
  }
  save();

  $("#ansIn").className = ok ? "ok" : "bad";
  $("#ansIn").blur();
  $("#blank").textContent = ans;
  $("#blank").className = "blank rev";
  $("#rowAid").style.display = "none";
  $("#rowSkip").style.display = "none";
  $("#btnGo").textContent = queue.length > 1 ? "下一題" : "完成";
  $("#btnGo").className = "btn " + (ok ? "ok" : "");

  $("#fb").innerHTML =
    '<div class="fb ' + (ok ? "ok" : "bad") + '">' +
    (ok ? "✓ 答對了"
        : (gaveUp ? "答案是 <b>" + esc(ans) + "</b>，已放進錯題本"
                  : "✗ 正確答案是 <b>" + esc(ans) + "</b>")) +
    "</div>" + allExamplesHTML(it.w, it.si, ex);
  revealHint(sn);
  var egBox = $("#allEg");
  if (egBox) egBox.addEventListener("click", onTokenClick);

  // 一般練習答錯就交給錯題本處理，不在本回合重複糾纏；
  // 錯題練習模式才把它留在尾巴再考一次。
  if (!ok && drillMode === "wrong") { queue.push(it); qTotal++; }
  refreshHeader();
}

function next() {
  queue.shift();
  if (!queue.length) { drawDrill(); return; }
  qCur = queue[0]; answered = false; hinted = 0;
  renderCard();
}

function reportBad() {
  var sn = senseOf(qCur);
  var ex = sn.ex[qCur.seen % sn.ex.length];
  S.bad.push({ w: qCur.w, p: sn.p, en: plainEx(ex.en), zh: ex.zh });
  save();
  toast("已記下，到「設定」可以一次複製給 Claude 修");
}

/* ---------- 句子裡的字：點一下就查 ---------- */
function onTokenClick(e) {
  var t = e.target.closest("[data-look]");
  if (t) openWord(t.dataset.look);
}

/* ============================================================
   底部彈出視窗
   ============================================================ */
function openSheet(html) {
  $("#sheetBody").innerHTML = html;
  $("#sheetBg").classList.add("on");
  setTimeout(function () { $("#sheet").classList.add("on"); }, 10);
}
function closeSheet() {
  $("#sheet").classList.remove("on");
  $("#sheetBg").classList.remove("on");
}
$("#sheetBg").onclick = closeSheet;

function openWord(raw) {
  var e = lookup(raw);
  if (!e) {
    var w = String(raw).toLowerCase().replace(/[^a-z' -]/g, "").replace(/\s+/g, " ").trim();
    var off = OFFICIAL[w] || officialLemma(w);
    openSheet(
      "<h3>" + esc(raw) + "</h3>" +
      (off
        ? '<div class="sub">大考中心第 ' + off.lv + " 級・官方詞性 " + esc(off.pos) +
          "</div>" +
          '<p style="font-size:14px;line-height:1.8;margin:0 0 16px">' +
          "這個字<b>在學測範圍內</b>，但還沒有編寫中文釋義與例句，所以還不能練習。</p>"
        : '<div class="sub">字庫裡沒有，官方詞彙表裡也查不到</div>') +
      '<button class="btn" id="btnTodo">加入待補清單</button>' +
      '<p style="font-size:13px;color:var(--sub);margin-top:14px;line-height:1.7">' +
      "待補清單累積之後，到「設定」複製一段話貼給 Claude Code，它就會把這些字寫進字庫。</p>"
    );
    $("#btnTodo").onclick = function () {
      if (S.todo.indexOf(w) < 0) S.todo.push(w);
      save(); closeSheet(); toast("已加入待查清單");
    };
    return;
  }
  openSheet(
    "<h3>" + esc(e.w) + "</h3>" +
    '<div class="sub">' + lvText(e) + "・共 " + e.s.length + " 個意思，選你想練的加入</div>" +
    e.s.map(function (sn, i) { return senseHTML(e, sn, i); }).join("")
  );
  bindAdd(e);
}

function senseHTML(e, sn, i) {
  var on = hasItem(e.w, i);
  return '<div class="sense">' +
    '<div class="top"><div>' +
    '<span class="tag gray">' + esc(sn.p) + "</span> " +
    '<span class="zh">' + esc(sn.zh) + "</span></div>" +
    '<button class="addbtn' + (on ? " done" : "") + '" data-add="' + i + '">' +
    (on ? "已加入" : "＋ 加入") + "</button></div>" +
    (sn.ex[0] ? '<div class="ex">' + boldEx(sn.ex[0].en) + "<br>" + esc(sn.ex[0].zh) + "</div>" : "") +
    "</div>";
}

function bindAdd(e) {
  $("#sheetBody").querySelectorAll("[data-add]").forEach(function (b) {
    b.onclick = function () {
      var i = +b.dataset.add;
      if (hasItem(e.w, i)) {
        delItem(e.w, i);
        b.className = "addbtn"; b.textContent = "＋ 加入";
        toast("已從清單移除");
      } else {
        addItem(e.w, i);
        b.className = "addbtn done"; b.textContent = "已加入";
        toast("已加入練習清單");
      }
      refreshHeader();
      if (cur === "mine") drawMine();
    };
  });
}

/* ============================================================
   每日課表：把字庫依「分級 → 字母」切成一天一組
   ============================================================ */
function perDay() { return S.perDay || 15; }

function mixOn() { return S.mixLevels !== false; }

/* 課表的單位是「字義」而不是「單字」。
   42% 的字有兩個以上的意思（claim 有 4 個、account 有 3 個），
   如果一個字只排第一個意思，那 260 個義項永遠不會被練到。
   所以「每天 62 個」指的是 62 個字義。同一個字的不同意思會排在一起。 */
function planUnits() {
  var units = [];
  BANK.filter(function (e) { return !e.ph; }).forEach(function (e) {
    e.s.forEach(function (sn, i) {
      units.push({ w: e.w, si: i, lv: e.lv || 9, e: e, sn: sn });
    });
  });

  var ord = function (a, b) {
    return a.w < b.w ? -1 : a.w > b.w ? 1 : a.si - b.si;
  };
  if (!mixOn()) {
    return units.sort(function (a, b) { return a.lv - b.lv || ord(a, b); });
  }

  /* 依分級分堆，每次挑「最落後於自己應有比例」的那一堆，
     讓每一天的分級組成都貼近整體比例（交錯練習）。 */
  var buckets = {};
  units.forEach(function (u) { (buckets[u.lv] = buckets[u.lv] || []).push(u); });
  var keys = Object.keys(buckets).sort(function (a, b) { return a - b; });
  keys.forEach(function (k) { buckets[k].sort(ord); });

  var total = units.length, out = [], idx = {};
  keys.forEach(function (k) { idx[k] = 0; });
  while (out.length < total) {
    var best = null, bestGap = -Infinity;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (idx[k] >= buckets[k].length) continue;
      var gap = (out.length + 1) * buckets[k].length / total - idx[k];
      if (gap > bestGap) { bestGap = gap; best = k; }
    }
    out.push(buckets[best][idx[best]++]);
  }
  return out;
}
function unitCount() { return planUnits().length; }

function dayGroups() {
  var us = planUnits(), n = perDay(), g = [];
  for (var i = 0; i < us.length; i += n) g.push(us.slice(i, i + n));
  return g;
}
function dayStat(group) {
  var added = 0, mastered = 0;
  group.forEach(function (u) {
    var it = S.items[idOf(u.w, u.si)];
    if (it) { added++; if (it.box >= 5) mastered++; }
  });
  return { added: added, mastered: mastered, total: group.length };
}

var openDay = -1;

/* 考試日規劃：算出「要在考前 7 天把新字上完」需要每天學幾個，
   並且誠實告訴你目前的設定夠不夠、字庫寫得夠不夠快。 */
/* 日期輸入框本身不能跟著重畫，否則你還沒選完它就被砍掉重建，
   會變成「改不動」。所以輸入框固定在外面，只有下面的資訊區塊會更新。 */
function examPlan(written) {
  return '<div style="font-size:13px;color:var(--sub);margin:0 4px 6px">考試日期</div>' +
    '<input class="num" id="examDate" type="date" value="' + esc(S.examDate || "") + '">' +
    '<div style="font-size:13px;color:var(--sub);margin:12px 4px 6px">新字要在哪天學完</div>' +
    '<input class="num" id="learnEnd" type="date" value="' + esc(S.learnEndDate || "") + '">' +
    '<div id="examInfo">' + examInfoHTML(written) + "</div>";
}

/* 距離某個日期還有幾天（今天算 0） */
function daysTo(dateStr) {
  if (!dateStr) return null;
  var t = new Date(dateStr + "T00:00:00").getTime();
  if (isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / DAY);
}

function examInfoHTML(written) {
  var msg = function (t) {
    return '<p style="font-size:13px;color:var(--sub);margin:10px 4px 0;line-height:1.7">' + t + "</p>";
  };
  if (!S.examDate) {
    return msg("先填<b>實際考試日期</b>（學測是 2027/01/22）。<br>" +
      "不要填「100 天後」那種推算過的日期，倒數和分段都會算錯。");
  }
  var left = daysTo(S.examDate);
  if (left === null || left <= 0) return msg("考試日已過或格式不對，改個日期吧。");

  if (!S.learnEndDate) {
    return msg("距離考試還有 <b>" + left + " 天</b>。<br>" +
      "再填<b>新字要在哪天學完</b>，那天到考試日之間就是你的鞏固期——" +
      "鞏固期不上新字，只把學過的複習到熟。<br>" +
      "填好之後我會反推每天要學幾個字義才來得及。");
  }
  var learnDays = daysTo(S.learnEndDate);
  if (learnDays === null) return msg("學完日格式不對。");
  if (learnDays <= 0) return msg("學完日已經過了，表示你現在就該進入鞏固期，或把日期往後調。");
  if (learnDays >= left) {
    return msg("⚠ 學完日必須<b>早於</b>考試日，中間那段才是鞏固期。現在等於完全沒有鞏固期。");
  }
  var consolidate = left - learnDays;

  /* 單位一律用「字義」，跟課表一致。
     官方 6114 個字還沒編寫的部分，用目前的平均義項數推估。 */
  var units = unitCount();
  var perWord = units / Math.max(written, 1);
  var startedUnits = Object.keys(S.items).length;
  var remainWritten = Math.max(0, units - startedUnits);
  var remainAll = Math.max(0, Math.round(OFF_COUNT * perWord) - startedUnits);
  var needWritten = Math.ceil(remainWritten / learnDays);
  var needAll = Math.ceil(remainAll / learnDays);
  var enough = perDay() >= needAll;

  return '<p style="font-size:14px;line-height:1.9;margin:12px 4px 0">' +
    "距離考試還有 <b>" + left + " 天</b>：學習期 <b>" + learnDays +
    " 天</b>，之後鞏固期 <b>" + consolidate + " 天</b><br>" +
    '<span style="color:var(--sub);font-size:13px">以下都以「字義」計算，' +
    "因為 42% 的字有兩個以上的意思，一個字平均 " + perWord.toFixed(1) + " 個字義。</span><br>" +
    "把<b>已編好例句的</b>全部吃完 → 每天 <b>" + needWritten + "</b> 個字義<br>" +
    "把<b>官方 " + OFF_COUNT + " 個字</b>全部吃完 → 每天 <b>" + needAll + "</b> 個字義" +
    "，預估每天要做 <b>" + Math.round(needAll * 6.6) + "</b> 題、約 <b>" +
    Math.round(needAll * 6.6 * 12 / 60) + "</b> 分鐘</p>" +
    '<p style="font-size:13px;margin:10px 4px 0;line-height:1.7;color:' +
    (enough ? "var(--ok)" : "var(--bad)") + '">' +
    (enough
      ? "✓ 你目前設定每天 " + perDay() + " 個字義，來得及。"
      : "⚠ 你目前設定每天 " + perDay() + " 個字義，照這個速度到考前只能學完 " +
        (perDay() * learnDays + startedUnits) + " 個字義（目標 " +
        Math.round(OFF_COUNT * perWord) + "）。") +
    "</p>" +
    '<button class="btn ghost sm" id="btnSprint" style="width:100%;margin-top:12px">' +
    "啟動考前總複習（把所有字重排進最後 " + Math.min(10, left) + " 天）</button>" +
    '<p style="font-size:13px;color:var(--sub);margin:8px 4px 0;line-height:1.7">' +
    "考前十天按這個。它會把清單裡<b>每一個字</b>平均分散到剩下的日子重考一次，" +
    "避免有些字最後一次複習停在兩個月前就進考場。</p>";
}

/* 三階段讀書計畫。分界完全由你填的兩個日期決定，沒有寫死的數字：
   今天 → 學完日 = 學習期；學完日 → 考前 10 天 = 鞏固期；最後 10 天 = 總複習。 */
function phasePlan(written) {
  if (!S.examDate || !S.learnEndDate) return "";
  var left = daysTo(S.examDate), learnDays = daysTo(S.learnEndDate);
  if (left === null || left <= 0 || learnDays === null || learnDays >= left) return "";

  var SPRINT = Math.min(10, left);
  var CONSOLIDATE = left - learnDays;          // 由你的學完日算出來
  var phases = [
    { n: "學習期", d: "每天上新字，同時消化到期的複習。這段最重。",
      from: CONSOLIDATE, to: 1e9 },
    { n: "鞏固期", d: "停止上新字，只做複習。負擔會明顯下降，讓每個字走完整個間隔週期。",
      from: SPRINT, to: CONSOLIDATE },
    { n: "考前總複習", d: "按上面那顆按鈕，把所有字重排一次，確保沒有字是兩個月前複習的。",
      from: 0, to: SPRINT }
  ];
  var cur = phases.filter(function (p) { return left > p.from && left <= p.to; })[0] || phases[0];

  var rows = phases.map(function (p) {
    var on = p === cur;
    var range = p.to > 1e8 ? "今天起 " + (left - CONSOLIDATE) + " 天"
      : (p.to - p.from) + " 天（考前 " + p.to + "～" + (p.from + 1) + " 天）";
    return '<div class="day' + (on ? " done open" : "") + '" style="cursor:default">' +
      '<div class="top"><span class="n">' + p.n + (on ? "　← 你在這裡" : "") + "</span>" +
      '<span class="st">' + range + "</span></div>" +
      '<div class="words" style="display:block">' + p.d + "</div></div>";
  }).join("");

  var ladder = INT.slice(1).map(function (v) {
    return v < DAY ? Math.round(v / 60000) + " 分" : Math.round(v / DAY) + " 天";
  }).join(" → ");

  var short = OFF_COUNT - written;
  return '<h2 class="sec">讀書計畫（依你填的兩個日期分段）</h2>' + rows +
    '<div class="plan-head" style="margin-top:14px">' +
    '<div class="cap" style="line-height:1.9">' +
    "<b>答對後的複習間隔</b><br>" + ladder + "<br><br>" +
    "中段之所以跳這麼開，是因為研究顯示最佳間隔取決於你要記多久：" +
    "目標 70 天與 350 天時，最佳間隔都落在 21 天上下。" +
    "距離學測還有幾個月的現在，1 天、2 天那種密集複習屬於低效區，" +
    "花很多時間但長期保留不成比例。" +
    "</div></div>" +
    (short > 0
      ? '<div class="plan-head" style="margin-top:12px;border-color:var(--warn)">' +
        '<div class="cap" style="line-height:1.9;color:var(--warn)">' +
        "<b>⚠ 目前的瓶頸是字庫，不是你的時間</b><br>" +
        "官方 " + OFF_COUNT + " 個字裡還有 <b>" + short + "</b> 個沒有例句，不能練。<br>" +
        "找 Claude Code 說「繼續補單字」，一次可以補一百多個。" +
        "</div></div>"
      : "");
}

function drawPlan() {
  var groups = dayGroups();
  var written = writtenCount();
  var doneDays = groups.filter(function (g) { return dayStat(g).added === g.length; }).length;
  var pct = Math.round(written / OFF_COUNT * 100);

  var html =
    '<div class="plan-head">' +
    '<div class="big">' + written + ' <span style="font-size:15px;color:var(--sub);font-weight:500">/ ' +
    OFF_COUNT + " 個官方單字</span></div>" +
    '<div class="bar"><i style="width:' + Math.max(pct, 1) + '%"></i></div>' +
    '<div class="cap">已編好釋義與例句、可以練習的有 ' + written + " 個（" + pct + "%）。" +
    "其餘的字在「查單字」查得到分級與詞性，但還沒有例句。</div>" +
    '<div class="cap" style="margin-top:10px">目前的進度：<b>' + doneDays + " / " + groups.length +
    " 天</b>已排入練習清單</div></div>";

  html += '<h2 class="sec">考試日倒數</h2>' + examPlan(written);
  html += '<div id="phaseBox">' + phasePlan(written) + "</div>";

  html += '<h2 class="sec">每天最少學幾個新字</h2>' +
    '<input class="num" id="perDay" type="number" min="3" max="200" value="' + perDay() + '">' +
    '<p style="font-size:13px;color:var(--sub);margin:8px 4px 0;line-height:1.7">' +
    "這是<b>下限不是上限</b>——練完當天的量還想繼續，隨時可以再加練或直接吃下一個 Day。<br>" +
    "單位是<b>字義</b>不是單字——一個字有幾個常考意思就算幾個，" +
    "目前 " + writtenCount() + " 個字共 " + unitCount() + " 個字義。<br>" +
    "改這個數字會重新分組。以每天 " + perDay() + " 個字義估算，穩定之後每天大約 " +
    Math.round(perDay() * 6.6) + " 題、" + Math.round(perDay() * 6.6 * 12 / 60) + " 分鐘（含複習）。</p>";

  html += '<h2 class="sec">每天自動載入新字</h2>' +
    '<div class="seg">' +
    '<button data-auto="1"' + (autoLoadOn() ? ' class="on"' : "") + ">自動載入</button>" +
    '<button data-auto="0"' + (autoLoadOn() ? "" : ' class="on"') + ">我自己按</button></div>" +
    '<p style="font-size:13px;color:var(--sub);margin:8px 4px 0;line-height:1.7">' +
    "開了之後，每天第一次打開「練習」就會照課表順序自動補上 " + perDay() + " 個新字義，" +
    "不必再自己來課表一組一組加。<br>" +
    "<b>不會累積</b>——某天沒練不會隔天補兩倍，只補當天的額度，" +
    "所以停幾天再回來也不會被一大堆新字淹沒。</p>";

  html += '<h2 class="sec">課表怎麼排</h2>' +
    '<div class="seg">' +
    '<button data-mix="1"' + (mixOn() ? ' class="on"' : "") + ">難度平均混合</button>" +
    '<button data-mix="0"' + (mixOn() ? "" : ' class="on"') + ">由淺到深</button></div>" +
    '<p style="font-size:13px;color:var(--sub);margin:8px 4px 0;line-height:1.7">' +
    (mixOn()
      ? "每一天都按比例含有各個分級的字。研究上稱為<b>交錯練習</b>，" +
        "長期保留與辨別能力都優於一次只練同一類。"
      : "同一級的字排在一起，由簡單到困難。<b>前面幾天會幾乎都是你已經會的字。</b>") +
    "</p>";
  html += groups.map(function (g, i) {
    var st = dayStat(g);
    var done = st.added === st.total;
    var nWords = Object.keys(g.reduce(function (m, u) { m[u.w] = 1; return m; }, {})).length;
    return '<div class="day' + (done ? " done" : "") + (openDay === i ? " open" : "") + '" data-d="' + i + '">' +
      '<div class="top"><span class="n">Day ' + (i + 1) + "</span>" +
      '<span class="st">' + st.added + " / " + st.total + " 已加入・熟練 " + st.mastered + "</span></div>" +
      '<div class="words">' +
      '<div style="margin-bottom:8px;font-size:12px">' + st.total + " 個字義，來自 " + nWords + " 個單字</div>" +
      g.map(function (u) {
        /* 一個字有多個意思時右上角標序號，讓你看得出同一個字被拆成幾筆 */
        var mark = u.e.s.length > 1 ? "<sup>" + (u.si + 1) + "</sup>" : "";
        var name = esc(u.w) + mark;
        return (S.items[idOf(u.w, u.si)] ? "<b>" + name + "</b>" : name) +
          '<span class="lv l' + (u.lv === 9 ? 1 : u.lv) + '" style="margin-left:3px">' +
          (u.lv === 9 ? "外" : u.lv) + "</span>";
      }).join("　") +
      '<div style="margin-top:12px"><button class="btn sm" data-add-day="' + i + '">' +
      (done ? "已全部加入" : "把這組加入練習清單") + "</button></div></div></div>";
  }).join("");

  $("#v-plan").innerHTML = html;

  /* 只更新受日期影響的兩個區塊，不碰輸入框本身，
     否則日期選擇器會在你選到一半時被砍掉重建。 */
  function refreshDates() {
    var w = writtenCount();
    $("#examInfo").innerHTML = examInfoHTML(w);
    $("#phaseBox").innerHTML = phasePlan(w);
    bindSprint();
  }
  if ($("#examDate")) {
    $("#examDate").onchange = function () { S.examDate = this.value; save(); refreshDates(); };
  }
  if ($("#learnEnd")) {
    $("#learnEnd").onchange = function () { S.learnEndDate = this.value; save(); refreshDates(); };
  }
  bindSprint();
  bindPlanRest();
}

function bindSprint() {
  if ($("#btnSprint")) {
    $("#btnSprint").onclick = function () {
      var items = allItems();
      if (!items.length) return toast("練習清單是空的");
      var left = Math.max(1, Math.ceil(
        (new Date(S.examDate + "T00:00:00").getTime() - Date.now()) / DAY));
      var span = Math.min(10, left);
      if (!confirm("這會把清單裡全部 " + items.length +
        " 個字重新排進未來 " + span + " 天，每天平均 " +
        Math.ceil(items.length / span) + " 個。熟練度不會被清掉。要繼續嗎？")) return;
      shuffle(items).forEach(function (it, i) {
        it.due = Date.now() + (i % span) * DAY;
      });
      save(); queue = [];
      toast("已排定考前總複習，去「練習」開始");
      drawPlan(); refreshHeader();
    };
  }
}

function bindPlanRest() {
  $("#v-plan").querySelectorAll("[data-mix]").forEach(function (b) {
    b.onclick = function () {
      S.mixLevels = b.dataset.mix === "1";
      save(); openDay = -1; drawPlan();
    };
  });
  $("#v-plan").querySelectorAll("[data-auto]").forEach(function (b) {
    b.onclick = function () {
      S.autoLoad = b.dataset.auto === "1";
      save(); drawPlan();
      toast(S.autoLoad ? "已開啟：下次進練習頁會自動補上今天的新字" : "已改回手動");
    };
  });
  $("#perDay").onchange = function () {
    var n = Math.max(3, Math.min(200, parseInt(this.value, 10) || 15));
    S.perDay = n; save(); openDay = -1; drawPlan();
  };
  $("#v-plan").querySelectorAll(".day").forEach(function (d) {
    d.onclick = function (e) {
      if (e.target.closest("[data-add-day]")) return;
      openDay = openDay === +d.dataset.d ? -1 : +d.dataset.d;
      drawPlan();
    };
  });
  $("#v-plan").querySelectorAll("[data-add-day]").forEach(function (b) {
    b.onclick = function () {
      var g = dayGroups()[+b.dataset.addDay], n = 0;
      g.forEach(function (u) { if (addItem(u.w, u.si)) n++; });
      queue = [];
      toast(n ? "已加入 " + n + " 個字義，去「練習」開始吧" : "這組都已經在清單裡了");
      refreshHeader(); drawPlan();
    };
  });
}

/* ============================================================
   查單字
   ============================================================ */
function drawFind() {
  $("#v-find").innerHTML =
    '<input id="searchIn" placeholder="輸入英文或中文，例如 abandon、放棄" autocomplete="off" ' +
    'autocorrect="off" autocapitalize="none" spellcheck="false">' +
    '<div id="hits"></div>';
  $("#searchIn").oninput = function () { runSearch(this.value); };
  runSearch("");
}

function runSearch(q) {
  q = q.trim().toLowerCase();
  var box = $("#hits");
  if (!q) {
    box.innerHTML =
      '<p style="color:var(--sub);font-size:14px;margin:18px 4px;line-height:1.8">' +
      "可以搜尋<b>大考中心詞彙表全部 " + OFF_COUNT + " 個字</b>，查得到分級與官方詞性。<br>" +
      "其中 <b>" + writtenCount() + "</b> 個已經編好釋義與例句，可以直接練習。<br>" +
      "英文中文都能搜，例如打「忍受」會找出 endure、tolerate、put up with。</p>" +
      '<h2 class="sec">隨機看看</h2>' +
      shuffle(BANK.slice()).slice(0, 12).map(hitHTML).join("");
    bindHits();
    return;
  }
  var hits = BANK.filter(function (e) {
    if (e.w.toLowerCase().indexOf(q) > -1) return true;
    return e.s.some(function (sn) { return sn.zh.indexOf(q) > -1; });
  }).sort(function (a, b) {
    return (a.w.toLowerCase().indexOf(q) === 0 ? 0 : 1) - (b.w.toLowerCase().indexOf(q) === 0 ? 0 : 1);
  }).slice(0, 40);

  /* 官方詞彙表裡有、但還沒編寫例句的字 */
  var pend = [];
  if (/^[a-z]/.test(q)) {
    pend = Object.keys(OFFICIAL).filter(function (w) {
      return w.indexOf(q) === 0 && !DICT[w];
    }).sort().slice(0, 40);
  }

  var html = hits.length ? hits.map(hitHTML).join("") : "";
  if (pend.length) {
    html += '<h2 class="sec">在學測範圍內，但還沒編寫例句（' + pend.length + "）</h2>" +
      pend.map(function (w) {
        var o = OFFICIAL[w];
        return '<div class="hit" data-w="' + esc(w) + '"><div>' +
          '<div class="w">' + esc(w) + ' <span class="lv l' + o.lv + '">' + o.lv + "級</span></div>" +
          '<div class="m">' + esc(o.pos) + "　尚未編寫釋義與例句</div></div>" +
          '<div class="arrow">›</div></div>';
      }).join("");
  }
  if (!html) {
    html = '<div class="empty">字庫與官方詞彙表裡都找不到「' + esc(q) + '」' +
      '<div style="margin-top:16px"><button class="btn" id="btnTodo2">加入待補清單</button></div></div>';
  }
  box.innerHTML = html;
  if ($("#btnTodo2")) {
    $("#btnTodo2").onclick = function () {
      if (S.todo.indexOf(q) < 0) S.todo.push(q);
      save(); toast("已加入待補清單，之後叫 Claude 寫進字庫");
    };
  }
  bindHits();
}

function hitHTML(e) {
  var n = e.s.filter(function (sn, i) { return hasItem(e.w, i); }).length;
  return '<div class="hit" data-w="' + esc(e.w) + '">' +
    "<div><div class=\"w\">" + esc(e.w) + " " + lvTag(e) + "</div>" +
    '<div class="m">' + e.s.map(function (sn) { return sn.p + " " + sn.zh; }).join("；") + "</div></div>" +
    '<div class="arrow">' + (n ? "✓" + n : "›") + "</div></div>";
}
function bindHits() {
  $("#hits").querySelectorAll(".hit").forEach(function (h) {
    h.onclick = function () { openWord(h.dataset.w); };
  });
}

/* ============================================================
   我的字
   ============================================================ */
var openMineDay = null;   // 目前展開的是哪一個 Day 資料夾

/* 把一堆練習項目依課表的 Day 分組。
   -1 代表不屬於任何 Day（自己從查單字加的）。
   分組依據是課表當下的排法，所以改「每天幾個」或切換排序方式，資料夾也會跟著重分。 */
function groupByDay(items) {
  var dayOf = {};
  dayGroups().forEach(function (g, i) {
    g.forEach(function (u) { dayOf[idOf(u.w, u.si)] = i; });
  });
  var folders = {};
  items.forEach(function (it) {
    var d = dayOf[idOf(it.w, it.si)];
    d = (d === undefined) ? -1 : d;
    (folders[d] = folders[d] || []).push(it);
  });
  return folders;
}
function dayLabel(d) { return d < 0 ? "自己加的" : "Day " + (d + 1); }

function drawMine() {
  var items = allItems();
  var l = S.log[today()] || { a: 0, c: 0 };
  var rate = l.a ? Math.round(l.c / l.a * 100) : 0;
  var mastered = items.filter(function (i) { return i.box >= 5; }).length;

  var html =
    '<div class="stats">' +
    '<div class="stat"><div class="n">' + items.length + '</div><div class="l">練習中</div></div>' +
    '<div class="stat"><div class="n">' + mastered + '</div><div class="l">已熟練</div></div>' +
    '<div class="stat"><div class="n">' + rate + '%</div><div class="l">今日正確率</div></div>' +
    "</div>";

  if (!items.length) {
    $("#v-mine").innerHTML = html + '<div class="empty">還沒有加任何單字</div>';
    return;
  }

  /* 依課表的 Day 分組，一天一個資料夾。
     分組依據就是課表當下的排法，所以改了「每天幾個字」或切換排序方式，
     這裡的資料夾也會跟著重新分。 */
  var folders = groupByDay(items);

  var now = Date.now();
  var keys = Object.keys(folders).map(Number).sort(function (a, b) { return a - b; });
  html += '<h2 class="sec">練習清單（' + items.length + " 個字義，分 " + keys.length + " 個資料夾）</h2>";

  html += keys.map(function (d) {
    var list = folders[d].slice().sort(function (a, b) { return a.due - b.due; });
    var due = list.filter(function (it) { return it.due <= now; }).length;
    var mastered = list.filter(function (it) { return it.box >= 5; }).length;
    var title = dayLabel(d);
    var open = openMineDay === d;
    return '<div class="day' + (open ? " open" : "") + '" data-m="' + d + '">' +
      '<div class="top"><span class="n">' + title + "</span>" +
      '<span class="st">' + list.length + " 個・熟練 " + mastered +
      (due ? "・<b style=\"color:var(--accent)\">待複習 " + due + "</b>" : "") + "</span></div>" +
      '<div class="words" style="padding-top:4px">' +
      list.map(function (it) {
        var e = DICT[it.w.toLowerCase()], sn = e.s[it.si];
        var t = it.due <= now ? "待複習" : fmtDue(it.due - now);
        return '<div class="li" style="padding:10px 0"><div><div class="w">' +
          esc(e.w) + " " + lvTag(e) +
          ' <span class="tag gray">' + esc(sn.p) + "</span></div>" +
          '<div class="m">' + esc(sn.zh) + " ・ 熟練度 " + it.box + " ・ " + t + "</div></div>" +
          '<button class="del" data-del="' + esc(it.w) + "::" + it.si + '">✕</button></div>';
      }).join("") + "</div></div>";
  }).join("");

  $("#v-mine").innerHTML = html;

  $("#v-mine").querySelectorAll("[data-m]").forEach(function (f) {
    f.onclick = function (e) {
      if (e.target.closest("[data-del]")) return;
      openMineDay = openMineDay === +f.dataset.m ? null : +f.dataset.m;
      drawMine();
    };
  });
  $("#v-mine").querySelectorAll("[data-del]").forEach(function (b) {
    b.onclick = function () {
      var p = b.dataset.del.split("::");
      delItem(p[0], +p[1]);
      queue = queue.filter(function (q) { return !(q.w === p[0] && q.si === +p[1]); });
      drawMine(); refreshHeader(); toast("已移除");
    };
  });
}
function fmtDue(ms) {
  if (ms < 3600000) return Math.ceil(ms / 60000) + " 分後";
  if (ms < DAY) return Math.ceil(ms / 3600000) + " 小時後";
  return Math.ceil(ms / DAY) + " 天後";
}

/* ============================================================
   錯題本（單字卡）
   ============================================================ */
var flashList = [], flashI = 0, flipped = false;

var wrongDay = null;   // null = 停在資料夾清單；數字或 "all" = 正在翻該組的卡

function drawWrong() {
  var all = wrongItems();
  if (!all.length) {
    wrongDay = null;
    $("#v-wrong").innerHTML =
      '<div class="empty"><span class="big">🎉</span>' +
      "錯題本是空的。<br>答錯的字會自動跑到這裡，<br>再答對一次就會畢業。</div>";
    return;
  }

  /* 先給資料夾清單，選一組才進卡片模式。
     一次翻三十幾張沒有段落感，分成一天一疊比較容易做完。 */
  if (wrongDay === null) {
    var folders = groupByDay(all);
    var keys = Object.keys(folders).map(Number).sort(function (a, b) { return a - b; });
    $("#v-wrong").innerHTML =
      '<div class="plan-head"><div class="big">' + all.length +
      ' <span style="font-size:15px;color:var(--sub);font-weight:500">個字義還沒過關</span></div>' +
      '<div class="cap">卡片只用來翻閱複習，不會改動熟練度。' +
      "要讓字離開錯題本，用「重練這組」把它答對一次。</div></div>" +
      '<button class="btn bad" data-wd="all">全部一起翻（' + all.length + " 張）</button>" +
      '<h2 class="sec">依課表分組</h2>' +
      keys.map(function (d) {
        var n = folders[d].length;
        return '<div class="day" data-wd="' + d + '"><div class="top">' +
          '<span class="n">' + dayLabel(d) + "</span>" +
          '<span class="st">' + n + " 張 ›</span></div></div>";
      }).join("");
    $("#v-wrong").querySelectorAll("[data-wd]").forEach(function (b) {
      b.onclick = function () {
        wrongDay = b.dataset.wd === "all" ? "all" : +b.dataset.wd;
        flashI = 0; flipped = false; drawWrong();
      };
    });
    return;
  }

  flashList = wrongDay === "all" ? all : (groupByDay(all)[wrongDay] || []);
  if (!flashList.length) { wrongDay = null; drawWrong(); return; }
  if (flashI >= flashList.length) flashI = 0;
  flipped = false;
  renderFlash();
}

function renderFlash() {
  var it = flashList[flashI];
  var e = DICT[it.w.toLowerCase()], sn = e.s[it.si];
  var ex = sn.ex[it.seen % sn.ex.length] || sn.ex[0];

  /* 正面只給中文與挖空句子，逼你把英文回想出來（跟練習模式同方向）；
     翻面才看到答案。看著英文想中文太簡單，練不到真正要考的能力。 */
  var face = flipped
    ? '<div class="fw">' + esc(e.w) + "</div>" +
      '<div class="fp">' + esc(sn.p) + "　" + esc(sn.zh) + "</div>" +
      (ex ? '<div class="fe" style="margin-top:16px">' + boldEx(ex.en) + "<br>" + esc(ex.zh) + "</div>" : "")
    : '<div class="fz">' + esc(sn.zh) + "</div>" +
      '<div class="fp">' + esc(sn.p) + "・答錯 " + it.wrong + " 次</div>" +
      (ex ? '<div class="fe" style="margin-top:14px">' +
        esc(splitEx(ex.en).pre) + "________" + esc(splitEx(ex.en).post) + "</div>" : "") +
      '<div class="tip">先在心裡拼出英文，再點卡片對答案</div>';

  $("#v-wrong").innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
    '<button class="btn sm ghost" id="fBack">‹ ' +
    (wrongDay === "all" ? "全部" : dayLabel(wrongDay)) + "</button>" +
    '<span style="color:var(--sub);font-size:13px">' + (flashI + 1) + " / " + flashList.length + " 張</span>" +
    '<button class="btn sm ghost" id="fDrill">重練這組</button></div>' +
    '<div class="flash" id="flash">' + face + "</div>" +
    /* 卡片就是單純翻閱用的，不會改動熟練度。
       真正把字移出錯題本的方式是去「練習」把它答對一次。 */
    '<div class="row" style="margin-top:16px">' +
    '<button class="btn ghost" id="fPrev">‹ 上一張</button>' +
    '<button class="btn ghost" id="fNext">下一張 ›</button></div>' +
    '<p style="font-size:13px;color:var(--sub);margin:12px 4px 0;line-height:1.7;text-align:center">' +
    "翻卡片只是複習，不會改變熟練度。<br>要讓字離開錯題本，去「重練這組」把它答對一次。</p>";

  $("#flash").onclick = function () { flipped = !flipped; renderFlash(); };
  $("#fBack").onclick = function () { wrongDay = null; drawWrong(); };
  $("#fDrill").onclick = function () {
    queue = shuffle(flashList.slice());
    qTotal = queue.length;
    drillMode = "wrong";
    toast("這一輪只考這組的 " + qTotal + " 個字義");
    go("drill");
  };
  $("#fPrev").onclick = function () {
    flashI = (flashI - 1 + flashList.length) % flashList.length;
    flipped = false; renderFlash();
  };
  $("#fNext").onclick = nextFlash;
}
function nextFlash() {
  flashI = (flashI + 1) % flashList.length;
  flipped = false;
  renderFlash();
}

/* ============================================================
   設定
   ============================================================ */
function syncAgo(t) {
  if (!t) return "還沒同步過";
  var s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "剛剛同步";
  if (s < 3600) return Math.floor(s / 60) + " 分鐘前同步";
  if (s < 86400) return Math.floor(s / 3600) + " 小時前同步";
  return Math.floor(s / 86400) + " 天前同步";
}

function syncBlockHTML() {
  var i = SYNC.info();
  if (!SYNC.enabled()) {
    return '<p style="font-size:13px;color:var(--sub);margin:0 4px 10px;line-height:1.7">' +
      "手機和電腦想共用同一份進度，就貼一組 GitHub token 進來。<br>" +
      "進度會存到你自己帳號底下的一個 secret gist，免費、只有你看得到。<br>" +
      '產生方式：GitHub → Settings → Developer settings → ' +
      "Personal access tokens → Fine-grained tokens，權限只勾 <b>Gists: Read and write</b>。</p>" +
      '<input class="tokin" id="syncTok" type="password" autocomplete="off" ' +
      'placeholder="貼上 github_pat_... 開頭的那串">' +
      '<div class="row" style="margin-top:10px">' +
      '<button class="btn" id="btnSyncOn">開啟同步</button></div>';
  }
  return '<div class="setrow"><div><div class="t">已開啟</div>' +
    '<div class="d">' + esc(syncAgo(i.lastSync)) +
    (i.gistId ? "・gist " + esc(i.gistId.slice(0, 7)) : "・尚未建立 gist") + "</div></div>" +
    '<button class="btn sm ghost" id="btnSyncNow">立刻同步</button></div>' +
    '<p style="font-size:13px;color:var(--sub);margin:0 4px 10px;line-height:1.7">' +
    "開啟 App 時會自動拉一次，練完停下來幾秒後自動上傳。<br>" +
    "兩台裝置的進度是逐筆合併的，不會互相蓋掉。</p>" +
    '<div class="row"><button class="btn ghost" id="btnSyncOff" style="color:var(--bad)">關閉同步</button></div>';
}

function bindSyncBlock() {
  var on = $("#btnSyncOn");
  if (on) {
    on.onclick = function () {
      var t = $("#syncTok").value.trim();
      if (!t) return toast("請先貼上 token");
      SYNC.setToken(t);
      toast("正在連線…");
      SYNC.run().then(function () {
        toast("同步成功");
        drawSet();
      }).catch(function (e) {
        SYNC.forget();
        toast(e.code === "auth" ? "token 無效或沒給 Gists 權限" : "連線失敗：" + e.message);
        drawSet();
      });
    };
  }
  var now = $("#btnSyncNow");
  if (now) {
    now.onclick = function () {
      toast("同步中…");
      SYNC.run().then(function () {
        toast("同步成功"); drawSet(); refreshHeader();
      }).catch(function (e) {
        toast(e.code === "auth" ? "token 已失效，請重新設定" : "同步失敗：" + e.message);
      });
    };
  }
  var off = $("#btnSyncOff");
  if (off) {
    off.onclick = function () {
      if (!confirm("關閉同步？本機進度會留著，雲端那份也不會刪，只是這台不再自動上傳下載。")) return;
      SYNC.forget(); toast("已關閉同步"); drawSet();
    };
  }
}

function drawSet() {
  $("#v-set").innerHTML =
    '<h2 class="sec">要叫 Claude 幫忙的事</h2>' +
    '<div class="setrow"><div><div class="t">待查單字（' + S.todo.length + "）</div>" +
    '<div class="d">字庫裡沒有、你想加進來的字</div></div>' +
    '<button class="btn sm ghost" id="cpTodo">複製指令</button></div>' +
    '<div class="setrow"><div><div class="t">回報的怪句子（' + S.bad.length + "）</div>" +
    '<div class="d">你覺得不自然或有錯的例句</div></div>' +
    '<button class="btn sm ghost" id="cpBad">複製指令</button></div>' +

    '<h2 class="sec">雲端同步</h2>' + syncBlockHTML() +

    '<h2 class="sec">備份</h2>' +
    '<p style="font-size:13px;color:var(--sub);margin:0 4px 10px;line-height:1.7">' +
    "進度存在這個瀏覽器裡。換手機、或清掉瀏覽器資料之前，記得先匯出備份。</p>" +
    '<div class="row" style="margin-bottom:10px">' +
    '<button class="btn" id="btnCopy">複製進度</button>' +
    '<button class="btn" id="btnFile">存成檔案</button></div>' +
    '<p style="font-size:13px;color:var(--sub);margin:0 4px 12px;line-height:1.7">' +
    "「複製進度」直接進剪貼簿，貼到備忘錄就好，不用手動選取。<br>" +
    "「存成檔案」會下載一個 .txt 到手機的「檔案」App，比貼在備忘錄可靠。</p>" +
    '<textarea class="io" id="io" placeholder="要復原的話，把之前備份的那串文字貼進這裡，再按「從這裡匯入」"></textarea>' +
    '<div class="row" style="margin-top:10px">' +
    '<button class="btn ghost" id="btnImp">從這裡匯入</button></div>' +

    '<h2 class="sec">字庫</h2>' +
    '<div class="setrow"><div><div class="t">目前收錄</div>' +
    '<div class="d">' + BANK.length + " 個單字與片語・" +
    BANK.reduce(function (n, e) { return n + e.s.reduce(function (m, s) { return m + s.ex.length; }, 0); }, 0) +
    " 個例句</div></div></div>" +

    '<h2 class="sec">危險操作</h2>' +
    '<button class="btn ghost" id="btnWipe" style="color:var(--bad)">清除全部學習進度</button>' +
    '<p style="font-size:12px;color:var(--sub);text-align:center;margin-top:28px">v1・完全離線運作</p>';

  bindSyncBlock();

  $("#cpTodo").onclick = function () {
    if (!S.todo.length) return toast("待查清單是空的");
    copy("請幫我把這些字加進單字庫（照 data/bank.js 的格式，新增到 data/ 裡的檔案）：\n" +
      S.todo.join("、"));
  };
  $("#cpBad").onclick = function () {
    if (!S.bad.length) return toast("沒有回報過句子");
    copy("這幾句例句我覺得怪怪的，請幫我檢查並修正單字庫裡的內容：\n" +
      S.bad.map(function (b) { return "- " + b.w + "（" + b.p + "）：" + b.en + " / " + b.zh; }).join("\n"));
  };
  $("#btnCopy").onclick = function () { copy(JSON.stringify(S)); };
  $("#btnFile").onclick = function () {
    var d = new Date(), pad = function (n) { return ("0" + n).slice(-2); };
    var name = "單字進度-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + ".txt";
    var url = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: "text/plain" }));
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("已存成 " + name);
  };
  $("#btnImp").onclick = function () {
    try {
      var o = JSON.parse($("#io").value);
      if (!o.items) throw 0;
      S = o; S.todo = S.todo || []; S.bad = S.bad || []; S.log = S.log || {};
      save(); queue = []; toast("匯入成功"); go("mine");
    } catch (e) { toast("格式不對，請確認貼上的是完整備份"); }
  };
  $("#btnWipe").onclick = function () {
    if (!confirm("確定要清除全部進度嗎？這會刪掉你的練習清單、熟練度與錯題本，無法復原。")) return;
    S = { v: 1, items: {}, todo: [], bad: [], log: {} };
    save(); queue = []; toast("已清除"); go("drill");
  };
}

function copy(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(function () { toast("已複製，貼給 Claude Code 就好"); },
      function () { fallbackCopy(text); });
  } else fallbackCopy(text);
}
function fallbackCopy(text) {
  var ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); toast("已複製"); }
  catch (e) { toast("複製失敗，請手動選取"); }
  document.body.removeChild(ta);
}

/* 電腦版快捷鍵：單獨按 Shift 翻開中文、單獨按 Alt 認輸看答案。

   為什麼要「單獨」按？Shift 本來就是打大寫用的，一按下就翻開中文的話，
   拼 Taiwan 這種字會在打第一個字母時就把答案提示掀掉。
   所以改成按住到放開之間都沒碰別的鍵才算數 —— Shift+t 打大寫不會誤觸發。

   Alt 另外要 preventDefault：Windows 的瀏覽器按 Alt 會跳到選單列。 */
var modKey = null, modClean = false;

function hotkeyTarget(e) {
  /* 回傳這次按鍵該不該處理。只在練習頁、還沒作答時有效。 */
  if (cur !== "drill" || answered || !qCur) return false;
  if ($("#sheetBg").classList.contains("on")) return false;
  var t = e.target;
  if (t && (t.tagName === "TEXTAREA" ||
            (t.tagName === "INPUT" && t.id !== "ansIn"))) return false;
  return true;
}

document.addEventListener("keydown", function (e) {
  if (e.key === "Shift" || e.key === "Alt") {
    if (modKey !== e.key) { modKey = e.key; modClean = true; }
    if (e.key === "Alt") e.preventDefault();
    return;
  }
  /* 按了別的鍵 —— 這次的修飾鍵是拿來組合用的，不算快捷鍵 */
  modClean = false;
});

document.addEventListener("keyup", function (e) {
  if (e.key !== "Shift" && e.key !== "Alt") return;
  var solo = modClean && modKey === e.key;
  modKey = null; modClean = false;
  if (!solo || !hotkeyTarget(e)) return;
  e.preventDefault();
  if (e.key === "Shift") revealHint(senseOf(qCur));
  else giveUp();
});

/* 切換頁面或視窗失焦時把狀態清掉，
   不然 Alt+Tab 切出去再回來，殘留的 modKey 會讓下一次按鍵誤判。 */
window.addEventListener("blur", function () { modKey = null; modClean = false; });

/* 電腦版：答完之後直接按 Enter 進下一題。

   送出答案時 submit() 會把輸入框 blur 掉（要讓手機鍵盤收起來），
   於是掛在 #ansIn 上的那個 Enter 監聽就再也收不到事件了。
   這裡補一個全域監聽接手「下一題」，手機沒有實體鍵盤，不受影響。 */
document.addEventListener("keydown", function (e) {
  if (e.key !== "Enter" || e.isComposing) return;
  if (cur !== "drill" || !answered) return;
  /* 查單字的彈出開著時不要搶走 Enter */
  if ($("#sheetBg").classList.contains("on")) return;
  /* 焦點在別的輸入欄位時交給該欄位自己處理 */
  var t = e.target;
  if (t && (t.tagName === "TEXTAREA" ||
            (t.tagName === "INPUT" && t.id !== "ansIn"))) return;
  e.preventDefault();
  submit();          /* answered 為真時 submit() 會轉呼叫 next() */
});

/* ---------- 啟動 ---------- */
go("drill");

/* 開 App 先跟雲端對一次。沒設 token 的話這行什麼都不做。 */
if (window.SYNC) SYNC.auto();

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  navigator.serviceWorker.register("sw.js").catch(function () { });
}
