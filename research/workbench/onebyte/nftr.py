import struct,sys
from PIL import Image
def load(path):
    d=open(path,'rb').read()
    blocks={}; cmaps=[]
    p=0x10
    while p<len(d)-8:
        k=d[p:p+4][::-1].decode('latin1') if d[p:p+4] in (b'FNIF',b'PLGC',b'HDWC',b'PAMC') else d[p:p+4].decode('latin1')
        sz=struct.unpack_from('<I',d,p+4)[0]
        if sz==0: break
        if k in('FNIF','INFO'): pass
        blocks.setdefault(d[p:p+4],[]).append(p)
        p+=sz
    return d,blocks
def info(path):
    d,b=load(path)
    pl=b[b'PLGC'][0]; cw,ch,tb=d[pl+8],d[pl+9],struct.unpack_from('<H',d,pl+10)[0]
    bpp=d[pl+14]
    hd=b[b'HDWC'][0]
    cm=[]
    p=struct.unpack_from('<I',d,0x28)[0]
    while p:
        first,last,typ,nxt=struct.unpack_from('<HHII',d,p)
        cm.append((p-8,first,last,typ,nxt)); p=nxt
    return d,pl,cw,ch,tb,bpp,hd,cm
def glyph_of(d,cm,code):
    for at,first,last,typ,nxt in cm:
        if first<=code<=last:
            if typ==0: return struct.unpack_from('<H',d,at+20)[0]+code-first
            if typ==1: return struct.unpack_from('<H',d,at+20+(code-first)*2)[0]
            n=struct.unpack_from('<H',d,at+20)[0]
            for i in range(n):
                c,g=struct.unpack_from('<HH',d,at+22+i*4)
                if c==code: return g
            return None
    return None
if __name__=='__main__':
    path=sys.argv[1]
    d,pl,cw,ch,tb,bpp,hd,cm=info(path)
    print('cell',cw,ch,'tile',tb,'bpp',bpp, 'size',len(d))
    fnif=struct.unpack_from('<I',d,0x10+4)[0]
    print('FINF', d[0x10:0x10+fnif].hex())
    for c in cm: print('PAMC at %x %x-%x type %d next %x'%c)
    print('hdwc', hex(hd), struct.unpack_from('<HHI',d,hd+8))
