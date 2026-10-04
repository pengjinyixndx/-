"""Find how the game's strings are encoded in the host process memory.

Probes several known in-app strings under UTF-8 / UTF-16LE / GBK so we know which
codec to harvest with, then reports where the decrypted bundle lives.
"""
import ctypes
import ctypes.wintypes as w
import os
import sys

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
k32.VirtualQueryEx.restype = ctypes.c_size_t
k32.VirtualQueryEx.argtypes = [w.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t]
k32.ReadProcessMemory.argtypes = [w.HANDLE, ctypes.c_void_p, ctypes.c_void_p,
                                  ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t)]
PROCESS_QUERY_INFORMATION, PROCESS_VM_READ = 0x0400, 0x0010
MEM_COMMIT, PAGE_READABLE = 0x1000, {0x02, 0x04, 0x20, 0x40}
PAGE_GUARD, MAX_REGION, MIN_REGION = 0x100, 64 * 1024 * 1024, 4096

# strings whose presence would prove we're reading the decrypted app bundle
PROBES = [
    "真心话大冒险", "角色名称", "大转盘", "红绿灯", "玩法说明",
    "温和", "热辣", "猛烈", "极限", "自定义", "初级", "高级",
    "心跳副本", "大冒险", "真心话",
]


class MBI(ctypes.Structure):
    _fields_ = [("BaseAddress", ctypes.c_void_p), ("AllocationBase", ctypes.c_void_p),
                ("AllocationProtect", w.DWORD), ("RegionSize", ctypes.c_size_t),
                ("State", w.DWORD), ("Protect", w.DWORD), ("Type", w.DWORD)]


def regions(h):
    addr, mbi = 0, MBI()
    while addr < 0x7FFFFFFF0000:
        if k32.VirtualQueryEx(h, ctypes.c_void_p(addr), ctypes.byref(mbi), ctypes.sizeof(mbi)) == 0:
            addr += 0x1000
            continue
        base, size, prot = mbi.BaseAddress or 0, mbi.RegionSize, mbi.Protect
        if (mbi.State == MEM_COMMIT and (prot & 0xFF) in PAGE_READABLE
                and not (prot & PAGE_GUARD) and MIN_REGION <= size <= MAX_REGION):
            yield base, size, prot, mbi.Type
        addr = base + size


def main(pid):
    h = k32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, pid)
    if not h:
        print(f"pid {pid}: open failed")
        return
    patterns = {}
    for s in PROBES:
        for codec in ("utf-8", "utf-16-le", "gbk"):
            try:
                patterns[(s, codec)] = s.encode(codec)
            except Exception:
                pass

    counts = {}
    where = {}
    total = 0
    for base, size, prot, typ in regions(h):
        buf = ctypes.create_string_buffer(size)
        got = ctypes.c_size_t(0)
        if not k32.ReadProcessMemory(h, ctypes.c_void_p(base), buf, size, ctypes.byref(got)):
            continue
        chunk = buf.raw[:got.value]
        total += len(chunk)
        for (s, codec), pat in patterns.items():
            n = chunk.count(pat)
            if n:
                counts[(s, codec)] = counts.get((s, codec), 0) + n
                where.setdefault((s, codec), []).append((base, typ, prot))
    print(f"pid {pid}: scanned {total/1048576:.0f} MB")
    if not counts:
        print("  no probe matched in any encoding")
        return
    for (s, codec), n in sorted(counts.items(), key=lambda kv: -kv[1]):
        locs = where[(s, codec)]
        print(f"  {n:>5}  {codec:<10} {s}   regions={len(locs)} type={'private' if locs[0][1]==0x20000 else 'image'}")
    lines = []
    for (s, codec), n in sorted(counts.items(), key=lambda kv: -kv[1]):
        for base, typ, prot in where[(s, codec)][:6]:
            lines.append(f"{s}\t{codec}\t{base:#x}\ttype={typ:#x}\tprot={prot:#x}")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "memdump", f"probe_{pid}.txt")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  details -> {out}")


if __name__ == "__main__":
    for pid in sys.argv[1:]:
        main(int(pid))
