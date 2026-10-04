"""Mine the memory dumps for the mini program's question bank."""
import glob
import os
import re
import sys
from collections import Counter

d = sys.argv[1]
KEY = ["真心话", "大冒险", "惩罚", "答题", "轮盘", "转盘", "骰子", "红绿灯",
       "亲", "吻", "抱", "脱", "摸", "亲密", "对象", "伴侣", "情侣", "男朋", "女朋",
       "现场", "罚", "敢不敢", "选一个", "说一个", "描述", "模仿"]

rows = []
for f in sorted(glob.glob(os.path.join(d, "*.txt"))):
    if "summary" in f:
        continue
    tag = os.path.basename(f).replace(".txt", "")
    with open(f, encoding="utf-8") as fh:
        lines = [l.rstrip("\n") for l in fh if l.strip()]
    q = [l for l in lines if l.endswith("？") or l.endswith("?")]
    hit = [l for l in lines if any(k in l for k in KEY)]
    print(f"{tag}: {len(lines)} 条 -> 疑问句 {len(q)} · 含关键词 {len(hit)}")
    rows.append((tag, q, hit))

allq, allk = [], []
for _t, q, h in rows:
    allq += q
    allk += h

print(f"\n合计疑问句 {len(allq)}（去重 {len(set(allq))}）")
print(f"合计关键词命中的句子 {len(allk)}（去重 {len(set(allk))}）")

with open(os.path.join(d, "_questions.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(sorted(set(allq))))
with open(os.path.join(d, "_keywords.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(sorted(set(allk))))

# how long are the question-like strings? real Q&A cards tend to be 8-40 chars
buckets = Counter()
for s in set(allq):
    n = len(s)
    buckets["<8" if n < 8 else "8-15" if n < 16 else "16-25" if n < 26 else "26-40" if n < 41 else ">=41"] += 1
print("疑问句长度分布:", dict(buckets))
