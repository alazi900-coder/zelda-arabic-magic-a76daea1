import sys, capstone
ram=open(sys.argv[1],'rb').read()
lo=int(sys.argv[2],16); hi=int(sys.argv[3],16); mode=sys.argv[4] if len(sys.argv)>4 else 'arm'
md=capstone.Cs(capstone.CS_ARCH_ARM, capstone.CS_MODE_THUMB if mode=='thumb' else capstone.CS_MODE_ARM)
code=ram[lo-0x02000000:hi-0x02000000]
for i in md.disasm(code, lo):
    print(f"{i.address:08X}: {i.bytes.hex():12s} {i.mnemonic} {i.op_str}")
