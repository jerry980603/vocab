/* ============================================================
   單字練習 v2 — 畫面（app.js）
   只做練習：首頁、第一次打開的搬家確認、新字（先測／學習卡／考一輪）、頑固字、複習。
   邏輯全在 core.js（V2），這裡只負責畫面、計時、存檔。
   存檔：vocab2_state（進度）、vocab2_events（還沒上傳的答題事件）、vocab2_dev（裝置代號，不同步）。
   ⚠ 舊版存檔 vocabApp_v1 只讀不寫。
   ============================================================ */
(function () {
  "use strict";
  var LS = "vocab2_state", LSE = "vocab2_events", LSD = "vocab2_dev", V1KEY = "vocabApp_v1";
  var EV_CAP = 20000;                       // 沒開同步時，本機最多留幾筆答題事件
  var IDLE = 90000, TICK = 5000, FLUSH = 30000, AUTO_NEXT = 1200;

  var $ = function (s) { return document.querySelector(s); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var toastT = null;
  function toast(msg, ms) {
    var t = $("#toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove("on"); }, ms || 1900);
  }
  var touchDev = window.matchMedia && window.matchMedia("(pointer:coarse)").matches;

  V2.init(window.WORD_BANK || []);
  var S = null, view = "", sess = null, st = null, res = null;
  var shownAt = 0, firstKey = 0, hints = 0, answeredAt = 0, autoT = null;
  var lastAct = Date.now(), pend = 0, budgetDay = "";

  /* ---------- 存檔 ---------- */
  function devId() {
    var d = null;
    try { d = localStorage.getItem(LSD); } catch (e) { }
    if (!d) {
      d = Math.random().toString(36).slice(2, 8);
      try { localStorage.setItem(LSD, d); } catch (e) { }
    }
    return d;
  }
  var DEV = devId();
  function save(noSync) {
    S.mtime = Date.now();
    try { localStorage.setItem(LS, JSON.stringify(S)); }
    catch (e) { toast("儲存失敗，可能是瀏覽器空間不足"); }
    if (!noSync && window.SYNC2) SYNC2.touch();
  }
  function events() { try { return JSON.parse(localStorage.getItem(LSE)) || []; } catch (e) { return []; } }
  function flushEvents() {
    if (!sess || !sess.events.length) return;
    var a = events().concat(sess.events.splice(0));
    if (a.length > EV_CAP) a = a.slice(a.length - EV_CAP);
    try { localStorage.setItem(LSE, JSON.stringify(a)); } catch (e) { }
  }
  function dropEvents(n) {
    try { localStorage.setItem(LSE, JSON.stringify(events().slice(n))); } catch (e) { }
  }
  /* 給 sync2.js 用的介面 */
  window.APP = {
    dev: function () { return DEV; },
    getS: function () { return S; },
    setS: function (s) { S = V2.normalize(s); save(true); },
    events: events, dropEvents: dropEvents,
    refresh: function () { if (view === "home") home(); }
  };

  /* ---------- 共用的小片段 ---------- */
  function today() { return V2.dateStr(Date.now()); }
  function msToday() { return ((S && S.log[today()]) || {}).ms || 0; }
  function lvTag(o) {
    if (o.ph) return '<span class="lv">片語</span>';
    if (o.rawLv === 0) return '<span class="lv">表外</span>';
    return '<span class="lv l' + o.lv + '">' + o.lv + "級</span>";
  }
  /* 右上角：今天幾分鐘（練習中加一顆「結束」）。計時每 5 秒只改數字，不重畫按鈕——
     重畫的那一瞬間點下去會沒反應 */
  function headBar() {
    var m = Math.floor(msToday() / 60000), d = $("#daily"), want = view === "drill" ? "drill" : "home";
    if (d.getAttribute("data-mode") !== want) {
      d.setAttribute("data-mode", want);
      d.innerHTML = '今天 <span id="mins"></span> 分' +
        (want === "drill" ? '　<button class="end" id="btnEnd">結束</button>' : "");
      if ($("#btnEnd")) $("#btnEnd").onclick = endSession;
    }
    $("#mins").textContent = S ? m : 0;
  }
  function inDays(n) { return n <= 1 ? "明天再考" : "下次：" + n + " 天後"; }
  var OUT = {
    known: "已經會了，14 天後再考",
    learn: "等一下看學習卡",
    learned: "明天再考",
    relearn: "等一下再考一次",
    hold: "明天再考",
    mistap: "答得太快，可能是誤觸，明天再考",
    "void": "答得太快，這題不算，等一下再考",
    down: "等一下再考一次", again: "等一下再考一次",
    hard: "等一下再考一次；這個字錯了好幾次，之後會用頑固字的方式練",
    hardMiss: "等一下再考一次", hardHold: "明天再考",
    hardOk: "不同天再答對一次就畢業",
    graduate: "畢業了，回到一般複習"
  };
  function outText(r) {
    if (r.out === "up1" || r.out === "up2") return inDays(V2.INT[r.pos]) + (r.out === "up2" ? "（又快又對，跳兩階）" : "");
    return OUT[r.out] || "";
  }

  /* ---------- 啟動 ---------- */
  function boot() {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(function () { });
    var raw = null;
    try { raw = localStorage.getItem(LS); } catch (e) { }
    if (raw) { try { S = V2.normalize(JSON.parse(raw)); } catch (e) { S = null; } }
    if (S) {
      V2.refreshPool(S);
      save(true);
      home();
      if (window.SYNC2) SYNC2.auto();
      return;
    }
    firstOpen();
  }

  /* 第一次打開：雲端已經有別台搬好的 v2 → 直接用；否則搬舊版（本機優先，再來雲端）；都沒有就從零開始 */
  function firstOpen() {
    view = "first";
    $("#main").innerHTML = '<div class="card sub">第一次打開 v2，正在找舊版進度…</div>';
    var v1 = null;
    try { v1 = JSON.parse(localStorage.getItem(V1KEY)); } catch (e) { }
    var p = window.SYNC2 && SYNC2.enabled() ? SYNC2.pullFirst().catch(function () { return {}; }) : Promise.resolve({});
    p.then(function (r) {
      if (r.v2 && r.v2.items) return confirmAdopt(r.v2);
      if (v1 && v1.items) return confirmMigrate(v1, "這台裝置的舊版進度");
      if (r.v1 && r.v1.items) return confirmMigrate(r.v1, "雲端的舊版進度");
      confirmMigrate(null, "");
    });
  }
  function confirmAdopt(remote) {
    $("#main").innerHTML = '<div class="card"><b>雲端已經有 v2 的進度</b>' +
      '<p class="sub">另一台裝置已經搬過家了：' + Object.keys(remote.items).length + " 個字義在練、" +
      (remote.pool || []).length + ' 個新字待學。這台直接接著用。</p>' +
      '<button class="btn" id="ok">使用雲端進度</button></div>';
    $("#ok").onclick = function () {
      S = V2.normalize(JSON.parse(JSON.stringify(remote)));
      V2.refreshPool(S);
      save();
      home();
      if (window.SYNC2) SYNC2.auto();
    };
  }
  function confirmMigrate(v1, src) {
    var m = V2.migrate(v1, Date.now()), s = m.sum, h;
    if (!v1) {
      h = '<div class="card"><b>沒有找到舊版進度</b><p class="sub">從零開始：' + s.pool +
        ' 個新字依級數混合排好，每天的量依時間自動調整。</p><button class="btn" id="ok">開始使用</button></div>';
    } else {
      var row = function (a, b) { return "<tr><td>" + a + "</td><td>" + b + "</td></tr>"; };
      h = '<div class="card"><b>搬家：' + esc(src) + "</b>" +
        '<p class="sub">確認之後才會寫入。舊版的進度只讀不改，舊版照常可以用。</p>' +
        '<table class="mig">' +
        row("退回新字（錯題本裡只見過一次的）", s.back) +
        row("頑固字（錯 4 次以上）", s.hard) +
        row("錯題本其他（今天起複習）", s.wb) +
        row("熟（舊熟練度 5 以上）", s.box5) +
        row("中（舊熟練度 2～4）", s.box24) +
        row("生（舊熟練度 0～1）", s.box01) +
        (s.missing ? row("字庫已刪除、略過", s.missing) : "") +
        row("不再出現（快篩、畢業）", s.excl + " 個字義") +
        row("待學新字", s.pool) +
        "</table>" +
        '<div class="row"><a class="btn ghost" href="../index.html" style="text-decoration:none">先不要</a>' +
        '<button class="btn" id="ok">確認搬家</button></div></div>';
    }
    $("#main").innerHTML = h;
    $("#ok").onclick = function () {
      S = m.S;
      save();
      home();
      if (window.SYNC2) SYNC2.auto();
    };
  }

  /* ---------- 首頁（§5） ---------- */
  function home() {
    view = "home"; sess = null; st = null;
    clearTimeout(autoT);
    var now = Date.now(), h = V2.homeInfo(S, now);
    save(true);                             // dayPlan 剛把今天的新字額度記進 log
    var m = Math.floor(h.ms / 60000), seg = Math.min(10, Math.floor(h.ms / (h.budget * 6000)));
    var bar = "";
    for (var i = 0; i < 10; i++) bar += "<i" + (i < seg ? ' class="on"' : "") + "></i>";
    var notes = [];
    if (h.done) notes.push('<span class="done">今天 ' + h.budget + " 分鐘完成 ✓</span> 想繼續可以繼續，也可以休息。");
    else if (h.floorMet) notes.push('<span class="done">保底守住了 ✓</span>');
    if (h.calib) notes.push("前 7 天在量你的答題速度，先不判斷「又快又對」，答對一律升一階。");
    if (h.noNew) notes.push("已經過了學新字的期限（" + S.set.learnEnd + "），只複習。");
    var left = h.newLeft + h.hard + h.rev;
    var html = '<div class="card">' +
      '<div class="clock">今天 <b>' + m + "</b> / " + h.budget + " 分鐘</div>" +
      '<div class="bar">' + bar + "</div>" +
      '<div class="small">保底：新字學完 ＋ ' + h.floor + " 分鐘</div>" +
      '<ul class="plan">' +
      "<li><span>① 新字</span><span class=\"n\">" + h.newLeft + " 個（預估 " + h.newMin + " 分）</span></li>" +
      "<li><span>② 頑固字</span><span class=\"n\">" + h.hard + " 個（預估 " + h.hardMin + " 分）</span></li>" +
      "<li><span>③ 複習</span><span class=\"n\">約 " + h.revMin + " 分（" + h.rev + " 個）</span></li>" +
      "</ul>" +
      (left ? '<button class="btn" id="go">' + (m ? "繼續練" : "開始") + "</button>"
        : '<div class="done">今天能練的都練完了 ✓</div>') +
      (notes.length ? '<div class="note">' + notes.join("<br>") + "</div>" : "") +
      "</div>" + settingsHTML();
    $("#main").innerHTML = html;
    headBar();
    if ($("#go")) $("#go").onclick = start;
    bindSettings();
  }
  function settingsHTML() {
    var si = window.SYNC2 ? SYNC2.info() : { enabled: false }, pendN = events().length;
    var opts = [30, 45, 60, 75, 90].map(function (n) {
      return '<option value="' + n + '"' + (n === S.set.budget ? " selected" : "") + ">" + n + " 分鐘</option>";
    }).join("");
    var t = si.lastSync ? new Date(si.lastSync).toLocaleString("zh-TW", { hour12: false }) : "還沒同步過";
    return '<h2 class="sec">其他</h2><div class="card">' +
      '<div class="setrow"><span>每天目標</span><select id="budget">' + opts + "</select></div>" +
      '<div class="setrow"><span>雲端同步<br><span class="small">' +
      (si.enabled ? "已設定・" + esc(t) : "沒設定（在舊版的設定頁設定，v2 會自動共用）") + "</span></span>" +
      (si.enabled ? '<button class="btn sm ghost" id="syncNow">立即同步</button>' : "") + "</div>" +
      '<div class="setrow"><span>回報的題目<br><span class="small">' + S.bad.length + " 題・複製後貼給 Claude 修</span></span>" +
      '<button class="btn sm ghost" id="cpBad">複製</button></div>' +
      '<div class="setrow"><span class="small">答題事件 ' + pendN + " 筆還沒上傳" + (si.enabled ? "" : "（沒開同步）") + "</span></div>" +
      '<div class="setrow"><a href="../index.html" class="small">舊版（單字卡、查單字、課表、紀錄）→</a></div>' +
      '<div class="disclaim">題目由程式產生，不是大考中心的題目。</div></div>';
  }
  function bindSettings() {
    $("#budget").onchange = function () { S.set.budget = +this.value; save(); home(); };
    if ($("#syncNow")) $("#syncNow").onclick = function () {
      toast("同步中…");
      SYNC2.run({ events: true }).then(function () { toast("同步完成"); home(); })
        .catch(function (e) { toast("同步失敗：" + e.message, 3000); });
    };
    $("#cpBad").onclick = function () {
      if (!S.bad.length) return toast("沒有回報過題目");
      var txt = "v2 回報的題目：\n" + S.bad.map(function (b) {
        return "- " + b.w + "（" + b.p + "）[" + b.t + "]：" + (b.en || "") + (b.zh ? " / " + b.zh : "") + (b.o ? "　選項：" + b.o : "") + (b.pk ? "　我選了：" + b.pk : "");
      }).join("\n");
      copy(txt);
    };
  }
  function copy(txt) {
    var done = function () { toast("已複製"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback);
    else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("複製失敗"); }
      document.body.removeChild(ta);
    }
  }

  /* ---------- 練習 ---------- */
  function start() {
    sess = V2.startSession(S, Date.now(), DEV);
    view = "drill";
    lastAct = Date.now();
    step();
  }
  function endSession() {
    if (st && st.q && !st.done && answeredAt) addFeedbackTime();
    flushEvents();
    save(true);
    if (window.SYNC2 && SYNC2.enabled()) SYNC2.run({ events: true }).catch(function () { });
    home();
  }
  function step() {
    clearTimeout(autoT);
    st = V2.next(S, sess, Date.now());
    res = null; shownAt = Date.now(); firstKey = 0; hints = 0; answeredAt = 0;
    if (st.kind === "done") return doneView();
    if (st.kind === "C") renderCard();
    else if (st.kind === "H") renderVs();
    else if (st.q.fmt === "S") renderS();
    else renderMC();
    headBar();
    window.scrollTo(0, 0);
  }
  function stageHTML() {
    var lab = st.ph === "retry" ? "再考一次" :
      st.ph === "pre" ? "新字・先測（會的話直接跳過學習）" :
      st.ph === "learn" ? (st.kind === "C" ? "新字・學習卡" : "新字・考一輪") :
      st.ph === "hard" ? "頑固字" : "複習";
    var left = sess.newLeft + sess.hardQ.length + sess.revQ.length + sess.retry.length;
    return '<div class="stage"><span>' + lab + "</span><span>還有 " + left + "</span></div>";
  }
  function doneView() {
    view = "drill-done";
    flushEvents(); save(true);
    if (window.SYNC2 && SYNC2.enabled()) SYNC2.run({ events: true }).catch(function () { });
    $("#main").innerHTML = '<div class="card"><b>今天能練的都練完了 ✓</b><p class="sub">今天練了 ' +
      Math.floor(msToday() / 60000) + ' 分鐘。</p><button class="btn" id="back">回首頁</button></div>';
    $("#back").onclick = home;
    headBar();
  }
  /* 回饋畫面看了多久，算進這個題型的平均時間（估每天能上幾個新字用） */
  function addFeedbackTime() {
    var kt = st.kind === "P" ? "P" : st.q.fmt;
    V2.addTime(S, kt, Math.min(Date.now() - answeredAt, 60000), Date.now());
  }
  function goNext() {
    clearTimeout(autoT);
    if (!st) return;
    if (st.kind === "C" || st.kind === "H") return seen();
    if (!st.done) return;
    addFeedbackTime();
    save(true);
    step();
  }

  /* 選擇題：A 看英文選中文、B 句子挖空（§8） */
  function renderMC() {
    var q = st.q, h = '<div class="card">' + stageHTML();
    if (q.fmt === "A") {
      h += '<div class="qw">' + esc(q.w) + "</div><div>" + '<span class="tag">' + esc(q.p) + "</span> " + lvTag(q) + "</div>";
    } else {
      h += '<div class="sent">' + esc(q.pre) + '<span class="blank">＿＿＿＿</span>' + esc(q.post) + "</div>" +
        '<div class="small">選出填進空格的字（選項是原形）</div>';
    }
    h += '<div class="opts">' + q.opts.map(function (o, i) {
      return '<button class="opt" data-i="' + i + '"><span class="k">' + (i + 1) + "</span>" + esc(o.t) + "</button>";
    }).join("") + '<button class="opt unk" data-i="-1">不知道</button></div><div id="fb"></div></div>';
    $("#main").innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll(".opt"), function (b) {
      b.onclick = function () { pickMC(+b.getAttribute("data-i")); };
    });
  }
  function pickMC(i) {
    if (!st || st.done || st.kind === "C" || st.kind === "H") return;
    var q = st.q, now = Date.now(), rt = now - shownAt;
    var r = V2.submit(S, sess, st, { pick: i < 0 ? "?" : q.opts[i].id, rt: rt, dur: rt }, now);
    res = r; answeredAt = now;
    flushEvents(); save();
    var btns = document.querySelectorAll(".opt");
    Array.prototype.forEach.call(btns, function (b) {
      var k = +b.getAttribute("data-i");
      b.disabled = true;
      if (k === q.ans) b.classList.add("right");
      else if (k === i) b.classList.add("wrong");
    });
    var fb = "";
    if (r.ok) fb = '<div class="fb ok">答對了。' + esc(outText(r)) + "</div>";
    else {
      fb = '<div class="fb bad">' + (i < 0 ? "沒關係。" : "答錯了。") +
        (q.fmt === "A" ? "正確答案是「" + esc(q.opts[q.ans].t) + "」。" : "正確答案是 <b>" + esc(q.w) + "</b>。");
      if (r.picked) fb += q.fmt === "A" ? "<br>你選的「" + esc(r.picked.zh) + "」是 <b>" + esc(r.picked.w) + "</b>。"
        : "<br>你選的 <b>" + esc(r.picked.w) + "</b> 是「" + esc(r.picked.zh) + "」。";
      fb += '<div class="small">' + esc(outText(r)) + "</div></div>";
    }
    var more = '<div class="fb" style="padding:0 2px"><div class="more"><span class="tag">' + esc(q.p) + "</span> " +
      "<b>" + esc(q.w) + "</b>　" + esc(q.zh) + "</div>";
    if (q.fmt === "B") {
      more += '<div class="sent" style="font-size:17px;margin-top:8px">' + esc(q.pre) + '<b class="fill">' + esc(q.form) + "</b>" + esc(q.post) + "</div>" +
        '<div class="exzh">' + esc(q.exZh) + "</div>";
    }
    more += "</div>";
    $("#fb").innerHTML = fb + more + feedbackTail(q);
    bindTail(q);
    if (r.ok) autoT = setTimeout(goNext, AUTO_NEXT);
  }
  /* B 題選錯：選的字放進句子可能也說得通（程式擋不了），回報時一併記下選了哪個 */
  function feedbackTail(q) {
    var also = q.fmt === "B" && res && res.picked;
    return '<button class="btn soft next" id="next">下一題 →</button>' +
      '<button class="linkbtn" id="report">' + (also ? "我選的 " + esc(res.picked.w) + " 也說得通，回報這題" : "這題有問題，回報") + "</button>" +
      (q.fmt === "B" ? '<div class="disclaim">題目由程式產生，不是大考中心的題目。</div>' : "");
  }
  function bindTail(q) {
    $("#next").onclick = goNext;
    $("#report").onclick = function () {
      clearTimeout(autoT);
      V2.report(S, q, Date.now(), res && res.picked ? res.picked.w : "");
      save();
      this.disabled = true; this.textContent = "已記下（首頁「其他」可以複製給 Claude 修）";
    };
    if (!touchDev) $("#next").focus();
  }

  /* 拼寫（§8 S）：中文整句＋英文挖空＋字母數＋字尾提示＋字母提示。rt 量到按下第一個鍵 */
  function renderS() {
    var q = st.q, phrase = q.form.indexOf(" ") > -1;
    var root = q.suffix ? q.form.slice(0, q.form.length - q.suffix.length) : q.form;
    /* 空格只畫字根；規則變化的字尾放在輸入框旁邊（+ed），跟舊版一樣 */
    var blank = phrase ? q.form.split(" ").map(function (w) { return new Array(w.length + 1).join("_"); }).join(" ")
      : new Array(root.length + 1).join("_");
    var h = '<div class="card">' + stageHTML() +
      '<div class="exzh">' + esc(q.exZh) + "</div>" +
      '<div class="sent">' + esc(q.pre) + '<span class="blank" id="blank">' + esc(blank) + "</span>" +
      (phrase ? "" : '<span class="bn" id="bn">' + root.length + "</span>") + esc(q.post) + "</div>" +
      '<div><span class="tag">' + esc(q.p) + "</span> " + lvTag(q) + "</div>" +
      '<div class="ansrow"><input id="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="拼出空格裡的字">' +
      (q.suffix ? '<span class="suffix">+' + esc(q.suffix) + "</span>" : "") + "</div>" +
      (q.tip ? '<div class="tip">' + esc(q.tip) + "</div>" : "") +
      '<div class="row" style="margin-top:12px"><button class="btn ghost" id="hint">提示</button>' +
      '<button class="btn ghost" id="giveup">不會</button><button class="btn soft" id="submit">送出</button></div>' +
      '<div id="fb"></div></div>';
    $("#main").innerHTML = h;
    var inp = $("#ans");
    var mark = function () { if (!firstKey) firstKey = Date.now(); };
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); submitS(false); return; }
      mark();
    });
    inp.addEventListener("input", mark);
    $("#submit").onclick = function () { submitS(false); };
    $("#giveup").onclick = function () { submitS(true); };
    $("#hint").onclick = function () {
      if (st.done || hints >= q.maxHint) return;
      hints++;
      $("#blank").textContent = V2.hintMask(phrase ? q : { form: root }, hints);
      if (hints >= q.maxHint) this.disabled = true;
      if (!touchDev) inp.focus();
    };
    if (!touchDev) inp.focus();
  }
  function submitS(giveUp) {
    if (!st || st.done) return;
    var q = st.q, inp = $("#ans"), v = inp.value, now = Date.now();
    if (!giveUp && !V2.norm(v)) { inp.focus(); return; }
    var rt = (firstKey || now) - shownAt;
    var r = V2.submit(S, sess, st, giveUp ? { pick: "?", rt: rt, dur: now - shownAt }
      : { input: v, rt: rt, dur: now - shownAt, hint: hints }, now);
    res = r; answeredAt = now;
    flushEvents(); save();
    inp.disabled = true;
    ["hint", "giveup", "submit"].forEach(function (k) { $("#" + k).disabled = true; });
    $("#blank").textContent = q.form;
    $("#blank").classList.add("fill");
    if ($("#bn")) $("#bn").style.display = "none";
    var fb = r.ok ? '<div class="fb ok">答對了' + (hints ? "（用了提示）" : "") + "。" + esc(outText(r)) + "</div>"
      : '<div class="fb bad">' + (giveUp ? "沒關係。" : "你寫的是 " + esc(v) + "。") +
        "正確答案是 <b>" + esc(q.form) + "</b>。<div class=\"small\">" + esc(outText(r)) + "</div></div>";
    var more = '<div class="fb" style="padding:0 2px"><div class="more"><span class="tag">' + esc(q.p) + "</span> <b>" +
      esc(q.w) + "</b>　" + esc(q.zh) + "</div></div>";
    $("#fb").innerHTML = fb + more + feedbackTail(q);
    bindTail(q);
    if (r.ok) autoT = setTimeout(goNext, AUTO_NEXT);
  }

  /* 學習卡（§5）與頑固字的學習卡（§7，列出全部例句） */
  function exHTML(c) {
    return c.ex.map(function (x) {
      return '<div class="ex"><div class="sent" style="font-size:17px;margin:0">' + esc(x.pre) + '<b class="fill">' + esc(x.form) + "</b>" +
        esc(x.post) + '</div><div class="exzh">' + esc(x.zh) + "</div></div>";
    }).join("");
  }
  function renderCard() {
    var c = st.card;
    var others = c.others.length ? '<div class="others">其他意思：' + c.others.map(function (o) {
      return esc(o.p) + " " + esc(o.zh);
    }).join("；") + "</div>" : "";
    $("#main").innerHTML = '<div class="card lcard">' + stageHTML() +
      '<div class="qw">' + esc(c.w) + "</div><div><span class=\"tag\">" + esc(c.p) + "</span> " + lvTag(c) + "</div>" +
      '<div class="zh">' + esc(c.zh) + "</div>" + exHTML(c) + others +
      '<button class="btn soft next" id="seen">看完了</button></div>';
    $("#seen").onclick = seen;
  }
  /* 對照卡（§7）：兩個字並排，各一句例句 */
  function renderVs() {
    var a = st.card, b = st.card2;
    var mini = function (c) {
      return '<div class="card lcard"><div class="qw">' + esc(c.w) + "</div><div><span class=\"tag\">" + esc(c.p) +
        "</span> " + lvTag(c) + '</div><div class="zh">' + esc(c.zh) + "</div>" + exHTML(c) + "</div>";
    };
    $("#main").innerHTML = '<div class="card">' + stageHTML() +
      '<p>你上次把 <b>' + esc(a.w) + "</b> 選成了 <b>" + esc(b.w) + "</b>" + (st.times > 1 ? "（" + st.times + " 次）" : "") +
      "。兩個並排看一次，等一下考 " + esc(a.w) + "。</p>" +
      '<div class="vs">' + mini(a) + mini(b) + "</div>" +
      '<button class="btn soft next" id="seen">看完了</button></div>';
    $("#seen").onclick = seen;
  }
  function seen() {
    if (!st || st.done) return;
    V2.cardDone(S, sess, st, Math.min(Date.now() - shownAt, 120000), Date.now());
    save(true);
    step();
  }

  /* ---------- 計時：只算實際在練的時間（90 秒沒動作就不算，沿用舊版） ---------- */
  ["pointerdown", "keydown", "touchstart", "input"].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      lastAct = Date.now();
      if (autoT && !(e.type === "keydown" && e.key === "Enter")) { clearTimeout(autoT); autoT = null; }
    }, true);
  });
  setInterval(function () {
    if (!S || view !== "drill" || document.hidden || Date.now() - lastAct >= IDLE) return;
    V2.tick(S, TICK, Date.now());
    pend += TICK;
    if (pend >= FLUSH) { pend = 0; save(true); }
    headBar();
    var td = today();
    if (budgetDay !== td && msToday() >= S.set.budget * 60000) {
      budgetDay = td;
      toast("今天 " + S.set.budget + " 分鐘完成 ✓ 想繼續可以繼續，也可以休息", 5000);
    }
  }, TICK);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && S) { flushEvents(); save(true); }
  });
  window.addEventListener("pagehide", function () { if (S) { flushEvents(); save(true); } });

  /* ---------- 鍵盤（電腦）：1～4 選、0 不知道、Enter 下一題 ---------- */
  document.addEventListener("keydown", function (e) {
    if (view !== "drill" || !st || e.target.id === "ans") return;
    if (e.key === "Enter") { e.preventDefault(); goNext(); return; }
    if (st.q && st.q.fmt !== "S" && !st.done) {
      if (e.key >= "1" && e.key <= "4") pickMC(+e.key - 1);
      else if (e.key === "0" || e.key === "?") pickMC(-1);
    }
  });

  boot();
})();
