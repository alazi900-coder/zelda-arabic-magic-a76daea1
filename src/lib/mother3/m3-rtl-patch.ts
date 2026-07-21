/**
 * Right-to-left rendering patch for Mother 3, verified in-emulator.
 *
 * Two parts, both applied at build time:
 *  1) A code cave (assembled THUMB) hooked after the dialogue tilemap writer
 *     (bl at 0x080089A4) that re-emits each dialogue row mirrored horizontally,
 *     setting the GBA hardware h-flip bit per tile. This reverses the reading
 *     flow to RTL.
 *  2) Because the tilemap mirror also flips each glyph, the font glyphs are
 *     themselves flipped (within their advance width) so the two flips cancel
 *     and the glyph shapes read correctly. `flipGlyphsInPlace` does that to the
 *     Arabic font before insertion.
 *
 * The cave/hook bytes were pre-assembled (keystone, ARM THUMB-1) so no
 * assembler is needed in the browser. Pivot P=29 within the 30-column dialogue
 * row. See build_flip2 in the scratchpad for the source assembly.
 */

const CAVE_HEX =
  "ffb53ef7dfff1027142f21d2b801114d2d18288810490840394610394901802292005218904211d128880c49084000231e2b0bd21d24e41a08d4a418084e344304435e00761934805b1cf1e77f1cdbe7ffbd00bf00600006ff03000000f0000000040000";
const HOOK_HEX = "c1f020f9";

export const RTL_CAVE_OFFSET = 0x0c9be8;
export const RTL_HOOK_OFFSET = 0x089a4;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** Write the RTL cave + hook into a ROM copy (mutates `rom`). */
export function applyRtlPatch(rom: Uint8Array): void {
  const cave = hexToBytes(CAVE_HEX);
  const hook = hexToBytes(HOOK_HEX);
  rom.set(cave, RTL_CAVE_OFFSET);
  rom.set(hook, RTL_HOOK_OFFSET);
}

/** Reverse the low `width` pixels of one 16-bit glyph row (MSB = pixel 0). */
function revLow(value: number, width: number): number {
  const low = (value >>> (16 - width)) & ((1 << width) - 1);
  let r = 0;
  for (let i = 0; i < width; i++) if ((low >>> i) & 1) r |= 1 << (width - 1 - i);
  const rest = value & ((1 << (16 - width)) - 1);
  return ((r << (16 - width)) | rest) & 0xffff;
}

/**
 * Horizontally mirror every glyph in `font` (256 * 0x20 bytes, 1bpp 16x16)
 * within its advance width from `widths`, so the RTL tilemap h-flip cancels out
 * and glyph shapes read correctly. Mutates `font`.
 */
export function flipGlyphsInPlace(font: Uint8Array, widths: Uint8Array): void {
  for (let code = 0; code < 256; code++) {
    const w = widths[code];
    if (w === 0 || w > 16) continue;
    const go = code * 0x20;
    for (let row = 0; row < 16; row++) {
      const b0 = font[go + row * 2];
      const b1 = font[go + row * 2 + 1];
      let val = 0;
      for (let x = 0; x < 16; x++) {
        const bit = x < 8 ? (b0 >>> (7 - x)) & 1 : (b1 >>> (15 - x)) & 1;
        val = (val << 1) | bit;
      }
      const nv = revLow(val, w);
      font[go + row * 2] = (nv >>> 8) & 0xff;
      font[go + row * 2 + 1] = nv & 0xff;
    }
  }
}
