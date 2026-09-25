// Decoder for Inazuma Eleven's "SFP" 2D image container (the .SPF_/.pac_ files
// under data_iz/pic2d/), reverse-engineered by hand against MMSlot.SPF_:
//
//   outer file: standard Nintendo BIOS LZ77 (type 0x10)
//   decompressed container:
//     0x00 "SFP\0"
//     0x04 u32 = 0 (unknown)
//     0x08 u32 = 5 (unknown)
//     0x0C u32 = entry table offset (32)
//     0x10 u32 = tile-data section offset
//     0x20.. entry table: 16 bytes/entry = {nameTableOffset, byteSize, tileUnitOffset(*32), 0}
//     name table: null-terminated ASCII names, in entry order
//     tile-data section: each entry's bytes live at tileDataOffset + tileUnitOffset*32
//
//   each entry's own bytes:
//     0x00 32-byte header (field0..field3 constant per image: 3,32,32,64 seen so
//          far; the remaining 4 fields are internal section offsets, not yet
//          needed for a read-only decode)
//     0x20.. 4bpp indexed pixel data, standard NDS 8x8-tile order (32 bytes/tile,
//          4 bytes/tile-row, low nibble = left pixel)
//     [end-32, end) 16-color RGB555 palette

export function lz77Decompress(data) {
  const size = data[1] | (data[2] << 8) | (data[3] << 16);
  const out = new Uint8Array(size);
  let inPos = 4, outPos = 0;
  while (outPos < size) {
    const flags = data[inPos++];
    for (let bit = 7; bit >= 0 && outPos < size; bit--) {
      if ((flags >> bit) & 1) {
        const b0 = data[inPos++], b1 = data[inPos++];
        const len = (b0 >> 4) + 3;
        const disp = ((b0 & 0xf) << 8) | b1;
        const s = outPos - disp - 1;
        for (let i = 0; i < len; i++) { out[outPos] = out[s + i]; outPos++; }
      } else {
        out[outPos++] = data[inPos++];
      }
    }
  }
  return out;
}

export function parseSfp(decompressed) {
  const d = decompressed;
  const dv = new DataView(d.buffer, d.byteOffset, d.length);
  if (String.fromCharCode(...d.subarray(0, 3)) !== "SFP") throw new Error("not an SFP container");
  const tableOffset = dv.getUint32(0x0c, true);
  const tileDataOffset = dv.getUint32(0x10, true);

  // The entry table's own length isn't stored anywhere -- it simply runs up to
  // where the name table starts, and the only place that boundary appears is
  // entry 0's own nameOff field (names are packed right after the table, so
  // the first entry's name necessarily sits at the table's end). Using
  // tileDataOffset as the stop condition instead over-read into the name
  // table and decoded its ASCII bytes as bogus further entries.
  const entries = [];
  let tableEnd = null;
  let i = 0;
  while (true) {
    const base = tableOffset + i * 16;
    if (tableEnd !== null ? base >= tableEnd : base + 16 > tileDataOffset) break;
    const nameOff = dv.getUint32(base, true);
    const size = dv.getUint32(base + 4, true);
    const tileUnitOff = dv.getUint32(base + 8, true);
    if (size === 0 || nameOff < tableOffset) break;
    if (i === 0) tableEnd = nameOff;
    entries.push({ nameOff, size, dataOffset: tileDataOffset + tileUnitOff * 32 });
    i++;
  }
  for (const e of entries) {
    let end = e.nameOff;
    while (end < d.length && d[end] !== 0) end++;
    e.name = String.fromCharCode(...d.subarray(e.nameOff, end));
  }
  return entries;
}

function rgb555(lo, hi) {
  const v = lo | (hi << 8);
  return [
    Math.round((v & 0x1f) * 255 / 31),
    Math.round(((v >> 5) & 0x1f) * 255 / 31),
    Math.round(((v >> 10) & 0x1f) * 255 / 31),
  ];
}

/**
 * Decodes one entry's bytes (as sliced from the SFP container via its
 * `dataOffset`/`size`) into {width, height, rgba} -- a flat Uint8ClampedArray
 * of RGBA bytes, row-major, ready for a canvas/PNG encoder.
 *
 * `tilesWide` must be supplied -- nothing in the entry itself states it
 * (the two "32" header fields are themselves the width/height of a single
 * standard tile-sheet block, not the whole image's tile count), so callers
 * pick it from the file's own on-screen usage or by trying values until the
 * image reads cleanly.
 */
export function decodeEntry(bytes, tilesWide) {
  const palette = bytes.subarray(bytes.length - 32, bytes.length);
  const pixels = bytes.subarray(32, bytes.length - 32);
  const pal = [];
  for (let i = 0; i < 16; i++) pal.push(rgb555(palette[i * 2], palette[i * 2 + 1]));

  const numTiles = pixels.length / 32;
  const tilesHigh = Math.ceil(numTiles / tilesWide);
  const width = tilesWide * 8, height = tilesHigh * 8;
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let t = 0; t < numTiles; t++) {
    const tx = (t % tilesWide) * 8, ty = Math.floor(t / tilesWide) * 8;
    const base = t * 32;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 4; col++) {
        const byte = pixels[base + row * 4 + col];
        for (const [nib, dx] of [[byte & 0xf, 0], [(byte >> 4) & 0xf, 1]]) {
          const x = tx + col * 2 + dx, y = ty + row;
          const o = (y * width + x) * 4;
          const [r, g, b] = pal[nib];
          rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b;
          // Palette index 0 is conventionally transparent in NDS graphics.
          rgba[o + 3] = nib === 0 ? 0 : 255;
        }
      }
    }
  }
  return { width, height, rgba, palette: pal };
}
