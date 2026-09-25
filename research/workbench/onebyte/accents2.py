import struct,re,collections,sys,os
exec(open('fs.py').read().split('walk(0, "")')[0]); walk(0,"")
exec(open(sys.argv[1]).read().split('pat=')[0].split('def lz10')[1].join(['def lz10','']) if False else '')
def lz10(b):
    n=b[1]|b[2]<<8|b[3]<<16; out=bytearray(); p=4
    try:
        while len(out)<n:
            f=b[p]; p+=1
            for i in range(8):
                if len(out)>=n: break
                if f&0x80:
                    x=b[p]<<8|b[p+1]; p+=2; l=(x>>12)+3; dd=(x&0xfff)+1
                    for k in range(l): out.append(out[-dd])
                else: out.append(b[p]); p+=1
                f<<=1
    except Exception: return None
    return bytes(out)
strre=re.compile(rb'[\x20-\x7e\xa1-\xdf\n]{4,}')
tot=collections.Counter(); ex=collections.defaultdict(list)
def scan(name,c):
    for m in strre.finditer(c):
        s=m.group()
        acc=[b for b in s if 0xa1<=b<=0xdf]
        if not acc: continue
        letters=sum(1 for b in s if 65<=b<=90 or 97<=b<=122)
        if letters < 3*len(acc) or letters<4: continue
        # each accent adjacent to a letter
        ok=all((i>0 and (65<=s[i-1]<=122)) or (i+1<len(s) and 65<=s[i+1]<=122) for i,b in enumerate(s) if 0xa1<=b<=0xdf)
        if not ok: continue
        # prev byte must not be a sjis lead
        i=m.start()
        for b in acc: tot[b]+=1
        ex[name].append(s[:60])
for path,fid,sz,s,e in files:
    if not any(k in path for k in ('/logic/','/script/','/menu/','/movie/txt','/help','/sys')): continue
    if path.endswith(('.SAD','.pb','.nsbtx','.nsbmd','.mods')): continue
    data=d[s:e]
    scan(path,data)
    if data[:1]==b'\x10':
        z=lz10(data)
        if z: scan(path+'(lz)',z)
for f in sorted(os.listdir('code')):
    scan(f,open('code/'+f,'rb').read())
print({hex(k):v for k,v in sorted(tot.items())})
for p,l in sorted(ex.items(), key=lambda x:-len(x[1]))[:40]: print(len(l),p,l[:6])
