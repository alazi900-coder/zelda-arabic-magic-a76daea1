#!/usr/bin/env python3
"""Disassemble THUMB code in a GBA ROM and resolve PC-relative literals.

The literals are the point: a tilemap writer always loads its VRAM base and
its bit masks from a literal pool, so seeing 0x06006000 or 0x00000400
resolved next to the instruction that uses it is usually what identifies the
routine.

    python inspect_rom.py game.gba 0x089A4 --count 24 --before 12
    python inspect_rom.py game.gba 0x0C9BE8 --count 96
"""
import argparse
import struct

from capstone import CS_ARCH_ARM, CS_MODE_THUMB, Cs

ROM_BASE = 0x08000000


def to_file_offset(addr: int) -> int:
    """Accept either a file offset or an 0x08xxxxxx ROM address."""
    return addr - ROM_BASE if addr >= ROM_BASE else addr


def literal_for(rom: bytes, insn) -> str:
    """Resolve `ldr rN, [pc, #imm]` to the value it actually loads.

    THUMB's PC reads as (address of instruction + 4) rounded down to a
    multiple of 4 — getting this wrong is the classic way to misread a
    literal pool and chase the wrong VRAM address for an hour.
    """
    if not insn.mnemonic.startswith("ldr") or "[pc," not in insn.op_str.replace(" ", ""):
        return ""
    try:
        imm = int(insn.op_str.split("#")[-1].rstrip("]"), 0)
    except ValueError:
        return ""
    pool = ((insn.address + 4) & ~3) + imm
    off = to_file_offset(pool)
    if off + 4 > len(rom):
        return ""
    value = struct.unpack("<I", rom[off : off + 4])[0]
    note = ""
    if 0x06000000 <= value <= 0x06017FFF:
        note = "  <- VRAM (BG screen-block / tile data)"
    elif value == 0x0400:
        note = "  <- horizontal-flip bit"
    elif value == 0x03FF:
        note = "  <- tile-index mask"
    elif value == 0xF000:
        note = "  <- palette-bits mask"
    return f"      ; literal @0x{pool:08X} = 0x{value:08X}{note}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rom")
    ap.add_argument("address", help="file offset or 0x08xxxxxx ROM address")
    ap.add_argument("--count", type=int, default=64, help="bytes to disassemble")
    ap.add_argument("--before", type=int, default=0, help="bytes of context to include before the address")
    args = ap.parse_args()

    rom = open(args.rom, "rb").read()
    start = to_file_offset(int(args.address, 0)) - args.before
    if start < 0 or start >= len(rom):
        raise SystemExit(f"address out of range for a {len(rom)}-byte ROM")

    md = Cs(CS_ARCH_ARM, CS_MODE_THUMB)
    for insn in md.disasm(rom[start : start + args.count + args.before], ROM_BASE + start):
        print(f"  {insn.address:08X}  {insn.bytes.hex():<10} {insn.mnemonic}\t{insn.op_str}")
        lit = literal_for(rom, insn)
        if lit:
            print(lit)


if __name__ == "__main__":
    main()
