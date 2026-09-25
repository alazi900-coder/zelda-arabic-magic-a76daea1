"""Shorten the joining stroke, not the letters.

A medial beh is two columns of letter and six of flat kashida, so an Arabic
word here is mostly joining stroke -- that is what reads as stretched.  A
column may be dropped only if its ink lies entirely in the rows that the
stroke occupies at the cell edge, and at least one such column is kept so the
stroke still reaches both sides and the letters stay joined.  No pixel of any
letter body is touched.
"""
import sys
sys.path.insert(0, ".")
from import_pkm_font import load_glyphs, needed_codepoints

MAX_TRIM = 2   # per glyph, kept conservative


def grid(raw):
    return [[(int.from_bytes(raw[r*4:r*4+4], "little") >> (4 * x)) & 0xF
             for x in range(8)] for r in range(16)]


def pack(g):
    out = bytearray()
    for r in range(16):
        w = 0
        for x in range(8):
            w |= (g[r][x] & 0xF) << (4 * x)
        out += w.to_bytes(4, "little")
    return bytes(out)


def trim(raw, limit=MAX_TRIM):
    g = grid(raw)
    inked = [x for x in range(8) if any(g[r][x] for r in range(16))]
    if len(inked) < 4:
        return raw, 0
    left, right = inked[0], inked[-1]
    rows_l = {r for r in range(16) if g[r][left]}
    rows_r = {r for r in range(16) if g[r][right]}
    stroke = rows_l & rows_r
    if not stroke or len(stroke) > 3:
        return raw, 0

    pure = [x for x in inked if {r for r in range(16) if g[r][x]} <= stroke]
    if len(pure) <= 1:
        return raw, 0
    # drop from the middle of the run, keeping the columns at both ends
    drop = sorted(pure)[1:-1][:limit] if len(pure) > 2 else []
    if not drop:
        return raw, 0
    keep = [x for x in range(8) if x not in drop]
    new = [[0] * 8 for _ in range(16)]
    for i, x in enumerate(keep):
        for r in range(16):
            new[r][i] = g[r][x]
    return pack(new), len(drop)


if __name__ == "__main__":
    g = load_glyphs()
    saved = {}
    for cp in needed_codepoints():
        _, n = trim(g[cp])
        if n:
            saved[cp] = n
    print(f"glyphs that can lose stroke columns: {len(saved)} of 129")
    print(f"columns removed in total: {sum(saved.values())}")
