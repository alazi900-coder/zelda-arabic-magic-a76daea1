import struct, os, sys, collections

ROM = "Inazuma Eleven (Europe) [Undub].nds"
d = open(ROM, "rb").read()
h = d[:0x200]
fnt_off, fnt_size, fat_off, fat_size = struct.unpack("<4I", h[0x40:0x50])

fat = []
for i in range(fat_size // 8):
    s, e = struct.unpack("<2I", d[fat_off + i*8: fat_off + i*8 + 8])
    fat.append((s, e))

def dir_entry(idx):
    o = fnt_off + idx * 8
    sub, first, parent = struct.unpack("<IHH", d[o:o+8])
    return sub, first, parent

files = []  # (path, fileid, size)
def walk(dir_id, path):
    sub, first, parent = dir_entry(dir_id & 0xFFF)
    p = fnt_off + sub
    fid = first
    while True:
        t = d[p]; p += 1
        if t == 0: break
        length = t & 0x7F
        name = d[p:p+length].decode("ascii", "replace"); p += length
        if t & 0x80:
            sdid = struct.unpack("<H", d[p:p+2])[0]; p += 2
            walk(sdid, path + "/" + name)
        else:
            s, e = fat[fid]
            files.append((path + "/" + name, fid, e - s, s, e))
            fid += 1

walk(0, "")
print("total files:", len(files))
ext = collections.Counter()
size = collections.Counter()
for path, fid, sz, s, e in files:
    x = os.path.splitext(path)[1].lower() or "(none)"
    ext[x] += 1; size[x] += sz
print("\n%-12s %6s %12s" % ("ext", "count", "bytes"))
for x, c in ext.most_common(30):
    print("%-12s %6d %12d" % (x, c, size[x]))

print("\ntop-level dirs:")
top = collections.Counter()
for path, fid, sz, s, e in files:
    parts = path.strip("/").split("/")
    top["/".join(parts[:2]) if len(parts) > 1 else parts[0]] += 1
for k, v in top.most_common(40):
    print("  %-40s %5d" % (k, v))

import pickle
pickle.dump(files, open("files.pkl", "wb"))
