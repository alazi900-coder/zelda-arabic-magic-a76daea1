"""Arabic presentation forms rasterized from a real TTF, into Platinum's font.

Where the hand-drawn Ruby Destiny pixel art came from an 8-wide GBA cell that
was never designed for this game's letterforms, this reads each of the 129
presentation-form codepoints straight out of a proper Arabic typeface's own
outline and rasterizes it -- one glyph, drawn with real antialiasing, sized to
fit this font's 16x16 cell.

BASIC layout (not the default raqm/HarfBuzz path) is used deliberately: our
own ShapeArabicChar already decided which exact presentation form a letter
takes before the font is ever asked for a glyph, so what is wanted here is the
literal outline stored under that one codepoint -- not a second round of
contextual reshaping that might silently substitute something else.

The font is not committed to the repository (its metadata claims all rights
reserved); only the glyphs this script produces are.
"""
import json, os, re, sys
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "..", "..", "pokeemerald-arabic", "scripts"))
from import_pkm_font import needed_codepoints

PLAT = "/home/user/decomps/pokeplatinum/"
FONTS = ["font_system", "font_message", "font_subscreen"]
CELL = 16
SIZE = 11    # measured: the widest of the 129 forms is exactly 16px at this size

# The four pixel values are roles, not shades. Text_GenerateFontHalfRowLookupTable
# (src/text.c) maps them: 0=transparent, 1=fgColor, 2=shadowColor, 3=bgColor.
# So 3 is not "a light tone" -- it is the window's own background painted solid,
# and an antialiasing ramp spread across 1/2/3 punches opaque holes through the
# letter. This font has no greys: ink or nothing, plus a deliberate shadow.
INK_CUTOFF = 128    # >=50% coverage is ink; the rest is left transparent


def rasterize(ttf_path, codepoints):
    font = ImageFont.truetype(ttf_path, SIZE, layout_engine=ImageFont.Layout.BASIC)
    ascent, _ = font.getmetrics()
    glyphs = {}
    for cp in codepoints:
        ch = chr(cp)
        bbox = font.getbbox(ch)
        w = max(1, bbox[2] - bbox[0]) if bbox else 1
        canvas = Image.new("L", (CELL, CELL), 255)
        d = ImageDraw.Draw(canvas)
        # every glyph drawn against the same ascent line, so letters that sit
        # low (a dot-only tail) and letters that sit tall (a full vertical
        # stroke) still share one baseline when placed side by side.
        d.text((-bbox[0] if bbox else 0, ascent - font.getmetrics()[0] + 0), ch, font=font, fill=0)
        idx = Image.new("P", (CELL, CELL), 0)
        idx.putpalette([144, 200, 255, 56, 56, 56, 216, 216, 216, 255, 255, 255])
        px_in, px_out = canvas.load(), idx.load()
        for y in range(CELL):
            for x in range(CELL):
                px_out[x, y] = 1 if px_in[x, y] < INK_CUTOFF else 0
        # a shadow one pixel down and to the right of the ink, the same offset
        # this font's own Latin glyphs use. Walking backwards keeps the shadow
        # from seeding more shadow, and the cell edge simply clips it -- the
        # only four forms that reach column 15 lose a shadow column, nothing more.
        for y in range(CELL - 1, 0, -1):
            for x in range(CELL - 1, 0, -1):
                if px_out[x, y] == 0 and px_out[x - 1, y - 1] == 1:
                    px_out[x, y] = 2
        glyphs[cp] = (idx, w)
    return glyphs


def charmap():
    path = PLAT + "tools/msgenc/charmap.txt"
    chars = {}
    for line in open(path, encoding="utf-8"):
        t = line.split("//")[0].strip()
        m = re.match(r"^([0-9A-Fa-f]{4})=(.)$", t)
        if m:
            chars[ord(m.group(2))] = int(m.group(1), 16)
    return chars


def main(ttf_path):
    wanted = needed_codepoints()
    code_of = charmap()
    missing = [cp for cp in wanted if cp not in code_of]
    if missing:
        raise SystemExit(f"رموز غير مخصَّصة في charmap.txt: {[hex(c) for c in missing]}")

    glyphs = rasterize(ttf_path, wanted)

    for name in FONTS:
        png_path = f"{PLAT}res/fonts/{name}.png"
        json_path = f"{PLAT}res/fonts/{name}.json"
        sheet = Image.open(png_path).convert("P")
        meta = json.load(open(json_path, encoding="utf-8"))
        for cp in wanted:
            # FontManager_TryLoadGlyph does `c--` before fetching, and every
            # width lookup passes `*str - 1`: the tile index is the character
            # code minus one, not the code itself. Writing at `code` puts each
            # form one cell too far, so the game draws the previous letter's
            # bitmap for every letter. (A slot is safe here for the same reason
            # the free-code scan already found it: tile c-1 is unused exactly
            # when code c is.)
            slot = code_of[cp] - 1
            tile, w = glyphs[cp]
            col, row = slot % 16, slot // 16
            sheet.paste(tile, (col * CELL, row * CELL))
            meta["glyphWidths"][slot] = w
        sheet.save(png_path)
        json.dump(meta, open(json_path, "w", encoding="utf-8"), indent=1)
    print(f"كُتب {len(wanted)} رسمة في {len(FONTS)} خطوط، بحجم {SIZE}px")


if __name__ == "__main__":
    main(sys.argv[1])
