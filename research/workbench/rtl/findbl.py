import sys, struct
ram=open(sys.argv[1],'rb').read()
targets=[int(t,16) for t in sys.argv[2:]]
for off in range(0, min(len(ram), 0x400000)-4, 4):
    w=struct.unpack_from('<I',ram,off)[0]
    if (w>>24)&0x0f in (0x0b,) and (w>>28)!=0xf:
        imm=w&0xffffff
        if imm&0x800000: imm-=0x1000000
        addr=0x02000000+off
        dest=addr+8+imm*4
        if dest in targets: print(hex(addr),'-> ',hex(dest))
