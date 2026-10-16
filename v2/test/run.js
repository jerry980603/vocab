/* 跑全部測試：node v2/test/run.js
   單元測試 → 搬家驗算 → 虛擬 30 天 → 題目品質（設計文件 §11 第 1～4 項）→ 同步（假 GitHub）→ 亂操作壓力測試 */
var spawnSync = require("child_process").spawnSync, path = require("path");
var files = ["unit.test.js", "migrate.test.js", "sim30.test.js", "quality.test.js", "sync2.test.js", "fuzz.test.js"];
var failed = files.filter(function (f) {
  return spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: "inherit" }).status !== 0;
});
console.log("\n" + (failed.length ? "✗ 沒通過：" + failed.join("、") : "✓ 全部通過"));
process.exitCode = failed.length ? 1 : 0;
