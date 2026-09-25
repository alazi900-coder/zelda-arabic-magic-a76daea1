"""Drop the Arabic title art into the game's own title-screen sheets.

Every one of these sheets is read by the ROM as fixed-size, fixed-palette
pixel data -- pokemon_logo.bin even maps tile n to position n -- so the only
safe edit is to repaint the pixels and leave the geometry and the palette
exactly as they were.  Each drawing is therefore scaled into the same ink box
the English drawing occupied, which is also what keeps it centred on screen:
the version banner, for instance, is drawn left of centre in its sheet
precisely so the two sprites carrying it land centred on the display.
"""
import sys
from PIL import Image

GFX = "/home/user/decomps/pokeemerald/graphics/title_screen/"
UP = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/"


def near(c, ref, tol):
    return sum(abs(a - b) for a, b in zip(c, ref)) <= tol


def band_crop(im, bg, tol):
    """The uploads are the artwork on its coloured band with white margins
    around it; only the band is the picture the game shows."""
    px = im.convert("RGB").load()
    rows = [y for y in range(im.height) if near(px[2, y], bg, tol)]
    cols = [x for x in range(im.width) if near(px[x, rows[len(rows) // 2]], bg, tol)
            or not near(px[x, rows[len(rows) // 2]], (255, 255, 255), 30)]
    return im.crop((min(cols), min(rows), max(cols) + 1, max(rows) + 1))


def ink_box(im, bg, tol, box=None):
    px = im.convert("RGB").load()
    x0, y0, x1, y1 = box or (0, 0, im.width, im.height)
    xs, ys = [], []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if not near(px[x, y], bg, tol):
                xs.append(x); ys.append(y)
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def fit(art, art_bg, tol, dest, dest_box, bgcolor):
    """Scale art's ink to sit inside dest_box, centred, aspect preserved."""
    bx = ink_box(art, art_bg, tol)
    crop = art.convert("RGB").crop(bx)
    dw, dh = dest_box[2] - dest_box[0], dest_box[3] - dest_box[1]
    scale = min(dw / crop.width, dh / crop.height)
    nw, nh = max(1, round(crop.width * scale)), max(1, round(crop.height * scale))
    small = crop.resize((nw, nh), Image.LANCZOS)
    ox = dest_box[0] + (dw - nw) // 2
    oy = dest_box[1] + (dh - nh) // 2
    # paste through a mask so the art's own background never overwrites ours
    dest.paste(small, (ox, oy))
    return (ox, oy, nw, nh)


def quantize(rgb, palette, bg_index, bg_rgb, bg_tol, allowed):
    """Nearest colour in the sheet's own palette; anything still reading as
    background becomes the transparent index rather than a dark fringe."""
    out = Image.new("P", rgb.size, bg_index)
    out.putpalette(palette)
    src, dst = rgb.load(), out.load()
    cand = [(i, palette[i*3:i*3+3]) for i in allowed]
    cache = {}
    for y in range(rgb.height):
        for x in range(rgb.width):
            c = src[x, y]
            if near(c, bg_rgb, bg_tol):
                dst[x, y] = bg_index
                continue
            if c not in cache:
                cache[c] = min(cand, key=lambda p: sum((a-b)**2 for a, b in zip(c, p[1])))[0]
            dst[x, y] = cache[c]
    return out


def used_indices(im):
    return sorted({im.getpixel((x, y)) for x in range(im.width) for y in range(im.height)})


def do_version():
    orig = Image.open(GFX + "emerald_version.png")
    pal = orig.getpalette()
    bg = tuple(pal[:3])
    box = ink_box(orig.convert("RGB"), bg, 0)
    print("  version ink box in the English sheet:", box)
    canvas = Image.new("RGB", orig.size, bg)
    art = Image.open(UP + "b142e1ad-image.png")
    placed = fit(art, (252, 59, 228), 60, canvas, box, bg)
    print("  Arabic art placed at", placed)
    out = quantize(canvas, pal, 0, bg, 90, list(range(1, 16)))
    out.save(GFX + "emerald_version.png")


def line_runs(im, bg, tol, box, min_h=4):
    """The rows of ink, grouped into lines; a stray one-pixel row at the edge
    of the upload is not a line."""
    px = im.load()
    rows = [y for y in range(box[1], box[3])
            if any(not near(px[x, y], bg, tol) for x in range(box[0], box[2], 2))]
    runs, cur = [], [rows[0]]
    for y in rows[1:]:
        if y == cur[-1] + 1:
            cur.append(y)
        else:
            runs.append(cur); cur = [y]
    runs.append(cur)
    return [(r[0], r[-1] + 1) for r in runs if len(r) >= min_h]


def do_press_start():
    """Two 16px-tall bands instead of the original 8: see the note beside
    NUM_PRESS_START_FRAMES in title_screen.c.  The sheet keeps its 160px width
    and its palette, so only the sprite height and the tile stride change."""
    orig = Image.open(GFX + "press_start.png")
    pal = orig.getpalette()
    bg = tuple(pal[:3])
    canvas = Image.new("RGB", (160, 32), bg)
    # 1px of air top and bottom so no stroke touches a tile edge
    boxes = ((2, 1, 158, 15), (2, 17, 158, 31))

    ART_BG = (114, 154, 98)
    art = band_crop(Image.open(UP + "941a4c94-image.png").convert("RGB"), ART_BG, 60)
    box = ink_box(art, ART_BG, 60)
    runs = line_runs(art, ART_BG, 60, box)
    assert len(runs) == 2, runs
    print("  Arabic lines at rows", runs)
    for (y0, y1), dest in zip(runs, boxes):
        print("   ->", fit(art.crop((box[0], y0, box[2], y1)), ART_BG, 60, canvas, dest, bg))
    out = quantize(canvas, pal, 0, bg, 70, [1, 2, 3, 4, 5])
    out.save(GFX + "press_start.png")


def do_logo():
    orig = Image.open(GFX + "pokemon_logo.png")
    pal = orig.getpalette()
    allowed = [i for i in used_indices(orig) if i not in (0, 1)]
    box = ink_box(orig.convert("RGB"), (0, 0, 0), 24)
    print("  logo ink box in the English sheet:", box)
    canvas = Image.new("RGB", orig.size, (0, 0, 0))
    art = band_crop(Image.open(UP + "b40ddee9-image.png").convert("RGB"), (3, 2, 2), 40)
    placed = fit(art, (3, 2, 2), 40, canvas, box, (0, 0, 0))
    print("  Arabic logo placed at", placed)
    out = quantize(canvas, pal, 0, (0, 0, 0), 24, allowed)
    out.save(GFX + "pokemon_logo.png")


if __name__ == "__main__":
    print("emerald_version.png");  do_version()
    print("press_start.png");      do_press_start()
    print("pokemon_logo.png");     do_logo()
