# Builds the Golden Sun Arabic main font and the byte for each presentation form.
import re, struct, json, sys
sys.path.insert(0, '/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/onebyte')
from nftr import info, glyph_of
ts = open('/home/user/zelda-arabic-magic-a76daea1/src/lib/inazuma/inazuma-arabic-glyphs.ts').read()
cps = [int(x, 16) for x in re.search(r'INAZUMA_ARABIC_CODEPOINTS: number\[\] = \[([^\]]*)\]', ts).group(1).split(', ')]
sj = [int(x, 16) for x in re.search(r'INAZUMA_SHIFT_JIS_CODES: number\[\] = \[([^\]]*)\]', ts).group(1).split(', ')]
d, pl, cw, ch, tb, bpp, hd, cm = info('/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/userfont/FONT12_user.NFTR')
first = struct.unpack_from('<H', d, hd + 8)[0]
# rare forms go to the 13 overflow codes; everything else to 0x90-0xFF
RARE = [0xFEF5, 0xFEF6, 0xFEF7, 0xFEF8, 0xFEF9, 0xFEFA, 0xFE81, 0xFE82, 0xFE85, 0xFE86, 0xFEC5, 0xFEC6, 0xFE99, 0xFE9A, 0xFE89]
OVERFLOW = [0x8C, 0x8D, 0x3C, 0x3E, 0x40, 0x5B, 0x5C, 0x5D, 0x5E, 0x60, 0x7B, 0x7C, 0x7D, 0x7E, 0x7F]
# 0xDE and 0xDF are the Japanese voicing marks: AdvanceMsgText folds them into the letter before
HIGH = [c for c in range(0x90, 0x100) if c not in (0xDE, 0xDF)]
common = [cp for cp in cps if cp not in RARE]
assert len(common) == len(HIGH) == 110
code = dict(zip(common, HIGH))
code.update(zip(RARE, OVERFLOW))
rom = bytearray(open('/home/user/coaltergeist/goldensun-decomp/baserom.gba', 'rb').read())
font = bytearray(rom[0x32224:0x33e40])
ROW0 = 3  # glyph row 0 -> GS row 3: baseline (glyph row 6) on GS row 9, descenders to row 14
for cp, c in code.items():
    i = cps.index(cp)
    g = glyph_of(d, cm, sj[i]); bits = d[pl + 16 + g * tb:pl + 16 + (g + 1) * tb]
    lb, gw, adv = d[hd + 16 + (g - first) * 3:hd + 16 + (g - first) * 3 + 3]
    cell = bytearray(32)
    struct.pack_into('<H', cell, 0, adv)
    for y in range(ch):
        row = 0
        for x in range(cw):
            if (bits[(y * cw + x) // 8] >> (7 - (y * cw + x) % 8)) & 1: row |= 0x8000 >> x
        struct.pack_into('<H', cell, 2 + (ROW0 + y) * 2, row)
    at = (c - 0x20) * 32
    n = min(32, len(font) - at)
    font[at:at + n] = cell[:n]
open(sys.argv[1], 'wb').write(font)
json.dump({str(k): v for k, v in code.items()}, open(sys.argv[2], 'w'))
print('font', len(font), 'codes', len(code))
