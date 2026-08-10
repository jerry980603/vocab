# -*- coding: utf-8 -*-
"""列出官方詞彙表裡「還沒編寫釋義與例句」的字，依分級分組。

用法（在專案根目錄執行）：
    python .claude/skills/add-words/scripts/todo.py          # 全部分級的統計
    python .claude/skills/add-words/scripts/todo.py 3        # 只列第 3 級待補的字
    python .claude/skills/add-words/scripts/todo.py 3 120    # 只列前 120 個

輸出的每一行是「單字 官方詞性」，官方詞性就照這個寫，不要自己判斷。
"""
import io, os, re, sys, glob

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
DATA = os.path.join(ROOT, "data")


def official():
    """從 data/official.js 讀出 {word: (level, pos)}"""
    src = open(os.path.join(DATA, "official.js"), encoding="utf-8").read()
    out = {}
    for lv, blob in re.findall(r'"([1-6])"\s*:\s*"([^"]*)"', src):
        for item in blob.split(","):
            item = item.strip()
            if not item:
                continue
            sp = item.rfind(" ")
            if sp > 0:
                out[item[:sp]] = (int(lv), item[sp + 1:])
    return out


def written():
    """從 data/w*.js、p*.js 讀出已經寫好的字"""
    got = set()
    for f in sorted(glob.glob(os.path.join(DATA, "w*.js")) +
                    glob.glob(os.path.join(DATA, "p*.js"))):
        for line in open(f, encoding="utf-8"):
            m = re.match(r"^@([A-Za-z][A-Za-z' -]*?)(\|\d+)?\s*$", line.strip())
            if m:
                got.add(m.group(1).strip().lower())
    return got


def main():
    off, got = official(), written()
    todo = {w: v for w, v in off.items() if w not in got}

    lv = int(sys.argv[1]) if len(sys.argv) > 1 else None
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else None

    if lv is None:
        print("官方詞條 %d 個，已編寫 %d 個，待補 %d 個\n"
              % (len(off), len(off) - len(todo), len(todo)))
        for i in range(1, 7):
            n = sum(1 for v in todo.values() if v[0] == i)
            done = sum(1 for w, v in off.items() if v[0] == i and w in got)
            print("  第%d級：已寫 %4d／%4d，待補 %4d"
                  % (i, done, done + n, n))
        print("\n要看某一級的清單：python %s <級數> [數量]" % sys.argv[0])
        return

    rows = sorted((w, v[1]) for w, v in todo.items() if v[0] == lv)
    if limit:
        rows = rows[:limit]
    print("第 %d 級待補 %d 個（顯示 %d 個）\n" % (lv, sum(
        1 for v in todo.values() if v[0] == lv), len(rows)))
    for i in range(0, len(rows), 5):
        print("  " + "".join("%-26s" % (w + "  " + p) for w, p in rows[i:i + 5]))


if __name__ == "__main__":
    main()
