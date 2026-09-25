import sys,struct
sys.path.insert(0,sys.argv[0].rsplit('/',1)[0])
from nftr import info, glyph_of
from PIL import Image, ImageDraw
path,lo,hi,out=sys.argv[1],int(sys.argv[2],16),int(sys.argv[3],16),sys.argv[4]
d,pl,cw,ch,tb,bpp,hd,cm=info(path)
codes=list(range(lo,hi+1))
S=4; cols=16
img=Image.new('RGB',(cols*(cw+6)*S, ((len(codes)+cols-1)//cols)*(ch+10)*S),'white')
dr=ImageDraw.Draw(img)
for n,c in enumerate(codes):
    g=glyph_of(d,cm,c)
    x0=(n%cols)*(cw+6)*S; y0=(n//cols)*(ch+10)*S
    dr.text((x0,y0),'%x'%c,fill='red')
    if g is None or g==0xffff: continue
    bits=d[pl+16+g*tb:pl+16+(g+1)*tb]
    for y in range(ch):
        for x in range(cw):
            i=(y*cw+x)*bpp
            v=(bits[i//8]>>(8-bpp-(i%8)))&((1<<bpp)-1)
            if v: dr.rectangle([x0+x*S,y0+10+y*S,x0+x*S+S-1,y0+10+y*S+S-1],fill='black')
img.save(out)
