#!/usr/bin/env python3
"""Run a GBA ROM headless and report which BG tilemap rows the game writes.

This is the discovery step. Rather than reading megabytes of disassembly
looking for a text writer, let the game run and watch what it actually does
to VRAM: snapshot the BG screen-blocks each frame, diff them, and print the
rows that changed. The rows that fill up with a run of consecutive tile
indices when dialogue appears are the text rows, and their screen-block base
is the address the writer loads from its literal pool.

    python trace_tilemap.py game.gba --frames 600
    python trace_tilemap.py game.gba --frames 900 --savestate before_dialogue.ss
    python trace_tilemap.py game.gba --frames 300 --buttons A:120,A:180,START:240

Reaching a screen that shows text is the fiddly part; a savestate parked just
before a dialogue box is by far the most reliable option. Many games also
show text during the intro with no input at all, which is enough to find the
writer.
"""
import argparse
from collections import defaultdict

import mgba.core
import mgba.log

# The GBA maps BG screen-blocks (tilemaps) into the first 64 KiB of VRAM, in
# 2 KiB blocks. Anything above 0x06010000 is tile *pixel* data, not maps.
VRAM_BASE = 0x06000000
SCREENBLOCK_SPAN = 0x10000
ROW_BYTES = 64  # 32 tiles * 2 bytes


def parse_buttons(spec: str) -> dict:
    """"A:120,START:240" -> {120: "A", 240: "START"} (frame -> button)."""
    out = {}
    for part in filter(None, spec.split(",")):
        name, _, frame = part.partition(":")
        out[int(frame)] = name.strip().upper()
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rom")
    ap.add_argument("--frames", type=int, default=600)
    ap.add_argument("--savestate", help="load this savestate before tracing")
    ap.add_argument("--buttons", default="", help='e.g. "A:120,START:240" (button:frame)')
    ap.add_argument("--min-run", type=int, default=8,
                    help="ignore rows with fewer than this many consecutive tile indices")
    args = ap.parse_args()

    mgba.log.silence()
    core = mgba.core.load_path(args.rom)
    if core is None:
        raise SystemExit(f"mgba could not load {args.rom}")
    core.autoload_save()
    core.reset()

    if args.savestate:
        with open(args.savestate, "rb") as fh:
            core.load_state(fh.read())

    presses = parse_buttons(args.buttons)
    mem = core.memory
    previous = None
    # row address -> how many distinct frames it changed on
    changed = defaultdict(int)
    # row address -> the longest run of consecutive tile indices ever seen
    best_run = {}

    for frame in range(args.frames):
        if frame in presses:
            core.set_keys(getattr(core, "KEY_" + presses[frame], 0))
        elif frame - 1 in presses:
            core.clear_keys(0x3FF)
        core.run_frame()

        snapshot = bytes(mem.vram[0:SCREENBLOCK_SPAN])
        if previous is not None and snapshot != previous:
            for row_start in range(0, SCREENBLOCK_SPAN, ROW_BYTES):
                row = snapshot[row_start : row_start + ROW_BYTES]
                if row == previous[row_start : row_start + ROW_BYTES]:
                    continue
                changed[row_start] += 1
                tiles = [int.from_bytes(row[i : i + 2], "little") & 0x03FF for i in range(0, ROW_BYTES, 2)]
                run = longest_consecutive(tiles)
                best_run[row_start] = max(best_run.get(row_start, 0), run)
        previous = snapshot

    interesting = [
        (off, changed[off], best_run.get(off, 0))
        for off in sorted(changed)
        if best_run.get(off, 0) >= args.min_run
    ]
    if not interesting:
        print("No text-like rows found. The game probably never reached a screen with text —")
        print("try more frames, a savestate parked before dialogue, or --buttons.")
        return

    print(f"{'row address':>12}  {'block':>10}  {'row':>4}  {'frames':>7}  {'run':>4}")
    for off, frames, run in interesting:
        addr = VRAM_BASE + off
        block = VRAM_BASE + (off // 0x800) * 0x800
        print(f"  0x{addr:08X}  0x{block:08X}  {(off % 0x800) // ROW_BYTES:4}  {frames:7}  {run:4}")
    print()
    print("Rows sharing one 'block' value belong to the same BG layer; that block address")
    print("is what the writer loads from its literal pool. Feed it to inspect_rom.py's")
    print("output to confirm you have found the right routine.")


def longest_consecutive(tiles: list[int]) -> int:
    """Longest run of tile indices increasing by exactly 1.

    Text rows are written from a contiguous block of freshly-rendered glyph
    tiles, so they show up as a long ascending run; HUD and background rows
    reuse scattered tiles and do not.
    """
    best = run = 1
    for i in range(1, len(tiles)):
        run = run + 1 if tiles[i] == tiles[i - 1] + 1 else 1
        best = max(best, run)
    return best


if __name__ == "__main__":
    main()
