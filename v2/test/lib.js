/* 測試共用：載入字庫、固定亂數、迷你測試框架。不需要安裝任何套件。 */
process.env.TZ = "Asia/Taipei";
var fs = require("fs"), path = require("path"), vm = require("vm");

var ROOT = path.join(__dirname, "..", "..");      // 單字 repo 根目錄
var V2 = require(process.env.V2_CORE || "../core.js");   // V2_CORE：拿別的版本來比較（實驗用）

/* 照 index.html 的順序載入 data/*.js；addWords() 會填 window.WORD_BANK */
var BANK = null;
function loadBank() {
  if (BANK) return BANK;
  var ctx = vm.createContext({});
  ctx.window = ctx;
  var files = ["official.js", "bank.js"];
  for (var i = 1; i <= 47; i++) files.push("w" + i + ".js");
  files.push("p1.js");
  files.forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, "data", f), "utf8"), ctx, { filename: f });
  });
  BANK = ctx.WORD_BANK;
  return BANK;
}
/* 考卷重要字（data/prio.js） */
function loadPrio() {
  var ctx = vm.createContext({});
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(ROOT, "data", "prio.js"), "utf8"), ctx, { filename: "prio.js" });
  return ctx.EXAM_PRIO;
}

/* 固定種子的亂數（mulberry32），測試結果才重現得出來 */
function seeded(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 本機時間 → ms，例如 at("2026-10-20", 20) 是 10/20 晚上 8 點 */
function at(date, hour, min) {
  var p = date.split("-");
  return new Date(+p[0], +p[1] - 1, +p[2], hour || 0, min || 0).getTime();
}

/* 迷你測試框架 */
var results = [];
function test(name, fn) {
  try { fn(); results.push({ name: name, ok: true }); }
  catch (e) { results.push({ name: name, ok: false, err: e }); }
}
function report(title) {
  var bad = results.filter(function (r) { return !r.ok; });
  console.log("\n== " + title + "：" + (results.length - bad.length) + " / " + results.length + " 通過");
  bad.forEach(function (r) {
    console.log("  ✗ " + r.name);
    console.log("    " + String(r.err && r.err.stack || r.err).split("\n").slice(0, 4).join("\n    "));
  });
  var n = bad.length;
  results = [];
  return n;
}

/* 備份檔（2026-10-14 雲端進度）。單字 repo 在 學測作戰室/_匯入/英文單字/ 時的相對位置 */
var BACKUP = process.env.VOCAB_BACKUP ||
  path.join(ROOT, "..", "..", "data", "單字", "備份", "vocab-progress-2026-10-14.json");
function loadBackup() {
  if (!fs.existsSync(BACKUP)) return null;
  return JSON.parse(fs.readFileSync(BACKUP, "utf8"));
}

module.exports = {
  V2: V2, ROOT: ROOT, loadBank: loadBank, loadPrio: loadPrio, seeded: seeded, at: at,
  test: test, report: report, loadBackup: loadBackup, BACKUP: BACKUP
};
