import struct,re,collections,sys
exec(open('fs.py').read().split('walk(0, "")')[0]); walk(0,"")
def lz10(b):
    if b[0]!=0x10: return None
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
pat=re.compile(rb'[A-Za-z][\xa1-\xdf][A-Za-z\s\.,!?\']|\s[\xa1-\xdf][a-z]')
tot=collections.Counter(); where=collections.Counter(); ex={}
for path,fid,sz,s,e in files:
    if '/en/' not in path and not path.startswith('/data_iz/logic') : continue
    data=d[s:e]
    cands=[data]
    z=lz10(data) if data[:1]==b'\x10' else None
    if z: cands.append(z)
    for c in cands:
        # skip sjis 2-byte pairs roughly: find matches not preceded by lead byte
        for m in pat.finditer(c):
            i=m.start()
            if i>0 and (0x81<=c[i-1]<=0x9f or 0xe0<=c[i-1]<=0xfc): continue
            ch=[b for b in m.group() if 0xa1<=b<=0xdf][0]
            tot[ch]+=1; where[path]+=1
            ex.setdefault(path, c[max(0,i-20):i+20])
print({hex(k):v for k,v in sorted(tot.items())})
for p,n in where.most_common(40): print(n,p, ex[p])
