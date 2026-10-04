"""Pull the app's metadata block (name / description) and any long-form in-app prose
out of the memory dump, by locating the description anchor and printing its vicinity."""
import os
import re
import sys

d = sys.argv[1]
ANCHOR = "真心话大冒险是一款"
CJK_PROSE = re.compile(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef，。！？、：；“”‘’（）—…A-Za-z0-9\s]{10,600}")

found = []
for f in sorted(os.listdir(d)):
    if not f.startswith("bundle_text_") and not f.startswith("pid"):
        continue
    p = os.path.join(d, f)
    if not os.path.isfile(p) or os.path.getsize(p) > 40 * 1024 * 1024:
        continue
    with open(p, encoding="utf-8") as fh:
        blob = fh.read()
    for m in re.finditer(re.escape(ANCHOR), blob):
        lo, hi = max(0, m.start() - 700), min(len(blob), m.end() + 700)
        found.append((f, blob[lo:hi]))

print(f"找到 {len(found)} 处描述锚点\n")
seen = set()
for f, ctx in found:
    if ctx in seen:
        continue
    seen.add(ctx)
    print("=" * 70)
    print("来源:", f)
    # strip the [score addr enc] prefixes this dump uses
    cleaned = re.sub(r"^\[\s*\d+ 0x[0-9a-f]+ (utf-8|utf-16-le)\s*\]\s*", "", ctx, flags=re.M)
    for line in cleaned.splitlines():
        if line.strip():
            print("   ", line.strip()[:200])
