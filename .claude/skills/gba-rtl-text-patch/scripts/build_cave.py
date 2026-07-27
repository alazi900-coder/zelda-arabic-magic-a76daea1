#!/usr/bin/env python3
"""Assemble the RTL mirroring code cave and hook it into a GBA ROM.

The cave runs right after the game's own tilemap writer, walks the text rows,
and rewrites each one in reverse with the hardware horizontal-flip bit set.
Because the flip also mirrors each tile's pixels, the font glyphs must be
pre-flipped as well (see flip_glyphs.py) — otherwise the letters come out
backwards even though their order is right.

    python build_cave.py in.gba out.gba \\
        --hook 0x089A4 --cave 0x0C9BE8 \\
        --tilemap 0x06006000 --rows 16:20 --cols 30 --tile-base 0x200 --row-stride 32

Defaults are Mother 3's values, so a bare run reproduces that patch. For a
different game, read every number off the ROM first (trace_tilemap.py finds
the tilemap base and rows; inspect_rom.py confirms the hook).
"""
import argparse
import struct

from keystone import KS_ARCH_ARM, KS_MODE_THUMB, Ks

ROM_BASE = 0x08000000


def to_file_offset(addr: int) -> int:
    return addr - ROM_BASE if addr >= ROM_BASE else addr


def build_source(orig_target: int, rows: range, cols: int,
                 tile_base: int, row_stride: int) -> str:
    """Emit THUMB for the cave.

    Registers stay in r0-r7 because THUMB-1 can only reach those in most
    data-processing instructions. The four constants are loaded pc-relative
    from a pool appended after the code; they are emitted here as
    `ldr rX, [pc, #0]` and their real offsets are patched in by `assemble`
    once the code length is known, since keystone does not manage pools.

    Kept strictly ASCII: keystone encodes its input as ASCII and rejects
    anything else, so a stray typographic dash in a comment fails the build.
    """
    if tile_base % 4 or (tile_base >> 2) > 0xFF:
        raise SystemExit(f"tile-base 0x{tile_base:X} cannot be built with movs+lsls #2")
    if row_stride & (row_stride - 1):
        raise SystemExit(f"row-stride {row_stride} must be a power of two")
    return f"""
    push   {{r0-r7, lr}}
    bl     #{orig_target:#x}
    movs   r7, #{rows.start}
row_loop:
    cmp    r7, #{rows.stop}
    bhs    done
    lsls   r0, r7, #6
    ldr    r5, [pc, #0]
    adds   r5, r5, r0
    ldrh   r0, [r5]
    ldr    r1, [pc, #0]
    ands   r0, r1
    mov    r1, r7
    subs   r1, #{rows.start}
    lsls   r1, r1, #{row_stride.bit_length() - 1}
    movs   r2, #{tile_base >> 2}
    lsls   r2, r2, #2
    adds   r2, r2, r1
    cmp    r0, r2
    bne    next_row
    ldrh   r0, [r5]
    ldr    r1, [pc, #0]
    ands   r0, r1
    movs   r3, #0
col_loop:
    cmp    r3, #{cols}
    bhs    next_row
    movs   r4, #{cols - 1}
    subs   r4, r4, r3
    bmi    next_row
    adds   r4, r4, r2
    ldr    r6, [pc, #0]
    orrs   r4, r6
    orrs   r4, r0
    lsls   r6, r3, #1
    adds   r6, r6, r5
    strh   r4, [r6]
    adds   r3, r3, #1
    b      col_loop
next_row:
    adds   r7, r7, #1
    b      row_loop
done:
    pop    {{r0-r7, pc}}
"""


def assemble(source: str, cave_addr: int, literals: list[int]) -> bytes:
    """Assemble the cave and append the literal pool its loads point at.

    Every `ldr rX, [pc, #0]` in the source is a placeholder; they are matched
    to `literals` in order and their immediates rewritten once the code size
    (and therefore the pool address) is known.
    """
    ks = Ks(KS_ARCH_ARM, KS_MODE_THUMB)
    encoded, _ = ks.asm(source, cave_addr)
    out = bytearray(encoded)

    # Pool must be 4-byte aligned relative to the cave for pc-relative loads.
    while (cave_addr + len(out)) % 4:
        out += b"\x00\xbf"  # nop
    pool_addr = cave_addr + len(out)

    slot = 0
    for i in range(0, len(out) - 1, 2):
        halfword = out[i] | (out[i + 1] << 8)
        if (halfword & 0xF800) == 0x4800 and (halfword & 0x00FF) == 0:  # ldr rX, [pc, #0]
            if slot >= len(literals):
                raise SystemExit("more pc-relative loads than literals to fill them")
            pc = ((cave_addr + i) + 4) & ~3
            imm = (pool_addr + slot * 4 - pc) // 4
            if not 0 <= imm <= 0xFF:
                raise SystemExit("literal pool out of pc-relative range - cave is too long")
            out[i] = imm
            slot += 1
    if slot != len(literals):
        raise SystemExit(f"expected {len(literals)} pc-relative loads, found {slot}")

    for value in literals:
        out += struct.pack("<I", value)
    return bytes(out)


def encode_bl(src: int, dst: int) -> bytes:
    """THUMB-1 long branch-with-link: two halfwords, offset relative to pc+4."""
    offset = dst - (src + 4)
    if not -(1 << 22) <= offset < (1 << 22):
        raise SystemExit("hook and cave are too far apart for a THUMB bl")
    high = 0xF000 | ((offset >> 12) & 0x07FF)
    low = 0xF800 | ((offset >> 1) & 0x07FF)
    return struct.pack("<HH", high, low)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rom_in")
    ap.add_argument("rom_out")
    ap.add_argument("--hook", default="0x089A4", help="address of the bl to redirect")
    ap.add_argument("--cave", default="0x0C9BE8", help="where to place the cave (must be free space)")
    ap.add_argument("--tilemap", default="0x06006000", help="BG screen-block base of the text layer")
    ap.add_argument("--rows", default="16:20", help="text rows, start:stop (stop exclusive)")
    ap.add_argument("--cols", type=int, default=30)
    ap.add_argument("--tile-base", default="0x200", help="tile index of the first row's first tile")
    ap.add_argument("--row-stride", type=int, default=32, help="tile indices consumed per row")
    ap.add_argument("--force", action="store_true", help="write the cave even if the space is not blank")
    args = ap.parse_args()

    rom = bytearray(open(args.rom_in, "rb").read())
    hook = int(args.hook, 0)
    cave = int(args.cave, 0)
    hook_off, cave_off = to_file_offset(hook), to_file_offset(cave)
    # Normalise to ROM addresses: bl offsets and pc-relative loads are both
    # computed in the 0x08xxxxxx space the CPU sees, not in file offsets.
    hook_addr, cave_addr = ROM_BASE + hook_off, ROM_BASE + cave_off
    start, stop = (int(x, 0) for x in args.rows.split(":"))

    # The original bl's target has to be preserved — the cave calls it first,
    # otherwise the game simply stops drawing text.
    hw1, hw2 = struct.unpack("<HH", bytes(rom[hook_off : hook_off + 4]))
    if (hw1 & 0xF800) != 0xF000 or (hw2 & 0xF800) != 0xF800:
        raise SystemExit(f"0x{hook_addr:08X} is not a THUMB bl — check the hook address")
    offset = (((hw1 & 0x07FF) << 12) | ((hw2 & 0x07FF) << 1))
    if offset & (1 << 22):
        offset -= 1 << 23
    orig_target = hook_addr + 4 + offset
    print(f"hook 0x{hook_addr:08X} currently calls 0x{orig_target:08X}")

    source = build_source(orig_target, range(start, stop), args.cols,
                          int(args.tile_base, 0), args.row_stride)
    literals = [int(args.tilemap, 0), 0x03FF, 0xF000, 0x0400]
    cave_bytes = assemble(source, cave_addr, literals)
    print(f"cave assembled: {len(cave_bytes)} bytes")

    region = bytes(rom[cave_off : cave_off + len(cave_bytes)])
    if region.strip(b"\x00") and region.strip(b"\xff") and not args.force:
        raise SystemExit(
            f"0x{cave_addr:08X} is not blank — pick genuinely free space, or pass --force if you\n"
            "are certain. Overwriting live data causes crashes far from the patch."
        )

    rom[cave_off : cave_off + len(cave_bytes)] = cave_bytes
    rom[hook_off : hook_off + 4] = encode_bl(hook_addr, cave_addr)
    open(args.rom_out, "wb").write(bytes(rom))
    print(f"wrote {args.rom_out}")
    print("Next: pre-flip the font glyphs (flip_glyphs.py), then verify (verify_rtl.py).")


if __name__ == "__main__":
    main()
