/**
 * Standalone DXT1/DXT3/DXT5 (BC1/BC2/BC3) block-compression codec for the
 * Risen 1 images tool. Deliberately self-contained — no imports from any
 * Xenoblade module (wilay-parser.ts / wifnt-parser.ts / bc7-*.ts) — so this
 * feature stays fully isolated and deletable with zero impact elsewhere.
 *
 * Confirmed against real Risen 1 .ximg samples: numbers.ximg (128x16, DXT3)
 * and hint02.ximg (2048x1024, DXT1). DXT5 support is included defensively
 * for any achievement icons that may use interpolated alpha, per spec.
 *
 * Quality bar matches the existing WILAY tool's "Simple" encoders — naive
 * min/max-endpoint quantization, good enough for round-tripping loading-hint
 * screens, not a production-grade compressor.
 */

export type DxtFourCC = "DXT1" | "DXT3" | "DXT5";

const DXT_FOURCCS: readonly string[] = ["DXT1", "DXT3", "DXT5"];
export function isDxtFourCC(v: string): v is DxtFourCC {
  return DXT_FOURCCS.includes(v);
}

function rgb565ToRgb(c: number): [number, number, number] {
  const r = (c >> 11) & 0x1f;
  const g = (c >> 5) & 0x3f;
  const b = c & 0x1f;
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
}

function rgbToRgb565(r: number, g: number, b: number): number {
  return (((r >> 3) & 0x1f) << 11) | (((g >> 2) & 0x3f) << 5) | ((b >> 3) & 0x1f);
}

/** Decode the shared 8-byte DXT1-style color block. `forceFourColor` skips the
 * 1-bit-alpha 3-color mode (used by DXT3/DXT5, whose alpha is stored separately). */
function decodeColorBlock(
  data: Uint8Array,
  blockOffset: number,
  forceFourColor: boolean
): { colors: [number, number, number][]; indices: Uint8Array } {
  const c0 = data[blockOffset] | (data[blockOffset + 1] << 8);
  const c1 = data[blockOffset + 2] | (data[blockOffset + 3] << 8);
  const rgb0 = rgb565ToRgb(c0);
  const rgb1 = rgb565ToRgb(c1);
  const colors: [number, number, number][] = [rgb0, rgb1, [0, 0, 0], [0, 0, 0]];

  if (forceFourColor || c0 > c1) {
    colors[2] = [
      Math.round((2 * rgb0[0] + rgb1[0]) / 3),
      Math.round((2 * rgb0[1] + rgb1[1]) / 3),
      Math.round((2 * rgb0[2] + rgb1[2]) / 3),
    ];
    colors[3] = [
      Math.round((rgb0[0] + 2 * rgb1[0]) / 3),
      Math.round((rgb0[1] + 2 * rgb1[1]) / 3),
      Math.round((rgb0[2] + 2 * rgb1[2]) / 3),
    ];
  } else {
    colors[2] = [
      Math.round((rgb0[0] + rgb1[0]) / 2),
      Math.round((rgb0[1] + rgb1[1]) / 2),
      Math.round((rgb0[2] + rgb1[2]) / 2),
    ];
    colors[3] = [0, 0, 0]; // transparent black — caller zeroes alpha for this index
  }

  const indexBits =
    data[blockOffset + 4] |
    (data[blockOffset + 5] << 8) |
    (data[blockOffset + 6] << 16) |
    (data[blockOffset + 7] << 24);
  const indices = new Uint8Array(16);
  for (let i = 0; i < 16; i++) indices[i] = (indexBits >> (i * 2)) & 0x3;

  return { colors, indices };
}

function forEachBlock(
  width: number,
  height: number,
  cb: (bx: number, by: number, blockIndex: number) => void
): void {
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  let blockIndex = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      cb(bx, by, blockIndex);
      blockIndex++;
    }
  }
}

function writePixel(
  out: Uint8Array,
  width: number,
  height: number,
  bx: number,
  by: number,
  localIndex: number,
  rgb: [number, number, number],
  alpha: number
): void {
  const px = bx * 4 + (localIndex % 4);
  const py = by * 4 + Math.floor(localIndex / 4);
  if (px >= width || py >= height) return;
  const o = (py * width + px) * 4;
  out[o] = rgb[0];
  out[o + 1] = rgb[1];
  out[o + 2] = rgb[2];
  out[o + 3] = alpha;
}

export function decodeDXT1(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  forEachBlock(width, height, (bx, by, blockIndex) => {
    const blockOffset = blockIndex * 8;
    if (blockOffset + 8 > data.length) return;
    const c0 = data[blockOffset] | (data[blockOffset + 1] << 8);
    const c1 = data[blockOffset + 2] | (data[blockOffset + 3] << 8);
    const { colors, indices } = decodeColorBlock(data, blockOffset, false);
    const isPunchThrough = c0 <= c1;
    for (let i = 0; i < 16; i++) {
      const idx = indices[i];
      const alpha = isPunchThrough && idx === 3 ? 0 : 255;
      writePixel(out, width, height, bx, by, i, colors[idx], alpha);
    }
  });
  return out;
}

export function decodeDXT3(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  forEachBlock(width, height, (bx, by, blockIndex) => {
    const blockOffset = blockIndex * 16;
    if (blockOffset + 16 > data.length) return;
    const alphaBytes = data.subarray(blockOffset, blockOffset + 8);
    const { colors, indices } = decodeColorBlock(data, blockOffset + 8, true);
    for (let i = 0; i < 16; i++) {
      const nibble = (alphaBytes[Math.floor(i / 2)] >> ((i % 2) * 4)) & 0xf;
      const alpha = (nibble << 4) | nibble;
      writePixel(out, width, height, bx, by, i, colors[indices[i]], alpha);
    }
  });
  return out;
}

export function decodeDXT5(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  forEachBlock(width, height, (bx, by, blockIndex) => {
    const blockOffset = blockIndex * 16;
    if (blockOffset + 16 > data.length) return;
    const a0 = data[blockOffset];
    const a1 = data[blockOffset + 1];
    const alphaTable = [a0, a1];
    if (a0 > a1) {
      for (let i = 1; i <= 6; i++) alphaTable.push(Math.round(((7 - i) * a0 + i * a1) / 7));
    } else {
      for (let i = 1; i <= 4; i++) alphaTable.push(Math.round(((5 - i) * a0 + i * a1) / 5));
      alphaTable.push(0);
      alphaTable.push(255);
    }
    let bits = 0n;
    for (let i = 0; i < 6; i++) bits |= BigInt(data[blockOffset + 2 + i]) << BigInt(i * 8);
    const alphaIndices = new Uint8Array(16);
    for (let i = 0; i < 16; i++) alphaIndices[i] = Number((bits >> BigInt(i * 3)) & 0x7n);

    const { colors, indices } = decodeColorBlock(data, blockOffset + 8, true);
    for (let i = 0; i < 16; i++) {
      writePixel(out, width, height, bx, by, i, colors[indices[i]], alphaTable[alphaIndices[i]]);
    }
  });
  return out;
}

export function decodeDxt(fourCC: DxtFourCC, data: Uint8Array, width: number, height: number): Uint8Array {
  if (fourCC === "DXT1") return decodeDXT1(data, width, height);
  if (fourCC === "DXT3") return decodeDXT3(data, width, height);
  return decodeDXT5(data, width, height);
}

// ============================================================================
// Encoding — naive min/max endpoint quantizers, matching WILAY's "Simple" bar
// ============================================================================

/** Picks block endpoints from the bounding box of the 16 pixels, forces
 * color0 != color1 (numerically ordered so the four-color branch is taken
 * consistently regardless of decoder mode) and assigns each pixel to its
 * nearest of the 4 interpolated colors. Returns the 8-byte color block. */
function encodeColorBlock(rgba: Uint8Array, width: number, bx: number, by: number): Uint8Array {
  let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0;
  const pixels: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const px = bx * 4 + (i % 4);
    const py = by * 4 + Math.floor(i / 4);
    const o = (py * width + px) * 4;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    pixels.push([r, g, b]);
    minR = Math.min(minR, r); minG = Math.min(minG, g); minB = Math.min(minB, b);
    maxR = Math.max(maxR, r); maxG = Math.max(maxG, g); maxB = Math.max(maxB, b);
  }

  let c0 = rgbToRgb565(maxR, maxG, maxB);
  let c1 = rgbToRgb565(minR, minG, minB);
  if (c0 <= c1) {
    // Force ordering so decoders always take the 4-color interpolation branch.
    if (c0 === 0) c0 = 1; else c1 = c0 - 1;
  }

  const ref0 = rgb565ToRgb(c0);
  const ref1 = rgb565ToRgb(c1);
  const ref2: [number, number, number] = [
    Math.round((2 * ref0[0] + ref1[0]) / 3),
    Math.round((2 * ref0[1] + ref1[1]) / 3),
    Math.round((2 * ref0[2] + ref1[2]) / 3),
  ];
  const ref3: [number, number, number] = [
    Math.round((ref0[0] + 2 * ref1[0]) / 3),
    Math.round((ref0[1] + 2 * ref1[1]) / 3),
    Math.round((ref0[2] + 2 * ref1[2]) / 3),
  ];
  const refs = [ref0, ref1, ref2, ref3];

  let indexBits = 0;
  for (let i = 0; i < 16; i++) {
    const [r, g, b] = pixels[i];
    let best = 0, bestDist = Infinity;
    for (let k = 0; k < 4; k++) {
      const dr = r - refs[k][0], dg = g - refs[k][1], db = b - refs[k][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) { bestDist = dist; best = k; }
    }
    indexBits |= best << (i * 2);
  }

  const block = new Uint8Array(8);
  block[0] = c0 & 0xff; block[1] = (c0 >> 8) & 0xff;
  block[2] = c1 & 0xff; block[3] = (c1 >> 8) & 0xff;
  block[4] = indexBits & 0xff;
  block[5] = (indexBits >> 8) & 0xff;
  block[6] = (indexBits >> 16) & 0xff;
  block[7] = (indexBits >> 24) & 0xff;
  return block;
}

export function encodeDXT1(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const out = new Uint8Array(blocksX * blocksY * 8);
  let o = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      out.set(encodeColorBlock(rgba, width, bx, by), o);
      o += 8;
    }
  }
  return out;
}

export function encodeDXT3(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const out = new Uint8Array(blocksX * blocksY * 16);
  let o = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const alphaBytes = new Uint8Array(8);
      for (let i = 0; i < 16; i++) {
        const px = bx * 4 + (i % 4);
        const py = by * 4 + Math.floor(i / 4);
        const alpha = rgba[(py * width + px) * 4 + 3];
        const nibble = alpha >> 4;
        alphaBytes[Math.floor(i / 2)] |= nibble << ((i % 2) * 4);
      }
      out.set(alphaBytes, o);
      out.set(encodeColorBlock(rgba, width, bx, by), o + 8);
      o += 16;
    }
  }
  return out;
}

export function encodeDXT5(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const out = new Uint8Array(blocksX * blocksY * 16);
  let o = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      let minA = 255, maxA = 0;
      const alphas: number[] = [];
      for (let i = 0; i < 16; i++) {
        const px = bx * 4 + (i % 4);
        const py = by * 4 + Math.floor(i / 4);
        const a = rgba[(py * width + px) * 4 + 3];
        alphas.push(a);
        minA = Math.min(minA, a); maxA = Math.max(maxA, a);
      }
      const a0 = maxA, a1 = minA; // a0 > a1 (or equal) -> 8-level interpolation mode
      const table = [a0, a1];
      for (let i = 1; i <= 6; i++) table.push(Math.round(((7 - i) * a0 + i * a1) / 7));

      let bits = 0n;
      for (let i = 0; i < 16; i++) {
        let best = 0, bestDist = Infinity;
        for (let k = 0; k < 8; k++) {
          const d = Math.abs(alphas[i] - table[k]);
          if (d < bestDist) { bestDist = d; best = k; }
        }
        bits |= BigInt(best) << BigInt(i * 3);
      }
      const alphaBytes = new Uint8Array(8);
      alphaBytes[0] = a0; alphaBytes[1] = a1;
      for (let i = 0; i < 6; i++) alphaBytes[2 + i] = Number((bits >> BigInt(i * 8)) & 0xffn);

      out.set(alphaBytes, o);
      out.set(encodeColorBlock(rgba, width, bx, by), o + 8);
      o += 16;
    }
  }
  return out;
}

export function encodeDxt(fourCC: DxtFourCC, rgba: Uint8Array, width: number, height: number): Uint8Array {
  if (fourCC === "DXT1") return encodeDXT1(rgba, width, height);
  if (fourCC === "DXT3") return encodeDXT3(rgba, width, height);
  return encodeDXT5(rgba, width, height);
}
