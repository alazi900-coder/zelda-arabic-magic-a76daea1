"""
Replaces the English lettering in the game's pictures with Arabic.

Every line the reader found is erased and redrawn: the hole is filled with the
button's own colour, read from the same row just outside the lettering, and the
Arabic goes in with the cartridge's own 11x12 glyphs, in the same colour the
English had and with the same dark ring if it had one. Nothing outside the line
the reader marked is touched, so frames, icons and backgrounds survive.
"""
import base64, difflib, json, os, sys
from collections import Counter
from PIL import Image

CELL_W, CELL_H, TILE_BYTES = 11, 12, 17

class Font:
    def __init__(self, meta):
        self.data = base64.b64decode(meta["glyphs"])
        self.slot = {cp: i for i, cp in enumerate(meta["cps"])}
        self.widths = meta["widths"]
        self.shaped = meta["shaped"]

    def bitmap(self, cp):
        i = self.slot.get(cp)
        if i is None: return None, 3
        off = i * TILE_BYTES
        rows = []
        for y in range(CELL_H):
            rows.append([(self.data[off + ((y * CELL_W + x) >> 3)] >> (7 - ((y * CELL_W + x) & 7))) & 1
                         for x in range(CELL_W)])
        return rows, self.widths[i]

    def render(self, text):
        cells = []
        for cp in self.shaped[text]:
            if cp == 0x20: cells.append((None, 3)); continue
            cells.append(self.bitmap(cp))
        width = sum(w for _, w in cells)
        grid = [[0] * max(width, 1) for _ in range(CELL_H)]
        x = 0
        for rows, w in cells:
            if rows:
                for y in range(CELL_H):
                    for i in range(min(w, CELL_W)):
                        if rows[y][i]: grid[y][x + i] = 1
            x += w
        return grid, width

def ink_box(grid, width):
    ys = [y for y in range(CELL_H) if any(grid[y][:width])]
    xs = [x for x in range(width) if any(grid[y][x] for y in range(CELL_H))]
    return (min(xs), min(ys), max(xs), max(ys)) if xs and ys else None

def merge_row_neighbours(lines, table, gap=30):
    rows = {}
    for l in lines:
        x0, y0, x1, y1 = l["box"]
        key = next((k for k in rows if abs(k - y0) <= 5), y0)
        rows.setdefault(key, []).append(l)
    out = []
    for cs in rows.values():
        cs.sort(key=lambda l: l["box"][0])
        cur = cs[0]
        for nxt in cs[1:]:
            joined = f'{cur["text"].strip()} {nxt["text"].strip()}'
            close = nxt["box"][0] - cur["box"][2] <= gap
            if close and lookup(joined, table):
                cur = {"text": joined,
                       "box": [cur["box"][0], min(cur["box"][1], nxt["box"][1]),
                               nxt["box"][2], max(cur["box"][3], nxt["box"][3])]}
            else:
                out.append(cur); cur = nxt
        out.append(cur)
    return sorted(out, key=lambda l: (l["box"][1], l["box"][0]))

def lookup(text, table, cache={}):
    """
    The reader mistakes a letter here and there -- Settings comes back as
    Settince, Finish as Finlsh -- and a button's three states are read three
    different ways. A close match to a known label is that label: the labels are
    short and few, so nothing else is within this distance of them.
    """
    t = " ".join(text.split())
    if t in table: return table[t]
    if t in cache: return cache[t]
    near = difflib.get_close_matches(t, table.keys(), n=1, cutoff=0.72)
    cache[t] = table[near[0]] if near else None
    return cache[t]

def arabize(path, info, table, font, out_path):
    im = Image.open(path).convert("RGBA")
    px = im.load()
    colour = tuple(info["colour"])
    changed = 0

    # The reader sometimes splits one label across two boxes -- "Extra Time"
    # and "Half Time" out of "Extra Time : Half Time". Two boxes on the same
    # row whose Arabic would collide are one label, so they are joined and
    # looked up whole before anything is drawn.
    lines = merge_row_neighbours(info["lines"], table)

    for line in lines:
        arabic = lookup(line["text"], table)
        if not arabic: continue
        x0, y0, x1, y1 = line["box"]

        # the ring the game draws round the lettering, if it draws one
        halo = Counter()
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if px[x, y] != colour: continue
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < im.width and 0 <= ny < im.height and px[nx, ny] != colour:
                            halo[px[nx, ny]] += 1

        # What the picture is made of on each of those rows, sampled from the
        # margin just beside the lettering rather than the whole row: a row can
        # cross a frame or a panel of another colour, and filling the hole with
        # that paints a stripe the picture never had.
        fill = {}
        MARGIN = 12
        for y in range(max(0, y0 - 3), min(im.height, y1 + 4)):
            near = [px[x, y] for x in
                    list(range(max(0, x0 - MARGIN), max(0, x0 - 1))) +
                    list(range(min(im.width, x1 + 2), min(im.width, x1 + MARGIN)))]
            near = [c for c in near if c != colour]
            if not near:
                near = [c for c in (px[x, y] for x in range(im.width)) if c != colour]
            fill[y] = Counter(near).most_common(1)[0][0] if near else (0, 0, 0, 0)
        ring = halo.most_common(1)[0][0] if halo else None
        if ring is not None and ring in set(fill.values()): ring = None

        # Clear the box, and any stray letter pixel just outside it -- the
        # reader's box can fall a few pixels short of the word's last stroke,
        # and a leftover stroke under the Arabic reads as a smudge.
        pad, reach = 2, 26
        for y in range(max(0, y0 - pad), min(im.height, y1 + pad + 1)):
            row_fill = fill.get(y, fill.get(y0, (0, 0, 0, 0)))
            for x in range(max(0, x0 - reach), min(im.width, x1 + reach + 1)):
                inside = x0 - pad <= x <= x1 + pad
                if inside or px[x, y] == colour or (ring is not None and px[x, y] == ring):
                    px[x, y] = row_fill

        grid, gw = font.render(arabic)
        box = ink_box(grid, gw)
        if not box: continue
        ox = (x0 + x1) // 2 - (box[0] + box[2]) // 2
        oy = (y0 + y1) // 2 - (box[1] + box[3]) // 2
        ink = {(ox + x, oy + y) for y in range(CELL_H) for x in range(gw) if grid[y][x]}
        if ring is not None:
            for (x, y) in ink:
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        p = (x + dx, y + dy)
                        if p not in ink and 0 <= p[0] < im.width and 0 <= p[1] < im.height:
                            px[p] = ring
        for (x, y) in ink:
            if 0 <= x < im.width and 0 <= y < im.height: px[x, y] = colour
        changed += 1
    if changed:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        im.save(out_path)
    return changed

def main():
    ocr = json.load(open(sys.argv[1]))
    table = json.load(open(sys.argv[2]))
    font = Font(json.load(open(sys.argv[3])))
    out_root = sys.argv[4]
    done = miss = 0
    missing = Counter()
    for rel, info in ocr.items():
        n = arabize(os.path.join("all_png", rel), info, table, font, os.path.join(out_root, rel))
        done += n
        for line in info["lines"]:
            t = line["text"].strip()
            if t and lookup(t, table) is None: missing[t] += 1; miss += 1
    print(f"lines replaced {done}   lines with no translation {miss}")
    json.dump(missing.most_common(), open("missing.json", "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__": main()
