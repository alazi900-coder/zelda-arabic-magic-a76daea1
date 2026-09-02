"""Rebuild the title screen from the tiles the ROM actually got, so the sprite
strides and frame offsets can be checked without running the game."""
from PIL import Image
B = "/home/user/decomps/pokeemerald/build/assets/graphics/title_screen/"
G = "/home/user/decomps/pokeemerald/graphics/title_screen/"

def pal_from(png):
    p = Image.open(png).getpalette()
    return [tuple(p[i*3:i*3+3]) for i in range(256)]

def tile4(data, n, pal):
    im = Image.new("RGB", (8, 8))
    px = im.load()
    for y in range(8):
        for x in range(0, 8, 2):
            b = data[n*32 + y*4 + x//2]
            px[x, y] = pal[b & 0xF]
            px[x+1, y] = pal[b >> 4]
    return im

def tile8(data, n, pal):
    im = Image.new("RGB", (8, 8))
    px = im.load()
    for y in range(8):
        for x in range(8):
            px[x, y] = pal[data[n*64 + y*8 + x]]
    return im

def sprite(data, frame, tw, th, pal, bpp=4):
    im = Image.new("RGB", (tw*8, th*8))
    f = tile4 if bpp == 4 else tile8
    for r in range(th):
        for c in range(tw):
            im.paste(f(data, frame + r*tw + c, pal), (c*8, r*8))
    return im

screen = Image.new("RGB", (240, 160), (0, 0, 0))

# POKéMON logo: affine BG, tilemap is the identity, so the sheet is the picture
logo = Image.open(G + "pokemon_logo.png").convert("RGB")
screen.paste(logo, (-8, 8))

ver = open(B + "emerald_version.png_mwidth_8__mheight_4.8bpp", "rb").read()
vpal = pal_from(G + "emerald_version.png")
for i, x in enumerate((66, 130)):
    screen.paste(sprite(ver, i * 32, 8, 4, vpal, 8), (x, 50))

ps = open(B + "press_start.png_mwidth_4__mheight_2__num_tiles_80__Wnum_tiles.4bpp", "rb").read()
ppal = pal_from(G + "press_start.png")
for i in range(5):
    screen.paste(sprite(ps, i * 8, 4, 2, ppal, 4), (40 + i*32, 100))
for i in range(5):
    screen.paste(sprite(ps, 40 + i * 8, 4, 2, ppal, 4), (40 + i*32, 140))

screen.resize((720, 480), Image.NEAREST).save(
    "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/mock_title.png")
print("mock written")
