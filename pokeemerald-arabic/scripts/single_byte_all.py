"""Give the last 13 Arabic forms a single byte each.

ظ ذ ز ث and ؛ were left on the two-byte F9 escape because the import could not
find 13 more free codes.  It could: the accented Latin letters Nintendo kept
for the European releases -- ª À Ç Ì Ñ Ü à â è ì ï ô ù -- are printed by this
game exactly once between them, in the apprentice name JÜRGEN, which becomes
JURGEN here.  Everything else about them is dead weight in an Arabic build.

Costing those four letters double was not cosmetic: it is why "سرعة متزايدة"
overran a 12-byte field at 12 letters, and it would have forced the editor's
byte tables to carry a multi-byte case for five characters alone.
"""
import re
from PIL import Image

SRC = "/home/user/decomps/pokeemerald/"
FONTS = ["latin_normal", "latin_narrow", "latin_short", "latin_small", "latin_small_narrow"]
WIDTH_TABLES = {
    "latin_small_narrow": "gFontSmallNarrowLatinGlyphWidths",
    "latin_small": "gFontSmallLatinGlyphWidths",
    "latin_narrow": "gFontNarrowLatinGlyphWidths",
    "latin_short": "gFontShortLatinGlyphWidths",
    "latin_normal": "gFontNormalLatinGlyphWidths",
}
CELL = 16
# checked against the whole source tree: zero uses, bar the one Ü
FREED = [0x01, 0x04, 0x09, 0x14, 0x16, 0x1A, 0x1E, 0x21, 0x24, 0x26, 0x2B, 0x68, 0xF3]


def main():
    cm = open(SRC + "charmap.txt", encoding="utf-8").read()
    two = re.findall(r"^'(.)'\s*=\s*(F9)\s+([0-9A-F]{2})\s*$", cm, re.M)
    assert len(two) == len(FREED), (len(two), len(FREED))

    moves = []          # (char, old font cell, new byte)
    for (ch, _, lo), code in zip(two, FREED):
        moves.append((ch, 0x100 + int(lo, 16), code))

    # charmap: the escape line becomes a plain one-byte line
    for ch, _, code in moves:
        cm = re.sub(rf"^'{re.escape(ch)}'\s*=\s*F9\s+[0-9A-F]{{2}}\s*$",
                    f"'{ch}' = {code:02X}", cm, count=1, flags=re.M)
    cm = cm.replace("@ Arabic, rarest forms kept on the two-byte escape",
                    "@ Arabic, on codes freed from the accented Latin the European\n"
                    "@ releases used and this build never prints")
    open(SRC + "charmap.txt", "w", encoding="utf-8").write(cm)
    print(f"charmap: {len(moves)} letters moved off the two-byte escape")

    for name in FONTS:
        path = f"{SRC}graphics/fonts/{name}.png"
        im = Image.open(path)
        blank = Image.new("P", (CELL, CELL), 0)
        blank.putpalette(im.getpalette())
        for _, old, new in moves:
            box = lambda i: (i % 16 * CELL, i // 16 * CELL, i % 16 * CELL + CELL, i // 16 * CELL + CELL)
            im.paste(im.crop(box(old)), box(new))
            im.paste(blank, box(old))
        im.save(path)
    print(f"glyphs moved in {len(FONTS)} font sheets")

    text = open(SRC + "src/fonts.c", encoding="utf-8").read()
    for table in WIDTH_TABLES.values():
        m = re.search(rf"({table}\[\] = \{{)(.*?)(\}};)", text, re.S)
        v = [int(n) for n in re.findall(r"-?\d+", m.group(2))]
        for _, old, new in moves:
            v[new], v[old] = v[old], 0
        rows = ["    " + ", ".join(f"{x:2d}" for x in v[r*16:(r+1)*16]) + "," for r in range(len(v)//16)]
        text = text[:m.start(2)] + "\n" + "\n".join(rows) + "\n" + text[m.end(2):]
    open(SRC + "src/fonts.c", "w", encoding="utf-8").write(text)
    print("advances moved with them")

    p = SRC + "src/data/battle_frontier/apprentice.h"
    s = open(p, encoding="utf-8").read()
    assert "JÜRGEN" in s
    open(p, "w", encoding="utf-8").write(s.replace("JÜRGEN", "JURGEN"))
    print("JÜRGEN -> JURGEN (its Ü now draws an Arabic letter)")


if __name__ == "__main__":
    main()
