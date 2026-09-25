"""Small NFTR reader/writer for the Inazuma fonts: blocks, CMAP, glyph pixels, widths."""
import struct

def blocks(b):
    p, r = 0x10, {}
    while p < len(b) - 8:
        k = bytes(b[p:p+4]).decode("latin1"); s = struct.unpack_from("<I", b, p + 4)[0]
        if not s: break
        r.setdefault(k, []).append(p); p += s
    return r

def cmap(b):
    """char code -> glyph index, walking every PAMC block."""
    out = {}
    for p in blocks(b)["PAMC"]:
        first, last, typ = struct.unpack_from("<HHH", b, p + 8)
        d = p + 20
        if typ == 0:
            base = struct.unpack_from("<H", b, d)[0]
            for c in range(first, last + 1): out[c] = base + (c - first)
        elif typ == 1:
            for i, c in enumerate(range(first, last + 1)):
                g = struct.unpack_from("<H", b, d + i * 2)[0]
                if g != 0xFFFF: out[c] = g
        else:
            n = struct.unpack_from("<H", b, d)[0]
            for i in range(n):
                c, g = struct.unpack_from("<HH", b, d + 2 + i * 4); out[c] = g
    return out

class Font:
    def __init__(self, data):
        self.b = bytearray(data); bl = blocks(self.b)
        pl = bl["PLGC"][0]; self.cw, self.ch = self.b[pl + 8], self.b[pl + 9]
        self.tb = struct.unpack_from("<H", self.b, pl + 10)[0]; self.depth = self.b[pl + 14]
        self.pix = pl + 16; self.hd = bl["HDWC"][0] + 16
    def get(self, g):
        d, m, off = self.depth, (1 << self.depth) - 1, self.pix + g * self.tb
        return [[(self.b[off + (((y*self.cw+x)*d) >> 3)] >> (8 - d - (((y*self.cw+x)*d) & 7))) & m
                 for x in range(self.cw)] for y in range(self.ch)]
    def put(self, g, px):
        d, off = self.depth, self.pix + g * self.tb
        for i in range(self.tb): self.b[off + i] = 0
        for y in range(self.ch):
            for x in range(self.cw):
                v = px[y][x] if y < len(px) and x < len(px[y]) else 0
                bit = (y * self.cw + x) * d
                self.b[off + (bit >> 3)] |= v << (8 - d - (bit & 7))
    def width(self, g): return tuple(self.b[self.hd + g*3: self.hd + g*3 + 3])
    def set_width(self, g, w): self.b[self.hd + g*3: self.hd + g*3 + 3] = bytes(w)

def shadowed(px11):
    """FONT12's 1bpp 11x12 glyph as FONT12T draws it: ink = 1, and the pixel to
    the right of any ink that is not itself ink = 2, in a 12-wide cell."""
    h = len(px11); out = [[0] * 12 for _ in range(h)]
    for y in range(h):
        for x in range(11):
            if px11[y][x]: out[y][x] = 1
        for x in range(12):
            if not out[y][x] and x > 0 and px11[y][x - 1]: out[y][x] = 2
    return out
