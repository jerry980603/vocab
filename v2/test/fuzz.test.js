/* 亂操作壓力測試：隨機作答、中途按「結束」、頁面重新整理（iPhone 常在背景把 App 關掉）、
   回報、「我選的也說得通」、跨天，連跑多個種子。每一步檢查：
   1. 卡片只出現在那個字剛答錯（或新字剛先測）之後——不會「先看答案再考」
   2. 同一天同一個字再考，中間至少隔 LAG 題（或至少隔 10 分鐘）——不會「看完答案馬上考」
   3. 存檔狀態合法（pos、due、pool 與 items 不重疊、不當掉） */
var assert = require("assert");
var L = require("./lib.js"), V = L.V2, test = L.test;
V.init(L.loadBank());
var v1 = L.loadBackup();

function run(seed, fromBackup) {
  V.setRandom(L.seeded(seed));
  var rand = L.seeded(seed * 7 + 1), START = "2026-10-20";
  var S = fromBackup && v1 ? V.migrate(JSON.parse(JSON.stringify(v1)), L.at(START, 19)).S : V.migrate(null, L.at(START, 19)).S;
  var problems = [];
  function bad(m) { if (problems.length < 20) problems.push(m); }
  for (var d = 0; d < 8; d++) {
    var td = V.shiftDate(START, d), now = L.at(td, 19), k = 0, last = {}, sess = V.startSession(S, now, "fz"), prev = null;
    for (var steps = 0; steps < 900; steps++) {
      if ((S.log[td] || {}).ms >= 45 * 60000) break;
      var r0 = rand();
      if (r0 < 0.02) { if (process.env.FUZZ_TRACE) console.log("  [重新整理] " + new Date(now).toTimeString().slice(0, 8)); sess = V.startSession(S, now, "fz"); prev = null; continue; }            // 重新整理
      if (r0 < 0.03) { V.endSession(S, sess, now); now += 15 * 60000; sess = V.startSession(S, now, "fz"); prev = null; continue; }  // 結束，過一陣子再開
      var st = V.next(S, sess, now);
      if (st.kind === "done") break;
      var dur = 4000;
      if (st.kind === "C" || st.kind === "H") {
        if (!prev || prev.id !== st.id || !(prev.wrong || prev.pre)) bad(td + " 卡片前面不是這個字的作答：" + st.id + "（前一題 " + (prev ? prev.id : "無") + "）");
        V.cardDone(S, sess, st, 6000, now);
        dur = 6000;
      } else {
        var s = V.sense(st.id), q = st.q, ok = rand() < 0.6, res;
        if (q.fmt === "S") res = ok ? { input: q.form, rt: 3000, dur: 9000 } : { input: "zzz", rt: 3000, dur: 12000 };
        else {
          var wrongs = q.opts.filter(function (o) { return o.id !== s.id; });
          res = { pick: ok ? s.id : rand() < 0.3 ? "?" : wrongs[Math.floor(rand() * wrongs.length)].id, rt: 600 + rand() * 6000, dur: 5000 };
        }
        var lp = last[s.id];
        if (lp && k - lp.k < V.LAG && now - lp.t < 10 * 60000) bad(td + " " + s.id + " 才隔 " + (k - lp.k) + " 題、" + Math.round((now - lp.t) / 1000) + " 秒又考");
        var r = V.submit(S, sess, st, res, now);
        if (process.env.FUZZ_TRACE === s.id) console.log("  [追蹤] " + td + " " + new Date(now).toTimeString().slice(0, 8) + " " + st.kind + "/" + st.ph + (st.sub ? "/" + st.sub : "") + " " + (r.ok ? "對" : "錯") + " → " + r.out + " pos " + r.posB + "→" + r.pos + " k=" + k);
        k++; last[s.id] = { k: k, t: now };
        prev = { id: s.id, wrong: !r.ok, pre: st.ph === "pre" || st.ph === "screen" };
        if (!r.ok && r.picked && rand() < 0.2) V.undo(S, sess, st, now);
        if (rand() < 0.01) V.report(S, q, now, r.picked ? r.picked.w : "");
        dur = res.dur;
      }
      V.tick(S, dur, now);
      now += dur;
    }
    V.endSession(S, sess, now);
    var inPool = {};
    S.pool.forEach(function (id) { if (inPool[id]) bad(td + " pool 重複 " + id); inPool[id] = 1; if (S.items[id]) bad(td + " pool 跟 items 重疊 " + id); });
    Object.keys(S.items).forEach(function (id) {
      var it = S.items[id];
      if (!(Number.isInteger(it.pos) && it.pos >= 0 && it.pos <= 6) || !isFinite(it.due)) bad(td + " 狀態壞掉 " + id);
    });
    JSON.parse(JSON.stringify(S));   // 存得起來
  }
  return problems;
}

[1, 2, 3, 4, 5].forEach(function (seed) {
  test("從零開始，種子 " + seed + "：不會先看答案再考、不會看完馬上考、狀態合法", function () {
    var p = run(seed, false);
    assert.ok(!p.length, p.length + " 個問題：" + p.slice(0, 4).join(" ／ "));
  });
});
if (v1) [11, 12, 13].forEach(function (seed) {
  test("搬家後（有頑固字與大量複習），種子 " + seed, function () {
    var p = run(seed, true);
    assert.ok(!p.length, p.length + " 個問題：" + p.slice(0, 4).join(" ／ "));
  });
});

/* 兩台裝置交替練、每次練完同步一次：進度只會變多（每個字義的 seen 不變少）、字義不會不見、
   沒有人按「重新搬家」時不會出現搬家衝突 */
test("兩台裝置交替練習、互相同步：進度不會變少、不會整份被蓋掉", function () {
  V.setRandom(L.seeded(77));
  var rand = L.seeded(78), START = "2026-10-20";
  var cloud = null, devs = [V.migrate(null, L.at(START, 7)).S, null], problems = [];
  function sync(i) {
    var loc = devs[i];
    if (cloud && loc && cloud.born !== loc.born) problems.push("沒按重新搬家卻出現搬家衝突");
    var m = V.merge(loc, cloud, "d" + i);
    if (cloud) Object.keys(cloud.items).forEach(function (id) {
      if (!m.items[id]) problems.push("同步後字義不見了：" + id);
      else if (m.items[id].seen < cloud.items[id].seen) problems.push("同步後 seen 變少：" + id);
    });
    cloud = JSON.parse(JSON.stringify(m));
    devs[i] = V.merge(devs[i], cloud, "d" + i);
  }
  sync(0);
  devs[1] = V.normalize(JSON.parse(JSON.stringify(cloud)));    // 第二台第一次打開：用雲端的
  for (var d = 0; d < 12; d++) {
    var td = V.shiftDate(START, d);
    [0, 1].forEach(function (i) {
      var S = devs[i], now = L.at(td, i ? 20 : 7), sess = V.startSession(S, now, "d" + i);
      for (var k = 0; k < 120; k++) {
        var st = V.next(S, sess, now);
        if (st.kind === "done") break;
        if (st.kind === "C" || st.kind === "H") V.cardDone(S, sess, st, 5000, now);
        else V.submit(S, sess, st, st.q.fmt === "S" ? { input: rand() < .6 ? st.q.form : "x", rt: 3000, dur: 8000 } : { pick: rand() < .6 ? V.sense(st.id).id : "?", rt: 3000, dur: 5000 }, now);
        V.tick(S, 5000, now); now += 5000;
      }
      V.endSession(S, sess, now);
      sync(i);
    });
  }
  assert.ok(!problems.length, problems.slice(0, 4).join(" ／ "));
  assert.ok(Object.keys(cloud.items).length > 50);
});

/* 跨午夜、跨過 1/10（停止上新字）、預算改來改去：不當掉、1/10 之後不上新字、狀態合法 */
test("跨午夜的練習、跨過停止上新字的那天：不當掉、之後不再上新字", function () {
  V.setRandom(L.seeded(91));
  var rand = L.seeded(92), S = V.migrate(null, L.at("2027-01-07", 23, 40)).S, problems = [];
  for (var d = 0; d < 8; d++) {
    var td = V.shiftDate("2027-01-07", d), now = L.at(td, 23, 40);       // 每天 23:40 開始，練過午夜
    S.set.budget = [30, 45, 60, 90][d % 4];
    var sess = V.startSession(S, now, "d"), before = S.pool.length;
    for (var k = 0; k < 400; k++) {
      var st = V.next(S, sess, now);
      if (st.kind === "done") break;
      if (st.kind === "C" || st.kind === "H") V.cardDone(S, sess, st, 5000, now);
      else {
        if (st.kind === "P" && V.dateStr(now) > S.set.learnEnd) problems.push(V.dateStr(now) + " 過了停止日還在上新字");
        V.submit(S, sess, st, st.q.fmt === "S" ? { input: rand() < .6 ? st.q.form : "x", rt: 3000, dur: 8000 } : { pick: rand() < .6 ? V.sense(st.id).id : "?", rt: 3000, dur: 5000 }, now);
      }
      V.tick(S, 5000, now); now += 5000;
    }
    V.endSession(S, sess, now);
    Object.keys(S.items).forEach(function (id) {
      var it = S.items[id];
      if (!(it.pos >= 0 && it.pos <= 6) || !isFinite(it.due)) problems.push("狀態壞掉 " + id);
    });
    V.homeInfo(S, now);
  }
  assert.ok(!problems.length, problems.slice(0, 4).join(" ／ "));
});

process.exitCode = L.report("亂操作壓力測試") ? 1 : 0;
