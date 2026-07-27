#!/usr/bin/env python3
"""Mirror every glyph in a 1bpp GBA font, in place, within its advance width.

This is the half of the RTL patch that is easy to forget. The cave sets the
hardware horizontal-flip bit on each tile, which mirrors the tile's *pixels*
as well as moving it. Pre-mirroring the font makes the two flips cancel, so
the letters end up both in the right order and the right way round.

Mirroring happens within each glyph's advance width rather than the full
16-pixel cell: a 6-pixel-wide letter mirrored across the whole cell lands
10 pixels away from where it belongs, which reads as ragged spacing rather
than an obvious bug, and is easy to misdiagnose as a kerning problem.

    python flip_glyphs.py rom.gba out.gba --font 0x8CE39F8 --widths 0x8D1CE78

Defaults are Mother 3's offsets (font: 256 glyphs, 0x20 bytes each, 16x16
1bpp; widths: one byte per glyph).
"""
import argparse

GLYPH_BYTES = 0x20  # 16 rows * 2 bytes
GLYPH_ROWS = 16
CELL_WIDTH = 16
ROM_BASE = 0x08000000


def to_file_offset(addr: int) -> int:
    return addr - ROM_BASE if addr >= ROM_BASE else addr


def reverse_low_bits(value: int, width: int) -> int:
    """Reverse the top `width` pixels of a 16-bit row, leaving the rest alone.

    Pixel 0 is the most significant bit, which is why this reverses the high
    end rather than the low end.
    """
    low = (value >> (CELL_WIDTH - width)) & ((1 << width) - 1)
    reversed_bits = 0
    for i in range(width):
        if (low >> i) & 1:
            reversed_bits |= 1 << (width - 1 - i)
    rest = value & ((1 << (CELL_WIDTH - width)) - 1)
    return ((reversed_bits << (CELL_WIDTH - width)) | rest) & 0xFFFF


def flip_font(rom: bytearray, font_off: int, widths_off: int, count: int) -> int:
    flipped = 0
    for code in range(count):
        width = rom[widths_off + code]
        if width == 0 or width > CELL_WIDTH:
            continue  # blank or malformed entry: nothing meaningful to mirror
        base = font_off + code * GLYPH_BYTES
        for row in range(GLYPH_ROWS):
            hi, lo = rom[base + row * 2], rom[base + row * 2 + 1]
            value = (hi << 8) | lo
            new = reverse_low_bits(value, width)
            rom[base + row * 2] = (new >> 8) & 0xFF
            rom[base + row * 2 + 1] = new & 0xFF
        flipped += 1
    return flipped


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rom_in")
    ap.add_argument("rom_out")
    ap.add_argument("--font", default="0x8CE39F8", help="glyph bitmap table address")
    ap.add_argument("--widths", default="0x8D1CE78", help="per-glyph advance width table address")
    ap.add_argument("--count", type=int, default=256, help="number of glyphs")
    args = ap.parse_args()

    rom = bytearray(open(args.rom_in, "rb").read())
    n = flip_font(rom, to_file_offset(int(args.font, 0)), to_file_offset(int(args.widths, 0)), args.count)
    open(args.rom_out, "wb").write(bytes(rom))
    print(f"mirrored {n} glyphs -> {args.rom_out}")
    print("Flipping twice restores the original, which is a quick way to check this ran correctly.")


if __name__ == "__main__":
    main()
