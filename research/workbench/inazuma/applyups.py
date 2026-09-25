import sys, zlib
src = open(sys.argv[1],"rb").read()
p   = open(sys.argv[2],"rb").read()
assert p[:4] == b"UPS1", "not a UPS patch"
body, tail = p[:-12], p[-12:]
cs, cd, cp = (int.from_bytes(tail[i:i+4],"little") for i in (0,4,8))
assert zlib.crc32(src) == cs, "source CRC mismatch: wrong ROM"
assert zlib.crc32(p[:-4]) == cp, "patch is corrupt"

i = 4
def vli():
    global i
    n = 0; shift = 1
    while True:
        b = p[i]; i += 1
        n += (b & 0x7f) * shift
        if b & 0x80: break
        shift <<= 7
        n += shift
    return n

slen, dlen = vli(), vli()
assert slen == len(src), "source size mismatch"
out = bytearray(dst_init := src[:dlen].ljust(dlen, b"\x00"))
pos = 0
while i < len(body):
    pos += vli()
    while True:
        x = p[i]; i += 1
        if x == 0: break
        out[pos] ^= x; pos += 1
    pos += 1
res = bytes(out)
assert zlib.crc32(res) == cd, "target CRC mismatch"
open(sys.argv[3],"wb").write(res)
print("applied OK, %d bytes, target CRC 0x%08X" % (len(res), cd))
