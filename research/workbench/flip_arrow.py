"""Point the menu cursor at the text instead of away from it.

The whole game draws right to left, so the selector arrow now sits to the
right of the line it marks and its "▶" shape points off into empty space.
The character (charmap byte EF) is used for nothing else in the game -- only
the three selector strings and one dead one -- so mirroring its glyph flips
every cursor in every menu at once, with no code change and no side effect.
"""
import re
from PIL import Image

SRC = "/home/user/decomps/pokeemerald/"
FONTS = ["latin_normal", "latin_narrow", "latin_short", "latin_small", "latin_small_narrow"]
CELL = 16

code = None
for line in open(SRC + "charmap.txt", encoding="utf-8"):
    m = re.match(r"^'▶'\s*=\s*([0-9A-F]{2})\s*$", line.split("@")[0].strip())
    if m:
        code = int(m.group(1), 16)
assert code is not None, "no charmap entry for the selector arrow"
print(f"selector arrow is byte {code:#04x}")

for name in FONTS:
    path = f"{SRC}graphics/fonts/{name}.png"
    im = Image.open(path)
    box = (code % 16 * CELL, code // 16 * CELL, code % 16 * CELL + CELL, code // 16 * CELL + CELL)
    cell = im.crop(box)

    # Mirror only the drawn part: the glyph is left-aligned in its cell and the
    # engine copies the leftmost `width` pixels, so flipping the whole 16px cell
    # would push the arrow off the right edge of what actually gets drawn.
    text = open(SRC + "src/fonts.c", encoding="utf-8").read()
    table = {"latin_normal": "gFontNormalLatinGlyphWidths",
             "latin_narrow": "gFontNarrowLatinGlyphWidths",
             "latin_short": "gFontShortLatinGlyphWidths",
             "latin_small": "gFontSmallLatinGlyphWidths",
             "latin_small_narrow": "gFontSmallNarrowLatinGlyphWidths"}[name]
    vals = [int(n) for n in re.findall(r"-?\d+",
            re.search(rf"{table}\[\] = \{{(.*?)\}};", text, re.S).group(1))]
    w = vals[code]
    drawn = cell.crop((0, 0, w, CELL)).transpose(Image.FLIP_LEFT_RIGHT)
    cell.paste(drawn, (0, 0))
    im.paste(cell, box)
    im.save(path)
    print(f"  {name}: flipped the leftmost {w}px of the cell")
