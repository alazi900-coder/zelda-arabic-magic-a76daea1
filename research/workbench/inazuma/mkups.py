"""UPS patch: the format every DS patcher reads, and unlike IPS its offsets
are variable-length so a 256 MB cartridge is addressable."""
import sys, zlib

def vli(n):
    out = bytearray()
    while True:
        b = n & 0x7f
        n >>= 7
        if n == 0:
            out.append(b | 0x80); break
        out.append(b); n -= 1
    return bytes(out)

src = open(sys.argv[1], "rb").read()
dst = open(sys.argv[2], "rb").read()
out = bytearray(b"UPS1")
out += vli(len(src)) + vli(len(dst))

n = max(len(src), len(dst))
prev = 0
i = 0
while i < n:
    a = src[i] if i < len(src) else 0
    b = dst[i] if i < len(dst) else 0
    if a == b:
        i += 1; continue
    out += vli(i - prev)
    chunk = bytearray()
    while i < n:
        a = src[i] if i < len(src) else 0
        b = dst[i] if i < len(dst) else 0
        if a == b: break
        chunk.append(a ^ b); i += 1
    out += bytes(chunk) + b"\x00"
    prev = i + 1
    i += 1

# The tuple form evaluated bytes(out) before the first two CRCs were appended,
# so the patch CRC covered the wrong bytes. Each one is appended in turn.
out += zlib.crc32(src).to_bytes(4, "little")
out += zlib.crc32(dst).to_bytes(4, "little")
out += zlib.crc32(bytes(out)).to_bytes(4, "little")
open(sys.argv[3], "wb").write(bytes(out))
print("patch bytes:", len(out))
