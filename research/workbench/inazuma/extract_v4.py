"""Build Inazuma's Arabic glyph cells from the hand-drawn art, decoded the way
the art's own project decodes it.

The previous attempts read the art out of the Platinum font narc and guessed
its layout (16x16, 2bpp, four 8x8 sub-tiles). That guess produced sparse
fragments -- letters 3-8 pixels wide with their connecting strokes shot full
of holes -- which is what the game drew.

pokeemerald-arabic/scripts/import_pkm_font.py documents the real thing, and
pokeplatinum-arabic/scripts/platinum_font.py imports that same loader rather
than touching the narc at all: the glyphs live in
src/lib/pokemon/pkm-font.ts's PKM_ARABIC_GLYPHS_B64, 129 of them, each
8 wide x 16 tall at 4bpp, four bytes a row, LSB-first across x. Their advance
is 8, which is what makes the script join: a medial letter's baseline stroke
spans all eight columns, so it meets the next letter exactly.
"""
import re, base64, json

WEBSITE = "/home/user/zelda-arabic-magic-a76daea1/"
SRC_ROW_TOP = 4        # source rows 4..15 -- keeps the descenders 14 glyphs use
ADVANCE = 8            # what the art was drawn against
F12_W, F12_H = 11, 12
F8_W, F8_H = 7, 8


def load_glyphs():
    ts = open(WEBSITE + "src/lib/pokemon/pkm-font.ts", encoding="utf-8").read()
    b64 = re.search(r'PKM_ARABIC_GLYPHS_B64 =\s*\n?\s*"([^"]+)"', ts).group(1)
    data = base64.b64decode(b64)
    cps = sorted([0x060C, 0x061B, 0x061F, 0x0621] + list(range(0xFE80, 0xFEFD)))
    assert len(data) // 64 == len(cps) == 129
    return {cp: data[i * 64:(i + 1) * 64] for i, cp in enumerate(cps)}


def decode(raw):
    """8 wide, 16 tall, 4bpp, 4 bytes a row -- import_pkm_font.to_image's layout."""
    out = [[0] * 8 for _ in range(16)]
    for row in range(16):
        b0, b1, b2, b3 = raw[row * 4:row * 4 + 4]
        word = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)
        for x in range(8):
            out[row][x] = (word >> (4 * x)) & 0xF
    return out


def cell12(raw):
    """The 8x16 art placed in Inazuma's 11x12 cell, left-aligned."""
    g = decode(raw)
    out = [[0] * F12_W for _ in range(F12_H)]
    for r in range(F12_H):
        sr = SRC_ROW_TOP + r
        if sr >= 16:
            break
        for c in range(8):
            out[r][c] = 1 if g[sr][c] else 0
    return out


def cell8(bits12):
    """Squeezed into FONT8's 7x8 cell, OR-ing so no stroke drops out."""
    out = [[0] * F8_W for _ in range(F8_H)]
    for r in range(F8_H):
        r0 = (r * F12_H) // F8_H
        r1 = max(r0 + 1, ((r + 1) * F12_H + F8_H - 1) // F8_H)
        for c in range(F8_W):
            c0 = (c * ADVANCE) // F8_W
            c1 = max(c0 + 1, ((c + 1) * ADVANCE + F8_W - 1) // F8_W)
            if any(bits12[y][x] for y in range(r0, min(r1, F12_H)) for x in range(c0, min(c1, F12_W))):
                out[r][c] = 1
    return out


def pack(bits, w, h):
    buf = bytearray((w * h + 7) // 8)
    bp = 0
    for r in range(h):
        for c in range(w):
            if bits[r][c]:
                buf[bp // 8] |= 1 << (7 - (bp % 8))
            bp += 1
    return bytes(buf)


if __name__ == "__main__":
    glyphs = load_glyphs()
    slots = json.load(open("final_slots.json"))

    f12 = bytearray(); w12 = []
    f8 = bytearray(); w8 = []
    for s in slots:
        bits = cell12(glyphs[s["arabicCp"]])
        f12 += pack(bits, F12_W, F12_H)
        w12.append(ADVANCE)
        b8 = cell8(bits)
        f8 += pack(b8, F8_W, F8_H)
        w8.append(F8_W)

    json.dump({
        "arabicCps": [s["arabicCp"] for s in slots],
        "shiftJisCodes": [s["shiftJisCode"] for s in slots],
        "glyphIndices": [s["glyphIndex"] for s in slots],
        "f12_b64": base64.b64encode(bytes(f12)).decode(),
        "f12_widths": w12,
        "f8_b64": base64.b64encode(bytes(f8)).decode(),
        "f8_widths": w8,
    }, open("final_glyphs_v4.json", "w"))
    print("glyphs:", len(slots), "f12:", len(f12), "f8:", len(f8))
