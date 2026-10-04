"""Dump readable memory of the WeChat mini-program host processes and recover
Chinese text (the running mini program's decrypted JS must be resident).

Results are written as UTF-8 files, never printed to the console, because the
Windows console codepage mangles CJK.
"""
import ctypes
import ctypes.wintypes as w
import re
import sys
import os

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
k32.VirtualQueryEx.restype = ctypes.c_size_t
k32.VirtualQueryEx.argtypes = [w.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t]
k32.ReadProcessMemory.argtypes = [w.HANDLE, ctypes.c_void_p, ctypes.c_void_p,
                                  ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t)]

PROCESS_QUERY_INFORMATION, PROCESS_VM_READ = 0x0400, 0x0010
MEM_COMMIT = 0x1000
PAGE_READABLE = {0x02, 0x04, 0x20, 0x40}
PAGE_GUARD, MEM_PRIVATE = 0x100, 0x20000
MAX_REGION, MIN_REGION = 64 * 1024 * 1024, 4 * 1024


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
        base, size, prot, typ = mbi.BaseAddress or 0, mbi.RegionSize, mbi.Protect, mbi.Type
        if (mbi.State == MEM_COMMIT and (prot & 0xFF) in PAGE_READABLE
                and not (prot & PAGE_GUARD) and MIN_REGION <= size <= MAX_REGION):
            yield base, size, typ
        addr = base + size


def read(h, base, size):
    buf = ctypes.create_string_buffer(size)
    got = ctypes.c_size_t(0)
    if k32.ReadProcessMemory(h, ctypes.c_void_p(base), buf, size, ctypes.byref(got)):
        return buf.raw[:got.value]
    return b""


# CJK + fullwidth punctuation, so the regexes only match real prose
CJK = "\u4e00-\u9fff\u3000-\u303f\uff00-\uffef"
CJK_RUN = re.compile(f"[{CJK}]{{4,120}}")
CJK_CHAR = re.compile(f"[{CJK}]")
NONPRINT = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]")


def clean(s):
    if NONPRINT.search(s):
        return None
    if not (4 <= len(s) <= 120):
        return None
    # reject mis-decoded noise: real prose keeps a decent CJK ratio
    cjk = len(CJK_CHAR.findall(s))
    if cjk / len(s) < 0.55:
        return None
    return s.strip()


def harvest(chunk, as_utf16, bucket):
    """Decode `chunk` as UTF-8 (or UTF-16LE), then pull CJK runs out of the
    decoded text. Doing it in two steps avoids regex-over-bytes encoding pain."""
    try:
        text = chunk.decode("utf-16-le", "ignore") if as_utf16 else chunk.decode("utf-8", "ignore")
    except Exception:
        return
    for m in CJK_RUN.findall(text):
        s = clean(m)
        if s:
            bucket.add(s)


def main(pid, outdir):
    h = k32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, int(pid))
    if not h:
        return f"pid {pid}: OpenProcess failed ({ctypes.get_last_error()})"
    u8, u16, scanned, total = set(), set(), 0, 0
    for base, size, typ in regions(h):
        chunk = read(h, base, size)
        if not chunk:
            continue
        scanned += 1
        total += len(chunk)
        harvest(chunk, False, u8)
        harvest(chunk, True, u16)
    u8.discard(None)
    u16.discard(None)
    os.makedirs(outdir, exist_ok=True)
    p8 = os.path.join(outdir, f"pid{pid}_utf8.txt")
    p16 = os.path.join(outdir, f"pid{pid}_utf16.txt")
    with open(p8, "w", encoding="utf-8") as f:
        f.write("\n".join(sorted(u8)))
    with open(p16, "w", encoding="utf-8") as f:
        f.write("\n".join(sorted(u16)))
    return (f"pid {pid}: {scanned} regions / {total/1048576:.0f} MB -> "
            f"utf8={len(u8)} utf16={len(u16)} distinct CJK runs")


if __name__ == "__main__":
    out = sys.argv[1]
    lines = [main(pid, out) for pid in sys.argv[2:]]
    with open(os.path.join(out, "scan_summary.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
