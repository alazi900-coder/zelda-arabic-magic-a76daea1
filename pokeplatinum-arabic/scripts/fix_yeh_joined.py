"""Draw ي's initial and medial forms, which no earlier pass ever supplied.

The friend's sheet gives yeh only its isolated and final forms (its own
`import_friend_font.py` says so), and what sat in the two joined slots before
that was one of Mother 3's own symbols -- the same class of leftover that
`m3-extra-forms.ts` was written to clear out for ص ض ط ظ ع. Read off the sheet
they are ink in rows 5-10, while every real letter here sits in rows 9-14: a
small scattered cross, which is what «بوكيمون» drew in place of its yeh.

ب and ي share one skeleton when joined -- the tooth -- and differ only in the
dots, so the tooth is taken from ب (0xFE91/0xFE92, both drawn by the friend and
correct) and ب's single dot is replaced by ي's pair. At this size that pair is
not two dots but a three-pixel bar, measured from the friend's own final yeh
(0xFEF2 row 13), so the result stays in his hand rather than inventing a shape.

The bar is centred on the column ب puts its dot in, and its shadow follows the
font's rule elsewhere: one pixel down and right of the ink.

Written to all three fonts. `font_message` alone was filled once before and the
title screen came up `Ý×JfaSQ` -- the three share one glyph numbering, so a
letter drawn in one has to be drawn in all.
"""
import json
import re
import sys

from PIL import Image

PLAT = "/home/user/decomps/pokeplatinum/"
FONTS = ["font_system", "font_message", "font_subscreen"]
CELL = 16

INK, SHADOW = 1, 2

BEH_INITIAL, BEH_MEDIAL = 0xFE91, 0xFE92
YEH_INITIAL, YEH_MEDIAL = 0xFEF3, 0xFEF4

# Rows holding ب's dot, which ي replaces; everything above is the shared tooth.
DOT_ROW, DOT_SHADOW_ROW = 13, 14
# ي's dots are one bar this wide at this size, measured from the friend's
# final yeh (0xFEF2 row 13: three pixels).
BAR = 3


def charmap():
    chars = {}
    for line in open(PLAT + "tools/msgenc/charmap.txt", encoding="utf-8"):
        t = line.split("//")[0].strip()
        m = re.match(r"^([0-9A-Fa-f]{4})=(.)$", t)
        if m:
            chars[ord(m.group(2))] = int(m.group(1), 16)
    return chars


def slot_of(code_of, cp):
    # FontManager_TryLoadGlyph does `c--` before fetching: tile index is code-1.
    return code_of[cp] - 1


def read_tile(sheet, slot):
    col, row = slot % 16, slot // 16
    return sheet.crop((col * CELL, row * CELL, col * CELL + CELL, row * CELL + CELL))


def dot_column(tile):
    """The column ب centres its dot in."""
    px = tile.load()
    cols = [x for x in range(CELL) if px[x, DOT_ROW] == INK]
    if not cols:
        raise SystemExit("لم يُعثر على نقطة الباء في الصف المتوقَّع")
    return sum(cols) // len(cols)


def yeh_from_beh(beh_tile):
    """ب's tooth, with its one dot swapped for ي's bar of two."""
    out = beh_tile.copy()
    px = out.load()
    centre = dot_column(beh_tile)

    for x in range(CELL):
        px[x, DOT_ROW] = 0
        px[x, DOT_SHADOW_ROW] = 0

    start = centre - BAR // 2
    for i in range(BAR):
        x = start + i
        if 0 <= x < CELL:
            px[x, DOT_ROW] = INK
        if 0 <= x + 1 < CELL:
            px[x + 1, DOT_SHADOW_ROW] = SHADOW
    return out


def ink_width(tile):
    px = tile.load()
    w = 0
    for y in range(CELL):
        for x in range(CELL):
            if px[x, y] != 0:
                w = max(w, x + 1)
    return w


def main():
    code_of = charmap()
    for cp in (BEH_INITIAL, BEH_MEDIAL, YEH_INITIAL, YEH_MEDIAL):
        if cp not in code_of:
            raise SystemExit(f"رمز غير مخصَّص في charmap.txt: {hex(cp)}")

    for name in FONTS:
        png = f"{PLAT}res/fonts/{name}.png"
        meta_path = f"{PLAT}res/fonts/{name}.json"
        sheet = Image.open(png).convert("P")
        meta = json.load(open(meta_path, encoding="utf-8"))

        for beh_cp, yeh_cp in ((BEH_INITIAL, YEH_INITIAL), (BEH_MEDIAL, YEH_MEDIAL)):
            beh_tile = read_tile(sheet, slot_of(code_of, beh_cp))
            tile = yeh_from_beh(beh_tile)
            slot = slot_of(code_of, yeh_cp)
            col, row = slot % 16, slot // 16
            sheet.paste(tile, (col * CELL, row * CELL))
            meta["glyphWidths"][slot] = ink_width(tile)

        sheet.save(png)
        json.dump(meta, open(meta_path, "w", encoding="utf-8"), indent=1)

    print(f"كُتبت ياء البداية والوسط في {len(FONTS)} خطوط")


if __name__ == "__main__":
    sys.exit(main())
