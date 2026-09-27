#!/usr/bin/env python3
"""Put the Arabic small (menu) font into a built Golden Sun ROM.

The glyphs are the Mother 3 small font FONT_small_user.bin: 256 cells of
10 bytes (2 unused, then 8 rows of 1bpp, leftmost pixel in the top bit).
Golden Sun's menu font is file 0x13 (ROM 0x320FB0, stored raw): 256 tiles
of 8x8 4bpp, background 4, ink 1, a shadow 3 one pixel down-right, with the
advance widths in Data_370d4 (0x370D4, one byte per code from 0x20).

smallfont_map.json gives, for every Golden Sun code the text encoder writes
an Arabic form to (the same codes as the dialogue font), the presentation
form and the Mother 3 cell that draws it. Five forms Mother 3 has no cell
for (initial/medial ta and za, isolated alef madda) use the nearest form.

usage: gssmallfont.py goldensun.gba out.gba
"""
import json
import os
import sys

FONT_OFF = 0x320FB0
WIDTHS_OFF = 0x370D4
BG, INK, SHADOW = 4, 1, 3

here = os.path.dirname(os.path.abspath(__file__))
cells = open(os.path.join(here, "FONT_small_user.bin"), "rb").read()
codes = json.load(open(os.path.join(here, "smallfont_map.json")))
rom = bytearray(open(sys.argv[1], "rb").read())

for code_hex, (_form, cell) in codes.items():
    code = int(code_hex, 16)
    rows = cells[cell * 10 + 2 : cell * 10 + 10]
    cols = [x for x in range(8) if any(r >> (7 - x) & 1 for r in rows)]
    lo, hi = min(cols), max(cols)
    px = [[BG] * 8 for _ in range(8)]
    for y, r in enumerate(rows):
        for x in range(lo, hi + 1):
            if r >> (7 - x) & 1:
                px[y][x - lo] = INK
    for y in range(6, -1, -1):
        for x in range(6, -1, -1):
            if px[y][x] == INK and px[y + 1][x + 1] == BG:
                px[y + 1][x + 1] = SHADOW
    tile = bytearray(32)
    for y in range(8):
        for x in range(0, 8, 2):
            tile[y * 4 + x // 2] = px[y][x] | (px[y][x + 1] << 4)
    rom[FONT_OFF + code * 32 : FONT_OFF + code * 32 + 32] = tile
    rom[WIDTHS_OFF + code - 0x20] = hi - lo + 1

open(sys.argv[2], "wb").write(rom)
print("small font:", len(codes), "glyphs")
