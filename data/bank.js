/* ============================================================
   單字庫的「格式定義」與載入器。
   你不需要改這個檔案，要加單字請改 data/w*.js 或 data/p*.js。

   資料寫法（每一行一個項目，行首那個符號決定意義）：

     @單字或片語|大考中心分級
     =詞性|中文意思
     .英文例句，要背的字用兩層大括號包起來|中文翻譯

   分級是大考中心《高中英文參考詞彙表》的 1～6 級，
   0 代表官方詞彙表沒收這個字，片語則不標（官方 108 年版不收片語）。

   例：
     @abandon|4
     =v.|拋棄；遺棄
     .They had to {{abandon}} the sinking ship.|他們只好棄船逃生。
     .He {{abandoned}} his dream of becoming a singer.|他放棄了當歌手的夢想。

   規則：
   - 一個 @ 底下可以有很多個 =（一個字的不同詞性／不同意思）
   - 一個 = 底下可以有很多個 .（同一個意思的多個例句，練習時會輪流出現）
   - {{ }} 裡面可以是變化形（{{abandoned}}、{{looking forward to}}），
     系統會拿裡面的字當答案，所以填空要填的就是括號裡那個形式
   ============================================================ */

window.WORD_BANK = [];

window.addWords = function (text) {
  var cur = null, sense = null;
  text.split("\n").forEach(function (raw) {
    var line = raw.trim();
    if (!line) return;
    var tag = line[0], body = line.slice(1).trim();
    if (tag === "@") {
      var bar = body.lastIndexOf("|");
      var w = bar > -1 ? body.slice(0, bar).trim() : body;
      var lv = bar > -1 ? parseInt(body.slice(bar + 1), 10) : NaN;
      cur = { w: w, ph: w.indexOf(" ") > -1, lv: isNaN(lv) ? null : lv, s: [] };
      sense = null;
      window.WORD_BANK.push(cur);
    } else if (tag === "=" && cur) {
      var i = body.indexOf("|");
      sense = { p: body.slice(0, i).trim(), zh: body.slice(i + 1).trim(), ex: [] };
      cur.s.push(sense);
    } else if (tag === "." && sense) {
      var j = body.indexOf("|");
      sense.ex.push({ en: body.slice(0, j).trim(), zh: body.slice(j + 1).trim() });
    }
  });
};
