"""يحاكي مسار رسم النص العربي في اللعبة: ShapeArabicChar + التقدّم + انعكاس الموضع."""
from PIL import Image
import json, re, sys

PP = "/home/user/decomps/pokeplatinum"
NO_BASE = 0xFF
ISO, FIN, INI, MED = 0, 1, 2, 3

def load_tables():
    src = open(f"{PP}/include/arabic_shaping.h").read()
    m = re.search(r'sArabicBaseOf\[ARABIC_CODE_MAX\]\s*=\s*\{(.*?)\};', src, re.S)
    base_of = [int(x, 16) for x in re.findall(r'0x([0-9A-Fa-f]{2})', m.group(1))]
    rows = re.findall(
        r'\{\s*0x([0-9A-Fa-f]+),\s*0x([0-9A-Fa-f]+),\s*0x([0-9A-Fa-f]+),\s*0x([0-9A-Fa-f]+)\s*\},\s*//\s*U\+([0-9A-Fa-f]+)',
        src)
    forms, uni2base = [], {}
    for i, (a, b, c, d, u) in enumerate(rows):
        forms.append([int(a, 16), int(b, 16), int(c, 16), int(d, 16)])
        uni2base[chr(int(u, 16))] = i
    return base_of, forms, uni2base

BASE_OF, FORMS, UNI2BASE = load_tables()

def shape(text):
    """يُرجع قائمة رموز مرسومة، بنفس منطق ShapeArabicChar."""
    bases = [UNI2BASE.get(ch) for ch in text]
    out, prev = [], False
    for i, ch in enumerate(text):
        b = bases[i]
        if b is None:                      # فراغ أو ترقيم: يقطع الوصل
            out.append(('raw', ch)); prev = False; continue
        nxt = bases[i+1] if i+1 < len(text) else None
        form = 0
        if prev: form |= FIN
        if nxt is not None and FORMS[b][INI]: form |= INI
        code = FORMS[b][form] or FORMS[b][form & FIN] or FORMS[b][ISO]
        out.append(('glyph', code))
        prev = bool(form & INI)
    return out

def render(text, sheet, meta, win_w=232, scale=3, bg=(120,190,255)):
    im = Image.open(f"{PP}/res/fonts/{sheet}")
    px = im.convert('RGB').load(); pal = im.load()
    W = json.load(open(f"{PP}/res/fonts/{meta}"))['glyphWidths']
    CW = CH = 16
    canvas = Image.new('RGB', (win_w, CH), bg)
    cp = canvas.load()
    x = 0
    for kind, val in shape(text):
        if kind == 'raw':
            x += 5 if val == ' ' else 6       # تقريب لعرض الفراغ/الترقيم
            continue
        code = val; w = W[code-1]
        r, c = divmod(code-1, 16)
        dest = win_w - x - w                  # Window_CopyGlyph: انعكاس الموضع
        for gy in range(CH):
            for gx in range(w):
                if pal[c*CW+gx, r*CH+gy] != 0:
                    tx, ty = dest+gx, gy
                    if 0 <= tx < win_w:
                        cp[tx, ty] = px[c*CW+gx, r*CH+gy]
        x += w
    return canvas.resize((win_w*scale, CH*scale), Image.NEAREST)

if __name__ == '__main__':
    lines = ["اسمي روان.", "أستاذ البوكيمون", "بيت تين يمين ثوب"]
    sheet, meta = sys.argv[1], sys.argv[2]
    out_path = sys.argv[3]
    imgs = [render(t, sheet, meta) for t in lines]
    total = Image.new('RGB', (imgs[0].width, sum(i.height+6 for i in imgs)), (30,30,30))
    y = 0
    for i in imgs:
        total.paste(i, (0, y)); y += i.height+6
    total.save(out_path)
    print("كُتب:", out_path)
