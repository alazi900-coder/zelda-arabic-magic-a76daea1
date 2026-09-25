"""Fit the Arabised title art into the shapes the game's build accepts.

Both sources happen to carry the original's aspect ratio exactly -- 2:1 for the
logo, 1:1 for the GAME FREAK screen -- so each is a straight resize with no
crop and no stretch.

What the two need afterwards is not the same:

  logo.png        8bpp, its own palette, up to 256 colours. Index 0 is the
                  background the hardware treats as transparent, and it is red
                  in the shipped file, so the red has to land there and nowhere
                  else -- a quantiser left to itself would scatter the
                  background across several near-reds and put something else
                  in slot 0.

  gf_presents.png 4bpp against gf_presents.pal, which is a 16-step grey ramp
                  ending in white. The art is white on black, so it maps onto
                  that ramp exactly; no colour is lost. Index 0 and index 1 are
                  both pure black and only index 0 is the transparent
                  background, so black is pinned to 0 rather than left to the
                  nearest-colour search, which would be free to pick either.
"""
import sys

from PIL import Image

OUT = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/title_out"
UP = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b"
PLAT = "/home/user/decomps/pokeplatinum/res/graphics/title_screen"

LOGO_SRC = f"{UP}/0977286d-image.png"
GF_SRC = f"{UP}/e6bdcbe4-image.png"

RED = (255, 0, 0)


def read_jasc(path):
    lines = open(path, encoding="latin-1").read().replace("\r\n", "\n").split("\n")
    return [tuple(int(v) for v in lines[3 + i].split()) for i in range(int(lines[2]))]


def fit_logo():
    src = Image.open(LOGO_SRC).convert("RGB").resize((256, 128), Image.LANCZOS)
    # 255 colours for the art, leaving slot 0 free for the background.
    q = src.quantize(colors=255, method=Image.MEDIANCUT, dither=Image.NONE)
    pal = q.getpalette()[: 255 * 3]
    out = Image.new("P", (256, 128))
    out.putpalette(list(RED) + pal)
    qpx, spx, opx = q.load(), src.load(), out.load()
    background = 0
    for y in range(128):
        for x in range(256):
            r, g, b = spx[x, y]
            # Near-red is the background: the resize softens its edge, and a
            # ring of almost-red pixels left in the art palette would draw a
            # halo where the hardware expects nothing at all.
            if r > 200 and g < 70 and b < 70:
                opx[x, y] = background
            else:
                opx[x, y] = qpx[x, y] + 1
    return out


def fit_gf():
    ramp = read_jasc(f"{PLAT}/gf_presents.pal")[:16]
    src = Image.open(GF_SRC).convert("L").resize((256, 256), Image.LANCZOS)
    out = Image.new("P", (256, 256))
    flat = []
    for c in ramp:
        flat += list(c)
    out.putpalette(flat + [0, 0, 0] * (256 - len(ramp)))
    spx, opx = src.load(), out.load()
    levels = [c[0] for c in ramp]
    for y in range(256):
        for x in range(256):
            v = spx[x, y]
            if v <= 8:
                opx[x, y] = 0  # the transparent background, not index 1
                continue
            best, bi = 10 ** 9, 0
            for i, lv in enumerate(levels):
                if i == 0:
                    continue  # slot 0 is reserved for the background above
                d = abs(lv - v)
                if d < best:
                    best, bi = d, i
            opx[x, y] = bi
    return out


def main():
    import os
    os.makedirs(OUT, exist_ok=True)
    logo, gf = fit_logo(), fit_gf()
    logo.save(f"{OUT}/logo.png")
    gf.save(f"{OUT}/gf_presents.png")
    for name, im in (("logo.png", logo), ("gf_presents.png", gf)):
        used = sorted(set(im.getdata()))
        print(f"{name}: {im.size} mode={im.mode} indices used={len(used)} max={max(used)} "
              f"background(0)={list(im.getdata()).count(0)}")


if __name__ == "__main__":
    sys.exit(main())
