"""Inspect the V8 code cache and identify which WeChatAppEx process hosts which appid.

V8 cached bytecode keeps its constant-pool strings in plaintext, so if the game's
business code was ever compiled, its question strings may be sitting in the cache.
"""
import ctypes
import ctypes.wintypes as w
import glob
import os
import re
import sys

root = sys.argv[1]
applet = sys.argv[2]

print("=== code cache files ===")
for p in sorted(glob.glob(os.path.join(applet, "codecache", "**", "*"), recursive=True)):
    if not os.path.isfile(p):
        continue
    name = os.path.basename(p)
    parts = name.split("-")
    decoded = "?"
    if len(parts) >= 3:
        import base64
        try:
            decoded = base64.b64decode(parts[2] + "=" * (-len(parts[2]) % 4)).decode("utf-8", "replace")
        except Exception:
            pass
    print(f"  {decoded:<34} {os.path.getsize(p):>9}")

print("\n=== CJK inside code cache (V8 bytecode constants) ===")
CJK_RUN = re.compile("[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]{6,120}")
hits = set()
for p in glob.glob(os.path.join(applet, "codecache", "**", "*.cachedata"), recursive=True):
    raw = open(p, "rb").read()
    for enc in ("utf-8", "utf-16-le"):
        try:
            txt = raw.decode(enc, "ignore")
        except Exception:
            continue
        for m in CJK_RUN.findall(txt):
            hits.add(m.strip())
out = os.path.join(root, "memdump", "_codecache_cjk.txt")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(sorted(hits)))
print(f"  {len(hits)} distinct CJK runs -> {out}")
for s in sorted(hits)[:25]:
    print("   ", s)

print("\n=== which appid does each WeChatAppEx process host? ===")
k32 = ctypes.WinDLL("kernel32", use_last_error=True)
PROCESS_QUERY_INFORMATION, PROCESS_VM_READ = 0x0400, 0x0010
MEM_COMMIT, PAGE_READABLE = 0x1000, {0x02, 0x04, 0x20, 0x40}
PAGE_GUARD, MAX_REGION, MIN_REGION = 0x100, 32 * 1024 * 1024, 4096
APPID = re.compile(rb"wx[0-9a-f]{16}")


class MBI(ctypes.Structure):
    _fields_ = [("BaseAddress", ctypes.c_void_p), ("AllocationBase", ctypes.c_void_p),
                ("AllocationProtect", w.DWORD), ("RegionSize", ctypes.c_size_t),
                ("State", w.DWORD), ("Protect", w.DWORD), ("Type", w.DWORD)]


k32.VirtualQueryEx.restype = ctypes.c_size_t
k32.VirtualQueryEx.argtypes = [w.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t]
k32.ReadProcessMemory.argtypes = [w.HANDLE, ctypes.c_void_p, ctypes.c_void_p,
                                  ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t)]


def scan_appids(pid):
    h = k32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, pid)
    if not h:
        return None
    found = {}
    addr, mbi = 0, MBI()
    while addr < 0x7FFFFFFF0000:
        if k32.VirtualQueryEx(h, ctypes.c_void_p(addr), ctypes.byref(mbi), ctypes.sizeof(mbi)) == 0:
            addr += 0x1000
            continue
        base, size, prot = mbi.BaseAddress or 0, mbi.RegionSize, mbi.Protect
        if (mbi.State == MEM_COMMIT and (prot & 0xFF) in PAGE_READABLE
                and not (prot & PAGE_GUARD) and MIN_REGION <= size <= MAX_REGION):
            buf = ctypes.create_string_buffer(size)
            got = ctypes.c_size_t(0)
            if k32.ReadProcessMemory(h, ctypes.c_void_p(base), buf, size, ctypes.byref(got)):
                for m in APPID.findall(buf.raw[:got.value]):
                    found[m.decode()] = found.get(m.decode(), 0) + 1
        addr = base + size
    return found


for pid in sys.argv[3:]:
    res = scan_appids(int(pid))
    if res is None:
        print(f"  {pid}: open failed")
        continue
    top = sorted(res.items(), key=lambda kv: -kv[1])[:5]
    print(f"  {pid}: " + (", ".join(f"{k}({v})" for k, v in top) if top else "no appid found"))
