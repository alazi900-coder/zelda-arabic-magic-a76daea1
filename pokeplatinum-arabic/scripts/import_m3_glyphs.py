"""Replace Platinum's TTF-rasterized Arabic glyphs with Mother 3's hand-drawn
ones, for every presentation form Mother 3's own table happens to cover.

render_ttf_glyphs.py already wrote all 129 forms from a general-purpose TTF;
this runs afterward and overwrites them with Mother 3's own hand-drawn art.

Mother 3's own table (`ARABIC_CHAR_TO_CODE`) is not trustworthy at face value
for every entry, though: eleven presentation forms in it point at codes 0xA0
and above, which is where that font's own symbols live -- arrows, Greek
letters, PK -- not Arabic. Taken literally these draw as a small circle or a
diagonal line, which is exactly the bug this file used to reproduce (عين
الوسطى among them: "معلومات" split at the ع). A further seven forms have no
entry in the table at all. Both groups were already found and hand-drawn once
for Wolfenstein RPG's build of this same font (`wolf-m3-glyphs.ts` /
`m3-extra-forms.ts`) -- DRAWN_FORMS below is that same art, ported to Python,
reused here rather than re-derived.

Mother 3's font is 1bpp (ink or not, no antialiasing to threshold), so this
skips straight to placing ink and synthesizing the same down-right shadow
render_ttf_glyphs.py adds, rather than repeating its supersampling step.
"""
import base64
import json
import re

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_ttf_glyphs import charmap, FONTS, CELL, PLAT

WEBSITE = "/home/user/zelda-arabic-magic-a76daea1/"

DRAWN_CELL_WIDTH = 8


def _parse_drawn(art):
    """Same shape as m3-extra-forms.ts's `parse`: '#'/'.' rows, 8 columns
    wide, padded with blank rows up to Mother 3's 16-row cell."""
    rows = [[False] * DRAWN_CELL_WIDTH for _ in range(16)]
    for y, line in enumerate(art.strip("\n").split("\n")):
        if y >= 16:
            break
        for x in range(min(DRAWN_CELL_WIDTH, len(line))):
            rows[y][x] = line[x] == "#"
    return rows


def _with_dot(rows):
    """ض is ص with the dot over the loop -- m3-extra-forms.ts's `withDot`."""
    out = [row[:] for row in rows]
    out[2][6] = True
    return out


def _drawn_width(rows):
    width = 1
    for row in rows:
        for x, ink in enumerate(row):
            if ink:
                width = max(width, x + 1)
    return width


_SAD_INI = _parse_drawn("""
........
........
........
........
......#.
.....#.#
....#..#
#######.
""")
_SAD_MED = _parse_drawn("""
........
........
........
........
......#.
.....#.#
....#..#
########
""")
_SAD_FIN = _parse_drawn("""
........
........
........
........
......#.
.....#.#
....#..#
.#.#####
#..#....
#..#....
.##.....
""")
_TAH_FIN = _parse_drawn("""
........
.#......
.#......
.#......
.#.##...
.##..#..
.#...#..
#####.#.
""")
_TAH_ISO = _parse_drawn("""
........
.#......
.#......
.#......
.#.##...
.##..#..
.#...#..
#####...
""")
_ZAH_ISO = _parse_drawn("""
........
.#......
.#.#....
.#......
.#.##...
.##..#..
.#...#..
#####...
""")
_ZAH_MED = _parse_drawn("""
........
.#......
.#.#....
.#......
.#.##...
.##..#..
.#...#..
#####.#.
""")
_AIN_ISO = _parse_drawn("""
........
........
........
........
#####...
.#.#....
..#.....
.###....
#.......
#.......
.###....
""")
_AIN_MED = _parse_drawn("""
........
........
........
........
..##....
.#..#...
.#......
########
""")
_ALEF_MADDA_ISO = _parse_drawn("""
##......
........
#.......
#.......
#.......
#.......
#.......
.#......
""")
_HAMZA = _parse_drawn("""
........
........
........
..##....
.#..#...
..#.....
.###....
........
""")
_SEMICOLON = _parse_drawn("""
........
........
........
........
..#.....
........
..#.....
..#.....
.#......
""")

# Presentation forms Mother 3's own table cannot supply correctly: pointed at
# the font's non-Arabic symbol codes, or missing entirely. Values are
# (rows, width) exactly like m3-extra-forms.ts's M3_DRAWN_FORMS -- ص isolated
# comes from the shipped font, and ض isolated is built from it in main(), so
# neither is listed here.
DRAWN_FORMS = {
    0xFEBA: (_SAD_FIN, _drawn_width(_SAD_FIN)),
    0xFEBB: (_SAD_INI, _drawn_width(_SAD_INI)),
    0xFEBC: (_SAD_MED, _drawn_width(_SAD_MED)),
    0xFEBE: (_with_dot(_SAD_FIN), _drawn_width(_SAD_FIN)),
    0xFEBF: (_with_dot(_SAD_INI), _drawn_width(_SAD_INI)),
    0xFEC0: (_with_dot(_SAD_MED), _drawn_width(_SAD_MED)),
    0xFEC1: (_TAH_ISO, _drawn_width(_TAH_ISO)),
    0xFEC2: (_TAH_FIN, _drawn_width(_TAH_FIN)),
    0xFEC3: (_TAH_ISO, _drawn_width(_TAH_ISO)),  # طـ -- its base already reaches the left edge
    0xFEC4: (_TAH_FIN, _drawn_width(_TAH_FIN)),  # ـطـ
    0xFEC5: (_ZAH_ISO, _drawn_width(_ZAH_ISO)),
    0xFEC7: (_ZAH_ISO, _drawn_width(_ZAH_ISO)),  # ظـ
    0xFEC8: (_ZAH_MED, _drawn_width(_ZAH_MED)),  # ـظـ
    0xFEC9: (_AIN_ISO, _drawn_width(_AIN_ISO)),
    0xFECC: (_AIN_MED, _drawn_width(_AIN_MED)),  # ـعـ
    0xFE81: (_ALEF_MADDA_ISO, _drawn_width(_ALEF_MADDA_ISO)),
    0x0621: (_HAMZA, _drawn_width(_HAMZA)),
    0x061B: (_SEMICOLON, _drawn_width(_SEMICOLON)),
}


def needed_codepoints():
    out = [0x060C, 0x061B, 0x061F, 0x0621] + list(range(0xFE80, 0xFEFD))
    return sorted(out)


def load_m3_char_to_code():
    ts = open(WEBSITE + "src/lib/mother3/m3-arabic-table.ts", encoding="utf-8").read()
    m = re.search(r"ARABIC_CHAR_TO_CODE:\s*Record<string,\s*number>\s*=\s*\{(.*?)\n\};", ts, re.S)
    body = m.group(1)
    entries = re.findall(r'"((?:\\u[0-9a-fA-F]{4}|\\.|[^"\\]))"\s*:\s*(0x[0-9A-Fa-f]+)', body)
    cps = {}
    for k, v in entries:
        if k.startswith("\\u"):
            cp = int(k[2:], 16)
        elif k.startswith("\\"):
            cp = ord(k[1])
        else:
            cp = ord(k)
        cps[cp] = int(v, 16)
    return cps


def load_m3_font():
    ts = open(WEBSITE + "src/lib/mother3/m3-arabic-font.ts", encoding="utf-8").read()
    fb64 = re.search(r'M3_ARABIC_FONT_B64 = "([^"]+)"', ts).group(1)
    wb64 = re.search(r'M3_ARABIC_WIDTHS_B64 = "([^"]+)"', ts).group(1)
    return base64.b64decode(fb64), base64.b64decode(wb64)


def _new_tile():
    from PIL import Image
    idx = Image.new("P", (CELL, CELL), 0)
    idx.putpalette([144, 200, 255, 56, 56, 56, 216, 216, 216, 255, 255, 255])
    return idx


def _add_shadow(px):
    """Shadow one pixel down-right of ink -- the same offset and generation
    order render_ttf_glyphs.py uses, so a mixed line of TTF and Mother 3
    glyphs (drawn or raw) still shares one shadow style."""
    for y in range(CELL - 1, 0, -1):
        for x in range(CELL - 1, 0, -1):
            if px[x, y] == 0 and px[x - 1, y - 1] == 1:
                px[x, y] = 2


def to_glyph(font_data, code):
    """16x16, 1bpp, 2 bytes/row, MSB-first -> Platinum's 4-color indexed cell,
    ink at 1, transparent at 0, then a synthesized shadow."""
    off = code * 32
    raw = font_data[off:off + 32]
    idx = _new_tile()
    px = idx.load()
    for row in range(16):
        word = raw[row * 2] | (raw[row * 2 + 1] << 8)
        for x in range(16):
            # Mother 3's rows are 8px wide and land in the low byte of this
            # 16-bit word; the high byte this format reserves for a wider
            # cell is unused. Read shifted so the ink starts at column 0 --
            # where Window_CopyGlyph, given only this glyph's own narrow
            # declared width rather than the full 16px cell, actually looks
            # for it. Unshifted, every Mother 3 letter landed at column 8+,
            # entirely past its own declared width, and drew nothing.
            bit = x + 8
            px[x, row] = 1 if bit <= 15 and (word >> (15 - bit)) & 1 else 0
    _add_shadow(px)
    return idx


def to_glyph_from_rows(rows):
    """Same output as to_glyph(), from an already-unpacked boolean grid (the
    hand-drawn DRAWN_FORMS art) instead of Mother 3's raw font bytes. The art
    is already seated at column 0, the same place to_glyph()'s shift lands
    the raw glyphs, so both kinds sit identically inside the cell."""
    idx = _new_tile()
    px = idx.load()
    for y, row in enumerate(rows):
        for x, ink in enumerate(row):
            px[x, y] = 1 if ink else 0
    _add_shadow(px)
    return idx


def _dad_isolated_form(char_to_m3, font_data):
    """ض isolated is ص isolated -- a genuine Mother 3 glyph, not a symbol-range
    mistake -- with the dot over the loop, the same construction
    wolf-m3-glyphs.ts uses at load time."""
    sad_code = char_to_m3[0xFEB9]
    tile = to_glyph(font_data, sad_code)
    px = tile.load()
    px[6, 2] = 1
    _add_shadow(px)
    return tile


def main():
    from PIL import Image

    wanted = needed_codepoints()
    code_of_plat = charmap()
    char_to_m3 = load_m3_char_to_code()
    font_data, width_data = load_m3_font()

    drawn = [cp for cp in wanted if cp in DRAWN_FORMS]
    raw_m3 = [cp for cp in wanted if cp not in DRAWN_FORMS and cp in char_to_m3
              and char_to_m3[cp] < 0xA0]
    dad_built = [cp for cp in wanted if cp == 0xFEBD]
    handled = set(drawn) | set(raw_m3) | set(dad_built)
    skipped = [cp for cp in wanted if cp not in handled]
    print(f"{len(raw_m3)} رمزاً من رسمات Mother 3 الأصلية، {len(drawn)} رمزاً "
          f"مصحَّحاً يدوياً (كانت تشير لرموز اللعبة غير العربية أو بلا رسمة "
          f"أصلاً)، {len(dad_built)} مبنيّ من حرف آخر، {len(skipped)} يبقى "
          f"بخط TTF: {[hex(c) for c in skipped]}")

    for name in FONTS:
        png_path = f"{PLAT}res/fonts/{name}.png"
        json_path = f"{PLAT}res/fonts/{name}.json"
        sheet = Image.open(png_path).convert("P")
        meta = json.load(open(json_path, encoding="utf-8"))

        for cp in raw_m3:
            m3_code = char_to_m3[cp]
            slot = code_of_plat[cp] - 1  # see render_ttf_glyphs.py's comment on the same -1
            tile = to_glyph(font_data, m3_code)
            col, row = slot % 16, slot // 16
            sheet.paste(tile, (col * CELL, row * CELL))
            meta["glyphWidths"][slot] = width_data[m3_code]

        for cp in drawn:
            rows, width = DRAWN_FORMS[cp]
            slot = code_of_plat[cp] - 1
            tile = to_glyph_from_rows(rows)
            col, row = slot % 16, slot // 16
            sheet.paste(tile, (col * CELL, row * CELL))
            meta["glyphWidths"][slot] = width

        for cp in dad_built:
            slot = code_of_plat[cp] - 1
            tile = _dad_isolated_form(char_to_m3, font_data)
            col, row = slot % 16, slot // 16
            sheet.paste(tile, (col * CELL, row * CELL))
            meta["glyphWidths"][slot] = width_data[char_to_m3[0xFEB9]]

        sheet.save(png_path)
        json.dump(meta, open(json_path, "w", encoding="utf-8"), indent=1)
    print(f"استُبدلت {len(handled)} رسمة في {len(FONTS)} خطوط بخط Mother 3")


if __name__ == "__main__":
    main()
