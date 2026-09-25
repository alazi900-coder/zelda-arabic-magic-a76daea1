import struct, os, pickle

ROM = "Inazuma Eleven (Europe) [Undub].nds"
d = open(ROM, "rb").read()
h = d[:0x200]
fnt_off, fnt_size, fat_off, fat_size = struct.unpack("<4I", h[0x40:0x50])
fat = [struct.unpack("<2I", d[fat_off+i*8: fat_off+i*8+8]) for i in range(fat_size//8)]

def dir_entry(idx):
    o = fnt_off + idx*8
    return struct.unpack("<IHH", d[o:o+8])

files = []
def walk(dir_id, path):
    sub, first, parent = dir_entry(dir_id & 0xFFF)
    p = fnt_off + sub
    fid = first
    while True:
        t = d[p]; p += 1
        if t == 0: break
        L = t & 0x7F
        name = d[p:p+L].decode("ascii","replace"); p += L
        if t & 0x80:
            sdid = struct.unpack("<H", d[p:p+2])[0]; p += 2
            walk(sdid, path + "/" + name)
        else:
            s,e = fat[fid]
            files.append((path+"/"+name, fid, e-s, s, e))
            fid += 1
walk(0, "")

os.makedirs("fontfiles", exist_ok=True)
for path, fid, sz, s, e in files:
    if "/font/" in path.lower() or path.lower().endswith(".nftr"):
        print("%-50s id=%-5d size=%d" % (path, fid, sz))
        name = os.path.basename(path)
        open("fontfiles/"+name, "wb").write(d[s:e])
