import json,sys
sys.path.insert(0, sys.argv[0].rsplit('/',1)[0])
from design import GLYPHS
from PIL import Image, ImageDraw
words=json.load(open(sys.argv[0].rsplit('/',1)[0]+'/words.json'))
S=6
def draw_word(cps):
    cols=[]
    for cp in cps:
        if 0xFE80<=cp<=0xFEFC: g=GLYPHS[cp-0xFE80]
        elif cp==0x20: g=['...']*8
        else: g=['#....','#....','#....','.....','#....','.....','.....','.....'][:8]; g=[r[:3] for r in g]
        for x in range(len(g[0])): cols.append([g[y][x] for y in range(8)])
    return cols
rows=[draw_word(w) for w in words]
W=max(len(r) for r in rows)+4
img=Image.new('RGB',(W*S*2+20, len(rows)*12*S+ 40),(40,70,150))
d=ImageDraw.Draw(img)
for i,cols in enumerate(rows):
    y0=10+i*12*S
    for x,col in enumerate(cols):
        for y,c in enumerate(col):
            if c=='#':
                d.rectangle([10+x*S,y0+y*S,10+x*S+S-1,y0+y*S+S-1],fill='white')
                # 1x preview on right
                img.putpixel((W*S+40+x*2, y0+y*2),(255,255,255)); img.putpixel((W*S+41+x*2, y0+y*2),(255,255,255)); img.putpixel((W*S+40+x*2, y0+y*2+1),(255,255,255)); img.putpixel((W*S+41+x*2, y0+y*2+1),(255,255,255))
img.save(sys.argv[1])
# glyph sheet
S2=5; cols=16
sheet=Image.new('RGB',(cols*9*S2,8*11*S2),(255,255,255)); d=ImageDraw.Draw(sheet)
for i,g in enumerate(GLYPHS):
    x0=(i%cols)*9*S2; y0=(i//cols)*11*S2
    d.text((x0,y0),'%x'%(0xFE80+i),fill='red')
    for y,r in enumerate(g):
        for x,c in enumerate(r):
            if c=='#': d.rectangle([x0+x*S2,y0+12+y*S2,x0+x*S2+S2-1,y0+12+y*S2+S2-1],fill='black')
sheet.save(sys.argv[2])
