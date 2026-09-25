import pickle, struct
files = pickle.load(open("files.pkl","rb"))
d = open("Inazuma Eleven (Europe) [Undub].nds","rb").read()
def grab(name):
    for p,fid,sz,s,e in files:
        if p == name: return d[s:e]
    raise KeyError(name)

def parse(name):
    b = grab(name)
    magic = b[:4]
    print("===", name, len(b), "magic=", magic)
    nblocks = struct.unpack("<H", b[0x0E:0x10])[0]
    off = struct.unpack("<I", b[0x0C:0x10])[0] & 0xFFFF
    p = struct.unpack("<H", b[0x0C:0x0E])[0]
    print("  header size=%d  blocks=%d" % (p, nblocks))
    cmaps = []
    while p < len(b) - 8:
        kind = b[p:p+4]
        size = struct.unpack("<I", b[p+4:p+8])[0]
        if size == 0 or kind[0] == 0: break
        print("   block %-6s at 0x%-6X size=%d" % (kind.decode('ascii','replace'), p, size))
        if kind == b"RLGP":  # PLGC reversed
            tile_w, tile_h, tile_len, _, depth, rot = struct.unpack("<BBHHBB", b[p+8:p+16])
            n = (size - 16) // tile_len
            print("      glyph %dx%d  bytes/glyph=%d depth=%d  glyphs=%d" % (tile_w, tile_h, tile_len, depth, n))
        if kind == b"CMAP":
            first, last, typ, _, nxt = struct.unpack("<HHIHI", b[p+8:p+22][:14] + b"\x00\x00")[:5] if False else (0,0,0,0,0)
        if kind == b"PAMC":
            first, last, typ = struct.unpack("<HHI", b[p+8:p+16])
            nxt = struct.unpack("<I", b[p+16:p+20])[0]
            cmaps.append((first, last, typ, p, size))
            print("      CMAP U+%04X..U+%04X type=%d" % (first, last, typ))
        p += size
    return cmaps

for n in ["/data_iz/font/FONT12.NFTR", "/data_iz/font/FONT12T.NFTR", "/data_iz/font/FONT8.NFTR", "/data_iz/font/FONT12N.NFTR"]:
    parse(n); print()
