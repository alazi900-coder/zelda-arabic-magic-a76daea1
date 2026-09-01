/**
 * LZ10 and LZ11 (Nintendo BIOS SWI 0x10 / 0x11 decompression) codecs.
 *
 * Fire Emblem 12's `m/*` text resources are LZ11-compressed; `fonts/system`
 * (unused by this project) is LZ10. LZ10 is the same format already used
 * for GBA ROMs elsewhere in this project (`src/lib/gba/gba-lz77.ts`), but
 * that decoder isn't reused here because LZ11 is a different, extended
 * format the GBA code doesn't handle — see `decompressLz11` below.
 *
 * The LZ11 compressor is a real (greedy, not optimal) compressor, not a
 * "store as literals" shortcut — verified this session that Fire Emblem
 * 12's loader reads a fixed-size compressed window before decompressing,
 * so an oversized "valid but lazy" encoding corrupts on-screen text and
 * tiles even though the decompressed bytes it produces are correct.
 */

export function decompressLz10(data: Uint8Array): Uint8Array {
  if (data[0] !== 0x10) throw new Error(`ليس كتلة LZ10 (بايت الترويسة 0x${data[0]?.toString(16)}).`);
  const size = data[1] | (data[2] << 8) | (data[3] << 16);
  const out = new Uint8Array(size);
  let written = 0;
  let pos = 4;
  while (written < size) {
    const flags = data[pos++];
    for (let bit = 7; bit >= 0 && written < size; bit--) {
      if (((flags >> bit) & 1) === 0) {
        out[written++] = data[pos++];
      } else {
        const b0 = data[pos++];
        const b1 = data[pos++];
        const length = (b0 >> 4) + 3;
        const disp = (((b0 & 0x0f) << 8) | b1) + 1;
        for (let i = 0; i < length && written < size; i++) {
          out[written] = out[written - disp];
          written++;
        }
      }
    }
  }
  return out;
}

export function decompressLz11(data: Uint8Array): Uint8Array {
  if (data[0] !== 0x11) throw new Error(`ليس كتلة LZ11 (بايت الترويسة 0x${data[0]?.toString(16)}).`);
  let size = data[1] | (data[2] << 8) | (data[3] << 16);
  let pos = 4;
  if (size === 0) {
    size = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
    pos = 8;
  }
  const out = new Uint8Array(size);
  let written = 0;
  while (written < size) {
    const flags = data[pos++];
    for (let bit = 7; bit >= 0 && written < size; bit--) {
      if (((flags >> bit) & 1) === 0) {
        out[written++] = data[pos++];
        continue;
      }
      const b1 = data[pos++];
      let length: number;
      let disp: number;
      if (b1 >> 4 === 0) {
        const b2 = data[pos++];
        const b3 = data[pos++];
        length = (((b1 & 0x0f) << 4) | (b2 >> 4)) + 0x11;
        disp = (((b2 & 0x0f) << 8) | b3) + 1;
      } else if (b1 >> 4 === 1) {
        const b2 = data[pos++];
        const b3 = data[pos++];
        const b4 = data[pos++];
        length = (((b1 & 0x0f) << 12) | (b2 << 4) | (b3 >> 4)) + 0x111;
        disp = (((b3 & 0x0f) << 8) | b4) + 1;
      } else {
        const b2 = data[pos++];
        length = (b1 >> 4) + 1;
        disp = (((b1 & 0x0f) << 8) | b2) + 1;
      }
      if (disp > written) throw new Error(`مرجعٌ للخلف يتجاوز بداية الإخراج عند 0x${written.toString(16)} (disp=${disp}).`);
      for (let i = 0; i < length && written < size; i++) {
        out[written] = out[written - disp];
        written++;
      }
    }
  }
  return out;
}

const MAX_DISP = 0x1000; // 12-bit displacement field, shared by all three length tiers
const MIN_MATCH = 3;
const MAX_MATCH = 0x111 + 0xffff; // largest length the 4-byte token can express

function findMatch(data: Uint8Array, pos: number): { length: number; disp: number } | null {
  const start = Math.max(0, pos - MAX_DISP);
  let bestLen = 0;
  let bestDisp = 0;
  const maxLen = Math.min(MAX_MATCH, data.length - pos);
  if (maxLen < MIN_MATCH) return null;
  for (let cand = pos - 1; cand >= start; cand--) {
    if (data[cand] !== data[pos]) continue;
    let len = 0;
    while (len < maxLen && data[cand + len] === data[pos + len]) len++;
    if (len > bestLen) {
      bestLen = len;
      bestDisp = pos - cand;
      if (len >= maxLen) break;
    }
  }
  return bestLen >= MIN_MATCH ? { length: bestLen, disp: bestDisp } : null;
}

export function compressLz11(data: Uint8Array): Uint8Array {
  const out: number[] = [0x11, data.length & 0xff, (data.length >> 8) & 0xff, (data.length >> 16) & 0xff];
  let pos = 0;
  while (pos < data.length) {
    const flagIndex = out.length;
    out.push(0);
    let flags = 0;
    for (let bit = 7; bit >= 0 && pos < data.length; bit--) {
      const match = findMatch(data, pos);
      if (!match) {
        out.push(data[pos]);
        pos += 1;
        continue;
      }
      flags |= 1 << bit;
      const { length, disp } = match;
      const d = disp - 1;
      if (length >= 0x11 && length < 0x111) {
        const l = length - 0x11;
        out.push((l >> 4) & 0x0f, ((l & 0x0f) << 4) | ((d >> 8) & 0x0f), d & 0xff);
      } else if (length >= 0x111) {
        const l = length - 0x111;
        out.push(0x10 | ((l >> 12) & 0x0f), (l >> 4) & 0xff, ((l & 0x0f) << 4) | ((d >> 8) & 0x0f), d & 0xff);
      } else {
        const l = length - 1;
        out.push((l << 4) | ((d >> 8) & 0x0f), d & 0xff);
      }
      pos += length;
    }
    out[flagIndex] = flags;
  }
  return Uint8Array.from(out);
}
