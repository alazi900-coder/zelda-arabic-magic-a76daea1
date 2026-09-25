import sys, json, re
sys.path.insert(0,'/home/user/zelda-arabic-magic-a76daea1/pokeemerald-arabic/scripts')
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

GAME=[(255,255,255),(72,72,72),(184,184,184),(255,255,255)]

def render(text):
    s=arshape.shape(text)
    tiles=[]
    for ch in s:
        c=code_of.get(ch)
        if c is None:
            print("  ! NO SLOT FOR", repr(ch)); continue
        tiles.append((c, meta["glyphWidths"][c-1]))
    total=sum(w for _,w in tiles)
    px=sheet.load()
    out=Image.new("RGB",(max(total,1),16),GAME[0])
    op=out.load()
    x=0
    for c,w in tiles:
        slot=c-1
        col,row=slot%16,slot//16
        destX=total-x-w
        for yy in range(16):
            for xx in range(w):
                v=px[col*16+xx,row*16+yy]
                if v!=0 and 0<=destX+xx<total: op[destX+xx,yy]=GAME[v]
        x+=w
    return out,total

words=["بوكيديكس","بوكيمون","الحقيبة","حفظ","خيارات","خروج","دردشة"]
ims=[]
for w in words:
    im,width=render(w)
    print(w, "->", width, "px")
    ims.append(im)
W=max(i.width for i in ims); H=16*len(ims)
sheet_out=Image.new("RGB",(W,H),(0,0,0))
y=0
for im in ims:
    sheet_out.paste(im,(0,y)); y+=16
sheet_out.resize((W*6,H*6), Image.NEAREST).save("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/menu_sim.png")
