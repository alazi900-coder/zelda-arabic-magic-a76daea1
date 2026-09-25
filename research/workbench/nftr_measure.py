import struct, sys
sys.path.insert(0,'.')
d=open(sys.argv[1],'rb').read()
fnt_off,fnt_size,fat_off,fat_size=struct.unpack('<4I',d[0x40:0x50])
fat=[struct.unpack('<2I',d[fat_off+i*8:fat_off+i*8+8]) for i in range(fat_size//8)]
files={}
def walk(did,path):
    o=fnt_off+(did&0xfff)*8; sub,first,parent=struct.unpack('<IHH',d[o:o+8]); p=fnt_off+sub; fid=first
    while True:
        t=d[p];p+=1
        if t==0:break
        n=d[p:p+(t&0x7f)].decode();p+=t&0x7f
        if t&0x80:
            s=struct.unpack('<H',d[p:p+2])[0];p+=2;walk(s,path+'/'+n)
        else: files[path+'/'+n]=fat[fid];fid+=1
walk(0,'')
s,e=files['/data_iz/font/FONT12.NFTR']; b=d[s:e]
# FINF at 0x10
assert b[0x10:0x14]==b'FNIF'
plgc,hdwc,pamc=struct.unpack('<III',b[0x10+0x10:0x10+0x1c])
tw,th,tl,_,depth,rot=struct.unpack('<BBHHBB',b[plgc:plgc+8])
fi,li,_=struct.unpack('<HHI',b[hdwc:hdwc+8])
def widths(g): o=hdwc+8+(g-fi)*3; return b[o],b[o+1],b[o+2]
cmap={}
p=pamc
while p:
    first,last,typ,nxt=struct.unpack('<HHII',b[p:p+12]); data=p+12
    if typ==0:
        base=struct.unpack('<H',b[data:data+2])[0]
        for c in range(first,last+1): cmap[c]=base+c-first
    elif typ==1:
        for i,c in enumerate(range(first,last+1)):
            g=struct.unpack('<H',b[data+i*2:data+i*2+2])[0]
            if g!=0xffff: cmap[c]=g
    else:
        n=struct.unpack('<H',b[data:data+2])[0]
        for i in range(n):
            c,g=struct.unpack('<HH',b[data+2+i*4:data+6+i*4]); cmap[c]=g
    p=nxt if nxt else 0
def bitmap(g):
    o=plgc+8+g*tl; bits=b[o:o+tl]; rows=[]
    for y in range(th):
        row=[]
        for x in range(tw):
            i=(y*tw+x)*depth; v=(bits[i//8]>>(7-(i%8)- (depth-1)))&((1<<depth)-1) if depth==1 else (bits[i//8]>>(8-depth-(i%8)))&((1<<depth)-1)
            row.append(v)
        rows.append(row)
    return rows
print('tile',tw,th,'depth',depth,'glyphs',li-fi+1)
g=cmap.get(0x20); print('space glyph',g,'widths(lb,gw,adv)',widths(g))
for c in [ord('a'),ord('e'),ord('?')]:
    print(chr(c),widths(cmap[c]))
# arabic glyph codes >= 0x8000 in cmap (sjis-like)
ar=[(c,g) for c,g in cmap.items() if c>=0x8140]
import collections
blank=collections.Counter()
for c,g in ar[:0]: pass
codes=[int(x,16) for x in open('/home/user/zelda-arabic-magic-a76daea1/src/lib/inazuma/inazuma-arabic-glyphs.ts').read().split('INAZUMA_SHIFT_JIS_CODES: number[] = [')[1].split(']')[0].replace('0x','').split(', ')]
cps=open('/home/user/zelda-arabic-magic-a76daea1/src/lib/inazuma/inazuma-arabic-glyphs.ts').read()
import re
m=re.search(r'INAZUMA_ARABIC_CODEPOINTS[^=]*=\s*\[([^\]]*)\]',cps); cpl=[int(x,16) for x in re.findall(r'0x[0-9A-Fa-f]+',m.group(1))] if m else []
import unicodedata
rows=[]
for i,c in enumerate(codes):
    g=cmap.get(c)
    if g is None: continue
    lb,gw,adv=widths(g); bm=bitmap(g)
    cols=[x for x in range(tw) if any(bm[y][x] for y in range(th))]
    if not cols: continue
    L=cols[0]; R=cols[-1]
    rows.append((unicodedata.name(chr(cpl[i]),'?') if cpl else hex(c), lb, gw, adv, L, adv-1-R))
for r in rows[:200]: print(r)
