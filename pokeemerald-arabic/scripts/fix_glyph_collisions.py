"""Give the game back the seven glyph slots Arabic took from it.

129 Arabic presentation forms needed a byte each, and only 95 codes in this
build are genuinely empty. The overflow was taken from codes the English game
still draws -- among them the four direction arrows, which appear on 67 route
signposts ("ROUTE 101 {UP_ARROW} OLDALE TOWN"), so the arrow came out as a
stray Arabic letter in the middle of an English line.

The seven are moved onto accented Latin codes instead. Those are measured, not
guessed: not one string in the game contains Œ, Ù, Ú, Û, ß, ç or ê, so nothing
that is printed loses its character.

Each move is three things kept in step -- the byte in charmap.txt, the 16x16
cell in all five font sheets, and the advance in fonts.c -- plus restoring what
the slot held before, taken from the font as git still has it.
"""
import re, subprocess, sys
from PIL import Image

FONTS = ["latin_normal", "latin_narrow", "latin_short", "latin_small", "latin_small_narrow"]
WIDTH_TABLES = [
    "gFontSmallNarrowLatinGlyphWidths", "gFontSmallLatinGlyphWidths",
    "gFontNarrowLatinGlyphWidths", "gFontShortLatinGlyphWidths",
    "gFontNormalLatinGlyphWidths",
]
CELL = 16

# old byte (what the game needs back) -> new byte (an unprinted Latin code)
MOVES = {
    0x34: 0x10,  # LV
    0x53: 0x11,  # PK
    0x77: 0x12,  # UNK_SPACER
    0x79: 0x13,  # UP_ARROW
    0x7A: 0x15,  # DOWN_ARROW
    0x7B: 0x19,  # LEFT_ARROW
    0x7C: 0x1C,  # RIGHT_ARROW
}


def box(idx):
    c, r = idx % 16, idx // 16
    return (c * CELL, r * CELL, c * CELL + CELL, r * CELL + CELL)


def vanilla(root, path):
    return subprocess.run(["git", "-C", root, "show", f"HEAD:{path}"],
                          capture_output=True, check=True).stdout


def main(root):
    root = root.rstrip("/") + "/"

    # charmap: the Arabic character sitting on each contested byte moves house
    cm = open(root + "charmap.txt", encoding="utf-8").read()
    moved = []
    for old, new in MOVES.items():
        pat = re.compile(r"^'(.)' = %02X$" % old, re.M)
        hits = [m for m in pat.finditer(cm)
                if 0x0600 <= ord(m.group(1)) <= 0x06FF
                or 0xFB50 <= ord(m.group(1)) <= 0xFEFF]
        assert len(hits) == 1, (hex(old), len(hits))
        m = hits[0]
        cm = cm[:m.start()] + "'%s' = %02X" % (m.group(1), new) + cm[m.end():]
        moved.append((m.group(1), old, new))
    open(root + "charmap.txt", "w", encoding="utf-8").write(cm)
    for ch, old, new in moved:
        print(f"  {ch}  0x{old:02X} -> 0x{new:02X}")

    for name in FONTS:
        path = f"graphics/fonts/{name}.png"
        im = Image.open(root + path)
        import io
        orig = Image.open(io.BytesIO(vanilla(root, path)))
        for old, new in MOVES.items():
            im.paste(im.crop(box(old)), box(new))       # Arabic to its new slot
            im.paste(orig.crop(box(old)), box(old))     # the game's own glyph back
        im.save(root + path)
    print(f"font cells moved in {len(FONTS)} sheets")

    text = open(root + "src/fonts.c", encoding="utf-8").read()
    was = vanilla(root, "src/fonts.c").decode("utf-8")
    for table in WIDTH_TABLES:
        cur = re.search(rf"({table}\[\] = \{{)(.*?)(\}};)", text, re.S)
        old_vals = [int(n) for n in re.findall(r"-?\d+", re.search(
            rf"({table}\[\] = \{{)(.*?)(\}};)", was, re.S).group(2))]
        vals = [int(n) for n in re.findall(r"-?\d+", cur.group(2))]
        for old, new in MOVES.items():
            vals[new] = vals[old]
            vals[old] = old_vals[old]
        rows = ["    " + ", ".join(f"{v:2d}" for v in vals[r * 16:(r + 1) * 16]) + ","
                for r in range(len(vals) // 16)]
        text = text[:cur.start(2)] + "\n" + "\n".join(rows) + "\n" + text[cur.end(2):]
    open(root + "src/fonts.c", "w", encoding="utf-8").write(text)
    print("advances swapped in 5 width tables")


if __name__ == "__main__":
    main(sys.argv[1])
