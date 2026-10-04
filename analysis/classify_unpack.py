"""Classify wxapkg files: standard (V1MM + XOR 0x66 body) vs unknown, then unpack.
Recovers the body XOR key from the 0xBE magic byte even when the tag is V1MM.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from unpack_wxapkg import decode  # noqa: E402


def sane(body: bytes) -> bool:
    if body[0] != 0xBE:
        return False
    total = int.from_bytes(body[1:5], "big")
    if not (0 < total == len(body)):
        return False
    pos, n = 9, int.from_bytes(body[5:9], "big")
    if not (0 < n < 20000):
        return False
    names = []
    for _ in range(n):
        if pos + 4 > len(body):
            return False
        ln = int.from_bytes(body[pos:pos + 4], "big")
        pos += 4
        if not (0 < ln < 512) or pos + ln + 8 > len(body):
            return False
        nm = body[pos:pos + ln]
        if any(c < 0x20 or c > 0x7E for c in nm):
            return False
        names.append(nm.decode("ascii"))
        pos += ln + 8
    print(f"   OK files={n} first={names[:3]}")
    return True


def main(root: str, outbase: str) -> None:
    for dirpath, _dirs, files in os.walk(root):
        for fn in files:
            if not fn.endswith(".wxapkg"):
                continue
            p = os.path.join(dirpath, fn)
            raw = open(p, "rb").read()
            appid = os.path.basename(os.path.dirname(os.path.dirname(p)))
            ver = os.path.basename(os.path.dirname(p))
            label = f"{appid}_{ver}_{fn[:40]}"
            print(f"{label}  size={len(raw)}  tag={raw[:4]!r}")
            body = decode(raw)
            if not sane(body):
                print("   -> NOT standard (skip)")
                continue
            out = os.path.join(outbase, label)
            from unpack_wxapkg import unpack
            os.makedirs(out, exist_ok=True)
            unpack(p, out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
