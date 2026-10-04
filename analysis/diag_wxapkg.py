"""Diagnose what encoding a V1MM package body uses."""
import os
import math
import zlib
import sys

p = sys.argv[1]
raw = open(p, "rb").read()
body = raw[4:]
print("size:", len(raw), "body:", len(body))
print("tag:", raw[:4])

# 1) entropy
def entropy(b):
    from collections import Counter
    c = Counter(b)
    n = len(b)
    return -sum(v / n * math.log2(v / n) for v in c.values())

print("entropy(bytes[4:]):", round(entropy(body), 4))
print("entropy(bytes[4096:]):", round(entropy(body[4096:]), 4))

# 2) repeat-detection: identical 16-byte blocks would indicate ECB
blocks = [body[i:i + 16] for i in range(0, len(body) - 16, 16)]
print("16B block uniqueness:", round(len(set(blocks)) / len(blocks), 5))

# 3) known magic numbers anywhere
for name, sig in [
    (b"WXAPKG_MAGIC_BE", b"\xbe\x00\x00"),
    (b"V1MM", b"V1MM"),
    (b"gzip", b"\x1f\x8b"),
    (b"zlib-default", b"\x78\x9c"),
    (b"zlib-best", b"\x78\xda"),
    (b"zstd", b"\x28\xb5\x2f\xfd"),
    (b"brotli-ish", b"\xce\xb2\xcf\x81"),
    (b"{", b"{"),
    (b"pages/", b"pages/"),
    (b"app.json", b"app.json"),
]:
    i = raw.find(sig)
    print(f"  find {name!r}: {i}")

# 4) single-byte XOR scan on first 4KB looking for printable runs
best = []
for k in range(256):
    d = bytes(b ^ k for b in raw[:4096])
    score = sum(1 for c in d if 32 <= c < 127 or c in (9, 10, 13))
    best.append((score, k))
best.sort(reverse=True)
print("top single-byte XOR keys by printable ratio:", best[:5])

# 5) try zlib on body as-is
for off in (0, 4, 8, 9):
    for label, data in (("xor66", bytes(b ^ 0x66 for b in body[off:])), ("plain", body[off:])):
        try:
            out = zlib.decompress(data)
            print(f"  zlib ok off={off} {label} -> {len(out)}")
        except Exception as e:
            pass
print("done")
