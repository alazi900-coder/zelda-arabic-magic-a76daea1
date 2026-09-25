"""يبني ث الوسطية من ت الوسطية (نفس السِنّ) مع نقاط ث الثلاث."""
from PIL import Image
import json

PP = "/home/user/decomps/pokeplatinum/res/fonts"
TA_MED, THA_MED = 0xC9, 0xCE
CW = CH = 16
INK, SHADOW = 1, 2

def origin(code):
    r, c = divmod(code-1, 16)
    return c*CW, r*CH

def build(sheet, meta):
    im = Image.open(f"{PP}/{sheet}")
    px = im.load()
    sx, sy = origin(TA_MED)
    dx, dy = origin(THA_MED)

    # 1) انسخ ت الوسطية كاملةً فوق ث الوسطية
    for y in range(CH):
        for x in range(CW):
            px[dx+x, dy+y] = px[sx+x, sy+y]

    # 2) امسح نقطتَي ت (صفّا 5 و6)
    for y in (5, 6):
        for x in range(CW):
            px[dx+x, dy+y] = 0

    # 3) ارسم نقاط ث: الشريط مُزاح عموداً لليسار + نقطة فوقه
    for x in (2, 3, 4):
        px[dx+x, dy+5] = INK
    for x in (3, 4, 5):
        px[dx+x, dy+6] = SHADOW
    px[dx+3, dy+3] = INK
    px[dx+4, dy+4] = SHADOW

    im.save(f"{PP}/{sheet}")

    # 4) العرض يساوي عرض ت الوسطية
    p = f"{PP}/{meta}"
    d = json.load(open(p))
    old = d['glyphWidths'][THA_MED-1]
    new = d['glyphWidths'][TA_MED-1]
    d['glyphWidths'][THA_MED-1] = new
    json.dump(d, open(p, 'w'), indent=4)
    return old, new

for sheet, meta in (("font_message.png","font_message.json"),
                    ("font_subscreen.png","font_subscreen.json"),
                    ("font_system.png","font_system.json")):
    old, new = build(sheet, meta)
    print(f"{sheet}: أُعيد بناء ث الوسطية — العرض {old} ← {new}")
