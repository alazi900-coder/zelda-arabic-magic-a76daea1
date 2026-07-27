---
name: gba-rtl-text-patch
description: Make a GBA game render its text right-to-left by patching the engine itself — locating the tilemap writer in a live emulator, injecting an assembled THUMB code cave that re-emits each row mirrored with the hardware H-flip bit, and pre-flipping the font glyphs so the two flips cancel. Use this whenever someone is translating a GBA ROM into Arabic, Hebrew, Farsi, or Urdu and needs the text direction reversed; whenever they ask how the Mother 3 RTL patch was found or built; whenever they want to reproduce that discovery on their own PC; or whenever RTL text in a GBA game renders backwards, mirrored, or in the wrong order. Also use it when someone needs to find where any GBA game writes its text tilemap, even if RTL is not the end goal.
---

# Right-to-left text in a GBA game by patching the engine

Most game engines draw text strictly left to right with no bidirectional
support. There are two ways to get Arabic reading correctly:

1. **Transform the text at build time** — shape letters into presentation
   forms and reverse the byte order, so naive LTR drawing produces correct
   RTL. No engine changes.
2. **Patch the engine** — make the renderer itself lay out right to left.

This skill covers **path 2 for the GBA**, which is what Mother 3 uses. Path 2
is worth the extra work when the engine draws through the GBA's tilemap
hardware, because the hardware already has a per-tile horizontal-flip bit —
you can reverse a whole row by rewriting 30 halfwords, without touching the
game's text encoding, line-breaking, or word-wrap logic at all. The stored
text stays in normal logical order, which keeps the editor, the translation
memory and any later re-extraction simple.

If the engine instead draws glyphs one at a time to a framebuffer, path 2 has
nothing to hook cheaply — use path 1 there.

## The counter-intuitive part: you must flip the glyphs too

This trips people up, so understand it before writing any code. Setting the
hardware H-flip bit on a tile mirrors **the tile's pixels**, not just its
position. So after you reverse a row of tiles and set H-flip on each one, the
letters are in the right order but every letter is drawn as its own mirror
image — `ب` comes out backwards.

The fix is to mirror each glyph **in the font data**, before it ever reaches
VRAM. Then the hardware flip un-mirrors it, and the two cancel: correct
order *and* correct letter shapes. Mirror within the glyph's own advance
width, not the full cell, or narrow letters drift to the wrong side of their
box.

`scripts/flip_glyphs.py` does this for 1bpp 16×16 glyphs; the project's
TypeScript equivalent is `flipGlyphsInPlace` in `src/lib/mother3/m3-rtl-patch.ts`.

## Toolchain (works on Windows, macOS and Linux)

```bash
pip install mgba keystone-engine capstone
```

- **mgba** — the emulator as a Python library. Runs the ROM headless, so you
  can step frames, read/write memory and dump the tilemap from a script. This
  is what makes the discovery step tractable; no GUI needed.
- **capstone** — disassembler. Turns ROM bytes into readable THUMB.
- **keystone-engine** — assembler. Turns your cave source into bytes.

On Windows install Python 3.10+ first; the three packages ship prebuilt
wheels, so nothing needs compiling. Nothing here needs a GUI emulator or a
real console — the whole loop (run the ROM, read VRAM, patch, re-run, check)
happens from the command line, which is what makes it scriptable and
repeatable on any machine.

Quick check that the toolchain is live:

```bash
python -c "import mgba.core, keystone, capstone; print('ready')"
python scripts/inspect_rom.py your.gba 0x089A4 --count 24
```

## Workflow

### 1. Find where the game writes the text tilemap

The goal is one address: the instruction that calls the routine which fills a
dialogue row. Two complementary approaches — use the trace first, fall back to
disassembly when the trace is noisy.

**Trace approach** (`scripts/trace_tilemap.py`): run the ROM headless, let it
reach a screen with text, and record every write into the BG screen-block
region of VRAM together with the PC that made it. The routine that writes many
consecutive halfwords into one 64-byte row is your text writer; the address
that `bl`s into it is your hook site.

Getting the game to a text screen is the fiddly part. Options, cheapest first:
- Load a save state placed right before dialogue (fastest, most reliable).
- Script the button presses to reach a known dialogue.
- Let the intro/attract mode run — many games show text without any input.

**Disassembly approach** (`scripts/inspect_rom.py`): if you already suspect a
region, disassemble around it and look for the shape of a tilemap writer —
a loop over ~30 iterations, halfword stores, and a PC-relative literal holding
a VRAM address in `0x06000000`–`0x06017FFF`.

Whichever route you take, confirm the candidate before building anything:
write a `bx lr` over the call and check the text disappears.

### 2. Understand the row layout

Before assembling a cave you need four numbers. Read them out of the game,
don't guess:

| What | Mother 3's value | How to get it |
|---|---|---|
| Screen-block base of the text layer | `0x06006000` | PC-relative literal used by the writer |
| Rows the dialogue occupies | 16–19 | dump the tilemap and see which rows change |
| Columns per row | 30 (of 32) | same dump — the last 2 columns stay blank |
| Tile-index base per row | `0x200 + (row-16)*32` | read the first tile of each row |

The pivot for mirroring is `columns - 1` (29 here). Get this wrong by one and
the whole line shifts a character sideways — an easy bug to miss because the
text still looks *almost* right.

### 3. Write and assemble the cave

The cave replaces the original `bl` at the hook site, so its first job is to
call the routine it displaced — otherwise the game stops drawing text at all.
Then it does its own pass:

```
push  {r0-r7, lr}
bl    <original target>        @ let the game draw the row normally first
for row in 16..19:
    addr = base + row*64
    if (tilemap[addr] & 0x03FF) != expected_base_for(row): continue   @ not a dialogue row
    attrs = tilemap[addr] & 0xF000                                    @ keep palette bits
    for col in 0..29:
        tile = expected_base_for(row) + (29 - col)                    @ mirrored index
        tilemap[addr + col*2] = tile | 0x0400 | attrs                 @ 0x0400 = H-flip
pop   {r0-r7, pc}
```

The guard on the first tile matters: without it the cave also mirrors rows
that happen to sit in the same range but hold menu or HUD tiles, and those
come out reversed and flipped on screen.

`scripts/build_cave.py` assembles this with keystone and writes both the cave
and the 4-byte `bl` hook into a ROM copy. Put the cave in genuinely unused
space — verify the region is all `0x00`/`0xFF` first; the script refuses
otherwise, because silently overwriting real data produces crashes far from
the patch that are miserable to trace back.

### 4. Verify before believing it

A patch that assembles cleanly can still do nothing. Check in this order:

1. `scripts/verify_rtl.py` — runs the patched ROM headless and dumps a
   dialogue row, asserting the H-flip bit is set and the tile indices descend.
   This catches "the cave never ran" and "the cave ran on the wrong rows".
2. Watch an actual screenshot. Order and shapes are both wrong in ways the
   tilemap dump can't show you — a glyph you forgot to pre-flip looks fine in
   hex and mirrored on screen.
3. Check a screen the patch should *not* touch (menus, the name-entry
   keyboard). Regressions show up there first.

## Applying this to a different GBA game

Everything above is generic except the four numbers in step 2 and the hook
address. The order to work in:

1. Find the writer (step 1) — expect this to take the longest.
2. Dump the tilemap and read off base, rows, columns, tile-index base.
3. Adjust the constants in `scripts/build_cave.py` and assemble.
4. Pre-flip the font with `scripts/flip_glyphs.py`, matching your font's bit
   depth and cell size.
5. Verify (step 4).

If the game uses a different BG layer for text, or 8bpp tiles, or a
tile-index base that isn't a simple `row` function, the cave's guard condition
is what needs rewriting — the mirroring loop itself stays the same.

## Reference

`references/mother3-case.md` — the full worked example: verified disassembly
of the shipped cave with every literal explained, the exact offsets, and the
integration points in this repository. Read it when you need the concrete
values or want to see what a finished cave looks like.
