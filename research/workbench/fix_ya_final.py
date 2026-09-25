"""يبني ي النهائية/المعزولة من ى (نفس الحرف بذيله الصحيح) مع نقطتَي ي."""
from PIL import Image
import json, sys

PP = "/home/user/decomps/pokeplatinum/res/fonts"
CW = CH = 16
INK = 1
# (وجهة, مصدر, مواضع النقاط داخل جوف الذيل)
JOBS = [
    (0x1A1, 0x19E, [(1,12),(2,12),(3,12)]),   # نهائي  ← ى نهائي
    (0x19F, 0x19D, [(1,11),(2,11),(3,11)]),   # معزول ← ى معزول
]

def origin(code):
    r, c = divmod(code-1, 16)
    return c*CW, r*CH

def build(sheet, meta):
    im = Image.open(f"{PP}/{sheet}")
    px = im.load()
    d = json.load(open(f"{PP}/{meta}"))
    notes = []
    for dst, src, dots in JOBS:
        sx, sy = origin(src)
        dx, dy = origin(dst)
        for y in range(CH):
            for x in range(CW):
                px[dx+x, dy+y] = px[sx+x, sy+y]
        for (x, y) in dots:
            px[dx+x, dy+y] = INK
        old = d['glyphWidths'][dst-1]
        new = d['glyphWidths'][src-1]
        d['glyphWidths'][dst-1] = new
        notes.append((dst, src, old, new))
    im.save(f"{PP}/{sheet}")
    json.dump(d, open(f"{PP}/{meta}", 'w'), indent=4)
    return notes

for sheet, meta in (("font_message.png","font_message.json"),
                    ("font_subscreen.png","font_subscreen.json"),
                    ("font_system.png","font_system.json")):
    for dst, src, old, new in build(sheet, meta):
        print(f"{sheet}: 0x{dst:X} ← 0x{src:X} + نقاط، العرض {old} ← {new}")
