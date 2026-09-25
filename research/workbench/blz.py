import struct
def blz_decode(data: bytes) -> bytes:
    data = bytearray(data); n = len(data)
    inc = struct.unpack_from("<I", data, n-4)[0]
    if inc == 0: return bytes(data)
    hdr = data[n-5]
    enc = struct.unpack_from("<I", data, n-8)[0] & 0xFFFFFF
    dec_len = n + inc
    out = bytearray(dec_len)
    head = n - enc
    out[:head] = data[:head]
    pak = n - hdr; raw = dec_len; end = head
    mask = 0; flags = 0
    while pak > end and raw > head:
        mask >>= 1
        if mask == 0:
            pak -= 1; flags = data[pak]; mask = 0x80
        if not (flags & mask):
            pak -= 1; raw -= 1; out[raw] = data[pak]
        else:
            pak -= 1; hi = data[pak]; pak -= 1; lo = data[pak]
            pos = (hi << 8) | lo
            length = (pos >> 12) + 3; pos = (pos & 0xFFF) + 3
            for _ in range(length):
                raw -= 1; out[raw] = out[raw + pos]
    return bytes(out)
