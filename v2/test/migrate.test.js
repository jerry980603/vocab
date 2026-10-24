/* 搬家驗算（設計文件 §11 第 2 項）：用 2026-10-14 的雲端進度備份跑搬家，各類數量要對得上 §9。 */
var assert = require("assert");
var L = require("./lib.js"), V = L.V2, test = L.test;
V.setRandom(L.seeded(1014));
V.init(L.loadBank(), L.loadPrio());   // 跟 App 一樣載入考卷重要字

var v1 = L.loadBackup();
if (!v1) {
  console.log("\n== 搬家驗算：跳過（找不到備份檔 " + L.BACKUP + "，可用環境變數 VOCAB_BACKUP 指定）");
  return;
}
var NOW = L.at("2026-10-20", 20);
var before = JSON.stringify(v1);
var m = V.migrate(v1, NOW), S = m.S, sum = m.sum;

/* 備份裡被 2026-10-13 字庫稽核刪掉的字義（例如 cripple::1）在新字庫找不到，只能略過 */
var gone = Object.keys(v1.items).filter(function (k) { return !V.sense(k); });
var goneBack = gone.filter(function (k) { var o = v1.items[k]; return o.wb && (o.seen || 0) <= 1; });

test("退回新字 578（含字庫稽核刪掉的字義）", function () {
  assert.strictEqual(sum.back + goneBack.length, 578);
});
test("頑固字 128", function () { assert.strictEqual(sum.hard, 128); });
test("錯題本其他 418（1124 − 578 − 128）", function () {
  assert.strictEqual(sum.wb, 1124 - 578 - 128);
});
test("每一筆舊進度都有歸類，總數對得上", function () {
  var total = sum.back + sum.hard + sum.wb + sum.box5 + sum.box24 + sum.box01 + sum.missing + sum.grad;
  assert.strictEqual(total, Object.keys(v1.items).length);
  assert.strictEqual(sum.missing, gone.length);
});
test("退回新字的排在前面（第 1、2 級在快篩清單最前面，其餘緊接在考卷重要字之後）", function () {
  var front = {}, k = 0;
  while (k < S.pool.length && V.prioOf(V.sense(S.pool[k])) != null) front[S.pool[k++]] = 1;   // 考卷重要字排最前面
  S.pool.slice(k, k + sum.back).forEach(function (id) { front[id] = 1; });
  S.scr.slice(0, sum.back).forEach(function (id) { front[id] = 1; });
  Object.keys(v1.items).forEach(function (k) {
    var o = v1.items[k], s = V.sense(k);
    if (s && o.wb && (o.seen || 0) <= 1) assert.ok(front[s.id], k + " 沒有排在最前面");
  });
});
test("快篩、畢業的字不進 pool；pool 沒有重複、沒有跟 items 重疊", function () {
  var inPool = {};
  S.pool.forEach(function (id) {
    assert.ok(!inPool[id], "pool 重複：" + id); inPool[id] = 1;
    assert.ok(!S.items[id], "pool 跟 items 重疊：" + id);
  });
  var knownL = {};
  Object.keys(v1.known).forEach(function (w) { knownL[w.toLowerCase()] = 1; });
  S.pool.forEach(function (id) {
    var s = V.sense(id), wasBack = v1.items[id] && v1.items[id].wb;
    if (!wasBack) assert.ok(!knownL[s.wl], "快篩過的字進了 pool：" + id);
  });
  Object.keys(v1.grad).forEach(function (k) { assert.ok(!inPool[k], "畢業的字進了 pool：" + k); });
});
test("pos 都在 0～6、due 都是有效數字、lapses 都是 0", function () {
  Object.keys(S.items).forEach(function (k) {
    var it = S.items[k];
    assert.ok(it.pos >= 0 && it.pos <= 6 && it.pos === Math.floor(it.pos), k);
    assert.ok(isFinite(it.due) && it.due > 0, k);
    assert.strictEqual(it.lapses, 0);
  });
});
test("舊存檔一個字元都沒變", function () { assert.strictEqual(JSON.stringify(v1), before); });

var h = V.homeInfo(S, NOW), dist = {};
Object.keys(S.items).forEach(function (k) { var p = S.items[k].pos; dist[p] = (dist[p] || 0) + 1; });
console.log("\n搬家結果（" + V.dateStr(NOW) + "）");
console.log("  退回新字 " + sum.back + "（另有 " + goneBack.length + " 個已從字庫刪除：" + goneBack.join("、") + "）");
console.log("  頑固字 " + sum.hard + "、錯題本其他 " + sum.wb + "、熟（box≥5）" + sum.box5 +
  "、中（box 2～4）" + sum.box24 + "、生（box 0～1）" + sum.box01);
console.log("  排除（快篩／畢業／刪除）" + sum.excl + " 個字義、待學新字 " + sum.pool + " 個");
console.log("  各階數量 " + JSON.stringify(dist));
console.log("  第一天首頁：新字 " + h.newLeft + " 個、頑固字 " + h.hard + " 個、複習 " + h.rev +
  " 個（約 " + h.revMin + " 分）");

process.exitCode = L.report("搬家驗算") ? 1 : 0;
