/* 單元測試（設計文件 §11 第 1 項）：升降規則每一列、時間判斷與誤值、出題過濾、搬家每一類、同步合併、
   以及一次練習的流程。 */
var assert = require("assert");
var L = require("./lib.js"), V = L.V2, test = L.test, at = L.at;
V.setRandom(L.seeded(42));
V.init(L.loadBank());

var NOW = at("2026-11-02", 20);          // 開始使用後第 30 天，已過校正週
var TD = V.dateStr(NOW);
var TOMORROW = V.addDays(NOW, 1);

/* 找符合條件的字義 */
function find(pred) {
  var ids = require("./lib.js").loadBank();
  for (var i = 0; i < ids.length; i++) {
    for (var j = 0; j < ids[i].s.length; j++) {
      var s = V.sense(ids[i].w + "::" + j);
      if (s && pred(s)) return s;
    }
  }
  throw new Error("找不到符合條件的字義");
}
var L3 = find(function (s) { return s.lv === 3 && !s.multi && !s.e.ph && s.s.ex.length >= 2; });  // 要拼的字
var L5 = find(function (s) { return s.lv === 5 && !s.multi && s.s.ex.length >= 1; });              // 只到認得
var MULTI4 = V.sense("abandon::1");                                                             // 一字多義（同詞性）
var PH = find(function (s) { return s.e.ph; });

/* 一份「已過校正週、各題型都有 40 個 3 秒樣本」的存檔 */
function mkS(opts) {
  opts = opts || {};
  var S = V.blank(NOW);
  S.set.install = opts.install || V.shiftDate(TD, -30);
  if (!opts.noMed) ["A", "S", "B10", "B15", "B99"].forEach(function (k) {
    S.rt["d|" + k] = []; for (var i = 0; i < 40; i++) S.rt["d|" + k].push(3000);
  });
  return S;
}
function put(S, s, fields) {
  var it = V.newItem(s, NOW - 40 * V.DAY, "new");
  for (var k in fields) it[k] = fields[k];
  S.items[s.id] = it;
  return it;
}
/* 對某個字義答一題一般複習。res.pick："right" / "wrong" / "?"；S 題用 input */
function review(S, s, res, now, sess) {
  now = now || NOW;
  sess = sess || V.startSession(S, now, "d");
  sess.newLeft = 0; sess.hardQ = [];
  if (!sess.retry.length) sess.revQ = [s.id];
  var st = V.next(S, sess, now);
  var q = st.q, r = {};
  for (var k in res) r[k] = res[k];
  if (q.fmt !== "S") {
    if (res.pick === "right") r.pick = s.id;
    else if (res.pick === "wrong") r.pick = q.opts.filter(function (o) { return o.id !== s.id; })[0].id;
  } else if (res.pick === "right") { r.input = q.form; delete r.pick; }
  else if (res.pick === "wrong") { r.input = "zzzz"; delete r.pick; }
  var out = V.submit(S, sess, st, r, now);
  return { st: st, r: out, sess: sess, q: q };
}

/* ================= §4 升降規則 ================= */
test("答對、快、pos≥1、今天沒升過 → +2", function () {
  var S = mkS(), it = put(S, L5, { pos: 1, due: NOW - V.DAY });
  var x = review(S, L5, { pick: "right", rt: 1500 });
  assert.strictEqual(x.q.fmt, "A");
  assert.strictEqual(x.r.out, "up2");
  assert.strictEqual(it.pos, 3);
  assert.strictEqual(it.due, V.addDays(NOW, 14));
  assert.strictEqual(it.lastUp, TD);
});
test("答對但慢 → +1，到期日對齊 0 點", function () {
  var S = mkS(), it = put(S, L5, { pos: 1, due: NOW });
  var x = review(S, L5, { pick: "right", rt: 5000 });
  assert.strictEqual(x.r.out, "up1");
  assert.strictEqual(it.pos, 2);
  assert.strictEqual(it.due, V.addDays(NOW, 4));
  assert.strictEqual(new Date(it.due).getHours(), 0);
});
test("pos 0 答對再快也只 +1", function () {
  var S = mkS(), it = put(S, L5, { pos: 0, due: NOW });
  review(S, L5, { pick: "right", rt: 1000 });
  assert.strictEqual(it.pos, 1);
  assert.strictEqual(it.due, TOMORROW);
});
test("選擇題 rt < 500 答對 → 不升級、明天再考、不進中位數", function () {
  var S = mkS(), it = put(S, L5, { pos: 2, due: NOW, lastUp: "" });
  var n = S.rt["d|B10"].length + S.rt["d|B15"].length + S.rt["d|B99"].length + S.rt["d|A"].length;
  var x = review(S, L5, { pick: "right", rt: 300 });
  assert.strictEqual(x.r.out, "mistap");
  assert.strictEqual(it.pos, 2);
  assert.strictEqual(it.due, TOMORROW);
  assert.strictEqual(S.rt["d|B10"].length + S.rt["d|B15"].length + S.rt["d|B99"].length + S.rt["d|A"].length, n);
});
test("選擇題 rt < 500 點錯 → 不算（不扣、不算 lapses），排到最後重考", function () {
  var S = mkS(), it = put(S, L5, { pos: 3, due: NOW });
  var x = review(S, L5, { pick: "wrong", rt: 300 });
  assert.strictEqual(x.r.out, "void");
  assert.strictEqual(it.pos, 3);
  assert.strictEqual(it.lapses, 0);
  assert.strictEqual(x.sess.retry.length, 1);
});
test("很快按「不知道」不算誤觸 → 照答錯處理", function () {
  var S = mkS(), it = put(S, L5, { pos: 3, due: NOW });
  var x = review(S, L5, { pick: "?", rt: 300 });
  assert.strictEqual(x.r.out, "down");
  assert.strictEqual(it.lapses, 1);
  assert.strictEqual(it.pos, 2);
});
test("用了拼寫提示才答對 → 最多 +1、不算快、不進中位數", function () {
  var S = mkS(), it = put(S, L3, { pos: 2, due: NOW });
  var n = S.rt["d|S"].length;
  var x = review(S, L3, { pick: "right", rt: 800, hint: 1 });
  assert.strictEqual(x.q.fmt, "S");
  assert.strictEqual(x.r.out, "up1");
  assert.strictEqual(x.r.quick, false);
  assert.strictEqual(it.pos, 3);
  assert.strictEqual(S.rt["d|S"].length, n);
});
test("拼寫沒用提示又快 → +2", function () {
  var S = mkS(), it = put(S, L3, { pos: 2, due: NOW });
  var x = review(S, L3, { pick: "right", rt: 800 });
  assert.strictEqual(x.r.out, "up2");
  assert.strictEqual(it.pos, 4);
});
test("答錯 → lapses+1、pos−1、排到本次最後、due 是現在", function () {
  var S = mkS(), it = put(S, L5, { pos: 3, due: NOW });
  var x = review(S, L5, { pick: "wrong", rt: 5000 });
  assert.strictEqual(x.r.out, "down");
  assert.strictEqual(it.lapses, 1);
  assert.strictEqual(it.pos, 2);
  assert.strictEqual(it.due, NOW);
  assert.deepStrictEqual(x.sess.retry, [{ id: L5.id, ph: "review" }]);
});
test("答錯後本次重考答對 → pos 不變、明天再考", function () {
  var S = mkS(), it = put(S, L5, { pos: 3, due: NOW });
  var x = review(S, L5, { pick: "wrong", rt: 5000 });
  var st = V.next(S, x.sess, NOW + 60000);
  assert.strictEqual(st.ph, "retry");
  var r = V.submit(S, x.sess, st, st.q.fmt === "S" ? { input: st.q.form, rt: 1000 } : { pick: L5.id, rt: 1000 }, NOW + 60000);
  assert.strictEqual(r.out, "hold");
  assert.strictEqual(it.pos, 2);
  assert.strictEqual(it.due, TOMORROW);
  assert.strictEqual(V.next(S, x.sess, NOW + 70000).kind, "done");
});
test("重考又答錯 → 不再扣、繼續排到最後", function () {
  var S = mkS(), it = put(S, L5, { pos: 3, due: NOW });
  var x = review(S, L5, { pick: "wrong", rt: 5000 });
  var st = V.next(S, x.sess, NOW + 60000);
  var wrong = st.q.opts.filter(function (o) { return o.id !== L5.id; })[0].id;
  var r = V.submit(S, x.sess, st, { pick: wrong, rt: 5000 }, NOW + 60000);
  assert.strictEqual(r.out, "again");
  assert.strictEqual(it.lapses, 1);
  assert.strictEqual(it.pos, 2);
  assert.strictEqual(x.sess.retry.length, 1);
});
test("同一天換一次練習再答錯 → 也不再扣（一天只降一次）", function () {
  var S = mkS(), it = put(S, L5, { pos: 3, due: NOW });
  review(S, L5, { pick: "wrong", rt: 5000 });
  var x = review(S, L5, { pick: "wrong", rt: 5000 }, NOW + 3600000);
  assert.strictEqual(x.r.out, "again");
  assert.strictEqual(it.lapses, 1);
  assert.strictEqual(it.pos, 2);
});
test("答錯而且快 → ce+1；選錯的選項記進 conf", function () {
  var S = mkS(), it = put(S, L5, { pos: 3, due: NOW });
  var x = review(S, L5, { pick: "wrong", rt: 1200 });
  assert.strictEqual(it.ce, 1);
  var pk = Object.keys(it.conf);
  assert.strictEqual(pk.length, 1);
  assert.strictEqual(it.conf[pk[0]], 1);
  assert.strictEqual(x.r.picked.id, pk[0]);
});
test("很快按「不知道」→ 算答錯但不算有把握（ce 不變、conf 不變）", function () {
  var S = mkS(), it = put(S, L5, { pos: 3, due: NOW });
  var x = review(S, L5, { pick: "?", rt: 900 });
  assert.strictEqual(x.r.out, "down");
  assert.strictEqual(it.ce, 0);
  assert.deepStrictEqual(it.conf, {});
});
test("lapses 達 4 → 變成頑固字", function () {
  var S = mkS(), it = put(S, L5, { pos: 1, due: NOW, lapses: 3 });
  var x = review(S, L5, { pick: "wrong", rt: 5000 });
  assert.strictEqual(x.r.out, "hard");
  assert.strictEqual(it.hard, true);
  assert.strictEqual(it.lapses, 4);
  assert.deepStrictEqual(V.hardDue(S, NOW + 1000), [L5.id]);
  assert.deepStrictEqual(V.reviewDue(S, NOW + 1000), []);
});
test("一天只能升一次：今天升過再答對 → 不動", function () {
  var S = mkS(), it = put(S, L5, { pos: 1, due: NOW });
  review(S, L5, { pick: "right", rt: 5000 });
  assert.strictEqual(it.pos, 2);
  it.due = NOW;                                     // 假裝又到期（例如另一台裝置）
  var x = review(S, L5, { pick: "right", rt: 1000 }, NOW + 60000);
  assert.strictEqual(x.r.out, "hold");
  assert.strictEqual(it.pos, 2);
  assert.strictEqual(it.due, TOMORROW);
});
test("pos 6 答對 → 停在 6、120 天後", function () {
  var S = mkS(), it = put(S, L5, { pos: 6, due: NOW });
  review(S, L5, { pick: "right", rt: 5000 });
  assert.strictEqual(it.pos, 6);
  assert.strictEqual(it.due, V.addDays(NOW, 120));
});
test("pos 0 答錯 → 停在 0", function () {
  var S = mkS(), it = put(S, L5, { pos: 0, due: NOW });
  review(S, L5, { pick: "wrong", rt: 5000 });
  assert.strictEqual(it.pos, 0);
  assert.strictEqual(it.lapses, 1);
});
test("seen／right／wrong 累計；B、S 題用掉例句（exi+1），A 題不用", function () {
  var S = mkS(), it = put(S, L3, { pos: 2, due: NOW });
  review(S, L3, { pick: "right", rt: 5000 });
  assert.strictEqual(it.seen, 1); assert.strictEqual(it.right, 1); assert.strictEqual(it.exi, 1);
  var S2 = mkS(), it2 = put(S2, L5, { pos: 1, due: NOW });
  review(S2, L5, { pick: "wrong", rt: 5000 });
  assert.strictEqual(it2.wrong, 1); assert.strictEqual(it2.exi, 0);
});

/* ================= §6 時間判斷 ================= */
test("樣本不到 30 個 → 一律算慢", function () {
  var S = mkS({ noMed: true });
  S.rt["d|A"] = [3000, 3000, 3000];
  var j = V.judge(S, "d", "A", true, 500, true, 0, NOW, false);
  assert.strictEqual(j.quick, false);
  assert.strictEqual(j.med, null);
});
test("校正週（install 起 7 天內）→ 不判斷快，答對一律 +1", function () {
  var S = mkS({ install: V.shiftDate(TD, -6) }), it = put(S, L5, { pos: 1, due: NOW });
  assert.strictEqual(V.inCalib(S, NOW), true);
  var x = review(S, L5, { pick: "right", rt: 1000 });
  assert.strictEqual(x.r.out, "up1");
  assert.strictEqual(it.pos, 2);
  var S2 = mkS({ install: V.shiftDate(TD, -7) });
  assert.strictEqual(V.inCalib(S2, NOW), false);
});
test("rt > max(20 秒, 3×中位數) → 被打斷：算慢、不進中位數", function () {
  var S = mkS();
  var n = S.rt["d|A"].length;
  var j = V.judge(S, "d", "A", true, 21000, true, 0, NOW, true);
  assert.strictEqual(j.stall, true); assert.strictEqual(j.quick, false);
  assert.strictEqual(S.rt["d|A"].length, n);
  S.rt["d|S"] = []; for (var i = 0; i < 40; i++) S.rt["d|S"].push(10000);
  assert.strictEqual(V.judge(S, "d", "S", true, 25000, false, 0, NOW, false).stall, false);   // 門檻是 30 秒
  assert.strictEqual(V.judge(S, "d", "S", true, 31000, false, 0, NOW, false).stall, true);
});
test("拼寫題沒有誤觸規則（rt 是到第一個鍵，可以很短）", function () {
  var S = mkS();
  var j = V.judge(S, "d", "S", true, 300, false, 0, NOW, true);
  assert.strictEqual(j.mistap, false); assert.strictEqual(j.quick, true);
});
test("只收答對的 rt；最多留最近 200 個", function () {
  var S = mkS();
  V.judge(S, "d", "A", false, 2000, true, 0, NOW, true);
  assert.strictEqual(S.rt["d|A"].length, 40);
  for (var i = 0; i < 300; i++) V.judge(S, "d", "A", true, 1000 + i, true, 0, NOW, true);
  assert.strictEqual(S.rt["d|A"].length, 200);
  assert.strictEqual(S.rt["d|A"][199], 1299);
});
test("中位數用答題前的樣本（自己不算進去）、快 ＝ rt ≤ 中位數", function () {
  var S = mkS();
  assert.strictEqual(V.judge(S, "d", "A", true, 3000, true, 0, NOW, false).quick, true);
  assert.strictEqual(V.judge(S, "d", "A", true, 3001, true, 0, NOW, false).quick, false);
});
test("B 題依句長分三組：≤10、11～15、>15", function () {
  assert.strictEqual(V.rtKey({ fmt: "B", words: 10 }), "B10");
  assert.strictEqual(V.rtKey({ fmt: "B", words: 11 }), "B15");
  assert.strictEqual(V.rtKey({ fmt: "B", words: 15 }), "B15");
  assert.strictEqual(V.rtKey({ fmt: "B", words: 16 }), "B99");
  assert.strictEqual(V.rtKey({ fmt: "A" }), "A");
});
test("不同裝置各自一份中位數", function () {
  var S = mkS();
  assert.strictEqual(V.judge(S, "phone", "A", true, 1000, true, 0, NOW, true).quick, false);
  assert.strictEqual(S.rt["phone|A"].length, 1);
});
test("只有先測與一般複習的 rt 進中位數（學習卡後、重考、頑固字不收）", function () {
  var S = mkS(), it = put(S, L5, { pos: 3, due: NOW });
  var n = S.rt["d|A"].length;
  var x = review(S, L5, { pick: "wrong", rt: 5000 });
  var st = V.next(S, x.sess, NOW + 1000);
  V.submit(S, x.sess, st, { pick: L5.id, rt: 2000 }, NOW + 1000);
  assert.strictEqual(S.rt["d|A"].length, n);
});

/* ================= §4、§8 出題 ================= */
test("題型對照表：第 1～4 級 pos≥2 拼寫；第 5、6 級 B/A 交替；一字多義 A→B", function () {
  var f = function (s, p) { return V.fmtFor({ w: s.w, si: s.si, pos: p }); };
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6].map(function (p) { return f(L3, p); }), ["A", "A", "S", "S", "S", "S", "S"]);
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6].map(function (p) { return f(L5, p); }), ["A", "A", "B", "A", "B", "A", "B"]);
  assert.deepStrictEqual([0, 1, 2].map(function (p) { return f(MULTI4, p); }), ["B", "B", "S"]);
  var M5 = find(function (s) { return s.lv === 5 && s.multi; });
  assert.deepStrictEqual([0, 1, 2, 3].map(function (p) { return f(M5, p); }), ["B", "B", "B", "B"]);
});
test("片語比照第 3 級（要拼）；表外的字比照第 5 級", function () {
  assert.strictEqual(PH.lv, 3); assert.strictEqual(PH.spell, true);
  assert.strictEqual(V.levelOf({ lv: 0, ph: false }), 5);
  assert.strictEqual(V.levelOf({ lv: null, ph: true }), 3);
  assert.strictEqual(V.levelOf({ lv: 2, ph: true }), 2);
});
test("一字多義的判定：abandon（兩個 v.）是，單一字義的不是", function () {
  assert.strictEqual(V.sense("abandon::0").multi, true);
  assert.strictEqual(L3.multi, false);
});
test("選項中文：拿掉含英文的括號、取第一個分號前、最多 12 字", function () {
  assert.strictEqual(V.shortZh("說明；解釋；是…的原因（account for）"), "說明");
  assert.strictEqual(V.shortZh("放棄（計畫、想法）"), "放棄（計畫、想法）");
  assert.strictEqual(V.shortZh("理解；體會（relate to）"), "理解");
  assert.strictEqual(V.shortZh("一二三四五六七八九十甲乙丙"), "一二三四五六七八九十甲乙");
});
test("中文重疊：切開去括號後比對，至少 2 字才算包含", function () {
  assert.strictEqual(V.overlap(V.termsOf("吸收"), V.termsOf("吸收水分；吸引")), true);
  assert.strictEqual(V.overlap(V.termsOf("放棄（計畫、想法）"), V.termsOf("計畫")), false);
  assert.strictEqual(V.overlap(V.termsOf("書"), V.termsOf("書本")), false);
  assert.strictEqual(V.overlap(V.termsOf("書"), V.termsOf("書")), true);
  assert.deepStrictEqual(V.termsOf("對…感興趣；…的人"), ["對", "感興趣", "人"]);
});
test("長得像：前 3 字母相同或編輯距離 ≤ 2", function () {
  assert.strictEqual(V.looksLike("absorb", "absolute"), true);
  assert.strictEqual(V.looksLike("adapt", "adopt"), true);
  assert.strictEqual(V.looksLike("cat", "car"), true);
  assert.strictEqual(V.looksLike("abandon", "spare"), false);
  assert.strictEqual(V.looksLike("bank", "bank"), false);
});
function checkOpts(q, mode) {
  var t = V.sense(q.id);
  assert.strictEqual(q.opts.length, 4);
  assert.strictEqual(q.opts[q.ans].id, t.id);
  var texts = q.opts.map(function (o) { return o.t; });
  assert.strictEqual(new Set(texts).size, 4, "選項重複：" + texts.join("/"));
  var words = q.opts.map(function (o) { return V.sense(o.id).wl; });
  assert.strictEqual(new Set(words).size, 4, "同一個字出現兩次：" + words.join("/"));
  q.opts.forEach(function (o) {
    if (o.id === t.id) return;
    assert.ok(!V.overlap(V.sense(o.id).wt, t.wt), "錯誤選項 " + o.id + " 的中文跟 " + t.id + " 重疊");
    if (mode === "B") assert.strictEqual(o.t, V.sense(o.id).w);   // B 一律用原形
  });
}
test("A、B 選項規則（各 150 題）：4 個不重複、只有一個是本字、錯誤選項中文不重疊", function () {
  var list = require("./lib.js").loadBank(), S = mkS(), r = L.seeded(7);
  for (var i = 0; i < 150; i++) {
    var e = list[Math.floor(r() * list.length)], si = Math.floor(r() * e.s.length);
    var id = e.w + "::" + si;
    checkOpts(V.makeQ(S, id, "A"), "A");
    checkOpts(V.makeQ(S, id, "B"), "B");
  }
});
test("錯誤選項至少一個長得像（找得到的話）", function () {
  var S = mkS();
  for (var i = 0; i < 20; i++) {
    var q = V.makeQ(S, "adapt::0", "A");
    assert.ok(q.opts.some(function (o) { return o.id !== "adapt::0" && V.looksLike(V.sense(o.id).w, "adapt"); }));
  }
});
test("頑固字的考題一定放搞混對象", function () {
  var S = mkS();
  for (var i = 0; i < 20; i++) {
    var q = V.makeQ(S, "absorb::0", "A", "abandon::0");
    assert.ok(q.opts.some(function (o) { return o.id === "abandon::0"; }));
  }
});
test("B 題：作答用原形、句中實際形式另外給；挖空不含答案", function () {
  var S = mkS(), q = V.makeQ(S, "abandon::1", "B");
  assert.strictEqual(q.form, "abandoned");
  assert.ok(q.opts.some(function (o) { return o.t === "abandon"; }));
  assert.ok((q.pre + q.post).toLowerCase().indexOf("abandon") < 0);
  assert.ok(q.exZh.length > 0);
});
test("拼寫判對：完整形、只打字根（有字尾提示）、大小寫與空白都算對", function () {
  var S = mkS(), q = V.makeQ(S, "abandon::1", "S");
  assert.strictEqual(q.suffix, "ed");
  assert.ok(V.checkSpell(q, "abandoned"));
  assert.ok(V.checkSpell(q, "abandon"));
  assert.ok(V.checkSpell(q, " Abandoned "));
  assert.ok(!V.checkSpell(q, "abandonned"));
  assert.ok(!V.checkSpell(q, ""));
});
test("例句輪替：exi 決定用第幾句", function () {
  var S = mkS(), it = put(S, L3, { pos: 2 });
  var a = V.makeQ(S, L3.id, "S").en;
  it.exi = 1;
  var b = V.makeQ(S, L3.id, "S").en;
  assert.notStrictEqual(a, b);
  it.exi = 2;
  assert.strictEqual(V.makeQ(S, L3.id, "S").en, a);
});
test("字母提示：單字逐字母、片語給每個字的開頭", function () {
  assert.strictEqual(V.hintMask({ form: "abandoned" }, 1), "a________");
  assert.strictEqual(V.hintMask({ form: "abandoned" }, 2), "ab_______");
  assert.strictEqual(V.hintMask({ form: "account for" }, 1), "a______ f__");
});
test("「我選的也說得通」→ 這題作廢：pos、lapses、搞混對象還原，明天再考，不再重考，記一筆 X 事件", function () {
  var S = mkS(), M5 = find(function (s) { return s.lv === 5 && !s.multi; });
  put(S, M5, { pos: 4, due: NOW, lapses: 3 });
  var x = review(S, M5, { pick: "wrong", rt: 1500 });
  assert.strictEqual(x.r.out, "hard");                    // 第 4 次 lapse → 變頑固字
  assert.strictEqual(x.sess.retry.length, 1);
  assert.strictEqual(V.undo(S, x.sess, x.st, NOW), true);
  var it = S.items[M5.id];
  assert.deepStrictEqual([it.pos, it.lapses, it.hard, it.ce, it.lastDn], [4, 3, false, 0, ""]);
  assert.deepStrictEqual(it.conf, {});
  assert.strictEqual(it.due, TOMORROW);
  assert.strictEqual(x.sess.retry.length, 0);
  var ev = x.sess.events[x.sess.events.length - 1];
  assert.strictEqual(ev[2], "X"); assert.strictEqual(ev[1], M5.id);
  assert.strictEqual(V.undo(S, x.sess, x.st, NOW), false);  // 不能作廢兩次
});
test("作廢只用在一般複習答錯；答對、新字、頑固字都不行", function () {
  var S = mkS(); put(S, L5, { pos: 2, due: NOW });
  var x = review(S, L5, { pick: "right", rt: 5000 });
  assert.strictEqual(V.undo(S, x.sess, x.st, NOW), false);
  var S2 = mkS(); put(S2, L3, { pos: 1, due: NOW, hard: true, lapses: 4 });
  var sess = V.startSession(S2, NOW, "d"), st = V.next(S2, sess, NOW);
  V.cardDone(S2, sess, st, 5000, NOW);
  st = V.next(S2, sess, NOW);
  V.submit(S2, sess, st, { pick: st.q.opts.filter(function (o) { return o.id !== L3.id; })[0].id, rt: 3000 }, NOW);
  assert.strictEqual(V.undo(S2, sess, st, NOW), false);
});
test("回報「我選的也說得通」：記下選了哪個字", function () {
  var S = mkS(), q = V.makeQ(S, "abandon::1", "B");
  V.report(S, q, NOW, "present");
  assert.strictEqual(S.bad[0].pk, "present");
  V.report(S, q, NOW);
  assert.strictEqual(S.bad[1].pk, undefined);
});
test("回報有問題：格式含 w、p、en、zh", function () {
  var S = mkS(), q = V.makeQ(S, "abandon::1", "B");
  V.report(S, q, NOW);
  assert.strictEqual(S.bad.length, 1);
  assert.strictEqual(S.bad[0].w, "abandon");
  assert.ok(S.bad[0].en.indexOf("abandoned") > -1);
});

/* ================= §5 一次練習 ================= */
test("新字一批：先測 → 學習卡 → 考一輪；又快又對的直接 pos 3", function () {
  var S = mkS();
  S.pool = ["abandon::0", "bank::0", "career::0", "delay::0", "fame::0"].filter(function (id) { return V.sense(id); });
  assert.strictEqual(S.pool.length, 5);
  var sess = V.startSession(S, NOW, "d");
  assert.strictEqual(sess.newLeft, 5);
  var kinds = [];
  for (var i = 0; i < 5; i++) {
    var st = V.next(S, sess, NOW);
    assert.strictEqual(st.kind, "P");
    var right = st.q.opts[st.q.ans].id;
    V.submit(S, sess, st, { pick: i === 0 ? right : "?", rt: i === 0 ? 1000 : 4000 }, NOW);
  }
  assert.strictEqual(S.items["abandon::0"].pos, 3);
  assert.strictEqual(S.items["abandon::0"].due, V.addDays(NOW, 14));
  assert.strictEqual(S.pool.length, 0);
  for (i = 0; i < 4; i++) {
    st = V.next(S, sess, NOW);
    kinds.push(st.kind);
    assert.ok(st.card && st.card.ex.length === 1);
    V.cardDone(S, sess, st, 6000, NOW);
  }
  assert.deepStrictEqual(kinds, ["C", "C", "C", "C"]);
  var wrongOnce = null;
  for (i = 0; i < 4; i++) {
    st = V.next(S, sess, NOW);
    assert.strictEqual(st.ph, "learn");
    if (i === 0) { wrongOnce = st.id; V.submit(S, sess, st, { pick: "?", rt: 3000 }, NOW); }
    else V.submit(S, sess, st, { pick: st.id, rt: 3000 }, NOW);
  }
  st = V.next(S, sess, NOW);
  assert.strictEqual(st.ph, "retry"); assert.strictEqual(st.id, wrongOnce);
  assert.strictEqual(S.items[wrongOnce].lapses, 0);          // 學習中的答錯不算 lapse
  V.submit(S, sess, st, { pick: st.id, rt: 3000 }, NOW);
  assert.strictEqual(S.items[wrongOnce].pos, 1);
  assert.strictEqual(V.next(S, sess, NOW).kind, "done");
  var l = S.log[TD];
  assert.strictEqual(l.n, 4); assert.strictEqual(l.p, 5);
  ["bank::0", "career::0", "delay::0", "fame::0"].forEach(function (id) {
    assert.strictEqual(S.items[id].pos, 1);
    assert.strictEqual(S.items[id].due, TOMORROW);
  });
});
test("校正週：先測答對的看完學習卡直接 pos 1，不再考", function () {
  var S = mkS({ install: TD });
  S.pool = ["bank::0", "career::0"];
  var sess = V.startSession(S, NOW, "d"), st;
  st = V.next(S, sess, NOW); V.submit(S, sess, st, { pick: st.q.opts[st.q.ans].id, rt: 900 }, NOW);
  st = V.next(S, sess, NOW); V.submit(S, sess, st, { pick: "?", rt: 4000 }, NOW);
  assert.strictEqual(S.items[sess.batch ? "bank::0" : "bank::0"].pos, 0);   // 校正週不跳 pos 3
  st = V.next(S, sess, NOW); V.cardDone(S, sess, st, 5000, NOW);
  st = V.next(S, sess, NOW); V.cardDone(S, sess, st, 5000, NOW);
  st = V.next(S, sess, NOW);
  assert.strictEqual(st.ph, "learn");
  assert.strictEqual(st.id, "career::0");
  assert.strictEqual(S.items["bank::0"].pos, 1);
});
test("next() 還沒作答就回傳同一題；submit 兩次只算一次", function () {
  var S = mkS(), it = put(S, L5, { pos: 2, due: NOW });
  var sess = V.startSession(S, NOW, "d");
  var a = V.next(S, sess, NOW), b = V.next(S, sess, NOW);
  assert.strictEqual(a, b);
  V.submit(S, sess, a, { pick: L5.id, rt: 5000 }, NOW);
  V.submit(S, sess, a, { pick: L5.id, rt: 5000 }, NOW);
  assert.strictEqual(it.seen, 1); assert.strictEqual(it.pos, 3);
});
test("順序：新字 → 頑固字 → 複習（ce>0 先、pos 低先、逾期比例高先）→ 答錯重考", function () {
  var S = mkS();
  var ids = require("./lib.js").loadBank().slice(100, 106).map(function (e) { return e.w + "::0"; });
  put(S, V.sense(ids[0]), { pos: 4, due: NOW - 30 * V.DAY });            // 逾期比例 1
  put(S, V.sense(ids[1]), { pos: 4, due: NOW - 3 * V.DAY });             // 逾期比例 0.1
  put(S, V.sense(ids[2]), { pos: 1, due: NOW });
  put(S, V.sense(ids[3]), { pos: 5, due: NOW, ce: 1 });
  put(S, V.sense(ids[4]), { pos: 1, due: NOW, hard: true });
  S.pool = [ids[5]];
  var sess = V.startSession(S, NOW, "d");
  assert.deepStrictEqual(sess.revQ, [ids[3], ids[2], ids[0], ids[1]]);
  assert.deepStrictEqual(sess.hardQ, [ids[4]]);
  var st = V.next(S, sess, NOW);
  assert.strictEqual(st.kind, "P");
});
test("頑固字：對照卡 → 考一題（含搞混對象）；不同天答對 2 次畢業回 pos 1", function () {
  var S = mkS(), it = put(S, V.sense("absorb::0"), { pos: 1, due: NOW, hard: true, lapses: 5, conf: { "abandon::0": 2 } });
  var sess = V.startSession(S, NOW, "d"), st;
  st = V.next(S, sess, NOW);
  assert.strictEqual(st.kind, "H"); assert.strictEqual(st.vs, "abandon::0"); assert.strictEqual(st.times, 2);
  V.cardDone(S, sess, st, 8000, NOW);
  st = V.next(S, sess, NOW);
  assert.strictEqual(st.ph, "hard");
  assert.ok(st.q.opts.some(function (o) { return o.id === "abandon::0"; }));
  var r = V.submit(S, sess, st, { pick: "absorb::0", rt: 3000 }, NOW);
  assert.strictEqual(r.out, "hardOk");
  assert.deepStrictEqual(it.hardOk, [TD]);
  assert.strictEqual(it.due, TOMORROW);
  assert.strictEqual(V.next(S, sess, NOW).kind, "done");
  var D2 = NOW + V.DAY;
  sess = V.startSession(S, D2, "d");
  st = V.next(S, sess, D2); V.cardDone(S, sess, st, 8000, D2);
  st = V.next(S, sess, D2);
  r = V.submit(S, sess, st, { pick: "absorb::0", rt: 3000 }, D2);
  assert.strictEqual(r.out, "graduate");
  assert.strictEqual(it.hard, false); assert.strictEqual(it.pos, 1); assert.strictEqual(it.lapses, 0);
  assert.strictEqual(it.due, V.addDays(D2, 1));
});
test("頑固字沒有搞混對象 → 學習卡列出全部例句；答錯當天重考答對不算", function () {
  var S = mkS(), it = put(S, L3, { pos: 1, due: NOW, hard: true, lapses: 4 });
  var sess = V.startSession(S, NOW, "d"), st;
  st = V.next(S, sess, NOW);
  assert.strictEqual(st.kind, "C"); assert.strictEqual(st.card.ex.length, L3.s.ex.length);
  V.cardDone(S, sess, st, 8000, NOW);
  st = V.next(S, sess, NOW);
  V.submit(S, sess, st, { pick: "?", rt: 3000 }, NOW);
  st = V.next(S, sess, NOW);
  assert.strictEqual(st.ph, "retry");
  var r = V.submit(S, sess, st, { pick: L3.id, rt: 3000 }, NOW);
  assert.strictEqual(r.out, "hardHold");
  assert.deepStrictEqual(it.hardOk, []);
});
test("頑固字每天最多 20 個", function () {
  var S = mkS();
  var list = require("./lib.js").loadBank().slice(0, 25);
  list.forEach(function (e) { put(S, V.sense(e.w + "::0"), { pos: 1, due: NOW, hard: true }); });
  var sess = V.startSession(S, NOW, "d");
  assert.strictEqual(sess.hardQ.length, 20);
  S.log[TD].h = 17;
  assert.strictEqual(V.startSession(S, NOW, "d").hardQ.length, 3);
});
test("頑固字等最久的先練；一樣久才看 ce 高的", function () {
  var S = mkS(), ids = require("./lib.js").loadBank().slice(200, 204).map(function (e) { return e.w + "::0"; });
  put(S, V.sense(ids[0]), { hard: true, due: NOW - 1 * V.DAY, ce: 5 });
  put(S, V.sense(ids[1]), { hard: true, due: NOW - 9 * V.DAY, ce: 0 });
  put(S, V.sense(ids[2]), { hard: true, due: NOW - 3 * V.DAY, ce: 1 });
  put(S, V.sense(ids[3]), { hard: true, due: NOW - 3 * V.DAY, ce: 4 });
  assert.deepStrictEqual(V.hardDue(S, NOW), [ids[1], ids[3], ids[2], ids[0]]);
});
test("字庫刪掉的字義（幽靈題）不排、不當掉", function () {
  var S = mkS();
  S.items["nosuchword::0"] = V.newItem({ w: "nosuchword", si: 0 }, NOW, "v1");
  S.items["abandon::9"] = V.newItem({ w: "abandon", si: 9 }, NOW, "v1");
  assert.deepStrictEqual(V.reviewDue(S, NOW), []);
  var sess = V.startSession(S, NOW, "d");
  assert.strictEqual(V.next(S, sess, NOW).kind, "done");
});

/* ================= §5 每天上幾個新字 ================= */
/* 新字池 n 個，前兩天各練了 40 分鐘（不觸發「新字減半」） */
function bigPool(S, n) {
  S.pool = V.mixByLevel(require("./lib.js").loadBank().slice(0, n).map(function (e) { return e.w + "::0"; }));
  [1, 2].forEach(function (d) { S.log[V.shiftDate(TD, -d)] = { a: 0, c: 0, ms: 40 * 60000, n: 0, k: {} }; });
}
test("新字數 = round((60 分 − 複習預估 − 頑固字預估) / 20)，上限 80", function () {
  var S = mkS(); bigPool(S, 400);
  assert.strictEqual(V.newQuota(S, NOW), 80);
  var bank = require("./lib.js").loadBank(), k = 0;
  for (var i = 0; k < 900; i++) {
    var s = V.sense(bank[i].w + "::0");
    if (s.multi || S.pool.indexOf(s.id) > -1) continue;
    put(S, s, { pos: 1, due: NOW }); k++;
  }
  /* 900 個 A 題 × 3.5 秒 = 3150 秒 → (3600 − 3150) / 20 = 22.5 → 23 */
  assert.strictEqual(V.newQuota(S, NOW), 23);
});
test("頑固字也扣時間：(C 6 秒 + A 3.5 秒) × 個數", function () {
  var S = mkS(); bigPool(S, 400);
  var e = V.estimate(S, NOW);
  assert.strictEqual(e.hard, 0);
  put(S, L5, { pos: 1, due: NOW, hard: true });
  assert.strictEqual(V.estimate(S, NOW).hard, 9.5);
});
test("用實測秒數：最近 14 天有 30 題以上就用平均", function () {
  var S = mkS();
  S.log[V.shiftDate(TD, -1)] = { a: 40, c: 30, ms: 0, n: 0, k: { A: { a: 40, c: 30, ms: 200000 } } };
  assert.strictEqual(V.secPer(S, "A", NOW), 5);
  assert.strictEqual(V.secPer(S, "B", NOW), 6);
  S.log[V.shiftDate(TD, -1)].k.A.a = 20;
  assert.strictEqual(V.secPer(S, "A", NOW), 3.5);
});
test("前兩天實際時間都不到預算一半 → 新字減半；install 之前的日子不算", function () {
  var S = mkS({ install: V.shiftDate(TD, -10) }); bigPool(S, 400);
  S.log[V.shiftDate(TD, -1)] = { ms: 10 * 60000, k: {} };
  S.log[V.shiftDate(TD, -2)] = { ms: 25 * 60000, k: {} };
  assert.strictEqual(V.newQuota(S, NOW), 40);
  S.log[V.shiftDate(TD, -2)].ms = 31 * 60000;
  assert.strictEqual(V.newQuota(S, NOW), 80);
  var S2 = mkS({ install: V.shiftDate(TD, -1) }); bigPool(S2, 400);
  assert.strictEqual(V.newQuota(S2, NOW), 80);
});
test("learnEnd（2027-01-10）之後不上新字", function () {
  var S = mkS(); bigPool(S, 400);
  assert.ok(V.newQuota(S, at("2027-01-10", 20)) > 0);
  assert.strictEqual(V.newQuota(S, at("2027-01-11", 20)), 0);
});
test("今天的額度第一次算完就固定，不隨複習進度變動", function () {
  var S = mkS(); bigPool(S, 400);
  var q = V.dayPlan(S, NOW).q;
  put(S, L5, { pos: 1, due: NOW });
  assert.strictEqual(V.dayPlan(S, NOW).q, q);
});
test("同一批 5 個不放前 3 字母相同、中文重疊的字", function () {
  var S = mkS();
  S.pool = ["abandon::0", "abandon::1", "absorb::0", "absolute::0", "bank::0", "career::0", "delay::0"].filter(function (id) { return V.sense(id); });
  var b = V.drawBatch(S, 5);
  assert.strictEqual(b.indexOf("abandon::1"), -1);
  assert.strictEqual(b.indexOf("absolute::0") > -1 && b.indexOf("absorb::0") > -1, false);
  for (var i = 0; i < b.length; i++) for (var j = i + 1; j < b.length; j++) {
    assert.notStrictEqual(V.sense(b[i]).wl.slice(0, 3), V.sense(b[j]).wl.slice(0, 3));
    assert.ok(!V.overlap(V.sense(b[i]).terms, V.sense(b[j]).terms));
  }
});
test("新字依級數比例混合：前 100 個裡 1～5 級約 10/20/30/30/10", function () {
  var bank = require("./lib.js").loadBank(), ids = [];
  bank.forEach(function (e) { e.s.forEach(function (x, si) { var s = V.sense(e.w + "::" + si); if (s.lv <= 5) ids.push(s.id); }); });
  var p = V.mixByLevel(ids).slice(0, 100), c = {};
  p.forEach(function (id) { var lv = V.sense(id).lv; c[lv] = (c[lv] || 0) + 1; });
  assert.deepStrictEqual(c, { 1: 10, 2: 20, 3: 30, 4: 30, 5: 10 });
});
test("首頁數字", function () {
  var S = mkS(); bigPool(S, 400);
  put(S, L5, { pos: 1, due: NOW });
  put(S, L3, { pos: 1, due: NOW, hard: true });
  V.tick(S, 12 * 60000, NOW);
  var h = V.homeInfo(S, NOW);
  assert.strictEqual(h.rev, 1); assert.strictEqual(h.hard, 1);
  assert.strictEqual(h.ms, 12 * 60000);
  assert.strictEqual(h.done, false); assert.strictEqual(h.floorMet, false);
  assert.strictEqual(h.newMin, Math.round(h.newLeft * 20 / 60));
});

/* ================= §9 搬家（每一類） ================= */
function v1Fixture() {
  var bank = require("./lib.js").loadBank();
  var pick = function (lv, skip) {
    for (var i = 0; i < bank.length; i++) {
      var e = bank[i];
      if (V.levelOf(e) === lv && !e.ph && skip.indexOf(e.w) < 0) return e.w;
    }
  };
  var used = [];
  var w = {};
  ["back", "hard", "wb", "box5a", "box24", "box01", "gradw", "knownw"].forEach(function (k) {
    w[k] = pick(k === "box5a" ? 2 : 3, used); used.push(w[k]);
  });
  w.box5b = pick(5, used);
  var OLD = at("2026-11-20", 9);
  var v1 = {
    v: 1,
    items: {},
    known: {}, grad: {}, gone: {}
  };
  v1.items[w.back + "::0"] = { w: w.back, si: 0, box: 0, due: 0, seen: 1, right: 0, wrong: 1, wb: true };
  v1.items[w.hard + "::0"] = { w: w.hard, si: 0, box: 0, due: 0, seen: 7, right: 2, wrong: 5, wb: true };
  v1.items[w.wb + "::0"] = { w: w.wb, si: 0, box: 1, due: 0, seen: 4, right: 2, wrong: 2, wb: true };
  v1.items[w.box5a + "::0"] = { w: w.box5a, si: 0, box: 6, due: OLD, seen: 5, right: 5, wrong: 0, wb: false };
  v1.items[w.box5b + "::0"] = { w: w.box5b, si: 0, box: 5, due: OLD, seen: 5, right: 4, wrong: 1, wb: false };
  v1.items[w.box24 + "::0"] = { w: w.box24, si: 0, box: 3, due: OLD, seen: 3, right: 3, wrong: 0, wb: false };
  v1.items[w.box01 + "::0"] = { w: w.box01, si: 0, box: 1, due: OLD, seen: 2, right: 1, wrong: 1, wb: false };
  v1.items["nosuchword::0"] = { w: "nosuchword", si: 0, box: 3, due: OLD, seen: 3, wb: false };
  v1.grad[w.gradw + "::0"] = 1;
  v1.known[w.knownw] = 1;
  return { v1: v1, w: w, OLD: OLD };
}
test("搬家：每一類的 pos、due、hard 都照 §9 的表", function () {
  var f = v1Fixture(), w = f.w;
  var m = V.migrate(f.v1, NOW), S = m.S;
  assert.strictEqual(S.items[w.back + "::0"], undefined);
  assert.strictEqual(S.pool[0], w.back + "::0");
  var h = S.items[w.hard + "::0"];
  assert.strictEqual(h.pos, 1); assert.strictEqual(h.hard, true); assert.strictEqual(h.due, NOW);
  assert.strictEqual(h.lapses, 0); assert.strictEqual(h.wrong, 5); assert.strictEqual(h.seen, 7);
  var x = S.items[w.wb + "::0"];
  assert.strictEqual(x.pos, 1); assert.strictEqual(x.hard, false); assert.strictEqual(x.due, NOW);
  assert.strictEqual(S.items[w.box5a + "::0"].pos, 4); assert.strictEqual(S.items[w.box5a + "::0"].due, f.OLD);
  assert.strictEqual(S.items[w.box5b + "::0"].pos, 3); assert.strictEqual(S.items[w.box5b + "::0"].due, f.OLD);
  assert.strictEqual(S.items[w.box24 + "::0"].pos, 2); assert.strictEqual(S.items[w.box24 + "::0"].due, f.OLD);
  assert.strictEqual(S.items[w.box01 + "::0"].pos, 1); assert.strictEqual(S.items[w.box01 + "::0"].due, NOW);
  assert.deepStrictEqual(
    [m.sum.back, m.sum.hard, m.sum.wb, m.sum.box5, m.sum.box24, m.sum.box01, m.sum.missing],
    [1, 1, 1, 2, 1, 1, 1]);
  Object.keys(S.items).forEach(function (k) {
    assert.strictEqual(S.items[k].lapses, 0); assert.strictEqual(S.items[k].src, "v1");
  });
});
test("搬家：快篩（整個字）與畢業照樣排除，不進 pool；其餘新字都在 pool", function () {
  var f = v1Fixture(), S = V.migrate(f.v1, NOW).S;
  var inPool = {}; S.pool.forEach(function (id) { inPool[id] = 1; });
  assert.ok(!inPool[f.w.gradw + "::0"]);
  V.sense(f.w.knownw + "::0").e.s.forEach(function (x, si) { assert.ok(!inPool[f.w.knownw + "::" + si]); });
  assert.ok(S.excl[f.w.gradw + "::0"]);
  assert.strictEqual(new Set(S.pool).size, S.pool.length);
  S.pool.forEach(function (id) { assert.ok(!S.items[id]); assert.ok(V.sense(id).lv <= 5); });
});
test("搬家：舊存檔一個字元都不改", function () {
  var f = v1Fixture(), before = JSON.stringify(f.v1);
  V.migrate(f.v1, NOW);
  assert.strictEqual(JSON.stringify(f.v1), before);
});
test("搬家：沒有舊存檔 → 從零開始，全部新字依級數排好", function () {
  var m = V.migrate(null, NOW);
  assert.strictEqual(Object.keys(m.S.items).length, 0);
  assert.ok(m.S.pool.length > 7000);
  assert.strictEqual(m.S.set.install, TD);
});
test("refreshPool：字庫新加的字義接到最後、失效的清掉", function () {
  var S = mkS();
  S.pool = ["abandon::0", "nosuchword::0", "abandon::0"];
  var n = V.refreshPool(S);
  assert.strictEqual(S.pool[0], "abandon::0");
  assert.strictEqual(S.pool.indexOf("nosuchword::0"), -1);
  assert.strictEqual(S.pool.lastIndexOf("abandon::0"), 0);
  assert.ok(n > 7000);
  var len = S.pool.length;
  assert.strictEqual(V.refreshPool(S), 0);
  assert.strictEqual(S.pool.length, len);
});

/* ================= 同步合併 ================= */
function twoSides() {
  var a = mkS(), b = mkS();
  a.mtime = 100; b.mtime = 200;
  return { a: a, b: b };
}
test("合併 items：seen 多的贏；一樣多取 due 晚的", function () {
  var t = twoSides();
  put(t.a, L3, { seen: 5, pos: 4, due: 10 });
  put(t.b, L3, { seen: 4, pos: 6, due: 99 });
  put(t.a, L5, { seen: 3, pos: 2, due: 50 });
  put(t.b, L5, { seen: 3, pos: 3, due: 80 });
  var m = V.merge(t.a, t.b, "d");
  assert.strictEqual(m.items[L3.id].pos, 4);
  assert.strictEqual(m.items[L5.id].pos, 3);
});
test("合併 items：只有一邊有的照收", function () {
  var t = twoSides();
  put(t.a, L3, { seen: 1 }); put(t.b, L5, { seen: 1 });
  var m = V.merge(t.a, t.b, "d");
  assert.ok(m.items[L3.id] && m.items[L5.id]);
});
test("合併：刪除墓碑（at 早於墓碑的不收；刪掉後重加的照留）", function () {
  var t = twoSides();
  put(t.a, L3, { seen: 9, at: 100 });
  put(t.a, L5, { seen: 9, at: 500 });
  t.b.gone[L3.id] = 300; t.b.gone[L5.id] = 300;
  var m = V.merge(t.a, t.b, "d");
  assert.strictEqual(m.items[L3.id], undefined);
  assert.ok(m.items[L5.id]);
  assert.strictEqual(m.gone[L3.id], 300);
});
test("合併 log：逐日逐欄取 max（含各題型）", function () {
  var t = twoSides();
  t.a.log["2026-11-01"] = { a: 10, c: 8, ms: 5000, n: 3, q: 20, h: 2, k: { A: { a: 6, c: 5, ms: 3000 } } };
  t.b.log["2026-11-01"] = { a: 7, c: 9, ms: 9000, n: 1, q: 25, k: { A: { a: 9, c: 2, ms: 1000 }, S: { a: 1, c: 1, ms: 9 } } };
  t.b.log["2026-11-02"] = { a: 1, c: 1, ms: 1, k: {} };
  var m = V.merge(t.a, t.b, "d");
  var d = m.log["2026-11-01"];
  assert.deepStrictEqual([d.a, d.c, d.ms, d.n, d.q, d.h], [10, 9, 9000, 3, 25, 2]);
  assert.deepStrictEqual(d.k.A, { a: 9, c: 5, ms: 3000 });
  assert.deepStrictEqual(d.k.S, { a: 1, c: 1, ms: 9 });
  assert.ok(m.log["2026-11-02"]);
});
test("合併 rt：本機自己的 key 用本機的，其他裝置的用雲端的", function () {
  var t = twoSides();
  t.a.rt = { "pc|A": [1], "phone|A": [2] };
  t.b.rt = { "pc|A": [3], "phone|A": [4], "pad|A": [5] };
  var m = V.merge(t.a, t.b, "pc");
  assert.deepStrictEqual(m.rt, { "pc|A": [1], "phone|A": [4], "pad|A": [5] });
});
test("合併 pool：照比較新那份的順序，已經在 items 的拿掉", function () {
  var t = twoSides();
  t.a.pool = ["abandon::0", "bank::0", "career::0"];
  t.b.pool = ["career::0", "bank::0", "delay::0"];
  put(t.a, V.sense("bank::0"), { seen: 1 });
  var m = V.merge(t.a, t.b, "d");
  assert.deepStrictEqual(m.pool, ["career::0", "delay::0", "abandon::0"]);
});
test("合併 set：取 mtime 新的；install 取最早；bad 去重聯集；mtime 取大", function () {
  var t = twoSides();
  t.a.set.budget = 45; t.a.set.install = "2026-10-15";
  t.b.set.budget = 50; t.b.set.install = "2026-10-20";
  t.a.bad = [{ w: "x", t: "B", en: "s" }]; t.b.bad = [{ w: "x", t: "B", en: "s" }, { w: "y", t: "A", en: "" }];
  var m = V.merge(t.a, t.b, "d");
  assert.strictEqual(m.set.budget, 50);
  assert.strictEqual(m.set.install, "2026-10-15");
  assert.strictEqual(m.bad.length, 2);
  assert.strictEqual(m.mtime, 200);
});
test("合併不改動兩邊、輸出不共用物件", function () {
  var t = twoSides();
  put(t.a, L3, { seen: 5 }); put(t.b, L5, { seen: 1 });
  t.a.log[TD] = { a: 1, c: 1, ms: 1, k: { A: { a: 1, c: 1, ms: 1 } } };
  var ja = JSON.stringify(t.a), jb = JSON.stringify(t.b);
  var m = V.merge(t.a, t.b, "d");
  assert.strictEqual(JSON.stringify(t.a), ja); assert.strictEqual(JSON.stringify(t.b), jb);
  m.items[L3.id].pos = 6; m.rt["d|A"].push(1);
  assert.strictEqual(JSON.stringify(t.a), ja);
});
test("合併：兩份是不同次搬家來的（重新搬家）→ 整份用比較新的那次，丟掉的不會被合併回來", function () {
  var t = twoSides();
  t.a.born = 1000; t.b.born = 2000;
  put(t.a, L3, { seen: 9 });                 // 舊的那份（要丟掉）練得比較多
  put(t.b, L5, { seen: 1 });
  var m = V.merge(t.a, t.b, "d"), m2 = V.merge(t.b, t.a, "d");
  assert.strictEqual(m.items[L3.id], undefined); assert.ok(m.items[L5.id]);
  assert.strictEqual(m.born, 2000);
  assert.strictEqual(JSON.stringify(m2.items), JSON.stringify(m.items));
});
test("搬家與從零開始都記下搬家時間；舊存檔沒有就是 0", function () {
  assert.strictEqual(V.migrate(null, NOW).S.born, NOW);
  assert.strictEqual(V.normalize({}).born, 0);
});
test("合併：一邊是空的（第一次同步）→ 複製另一邊", function () {
  var t = twoSides();
  put(t.b, L3, { seen: 1 });
  var m = V.merge(null, t.b, "d");
  assert.ok(m.items[L3.id]);
  assert.notStrictEqual(m.items[L3.id], t.b.items[L3.id]);
  assert.ok(V.merge(t.a, {}, "d").set);
});
test("合併後再合併一次結果不變（重複同步不會灌數字）", function () {
  var t = twoSides();
  put(t.a, L3, { seen: 5 });
  t.a.log[TD] = { a: 3, c: 2, ms: 100, k: {} };
  var m1 = V.merge(t.a, t.b, "d"), m2 = V.merge(m1, t.b, "d"), m3 = V.merge(m2, m1, "d");
  assert.strictEqual(JSON.stringify(m2), JSON.stringify(m1));
  assert.strictEqual(m3.log[TD].a, 3);
});
test("答題事件合併：聯集、去重、依時間排序", function () {
  var e1 = [100, "a::0", "A", 1, 3000, "a::0", 1, 2, "pc"];
  var e2 = [50, "b::0", "S", 0, 2000, "x", 2, 1, "phone"];
  var m = V.mergeEvents([e1], [e2, e1]);
  assert.deepStrictEqual(m, [e2, e1]);
});
test("每題都產生一筆答題事件，欄位照 §3", function () {
  var S = mkS(); put(S, L5, { pos: 2, due: NOW });
  var x = review(S, L5, { pick: "right", rt: 2500 });
  var ev = x.sess.events[0];
  assert.strictEqual(ev.length, 9);
  assert.deepStrictEqual([ev[0], ev[1], ev[3], ev[4], ev[5], ev[6], ev[7], ev[8]],
    [Math.floor(NOW / 1000), L5.id, 1, 2500, L5.id, 2, 4, "d"]);
});

process.exitCode = L.report("單元測試") ? 1 : 0;
