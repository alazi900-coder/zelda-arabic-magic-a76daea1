import sys, json, re
sys.path.insert(0,'/home/user/zelda-arabic-magic-a76daea1/pokeplatinum-arabic/scripts')
import arshape
from PIL import Image

PLAT="/home/user/decomps/pokeplatinum/"
sheet=Image.open(PLAT+"res/fonts/font_message.png").convert("P")
meta=json.load(open(PLAT+"res/fonts/font_message.json"))
code_of={}
for line in open(PLAT+"tools/msgenc/charmap.txt",encoding="utf-8"):
    t=line.split("//")[0].rstrip("\n")
    m=re.match(r"^([0-9A-Fa-f]{4})=(.)$",t)
    if m: code_of[m.group(2)]=int(m.group(1),16)

# in-game dialogue palette: 0 transparent over the white box, 1 dark, 2 light grey, 3 white
GAME=[(255,255,255),(72,72,72),(184,184,184),(255,255,255)]

def line(text):
    s=arshape.shape(text)
    tiles=[]
    for ch in s:
        c=code_of.get(ch)
        if c is None: print("  ! لا رمز لـ",repr(ch)); continue
        tiles.append((c - 1, meta["glyphWidths"][c - 1]))
    total=sum(w for _,w in tiles)
    px=sheet.load()
    out=Image.new("RGB",(max(total,1),16),GAME[0])
    op=out.load()
    x=0
    for c,w in tiles:
        col,row=c%16,c//16
        destX=total-x-w              # Window_CopyGlyph mirrors positions only
        for yy in range(16):
            for xx in range(w):
                v=px[col*16+xx,row*16+yy]
                if v!=0 and 0<=destX+xx<total: op[destX+xx,yy]=GAME[v]
        x+=w
    return out,total

for i,t in enumerate(["مرحبا! هل","مرحبا بك في عالم بوكيمون","اسمي أوكيدو، وأنا باحث"]):
    im,w=line(t)
    print(f"[{i}] {t}  -> {w}px")
    im.resize((w*6,96),Image.NEAREST).save(f"/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/g{i}.png")
