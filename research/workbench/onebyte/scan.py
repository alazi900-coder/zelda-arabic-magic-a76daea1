import os,struct,re,sys
D=sys.argv[1]
files=sorted(os.listdir(D))
def cmpimm(w):
    # ARM data-processing immediate: cond 00 1 opcode S Rn Rd rot imm
    if (w>>25)&7!=1: return None
    op=(w>>21)&0xf; S=(w>>20)&1
    if not S: return None
    if op not in (0xA,0x8,0xB): return None  # cmp,tst,cmn
    rot=((w>>8)&0xf)*2; imm=w&0xff
    v=((imm>>rot)|(imm<<(32-rot)))&0xffffffff if rot else imm
    return ({0xA:'cmp',0x8:'tst',0xB:'cmn'}[op],(w>>16)&0xf,v)
res={}
for f in files:
    if not f.endswith('.bin'): continue
    base=0x02000000 if f=='arm9.bin' else int(f.split('_')[1][:8],16)
    d=open(os.path.join(D,f),'rb').read()
    hits=[]
    for i in range(0,len(d)-3,4):
        w=struct.unpack_from('<I',d,i)[0]
        c=cmpimm(w)
        if c and c[0]=='cmp' and c[2] in (0x81,0x9f,0xe0,0xfc,0xa0,0xa1,0xdf,0xef,0x80,0x7f,0x7e) : hits.append((base+i,c))
        if c and c[0]=='tst' and c[2]==0x80: hits.append((base+i,c))
    # group hits within 0x40
    groups=[]
    for a,c in hits:
        if groups and a-groups[-1][-1][0]<=0x30: groups[-1].append((a,c))
        else: groups.append([(a,c)])
    for g in groups:
        vals={c[2] for a,c in g}
        if (0x81 in vals and (0x9f in vals or 0xe0 in vals or 0xfc in vals)) or (0xa1 in vals and 0xdf in vals) or ('tst' in [c[0] for a,c in g]) or (0x80 in vals) :
            print(f, hex(g[0][0]), ' '.join('%s r%d,#%x'%(c[0],c[1],c[2]) for a,c in g))
