"""Per-glyph advance for the Arabic letters.

Until now every Arabic glyph advanced a fixed 7 px, so a two-pixel-wide alef
reserved as much room as a seven-pixel seen and the leftover blank columns
opened a gap in the middle of a word.  The glyphs are drawn left-aligned in
their cell and their joining strokes run out to the ink edge, so advancing
exactly as far as the ink reaches sets the next letter flush against the
stroke -- which is what joined Arabic wants.

The glyph a byte draws is read back out of charmap.txt, so this stays correct
no matter which donor codes the import happened to pick.
"""
import re, sys
sys.path.insert(0, ".")
from import_pkm_font import SRC, WIDTH_TABLES, load_glyphs

ARABIC = lambda cp: 0xFE80 <= cp <= 0xFEFC or cp in (0x060C, 0x061B, 0x061F, 0x0621)

index_of = {}
for line in open(SRC + "charmap.txt", encoding="utf-8"):
    m = re.match(r"^'(.)'\s*=\s*([0-9A-F]{2})(?:\s+([0-9A-F]{2}))?\s*$",
                 line.split("@")[0].strip())
    if m and ARABIC(ord(m.group(1))):
        hi, lo = int(m.group(2), 16), m.group(3)
        # a two-byte F9 escape lives in the extended half of the font sheet
        index_of[ord(m.group(1))] = 0x100 + int(lo, 16) if lo else hi
assert len(index_of) == 129, len(index_of)

glyphs = load_glyphs()


def ink_max_x(raw):
    m = -1
    for row in range(16):
        b0, b1, b2, b3 = raw[row * 4:row * 4 + 4]
        word = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)
        for x in range(8):
            if (word >> (4 * x)) & 0xF:
                m = max(m, x)
    return m


adv = {}
for cp, idx in index_of.items():
    mx = ink_max_x(glyphs[cp])
    adv[idx] = (mx + 1) if mx >= 0 else 3

text = open(SRC + "src/fonts.c", encoding="utf-8").read()
for table in WIDTH_TABLES.values():
    m = re.search(rf"({table}\[\] = \{{)(.*?)(\}};)", text, re.S)
    values = [int(n) for n in re.findall(r"-?\d+", m.group(2))]
    for idx, w in adv.items():
        values[idx] = w
    rows = ["    " + ", ".join(f"{v:2d}" for v in values[r*16:(r+1)*16]) + ","
            for r in range(len(values)//16)]
    text = text[:m.start(2)] + "\n" + "\n".join(rows) + "\n" + text[m.end(2):]
open(SRC + "src/fonts.c", "w", encoding="utf-8").write(text)

hist = {}
for w in adv.values():
    hist[w] = hist.get(w, 0) + 1
print("advance histogram (width: how many letters):", dict(sorted(hist.items())))
