"""
Writes Arabic into a game picture using the cartridge's own font.

The English word is lifted out by colour -- its white body and the dark ring the
game draws round it -- and the hole is filled with whatever the button's own
background is at that row, so nothing but the lettering changes. The Arabic is
then drawn from the same 11x12 glyphs the ROM will use, with the same ring, and
centred on the space the English occupied.
"""
import base64, json, sys
from PIL import Image

CELL_W, CELL_H, TILE_BYTES = 11, 12, 17

def load_font(meta):
    data = base64.b64decode(meta["glyphs"])
    slot_of = {cp: i for i, cp in enumerate(meta["cps"])}
    def glyph(cp):
        i = slot_of.get(cp)
        if i is None:
            return None, 0
        off = i * TILE_BYTES
        rows = []
        for y in range(CELL_H):
            row = []
            for x in range(CELL_W):
                b = y * CELL_W + x
                row.append((data[off + (b >> 3)] >> (7 - (b & 7))) & 1)
            rows.append(row)
        return rows, meta["widths"][i]
    return glyph

def render(meta, spacing=0):
    glyph = load_font(meta)
    cells = []
    for cp in meta["codes"]:
        if cp == 0x20:
            cells.append((None, 3)); continue
        rows, w = glyph(cp)
        cells.append((rows, w if rows else 3))
    width = sum(w for _, w in cells) + spacing * (len(cells) - 1)
    grid = [[0] * width for _ in range(CELL_H)]
    x = 0
    for rows, w in cells:
        if rows:
            for y in range(CELL_H):
                for i in range(min(w, CELL_W)):
                    if rows[y][i]:
                        grid[y][x + i] = 1
        x += w + spacing
    return grid, width

def ink_box(grid):
    ys = [y for y, r in enumerate(grid) if any(r)]
    xs = [x for x in range(len(grid[0])) if any(r[x] for r in grid)]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None

def main(png, meta_path, bands, out):
    meta = json.load(open(meta_path))
    im = Image.open(png).convert("RGBA")
    px = im.load()
    WHITE, DARK = (255, 255, 255, 255), (33, 33, 33, 255)
    grid, gw = render(meta)
    box = ink_box(grid)

    for (top, bottom) in bands:
        # Only the pure white is lettering. The dark is the button's own inner
        # shadow and runs its whole width, and the greys are the icon -- taking
        # either into the bounding box widens the erase until it eats the icon
        # and the frame.
        letters = [(x, y) for y in range(top, bottom + 1) for x in range(im.width)
                   if px[x, y] == WHITE]
        if not letters:
            continue
        lx = [p[0] for p in letters]; ly = [p[1] for p in letters]
        x0, x1, y0, y1 = min(lx), max(lx), min(ly), max(ly)

        # what the button is made of, read from a row the lettering does not reach
        fill = {}
        for y in range(top, bottom + 1):
            counts = {}
            for x in range(im.width):
                c = px[x, y]
                if c in (WHITE, DARK):
                    continue
                counts[c] = counts.get(c, 0) + 1
            fill[y] = max(counts, key=counts.get) if counts else (0, 0, 0, 0)
        # Clear the box the lettering sat in, ring included, and nothing else.
        pad = 2
        for y in range(max(top, y0 - pad), min(bottom, y1 + pad) + 1):
            for x in range(max(0, x0 - pad), min(im.width, x1 + pad + 1)):
                px[x, y] = fill[y]

        ox = (x0 + x1) // 2 - (box[0] + box[2]) // 2
        oy = (y0 + y1) // 2 - (box[1] + box[3]) // 2
        ink = {(ox + x, oy + y) for y in range(CELL_H) for x in range(gw) if grid[y][x]}
        for (x, y) in ink:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    p = (x + dx, y + dy)
                    if p not in ink and 0 <= p[0] < im.width and 0 <= p[1] < im.height:
                        px[p] = DARK
        for (x, y) in ink:
            if 0 <= x < im.width and 0 <= y < im.height:
                px[x, y] = WHITE
    im.save(out)
    print(f"wrote {out}  text {gw}x{CELL_H}px")

if __name__ == "__main__":
    png, meta, out = sys.argv[1], sys.argv[2], sys.argv[3]
    bands = [tuple(int(v) for v in b.split("-")) for b in sys.argv[4:]]
    main(png, meta, bands, out)
