/* 題目品質（設計文件 §11 第 4 項）：A、B 各產生 300 題自動檢查，印 30 題給人看。
   樣本另外存到 test/out/題目樣本.txt。 */
var assert = require("assert"), fs = require("fs"), path = require("path");
var L = require("./lib.js"), V = L.V2, test = L.test;
V.setRandom(L.seeded(300));
V.init(L.loadBank());

var bank = L.loadBank(), all = [];
bank.forEach(function (e) { e.s.forEach(function (x, si) { all.push(V.sense(e.w + "::" + si)); }); });
var rand = L.seeded(301), S = V.blank(Date.now());
function sample(n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push(all[Math.floor(rand() * all.length)]);
  return out;
}
var QA = sample(300).map(function (s) { return V.makeQ(S, s.id, "A"); });
var QB = sample(300).map(function (s) { return V.makeQ(S, s.id, "B"); });

var stat = { look: 0, samePos: 0, lvNear: 0, total: 0 };
function common(q, mode) {
  var t = V.sense(q.id), why = [];
  if (q.opts.length !== 4) why.push("選項不是 4 個");
  if (q.opts[q.ans].id !== t.id) why.push("正解位置錯");
  var texts = q.opts.map(function (o) { return o.t; });
  if (new Set(texts).size !== 4) why.push("選項文字重複");
  var words = q.opts.map(function (o) { return V.sense(o.id).wl; });
  if (new Set(words).size !== 4) why.push("同一個字出現兩次");
  /* 只有一個選項跟正解中文重疊（就是正解自己） */
  var hits = q.opts.filter(function (o) {
    var c = V.sense(o.id);
    return V.overlap(mode === "A" ? c.terms : c.wt, mode === "A" ? t.terms : t.wt);
  });
  if (hits.length !== 1) why.push("跟正解中文重疊的選項有 " + hits.length + " 個：" + hits.map(function (o) { return o.t; }).join("/"));
  var ds = q.opts.filter(function (o) { return o.id !== t.id; }).map(function (o) { return V.sense(o.id); });
  stat.total += 3;
  ds.forEach(function (c) {
    if (c.p === t.p) stat.samePos++;
    if (Math.abs(c.lv - t.lv) <= 1) stat.lvNear++;
  });
  if (ds.some(function (c) { return V.looksLike(c.w, t.w); })) stat.look++;
  return why;
}

test("A 題 300 題：選項不重複、只有正解跟正解中文重疊、沒有同字選項", function () {
  var bad = [];
  QA.forEach(function (q) {
    var why = common(q, "A");
    q.opts.forEach(function (o) {
      if (o.t.length > 12) why.push("選項超過 12 字：" + o.t);
      if (/[A-Za-z]/.test(o.t)) why.push("選項有英文（洩題）：" + o.t);
    });
    if (why.length) bad.push(q.id + "：" + why.join("；"));
  });
  assert.deepStrictEqual(bad, []);
});
test("B 題 300 題：同上，另外選項一律是原形、題幹挖空後不含答案", function () {
  var bad = [];
  QB.forEach(function (q) {
    var why = common(q, "B");
    q.opts.forEach(function (o) { if (o.t !== V.sense(o.id).w) why.push("選項不是原形：" + o.t); });
    var stem = (q.pre + " " + q.post).toLowerCase();
    if (new RegExp("\\b" + q.form.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(stem)) why.push("題幹裡還看得到答案：" + q.form);
    if (!q.exZh) why.push("沒有中譯");
    if (why.length) bad.push(q.id + "：" + why.join("；"));
  });
  assert.deepStrictEqual(bad, []);
});
var pct = function (a, b) { return Math.round(100 * a / b) + "%"; };
test("錯誤選項大多同詞性（≥ 95%）、級數相差 ≤ 1（≥ 85%）", function () {
  assert.ok(stat.samePos / stat.total >= 0.95, "同詞性 " + pct(stat.samePos, stat.total));
  assert.ok(stat.lvNear / stat.total >= 0.85, "級數相近 " + pct(stat.lvNear, stat.total));
});

/* 全庫掃描：每個字義出 A、每一句例句出 B 和 S，都不能當掉；B 不能洩題（挖空後句子別處還看得到這個字） */
function seesWord(q) {
  var stem = (q.pre + " " + q.post).toLowerCase();
  return [q.form, q.w].some(function (w) {
    w = String(w).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(^|[^a-z])" + w + "([^a-z]|$)").test(stem);
  });
}
var sweep = { senses: 0, ex: 0, bToA: [], sLeak: [] };
test("全庫掃描：每個字義的 A、每句例句的 B 與 S 都出得來；B 不洩題；拼寫的標準答案判得對", function () {
  var S2 = V.blank(Date.now()), errs = [];
  bank.forEach(function (e) {
    e.s.forEach(function (x, si) {
      var id = e.w + "::" + si; sweep.senses++;
      try {
        var a = V.makeQ(S2, id, "A");
        if (a.opts.length !== 4) errs.push(id + " A 選項不是 4 個");
        for (var k = 0; k < x.ex.length; k++) {
          sweep.ex++;
          S2.items[id] = { exi: k };
          var b = V.makeQ(S2, id, "B");
          if (b.fmt === "A") { if (sweep.bToA.indexOf(id) < 0) sweep.bToA.push(id); }
          else if (seesWord(b)) errs.push(id + "#" + k + " B 洩題");
          var s = V.makeQ(S2, id, "S");
          if (!V.checkSpell(s, s.form)) errs.push(id + "#" + k + " S 標準答案判錯");
          if (s.suffix && !V.checkSpell(s, s.form.slice(0, -s.suffix.length))) errs.push(id + "#" + k + " S 字根判錯");
          if (seesWord(s) && sweep.sLeak.indexOf(id) < 0) sweep.sLeak.push(id);
        }
        delete S2.items[id];
      } catch (err) { errs.push(id + " 當掉：" + err.message); }
    });
  });
  assert.deepStrictEqual(errs, []);
});

/* 印 30 題給人看：A、B 各 15 */
var lines = [];
lines.push("題目樣本（程式產生，不是大考中心的題目）。✓ 是正解，~ 是長得像的錯誤選項。");
lines.push("自動檢查統計（600 題）：錯誤選項同詞性 " + pct(stat.samePos, stat.total) +
  "、級數相差 ≤1 " + pct(stat.lvNear, stat.total) + "、至少一個長得像 " + pct(stat.look, 600) + "\n");
function mark(q, o) {
  var t = V.sense(q.id), c = V.sense(o.id);
  return (o.id === t.id ? "✓" : V.looksLike(c.w, t.w) ? "~" : " ") + o.t +
    (o.id === t.id ? "" : "（" + (q.fmt === "A" ? c.w + " " : "") + c.p + " " + c.lv + "級）");
}
QA.slice(0, 15).forEach(function (q, i) {
  lines.push("A" + (i + 1) + ". " + q.w + "  " + q.p + "  " + q.lv + "級");
  lines.push("    " + q.opts.map(function (o) { return mark(q, o); }).join("  ｜  ") + "  ｜  不知道");
});
lines.push("");
QB.slice(0, 15).forEach(function (q, i) {
  lines.push("B" + (i + 1) + ". " + q.pre + "_____" + q.post + "   （答案：" + q.form + "，" + q.lv + "級）");
  lines.push("    " + q.opts.map(function (o) { return mark(q, o); }).join("  ｜  ") + "  ｜  不知道");
  lines.push("    中譯（答完才顯示）：" + q.exZh);
});
lines.push("\n全庫掃描：" + sweep.senses + " 個字義、" + sweep.ex + " 句例句。");
lines.push("每句都洩題、B 改出 A 的：" + (sweep.bToA.join("、") || "無"));
lines.push("拼寫題句子裡看得到答案（要修字庫）：" + (sweep.sLeak.join("、") || "無"));
var text = lines.join("\n");
console.log("\n" + text);
var dir = path.join(__dirname, "out");
if (!fs.existsSync(dir)) fs.mkdirSync(dir);
fs.writeFileSync(path.join(dir, "題目樣本.txt"), text + "\n", "utf8");

process.exitCode = L.report("題目品質") ? 1 : 0;
