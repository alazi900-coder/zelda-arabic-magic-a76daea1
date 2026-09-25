import sys, os
sys.path.insert(0, '/home/user/zelda-arabic-magic-a76daea1/pokeemerald-arabic/scripts')
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, '/home/user/zelda-arabic-magic-a76daea1/pokeplatinum-arabic/scripts')
import arshape

CELL = 16
WORD = arshape.shape("مرحبا بك")

CANDIDATES = [
    ("DGShamaelBlack", "/home/user/zelda-arabic-magic-a76daea1/pokeplatinum-arabic/fonts/DGShamaelBlack_Fixed.ttf"),
    ("NotoArabicUI",   "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/df6b85cc-NotoSansArabicUIRegular.ttf"),
    ("NotoArXCondReg",  "/usr/share/fonts/truetype/noto/NotoSansArabic-ExtraCondensed.ttf"),
    ("NotoArCondReg",  "/usr/share/fonts/truetype/noto/NotoSansArabic-Condensed.ttf"),
    ("NotoArCondSemiBold", "/usr/share/fonts/truetype/noto/NotoSansArabic-CondensedSemiBold.ttf"),
]

def render_word(path, size, thresh):
    f = ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.BASIC)
    asc, _ = f.getmetrics()
    tiles = []
    for ch in WORD:
        if ch == ' ':
            tiles.append((None, 4)); continue
        b = f.getbbox(ch)
        w = max(1, b[2]-b[0]) if b else 1
        c = Image.new("L", (CELL, CELL), 255)
        ImageDraw.Draw(c).text((-b[0] if b else 0, 0), ch, font=f, fill=0)
        px = c.load()
        g = Image.new("P", (CELL, CELL), 0)
        g.putpalette([144,200,255, 56,56,56, 216,216,216, 255,255,255])
        gp = g.load()
        for y in range(CELL):
            for x in range(CELL):
                if px[x,y] < thresh: gp[x,y] = 1
        # shadow down-right, like the game's own latin glyphs
        for y in range(CELL-1, 0, -1):
            for x in range(CELL-1, 0, -1):
                if gp[x,y] == 0 and gp[x-1,y-1] == 1: gp[x,y] = 2
        tiles.append((g, w))
    total = sum(w for _, w in tiles)
    out = Image.new("P", (max(total,1), CELL), 0)
    out.putpalette([144,200,255, 56,56,56, 216,216,216, 255,255,255])
    x = 0
    for g, w in tiles:
        if g is not None:
            out.paste(g.crop((0,0,w,CELL)), (total - x - w, 0))
        x += w
    return out.convert("RGB"), total

rows = []
for name, path in CANDIDATES:
    if not os.path.exists(path): print("skip", name); continue
    for size in (11, 12, 13):
        try:
            im, tw = render_word(path, size, 128)
        except Exception as e:
            print(name, size, "ERR", e); continue
        rows.append((f"{name} {size}px  w={tw}", im))

W = max(im.width for _, im in rows) + 4
H = (CELL + 6) * len(rows)
sheet = Image.new("RGB", (W, H), (255,255,255))
for i, (lbl, im) in enumerate(rows):
    sheet.paste(im, (2, i*(CELL+6)+2))
    print(f"{i}: {lbl}")
sheet.resize((W*7, H*7), Image.NEAREST).save("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/fontcmp.png")
