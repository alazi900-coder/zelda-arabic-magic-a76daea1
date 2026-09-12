/**
 * PICA200 (3DS GPU) texture encoding — just enough to write a new RGBA8
 * texture into a CMB: 8×8-pixel tiles, Morton/Z-order within each tile,
 * ABGR byte order per pixel (so a little-endian u32 read gives 0xRRGGBBAA).
 *
 * Ported from noclip.website's decoder (MIT-licensed, this session's
 * reference for the whole CMB format):
 * https://github.com/magcius/noclip.website/blob/master/src/Common/CTR/pica_texture.ts
 * — this file mirrors its `decodeTexture_Tiled` traversal and RGBA8 byte
 * order exactly, just writing instead of reading, so a texture this module
 * produces round-trips through that decoder's `decodeTexture_RGBA8`.
 */

export const GL_FORMAT_RGBA8 = 0x14016752;

/** 3-bit interleave used for the 8x8 tile's Z-order walk: 0b0a0b0c -> 0b000abc */
function morton7(n: number): number {
  return ((n >>> 2) & 0x04) | ((n >>> 1) & 0x02) | (n & 0x01);
}

/** width/height must each be a multiple of 8 (every real PICA200 texture is,
 * since the tile size is fixed at 8x8). `rgba` is a plain top-to-bottom,
 * left-to-right RGBA buffer (e.g. straight out of a canvas's ImageData). */
export function encodeRgba8Tiled(width: number, height: number, rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  if (width % 8 !== 0 || height % 8 !== 0) {
    throw new Error(`أبعاد النسيج يجب أن تكون من مضاعفات ٨ (وصل ${width}×${height})`);
  }
  const out = new Uint8Array(width * height * 4);
  let dstOffs = 0;
  for (let yy = 0; yy < height; yy += 8) {
    for (let xx = 0; xx < width; xx += 8) {
      for (let i = 0; i < 0x40; i++) {
        const x = morton7(i);
        const y = morton7(i >>> 1);
        const srcOffs = ((yy + y) * width + (xx + x)) * 4;
        // File order is A,B,G,R (so decodeTexture_RGBA8's little-endian u32
        // read yields R in the high byte, A in the low byte).
        out[dstOffs + 0] = rgba[srcOffs + 3]; // A
        out[dstOffs + 1] = rgba[srcOffs + 2]; // B
        out[dstOffs + 2] = rgba[srcOffs + 1]; // G
        out[dstOffs + 3] = rgba[srcOffs + 0]; // R
        dstOffs += 4;
      }
    }
  }
  return out;
}

/** Inverse of `encodeRgba8Tiled`, kept alongside it for tests and for
 * previewing an existing RGBA8 texture (e.g. before overwriting one). */
export function decodeRgba8Tiled(width: number, height: number, data: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  let srcOffs = 0;
  for (let yy = 0; yy < height; yy += 8) {
    for (let xx = 0; xx < width; xx += 8) {
      for (let i = 0; i < 0x40; i++) {
        const x = morton7(i);
        const y = morton7(i >>> 1);
        const dstOffs = ((yy + y) * width + (xx + x)) * 4;
        out[dstOffs + 3] = data[srcOffs + 0]; // A
        out[dstOffs + 2] = data[srcOffs + 1]; // B
        out[dstOffs + 1] = data[srcOffs + 2]; // G
        out[dstOffs + 0] = data[srcOffs + 3]; // R
        srcOffs += 4;
      }
    }
  }
  return out;
}
