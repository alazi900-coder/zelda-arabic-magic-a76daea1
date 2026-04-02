/**
 * Complete BC7 (BPTC) texture decoder supporting all modes 0-7.
 * Based on the Microsoft BC7 format specification.
 */

// ── Mode parameters ──────────────────────────────────────────────────
// [numSubsets, partitionBits, rotationBits, indexSelectionBit, colorBits, alphaBits, endpointPBits, sharedPBits, indexBits, secondaryIndexBits]
const MODE_INFO: number[][] = [
  /* 0 */ [3, 4, 0, 0, 4, 0, 1, 0, 3, 0],
  /* 1 */ [2, 6, 0, 0, 6, 0, 0, 1, 3, 0],
  /* 2 */ [3, 6, 0, 0, 5, 0, 0, 0, 2, 0],
  /* 3 */ [2, 6, 0, 0, 7, 0, 1, 0, 2, 0],
  /* 4 */ [1, 0, 2, 1, 5, 6, 0, 0, 2, 3],
  /* 5 */ [1, 0, 2, 0, 7, 8, 0, 0, 2, 2],
  /* 6 */ [1, 0, 0, 0, 7, 7, 1, 0, 4, 0],
  /* 7 */ [2, 6, 0, 0, 5, 5, 1, 0, 2, 0],
];

// ── Interpolation weights ────────────────────────────────────────────
const WEIGHTS2 = [0, 21, 43, 64];
const WEIGHTS3 = [0, 9, 18, 27, 37, 46, 55, 64];
const WEIGHTS4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];

function getWeights(bits: number): number[] {
  if (bits === 2) return WEIGHTS2;
  if (bits === 3) return WEIGHTS3;
  return WEIGHTS4;
}

// ── Partition tables ─────────────────────────────────────────────────
// 2-subset partition table (64 entries, 16 pixels each → subset index 0 or 1)
const P2: number[][] = [
  [0,0,1,1,0,0,1,1,0,0,1,1,0,0,1,1],[0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1],
  [0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1],[0,0,0,1,0,0,1,1,0,0,1,1,0,1,1,1],
  [0,0,0,0,0,0,0,1,0,0,0,1,0,0,1,1],[0,0,1,1,0,1,1,1,0,1,1,1,1,1,1,1],
  [0,0,0,1,0,0,1,1,0,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,1,0,0,1,1,0,1,1,1],
  [0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,1],[0,0,1,1,0,1,1,1,1,1,1,1,1,1,1,1],
  [0,0,0,0,0,0,0,1,0,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0,0,1,0,1,1,1],
  [0,0,0,1,0,1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1],
  [0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1],
  [0,0,0,0,1,0,0,0,1,1,1,0,1,1,1,1],[0,1,1,1,0,0,0,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,0,0,0,1,1,1,0],[0,1,1,1,0,0,1,1,0,0,0,1,0,0,0,0],
  [0,0,1,1,0,0,0,1,0,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,0,1,1,0,0,1,1,1,0],
  [0,0,0,0,0,0,0,0,1,0,0,0,1,1,0,0],[0,1,1,1,0,0,1,1,0,0,1,1,0,0,0,1],
  [0,0,1,1,0,0,0,1,0,0,0,1,0,0,0,0],[0,0,0,0,0,0,0,0,1,1,0,0,1,1,1,0],
  [0,1,1,0,0,1,1,0,0,1,1,0,0,1,1,0],[0,0,1,1,0,1,1,0,0,1,1,0,1,1,0,0],
  [0,0,0,1,0,1,1,1,1,1,1,0,1,0,0,0],[0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
  [0,1,1,1,0,0,0,1,1,0,0,0,1,1,1,0],[0,0,1,1,1,0,0,1,1,0,0,1,1,1,0,0],
  [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],[0,0,0,0,1,1,1,1,0,0,0,0,1,1,1,1],
  [0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0],[0,0,1,1,0,0,1,1,1,1,0,0,1,1,0,0],
  [0,0,1,1,1,1,0,0,0,0,1,1,1,1,0,0],[0,1,0,1,0,1,0,1,1,0,1,0,1,0,1,0],
  [0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1],[0,1,0,1,1,0,1,0,1,0,1,0,0,1,0,1],
  [0,1,1,1,0,0,1,1,1,1,0,0,1,1,1,0],[0,0,0,1,0,0,1,1,1,1,0,0,1,0,0,0],
  [0,0,1,1,0,0,1,0,0,1,0,0,1,1,0,0],[0,0,1,1,1,0,1,1,1,1,0,1,1,1,0,0],
  [0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0],[0,0,1,1,1,1,0,0,1,1,0,0,0,0,1,1],
  [0,1,1,0,0,1,1,0,1,0,0,1,1,0,0,1],[0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0],
  [0,1,0,0,1,1,1,0,0,1,0,0,0,0,0,0],[0,0,1,0,0,1,1,1,0,0,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,1,1,1,0,0,1,0],[0,0,0,0,0,1,0,0,1,1,1,0,0,1,0,0],
  [0,1,1,0,1,1,0,0,1,0,0,1,0,0,1,1],[0,0,1,1,0,1,1,0,1,1,0,0,1,0,0,1],
  [0,1,1,0,0,0,1,1,1,0,0,1,1,1,0,0],[0,0,1,1,1,0,0,1,1,1,0,0,0,1,1,0],
  [0,1,1,0,1,1,0,0,1,1,0,0,1,0,0,1],[0,1,1,0,0,0,1,1,0,0,1,1,1,0,0,1],
  [0,1,1,1,1,1,1,0,1,0,0,0,0,0,0,1],[0,0,0,1,1,0,0,0,1,1,1,0,0,1,1,1],
  [0,0,0,0,1,1,1,1,0,0,1,1,0,0,1,1],[0,0,1,1,0,0,1,1,1,1,1,1,0,0,0,0],
  [0,0,1,0,0,0,1,0,1,1,1,0,1,1,1,0],[0,1,0,0,0,1,0,0,0,1,1,1,0,1,1,1],
];

// 3-subset partition table (64 entries)
const P3: number[][] = [
  [0,0,1,1,0,0,1,1,0,2,2,1,2,2,2,2],[0,0,0,1,0,0,1,1,2,2,1,1,2,2,2,1],
  [0,0,0,0,2,0,0,1,2,2,1,1,2,2,1,1],[0,2,2,2,0,0,2,2,0,0,1,1,0,1,1,1],
  [0,0,0,0,0,0,0,0,1,1,2,2,1,1,2,2],[0,0,1,1,0,0,1,1,0,0,2,2,0,0,2,2],
  [0,0,2,2,0,0,2,2,1,1,1,1,1,1,1,1],[0,0,1,1,0,0,1,1,2,2,1,1,2,2,1,1],
  [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2],[0,0,0,0,1,1,1,1,1,1,1,1,2,2,2,2],
  [0,0,0,0,1,1,1,1,2,2,2,2,2,2,2,2],[0,0,1,2,0,0,1,2,0,0,1,2,0,0,1,2],
  [0,1,1,2,0,1,1,2,0,1,1,2,0,1,1,2],[0,1,2,2,0,1,2,2,0,1,2,2,0,1,2,2],
  [0,0,1,1,0,1,1,2,1,1,2,2,1,2,2,2],[0,0,1,1,2,0,0,1,2,2,0,0,2,2,2,0],
  [0,0,0,1,0,0,1,1,0,1,1,2,1,1,2,2],[0,1,1,1,0,0,1,1,2,0,0,1,2,2,0,0],
  [0,0,0,0,1,1,2,2,1,1,2,2,1,1,2,2],[0,0,2,2,0,0,2,2,0,0,2,2,1,1,1,1],
  [0,1,1,1,0,1,1,1,0,2,2,2,0,2,2,2],[0,0,0,1,0,0,0,1,2,2,2,1,2,2,2,1],
  [0,0,0,0,0,0,1,1,0,1,2,2,0,1,2,2],[0,0,0,0,1,1,0,0,2,2,1,0,2,2,1,0],
  [0,1,2,2,0,1,2,2,0,0,1,1,0,0,0,0],[0,0,1,2,0,0,1,2,1,1,2,2,2,2,2,2],
  [0,1,1,0,1,2,2,1,1,2,2,1,0,1,1,0],[0,0,0,0,0,1,1,0,1,2,2,1,1,2,2,1],
  [0,0,2,2,1,1,0,2,1,1,0,2,0,0,2,2],[0,1,1,0,0,1,1,0,2,0,0,2,2,2,2,2],
  [0,0,1,1,0,1,2,2,0,1,2,2,0,0,1,1],[0,0,0,0,2,0,0,0,2,2,1,1,2,2,2,1],
  [0,0,0,0,0,0,0,2,1,1,2,2,1,2,2,2],[0,2,2,2,0,0,2,2,0,0,1,2,0,0,1,1],
  [0,0,1,1,0,0,1,2,0,0,2,2,0,2,2,2],[0,1,2,0,0,1,2,0,0,1,2,0,0,1,2,0],
  [0,0,0,0,1,1,1,1,2,2,2,2,0,0,0,0],[0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0],
  [0,1,2,0,2,0,1,2,1,2,0,1,0,1,2,0],[0,0,1,1,2,2,0,0,1,1,2,2,0,0,1,1],
  [0,0,1,1,1,1,2,2,2,2,0,0,0,0,1,1],[0,1,0,1,0,1,0,1,2,2,2,2,2,2,2,2],
  [0,0,0,0,0,0,0,0,2,1,2,1,2,1,2,1],[0,0,2,2,1,1,2,2,0,0,2,2,1,1,2,2],
  [0,0,2,2,0,0,1,1,0,0,2,2,0,0,1,1],[0,2,2,0,1,2,2,1,0,2,2,0,1,2,2,1],
  [0,1,0,1,2,2,2,2,2,2,2,2,0,1,0,1],[0,0,0,0,2,1,2,1,2,1,2,1,2,1,2,1],
  [0,1,0,1,0,1,0,1,0,1,0,1,2,2,2,2],[0,2,2,2,0,1,1,1,0,2,2,2,0,1,1,1],
  [0,0,0,2,1,1,1,2,0,0,0,2,1,1,1,2],[0,0,0,0,2,1,1,2,2,1,1,2,2,1,1,2],
  [0,2,2,2,0,1,1,1,0,1,1,1,0,2,2,2],[0,0,0,2,1,1,1,2,1,1,1,2,0,0,0,2],
  [0,1,1,0,0,1,1,0,0,1,1,0,2,2,2,2],[0,0,0,0,0,0,0,0,2,1,1,2,2,1,1,2],
  [0,1,1,0,0,1,1,0,2,2,2,2,2,2,2,2],[0,0,2,2,0,0,1,1,0,0,1,1,0,0,2,2],
  [0,0,2,2,1,1,2,2,1,1,2,2,0,0,2,2],[0,0,0,0,0,0,0,0,0,0,0,0,2,1,1,2],
  [0,0,0,2,0,0,0,1,0,0,0,2,0,0,0,1],[0,2,2,2,1,2,2,2,0,2,2,2,1,2,2,2],
  [0,1,0,1,2,2,2,2,2,2,2,2,2,2,2,2],[0,1,1,1,2,0,1,1,2,2,0,1,2,2,2,0],
];

// Anchor index for second subset in 2-subset partitions
const ANCHOR2_1: number[] = [
  15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,
  15, 2, 8, 2, 2, 8, 8,15, 2, 8, 2, 2, 8, 8, 2, 2,
  15,15, 6, 8, 2, 8,15,15, 2, 8, 2, 2, 2,15,15, 6,
   6, 2, 6, 8,15,15, 2, 2,15,15,15,15,15, 2, 2,15,
];

// Anchor index for second subset in 3-subset partitions
const ANCHOR3_1: number[] = [
   3, 3,15,15, 8, 3,15,15, 8, 8, 6, 6, 6, 5, 3, 3,
   3, 3, 8,15, 3, 3, 6,10, 5, 8, 8, 6, 8, 5,15,15,
   8,15, 3, 5, 6,10, 8,15,15, 3,15, 5,15,15,15,15,
   3,15, 5, 5, 5, 8, 5,10, 5,10, 8,13,15,12, 3, 3,
];

// Anchor index for third subset in 3-subset partitions
const ANCHOR3_2: number[] = [
  15, 8, 8, 3,15,15, 3, 8,15,15,15,15,15,15,15, 8,
  15, 8,15, 3,15, 8,15, 8, 3,15, 6,10,15,15,10, 8,
  15, 3,15,10,10, 8, 9,10, 6,15, 8,15, 3, 6, 6, 8,
  15, 3,15,15,15,15,15,15,15,15,15,15, 3,15,15, 8,
];

// ── Bit reader ───────────────────────────────────────────────────────
class BitReader {
  private data: Uint8Array;
  pos = 0;
  constructor(data: Uint8Array, offset: number) {
    this.data = new Uint8Array(data.buffer, data.byteOffset + offset, 16);
  }
  read(n: number): number {
    let val = 0;
    for (let i = 0; i < n; i++) {
      const byteI = this.pos >> 3;
      const bitI = this.pos & 7;
      val |= ((this.data[byteI] >> bitI) & 1) << i;
      this.pos++;
    }
    return val;
  }
}

// ── Unquantize endpoint ──────────────────────────────────────────────
function unquantize(val: number, bits: number): number {
  if (bits >= 8) return val;
  if (val === 0) return 0;
  if (val === (1 << bits) - 1) return 255;
  return ((val << 8) + 128) >> bits;
}

// ── Interpolate ──────────────────────────────────────────────────────
function interpolate(e0: number, e1: number, index: number, indexBits: number): number {
  const w = getWeights(indexBits);
  const weight = w[index];
  return ((64 - weight) * e0 + weight * e1 + 32) >> 6;
}

// ── Main block decoder ───────────────────────────────────────────────
function decodeBC7Block(data: Uint8Array, off: number): [number, number, number, number][] {
  const b0 = data[off];
  let mode = -1;
  for (let m = 0; m < 8; m++) {
    if (b0 & (1 << m)) { mode = m; break; }
  }
  if (mode < 0 || mode > 7) {
    // Invalid block - return transparent black
    return Array(16).fill([0, 0, 0, 0]) as [number, number, number, number][];
  }

  const [numSubsets, partBits, rotBits, isbBit, colorBits, alphaBits, epbBits, spbBits, ib, ib2] = MODE_INFO[mode];
  const br = new BitReader(data, off);
  br.pos = mode + 1; // skip mode bits

  const partition = partBits > 0 ? br.read(partBits) : 0;
  const rotation = rotBits > 0 ? br.read(rotBits) : 0;
  const indexSelection = isbBit > 0 ? br.read(1) : 0;

  // Read endpoints
  const numEndpoints = numSubsets * 2;
  const endpoints: number[][] = []; // [endpointIdx][channel]
  for (let i = 0; i < numEndpoints; i++) endpoints.push([0, 0, 0, 0]);

  // Read color channels R, G, B
  for (let ch = 0; ch < 3; ch++) {
    for (let ep = 0; ep < numEndpoints; ep++) {
      endpoints[ep][ch] = br.read(colorBits);
    }
  }

  // Read alpha
  if (alphaBits > 0) {
    for (let ep = 0; ep < numEndpoints; ep++) {
      endpoints[ep][3] = br.read(alphaBits);
    }
  } else {
    for (let ep = 0; ep < numEndpoints; ep++) {
      endpoints[ep][3] = (1 << colorBits) - 1; // fully opaque
    }
  }

  // Read P-bits and apply
  if (epbBits > 0) {
    // One p-bit per endpoint
    for (let ep = 0; ep < numEndpoints; ep++) {
      const pbit = br.read(1);
      for (let ch = 0; ch < (alphaBits > 0 ? 4 : 3); ch++) {
        endpoints[ep][ch] = (endpoints[ep][ch] << 1) | pbit;
      }
      if (alphaBits === 0) {
        endpoints[ep][3] = (endpoints[ep][3] << 1) | 1; // alpha stays max
      }
    }
    // Unquantize
    const cBitsEff = colorBits + 1;
    const aBitsEff = alphaBits > 0 ? alphaBits + 1 : cBitsEff;
    for (let ep = 0; ep < numEndpoints; ep++) {
      for (let ch = 0; ch < 3; ch++) endpoints[ep][ch] = unquantize(endpoints[ep][ch], cBitsEff);
      endpoints[ep][3] = alphaBits > 0 ? unquantize(endpoints[ep][3], aBitsEff) : unquantize(endpoints[ep][3], cBitsEff);
    }
  } else if (spbBits > 0) {
    // One shared p-bit per subset
    for (let s = 0; s < numSubsets; s++) {
      const pbit = br.read(1);
      for (let e = 0; e < 2; e++) {
        const ep = s * 2 + e;
        for (let ch = 0; ch < (alphaBits > 0 ? 4 : 3); ch++) {
          endpoints[ep][ch] = (endpoints[ep][ch] << 1) | pbit;
        }
        if (alphaBits === 0) {
          endpoints[ep][3] = (endpoints[ep][3] << 1) | 1;
        }
      }
    }
    const cBitsEff = colorBits + 1;
    const aBitsEff = alphaBits > 0 ? alphaBits + 1 : cBitsEff;
    for (let ep = 0; ep < numEndpoints; ep++) {
      for (let ch = 0; ch < 3; ch++) endpoints[ep][ch] = unquantize(endpoints[ep][ch], cBitsEff);
      endpoints[ep][3] = alphaBits > 0 ? unquantize(endpoints[ep][3], aBitsEff) : unquantize(endpoints[ep][3], cBitsEff);
    }
  } else {
    // No p-bits
    for (let ep = 0; ep < numEndpoints; ep++) {
      for (let ch = 0; ch < 3; ch++) endpoints[ep][ch] = unquantize(endpoints[ep][ch], colorBits);
      endpoints[ep][3] = alphaBits > 0 ? unquantize(endpoints[ep][3], alphaBits) : 255;
    }
  }

  // Read indices
  const partitionTable = numSubsets === 3 ? P3[partition] : numSubsets === 2 ? P2[partition] : [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];

  // Determine anchor indices
  const anchors = new Set<number>();
  anchors.add(0); // pixel 0 is always anchor for subset 0
  if (numSubsets >= 2) {
    anchors.add(numSubsets === 2 ? ANCHOR2_1[partition] : ANCHOR3_1[partition]);
  }
  if (numSubsets >= 3) {
    anchors.add(ANCHOR3_2[partition]);
  }

  // Primary indices
  const colorIndices: number[] = new Array(16);
  for (let i = 0; i < 16; i++) {
    const isAnchor = anchors.has(i) && (numSubsets > 1 ? true : i === 0);
    // For single subset, only pixel 0 is anchor
    const anchor = numSubsets === 1 ? (i === 0) : isAnchor;
    colorIndices[i] = br.read(anchor ? ib - 1 : ib);
  }

  // Secondary indices (modes 4 and 5)
  const alphaIndices: number[] = new Array(16);
  if (ib2 > 0) {
    for (let i = 0; i < 16; i++) {
      // For secondary indices, pixel 0 is always anchor
      alphaIndices[i] = br.read(i === 0 ? ib2 - 1 : ib2);
    }
  }

  // Decode pixels
  const result: [number, number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const subset = partitionTable[i];
    const e0 = endpoints[subset * 2];
    const e1 = endpoints[subset * 2 + 1];

    let r: number, g: number, b: number, a: number;

    if (ib2 > 0) {
      // Modes 4 and 5: separate color and alpha indices
      let cIdx = colorIndices[i];
      let aIdx = alphaIndices[i];
      let cBits = ib;
      let aBits = ib2;

      if (indexSelection === 1) {
        // Swap which index set is used for color vs alpha
        [cIdx, aIdx] = [aIdx, cIdx];
        [cBits, aBits] = [aBits, cBits];
      }

      r = interpolate(e0[0], e1[0], cIdx, cBits);
      g = interpolate(e0[1], e1[1], cIdx, cBits);
      b = interpolate(e0[2], e1[2], cIdx, cBits);
      a = interpolate(e0[3], e1[3], aIdx, aBits);
    } else {
      const idx = colorIndices[i];
      r = interpolate(e0[0], e1[0], idx, ib);
      g = interpolate(e0[1], e1[1], idx, ib);
      b = interpolate(e0[2], e1[2], idx, ib);
      a = interpolate(e0[3], e1[3], idx, ib);
    }

    // Apply rotation
    if (rotation === 1) { const t = a; a = r; r = t; }
    else if (rotation === 2) { const t = a; a = g; g = t; }
    else if (rotation === 3) { const t = a; a = b; b = t; }

    result.push([
      Math.max(0, Math.min(255, r)),
      Math.max(0, Math.min(255, g)),
      Math.max(0, Math.min(255, b)),
      Math.max(0, Math.min(255, a)),
    ]);
  }

  return result;
}

// ── Public decoder ───────────────────────────────────────────────────
export function decodeBC7(data: Uint8Array, w: number, h: number): Uint8Array {
  const bx = Math.ceil(w / 4), by = Math.ceil(h / 4);
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < by; row++) {
    for (let col = 0; col < bx; col++) {
      const off = (row * bx + col) * 16;
      if (off + 16 > data.length) break;
      const rgba = decodeBC7Block(data, off);
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = col * 4 + px, y = row * 4 + py;
          if (x >= w || y >= h) continue;
          const c = rgba[py * 4 + px];
          const o = (y * w + x) * 4;
          out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = c[3];
        }
      }
    }
  }
  return out;
}
