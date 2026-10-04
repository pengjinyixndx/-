"""Distil the two useful facts out of the memory dumps before the bulk is deleted:
the official app description and the in-app usage steps."""
import os
import re
import sys

d = sys.argv[1]
out = sys.argv[2]

DESC = "心跳副本是一款"
BULLET = re.compile(r"^\[\s*\d+ 0x[0-9a-f]+ (?:utf-8|utf-16-le)\s*\]\s*")

found = {}
for f in sorted(os.listdir(d)):
    if not f.startswith("bundle_text_"):
        continue
    blob = open(os.path.join(d, f), encoding="utf-8", errors="ignore").read()
    lines = [BULLET.sub("", l).strip() for l in blob.splitlines()]
    lines = [l for l in lines if l]
    # the description line carries the usage steps merged after it on the same fragment
    for i, l in enumerate(lines):
        if DESC in l:
            window = lines[max(0, i - 3): i + 14]
            found[f] = window

with open(out, "w", encoding="utf-8") as fh:
    fh.write("# 从微信小程序宿主进程内存恢复的官方文案\n")
    fh.write("# 来源：pid 120748 (WeChatAppEx) 私有内存，UTF-16LE\n")
    fh.write("# 方法：analysis/probe_encoding.py + analysis/dump_bundle.py\n\n")
    for src, window in found.items():
        fh.write(f"## 来源：{src}\n\n")
        for l in window:
            fh.write(f"  {l}\n")
        fh.write("\n")

print(f"wrote {out} ({len(found)} source(s))")
