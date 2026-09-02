# -*- coding: utf-8 -*-
"""字庫驗收。補完一批單字後一定要跑，全部通過才算完成。

用法（在專案根目錄執行）：
    python .claude/skills/add-words/scripts/check.py            # 檢查全部
    python .claude/skills/add-words/scripts/check.py w8.js      # 只細查新寫的那個檔

檢查項目：
  A 檔案結構  每個資料檔只有一個結尾符號且在最後一行（腳本改檔最容易弄壞這裡）
  B 完整性    重複字、缺挖空、缺中譯、空義項、缺分級
  C 詞性覆蓋  官方標了哪些詞性就要有對應義項（CLAUDE.md 記錄的例外會略過）
  D 句子長度  一律 10～14 字
  E 中文純度  繁體中文裡不可以混英文字或簡體字

離開碼 0 = 全部通過；1 = 有問題要修。
"""
import io, os, re, sys, glob

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
DATA = os.path.join(ROOT, "data")
TERM = "`);"

# CLAUDE.md 記錄的「刻意不收」，這裡要同步
SKIP_POS = {
    "unique": {"n."}, "steady": {"adv.", "n."}, "scatter": {"n."},
    "grab": {"n."}, "rough": {"adv.", "n."},
    # 名詞用法罕見或非現代標準，學測不會考
    "skip": {"n."}, "suck": {"n."}, "swell": {"n."},
    # plenty 的副詞用法是美式口語（plenty big enough），學測不考
    "plenty": {"adv."},
    # cease 的名詞只出現在文言的 without cease，學測不考
    "cease": {"n."},
    # disorder 的動詞（使凌亂）現代英文已不用，只剩過去分詞 disordered
    "disorder": {"v."},
    # ethnic 的名詞（少數族裔的一員）是過時用法，學測只考形容詞
    "ethnic": {"n."},
    # universal 的名詞在朗文只有電影公司這個專有名詞，學測不考
    "universal": {"n."},
    # external 的名詞（externals＝外表）與 exotic 的名詞都很文言，學測只考形容詞
    "external": {"n."}, "exotic": {"n."},
    # w23（第 5 級 H–N）刻意不收的詞性：
    # incentive adj.（只出現在 incentive scheme 這類名詞修飾語，不是真正的形容詞）
    "incentive": {"adj."},
    # initiate 的 adj./n.（「新加入者」是宗教團體的舊用法）、initiative adj.（同理）
    "initiate": {"adj.", "n."}, "initiative": {"adj."},
    # league v.（結盟）與 legitimate v.（使合法）都很文言，學測只考名詞與形容詞
    "league": {"v."}, "legitimate": {"v."},
    # marine n.（海軍陸戰隊員）、masculine n. 與 metropolitan n. 都是專門用法
    "marine": {"n."}, "masculine": {"n."}, "metropolitan": {"n."},
    # mock n.（英式的模擬考複數 mocks）、neutral n.（排檔的空檔）學測不考
    "mock": {"n."}, "neutral": {"n."},
    # w24（第 5 級 A–G 漏網＋O–R）刻意不收的詞性：
    # certificate v.（發證書給）現代英文幾乎只用過去分詞 certificated
    "certificate": {"v."},
    # overall n. 是英式的工作罩衫、prior n. 是修道院副院長，學測都不考
    "overall": {"n."}, "prior": {"n."},
    # overturn n.（翻覆）罕用，現代英文只用動詞
    "overturn": {"n."},
    # pension v. 只出現在 pension somebody off 這個片語
    "pension": {"v."},
    # perspective adj.（透視的）是繪畫術語，recipient adj. 同樣是專門用法
    "perspective": {"adj."}, "recipient": {"adj."},
    # proportion v. 只用被動的 be proportioned to，很文言
    "proportion": {"v."},
    # w25（第 5 級 R 尾端＋S–T）刻意不收的詞性：
    # regardless adj.（He was regardless of the danger）是古典用法，現代只用副詞
    "regardless": {"adj."},
    # retail adv.（sell retail）是商業行話，學測不考
    "retail": {"adv."},
    # sole v.（給鞋換底）已是古語，soak n. 與 steer n.（閹牛）同樣罕用
    "sole": {"v."}, "soak": {"n."}, "steer": {"n."},
    # texture v.（使有紋理）現代英文幾乎只用過去分詞 textured
    "texture": {"v."},
    # sneak n.（打小報告的人）是英式口語，學測只考動詞
    "sneak": {"n."},
    # w26（第 5 級收尾 S 補遺＋T–Z）刻意不收的詞性：
    # saint v.（封聖）、warehouse v.（入倉）都極罕用
    "saint": {"v."}, "warehouse": {"v."},
    # slap adv.（slap in the middle）是口語強調用法
    "slap": {"adv."},
    # verbal n. 是文法術語「動狀詞」，學測只考形容詞
    "verbal": {"n."},
    # whatsoever pron.（＝whatever）已是古語
    "whatsoever": {"pron."},
    # triple n. 是棒球的三壘打（美式），transit v. 與 torch v.（縱火）都罕用
    "triple": {"n."}, "transit": {"v."}, "torch": {"v."},
    # w27（第 5 級完結）刻意不收的詞性：
    # canvas v.（用帆布覆蓋）、dome v.、jug v.、ridge v.、rim v.、yacht v. 都極罕用
    "canvas": {"v."}, "dome": {"v."}, "jug": {"v."},
    "ridge": {"v."}, "rim": {"v."}, "yacht": {"v."},
    # constitutional n.（保健散步）是古語，midst prep. 同樣文言
    "constitutional": {"n."}, "midst": {"prep."},
    # foul adv. 在朗文沒有獨立義項，只有 foully
    "foul": {"adv."},
    # rib v.（取笑）與 tin v.（裝罐）都是口語或英式用法
    "rib": {"v."}, "tin": {"v."},
    # nowhere pron. 朗文只列副詞；salmon adj.（鮭魚色）罕用
    "nowhere": {"pron."}, "salmon": {"adj."},
    # nutrient adj. 只當名詞修飾語（nutrient solution），不是真形容詞
    "nutrient": {"adj."},
    # w28（第 2 級 A–C）刻意不收的詞性：
    # absent v. 只有反身的 absent yourself from，非常正式，高中不考
    "absent": {"v."},
    # cartoon v.（畫漫畫）在朗文沒有獨立條目，現代英文罕用
    "cartoon": {"v."},
    # w30（第 2 級 E–H）刻意不收的詞性：
    # fit adv. 在朗文沒有獨立條目，副詞形式是 fittingly
    "fit": {"adv."},
    # w32（第 2 級 O–S）刻意不收的詞性：
    # post adv. 在朗文沒有獨立條目（post-1990 那種是構詞前綴，不是副詞）
    "post": {"adv."},
    # w33（第 2 級 S–T）刻意不收的詞性：
    # sour n. 只有調酒名（whisky sour），學測不考
    "sour": {"n."},
    # w34（第 2 級完結＋第 4 級漏網）刻意不收的詞性：
    # true adv.（技術用語 aim true）與 true v.（幾乎不存在）現代英文都不用
    "true": {"adv.", "v."},
    # intermediate v.（調停）極罕用；scold n.（愛責罵的人）是古語
    "intermediate": {"v."}, "scold": {"n."},
    # w35（第 1 級 A–B）刻意不收的詞性：
    # best v.（擊敗）朗文標為 old-fashioned，現代英文已不用
    "best": {"v."},
    # w36（第 1 級 B–D）刻意不收的詞性：
    # but adv.（＝only）與 dear adv.（cost dear）都是文言，現代口語不用
    "but": {"adv."}, "dear": {"adv."},
    # course v.（液體奔流）罕用；clean n. 是英式的 give it a clean
    "course": {"v."}, "clean": {"n."},
}

SIMPLIFIED = ("学说这个时会来对门车电关开现发应变从让见语问题认觉场长业头网买卖钱边岁点无义医声处备华单双号岛"
              "图团严丽举乐习书东达记计论该讲谁贵费资质类结给经续线组级纪约练织终统绝继显亲观规视览冲净减办务动"
              "劳势压厅历参叶吗员听启响园围圣报挥换据摄权极构树检楼标样机杀汉汤泽洁济浅测满灭灯烦热爱状独环产疗"
              "监盘众确离种积称稳穷签简紧纸罗联胜脑艺节苏药虑补装触议讯训设访证评识诉词试诗话详误请读课调谈谢财"
              "责败货购贸赛赞转轻载输迁运过违远连进适选递遗邮释银铁锁闻阅阴阳陆队阶随险难静韩顶顺须预领频颗风飞"
              "饭饰马验鱼鲜鸟鸡麦齿龄龙")

problems = []
legacy_short = {}


def fail(cat, msg):
    problems.append((cat, msg))


def parse_all(only=None):
    """回傳 [(檔名, 單字, 分級, [(詞性, 中文, [(英, 中)])])]"""
    entries = []
    files = sorted(glob.glob(os.path.join(DATA, "w*.js")) +
                   glob.glob(os.path.join(DATA, "p*.js")))
    for path in files:
        name = os.path.basename(path)
        if only and name != only:
            pass  # 仍然要載入，才能算全域重複
        text = open(path, encoding="utf-8").read()

        # A 檔案結構
        n_term = sum(1 for l in text.split("\n") if l.strip() == TERM)
        last = [l for l in text.rstrip().split("\n") if l.strip()][-1].strip()
        if n_term != 1 or last != TERM:
            fail("A 檔案結構",
                 "%s 有 %d 個結尾符號，最後一行是 %r —— 應該剛好 1 個且在最後一行。"
                 "這通常是腳本把檔尾的 `); 當成內容吃掉了，該檔的字會整批消失。"
                 % (name, n_term, last))

        cur = sense = None
        for line in text.split("\n"):
            s = line.strip()
            if not s or s.startswith("/*") or s.startswith("addWords"):
                continue
            if s[0] == "@":
                body = s[1:]
                bar = body.rfind("|")
                w = body[:bar].strip() if bar > -1 else body.strip()
                lv = int(body[bar + 1:]) if bar > -1 and body[bar + 1:].isdigit() else None
                cur = (name, w, lv, [])
                entries.append(cur)
                sense = None
            elif s[0] == "=" and cur:
                i = s.find("|")
                sense = (s[1:i].strip(), s[i + 1:].strip(), [])
                cur[3].append(sense)
            elif s[0] == "." and sense:
                i = s.find("|")
                sense[2].append((s[1:i].strip(), s[i + 1:].strip()))
    return entries


def official():
    src = open(os.path.join(DATA, "official.js"), encoding="utf-8").read()
    out = {}
    for lv, blob in re.findall(r'"([1-6])"\s*:\s*"([^"]*)"', src):
        for item in blob.split(","):
            item = item.strip()
            sp = item.rfind(" ")
            if sp > 0:
                out[item[:sp]] = (int(lv), item[sp + 1:].split("/"))
    return out


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    entries = parse_all(only)
    off = official()

    seen = {}
    n_ex = 0
    for name, w, lv, senses in entries:
        key = w.lower()
        is_phrase = " " in w
        if key in seen:
            fail("B 完整性", "重複的字：%s（%s 與 %s）" % (w, seen[key], name))
        seen[key] = name

        if not senses:
            fail("B 完整性", "%s 沒有任何義項" % w)
        if not is_phrase and lv is None:
            fail("B 完整性", "%s 沒有標分級" % w)

        for pos, zh, exs in senses:
            if not pos or not zh:
                fail("B 完整性", "%s 有義項缺詞性或中文" % w)
            if not exs:
                fail("B 完整性", "%s 的「%s」沒有例句" % (w, zh))
            for en, cn in exs:
                n_ex += 1
                if not re.search(r"\{\{.+?\}\}", en):
                    fail("B 完整性", "%s 的例句沒有挖空：%s" % (w, en))
                if not cn:
                    fail("B 完整性", "%s 的例句沒有中譯：%s" % (w, en))
                # D 句長。舊批次的短句是已知待改善項目，不擋新批次的驗收，
                #   所以只有「這次新增的檔」會被列為必須修正。
                n = len(re.sub(r"\{\{|\}\}", "", en).split())
                if n < 10 or n > 14:
                    if only is None or only == name:
                        fail("D 句子長度", "%s：%d 字（要 10～14）　%s" % (w, n, en))
                    else:
                        legacy_short.setdefault(name, 0)
                        legacy_short[name] += 1
                # E 中文純度。全形括號裡允許放英文，那是標搭配詞的慣例
                #   （例如「說明；解釋（account for）」），所以先把括號內容拿掉再檢查。
                for label, txt in (("中譯", cn), ("釋義", zh)):
                    bare = re.sub(r"（[^）]*）", "", txt)
                    if re.search(r"[A-Za-z]{3,}", bare):
                        fail("E 中文純度", "%s 的%s混進英文字：%s" % (w, label, txt))
                    bad = [c for c in bare if c in SIMPLIFIED]
                    if bad:
                        fail("E 中文純度", "%s 的%s有簡體字 %s：%s" % (w, label, bad, txt))
                    # 中文欄位裡不該出現中日韓與常用標點以外的文字。
                    # 踩過：security 的中譯被誤植成俄文「первый次給了他安全感」，
                    # 只查英文字母和簡體字的話完全抓不到。
                    alien = [c for c in txt if not (
                        "一" <= c <= "鿿" or           # 漢字
                        "　" <= c <= "〿" or           # 中文標點
                        "＀" <= c <= "￯" or           # 全形符號
                        c in "…—–‧·※" or              # 中文行文常用的其他標點
                        c.isascii() or c.isspace())]
                    if alien:
                        fail("E 中文純度",
                             "%s 的%s出現非中文字元 %s：%s" % (w, label, alien, txt))

        # C 詞性覆蓋
        if not is_phrase and key in off:
            mine = set(p for p, _, _ in senses)
            need = set(off[key][1]) - SKIP_POS.get(key, set())
            missing = need - mine
            if missing:
                fail("C 詞性覆蓋",
                     "%s（第%d級）官方有 %s，你只寫了 %s，缺 %s"
                     % (w, off[key][0], "/".join(sorted(need)),
                        "/".join(sorted(mine)), "/".join(sorted(missing))))
        elif not is_phrase and key not in off and lv != 0:
            fail("C 詞性覆蓋",
                 "%s 不在官方詞彙表內。刻意要收的話分級標成 |0，否則換一個字。" % w)

    words = [e for e in entries if " " not in e[1]]
    print("詞條 %d（單字 %d、片語 %d），義項 %d，例句 %d"
          % (len(entries), len(words), len(entries) - len(words),
             sum(len(e[3]) for e in entries), n_ex))
    print("官方詞彙表 %d 個字，已編寫 %d 個（%.1f%%）\n"
          % (len(off), len(words), len(words) / len(off) * 100))

    if legacy_short:
        total = sum(legacy_short.values())
        print("（舊批次還有 %d 句短於 10 字，分布：%s。這是已知待改善項目，不擋這次驗收。）\n"
              % (total, "、".join("%s %d" % kv for kv in sorted(legacy_short.items()))))

    if not problems:
        print("✅ 全部通過")
        return 0

    by_cat = {}
    for cat, msg in problems:
        by_cat.setdefault(cat, []).append(msg)
    for cat in sorted(by_cat):
        print("❌ %s（%d 項）" % (cat, len(by_cat[cat])))
        for m in by_cat[cat][:40]:
            print("   ・" + m)
        if len(by_cat[cat]) > 40:
            print("    …還有 %d 項" % (len(by_cat[cat]) - 40))
        print()
    return 1


if __name__ == "__main__":
    sys.exit(main())
