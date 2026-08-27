# 給 Claude Code 的專案說明

## 📌 目前的讀書計畫（每次接手先看這裡）

| 項目 | 內容 |
|---|---|
| 考試日 | **2027 年 1 月 22 日**（學測） |
| 計畫起點 | 2026 年 8 月 10 日，全程 165 天 |
| 學習期 | 前 100 天（到 2026/11/18）上新字，**每天 62 個** |
| 鞏固期 | 後 65 天不上新字，只複習 |
| 考前 10 天 | 在 App 課表按「啟動考前總複習」，把所有字重排一次 |
| 目標範圍 | **官方詞彙表全部 6114 字**（使用者要求全包、平均分配） |

### 字庫進度（每寫完一批就更新這一列）

**已編好釋義與例句：2343 / 6114（3689 個字義）**

- `w1`～`w5`：440 字（原始批次，涵蓋 1～5 級）
- `w6`：47 字（第 3 級，動詞為主）
- `w7`：61 字（第 3 級，形容詞）
- `w8`：55 字（第 3 級，抽象名詞 A–M）
- `w9`：45 字（第 3 級，抽象名詞 N–Z）
- `w10`：52 字（第 3 級，動詞與多詞性字）
- `w11`：59 字（第 3 級，形容詞、動詞與名詞）
- `w12`：116 字（第 3 級，副詞、介系詞與多詞性動詞名詞 A–P）
- `w13`：125 字（第 3 級 R–Y 收尾 67 字 ＋ 第 4 級 A–B 起頭 58 字）
- `w14`：127 字（第 4 級：A–B 補遺 20 字 ＋ C 開頭 107 字，做到 `curve`）
- `w15`：125 字（第 4 級 D–F，做到 `freshman`）
- `w16`：122 字（第 4 級 G–L，做到 `luxury`）
- `w17`：123 字（第 4 級 M–P，做到 `pursuit`）
- `w18`：114 字（第 4 級 Q–T，做到 `timetable`）
- `w19`：121 字（第 4 級 T–Z 收尾 ＋ 前段補遺）
- `w20`：118 字（第 5 級 A–C，做到 `cluster`）
- `w21`：116 字（第 5 級 C–D，做到 `document`）
- `w22`：120 字（第 5 級 D–H，做到 `hazard`）
- `w23`：129 字（第 5 級 H–N，`heir` 到 `notion`）
- `w24`：125 字（第 5 級 A–G 漏網 ＋ O–R，做到 `recruit`）
- `p1`：52 個片語

**下一批要做**：**繼續第 5 級**（還缺 383 字）。`w24` 做完 A–G 的漏網
與 O–R（收在 `recruit`）。下一批從 **R 尾端接下去，主攻 S–Z**：

`refuge`、`regardless`、`regime`、`reinforce`、`reminder`、`removal`、`render`、
`repay`、`resemblance`、`residence`、`resident`、`residential`、`resort`、
`resume`、`retail`、`revenue`、`reverse`、`rigid`、`riot`、`risky`、`ritual`、
`rival`、`sacred`、`scan`、`scandal`、`scar`、`scenario`、`scent`、`scheme`、
`scope`、`scramble`、`scrap`、`script`、`sector`、`segment`、`sensation`、
`sensitivity`、`sentiment`、`sequence`、`series`、`session`、`setting`、
`shatter`、`shed`、`sheer`、`shield`、`shiver`、`shrug`、`sibling`、`slam`、
`slavery`、`smash`、`snatch`、`sneak`、`soak`、`soar`、`sober`、`soften`、
`sole`、`sophisticated`、`spacious`、`specialist`、`specialize`、`specify`、
`spectacular`、`spectator`、`spectrum`、`speculate`、`sphere`、`sponsor`、
`stability`、`stack`、`stain`、`stake`、`stall`、`stance`、`startle`、`steer`、
`stereotype`、`stimulate`、`storage`、`straightforward`、`strain`、`strap`、
`strategic`、`striking`、`structural`、`stumble`、`subsequent`、`substantial`、
`substitute`、`subtle`、`successor`、`superb`、`supervise`、`supreme`、
`surplus`、`suspend`、`sustain`、`swap`、`symptom` 等，一批抓 120 字左右。

⚠ 第 5 級剩下的字裡仍有不少冷僻具體名詞（sandal、salmon、salon、sheriff、
skull、smog、sponge、squash、stew 這類），**挑字時要跳過**，
優先做動詞、形容詞與抽象名詞。

**第 4 級只剩 96 字**，幾乎全是冷僻具體名詞（aquarium、broom、lobster、pasta、
raisin 這類），學測不會考，不必回頭補。少數還算有用的（`arch`、`audio`、`facial`、
`fossil`、`percent`、`physicist`、`skyscraper`、`socket`、`vegetarian`）可以順手夾帶。

**第 3 級剩下的 387 字幾乎全是冷僻具體名詞**（kangaroo、spaghetti、doughnut、
lollipop、zipper 這類），學測不會考，除非使用者另有要求，否則不必再回頭補。

用下面的腳本就能列出待補清單：

```bash
python .claude/skills/add-words/scripts/todo.py 3 130
```

**已知待改善（還沒動）**：`w1`～`w5` 與 `p1` 有 987 句例句短於 10 字，
情境線索不足。`w6` 之後的批次都符合 10～14 字的標準。
重寫這批大約需要 6～8 次對話，使用者知道這件事，目前選擇先衝數量。

### ⚠ 內容進度是整個計畫的瓶頸

使用者每天要學 62 個字，但一次對話大約只能產出 130～150 個高品質詞條。
**內容必須跑在學習進度前面**，否則他會沒有字可以練。
使用者的做法是每天開新對話叫你補一批——所以這份文件必須隨時保持最新，
新的對話才接得下去。**每寫完一批，務必回來更新上面的「字庫進度」。**

## 在新對話接手時怎麼開始

**最快的方式是直接叫用 `add-words` skill**（使用者說「繼續補單字」就會觸發）。
它把整套流程、查證方式、寫作規則與驗收都包好了，位置在
`.claude/skills/add-words/`，裡面附了兩個腳本：

```bash
python .claude/skills/add-words/scripts/todo.py        # 看還缺哪些字
python .claude/skills/add-words/scripts/todo.py 3 130  # 列第 3 級待補清單（含官方詞性）
python .claude/skills/add-words/scripts/check.py w8.js # 補完之後驗收
```

不用 skill 手動做的話，順序是：

1. 讀這份文件（尤其是上面的計畫與進度、下面的三項檢查）
2. 從「下一批要做」挑約 130 個字
3. 照「資料格式」與「寫例句的規則」寫進**新的資料檔**（`w8.js`、`w9.js`…）
4. 在 `index.html` 與 `sw.js` 各加一行，`sw.js` 的 `CACHE` 版本號 +1
5. 跑完下面**三項檢查**與 `check.py`
6. 回來更新「字庫進度」那一段


這是一個單人使用的英文單字練習網頁（純前端、離線、無後端）。
使用者是台灣高中生，目標是學測 7000 單與常考片語，程度請設定在**高中生看得懂**。

## 使用者最常要求的事：把新單字加進字庫

### 字庫檔案

| 檔案 | 內容 |
|---|---|
| `data/official.js` | **大考中心官方 6114 詞條的索引**（分級＋官方詞性，無釋義例句）。由 PDF 產生，不要手改 |
| `data/w1.js` | 單字 A–C |
| `data/w2.js` | 單字 D–F |
| `data/w3.js` | 單字 G–M |
| `data/w4.js` | 單字 N–R |
| `data/w5.js` | 單字 S–Z |
| `data/w6.js`～`data/w24.js` | 補充批次（第 1～19 批）。`w6`～`w13` 前半第 3 級，`w13`～`w19` 第 4 級，`w20` 起第 5 級 |
| `data/p1.js` | 片語 |

**大批擴充時開新檔**（`w7.js`、`w8.js`…），不要用腳本插進既有檔案——
理由見下面「用腳本批次改資料檔的陷阱」。開新檔記得在 `index.html` 與 `sw.js`
各加一行，並把 `sw.js` 的 `CACHE` 版本號 +1，否則手機會拿到舊的快取。

目前進度：官方 6114 個字裡，**已編好釋義與例句的有 2343 個**（以上面的「字庫進度」為準）。
剩下的字在 App 的「查單字」查得到分級與詞性，但標示為「尚未編寫例句」。
擴充字庫就是把這些字逐批補成完整詞條——這是本專案接下來最主要的工作。

新字**依字母加到對應的檔案**，插在正確的字母順序位置。單一檔案超過約 150 個字時，
再開 `w6.js` 之類的新檔，並記得在 `index.html` 與 `sw.js` 的清單裡各加一行。

### 資料格式（定義在 `data/bank.js`）

```
@abandon|4
=v.|拋棄；遺棄
.The crew had to {{abandon}} the sinking ship as it began to tilt.|船身開始傾斜時，船員們只好棄船逃生。
.She would never {{abandon}} a close friend who was in serious trouble.|她絕不會拋下陷入嚴重麻煩的好朋友。
=v.|放棄（計畫、想法）
.He {{abandoned}} his plan to study abroad after his father fell ill.|父親病倒後，他放棄了出國念書的計畫。
```

- `@` 開頭：單字或片語，後面用 `|` 接**大考中心《高中英文參考詞彙表》的分級 1～6**。
  `0` 代表官方詞彙表查無此字；**片語不標分級**（官方 108 年版已不收片語）。
  含空格會被自動判定為片語。
- `=` 開頭：一個詞性與中文意思，用 `|` 隔開。**一個字有幾個常考意思就寫幾個 `=`**
- `.` 開頭：例句，用 `|` 隔開英文與中文。要挖空的字用 `{{ }}` 包起來

### 詞性一定要對照官方詞彙表

大考中心詞彙表的 PDF 放在專案根目錄（已被 `.gitignore` 排除，不會上傳）。
**新增或修改任何字之前，先用它確認該字的官方詞性與分級**，不要憑印象寫。
抽取分級的腳本寫法參考本文件最後一節。

原則：官方標了幾個詞性，就盡量把那幾個詞性的常用義項都寫進去。
若某個詞性在現代英文已罕用或過時（例如 `unique` 的 n.、`steady` 的 adv./n.），
可以不收，但要在此處記錄原因。

**目前刻意不收的**：`unique` n.（非現代標準用法）、`steady` adv./n.（過時）、
`scatter` n. 與 `grab` n.（口語且罕用，學測不會考）、
`rough` adv./n.（sleep rough 是英式且限於「露宿街頭」，n. 指草圖，兩者都罕用）、
`plenty` adv.（美式口語 plenty big enough，學測不考）、
`cease` n.（只出現在文言的 without cease）、
`disorder` v.（現代英文已不用，只剩過去分詞 disordered）、
`ethnic` n.（「少數族裔的一員」是過時用法，學測只考形容詞）、
`universal` n.（朗文只有電影公司這個專有名詞）、
`external` n. 與 `exotic` n.（都很文言，學測只考形容詞）。

`w23`（第 5 級 H–N）新增的：`incentive` adj.（只當名詞修飾語用，不是真形容詞）、
`initiate` adj./n. 與 `initiative` adj.（「新加入者」是宗教團體的舊用法）、
`league` v.（結盟）、`legitimate` v.（使合法）、`marine` n.（海軍陸戰隊員）、
`masculine` n.、`metropolitan` n.、`mock` n.（英式的模擬考複數 mocks）、
`neutral` n.（排檔的空檔）。

`w24`（第 5 級 A–G 漏網＋O–R）新增的：`certificate` v.（現代只用過去分詞
certificated）、`overall` n.（英式的工作罩衫）、`prior` n.（修道院副院長）、
`overturn` n.（罕用）、`pension` v.（只有 pension somebody off 這個片語）、
`perspective` adj. 與 `recipient` adj.（都是專門術語）、
`proportion` v.（只用被動的 be proportioned to，很文言）。

以上都已同步寫進 `check.py` 的 `SKIP_POS`，驗收不會再報這些缺漏。

**因為官方詞性湊不出現代用法而整個跳過的字**：`cable` v.（只有「發電報」這個舊義）、
`fist` v.（現代英文沒有這個動詞）、`addict` v.（現代只用 be addicted to，動詞原形不用）、
`counter` adj./adv.（只存在於 run counter to 這一個片語，硬寫會變成兩個重複的義項）、
`choke` n.（只有汽車的「阻風門」這個義項，學測不會考）。
要收的話得先想好那個詞性的義項怎麼寫。

### 品質優先序（使用者明確指定）

1. **中文釋義最重要**：要正式、要準確、一字多義要收齊。
   寫之前先查 <https://www.ldoceonline.com/dictionary/該字> 確認義項清單，
   釋義對應到朗文的哪一個 sense，不要憑印象翻譯。
2. **例句以「用法正確」為底線**：搭配詞、介系詞、接不定詞或動名詞都必須對，
   照朗文列出的 grammar pattern（例如 `assist somebody in doing something`）造句。
   文采不重要，用法錯了才是致命傷。

**已經踩過的錯**：`engage` 曾被我寫成「使訂婚」並用 `They got engaged` 當例句——
那是形容詞 `engaged` 的用法，朗文的動詞條目沒有這個義項。
**教訓：不要把某個變化形的慣用法，當成原形動詞的義項。**

### 寫例句的規則

1. **每個 `=` 至少 2 句例句**（練習時會輪流出現，避免使用者只記得住單一句子）。
   次要／冷門的字義可以只給 1 句。
2. `{{ }}` 裡面放**句子裡實際出現的形式**，包含變化形：
   `{{abandoned}}`、`{{looking forward to}}`、`{{was about to}}`。
   系統直接拿括號裡的字串當答案比對（不分大小寫、空白寬鬆）。
3. **句子長度一律 10～14 個英文單字。** 這是硬性要求：
   太短的句子（例如 `The surgeon performed the operation.`）幾乎沒有給出情境線索，
   使用者只能靠中文提示硬背，情境記憶法就失效了。
   句子要提供**足以回想出目標字的上下文**，例如加上原因、結果、時間或對比。
4. 英文要**道地而正式**：完整句、正確搭配詞、避免口語縮寫與俚語。
   不確定某個搭配是否自然時，去 <https://www.ldoceonline.com/dictionary/該字> 查證。
5. **句子裡其他的字要比目標字簡單**，不要用更難的字去解釋難字。
6. 中文翻譯用**台灣用語的繁體中文**。標點用全形（，。？！），不要出現任何簡體字。
7. 中文釋義比照學測 7000 單字表的常見譯法，多個意思用全形分號 `；` 隔開。
8. 內容裡不要出現 `|` 這個符號（它是欄位分隔符）。

### ⚠ 每做完一批，一定要跑這三項檢查（使用者明確要求）

**1. 有沒有漏掉易考的多義字？**

兩層都要查：
- **詞性層**：跑下面的自動檢查，官方標了哪些詞性就要有對應義項。
- **義項層（自動檢查抓不到，一定要人工做）**：同一個詞性底下可能有多個常考意思。
  打開 <https://www.ldoceonline.com/dictionary/該字> 逐條對照，
  問自己「這個 sense 學測會不會考？」會考就要收。
  這一層踩過的實例：`loose` 漏了「掙脫的」、`solid` 漏了「純的；實心的」、
  `bitter` 的「憤恨的」與「嚴寒的」差點只寫「味苦的」。
  判定罕考而跳過的要在上面「刻意不收」那一節記錄理由。

**2. 中文解釋是否精闢正確？**

- 每個 `=` 的中文必須對應到朗文的某一個 sense，不要憑印象翻譯。
- 用**正式**的字典體釋義，不要口語。多個意思用全形分號 `；` 隔開。
- 檢查有沒有把某個變化形的慣用法誤當成原形的義項
  （踩過：`engage` 被寫成「使訂婚」，那其實是形容詞 `engaged`）。

**3. 句子的用法、語法、文法是否正確？**

- 搭配詞、介系詞、接不定詞或動名詞，一律照朗文列出的 grammar pattern
  （例如 `assist somebody in doing something`）。
- 逐句重讀一遍，特別留意冠詞、單複數、時態一致、以及不自然的搭配
  （踩過：`leave a safe job for art` 應為 `for a career in art`）。
- 中文翻譯裡不可以出現英文字（踩過兩次：`整座村莊completely被雪掩埋`、`偏遠的山village`）。

### 加完之後一定要做的檢查

用瀏覽器打開 `index.html`（或 preview_start 起 `vocab`），**先看 console 有沒有紅字**，再執行：

```js
JSON.stringify({
  total: WORD_BANK.length,
  dup: (function(){var s={},d=[];WORD_BANK.forEach(e=>{var k=e.w.toLowerCase();if(s[k])d.push(e.w);s[k]=1});return d})(),
  noBlank: WORD_BANK.flatMap(e=>e.s.flatMap(s=>s.ex)).filter(x=>!/\{\{.+?\}\}/.test(x.en)).length,
  emptySense: WORD_BANK.filter(e=>e.s.some(s=>!s.ex.length)).map(e=>e.w),
  noLevel: WORD_BANK.filter(e=>!e.ph && e.lv===null).map(e=>e.w),
  tooShort: WORD_BANK.flatMap(e=>e.s.flatMap(s=>s.ex)).filter(x=>x.en.replace(/\{\{|\}\}/g,"").split(/\s+/).length<9).length
})
```

`dup`、`emptySense`、`noLevel` 必須是空陣列，`noBlank` 必須是 0。
`total` 不可以比你動手前少——**少了就是資料檔壞掉了**，往下看。

**`tooShort` 是把關句子品質的硬指標**：你這批新增的字不可以讓它增加。
新寫的句子一律 10～14 字，寫完自己數一遍。使用者已經兩次特別要求句子的長度與品質，
短句（`The surgeon performed the operation.` 這種）等同沒有情境線索，是不合格的產出。

### ⚠️ 用腳本批次改資料檔的陷阱（踩過一次）

每個資料檔是一整個 JS 樣板字串，開頭 `addWords(\`` 、結尾 `` `); ``。
如果腳本用「一直讀到下一個 `@` 或空行為止」的方式抓取某個字的區塊，
遇到**檔案最後一個字**時會把結尾的 `` `); `` 也一起吃進去，
新內容被插到結束符號後面 → 整個檔語法錯誤 → `addWords()` 不執行 → 那個檔的字全部消失。

症狀是 console 出現 `SyntaxError: Unexpected token '='`，而 `WORD_BANK.length` 大幅減少。
批次腳本跑完後**務必檢查每個資料檔只有一個 `` `); `` 且位在最後一行**。

## 另一種常見要求：修正例句

使用者會從 App 的「設定 → 回報的怪句子」複製一份清單過來。
照清單找到對應的 `@單字` 底下那一句，直接改寫該行即可。

## 不要動的東西

- `app.js` 的 localStorage key 是 `vocabApp_v1`。改動存檔結構會**清掉使用者的學習進度**，
  除非使用者明確要求，否則不要改；真要改請一併寫升級轉換邏輯。
- `data/bank.js` 的解析器格式不要改，五個資料檔都依賴它。

## 本機預覽

`.claude/launch.json` 已設定好，用 preview_start 啟動名為 `vocab` 的設定即可
（`python -m http.server 8712`）。
