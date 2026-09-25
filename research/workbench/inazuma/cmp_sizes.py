import struct, re, base64

# --- Platinum: pl_font.narc members ---
buf=open('/tmp/pl_font.narc','rb').read()
def u32(b,o): return struct.unpack('<I',b[o:o+4])[0]
pos=16; offs=None; dataStart=None
while pos < len(buf)-8:
    magic=buf[pos:pos+4]; size=u32(buf,pos+4)
    if magic==b'BTAF':
        n=u32(buf,pos+8); offs=[(u32(buf,pos+12+i*8),u32(buf,pos+16+i*8)) for i in range(n)]
    elif magic==b'GMIF': dataStart=pos+8
    if size==0: break
    pos+=size
members=[buf[dataStart+s:dataStart+e] for s,e in offs]
names=["font_system.NFGR","font_message.NFGR","font_subscreen.NFGR","font_unown.NFGR"]
print("=== بوكيمون بلاتينيوم (pl_font.narc) ===")
for i,nm in enumerate(names):
    m=members[i]
    size,wto,ng = u32(m,0),u32(m,4),u32(m,8)
    maxW,maxH,gW,gH = m[12],m[13],m[14],m[15]
    widths=list(m[wto:wto+ng])
    print("  %-22s glyphs=%-4d cell=%dx%d  maxWidth=%d  عرض شائع=%d  bpp=2" % (nm,ng,maxW,maxH,maxW,max(set(widths),key=widths.count)))

# ink bounds of the Arabic glyphs inside Platinum's 16x16 cells (font_message)
m=members[1]; size,wto,ng=u32(m,0),u32(m,4),u32(m,8)
rows=(ng+15)//16
img=bytearray(64*rows*16)
so=size
for row in range(rows):
    for col in range(16):
        g=row*16+col
        if g>=ng: break
        for tile in range(4):
            px=col*16+(tile&1)*8
            for i in range(8):
                py=row*16+(tile>>1)*8+i
                d=py*64+(px>>2)
                img[d]=m[so+1]; img[d+1]=m[so]; so+=2
def px(g,x,y):
    gx,gy=g%16,g//16
    X,Y=gx*16+x, gy*16+y
    return (img[Y*64+(X>>2)] >> ((3-(X&3))*2)) & 3
FORMS=[[10,10,0,0],[86,115,0,0],[160,174,0,0],[176,177,0,0],[178,179,0,0],[181,182,184,186],[188,189,0,0],[190,192,193,194],[195,196,0,0],[198,199,200,201],[203,204,205,206],[207,209,210,211],[213,214,217,218],[219,220,222,223],[224,229,0,0],[230,231,0,0],[232,233,0,0],[234,235,0,0],[242,243,244,245],[247,248,249,250],[251,253,255,257],[258,259,260,262],[263,264,265,266],[267,268,269,270],[271,272,273,274],[483,288,351,353],[354,356,357,360],[361,362,363,364],[365,366,367,368],[369,370,371,372],[374,375,376,378],[380,381,386,388],[389,399,404,406],[407,412,0,0],[413,414,0,0],[415,417,418,419]]
slots=[c-1 for r in FORMS for c in r if c]
minY,maxY,maxW=99,-1,0
widths=list(m[wto:wto+ng])
for g in slots:
    if g>=ng: continue
    for y in range(16):
        for x in range(16):
            if px(g,x,y):
                minY=min(minY,y); maxY=max(maxY,y)
    maxW=max(maxW,widths[g])
print("  حبر الحروف العربية فيه: الصفوف %d..%d (ارتفاع %d)، أقصى عرض %d" % (minY,maxY,maxY-minY+1,maxW))

# --- Inazuma ---
print("\n=== إينازوما إيليفن ===")
for nm in ['FONT12.NFTR','FONT8.NFTR']:
    b=open('fontfiles/'+nm,'rb').read()
    p=struct.unpack('<H',b[0x0C:0x0E])[0]
    while p<len(b)-8:
        kind=b[p:p+4]; size=u32(b,p+4)
        if size==0: break
        if kind==b'PLGC':
            cw,ch,tb=b[p+8],b[p+9],struct.unpack('<H',b[p+10:p+12])[0]
            print("  %-22s glyphs=%-4d cell=%dx%d  bytes/glyph=%d  bpp=%d" % (nm,(size-16)//tb,cw,ch,tb,b[p+14]))
        p+=size
