/* ============================================================
   單字練習 v2 — 核心邏輯（core.js）
   純邏輯、不碰 DOM：排程、出題、答題時間判斷、搬家、同步合併。
   瀏覽器：載入字庫之後 <script src="core.js">，用 window.V2；
   Node：require("./core.js")，測試在 test/。
   設計文件：學測作戰室 docs/單字改版設計.md（以下「§n」指那份文件的第 n 節）
   ============================================================ */
(function (root) {
  "use strict";

  /* ---------- 0. 常數 ---------- */
  var DAY = 86400000;
  /* §4 階梯：pos ＝ 已經通過幾階，通過後隔幾天再考（pos 0 ＝ 當天） */
  var INT = [0, 1, 4, 14, 30, 60, 120];
  var MAXPOS = INT.length - 1;
  /* §5 預估秒數的預設值（還沒有足夠紀錄時用）。P（新字先測）跟 A 一樣快 */
  /* 每題平均要幾秒（含看回饋），還沒有足夠紀錄時用。2026-10-20 改：原本 3.5／6／10 是「作答時間」，
     但估每天的量要用「整題花的時間」；模擬裡實際每題平均約 8 秒【估計】 */
  var DEF_SEC = { A: 6, B: 9, S: 13, C: 6, P: 6 };
  /* 一個新字（先測＋學習卡＋隔 LAG 題的第一次考＋答錯重考）平均幾秒，沒有紀錄時用。
     原本 20 秒是舊流程的假設；改成先作答後看答案後，模擬量到約 29 秒【估計】。之後用實測（newSec） */
  var NEW_SEC = 30, NEW_MAX = 80, BATCH = 5;
  var HARD_IN = 4, HARD_MAX = 20, HARD_OUT = 2;       // §7 lapses 達 4 進頑固字、每天最多 20 個、不同天答對 2 次畢業
  /* 同一次練習裡「再考」至少隔幾題（新字看完回饋卡後的第一次考、答錯重考、頑固字重考都一樣）。
     看完答案馬上考只考到短期記憶：Karpicke & Roediger 2007（第一次提取要延後）、
     Karpicke & Bauernschmidt 2011（間隔越長越好）。這次練習隔不開的留到明天，不硬考。 */
  var LAG = 10;
  var RECENT = 10 * 60000;   // 重新開始練習時，這麼久之內剛答過的字也要先隔 LAG 題（iPhone 常在背景把 App 關掉，回來等於重開）
  var OLD_DAYS = 7;          // 搬家積欠分幾天做完（排在每日任務之後）
  var OLD_MAX = 21;          // 排在最後的舊字，每天時間用完就輪不到；搬家滿這麼多天後，每天把 oldDaily 個（等最久的先）放回一般複習
  /* 第 1、2 級快篩：以字義為單位、選擇題，每天最多 SCR_DAILY 個，排在新字之後。
     舊版快篩是以單字篩的，副意思（bank 的「河岸」）其實沒測過；第 1、2 級又排在新字池最後，
     等輪到時已經來不及。又快又對 → SCR_POS 階（30 天後再考一次）；不會 → 當場當新字學 */
  var SCR_DAILY = 100, SCR_LV = 2, SCR_POS = 4;
  var MISTAP = 500, STALL = 20000;                    // §6 誤觸 < 0.5 秒；被打斷 > max(20 秒, 3 × 中位數)
  var MIN_SAMPLE = 30, RT_KEEP = 200, CALIB_DAYS = 7; // §6 樣本不到 30 一律算慢、留最近 200 個、校正週 7 天
  var EST_DAYS = 14, EST_MIN_N = 30;                  // 預估每題秒數：看最近 14 天，至少 30 題才用實測值
  /* §8 新字的級數比例：每 10 個裡 3 級 4、4 級 4、5 級 2；3～5 級用完才輪到 2、1 級（最接近的級數遞補）。
     2026-10-16 改：基準測驗第 1、2 級 20/20，時間有限時先上 3～5 級；模擬每天 60 分鐘，
     到 1/10 沒碰到的只剩第 1、2 級（原本的比例會剩 478 個第 5 級）。見設計檔 §14 */
  var LV_MIX = [3, 4, 5, 3, 4, 3, 4, 5, 3, 4];
  var LV_FALLBACK = [3, 4, 5, 2, 1];
  var POOL_V = 3;   // 新字池的排法版本：舊存檔開 App 時照新比例重排一次（3：考卷重要字排最前面）

  /* ---------- 1. 小工具 ---------- */
  /* 亂數可以換成固定種子的版本，測試才重現得出來 */
  var rnd = Math.random;
  function setRandom(f) { rnd = f || Math.random; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  /* 日期一律用本機時區的 YYYY-MM-DD；「隔幾天」都對齊到當天 0 點 */
  function dateStr(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function parseDate(s) {
    var p = String(s).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]).getTime();
  }
  function dayStart(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(ms, n) { var d = new Date(dayStart(ms)); d.setDate(d.getDate() + n); return d.getTime(); }
  function shiftDate(s, n) { return dateStr(addDays(parseDate(s), n)); }
  function dayDiff(a, b) { return Math.round((parseDate(b) - parseDate(a)) / DAY); }   // b 比 a 晚幾天
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  /* ---------- 2. 例句與拼寫（沿用舊版 app.js） ---------- */
  /* "He {{abandoned}} the plan." → 前段 / 答案 / 後段 */
  function splitEx(en) {
    var m = en.match(/\{\{(.+?)\}\}/);
    if (!m) return { pre: en, ans: "", post: "" };
    return { pre: en.slice(0, m.index), ans: m[1], post: en.slice(m.index + m[0].length) };
  }
  function plainEx(en) { return en.replace(/\{\{(.+?)\}\}/g, "$1"); }
  function wordCount(en) { return plainEx(en).split(/\s+/).filter(Boolean).length; }
  function norm(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9' -]/g, "").replace(/\s+/g, " ").trim();
  }
  /* 判斷答案是原形的哪一種變化（舊版 formInfo 原封不動）。
     規則變化 → 字尾標在輸入框旁邊，只打字根也算對；不規則 → 只提醒注意時態。 */
  function formInfo(word, ans) {
    var w = String(word).toLowerCase(), a = String(ans).toLowerCase();
    if (a === w) return { suffix: "", tip: "" };
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

  /* ---------- 3. 中文釋義的比對（§8） ---------- */
  /* 選項上的中文：拿掉含英文的括號（「（account for）」會洩題），取第一個分號前，最多 12 字 */
  function shortZh(zh) {
    var t = String(zh).replace(/[（(][^（()）]*[A-Za-z][^（()）]*[）)]/g, "").trim();
    t = t.split(/[；;]/)[0].trim() || String(zh);
    return t.length > 12 ? t.slice(0, 12) : t;
  }
  /* 切成詞：去掉括號內容，用 ；，、/ … 切開。開頭的「的」去掉（「…的人」不該跟所有「的人」重疊） */
  function termsOf(zh) {
    return String(zh).replace(/[（(][^（()）]*[）)]/g, "")
      .split(/[；;，,、\/…]+|\.{3}/)
      .map(function (x) { return x.trim().replace(/^的/, ""); })
      .filter(function (x) { return x.length > 0; });
  }
  /* 有沒有重疊：完全相同，或（兩邊都至少 2 字時）一個包含另一個 */
  function overlap(a, b) {
    for (var i = 0; i < a.length; i++) {
      for (var j = 0; j < b.length; j++) {
        var x = a[i], y = b[j];
        if (x === y) return true;
        if (x.length >= 2 && y.length >= 2 && (x.indexOf(y) > -1 || y.indexOf(x) > -1)) return true;
      }
    }
    return false;
  }
  /* 編輯距離，超過 max 就提早放棄 */
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var low = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < low) low = cur[j];
      }
      if (low > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  /* §8 長得像：前 3 個字母相同，或編輯距離 ≤ 2 */
  function looksLike(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    if (a === b) return false;
    if (a.length >= 3 && b.length >= 3 && a.slice(0, 3) === b.slice(0, 3)) return true;
    return lev(a, b, 2) <= 2;
  }

  /* ---------- 4. 字庫索引 ---------- */
  var IX = null;
  /* 考卷重要字（data/prio.js，學測作戰室 data/單字/考卷統計/統計.py 產生）：字（小寫）→ 順位。
     101～115 學測英文，第 3～6 級「當過詞彙題答案，或在其他大題出現 ≥ 2 年」的字與片語，照文章出現年數排。
     只有第一個意思（si 0）排到新字池最前面，其他意思照級數比例 */
  var PRIO = {};
  function prioOf(s) { return s && s.si === 0 && PRIO[s.wl] != null ? PRIO[s.wl] : null; }
  /* 排程用的級數：有官方級數就用；片語比照第 3 級（§4）；表外的字比照第 5 級（只練到認得） */
  function levelOf(e) {
    if (e.lv >= 1) return e.lv;
    return e.ph ? 3 : 5;
  }
  /* bank ＝ window.WORD_BANK（data/*.js 透過 addWords() 填進來的） */
  function init(bank, prio) {
    var senses = {}, list = [], words = {}, byP = {};
    PRIO = {};
    (prio || []).forEach(function (w, i) { w = String(w).toLowerCase(); if (PRIO[w] == null) PRIO[w] = i; });
    (bank || []).forEach(function (e) {
      var wl = e.w.toLowerCase(), lv = levelOf(e), pc = {}, wt = [];
      e.s.forEach(function (s) {
        pc[s.p] = (pc[s.p] || 0) + 1;
        wt = wt.concat(termsOf(s.zh));
      });
      words[wl] = { e: e, lv: lv, terms: wt };
      e.s.forEach(function (s, si) {
        var o = {
          id: e.w + "::" + si, w: e.w, wl: wl, si: si, e: e, s: s, p: s.p, lv: lv,
          multi: pc[s.p] >= 2,          // §4 同一個字有兩個以上同詞性的字義 → A 一律換成 B
          spell: lv <= 3,               // §4 第 1～3 級要會拼（2026-10-21 從 1～4 級縮小，見設計檔 §14）
          short: shortZh(s.zh), terms: termsOf(s.zh), wt: wt
        };
        senses[wl + "::" + si] = o;
        list.push(o);
        (byP[s.p] = byP[s.p] || []).push(o);
      });
    });
    IX = { senses: senses, list: list, words: words, byP: byP, look: {} };
    return IX;
  }
  /* id（"abandon::0"）→ 字義資料；字庫裡已經沒有這個字義就回傳 null */
  function sense(id) {
    if (!IX || id == null) return null;
    var k = String(id), i = k.lastIndexOf("::");
    if (i < 0) return null;
    return IX.senses[k.slice(0, i).toLowerCase() + k.slice(i)] || null;
  }

  /* ---------- 5. 存檔（§3） ---------- */
  /* 補齊缺的欄位。讀檔、搬家、合併都走這裡；加欄位只要改這裡和 merge() */
  function normalize(o) {
    o = o || {};
    o.v = 2;
    o.items = o.items || {};
    o.pool = o.pool || [];
    o.log = o.log || {};
    o.rt = o.rt || {};
    var st = o.set = o.set || {};
    if (st.budget == null) st.budget = 75;        // 目標分鐘
    if (st.floor == null) st.floor = 30;          // 保底分鐘
    if (!st.install) st.install = dateStr(Date.now());
    if (!st.learnEnd) st.learnEnd = "2027-01-10"; // 這天之後不上新字
    if (!st.exam) st.exam = "2027-01-22";         // 學測第一天（考前總複習要在前兩天排完）
    if (st.maxLv == null) st.maxLv = 5;           // 新字只排到第幾級（沿用舊版「官方 1～5 級」）
    o.gone = o.gone || {};
    o.excl = o.excl || {};                        // 不進新字的字義：舊版快篩、畢業、刪除
    o.bad = o.bad || [];
    o.mtime = o.mtime || 0;
    o.born = o.born || 0;                         // 搬家（或從零開始）的時間：「重新搬家」後用來認出新的那份
    o.poolV = o.poolV || 0;                       // 新字池是照哪一版比例排的
    o.finalAt = o.finalAt || "";                  // 考前總複習排好的日期（只排一次）
    o.oldAt = o.oldAt || "";                      // 搬家積欠標成「舊字」的日期（只做一次）
    o.oldDaily = o.oldDaily || 0;                 // 舊字每天做幾個（總數的 1/OLD_DAYS）
    o.oldExp = o.oldExp || "";                    // 上次把舊字放回一般複習的日期（一天一次）
    o.scr = o.scr || [];                          // 第 1、2 級待快篩的字義（照順序）
    o.scrAt = o.scrAt || "";                      // 排好快篩清單的日期（只排一次）
    o.setV = o.setV || 0;                         // 設定的版本：舊存檔的預設值改了要跟著改
    if (o.setV < 1) { if (st.budget === 60) st.budget = 75; o.setV = 1; }   // 2026-10-21 每天 60 → 75 分
    Object.keys(o.items).forEach(function (k) {
      var it = o.items[k];
      if (!it.hardOk) it.hardOk = [];
      if (!it.conf) it.conf = {};
      ["pos", "seen", "right", "wrong", "lapses", "ce", "exi"].forEach(function (f) { if (it[f] == null) it[f] = 0; });
      if (it.lastUp == null) it.lastUp = "";
      if (it.lastDn == null) it.lastDn = "";
      if (it.lastAt == null) it.lastAt = 0;
      if (it.old == null) it.old = false;
    });
    return o;
  }
  function blank(now) { return normalize({ set: { install: dateStr(now) }, born: now }); }
  function newItem(s, now, src) {
    return {
      w: s.w, si: s.si,
      pos: 0, due: now,
      seen: 0, right: 0, wrong: 0,
      lapses: 0,          // v2 開始後的答錯次數（一天最多算一次）
      hard: false, hardOk: [],
      conf: {},           // 搞混對象：選錯的選項 → 次數
      ce: 0,              // 有把握（答得快）卻答錯的次數
      lastUp: "",         // 最後一次升級的日期：一天只能升一次
      lastDn: "",         // 最後一次降級的日期：一天只能降一次（同一天重考答錯不再扣）
      lastAt: 0,          // 最後一次作答的時間（ms）：重開練習時剛答過的不馬上考
      old: false,         // 搬家積欠的舊字（排在每日任務之後，作答一次就不再是）
      exi: 0,             // 下次用第幾句例句（B、S、學習卡輪流用）
      at: now, src: src || "new"
    };
  }

  /* 每天的紀錄：a 題數、c 答對、ms 實際練習時間、n 今天學的新字、q 今天的新字額度、
     h 今天練過的頑固字、p 先測過的新字；k 依題型分開記 {a, c, ms} */
  function dayLog(S, td) {
    var l = S.log[td];
    if (!l) l = S.log[td] = { a: 0, c: 0, ms: 0, n: 0, k: {} };
    if (!l.k) l.k = {};
    return l;
  }
  function kLog(l, t) { return l.k[t] || (l.k[t] = { a: 0, c: 0, ms: 0 }); }
  /* 介面每隔幾秒呼叫一次（90 秒沒動作就不要呼叫），累加今天實際練習的毫秒 */
  function tick(S, ms, now) { var l = dayLog(S, dateStr(now)); l.ms = (l.ms || 0) + ms; }
  /* 某題型額外花的時間（例如看答對答錯回饋），算每題平均秒數用 */
  function addTime(S, t, ms, now, isNew) {
    var l = dayLog(S, dateStr(now));
    kLog(l, t).ms += ms;
    if (isNew) l.nm = (l.nm || 0) + ms;     // 新字相關的時間另外記，估一個新字要幾秒用
  }
  /* 一個新字實際花幾秒：最近 14 天「新字相關時間 ÷ 學的新字數」，至少 30 個新字才用實測 */
  function newSec(S, now) {
    var n = 0, ms = 0, td = dateStr(now);
    for (var i = 1; i <= EST_DAYS; i++) {
      var l = S.log[shiftDate(td, -i)];
      if (l) { n += l.n || 0; ms += l.nm || 0; }
    }
    return n >= 30 && ms > 0 ? Math.max(10, ms / n / 1000) : NEW_SEC;
  }

  /* ---------- 6. 答題時間判斷（§6） ---------- */
  function inCalib(S, now) { return dayDiff(S.set.install, dateStr(now)) < CALIB_DAYS; }
  function median(a) {
    if (!a || !a.length) return null;
    var b = a.slice().sort(function (x, y) { return x - y; }), m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }
  /* 比較基準的 key：A、S；B 依句長分三組 */
  function rtKey(q) {
    if (q.fmt !== "B") return q.fmt;
    return q.words <= 10 ? "B10" : q.words <= 15 ? "B15" : "B99";
  }
  /* quick ＝ rt ≤ 同裝置同題型的中位數（對錯另外看）。
     record：這一題要不要進中位數（只收「先測」與一般複習的第一次作答；
     看完學習卡或答錯重考的那一題剛看過答案，會把中位數拉低） */
  function judge(S, dev, key, ok, rt, mc, hint, now, record) {
    var k = dev + "|" + key, arr = S.rt[k] || [];
    var med = arr.length >= MIN_SAMPLE ? median(arr) : null;
    var mistap = !!mc && rt < MISTAP;
    var stall = rt > Math.max(STALL, 3 * (med || 0));
    var calib = inCalib(S, now);
    var quick = !calib && med !== null && !mistap && !stall && !hint && rt <= med;
    if (record && ok && !mistap && !stall && !hint) {
      arr.push(Math.round(rt));
      if (arr.length > RT_KEEP) arr.splice(0, arr.length - RT_KEEP);
      S.rt[k] = arr;
    }
    return { quick: quick, mistap: mistap, stall: stall, med: med, calib: calib };
  }

  /* ---------- 7. 出題（§8） ---------- */
  /* §4 這個字義下次考什麼：A 看英文選中文、B 句子挖空、S 拼寫 */
  function fmtFor(it, s) {
    s = s || sense(it.w + "::" + it.si);
    if (!s) return null;
    var p = it.pos || 0, f;
    if (p <= 1 || (p === 2 && s.spell)) f = "A";   // 拼寫從第 3 階（隔 14 天）才考
    else if (s.spell) f = "S";
    else f = p % 2 === 0 ? "B" : "A";     // 第 5、6 級：pos 2、4、6 考 B，3、5 考 A
    if (f === "A" && s.multi) f = "B";
    return f;
  }

  /* 挑 3 個錯誤選項。
     mode "A"：選項是中文（某個字義）；"B"：選項是英文原形（整個字）。
     force：一定要放進來的字義（頑固字的搞混對象）。
     規則：同詞性、級數相差 ≤ 1；排除同一個字；排除中文跟這個字任何字義重疊的字；
     至少 1 個長得像的字。找不到就逐步放寬級數、最後放寬詞性，保證湊滿 3 個。 */
  function distractors(t, mode, force) {
    var out = [], usedW = {};
    usedW[t.wl] = 1;
    function fits(c) {
      if (usedW[c.wl]) return false;
      if (overlap(c.wt, t.wt)) return false;
      if (mode === "A" && c.short === t.short) return false;
      for (var i = 0; i < out.length; i++) {
        if (mode === "A") {
          if (c.short === out[i].short || overlap(c.terms, out[i].terms)) return false;
        } else if (overlap(c.wt, out[i].wt)) return false;
      }
      return true;
    }
    function take(c) { out.push(c); usedW[c.wl] = 1; }

    if (force) {
      var f = sense(force);
      if (f && fits(f)) take(f);
    }
    var same = IX.byP[t.p] || [];
    var tiers = [[same, 1], [same, 2], [same, 9], [IX.list, 9]];
    var i, k, c;
    var hasLook = out.some(function (o) { return looksLike(o.w, t.w); });
    /* 長得像的只在同詞性裡找：詞性不同的選項放進句子一眼就排除，沒有練習效果。
       同一個字同一個詞性的候選清單算一次就記住（每次都掃幾千個字算編輯距離，手機上會卡） */
    var lk = t.wl + "|" + t.p;
    var lookAll = IX.look[lk] || (IX.look[lk] = same.filter(function (o) { return looksLike(o.w, t.w); }));
    for (k = 0; k < 3 && !hasLook; k++) {
      var looks = lookAll.filter(function (o) {
        return Math.abs(o.lv - t.lv) <= tiers[k][1] && fits(o);
      });
      if (looks.length) { take(looks[Math.floor(rnd() * looks.length)]); hasLook = true; }
    }
    for (k = 0; k < tiers.length && out.length < 3; k++) {
      var arr = tiers[k][0], d = tiers[k][1];
      for (i = 0; i < 300 && out.length < 3 && arr.length; i++) {
        c = arr[Math.floor(rnd() * arr.length)];
        if (Math.abs(c.lv - t.lv) <= d && fits(c)) take(c);
      }
      if (out.length < 3) {   // 隨機抽不到：整串掃一遍
        var rest = shuffle(arr.slice());
        for (i = 0; i < rest.length && out.length < 3; i++) {
          if (Math.abs(rest[i].lv - t.lv) <= d && fits(rest[i])) take(rest[i]);
        }
      }
    }
    return out;
  }

  function optionsOf(t, ds, mode) {
    var opts = shuffle([t].concat(ds)).map(function (o) {
      return { id: o.id, t: mode === "A" ? o.short : o.w };
    });
    var ans = 0;
    opts.forEach(function (o, i) { if (o.id === t.id) ans = i; });
    return { opts: opts, ans: ans };
  }
  function exOf(s, exi) {
    var n = s.s.ex.length, i = (exi || 0) % n;
    return { ex: s.s.ex[i], i: i };
  }
  /* 挖空之後，句子別的地方還看得到這個字（例如 He {{broke}} the window ... lunch break）就是洩題 */
  function leaks(s, en) {
    var sp = splitEx(en), stem = (sp.pre + " " + sp.post).toLowerCase();
    return [sp.ans, s.w].some(function (w) {
      w = String(w).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return w && new RegExp("(^|[^a-z])" + w + "([^a-z]|$)").test(stem);
    });
  }
  /* 從第 exi 句開始找一句不洩題的；全部都洩題就回傳 leak: true */
  function exPick(s, exi) {
    var n = s.s.ex.length;
    for (var j = 0; j < n; j++) {
      var e = exOf(s, (exi || 0) + j);
      if (!leaks(s, e.ex.en)) return e;
    }
    var e0 = exOf(s, exi); e0.leak = true;
    return e0;
  }
  /* 出一題。fmt：A／B／S；force：A、B 一定要放的錯誤選項 */
  function makeQ(S, id, fmt, force) {
    var s = sense(id);
    if (!s) return null;
    var it = S.items[s.id], exi = it ? it.exi : 0;
    var base = { fmt: fmt, id: s.id, w: s.w, p: s.p, lv: s.lv, rawLv: s.e.lv, ph: !!s.e.ph };
    var o, e, sp;
    if (fmt === "A") {
      o = optionsOf(s, distractors(s, "A", force), "A");
      base.opts = o.opts; base.ans = o.ans; base.zh = s.s.zh;
      return base;
    }
    e = exPick(s, exi);
    if (e.leak && fmt === "B") return makeQ(S, id, "A", force);   // 每句都洩題：改出 A（不用句子）
    sp = splitEx(e.ex.en);
    base.pre = sp.pre; base.post = sp.post; base.form = sp.ans;
    base.en = plainEx(e.ex.en); base.exZh = e.ex.zh; base.exi = e.i;
    base.zh = s.s.zh;
    if (fmt === "B") {
      o = optionsOf(s, distractors(s, "B", force), "B");
      base.opts = o.opts; base.ans = o.ans;
      base.words = wordCount(e.ex.en);
      return base;
    }
    var fi = formInfo(s.w, sp.ans);
    base.len = sp.ans.length; base.suffix = fi.suffix; base.tip = fi.tip;
    base.maxHint = sp.ans.indexOf(" ") > -1 ? 1 : 2;   // 片語給每個字的開頭；單字最多給 2 個字母
    return base;
  }
  /* 拼寫判對：打完整形或（有字尾提示時）只打字根都算對 */
  function checkSpell(q, input) {
    return norm(input) === norm(q.form) ||
      (!!q.suffix && norm(input + q.suffix) === norm(q.form));
  }
  /* 字母提示：n ＝ 按了幾次提示 */
  function hintMask(q, n) {
    var ans = q.form;
    if (ans.indexOf(" ") > -1) {
      return ans.split(" ").map(function (w) {
        return w.charAt(0) + new Array(Math.max(w.length, 1)).join("_");
      }).join(" ");
    }
    return ans.split("").map(function (ch, i) { return (i < n || ch === "-") ? ch : "_"; }).join("");
  }
  /* 學習卡（§5）：字、詞性、級數、這個字義的中文、例句與中譯；其他字義小字列出。all：列出全部例句（頑固字用） */
  function card(S, id, all) {
    var s = sense(id);
    if (!s) return null;
    var it = S.items[s.id], exs = all ? s.s.ex : [exOf(s, it ? it.exi : 0).ex];
    return {
      id: s.id, w: s.w, p: s.p, lv: s.lv, rawLv: s.e.lv, ph: !!s.e.ph, zh: s.s.zh,
      ex: exs.map(function (x) { var sp = splitEx(x.en); return { pre: sp.pre, form: sp.ans, post: sp.post, en: plainEx(x.en), zh: x.zh }; }),
      others: s.e.s.map(function (x, i) { return { si: i, p: x.p, zh: x.zh }; })
        .filter(function (x) { return x.si !== s.si; })
    };
  }
  function topConf(it) {
    var best = null, n = 0;
    Object.keys(it.conf || {}).forEach(function (k) {
      if (it.conf[k] > n && sense(k)) { best = sense(k).id; n = it.conf[k]; }
    });
    return best;
  }

  /* ---------- 8. 今天要練什麼（§5） ---------- */
  function isDue(it, now) { return it.due < addDays(now, 1); }    // 今天之內到期都算
  function overdue(it, now) { return (now - it.due) / ((INT[it.pos] || 1) * DAY); }
  /* 複習：先排 ce > 0（有把握卻錯），再排 pos 低的，同 pos 先排逾期比例高的 */
  function reviewDue(S, now) {
    var end = addDays(now, 1), out = [];
    Object.keys(S.items).forEach(function (id) {
      var it = S.items[id];
      if (!it.hard && !it.old && it.due < end && sense(id)) out.push(id);
    });
    out.sort(function (a, b) {
      var x = S.items[a], y = S.items[b];
      return ((y.ce > 0) - (x.ce > 0)) || (x.pos - y.pos) || (overdue(y, now) - overdue(x, now));
    });
    return out;
  }
  /* 舊字（搬家積欠）：錯得多的先，再來逾期久的 */
  function oldDue(S, now) {
    var end = addDays(now, 1), out = [];
    Object.keys(S.items).forEach(function (id) {
      var it = S.items[id];
      if (it.old && !it.hard && it.due < end && sense(id)) out.push(id);
    });
    out.sort(function (a, b) { var x = S.items[a], y = S.items[b]; return (y.wrong - x.wrong) || (x.due - y.due); });
    return out;
  }
  /* 快篩：今天還能做幾個 */
  function scrLeftToday(S, now) {
    if (dateStr(now) > S.set.learnEnd) return 0;     // 過了停止上新字的那天就不快篩（不會的也來不及學）
    var l = S.log[dateStr(now)] || {};
    return Math.min(S.scr.length, Math.max(0, SCR_DAILY - (l.sc || 0)));
  }
  function removeFromScr(S, id) {
    var i = S.scr.indexOf(id);
    if (i > -1) S.scr.splice(i, 1);
  }
  /* 排快篩清單（只做一次）：新字池裡第 1、2 級的字義，加上舊版快篩（整個字）順帶排除的副意思。
     它們從新字池拿掉，改由快篩處理 */
  function markScreen(S, now) {
    if (S.scrAt) return 0;
    S.scrAt = dateStr(now);
    var list = [], seen = {};
    function add(id) { var x = sense(id); if (x && x.lv <= SCR_LV && !S.items[x.id] && !S.gone[x.id] && !seen[x.id]) { seen[x.id] = 1; list.push(x.id); } }
    S.pool.forEach(add);           // 照新字池的順序（搬家退回的新字在最前面）
    Object.keys(S.excl).forEach(function (id) { if (!/::0$/.test(id)) add(id); });
    S.pool = S.pool.filter(function (id) { return !seen[id]; });
    list.forEach(function (id) { delete S.excl[id]; });
    S.scr = list;
    var l = S.log[S.scrAt];
    if (l) delete l.q;        // 今天的新字額度重算（要扣掉快篩的時間）
    return list.length;
  }
  function oldLeftToday(S, now) {
    var l = S.log[dateStr(now)] || {};
    return Math.max(0, S.oldDaily - (l.o || 0));
  }
  /* 搬家積欠：今天到期的量超過每天的時間預算時，把它們標成「舊字」——排在每日任務（新字、頑固字、
     今天正常到期的複習）之後，每天做總數的 1/OLD_DAYS，錯得多的先。只做一次。
     少了這段，搬家後幾天複習就吃掉全部時間、新字是 0，也看不到拼寫題（2026-10-20 使用者實測） */
  function markOld(S, now) {
    if (S.oldAt) return 0;
    S.oldAt = dateStr(now);
    var e = estimate(S, now);
    if (e.rev <= S.set.budget * 60) return 0;
    var end = addDays(now, 1), n = 0;
    Object.keys(S.items).forEach(function (id) {
      var it = S.items[id];
      if (!it.hard && it.due < end && sense(id)) { it.old = true; n++; }
    });
    S.oldDaily = Math.ceil(n / OLD_DAYS);
    var l = S.log[S.oldAt];
    if (l) delete l.q;        // 今天的新字額度重算（標完舊字後就有時間上新字了）
    return n;
  }
  /* 頑固字：等最久的先練（due 早的先），一樣久再看 ce 高的。
     原本 ce 優先、每天 10 個，虛擬 30 天裡有 160 多個頑固字超過一週沒輪到（設計檔 §14） */
  function hardDue(S, now) {
    var end = addDays(now, 1), out = [];
    Object.keys(S.items).forEach(function (id) {
      var it = S.items[id];
      if (it.hard && it.due < end && sense(id)) out.push(id);
    });
    out.sort(function (a, b) {
      var x = S.items[a], y = S.items[b];
      return (x.due - y.due) || (y.ce - x.ce);
    });
    return out;
  }
  /* 每題平均秒數：最近 14 天的實測（含看回饋的時間）；不到 30 題用預設值 */
  function secPer(S, t, now) {
    var a = 0, ms = 0, td = dateStr(now);
    for (var i = 1; i <= EST_DAYS; i++) {
      var l = S.log[shiftDate(td, -i)];
      if (l && l.k && l.k[t]) { a += l.k[t].a || 0; ms += l.k[t].ms || 0; }
    }
    return a >= EST_MIN_N ? ms / a / 1000 : DEF_SEC[t];
  }
  /* 最近 14 天的答錯率：答錯的會在當天重考一次，估時間要算進去（沒有紀錄時 35%）。
     2026-10-20 加：少了這段，重考每天約 12 分鐘沒算到，排在最後的舊字一直輪不到 */
  function wrongRate(S, now) {
    var a = 0, c = 0, td = dateStr(now);
    for (var i = 1; i <= EST_DAYS; i++) { var l = S.log[shiftDate(td, -i)]; if (l) { a += l.a || 0; c += l.c || 0; } }
    return a >= 100 ? Math.min(0.6, Math.max(0.1, 1 - c / a)) : 0.35;
  }
  function estimate(S, now) {
    var sec = { A: secPer(S, "A", now), B: secPer(S, "B", now), S: secPer(S, "S", now), C: secPer(S, "C", now), P: secPer(S, "P", now) };
    var end = addDays(now, 1), rev = 0, nRev = 0, nHard = 0, nOld = 0;
    Object.keys(S.items).forEach(function (id) {
      var it = S.items[id], s = sense(id);
      if (!s || !(it.due < end)) return;
      if (it.hard) { nHard++; return; }
      if (it.old) { nOld++; return; }
      rev += sec[fmtFor(it, s)]; nRev++;
    });
    var l = S.log[dateStr(now)] || {};
    var hardN = Math.min(nHard, Math.max(0, HARD_MAX - (l.h || 0)));
    var oldN = Math.min(nOld, oldLeftToday(S, now)), wr = 1 + wrongRate(S, now);
    var scrN = scrLeftToday(S, now);
    return { sec: sec, rev: rev * wr, nRev: nRev, hardN: hardN, hard: hardN * (sec.C + sec.A) * wr,
      oldN: oldN, oldAll: nOld, old: oldN * sec.A * wr, scrN: scrN, scr: scrN * sec.P * wr };
  }
  /* 前兩天（都在開始使用之後）實際時間都不到預算的一半 → 新字減半 */
  function slowStart(S, td) {
    var half = S.set.budget * 60000 / 2;
    for (var i = 1; i <= 2; i++) {
      var d = shiftDate(td, -i);
      if (d < S.set.install) return false;
      if (((S.log[d] || {}).ms || 0) >= half) return false;
    }
    return true;
  }
  /* §5 新字數 = clamp(round((預算秒數 − 預估複習 − 頑固字預估) / 20), 0, 80) */
  function newQuota(S, now) {
    var td = dateStr(now);
    if (td > S.set.learnEnd) return 0;
    var e = estimate(S, now);
    var n = Math.round((S.set.budget * 60 - e.rev - e.hard - e.old - e.scr) / newSec(S, now));
    n = Math.max(0, Math.min(NEW_MAX, n));
    if (slowStart(S, td)) n = Math.round(n / 2);
    return Math.min(n, S.pool.length);
  }
  /* 今天的新字額度在當天第一次算的時候固定下來（記在 log.q），之後不隨複習進度變動 */
  function dayPlan(S, now) {
    var l = dayLog(S, dateStr(now));
    if (l.q == null) l.q = newQuota(S, now);
    return { q: l.q, n: l.n || 0, left: Math.max(0, l.q - (l.n || 0)) };
  }
  /* 首頁要顯示的數字 */
  function homeInfo(S, now) {
    var td = dateStr(now), plan = dayPlan(S, now), e = estimate(S, now), l = S.log[td];
    var ms = l.ms || 0;
    return {
      td: td, ms: ms, budget: S.set.budget, floor: S.set.floor,
      newLeft: plan.left, newMin: Math.round(plan.left * newSec(S, now) / 60),
      hard: e.hardN, hardMin: Math.round(e.hard / 60),
      rev: e.nRev, revMin: Math.round(e.rev / 60),
      old: e.oldN, oldAll: e.oldAll, oldMin: Math.round(e.old / 60),
      scr: e.scrN, scrAll: S.scr.length, scrMin: Math.round(e.scr / 60),
      done: ms >= S.set.budget * 60000,
      floorMet: plan.left === 0 && ms >= S.set.floor * 60000,
      calib: inCalib(S, now), noNew: td > S.set.learnEnd,
      final: !!S.finalAt && td < S.set.exam      // 考前總複習期間
    };
  }

  /* ---------- 9. 新字排隊（§8） ---------- */
  /* 依級數比例混合；某級用完由最接近的級數遞補 */
  function mixByLevel(ids) {
    var lists = {}, pr = [];
    ids.forEach(function (id) {
      var s = sense(id), lv = s ? Math.min(Math.max(s.lv, 1), 5) : 5;
      if (prioOf(s) != null) { pr.push(id); return; }      // 考卷重要字：另外排，放最前面
      (lists[lv] = lists[lv] || []).push(id);
    });
    pr.sort(function (a, b) { return prioOf(sense(a)) - prioOf(sense(b)); });
    var rest = ids.length - pr.length;
    Object.keys(lists).forEach(function (k) { shuffle(lists[k]); });
    var out = [], k = 0;
    while (out.length < rest) {
      var lv = LV_MIX[k++ % LV_MIX.length], L = lists[lv];
      /* 這一級用完：依 3 → 4 → 5 → 2 → 1 遞補（3～5 級全部排完才輪到 1、2 級） */
      for (var f = 0; (!L || !L.length) && f < LV_FALLBACK.length; f++) L = lists[LV_FALLBACK[f]];
      out.push(L.shift());
    }
    return pr.concat(out);
  }
  /* 清掉 pool 裡失效的 id，並把字庫裡新加、還沒排進來的字義接在後面 */
  function refreshPool(S) {
    var inPool = {}, keep = [];
    S.scr.forEach(function (id) { inPool[id] = 1; });
    S.pool.forEach(function (id) {
      var s = sense(id);
      if (s && !S.items[s.id] && !S.excl[s.id] && !inPool[s.id]) { inPool[s.id] = 1; keep.push(s.id); }
    });
    var add = IX.list.filter(function (s) {
      return (s.lv <= S.set.maxLv || prioOf(s) != null) && !S.items[s.id] && !S.excl[s.id] && !S.gone[s.id] && !inPool[s.id];   // 第 6 級的考卷重要字也排
    }).map(function (s) { return s.id; });
    S.pool = keep.concat(mixByLevel(add));
    if (S.poolV < POOL_V) { S.pool = mixByLevel(S.pool); S.poolV = POOL_V; }   // 舊比例排的：重排一次
    return add.length;
  }
  /* 從 pool 前面取一批：同一批不放前 3 字母相同的字、不放中文重疊的字 */
  function drawBatch(S, n) {
    var out = [], i = 0, look = 0;
    function clash(a, b) {
      return a.wl.slice(0, 3) === b.wl.slice(0, 3) || overlap(a.terms, b.terms);
    }
    while (i < S.pool.length && out.length < n && look < 60) {
      var s = sense(S.pool[i]);
      if (!s || S.items[s.id]) { S.pool.splice(i, 1); continue; }
      look++;
      if (!out.some(function (o) { return clash(sense(o), s); })) out.push(s.id);
      i++;
    }
    /* 往後看了 60 個還湊不滿（幾乎不會發生）：不管限制，照順序補 */
    for (i = 0; i < S.pool.length && out.length < n; i++) {
      if (out.indexOf(S.pool[i]) < 0 && sense(S.pool[i])) out.push(S.pool[i]);
    }
    return out;
  }
  function removeFromPool(S, id) {
    var i = S.pool.indexOf(id);
    if (i > -1) S.pool.splice(i, 1);
  }

  /* ---------- 10. 一次練習（§5） ----------
     原則：每一題都先作答、後看答案（學習科學.md 第五節第 1 條）。卡片只在答錯（或還不會）之後當回饋，
     不放在考題前面；要再考的一律隔 LAG 題。
     順序：答錯後的回饋卡 → 隔夠了的再考 → 新字先測（一批 5 個）→ 頑固字（先考）→ 複習 → 結束。
     用法：st = next(S, sess, now) 拿下一步；
       st.kind "P"／"Q"：出題（st.q），作答後 submit(S, sess, st, res, now)
       st.kind "C"／"H"：學習卡／對照卡，看完 cardDone(S, sess, st, ms, now)
       st.kind "done"：今天能練的都練完了
     練習進行到一半關掉也沒關係：所有結果在 submit 當下就寫進 S，下次 startSession 從 S 重新排。 */
  /* 考前總複習：停止上新字（learnEnd）之後第一次練習時，把考前不會再到期的字（頑固字除外）
     從今天起平均排到考前兩天，階低、錯過多的先。只排一次。
     記憶模擬：每天 60 分鐘，考試當天「熟」從約 72% 到約 81%【估計】，見設計檔 §14 */
  function finalReview(S, now) {
    var td = dateStr(now), last = shiftDate(S.set.exam, -2), examDay = parseDate(S.set.exam);
    if (S.finalAt || td <= S.set.learnEnd || td >= S.set.exam) return 0;
    var far = Object.keys(S.items).filter(function (id) {
      var it = S.items[id];
      return !it.hard && it.due >= examDay && sense(id);
    });
    far.sort(function (a, b) {
      var x = S.items[a], y = S.items[b];
      return (x.pos - y.pos) || (y.lapses - x.lapses) || (y.wrong - x.wrong) || (x.due - y.due);
    });
    var days = Math.max(1, dayDiff(td, last) + 1);
    far.forEach(function (id, i) {
      S.items[id].due = addDays(parseDate(td), Math.min(days - 1, Math.floor(i * days / far.length)));
    });
    S.finalAt = td;
    return far.length;
  }
  function expireOld(S, now) {
    var td = dateStr(now);
    if (!S.oldAt || S.oldExp === td || dayDiff(S.oldAt, td) < OLD_MAX) return 0;
    S.oldExp = td;
    var ids = Object.keys(S.items).filter(function (id) { return S.items[id].old; });
    ids.sort(function (a, b) { return S.items[a].due - S.items[b].due; });
    ids = ids.slice(0, Math.max(1, S.oldDaily));
    ids.forEach(function (id) { S.items[id].old = false; });
    return ids.length;
  }
  function startSession(S, now, dev) {
    finalReview(S, now);
    expireOld(S, now);
    var td = dateStr(now), plan = dayPlan(S, now), l = dayLog(S, td);
    /* 剛答過（RECENT 之內）又到期的字——通常是答錯後頁面被重開——不放進複習清單，照樣先隔 LAG 題。
       少了這段，重開之後它們因為 pos 低反而排在最前面，等於看完答案馬上考 */
    var rev = [], hard = [], later = [];
    function recent(it) { return it.lastAt && now - it.lastAt < RECENT; }
    reviewDue(S, now).forEach(function (id) {
      var it = S.items[id];
      if (recent(it)) later.push({ id: id, ph: it.pos === 0 && it.src === "new" && !it.lastUp ? "learn" : "review", at: LAG });
      else rev.push(id);
    });
    hardDue(S, now).slice(0, Math.max(0, HARD_MAX - (l.h || 0))).forEach(function (id) {
      if (recent(S.items[id])) later.push({ id: id, ph: "hard", at: LAG });   // 例如剛在複習答錯、變成頑固字
      else hard.push(id);
    });
    return {
      td: td, dev: dev || "dev",
      newLeft: plan.left,
      batch: null,
      hardQ: hard,
      revQ: rev,
      scrQ: S.scr.slice(0, scrLeftToday(S, now)),            // 新字之後
      oldQ: oldDue(S, now).slice(0, oldLeftToday(S, now)),   // 每日任務做完才輪到
      later: later,     // 要再考的：{ id, ph, at }，at ＝ 答到第幾題之後才能考
      fb: [],           // 剛答錯、馬上要看的回饋卡
      n: 0,             // 這次練習答了幾題
      deferred: 0,      // 隔不開、留到明天的
      cur: null,
      events: []
    };
  }
  /* 隔夠了的再考。新字、頑固字的隨時穿插（那是看完卡片後第一次真正的提取）；
     複習答錯的要等今天到期的都看過一輪才考——時間少、積欠多的日子，先照顧還沒看過的字，
     重考留到明天（隔一天也是更長的間隔）。模擬比較見設計檔 §14。 */
  function readyLater(sess) {
    var revDone = !sess.revQ.length;
    for (var i = 0; i < sess.later.length; i++) {
      var x = sess.later[i];
      if (x.at <= sess.n && (x.ph !== "review" || revDone)) return i;
    }
    return -1;
  }
  /* 練習結束（練完或按「結束」）：還隔不開的留到明天 */
  function endSession(S, sess, now) {
    sess.later.forEach(function (x) {
      var it = S.items[x.id];
      if (it) { it.due = Math.max(it.due, addDays(now, 1)); sess.deferred++; }
    });
    sess.later = [];
  }
  function next(S, sess, now) {
    if (sess.cur && !sess.cur.done) return sess.cur;   // 還沒作答就不換題（切頁回來不會跳題）
    var st = null;
    if (sess.fb.length) st = sess.fb.shift();
    while (!st) {
      var k = readyLater(sess);
      if (k > -1) {
        var x = sess.later.splice(k, 1)[0];
        if (!S.items[x.id] || !sense(x.id)) continue;
        st = { kind: "Q", ph: "retry", sub: x.ph, id: x.id };
        break;
      }
      var b = sess.batch;
      if (b) {
        if (b.pre.length) { st = { kind: "P", ph: "pre", id: b.pre[0] }; break; }
        sess.batch = null;
      }
      if (sess.newLeft > 0 && dateStr(now) <= S.set.learnEnd) {
        var ids = drawBatch(S, Math.min(BATCH, sess.newLeft));
        if (ids.length) { sess.batch = { pre: ids }; continue; }
      }
      sess.newLeft = 0;
      while (sess.scrQ.length) {
        var c = sess.scrQ[0];
        if (S.items[c] || !sense(c)) { sess.scrQ.shift(); removeFromScr(S, c); continue; }
        st = { kind: "P", ph: "screen", id: c };
        break;
      }
      if (st) break;
      while (sess.hardQ.length) {
        var h = sess.hardQ[0], hi = S.items[h];
        if (!hi || !hi.hard || !sense(h)) { sess.hardQ.shift(); continue; }
        st = { kind: "Q", ph: "hard", id: h };
        break;
      }
      if (st) break;
      while (sess.revQ.length) {
        var r = sess.revQ[0], ri = S.items[r];
        if (!ri || ri.hard || !sense(r) || !isDue(ri, now)) { sess.revQ.shift(); continue; }
        st = { kind: "Q", ph: "review", id: r };
        break;
      }
      if (st) break;
      while (sess.oldQ.length) {
        var o = sess.oldQ[0], oi = S.items[o];
        if (!oi || oi.hard || !oi.old || !sense(o) || !isDue(oi, now)) { sess.oldQ.shift(); continue; }
        st = { kind: "Q", ph: "review", old: true, id: o };
        break;
      }
      if (st) break;
      endSession(S, sess, now);
      st = { kind: "done" };
    }
    if (st.kind === "P" || st.kind === "Q") st.q = buildQ(S, st);
    if (st.kind === "C" && !st.card) st.card = card(S, st.id, st.ph === "hard");
    sess.cur = st;
    return st;
  }
  function buildQ(S, st) {
    var s = sense(st.id), it = S.items[s.id], ph = st.ph === "retry" ? st.sub : st.ph;
    var mcFmt = s.multi ? "B" : "A";
    if (ph === "pre" || ph === "learn" || ph === "screen") return makeQ(S, s.id, mcFmt);
    if (ph === "hard") return makeQ(S, s.id, mcFmt, topConf(it));
    return makeQ(S, s.id, fmtFor(it, s));
  }
  /* §7 頑固字答錯之後的回饋：有搞混對象 → 對照卡；沒有 → 學習卡（列出全部例句） */
  function hardCard(S, id) {
    var it = S.items[id], vs = topConf(it);
    if (vs) return { kind: "H", ph: "hard", id: id, vs: vs, times: it.conf[vs] || it.conf[vs.toLowerCase()] || 0, card: card(S, id, false), card2: card(S, vs, false) };
    return { kind: "C", ph: "hard", id: id, card: card(S, id, true) };
  }
  function cardDone(S, sess, st, ms, now) {
    if (st.done) return;
    st.done = true;
    var td = dateStr(now), k = kLog(dayLog(S, td), "C");
    k.a++; k.ms += ms || 0;
    if (st.ph === "learn") { var dl = dayLog(S, td); dl.nm = (dl.nm || 0) + (ms || 0); }
    if (st.ph === "learn") {
      var it = S.items[st.id];
      if (it) it.exi++;   // 學習卡用掉一句例句，之後的 B 題換下一句
      if (st.calOk) {
        /* 校正週：先測答對的看完卡片直接 pos 1 */
        it.pos = Math.max(it.pos, 1); it.lastUp = td; it.due = addDays(now, 1);
      } else sess.later.push({ id: st.id, ph: "learn", at: sess.n + LAG });   // 隔 LAG 題才考第一次
    }
  }

  /* §4 升降規則（一般複習）。回傳發生了什麼，給介面與測試看 */
  function ladder(it, ok, j, mc, unknown, hint, td, now) {
    if (mc && j.mistap && !unknown) {   // 「不知道」是故意按的，再快也不算誤觸
      if (ok) { it.due = Math.max(it.due, addDays(now, 1)); return "mistap"; }  // 答對但太快：不升級，明天再考
      return "void";                                                           // 誤觸點錯：不算，排到最後重考
    }
    if (ok) {
      if (it.lastDn === td || it.lastUp === td) {   // 今天降過（這是重考）或今天升過：不動，明天再考
        it.due = Math.max(it.due, addDays(now, 1));
        return "hold";
      }
      var step = (j.quick && !hint && it.pos >= 1) ? 2 : 1;
      it.pos = Math.min(MAXPOS, it.pos + step);
      it.lastUp = td;
      it.due = addDays(now, INT[it.pos]);
      return step === 2 ? "up2" : "up1";
    }
    if (j.quick && !unknown) it.ce++;              // 答錯而且快：有把握卻錯
    it.due = now;                                   // 排到本次最後；沒練到就留在今天
    if (it.lastDn === td) return "again";
    it.lapses++;
    it.pos = Math.max(0, it.pos - 1);
    it.lastDn = td;
    if (it.lapses >= HARD_IN && !it.hard) { it.hard = true; it.hardOk = []; return "hard"; }
    return "down";
  }
  /* §7 頑固字的考題 */
  function hardStep(it, ok, td, now) {
    it.due = addDays(now, 1);
    if (!ok) { it.lastDn = td; return "hardMiss"; }
    if (it.lastDn === td) return "hardHold";        // 今天答錯過，重考答對不算
    if (it.hardOk.indexOf(td) < 0) it.hardOk.push(td);
    if (it.hardOk.length >= HARD_OUT) {
      it.hard = false; it.hardOk = []; it.lapses = 0; it.pos = 1; it.lastUp = td;
      return "graduate";
    }
    return "hardOk";
  }

  /* 作答。res：
       選擇題 { pick: 選項的 id 或 "?"（不知道）, rt, dur }
       拼寫   { input, pick: "?" 表示放棄, rt（出題到按下第一個鍵）, dur, hint: 用了幾次提示 }
     rt：判斷快慢用的毫秒；dur：這題總共花的毫秒（含打字），算每題平均秒數用 */
  function submit(S, sess, st, res, now) {
    if (st.done) return st.result;      // 同一題不會算兩次
    st.done = true;
    var q = st.q, s = sense(st.id), id = s.id, td = dateStr(now);
    var mc = q.fmt !== "S", unknown = res.pick === "?";
    var ok = mc ? res.pick === id : (!unknown && checkSpell(q, res.input || ""));
    var it = S.items[id], posB = it ? it.pos : -1;
    if (!it) { it = S.items[id] = newItem(s, now, "new"); removeFromPool(S, id); }
    var ph = st.ph === "retry" ? st.sub : st.ph;
    var hint = mc ? 0 : (res.hint || 0);
    var j = judge(S, sess.dev, rtKey(q), ok, res.rt || 0, mc, hint, now, ph === "pre" || ph === "screen" || st.ph === "review");
    /* 一般複習答錯：先存一份答題前的狀態，「我選的也說得通」時用 undo() 還原（只有這裡會扣分） */
    var prev = ph === "review" && !ok ? clone(it) : null;

    it.seen++;
    it.lastAt = now;
    if (ok) it.right++; else it.wrong++;
    if (!ok && mc && !unknown && res.pick && sense(res.pick)) {
      var pk = sense(res.pick).id;
      if (pk !== id) it.conf[pk] = (it.conf[pk] || 0) + 1;
    }
    if (q.fmt !== "A") it.exi++;        // B、S 用掉一句例句，下次換一句

    var l = dayLog(S, td), out, again = false;
    if (ph === "pre") {
      l.p = (l.p || 0) + 1;
      sess.batch.pre.shift();
      if (ok && j.quick) {
        /* 又快又對：已經會了，14 天後再考（第 1～3 級那次就是拼寫） */
        it.pos = 3; it.lastUp = td; it.due = addDays(now, INT[3]);
        out = "known";
      } else {
        it.pos = 0; it.due = now;
        l.n = (l.n || 0) + 1;
        sess.newLeft = Math.max(0, sess.newLeft - 1);
        sess.fb.push({ kind: "C", ph: "learn", id: id, calOk: ok && j.calib });   // 先測完馬上看學習卡（回饋）
        out = "learn";
      }
    } else if (ph === "screen") {
      l.sc = (l.sc || 0) + 1;
      sess.scrQ.shift();
      removeFromScr(S, id);
      delete S.excl[id];
      if (ok && (j.quick || j.calib)) {
        /* 又快又對（校正週還不判斷快慢，答對就算）：會了，30 天後再考一次（選擇題可能是猜的，考前也至少再檢查一次） */
        it.pos = SCR_POS; it.lastUp = td; it.due = addDays(now, INT[SCR_POS]);
        out = "known30";
      } else if (ok) {
        /* 答對但想比較久：提取成功了，不用看學習卡，明天再考 */
        it.pos = 1; it.lastUp = td; it.due = addDays(now, 1);
        out = "learned";
      } else {
        it.pos = 0; it.due = now;
        l.n = (l.n || 0) + 1;
        sess.fb.push({ kind: "C", ph: "learn", id: id, calOk: ok && j.calib });
        out = "learn";
      }
    } else if (ph === "learn") {
      if (ok) { it.pos = Math.max(it.pos, 1); it.lastUp = td; it.due = addDays(now, 1); out = "learned"; }
      else { it.due = now; out = "relearn"; again = true; }
    } else if (ph === "hard") {
      if (st.ph === "hard") l.h = (l.h || 0) + 1;
      out = hardStep(it, ok, td, now);
      again = !ok;
    } else {
      out = ladder(it, ok, j, mc, unknown, hint, td, now);
      again = out === "down" || out === "again" || out === "hard" || out === "void";
    }

    /* 從所在的佇列拿掉；要再考的隔 LAG 題（頑固字答錯先看回饋卡） */
    if (st.ph === "hard") sess.hardQ.shift();
    else if (st.ph === "review") { if (st.old) sess.oldQ.shift(); else sess.revQ.shift(); }
    if (st.old) { it.old = false; l.o = (l.o || 0) + 1; }
    sess.n++;
    if (again) {
      if (ph === "hard") sess.fb.push(hardCard(S, id));
      sess.later.push({ id: id, ph: ph === "learn" || ph === "hard" ? ph : "review", at: sess.n + LAG });
    }

    l.a++; if (ok) l.c++;
    var kt = st.kind === "P" ? "P" : q.fmt, kk = kLog(l, kt);
    kk.a++; if (ok) kk.c++; kk.ms += res.dur || 0;
    if (ph === "pre" || ph === "learn" || out === "learn") l.nm = (l.nm || 0) + (res.dur || 0);   // 新字相關的時間（快篩不會、當場學的也算）

    /* §3 答題事件：[時間戳(秒), id, 題型, 對錯, rt, 選了誰, pos前, pos後, 裝置] */
    var pick = mc ? (res.pick || "?") : (unknown ? "?" : norm(res.input || ""));
    var ev = [Math.floor(now / 1000), id, kt, ok ? 1 : 0, Math.round(res.rt || 0), pick, posB, it.pos, sess.dev];
    sess.events.push(ev);

    var picked = mc && !ok && !unknown ? sense(res.pick) : null;
    st.result = {
      ok: ok, out: out, quick: ok && j.quick, fmt: q.fmt, posB: posB, pos: it.pos,
      form: q.form || "", ans: q.ans,
      picked: picked ? { id: picked.id, w: picked.w, zh: picked.short } : null,   // 「你選的『吸收』是 absorb」
      j: j, ev: ev, prev: prev
    };
    return st.result;
  }

  /* 「我選的也說得通」：這題作廢、不扣分。字義還原成答題前的狀態（含 lapses、pos、搞混對象、
     有沒有因此變成頑固字），明天再考；從本次的重考清單拿掉；另記一筆題型 "X" 的事件，
     之後用答題事件校正參數時可以把這題排除。只有一般複習的答錯能用（其他情況答錯本來就不扣分）。 */
  function undo(S, sess, st, now) {
    var r = st.result;
    if (!r || r.ok || !r.prev || r.undone) return false;
    var id = sense(st.id).id, it = clone(r.prev);
    it.due = Math.max(it.due, addDays(now, 1));
    S.items[id] = it;
    for (var i = sess.later.length - 1; i >= 0; i--) {
      if (sess.later[i].id === id) { sess.later.splice(i, 1); break; }
    }
    sess.events.push([Math.floor(now / 1000), id, "X", 0, 0, r.ev[5], r.pos, it.pos, sess.dev]);
    r.undone = true;
    return true;
  }

  /* 「回報有問題」：格式同舊版 { w, p, en, zh }，多記題型與選項 */
  /* picked：答錯時選了哪個選項（「我選的也說得通」），修字庫時才知道是哪個錯誤選項有問題 */
  function report(S, q, now, picked) {
    var s = sense(q.id), r = {
      w: s ? s.w : q.w, p: s ? s.p : q.p, en: q.en || "", zh: q.exZh || q.zh || "",
      t: q.fmt, o: q.opts ? q.opts.map(function (o) { return o.t; }).join(" / ") : "",
      d: dateStr(now)
    };
    if (picked) r.pk = picked;
    S.bad.push(r);
  }

  /* ---------- 11. 搬家（§9） ---------- */
  /* v1 ＝ 舊版存檔（localStorage["vocabApp_v1"] 或 gist 的 vocab-progress.json）。
     只讀不寫：v1 物件不會被改動。回傳 { S: 新存檔, sum: 各類幾個 } */
  function migrate(v1, now) {
    var S = blank(now);
    var sum = { back: 0, hard: 0, wb: 0, box5: 0, box24: 0, box01: 0, missing: 0, grad: 0, excl: 0, pool: 0 };
    v1 = v1 || {};
    var items = v1.items || {}, known = v1.known || {}, grad = v1.grad || {}, gone = v1.gone || {};
    var knownL = {}, back = [];
    Object.keys(known).forEach(function (w) { knownL[w.toLowerCase()] = 1; });
    Object.keys(items).forEach(function (k) {
      var o = items[k], s = sense(k);
      if (!s) { sum.missing++; return; }
      if (grad[k]) { sum.grad++; return; }
      if (S.items[s.id] || back.indexOf(s.id) > -1) return;
      var seen = o.seen || 0, box = o.box || 0;
      if (o.wb && seen <= 1) { back.push(s.id); sum.back++; return; }   // 只見過一次的「錯題」：重新當新字
      var it = newItem(s, now, "v1");
      it.seen = seen; it.right = o.right || 0; it.wrong = o.wrong || 0;
      it.exi = seen; it.at = o.at || now;
      if (o.wb && it.wrong >= 4) { it.pos = 1; it.hard = true; it.due = now; sum.hard++; }
      else if (o.wb) { it.pos = 1; it.due = now; sum.wb++; }
      else if (box >= 5) { it.pos = s.lv <= 4 ? 4 : 3; it.due = o.due || now; sum.box5++; }
      else if (box >= 2) { it.pos = 2; it.due = o.due || now; sum.box24++; }
      else { it.pos = 1; it.due = now; sum.box01++; }
      S.items[s.id] = it;
    });
    /* 快篩（整個字）、畢業、刪除墓碑：照樣排除，不進 pool */
    IX.list.forEach(function (s) { if (knownL[s.wl] && !S.items[s.id]) S.excl[s.id] = 1; });
    Object.keys(grad).forEach(function (k) { var s = sense(k); if (s) S.excl[s.id] = 1; });
    Object.keys(gone).forEach(function (k) { var s = sense(k); if (s && !S.items[s.id]) S.excl[s.id] = 1; });
    back.forEach(function (id) { delete S.excl[id]; });
    S.pool = mixByLevel(back);          // 退回新字的排前面（考卷重要字之後）
    S.poolV = POOL_V;
    refreshPool(S);                     // 其餘新字依級數混合接在後面
    var pr = S.pool.filter(function (id) { return prioOf(sense(id)) != null; });
    pr.sort(function (a, b) { return prioOf(sense(a)) - prioOf(sense(b)); });
    S.pool = pr.concat(S.pool.filter(function (id) { return prioOf(sense(id)) == null; }));   // 考卷重要字一律最前面
    markScreen(S, now);                 // 第 1、2 級改走快篩（要在 markOld 前：新字額度要扣快篩時間）
    markOld(S, now);
    sum.excl = Object.keys(S.excl).length;
    sum.pool = S.pool.length;
    sum.scr = S.scr.length;
    return { S: S, sum: sum };
  }

  /* ---------- 12. 同步合併 ---------- */
  /* a ＝ 本機、b ＝ 雲端、dev ＝ 本機裝置代號。不改動 a、b。
     items 取「練得比較多」（seen 大）的那筆，一樣多取 due 較晚的；
     log 逐日逐欄取 max；rt 本機自己的 key 用本機的，其他裝置的用雲端的；
     set 與 pool 取 mtime 較新的那份。 */
  function merge(a, b, dev) {
    if (!a || !a.items) return normalize(clone(b));
    if (!b || !b.items) return normalize(clone(a));
    /* 兩份是不同次搬家來的（例如其中一台按了「重新搬家」）：整份用比較新的那次，不逐字合併，
       不然丟掉的那份會被同步合併回來 */
    if (a.born && b.born && a.born !== b.born) return normalize(clone(a.born > b.born ? a : b));
    var out = normalize({ set: {} });
    var newer = (a.mtime || 0) >= (b.mtime || 0) ? a : b, older = newer === a ? b : a;

    [a.gone || {}, b.gone || {}].forEach(function (src) {
      Object.keys(src).forEach(function (k) { out.gone[k] = Math.max(out.gone[k] || 0, src[k] || 0); });
    });
    [a.excl || {}, b.excl || {}].forEach(function (src) {
      Object.keys(src).forEach(function (k) { out.excl[k] = 1; });
    });

    var keys = {};
    Object.keys(a.items).forEach(function (k) { keys[k] = 1; });
    Object.keys(b.items).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var x = a.items[k], y = b.items[k], g = out.gone[k];
      if (g && x && (x.at || 0) < g) x = null;        // 刪除之前加的不收；刪掉後又加回來的照留
      if (g && y && (y.at || 0) < g) y = null;
      if (!x && !y) return;
      var pick;
      if (!x) pick = y;
      else if (!y) pick = x;
      else if ((x.seen || 0) !== (y.seen || 0)) pick = (x.seen || 0) > (y.seen || 0) ? x : y;
      else pick = (x.due || 0) >= (y.due || 0) ? x : y;
      out.items[k] = clone(pick);
    });

    var inPool = {};
    (newer.pool || []).concat(older.pool || []).forEach(function (id) {
      if (!inPool[id] && !out.items[id] && !out.excl[id] && !out.gone[id]) { inPool[id] = 1; out.pool.push(id); }
    });

    var days = {};
    Object.keys(a.log || {}).forEach(function (d) { days[d] = 1; });
    Object.keys(b.log || {}).forEach(function (d) { days[d] = 1; });
    Object.keys(days).forEach(function (d) {
      var x = (a.log || {})[d] || {}, y = (b.log || {})[d] || {}, o = { k: {} };
      ["a", "c", "ms", "n", "h", "p", "o", "nm", "sc"].forEach(function (f) { o[f] = Math.max(x[f] || 0, y[f] || 0); });
      if (x.q != null || y.q != null) o.q = Math.max(x.q || 0, y.q || 0);
      var ts = {};
      Object.keys(x.k || {}).forEach(function (t) { ts[t] = 1; });
      Object.keys(y.k || {}).forEach(function (t) { ts[t] = 1; });
      Object.keys(ts).forEach(function (t) {
        var p = (x.k || {})[t] || {}, r = (y.k || {})[t] || {};
        o.k[t] = { a: Math.max(p.a || 0, r.a || 0), c: Math.max(p.c || 0, r.c || 0), ms: Math.max(p.ms || 0, r.ms || 0) };
      });
      out.log[d] = o;
    });

    var rk = {};
    Object.keys(a.rt || {}).forEach(function (k) { rk[k] = 1; });
    Object.keys(b.rt || {}).forEach(function (k) { rk[k] = 1; });
    Object.keys(rk).forEach(function (k) {
      var mine = dev && k.indexOf(dev + "|") === 0;
      var src = mine ? ((a.rt || {})[k] || (b.rt || {})[k]) : ((b.rt || {})[k] || (a.rt || {})[k]);
      out.rt[k] = src.slice();
    });

    out.set = normalize({ set: clone(newer.set) }).set;
    var ins = [a.set && a.set.install, b.set && b.set.install].filter(Boolean).sort();
    if (ins.length) out.set.install = ins[0];

    var seenBad = {};
    (a.bad || []).concat(b.bad || []).forEach(function (it) {
      var k = (it.w || "") + "|" + (it.t || "") + "|" + (it.en || "");
      if (!seenBad[k]) { seenBad[k] = 1; out.bad.push(clone(it)); }
    });
    out.mtime = Math.max(a.mtime || 0, b.mtime || 0);
    out.born = a.born || b.born || 0;
    out.poolV = Math.max(a.poolV || 0, b.poolV || 0);
    out.finalAt = [a.finalAt || "", b.finalAt || ""].sort().pop();
    out.oldAt = [a.oldAt || "", b.oldAt || ""].sort().pop();
    out.oldDaily = Math.max(a.oldDaily || 0, b.oldDaily || 0);
    out.scrAt = [a.scrAt || "", b.scrAt || ""].sort().pop();
    out.oldExp = [a.oldExp || "", b.oldExp || ""].sort().pop();
    out.setV = Math.max(a.setV || 0, b.setV || 0);
    var inScr = {};
    (newer.scr || []).concat(older.scr || []).forEach(function (id) {
      if (!inScr[id] && !out.items[id] && !out.gone[id]) { inScr[id] = 1; out.scr.push(id); }
    });
    /* 一台排過快篩、另一台還沒：沒排過那台的新字池裡還有第 1、2 級，拿掉 */
    out.pool = out.pool.filter(function (id) { return !inScr[id]; });
    Object.keys(inScr).forEach(function (id) { delete out.excl[id]; });
    return normalize(out);
  }
  /* 答題事件的合併：聯集、去重、依時間排序 */
  function mergeEvents(a, b) {
    var seen = {}, out = [];
    (a || []).concat(b || []).forEach(function (e) {
      var k = e[0] + "|" + e[1] + "|" + e[2] + "|" + e[3] + "|" + e[4] + "|" + e[8];
      if (!seen[k]) { seen[k] = 1; out.push(e); }
    });
    out.sort(function (x, y) { return x[0] - y[0]; });
    return out;
  }

  var V2 = {
    DAY: DAY, INT: INT, MAXPOS: MAXPOS, DEF_SEC: DEF_SEC, NEW_SEC: NEW_SEC, NEW_MAX: NEW_MAX, BATCH: BATCH,
    HARD_IN: HARD_IN, HARD_MAX: HARD_MAX, HARD_OUT: HARD_OUT, MISTAP: MISTAP, STALL: STALL,
    MIN_SAMPLE: MIN_SAMPLE, RT_KEEP: RT_KEEP, CALIB_DAYS: CALIB_DAYS,
    setRandom: setRandom, shuffle: shuffle,
    dateStr: dateStr, parseDate: parseDate, dayStart: dayStart, addDays: addDays, shiftDate: shiftDate, dayDiff: dayDiff,
    splitEx: splitEx, plainEx: plainEx, norm: norm, formInfo: formInfo,
    shortZh: shortZh, termsOf: termsOf, overlap: overlap, lev: lev, looksLike: looksLike,
    init: init, sense: sense, levelOf: levelOf,
    normalize: normalize, blank: blank, newItem: newItem, dayLog: dayLog, tick: tick, addTime: addTime,
    inCalib: inCalib, median: median, rtKey: rtKey, judge: judge,
    fmtFor: fmtFor, distractors: distractors, makeQ: makeQ, checkSpell: checkSpell, hintMask: hintMask, card: card,
    isDue: isDue, reviewDue: reviewDue, hardDue: hardDue, secPer: secPer, estimate: estimate,
    newSec: newSec, newQuota: newQuota, dayPlan: dayPlan, homeInfo: homeInfo,
    mixByLevel: mixByLevel, prioOf: prioOf, refreshPool: refreshPool, drawBatch: drawBatch,
    POOL_V: POOL_V, LAG: LAG, OLD_DAYS: OLD_DAYS, OLD_MAX: OLD_MAX, markOld: markOld, expireOld: expireOld, oldDue: oldDue,
    SCR_DAILY: SCR_DAILY, SCR_POS: SCR_POS, markScreen: markScreen, finalReview: finalReview, startSession: startSession, endSession: endSession, next: next, cardDone: cardDone, submit: submit, ladder: ladder, hardStep: hardStep,
    undo: undo, report: report, migrate: migrate, merge: merge, mergeEvents: mergeEvents
  };
  if (typeof module !== "undefined" && module.exports) module.exports = V2;
  else root.V2 = V2;
})(this);
