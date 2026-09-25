def lz_decompress(d: bytes) -> bytes:
    t = d[0]
    if t == 0x10: return _lz10(d)
    if t == 0x11: return _lz11(d)
    raise ValueError(f"نوع غير مدعوم 0x{t:02x}")

def _size(d):
    n = d[1] | (d[2] << 8) | (d[3] << 16)
    return (n, 4) if n else (int.from_bytes(d[4:8], "little"), 8)

def _lz10(d):
    size, p = _size(d); out = bytearray()
    while len(out) < size:
        flags = d[p]; p += 1
        for b in range(8):
            if len(out) >= size: break
            if not (flags & (0x80 >> b)):
                out.append(d[p]); p += 1
            else:
                v = (d[p] << 8) | d[p+1]; p += 2
                ln = (v >> 12) + 3; disp = (v & 0xFFF) + 1
                for _ in range(ln): out.append(out[-disp])
    return bytes(out)

def _lz11(d):
    size, p = _size(d); out = bytearray()
    while len(out) < size:
        flags = d[p]; p += 1
        for b in range(8):
            if len(out) >= size: break
            if not (flags & (0x80 >> b)):
                out.append(d[p]); p += 1
            else:
                a = d[p]; ind = a >> 4
                if ind == 0:
                    ln = (a << 4 | d[p+1] >> 4) + 0x11
                    disp = ((d[p+1] & 0xF) << 8 | d[p+2]) + 1; p += 3
                elif ind == 1:
                    ln = ((a & 0xF) << 12 | d[p+1] << 4 | d[p+2] >> 4) + 0x111
                    disp = ((d[p+2] & 0xF) << 8 | d[p+3]) + 1; p += 4
                else:
                    ln = ind + 1
                    disp = ((a & 0xF) << 8 | d[p+1]) + 1; p += 2
                for _ in range(ln): out.append(out[-disp])
    return bytes(out)
