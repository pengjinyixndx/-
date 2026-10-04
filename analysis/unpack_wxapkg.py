"""Decode + unpack WeChat mini program .wxapkg files.

Format (standard, V1MM header => every byte XOR 0x66):
  u8  0xBE magic
  u32 BE total payload length
  u32 BE file count
  then per file:
    u32 BE name length
    bytes name (may contain '/' -> dirs)
    u32 BE data offset
    u32 BE data length
"""
import os
import sys

HEADER_KEY = 0x66


def decode(raw: bytes) -> bytes:
    """The 4-byte 'V1MM' tag is XOR 0x66; the body uses a per-file key.

    Recover the body key from the known magic byte 0xBE at payload offset 0.
    """
    if raw[:4] == b"V1MM":
        body = raw[4:]
        key = body[0] ^ 0xBE
        return bytes(b ^ key for b in body)
    return raw


def unpack(path: str, outdir: str) -> int:
    data = decode(open(path, "rb").read())
    if data[0] != 0xBE:
        raise ValueError(f"{path}: bad magic {data[0]:#x}")
    total = int.from_bytes(data[1:5], "big")
    count = int.from_bytes(data[5:9], "big")
    pos = 9
    written = 0
    for _ in range(count):
        nlen = int.from_bytes(data[pos:pos + 4], "big")
        pos += 4
        name = data[pos:pos + nlen].decode("utf-8", "replace")
        pos += nlen
        off = int.from_bytes(data[pos:pos + 4], "big")
        pos += 4
        size = int.from_bytes(data[pos:pos + 4], "big")
        pos += 4
        target = os.path.join(outdir, name.lstrip("/").replace("\\", "/"))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as fh:
            fh.write(data[off:off + size])
        written += 1
    print(f"{os.path.basename(path)}: magic OK, declared_total={total}, "
          f"declared_files={count}, extracted={written}")
    return written


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    unpack(src, dst)
