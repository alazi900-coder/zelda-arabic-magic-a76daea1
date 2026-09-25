import pickle, struct
files = pickle.load(open("files.pkl","rb"))
d = open("Inazuma Eleven (Europe) [Undub].nds","rb").read()
def grab(n):
    for p,fid,sz,s,e in files:
        if p == n: return d[s:e]
    raise KeyError(n)

def lz10(b):
    assert b[0] == 0x10, hex(b[0])
    size = b[1] | (b[2] << 8) | (b[3] << 16)
    out = bytearray(); p = 4
    while len(out) < size:
        flags = b[p]; p += 1
        for i in range(8):
            if len(out) >= size: break
            if flags & (0x80 >> i):
                v = (b[p] << 8) | b[p+1]; p += 2
                n = (v >> 12) + 3
                disp = (v & 0xFFF) + 1
                for _ in range(n):
                    out.append(out[len(out) - disp])
            else:
                out.append(b[p]); p += 1
    return bytes(out)

def entries(pkh):
    n = struct.unpack("<H", pkh[0x14:0x16])[0]
    base = 0x30
    out = []
    for i in range(n):
        o = base + i*12
        eid, off, size = struct.unpack("<3I", pkh[o:o+12])
        out.append((eid, off, size))
    return out

pkh = grab("/data_iz/script/en/evet.pkh")
pkb = grab("/data_iz/script/en/evet.pkb")
ents = entries(pkh)
print("evet entries:", len(ents), "last:", ents[-1], "pkb size:", len(pkb))
comp = sum(1 for _,o,s in ents if s >= 4 and pkb[o] == 0x10)
print("entries starting with LZ10 header:", comp, "/", len(ents))
raw = lz10(pkb[ents[0][1]: ents[0][1]+ents[0][2]])
print("entry0 decompressed:", len(raw))
print(raw[:160].hex(" "))
print(repr(raw[:300]))
