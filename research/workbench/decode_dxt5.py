import struct
from PIL import Image

def decode_dxt5(data, width, height):
    img = Image.new("RGBA", (width, height))
    px = img.load()
    blocks_w = (width + 3) // 4
    blocks_h = (height + 3) // 4
    off = 0
    for by in range(blocks_h):
        for bx in range(blocks_w):
            block = data[off:off+16]
            off += 16
            alpha0, alpha1 = block[0], block[1]
            alpha_bits = int.from_bytes(block[2:8], "little")
            alphas = [alpha0, alpha1]
            if alpha0 > alpha1:
                for i in range(1, 7):
                    alphas.append(((7 - i) * alpha0 + i * alpha1) // 7)
            else:
                for i in range(1, 5):
                    alphas.append(((5 - i) * alpha0 + i * alpha1) // 5)
                alphas.append(0)
                alphas.append(255)

            c0, c1 = struct.unpack_from("<HH", block, 8)
            def to_rgb(c):
                r = (c >> 11) & 0x1f
                g = (c >> 5) & 0x3f
                b = c & 0x1f
                return (r << 3 | r >> 2, g << 2 | g >> 4, b << 3 | b >> 2)
            rgb0 = to_rgb(c0)
            rgb1 = to_rgb(c1)
            colors = [rgb0, rgb1]
            colors.append(tuple((2*rgb0[i] + rgb1[i]) // 3 for i in range(3)))
            colors.append(tuple((rgb0[i] + 2*rgb1[i]) // 3 for i in range(3)))

            color_bits = struct.unpack_from("<I", block, 12)[0]
            for py in range(4):
                for pxi in range(4):
                    pixel_index = by * 4 + py
                    pixel_x = bx * 4 + pxi
                    if pixel_x >= width or pixel_index >= height:
                        continue
                    shift = 2 * (py * 4 + pxi)
                    ci = (color_bits >> shift) & 0x3
                    r, g, b = colors[ci]
                    aidx_shift = 3 * (py * 4 + pxi)
                    ai = (alpha_bits >> aidx_shift) & 0x7
                    a = alphas[ai]
                    px[pixel_x, pixel_index] = (r, g, b, a)
    return img

if __name__ == "__main__":
    data = open("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/decompressed.bin", "rb").read()
    payload = data[4096:]
    img = decode_dxt5(payload, 1024, 1024)
    img.save("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/font_texture.png")
    print("saved", img.size)
