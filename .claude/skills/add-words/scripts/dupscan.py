# -*- coding: utf-8 -*-
"""範本句掃描：找「不同的字、幾乎同一句」的例句。

check.py 的 F 撞題只擋「骨架 ≥0.97、中譯 ≥0.95、答案字母數相同」，
抓不到這兩種（2026/10 第二輪稽核一次修了一百多句）：

  1. 中譯只差一個不相干的字：tin／can 的「她打開一罐湯」vs「他打開一罐湯」
  2. 同義字只換答案、字母數不同：summit／peak、employment／job、
     spectacular／wonderful／impressive……八個形容詞共用「從山頂看出去的景色」

用法：
  python dupscan.py w48.js         只列出牽涉到 w48.js 的組合（寫完新批次跑這個）
  python dupscan.py                全庫
  python dupscan.py w48.js 0.80    自訂相似度門檻（預設 0.85）

結果要人工判斷：豬肉／牛肉、左腳／左膝這種中文提示分得出來、又不是同義字的，
可以留著；同義字（或字母數相同、中文也分不太出來）的，改寫其中一句。
"""
import io, re, os, sys, glob, difflib, collections

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "data"))

only = None
thr = 0.85
for a in sys.argv[1:]:
    if a.endswith(".js"):
        only = os.path.basename(a)
    else:
        thr = float(a)

S = []
for f in sorted(glob.glob(os.path.join(DATA, "[wp][0-9]*.js"))):
    w, si = None, -1
    for ln in io.open(f, encoding="utf-8"):
        ln = ln.strip()
        if ln.startswith("@"):
            w, si = ln[1:].rsplit("|", 1)[0], -1
        elif ln.startswith("="):
            si += 1
        elif ln.startswith(".") and w and "|" in ln:
            en, zh = ln[1:].split("|", 1)
            m = re.search(r"\{\{(.+?)\}\}", en)
            S.append({
                "w": w, "si": si, "f": os.path.basename(f), "en": en, "zh": zh,
                "sk": re.sub(r"\{\{.+?\}\}", "___", en).lower(),
                "n": len(m.group(1).replace(" ", "")) if m else 0,
            })

STOP = set("the a an of to in on at for and or but with by from is was were are be been "
           "it its this that these those he she they we you i his her their our my your as "
           "than then so not no very more most all every each into about after before over "
           "under during while when where who which what there here have has had do did does "
           "will would can could should may might must one two three".split())
toks = [set(t for t in re.findall(r"[a-z']+", s["sk"]) if t not in STOP and len(t) > 2) for s in S]
df = collections.Counter(t for ts in toks for t in ts)
inv = collections.defaultdict(list)
for i, ts in enumerate(toks):
    for t in ts:
        if df[t] <= 80:
            inv[t].append(i)
cand = collections.Counter()
for ids in inv.values():
    for a in range(len(ids)):
        for b in range(a + 1, len(ids)):
            cand[(ids[a], ids[b])] += 1

out = []
for (i, j), c in cand.items():
    A, B = S[i], S[j]
    if c < 2 or A["w"] == B["w"]:
        continue
    if only and only not in (A["f"], B["f"]):
        continue
    r = difflib.SequenceMatcher(None, A["sk"], B["sk"]).ratio()
    if r >= thr:
        out.append((A["n"] == B["n"], r, A, B))
out.sort(key=lambda x: (not x[0], -x[1]))

for same, r, A, B in out:
    tag = "⚠ 字母數相同" if same else "  字母數不同"
    print("%s  %.2f  %s[%d]（%s） ↔ %s[%d]（%s）" % (tag, r, A["w"], A["si"] + 1, A["f"], B["w"], B["si"] + 1, B["f"]))
    print("    " + A["en"] + "｜" + A["zh"])
    print("    " + B["en"] + "｜" + B["zh"])
print("共 %d 組（門檻 %.2f）" % (len(out), thr))
