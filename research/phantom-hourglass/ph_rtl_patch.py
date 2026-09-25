"""Right-to-left text flow for Phantom Hourglass (USA).

Two changes, both in the ARM9:

  1. The per-character pen advance in the string loop.  The loop draws a glyph,
     looks up its advance, and adds it to the pen; subtracting instead makes the
     line run right-to-left.  Verified by screenshot: "Creating a file..."
     becomes "...elif a gnitaerC" marching off the left edge.

  2. The pen reset at line start, which put the pen at the line's left margin.
     All four alignment modes now start it at the box's right edge instead.
     Mode 2 (centred) is folded into the same block: keeping the centring would
     need the `this` pointer, which the call to the centring helper clobbers,
     and right-aligned is the natural reading for a right-to-left line anyway.
"""
import struct, sys

BASE = 0x02000000
P = "extract/usa/arm9/arm9.bin"

def patch(d, addr, expect, value, note):
    off = addr - BASE
    cur = struct.unpack_from("<I", d, off)[0]
    if expect is not None and cur != expect:
        sys.exit(f"0x{addr:08X}: expected {expect:08X}, found {cur:08X}")
    struct.pack_into("<I", d, off, value)
    print(f"  0x{addr:08X}  {cur:08X} -> {value:08X}   {note}")

d = bytearray(open(P, "rb").read())

print("1) اتجاه تقدّم القلم:")
patch(d, 0x020335AC, 0xE0810000, 0xE0410000, "add r0,r1,r0 -> sub  (X -= advance)")

print("2) بداية السطر من الحافّة اليمنى:")
# جدول القفز: كل الحالات الأربع إلى كتلة واحدة عند 0x02033764
patch(d, 0x02033754, 0xEA000002, 0xEA000002, "case 0 -> 0x02033764 (كما هي)")
patch(d, 0x02033758, 0xEA000004, 0xEA000001, "case 1 -> 0x02033764")
patch(d, 0x0203375C, 0xEA000006, 0xEA000000, "case 2 -> 0x02033764 (بدل التوسيط)")
patch(d, 0x02033760, 0xEA000002, 0xEAFFFFFF, "case 3 -> 0x02033764")
# الكتلة الموحّدة: X = عرض الصندوق (بالبكسل، إذ تطرح منه دالةُ التوسيط عرضَ النصّ)
patch(d, 0x02033764, 0xE1D400FC, 0xE1D004BA, "ldrh r0,[r0,#0x4a]  عرض الصندوق")
patch(d, 0x02033768, 0xE1C400B8, 0xE1C400B8, "strh r0,[r4,#0x8]   X = الحافّة اليمنى")
patch(d, 0x0203376C, 0xE8BD8010, 0xE8BD8010, "pop {r4,pc}")

open(P, "wb").write(d)
print("تمّ.")
