"""Replace Platinum's TTF-rasterized Arabic glyphs with Mother 3's hand-drawn
ones, for every presentation form Mother 3's own table happens to cover.

render_ttf_glyphs.py already wrote all 129 forms from a general-purpose TTF;
this runs afterward and overwrites the 122 of them Mother 3's font has, using
its own per-glyph pixel widths instead of a raw ink-bbox measurement. The 7
forms Mother 3 never needed (the rarest ain/ghain shapes, the isolated hamza
and madda-alef, and the semicolon) are left exactly as render_ttf_glyphs.py
drew them -- nothing here touches those slots.

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


def to_glyph(font_data, code):
    """16x16, 1bpp, 2 bytes/row, MSB-first -> Platinum's 4-color indexed cell,
    ink at 1, transparent at 0, then a shadow synthesized one pixel down-right
    of ink -- the same offset and generation order render_ttf_glyphs.py uses,
    so a mixed line of TTF and Mother-3 glyphs still shares one shadow style."""
    from PIL import Image
    off = code * 32
    raw = font_data[off:off + 32]
    idx = Image.new("P", (CELL, CELL), 0)
    idx.putpalette([144, 200, 255, 56, 56, 56, 216, 216, 216, 255, 255, 255])
    px = idx.load()
    for row in range(16):
        word = raw[row * 2] | (raw[row * 2 + 1] << 8)
        for x in range(16):
            px[x, row] = 1 if (word >> (15 - x)) & 1 else 0
    for y in range(CELL - 1, 0, -1):
        for x in range(CELL - 1, 0, -1):
            if px[x, y] == 0 and px[x - 1, y - 1] == 1:
                px[x, y] = 2
    return idx


def main():
    from PIL import Image

    wanted = needed_codepoints()
    code_of_plat = charmap()
    char_to_m3 = load_m3_char_to_code()
    font_data, width_data = load_m3_font()

    covered = [cp for cp in wanted if cp in char_to_m3]
    skipped = [cp for cp in wanted if cp not in char_to_m3]
    print(f"{len(covered)} رمزاً مغطّى بخط Mother 3، {len(skipped)} يبقى بخط TTF: "
          f"{[hex(c) for c in skipped]}")

    for name in FONTS:
        png_path = f"{PLAT}res/fonts/{name}.png"
        json_path = f"{PLAT}res/fonts/{name}.json"
        sheet = Image.open(png_path).convert("P")
        meta = json.load(open(json_path, encoding="utf-8"))
        for cp in covered:
            m3_code = char_to_m3[cp]
            slot = code_of_plat[cp] - 1  # see render_ttf_glyphs.py's comment on the same -1
            tile = to_glyph(font_data, m3_code)
            w = width_data[m3_code]
            col, row = slot % 16, slot // 16
            sheet.paste(tile, (col * CELL, row * CELL))
            meta["glyphWidths"][slot] = w
        sheet.save(png_path)
        json.dump(meta, open(json_path, "w", encoding="utf-8"), indent=1)
    print(f"استُبدلت {len(covered)} رسمة في {len(FONTS)} خطوط بخط Mother 3")


if __name__ == "__main__":
    main()
