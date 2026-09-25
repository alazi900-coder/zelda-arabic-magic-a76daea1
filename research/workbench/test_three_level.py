"""Does a mid-tone edge actually help, on our own TTF, at Platinum's real colours?

The four pixel values are roles: 0 transparent, 1 fgColor, 2 shadowColor,
3 bgColor. render_ttf_glyphs.py rejects a grey ramp because a ramp that reaches
3 paints the window's own background *through* the letter. But sampled out of a
real screenshot of the game's dialogue box, fgColor is (82,82,90), bgColor is
white and shadowColor is (164,164,172) -- within a few units of the exact
halfway blend. So a ramp confined to 0 -> 2 -> 1 never touches 3, and its middle
step is a true 50% tone rather than a hole.
"""
import os
import sys

import arabic_reshaper
from PIL import Image, ImageDraw, ImageFont

SCRIPTS = "/home/user/zelda-arabic-magic-a76daea1/pokeplatinum-arabic/scripts"
sys.path.insert(0, SCRIPTS)
from render_ttf_glyphs import CELL, SIZE, SUPERSAMPLE, INK_CUTOFF

TTF = "/home/user/zelda-arabic-magic-a76daea1/pokeplatinum-arabic/fonts/DGShamaelBlack_Fixed.ttf"
OUT = os.path.dirname(os.path.abspath(__file__))

# Measured from a screenshot of the running game's dialogue box.
FG = (82, 82, 90)
SHADOW = (164, 164, 172)
BG = (255, 255, 255)

# Coverage below this is ink; between this and MID_CUTOFF is the mid tone.
MID_CUTOFF = 245

WORDS = ["صديقي", "بوكيمون", "مرحبا", "الياقوت", "الجنية العظيمة"]


def coverage(ch, font, ascent):
    """One glyph's real per-pixel coverage, 0 (ink) .. 255 (blank)."""
    bbox = font.getbbox(ch)
    big = Image.new("L", (CELL * SUPERSAMPLE, CELL * SUPERSAMPLE), 255)
    ImageDraw.Draw(big).text((-bbox[0] if bbox else 0, 0), ch, font=font, fill=0)
    return big.resize((CELL, CELL), Image.BOX)


def cell_values(cov, three):
    """Role values for one cell: 1 ink, 2 mid/shadow, 0 clear."""
    px = cov.load()
    out = [[0] * CELL for _ in range(CELL)]
    for y in range(CELL):
        for x in range(CELL):
            v = px[x, y]
            if v < INK_CUTOFF:
                out[y][x] = 1
            elif three and v < MID_CUTOFF:
                out[y][x] = 2
    # the deliberate drop shadow, one pixel down and right, added where nothing
    # is already drawn so it never eats into the letter or its edge
    for y in range(CELL - 1, 0, -1):
        for x in range(CELL - 1, 0, -1):
            if out[y - 1][x - 1] == 1 and out[y][x] == 0:
                out[y][x] = 2
    return out


def render(words, three, scale=5):
    font = ImageFont.truetype(TTF, SIZE * SUPERSAMPLE, layout_engine=ImageFont.Layout.BASIC)
    ascent, _ = font.getmetrics()
    line_h = CELL + 3
    im = Image.new("RGB", (200, line_h * len(words) + 4), BG)
    px = im.load()
    for row, word in enumerate(words):
        x0 = 4
        for ch in reversed(list(arabic_reshaper.reshape(word))):
            cov = coverage(ch, font, ascent)
            vals = cell_values(cov, three)
            width = 0
            for y in range(CELL):
                for x in range(CELL):
                    if vals[y][x]:
                        width = max(width, x + 1)
                        px[x0 + x, 2 + row * line_h + y] = FG if vals[y][x] == 1 else SHADOW
            x0 += max(3, width)
            if x0 > im.width - CELL:
                break
    return im.resize((im.width * scale, im.height * scale), Image.NEAREST)


def main():
    a = render(WORDS, three=False)
    b = render(WORDS, three=True)
    gap = 12
    out = Image.new("RGB", (a.width, a.height * 2 + gap), (230, 230, 230))
    out.paste(a, (0, 0))
    out.paste(b, (0, a.height + gap))
    out.save(f"{OUT}/three_level_compare.png")
    print("top: current binary   bottom: with mid-tone edges")


if __name__ == "__main__":
    main()
