import re, base64, struct, os

TS = open('/home/user/zelda-arabic-magic-a76daea1/src/lib/inazuma/inazuma-arabic-glyphs.ts').read()
def arr(name):
    m = re.search(name + r'[^=]*=\s*\[([^\]]*)\]', TS)
    return [int(x.strip(), 0) for x in m.group(1).split(',')]
def b64(name):
    m = re.search(name + r'\s*=\s*"([^"]*)"', TS)
    return base64.b64decode(m.group(1))

IDX = arr('INAZUMA_GLYPH_INDICES')
G12, W12 = b64('INAZUMA_FONT12_GLYPHS_B64'), arr('INAZUMA_FONT12_WIDTHS')
G8,  W8  = b64('INAZUMA_FONT8_GLYPHS_B64'),  arr('INAZUMA_FONT8_WIDTHS')
print('slots:', len(IDX), '| font12 bytes:', len(G12), '| font8 bytes:', len(G8))

def patch(src, dst, glyphs, widths, tb):
    b = bytearray(open(src,'rb').read())
    p = struct.unpack('<H', b[0x0C:0x0E])[0]
    plgc = hdwc = -1
    while p < len(b)-8:
        kind = bytes(b[p:p+4]); size = struct.unpack('<I', b[p+4:p+8])[0]
        if size == 0: break
        if kind == b'PLGC':
            got = struct.unpack('<H', b[p+10:p+12])[0]
            assert got == tb, f'{src}: tileBytes {got} != {tb}'
            plgc = p+16
        if kind == b'HDWC': hdwc = p+16
        p += size
    assert plgc>0 and hdwc>0
    for i, g in enumerate(IDX):
        b[plgc+g*tb : plgc+(g+1)*tb] = glyphs[i*tb:(i+1)*tb]
        w = widths[i]
        b[hdwc+g*3] = 0; b[hdwc+g*3+1] = w; b[hdwc+g*3+2] = w
    open(dst,'wb').write(bytes(b))
    print('wrote', dst, os.path.getsize(dst), 'bytes')

os.makedirs('fontfiles_ar', exist_ok=True)
patch('fontfiles/FONT12.NFTR',  'fontfiles_ar/FONT12.NFTR',  G12, W12, 17)
patch('fontfiles/FONT12N.NFTR', 'fontfiles_ar/FONT12N.NFTR', G12, W12, 17)
patch('fontfiles/FONT8.NFTR',   'fontfiles_ar/FONT8.NFTR',   G8,  W8,  7)
