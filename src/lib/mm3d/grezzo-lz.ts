/**
 * GrezzoLZS — the LZSS variant Grezzo's 3DS Zelda remakes (Ocarina of Time
 * 3D, Majora's Mask 3D) use to compress loose .lzs files (this project's
 * case: a .gar archive holding the title-logo .cmb model).
 *
 * Header: magic "LzS\x01"(4), an unused u32, uncompressed size (u32),
 * compressed size (u32) — all little-endian, 16 bytes total.
 *
 * Body: classic LZSS with a 4096-byte ring buffer preset to zero and the
 * write cursor starting at 0xFEE (matching the reference decompressor at
 * https://github.com/xdanieldzd/Scarlet/blob/master/Scarlet.IO.CompressionFormats/GrezzoLZS.cs,
 * itself citing https://github.com/ShimmerFairy/MM3D/blob/master/src/lzs.cpp).
 * Flag bytes are read LSB-first, 8 flags each: a set bit means a literal
 * byte follows; a clear bit means a 2-byte back-reference — byte0 is the
 * low 8 bits of an ABSOLUTE ring-buffer read position (not a relative
 * displacement), byte1's high nibble is its top 4 bits, and byte1's low
 * nibble is (match length - 3), so matches run 3..18 bytes.
 *
 * Verified this session by decompressing a real title_logo asset pulled
 * from a Majora's Mask 3D .gar.lzs and getting back an exact-size, valid
 * "GAR" archive.
 */

const MAGIC = "LzS\x01";
const RING_SIZE = 4096;
const RING_START = 0xfee;
const MIN_MATCH = 3;
const MAX_MATCH = 18; // 4-bit length field + 3

export function decompressGrezzoLzs(data: Uint8Array): Uint8Array {
  if (data.length < 16 || String.fromCharCode(...data.slice(0, 4)) !== MAGIC) {
    throw new Error('ليس ملف GrezzoLZS (لا يبدأ بترويسة "LzS\\x01")');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const uncompressedSize = view.getUint32(8, true);
  const compressedSize = view.getUint32(12, true);
  const compressed = data.subarray(16, 16 + compressedSize);

  const out = new Uint8Array(uncompressedSize);
  let written = 0;
  const buffer = new Uint8Array(RING_SIZE);
  let writeIdx = RING_START;
  let fidx = 0;

  while (fidx < compressed.length && written < uncompressedSize) {
    let flags = compressed[fidx++];
    for (let bit = 0; bit < 8 && fidx < compressed.length && written < uncompressedSize; bit++) {
      if (flags & 1) {
        const b = compressed[fidx++];
        out[written++] = b;
        buffer[writeIdx] = b;
        writeIdx = (writeIdx + 1) % RING_SIZE;
      } else {
        let readIdx = compressed[fidx++];
        readIdx |= (compressed[fidx] & 0xf0) << 4;
        const length = (compressed[fidx] & 0x0f) + 3;
        fidx++;
        for (let j = 0; j < length && written < uncompressedSize; j++) {
          const b = buffer[readIdx];
          out[written++] = b;
          buffer[writeIdx] = b;
          readIdx = (readIdx + 1) % RING_SIZE;
          writeIdx = (writeIdx + 1) % RING_SIZE;
        }
      }
      flags >>= 1;
    }
  }

  if (written !== uncompressedSize) {
    throw new Error(`فك GrezzoLZS: توقّعت ${uncompressedSize} بايت، خرج ${written}`);
  }
  return out;
}

/** Greedy LZSS compressor matching the exact token shape `decompressGrezzoLzs`
 * expects (absolute ring-buffer read positions, not relative displacement).
 * Not bit-optimal, but every match it emits is real and verified by
 * `matchLength` against the ring buffer's actual contents. */
export function compressGrezzoLzs(data: Uint8Array): Uint8Array {
  const buffer = new Uint8Array(RING_SIZE);
  let writeIdx = RING_START;

  // 3-byte-prefix hash -> most recent ring-buffer positions holding it,
  // so a match search doesn't have to scan the whole 4096-byte window.
  const chains = new Map<number, number[]>();
  const hashAt = (ringPos: number) =>
    ((buffer[ringPos] << 16) | (buffer[(ringPos + 1) % RING_SIZE] << 8) | buffer[(ringPos + 2) % RING_SIZE]) >>> 0;

  function remember(ringPos: number) {
    const h = hashAt(ringPos);
    let list = chains.get(h);
    if (!list) chains.set(h, (list = []));
    list.push(ringPos);
    if (list.length > 64) list.shift(); // bound search cost; recent matches win anyway
  }

  // Seed the chain with the initial zero-filled window, exactly like the
  // decompressor's preset buffer, so early runs of zeros can match it.
  for (let i = 0; i < RING_START; i++) remember(i);

  // A match with distance < length is self-overlapping (RLE-style): the
  // decompressor's byte-by-byte copy reads bytes its own copy just wrote.
  // Checking that against the ring buffer's current (pre-copy) contents
  // would compare against stale, unrelated history and can accept a bogus
  // match — this recurses through `data` itself instead, which already
  // holds the true post-overlap values regardless of how the match would
  // be produced.
  function matchLength(readIdx: number, dataPos: number, maxLen: number): number {
    const distance = ((writeIdx - readIdx + RING_SIZE) % RING_SIZE) || RING_SIZE;
    let len = 0;
    while (len < maxLen) {
      const srcPos = dataPos - distance + len;
      const srcByte = srcPos >= 0 ? data[srcPos] : 0; // before srcPos 0, the ring's zero preset
      if (srcByte !== data[dataPos + len]) break;
      len++;
    }
    return len;
  }

  function findMatch(dataPos: number): { readIdx: number; length: number } | null {
    if (dataPos + MIN_MATCH > data.length) return null;
    const h = ((data[dataPos] << 16) | (data[dataPos + 1] << 8) | data[dataPos + 2]) >>> 0;
    const candidates = chains.get(h);
    if (!candidates) return null;
    const maxLen = Math.min(MAX_MATCH, data.length - dataPos);
    let bestLen = 0;
    let bestPos = 0;
    for (let i = candidates.length - 1; i >= 0; i--) {
      const len = matchLength(candidates[i], dataPos, maxLen);
      if (len > bestLen) {
        bestLen = len;
        bestPos = candidates[i];
        if (len >= maxLen) break;
      }
    }
    return bestLen >= MIN_MATCH ? { readIdx: bestPos, length: bestLen } : null;
  }

  function emit(b: number) {
    buffer[writeIdx] = b;
    remember(writeIdx);
    writeIdx = (writeIdx + 1) % RING_SIZE;
  }

  const out: number[] = [];
  let pos = 0;
  while (pos < data.length) {
    const flagIndex = out.length;
    out.push(0);
    let flags = 0;
    for (let bit = 0; bit < 8 && pos < data.length; bit++) {
      const match = findMatch(pos);
      if (!match) {
        out.push(data[pos]);
        emit(data[pos]);
        pos += 1;
        flags |= 1 << bit;
        continue;
      }
      const { readIdx, length } = match;
      out.push(readIdx & 0xff, (((readIdx >> 8) & 0x0f) << 4) | (length - 3));
      for (let k = 0; k < length; k++) emit(data[pos + k]);
      pos += length;
    }
    out[flagIndex] = flags;
  }

  const compressedBody = Uint8Array.from(out);
  const header = new Uint8Array(16);
  const hv = new DataView(header.buffer);
  header.set([0x4c, 0x7a, 0x53, 0x01]); // "LzS\x01"
  hv.setUint32(4, 0, true); // unknown field — the reference format leaves this alone; 0 round-trips fine
  hv.setUint32(8, data.length, true);
  hv.setUint32(12, compressedBody.length, true);

  const result = new Uint8Array(16 + compressedBody.length);
  result.set(header, 0);
  result.set(compressedBody, 16);
  return result;
}
