# Worked example: Mother 3 (English fan translation v1.1)

Every value here was read back out of a real patched ROM and the disassembly
verified with capstone, so it can be trusted as ground truth when adapting the
method to another game.

## The numbers

| What | Value |
|---|---|
| Hook site (the `bl` that gets redirected) | `0x080089A4` |
| Routine the hook originally called | `0x08008BAC` |
| Code cave | `0x080C9BE8`, 100 bytes including the literal pool |
| Text layer screen-block base | `0x06006000` |
| Dialogue rows | 16–19 |
| Columns per row | 30 (of the 32 the hardware provides) |
| Tile-index base for a row | `0x200 + (row - 16) * 32` |
| Mirror pivot | 29 (`columns - 1`) |
| Font glyph table | `0x08CE39F8` — 256 glyphs, `0x20` bytes each, 1bpp 16×16 |
| Glyph width table | `0x08D1CE78` — one byte per glyph |

Reproducing the patch:

```bash
python scripts/build_cave.py clean.gba patched.gba     # defaults are these values
python scripts/flip_glyphs.py patched.gba final.gba
python scripts/verify_rtl.py final.gba --savestate dialogue.ss
```

`build_cave.py` with these defaults emits a cave whose instruction sequence
and hook bytes (`c1 f0 20 f9`) match the shipped patch exactly.

## The cave, disassembled and explained

```
080C9BE8  ffb5        push {r0-r7, lr}
080C9BEA  3ef7dfff    bl   #0x8008bac      ; the call the hook displaced - run it FIRST
080C9BEE  1027        movs r7, #0x10       ; row = 16
080C9BF0  142f        cmp  r7, #0x14       ; while row < 20
080C9BF2  21d2        bhs  #0x80c9c38
080C9BF4  b801        lsls r0, r7, #6      ; row * 64 bytes
080C9BF6  114d        ldr  r5, [pc, #0x44] ; literal 0x06006000 = screen-block base
080C9BF8  2d18        adds r5, r5, r0      ; r5 = address of this row
080C9BFA  2888        ldrh r0, [r5]
080C9BFC  1049        ldr  r1, [pc, #0x40] ; literal 0x000003FF = tile-index mask
080C9BFE  0840        ands r0, r1          ; r0 = first tile index on the row
080C9C00  3946        mov  r1, r7
080C9C02  1039        subs r1, #0x10
080C9C04  4901        lsls r1, r1, #5      ; (row - 16) * 32
080C9C06  8022        movs r2, #0x80
080C9C08  9200        lsls r2, r2, #2      ; 0x200
080C9C0A  5218        adds r2, r2, r1      ; r2 = expected base tile for this row
080C9C0C  9042        cmp  r0, r2
080C9C0E  11d1        bne  #0x80c9c34      ; guard: not a dialogue row, skip it
080C9C10  2888        ldrh r0, [r5]
080C9C12  0c49        ldr  r1, [pc, #0x30] ; literal 0x0000F000 = palette bits
080C9C14  0840        ands r0, r1          ; r0 = palette bits to preserve
080C9C16  0023        movs r3, #0          ; col = 0
080C9C18  1e2b        cmp  r3, #0x1e       ; while col < 30
080C9C1A  0bd2        bhs  #0x80c9c34
080C9C1C  1d24        movs r4, #0x1d       ; 29
080C9C1E  e41a        subs r4, r4, r3      ; 29 - col  <- the pivot
080C9C20  08d4        bmi  #0x80c9c34
080C9C22  a418        adds r4, r4, r2      ; mirrored tile index
080C9C24  084e        ldr  r6, [pc, #0x20] ; literal 0x00000400 = H-flip bit
080C9C26  3443        orrs r4, r6
080C9C28  0443        orrs r4, r0          ; restore palette bits
080C9C2A  5e00        lsls r6, r3, #1
080C9C2C  7619        adds r6, r6, r5
080C9C2E  3480        strh r4, [r6]        ; write tilemap[col]
080C9C30  5b1c        adds r3, r3, #1
080C9C32  f1e7        b    #0x80c9c18
080C9C34  7f1c        adds r7, r7, #1
080C9C36  dbe7        b    #0x80c9bf0
080C9C38  ffbd        pop  {r0-r7, pc}
080C9C3A  00bf        nop                  ; align the literal pool to 4 bytes

080C9C3C  06006000    ; screen-block base
080C9C40  000003FF    ; tile-index mask
080C9C44  0000F000    ; palette-bits mask
080C9C48  00000400    ; horizontal-flip bit
```

Three details worth carrying to another game:

- **Call the displaced routine first.** The cave replaces a `bl`, so if it
  does not call `0x08008BAC` itself the game stops drawing text entirely.
- **The row guard is load-bearing.** Without the `cmp r0, r2` check the cave
  also mirrors any non-dialogue row that happens to live in rows 16–19, and
  those render reversed and flipped.
- **Preserve the palette bits.** Rewriting the whole halfword without the
  `0xF000` bits changes the text colour, which looks like a palette bug and
  sends you looking in the wrong place.

## How the hook site was found

The tilemap writer was located by running the ROM headless under mGBA's
Python bindings and watching which VRAM screen-block rows changed when a
dialogue box appeared — the text rows stand out because they fill with a run
of consecutive tile indices, while HUD and background rows reuse scattered
tiles. `scripts/trace_tilemap.py` implements that. Disassembling around the
writer with capstone (`scripts/inspect_rom.py`) then showed the `bl` at
`0x080089A4` as the last call before the row was complete, which makes it the
right place to run a post-pass.

## Where this lives in this repository

- `src/lib/mother3/m3-rtl-patch.ts` — ships the assembled cave and hook as
  hex constants, applies them at build time (`applyRtlPatch`), and contains
  the TypeScript port of the glyph mirroring (`flipGlyphsInPlace`).
- `src/lib/mother3/m3-arabic-font.ts` — the Arabic font and width tables, plus
  the offsets they are written to.
- `src/lib/mother3/m3-editor-bridge.ts` — `installArabicFontAndRtl` ties the
  two together: mirror the glyphs, write font and widths, apply the patch.

The stored script text stays in normal logical order throughout; nothing in
the text pipeline knows about RTL, which is the whole benefit of patching the
engine instead of transforming the text.

## When not to use this approach

Metroid Prime Remastered, Risen and Xenoblade in this same repository all take
the opposite route — shape the text into presentation forms and reverse it at
build time, leaving the engine alone. That is the better choice when the
engine does not draw through a tilemap (so there is no cheap flip bit to
exploit), when you cannot find safe free space for a cave, or when the text
renderer is shared with systems you would rather not disturb. See
`src/lib/metroid-prime/mp-arabic-shaper.ts` for that pattern.
