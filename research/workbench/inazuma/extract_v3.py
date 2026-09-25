"""Extract the Platinum Arabic glyphs into Inazuma's 11x12 cell.

What the previous attempt got wrong: it rescaled the whole 16x16 source cell
down to 11x12 and then set the advance width from the ink's right edge plus
padding. But the source letters only occupy ~3-8 of those 16 columns and sit
at an offset inside the cell, so the advance ended up counting the cell's
empty left margin as part of the letter -- every pair of letters came out
with a 3-4px hole between them, which is what the game drew.

What this does instead:
  * keeps the source pixels 1:1 (no rescale), since a 3-8px letter already
    fits an 11px cell -- rescaling only smeared the connecting strokes
  * crops each glyph to its own ink columns and shifts it to column 0
  * sets the advance to exactly that ink width, so the baseline connector of
    one letter ends where the next one's begins and the script joins up
  * uses ONE shared vertical window (source rows 2..13) for every glyph so
    they all sit on the same baseline
"""
import pickle, json, base64

SRC_ROW_TOP = 2      # shared vertical window: source rows 2..13 -> output 0..11
CELL_W, CELL_H = 11, 12
MIN_ADVANCE = 2

with open('plat_arabic_real.pkl', 'rb') as f:
    d = pickle.load(f)
f1 = d['f1']
arabic_map = d['arabic_map']
char_to_code = {v: k for k, v in arabic_map.items()}
data = f1[16:]


def dec8(buf, off):
    px = [[0] * 8 for _ in range(8)]
    for row in range(8):
        v = buf[off + row * 2] | (buf[off + row * 2 + 1] << 8)
        for col in range(8):
            px[row][col] = (v >> (col * 2)) & 3
    return px


def dec16(buf, off):
    tl = dec8(buf, off); tr = dec8(buf, off + 16)
    bl = dec8(buf, off + 32); br = dec8(buf, off + 48)
    o = [[0] * 16 for _ in range(16)]
    for r in range(8):
        for c in range(8):
            o[r][c] = tl[r][c]; o[r][c + 8] = tr[r][c]
            o[r + 8][c] = bl[r][c]; o[r + 8][c + 8] = br[r][c]
    return o


def glyph_cell(cp):
    """(bits[12][11], advance) for one Arabic presentation form."""
    code = char_to_code[chr(cp)]
    g = dec16(data, (code - 1) * 64)
    mask = [[1 if g[r][c] > 0 else 0 for c in range(16)] for r in range(16)]

    cols = [c for c in range(16) if any(mask[r][c] for r in range(16))]
    if not cols:
        return [[0] * CELL_W for _ in range(CELL_H)], 4  # blank -> a space
    c0, c1 = cols[0], cols[-1]
    ink_w = c1 - c0 + 1

    out = [[0] * CELL_W for _ in range(CELL_H)]
    if ink_w <= CELL_W:
        for r in range(CELL_H):
            sr = SRC_ROW_TOP + r
            if sr >= 16:
                break
            for c in range(ink_w):
                out[r][c] = mask[sr][c0 + c]
        advance = max(MIN_ADVANCE, ink_w)
    else:
        # only the few very wide letters (س ش ص ض): squeeze to the cell,
        # OR-ing source columns so no stroke disappears
        for r in range(CELL_H):
            sr = SRC_ROW_TOP + r
            if sr >= 16:
                break
            for c in range(CELL_W):
                a = c0 + (c * ink_w) // CELL_W
                b = c0 + max(a + 1, ((c + 1) * ink_w + CELL_W - 1) // CELL_W)
                if any(mask[sr][x] for x in range(a, min(b, 16))):
                    out[r][c] = 1
        advance = CELL_W
    return out, advance


def pack(bits, w, h):
    n = (w * h + 7) // 8
    buf = bytearray(n)
    bp = 0
    for r in range(h):
        for c in range(w):
            if bits[r][c]:
                buf[bp // 8] |= 1 << (7 - (bp % 8))
            bp += 1
    return bytes(buf)


def shrink_to_font8(bits, advance):
    """FONT8's 7x8 cell: drop to 7 wide x 8 tall, keeping the baseline."""
    out = [[0] * 7 for _ in range(8)]
    for r in range(8):
        sr = 2 + r  # 12-row cell -> take rows 2..9, the body band
        if sr >= CELL_H:
            break
        for c in range(7):
            a = (c * CELL_W) // 7
            b = max(a + 1, ((c + 1) * CELL_W + 6) // 7)
            if any(bits[sr][x] for x in range(a, min(b, CELL_W))):
                out[r][c] = 1
    adv8 = max(2, round(advance * 7 / CELL_W))
    return out, adv8


if __name__ == "__main__":
    with open('final_slots.json') as f:
        slots = json.load(f)

    f12 = bytearray(); w12 = []
    f8 = bytearray(); w8 = []
    cells = []
    for s in slots:
        bits, adv = glyph_cell(s['arabicCp'])
        cells.append((bits, adv))
        f12 += pack(bits, CELL_W, CELL_H)
        w12.append(adv)
        b8, a8 = shrink_to_font8(bits, adv)
        f8 += pack(b8, 7, 8)
        w8.append(a8)

    out = {
        'arabicCps': [s['arabicCp'] for s in slots],
        'shiftJisCodes': [s['shiftJisCode'] for s in slots],
        'glyphIndices': [s['glyphIndex'] for s in slots],
        'f12_b64': base64.b64encode(bytes(f12)).decode(),
        'f12_widths': w12,
        'f8_b64': base64.b64encode(bytes(f8)).decode(),
        'f8_widths': w8,
    }
    with open('final_glyphs_v3.json', 'w') as f:
        json.dump(out, f)
    print("glyphs:", len(slots), "f12 bytes:", len(f12), "f8 bytes:", len(f8))
    print("advance widths 12px:", w12)
