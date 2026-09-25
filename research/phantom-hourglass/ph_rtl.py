"""Right-to-left text flow for The Legend of Zelda: Phantom Hourglass (USA).

Apply to `extract/usa/arm9/arm9.bin` of a zeldaret/ph checkout, then rebuild.
Delete `build/usa/build/arm9.bin` and `build/usa/delinks/` first — dsd delinks
from that copy, and a stale one silently swallows the change.

Found with a purpose-built headless tracer (gtrace, built on the melonDS core):
a read watch on the font's width table named the renderer, an execution watch
proved which line-reset paths actually run, and a write watch on the pen's X
field with values showed where a text box's pen starts.

  func_020334b4 +0x128   the per-character advance: pen += width -> pen -= width
  func_020392b4 +0x78/9C the pen a text box starts on: left margin -> box width
  func_02033780 +0x28/34 the same at every line break, for all alignment modes

The box width lives at renderer+0x4a and is in pixels: the centring helper
subtracts a pixel text width from it, and mode 3 subtracts a literal 206.
"""
import struct, sys

BASE = 0x02000000
PATCHES = [
    (0x020335AC, 0xE0810000, 0xE0410000, "add r0,r1,r0 -> sub r0,r1,r0"),
    (0x020392FC, 0xE1D103F4, 0xE1D504BA, "box start, path 1 -> ldrh r0,[r5,#0x4a]"),
    (0x02039320, 0xE1D103F4, 0xE1D504BA, "box start, path 3 -> ldrh r0,[r5,#0x4a]"),
    (0x02033764, 0xE1D400FC, 0xE1D004BA, "line reset, mode 0 -> ldrh r0,[r0,#0x4a]"),
    (0x02033770, 0xE1D400FC, 0xE1D004BA, "line reset, modes 1/3 -> ldrh r0,[r0,#0x4a]"),
]

def main(path):
    d = bytearray(open(path, "rb").read())
    for addr, expect, value, note in PATCHES:
        off = addr - BASE
        cur = struct.unpack_from("<I", d, off)[0]
        if cur == value:
            print(f"  0x{addr:08X}  already patched")
            continue
        if cur != expect:
            sys.exit(f"0x{addr:08X}: expected {expect:08X}, found {cur:08X}")
        struct.pack_into("<I", d, off, value)
        print(f"  0x{addr:08X}  {cur:08X} -> {value:08X}   {note}")
    open(path, "wb").write(d)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "extract/usa/arm9/arm9.bin")
