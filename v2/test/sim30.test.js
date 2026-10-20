/* 虛擬 30 天（設計文件 §11 第 3 項）：備份檔搬家後，假的答題者每天練一次，連跑 30 天。
   檢查：沒有當掉、pos 都在 0～6、due 都是有效數字、沒有重複 id、每天時間不超過預算太多、
   積欠沒有無限成長、沒有字卡死在同一階。
   另外跑一個「只做 30 分鐘、每週休一天」的壓力情境，只檢查不變量並印出數字。 */
var assert = require("assert");
var L = require("./lib.js"), V = L.V2, test = L.test;
V.init(L.loadBank());

var v1 = L.loadBackup();
if (!v1) {
  console.log("\n== 虛擬 30 天：跳過（找不到備份檔 " + L.BACKUP + "）");
  return;
}
var START = "2026-10-20";
var ACC = { 1: 0.8, 2: 0.7, 3: 0.6, 4: 0.5, 5: 0.45, 6: 0.4 };   // 依級數的答對率

var R0 = process.env.TRACE_RUN || "";
function run(name, minutes, skip, accFn) {
  V.setRandom(L.seeded(30));
  var rand = L.seeded(3030);
  function logn(med) {                       // 對數常態的答題時間
    var u = 1 - rand(), v = rand();
    return med * Math.exp(0.45 * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
  }
  var S = V.migrate(clone(v1), L.at(START, 19)).S;
  var days = [], track = {}, events = 0, answers = 0, grads = 0, newHard = 0;
  var limit = minutes * 60000;

  for (var d = 0; d < 30; d++) {
    var td = V.shiftDate(START, d);
    if (skip && skip(d)) { days.push({ td: td, skip: true }); continue; }
    var now = L.at(td, 19), h0 = V.homeInfo(S, now);
    var sess = V.startSession(S, now, "sim"), steps = 0, n = 0, maxStep = 0;
    for (;;) {
      if ((S.log[td].ms || 0) >= limit) break;
      var st = V.next(S, sess, now);
      if (st.kind === "done") break;
      if (++steps > 5000) throw new Error(td + " 一次練習超過 5000 步，可能卡在迴圈");
      var dur;
      if (st.kind === "C" || st.kind === "H") {
        dur = st.kind === "H" ? 10000 : 6000;
        V.cardDone(S, sess, st, dur, now);
      } else {
        var s = V.sense(st.id), q = st.q, it0 = S.items[s.id];
        var p = accFn ? accFn(s, it0) : ACC[s.lv] || 0.5;
        /* 看過回饋、隔 LAG 題後的再考，比完全沒看過好一點【估計 +10%】。頑固字是先考、沒有先看卡，不加 */
        if (st.ph === "retry") p = Math.min(0.95, p + 0.10);
        var ok = rand() < p, res;
        var base = q.fmt === "A" ? 3500 : q.fmt === "B" ? 6000 : 2500;
        var rt = logn(ok ? base * 0.85 : base * 1.2);
        if (rand() < 0.01) rt = 25000 + rand() * 20000;                    // 被打斷
        else if (q.fmt !== "S" && rand() < 0.01) rt = 200 + rand() * 250;  // 誤觸
        if (q.fmt === "S") {
          dur = rt + 6000 + (ok ? 0 : 6000);
          res = ok ? { input: q.form, rt: rt, dur: dur, hint: rand() < 0.1 ? 1 : 0 }
            : rand() < 0.3 ? { pick: "?", rt: rt, dur: dur } : { input: "zzz", rt: rt, dur: dur };
        } else {
          dur = rt + 1500 + (ok ? 0 : 5000);
          var wrongs = q.opts.filter(function (o) { return o.id !== s.id; });
          res = { pick: ok ? s.id : rand() < 0.3 ? "?" : wrongs[Math.floor(rand() * wrongs.length)].id, rt: rt, dur: dur };
        }
        var r = V.submit(S, sess, st, res, now);
        if (process.env.TRACE === s.id && R0 === name)    // 除錯：TRACE=字義id 印出這個字每一次作答
          console.log("  [追蹤] " + td + " " + st.ph + (st.sub ? "/" + st.sub : "") + " " + q.fmt + " " + (ok ? "對" : "錯") +
            " rt " + Math.round(rt) + " → " + r.out + "　pos " + r.posB + "→" + r.pos + "　lapses " + S.items[s.id].lapses);
        n++; answers++;
        if (r.out === "graduate") grads++;
        if (r.out === "hard") newHard++;
        var t = track[s.id] || (track[s.id] = { days: {}, pos: {}, hard: 0 });
        if (st.ph === "review") { t.days[td] = 1; t.pos[r.pos] = 1; }
        if (r.out === "hard" || st.ph === "hard") t.hard = 1;     // 進過頑固字（卡在 pos 0 的出口）
      }
      if (dur > maxStep) maxStep = dur;
      V.tick(S, dur, now);
      now += dur;
    }
    events += sess.events.length;
    checkState(S, td);
    var l = S.log[td];
    days.push({
      td: td, min: Math.round(l.ms / 60000), a: l.a, acc: l.a ? Math.round(100 * l.c / l.a) : 0,
      q: l.q, n: l.n || 0, p: l.p || 0, due: h0.rev + h0.oldAll, dueMin: h0.revMin + Math.round(h0.oldAll * 3.5 / 60), oldAll: h0.oldAll, hard: h0.hard,
      hardAll: Object.keys(S.items).filter(function (k) { return S.items[k].hard; }).length,
      pool: S.pool.length, over: l.ms - limit, maxStep: maxStep, calib: h0.calib
    });
  }
  var endNow = L.at(V.shiftDate(START, 30), 19), starve = 0;
  Object.keys(S.items).forEach(function (k) {
    var it = S.items[k];
    if (it.hard && !it.hardOk.length && it.due < V.addDays(endNow, -7)) starve++;
  });
  return { name: name, starve: starve, S: S, days: days, track: track, events: events, answers: answers, grads: grads, newHard: newHard, limit: limit };
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* 每天練完都檢查一次的不變量 */
function checkState(S, td) {
  var seen = {};
  Object.keys(S.items).forEach(function (k) {
    var it = S.items[k];
    assert.ok(Number.isInteger(it.pos) && it.pos >= 0 && it.pos <= 6, td + " pos 超出範圍：" + k + " " + it.pos);
    assert.ok(typeof it.due === "number" && isFinite(it.due) && it.due > 0, td + " due 無效：" + k);
    assert.ok(it.lapses >= 0 && it.ce >= 0, td + " 計數變負：" + k);
    assert.ok(V.sense(k), td + " items 裡有字庫沒有的字義：" + k);
  });
  S.pool.forEach(function (id) {
    assert.ok(!seen[id], td + " pool 重複：" + id); seen[id] = 1;
    assert.ok(!S.items[id], td + " pool 跟 items 重疊：" + id);
  });
}

function table(R) {
  console.log("\n" + R.name);
  console.log("  日期        分 題數 正確 額度 新字 先測 到期含舊字(分) 舊字  頑固(今/全) 新字池");
  R.days.forEach(function (x) {
    if (x.skip) { console.log("  " + x.td + "  （休息）"); return; }
    console.log("  " + x.td + (x.calib ? "*" : " ") + pad(x.min, 3) + pad(x.a, 5) + pad(x.acc + "%", 5) +
      pad(x.q, 5) + pad(x.n, 5) + pad(x.p, 5) + pad(x.due, 6) + "(" + pad(x.dueMin, 3) + ")" + pad(x.oldAll, 7) +
      pad(x.hard, 6) + "/" + x.hardAll + pad(x.pool, 9));
  });
  console.log("  （* ＝校正週）共 " + R.answers + " 題、頑固字新增 " + R.newHard + " 個、畢業 " + R.grads +
    " 個、超過 7 天沒輪到的頑固字 " + R.starve + " 個");
}
function pad(v, n) { v = String(v); while (v.length < n) v = " " + v; return v; }

var A = run("情境 A：每天練滿 60 分鐘", 60);
var B = run("情境 B：每天只做 30 分鐘、每週休一天", 30, function (d) { return d % 7 === 6; });
/* 情境 C：比較像真人的答題者——階梯爬得越高越熟（第 1 次複習用級數的答對率，之後每升一階錯誤率 × 0.75） */
var C = run("情境 C：每天 60 分鐘，越高階越熟", 60, null, function (s, it) {
  var base = ACC[s.lv] || 0.5;
  return it ? 1 - (1 - base) * Math.pow(0.75, it.pos) : base;
});
table(A); table(B); table(C);

[A, B, C].forEach(function (R) {
  test(R.name + "：30 天跑完沒有當掉、每天都過了不變量檢查", function () {
    assert.strictEqual(R.days.length, 30);
  });
  test(R.name + "：每天時間不超過預算太多（最多多一題）", function () {
    R.days.forEach(function (x) {
      if (x.skip) return;
      assert.ok(x.over <= x.maxStep, x.td + " 超出預算 " + Math.round(x.over / 1000) + " 秒");
    });
  });
  test(R.name + "：答題事件一題一筆", function () {
    var a = 0;
    Object.keys(R.S.log).forEach(function (d) { a += R.S.log[d].a || 0; });
    assert.strictEqual(R.events, R.answers);
    assert.strictEqual(a, R.answers);
  });
  test(R.name + "：沒有字卡死在同一階（複習過 5 天以上、pos 從沒變、又沒進過頑固字）", function () {
    var stuck = Object.keys(R.track).filter(function (k) {
      var t = R.track[k];
      return Object.keys(t.days).length >= 5 && Object.keys(t.pos).length === 1 && !t.hard;
    });
    var info = stuck.map(function (k) {
      var it = R.S.items[k], t = R.track[k];
      return k + " pos " + Object.keys(t.pos).join("/") + "、複習 " + Object.keys(t.days).length + " 天、lapses " + it.lapses +
        "、hardOk " + it.hardOk.length + "、ce " + it.ce;
    });
    assert.ok(!stuck.length, "卡住的字：" + info.join("；"));
  });
});
test(A.name + "：積欠沒有無限成長（最後 10 天的到期量不超過第一天、也沒有一路往上）", function () {
  var x = A.days.filter(function (d) { return !d.skip; });
  var last = x.slice(-10).map(function (d) { return d.dueMin; });
  assert.ok(Math.max.apply(null, last) <= x[0].dueMin, "最後 10 天到期 " + last.join(",") + " 分，第一天 " + x[0].dueMin);
  var up = 0;
  for (var i = 1; i < last.length; i++) if (last[i] > last[i - 1]) up++;
  assert.ok(up < last.length - 1, "最後 10 天到期量一路往上：" + last.join(","));
});
test(C.name + "：搬家積欠（舊字）兩週內清完，而且第一天就有新字", function () {
  var x = C.days.filter(function (d) { return !d.skip; });
  assert.ok(x[0].n > 0, "第一天沒有新字");
  assert.strictEqual(x[14].oldAll, 0, "第 15 天還有舊字 " + x[14].oldAll + " 個");
});
test(A.name + "：積欠清掉之後有上新字", function () {
  var learned = A.days.reduce(function (s, d) { return s + (d.n || 0); }, 0);
  assert.ok(learned > 0, "30 天都沒上新字");
});
test(B.name + "：只做一半時間 → 新字自動變少（不會比情境 A 多）", function () {
  var nA = A.days.reduce(function (s, d) { return s + (d.n || 0); }, 0);
  var nB = B.days.reduce(function (s, d) { return s + (d.n || 0); }, 0);
  assert.ok(nB <= nA, "B " + nB + " > A " + nA);
});

process.exitCode = L.report("虛擬 30 天") ? 1 : 0;
