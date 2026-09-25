import struct
exec(open('/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fs.py').read().split('walk(0, "")')[0].replace('ROM = "Inazuma Eleven (Europe) [Undub].nds"','ROM = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/Inazuma Eleven (Europe) [Undub].nds"')); walk(0,"")
def get(name):
    for path,fid,sz,s,e in files:
        if path.endswith(name): return d[s:e]
def show(b, w=96, n=4, off=0):
    for r in range(n):
        rec=b[off+r*w:off+(r+1)*w]
        print('%5x'%(off+r*w), rec.hex(' '))
        print('     ', ''.join(chr(c) if 32<=c<127 else '.' for c in rec))
