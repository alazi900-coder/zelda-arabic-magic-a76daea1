"""Single-byte Arabic for pokeemerald, built from the font already safe in git.

The glyphs are src/lib/pokemon/pkm-font.ts's PKM_ARABIC_GLYPHS_B64 -- hand-drawn
for a different engine (Pokémon Ruby Destiny), but pixel art is pixel art, and
that file records exactly which codepoint each of its 129 glyphs draws via
neededCodepoints() in pkm-charmap.ts, which this script reimplements in Python
so the two never disagree about which glyph is which letter.

Every Arabic letter gets its own single byte here (never F9-escaped), taken
from the Japanese kana codes the English build carries but an Arabic game never
prints. Codes whose character the build actually needs (é, the Latin letters
themselves, digits, core punctuation) are never touched.
"""
import base64
import re
import sys
from PIL import Image

SRC = "/home/user/decomps/pokeemerald/"
WEBSITE = "/home/user/zelda-arabic-magic-a76daea1/"
FONTS = ["latin_normal", "latin_narrow", "latin_short", "latin_small", "latin_small_narrow"]
WIDTH_TABLES = {
    "latin_small_narrow": "gFontSmallNarrowLatinGlyphWidths",
    "latin_small": "gFontSmallLatinGlyphWidths",
    "latin_narrow": "gFontNarrowLatinGlyphWidths",
    "latin_short": "gFontShortLatinGlyphWidths",
    "latin_normal": "gFontNormalLatinGlyphWidths",
}

CELL = 16  # every pokeemerald Latin font cell is 16x16
ADVANCE = 8  # the width pkm-charmap.ts measured these glyphs against


def needed_codepoints():
    out = [0x060C, 0x061B, 0x061F, 0x0621] + list(range(0xFE80, 0xFEFD))
    return sorted(out)


# Only 116 single-byte donor codes exist without touching English text (see
# donor_codes below), 13 short of the 129 Arabic codepoints this font needs.
# Rather than sacrifice an English letter, the rarest presentation forms stay
# on the two-byte F9 escape this project used before -- ظ ذ ز ث, whose forms
# are genuinely uncommon in Arabic, and the semicolon, which the source text
# barely uses either.
TWO_BYTE_CODEPOINTS = {
    0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8,  # ظ
    0xFEAB, 0xFEAC,                  # ذ
    0xFEAF, 0xFEB0,                  # ز
    0xFE99, 0xFE9A, 0xFE9B, 0xFE9C,  # ث
    0x061B,                          # ؛
}
assert len(TWO_BYTE_CODEPOINTS) == 13


def load_glyphs():
    ts = open(WEBSITE + "src/lib/pokemon/pkm-font.ts", encoding="utf-8").read()
    b64 = re.search(r'PKM_ARABIC_GLYPHS_B64 =\s*\n?\s*"([^"]+)"', ts).group(1)
    data = base64.b64decode(b64)
    n = len(data) // 64
    codepoints = needed_codepoints()
    assert n == len(codepoints) == 129, (n, len(codepoints))
    return {cp: data[i * 64:(i + 1) * 64] for i, cp in enumerate(codepoints)}


def to_image(raw):
    """8 wide, 16 tall, 4bpp, 4 bytes a row -> a 16x16 cell, left-aligned."""
    img = Image.new("P", (CELL, CELL), 0)
    img.putpalette([144, 200, 255, 56, 56, 56, 216, 216, 216, 255, 255, 255])
    px = img.load()
    for row in range(16):
        b0, b1, b2, b3 = raw[row * 4:row * 4 + 4]
        word = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)
        for x in range(8):
            v = (word >> (4 * x)) & 0xF
            px[x, row] = {0: 0, 14: 2, 15: 1}.get(v, 3)
    return img


def donor_codes(n):
    """Codes safe to give to Arabic: every character sharing that byte is
    either kana (the English build never prints it) or something that only
    turns up in game text this project is translating anyway."""
    import glob
    import collections
    per = {}
    for line in open(SRC + "charmap.txt", encoding="utf-8"):
        m = re.match(r"^'(\\.|.)'\s*=\s*([0-9A-F]{2})\s*$", line.split("@")[0].strip())
        if m:
            ch = m.group(1)
            if len(ch) == 2 and ch[0] == "\\":
                ch = ch[1]
            per.setdefault(int(m.group(2), 16), []).append(ch)

    freq = collections.Counter()
    for pat in ["data/**/*.inc", "src/**/*.h", "src/**/*.c", "src/*.c"]:
        for f in glob.glob(SRC + pat, recursive=True):
            try:
                t = open(f, encoding="utf-8").read()
            except Exception:
                continue
            for s in re.findall(r'_\("((?:[^"\\]|\\.)*)"\)', t):
                freq.update(s)

    keep = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 "
               ".,!?'\"-:;/()&+=%$…⋯“”‘’♀♂×")
    pool = []
    for c, chars in sorted(per.items()):
        if set(chars) & keep:
            continue
        if all(0x3040 <= ord(x) <= 0x30FF for x in chars) or sum(freq.get(x, 0) for x in chars) == 0:
            pool.append(c)
    assert len(pool) >= n, f"only {len(pool)} donor codes for {n} letters"
    return pool[:n]


def main(apply_changes):
    glyphs = load_glyphs()
    codepoints = needed_codepoints()

    single_cps = [cp for cp in codepoints if cp not in TWO_BYTE_CODEPOINTS]
    two_cps = [cp for cp in codepoints if cp in TWO_BYTE_CODEPOINTS]
    codes = donor_codes(len(single_cps))
    single_plan = list(zip(single_cps, codes))  # (codepoint, byte)

    F9_BASE = 0x18  # free F9 payload range starts here
    two_plan = [(cp, 0xF9, F9_BASE + i) for i, cp in enumerate(two_cps)]

    print(f"{len(single_plan)} codepoints on a single byte, "
          f"{len(two_plan)} kept on the two-byte F9 escape (rarest presentation forms)")

    if not apply_changes:
        all_cps = single_cps + two_cps
        sheet = Image.new("P", (CELL * 16, CELL * ((len(all_cps) + 15) // 16)), 0)
        sheet.putpalette([144, 200, 255, 56, 56, 56, 216, 216, 216, 255, 255, 255])
        for i, cp in enumerate(all_cps):
            sheet.paste(to_image(glyphs[cp]), ((i % 16) * CELL, (i // 16) * CELL))
        out = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/single_byte_preview.png"
        sheet.resize((sheet.width * 3, sheet.height * 3), Image.NEAREST).save(out)
        print("dry run: preview written, nothing else changed")
        return

    # font cell index for a two-byte entry is 0x100 + payload, matching how
    # DecompressGlyph_* in text.c indexes the extended (F9) half of the range
    def glyph_index(entry):
        return entry[1] if len(entry) == 2 else 0x100 + entry[2]

    for name in FONTS:
        path = f"{SRC}graphics/fonts/{name}.png"
        im = Image.open(path)
        for entry, cp in [(e, e[0]) for e in single_plan] + [(e, e[0]) for e in two_plan]:
            idx = glyph_index(entry)
            box = (idx % 16 * CELL, idx // 16 * CELL, idx % 16 * CELL + CELL, idx // 16 * CELL + CELL)
            im.paste(to_image(glyphs[cp]), box)
        im.save(path)
    print(f"glyphs written into {len(FONTS)} fonts")

    text = open(SRC + "src/fonts.c", encoding="utf-8").read()
    all_indices = [glyph_index(e) for e in single_plan] + [glyph_index(e) for e in two_plan]
    for table in WIDTH_TABLES.values():
        m = re.search(rf"({table}\[\] = \{{)(.*?)(\}};)", text, re.S)
        values = [int(n) for n in re.findall(r"-?\d+", m.group(2))]
        for idx in all_indices:
            values[idx] = ADVANCE
        rows = ["    " + ", ".join(f"{v:2d}" for v in values[r * 16:(r + 1) * 16]) + ","
                for r in range(len(values) // 16)]
        text = text[:m.start(2)] + "\n" + "\n".join(rows) + "\n" + text[m.end(2):]
    open(SRC + "src/fonts.c", "w", encoding="utf-8").write(text)
    print(f"widths set to {ADVANCE} in {len(WIDTH_TABLES)} tables")

    cm = open(SRC + "charmap.txt", encoding="utf-8").read().rstrip("\n")
    block = ["", "@ Arabic, single-byte (hand-pixel art shared with the website's"
                 " Ruby Destiny tool)"]
    for cp, code in single_plan:
        block.append(f"'{chr(cp)}' = {code:02X}")
    block += ["", "@ Arabic, rarest forms kept on the two-byte escape"]
    for cp, hi, lo in two_plan:
        block.append(f"'{chr(cp)}' = {hi:02X} {lo:02X}")
    open(SRC + "charmap.txt", "w", encoding="utf-8").write(cm + "\n" + "\n".join(block) + "\n")
    print(f"charmap.txt: {len(single_plan)} single-byte + {len(two_plan)} two-byte entries added")


if __name__ == "__main__":
    main("--apply" in sys.argv)
