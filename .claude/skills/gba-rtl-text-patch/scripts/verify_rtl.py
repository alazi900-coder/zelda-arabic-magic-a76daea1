#!/usr/bin/env python3
"""Run a patched ROM headless and check the text rows really came out mirrored.

A cave that assembles cleanly can still do nothing: the hook may sit on a call
that never fires on the screen you are looking at, or the row guard may reject
every row. This reads the tilemap straight out of the emulator and reports
what the cave actually did, which separates "the patch is wrong" from "the
font is wrong" long before you start squinting at screenshots.

    python verify_rtl.py patched.gba --frames 600
    python verify_rtl.py patched.gba --savestate dialogue.ss --rows 16:20

A row is reported as mirrored when its tile indices *descend* and the H-flip
bit is set on them. Both must hold: descending indices alone means the order
was reversed but the glyphs will render mirrored, and the flip bit alone means
the glyphs are readable but the reading order is still left to right.
"""
import argparse

import mgba.core
import mgba.log

VRAM_BASE = 0x06000000
ROW_BYTES = 64
HFLIP_BIT = 0x0400
TILE_MASK = 0x03FF


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rom")
    ap.add_argument("--frames", type=int, default=600)
    ap.add_argument("--savestate")
    ap.add_argument("--tilemap", default="0x06006000")
    ap.add_argument("--rows", default="16:20")
    ap.add_argument("--cols", type=int, default=30)
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

    for _ in range(args.frames):
        core.run_frame()

    base = int(args.tilemap, 0) - VRAM_BASE
    start, stop = (int(x, 0) for x in args.rows.split(":"))
    vram = bytes(core.memory.vram[0:0x10000])

    any_mirrored = False
    for row in range(start, stop):
        off = base + row * ROW_BYTES
        entries = [int.from_bytes(vram[off + i * 2 : off + i * 2 + 2], "little") for i in range(args.cols)]
        tiles = [e & TILE_MASK for e in entries]
        flipped = sum(1 for e in entries if e & HFLIP_BIT)
        descending = sum(1 for i in range(1, len(tiles)) if tiles[i] == tiles[i - 1] - 1)

        verdict = "mirrored" if flipped == args.cols and descending >= args.cols - 2 else (
            "flip bit set but order not reversed" if flipped else
            "order reversed but flip bit missing" if descending >= args.cols - 2 else
            "untouched"
        )
        any_mirrored |= verdict == "mirrored"
        print(f"row {row:2}: h-flip on {flipped:2}/{args.cols}, descending {descending:2}/{args.cols - 1}  -> {verdict}")
        print(f"         first tiles: {tiles[:8]}")

    print()
    if any_mirrored:
        print("The cave is running. If text still looks wrong on screen, the font glyphs")
        print("are the remaining suspect - run flip_glyphs.py.")
    else:
        print("No mirrored row found. Either the screen shown at this frame has no dialogue")
        print("(use --savestate), or the hook never fires, or the row guard rejects these rows.")
        print("Check the guard first: dump a row and compare its first tile against the")
        print("expected base the cave computes.")


if __name__ == "__main__":
    main()
