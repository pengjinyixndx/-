"""Dump contiguous text from the memory regions that hold the decrypted app bundle.

The anchoring probe located the bundle: regions of pid 120748 containing
"真心话大冒险" / "心跳副本". Pull every readable string out of those regions.
"""
import ctypes
import ctypes.wintypes as w
import os
import re
import sys

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
k32.VirtualQueryEx.restype = ctypes.c_size_t
k32.VirtualQueryEx.argtypes = [w.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t]
k32.ReadProcessMemory.argtypes = [w.HANDLE, ctypes.c_void_p, ctypes.c_void_p,
                                  ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t)]
PROCESS_QUERY_INFORMATION, PROCESS_VM_READ = 0x0400, 0x0010
MEM_COMMIT, PAGE_READABLE = 0x1000, {0x02, 0x04, 0x20, 0x40}
PAGE_GUARD, MAX_REGION, MIN_REGION = 0x100, 64 * 1024 * 1024, 4096

ANCHORS = ["真心话大冒险", "心跳副本", "角色名称", "玩法说明"]
TEXT = re.compile(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffefA-Za-z0-9\s]{4,400}")


class MBI(ctypes.Structure):
    _fields_ = [("BaseAddress", ctypes.c_void_p), ("AllocationBase", ctypes.c_void_p),
                ("AllocationProtect", w.DWORD), ("RegionSize", ctypes.c_size_t),
                ("State", w.DWORD), ("Protect", w.DWORD), ("Type", w.DWORD)]


def regions(h, min_size=MIN_REGION):
    addr, mbi = 0, MBI()
    while addr < 0x7FFFFFFF0000:
        if k32.VirtualQueryEx(h, ctypes.c_void_p(addr), ctypes.byref(mbi), ctypes.sizeof(mbi)) == 0:
            addr += 0x1000
            continue
        base, size, prot = mbi.BaseAddress or 0, mbi.RegionSize, mbi.Protect
        if (mbi.State == MEM_COMMIT and (prot & 0xFF) in PAGE_READABLE
                and not (prot & PAGE_GUARD) and min_size <= size <= MAX_REGION):
            yield base, size, mbi.Type
        addr = base + size


def rd(h, base, size):
    buf = ctypes.create_string_buffer(size)
    got = ctypes.c_size_t(0)
    if k32.ReadProcessMemory(h, ctypes.c_void_p(base), buf, size, ctypes.byref(got)):
        return buf.raw[:got.value]
    return b""


def main(pid, outdir):
    h = k32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, pid)
    if not h:
        print(f"pid {pid}: open failed")
        return
    anchors8 = [a.encode("utf-8") for a in ANCHORS]
    anchors16 = [a.encode("utf-16-le") for a in ANCHORS]

    os.makedirs(outdir, exist_ok=True)
    # only search reasonably sized PRIVATE regions: the bundle lives in the heap
    interesting = []
    for base, size, typ in regions(h):
        if size > 96 * 1024 * 1024:
            continue
        chunk = rd(h, base, size)
        if not chunk:
            continue
        score = sum(chunk.count(a) for a in anchors8) + sum(chunk.count(a) for a in anchors16)
        if score:
            interesting.append((score, base, size, typ, chunk))

    interesting.sort(key=lambda t: -t[0])
    print(f"pid {pid}: {len(interesting)} regions contain bundle anchors")
    all_text = []
    for score, base, size, typ, chunk in interesting:
        for enc in ("utf-16-le", "utf-8"):
            try:
                txt = chunk.decode(enc, "ignore")
            except Exception:
                continue
            for m in TEXT.findall(txt):
                s = m.strip()
                if len(s) >= 4:
                    all_text.append((score, base, enc, s))
    # keep the highest-anchor regions first, dedupe preserving order
    seen, ordered = set(), []
    for score, base, enc, s in all_text:
        key = (enc, s)
        if key in seen:
            continue
        seen.add(key)
        ordered.append((score, base, enc, s))

    p = os.path.join(outdir, f"bundle_text_{pid}.txt")
    with open(p, "w", encoding="utf-8") as f:
        for score, base, enc, s in ordered:
            f.write(f"[{score:>3} {base:#012x} {enc:<9}] {s}\n")
    print(f"  extracted {len(ordered)} text fragments -> {p}")
    q = [s for _sc, _b, _e, s in ordered if s.endswith("？")]
    print(f"  of which {len(q)} end with a full-width question mark")
    p2 = os.path.join(outdir, f"bundle_questions_{pid}.txt")
    with open(p2, "w", encoding="utf-8") as f:
        f.write("\n".join(q))
    print(f"  questions -> {p2}")


if __name__ == "__main__":
    main(int(sys.argv[1]), sys.argv[2])
