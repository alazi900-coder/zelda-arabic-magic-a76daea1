"""يمدّ وصلة الخروج (العمود 0) للأشكال الأولية والوسطية التي تفتقدها."""
from PIL import Image
import json, sys

PP = "/home/user/decomps/pokeplatinum/res/fonts"
INK, SHADOW = 1, 2
BAND = (10, 11)          # نطاق الوصل القياسي في هذا الخط
SHADOW_ROW = 12
# ب، ت، ث، ي — الشكلان الأولي والوسطي لكل منها
TARGETS = [0xC1, 0xC2, 0xC8, 0xC9, 0xCD, 0xCE, 0x1A2, 0x1A3]
CW = CH = 16

def fix(sheet, meta):
    im = Image.open(f"{PP}/{sheet}")
    px = im.load()
    W = json.load(open(f"{PP}/{meta}"))['glyphWidths']
    changed = []
    for code in TARGETS:
        idx = code - 1
        r, c = divmod(idx, 16)
        ox, oy = c*CW, r*CH
        if any(px[ox, oy+y] != 0 for y in BAND):
            continue                                  # لها وصلة أصلاً
        # أول عمود فيه حبر ضمن نطاق الوصل
        L = next((x for x in range(CW) if any(px[ox+x, oy+y] == INK for y in BAND)), None)
        if L is None or L == 0:
            continue
        for x in range(L):
            for y in BAND:
                px[ox+x, oy+y] = INK
            if x >= 1:
                if px[ox+x, oy+SHADOW_ROW] == 0:
                    px[ox+x, oy+SHADOW_ROW] = SHADOW
        changed.append((code, L, W[idx]))
    im.save(f"{PP}/{sheet}")
    return changed

for sheet, meta in (("font_message.png","font_message.json"),
                    ("font_subscreen.png","font_subscreen.json"),
                    ("font_system.png","font_system.json")):
    ch = fix(sheet, meta)
    print(f"\n{sheet}: عُدّل {len(ch)} رسماً")
    for code, L, w in ch:
        print(f"   0x{code:03X}  مُلئت الأعمدة 0..{L-1} عند الصفّين 10-11 (العرض {w})")
