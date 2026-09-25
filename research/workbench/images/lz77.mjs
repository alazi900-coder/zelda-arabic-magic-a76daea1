/**
 * Nintendo BIOS LZ77 (type 0x10), the compression the SFP containers ship in.
 *
 * Header is 4 bytes: 0x10 then a 24-bit decompressed size. The body is groups
 * of eight units preceded by a flag byte, MSB first: a clear bit is one literal
 * byte, a set bit is a back-reference of 3..18 bytes at a distance of 1..4096.
 *
 * The match search is a plain hash chain over 3-byte prefixes. It does not have
 * to match the original compressor byte for byte -- what has to hold is that
 * decompressing the result gives back the same bytes, which the caller checks.
 */
export function lz77Compress(input) {
  const n = input.length;
  const out = [0x10, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];

  const HASH = 1 << 16;
  const head = new Int32Array(HASH).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const key = (p) => p + 2 < n ? ((input[p] << 8 ^ input[p + 1] << 4 ^ input[p + 2]) & (HASH - 1)) : 0;

  let pos = 0;
  while (pos < n) {
    const flagIndex = out.length;
    out.push(0);
    let flags = 0;
    for (let bit = 7; bit >= 0 && pos < n; bit--) {
      let bestLen = 0, bestDist = 0;
      if (pos + 2 < n) {
        const limit = Math.max(0, pos - 4096);
        let cand = head[key(pos)], guard = 0;
        while (cand >= limit && cand >= 0 && guard++ < 256) {
          let len = 0;
          const max = Math.min(18, n - pos);
          while (len < max && input[cand + len] === input[pos + len]) len++;
          if (len > bestLen) { bestLen = len; bestDist = pos - cand; if (len === 18) break; }
          cand = prev[cand];
        }
      }
      if (bestLen >= 3) {
        flags |= 1 << bit;
        out.push(((bestLen - 3) << 4) | (((bestDist - 1) >> 8) & 0x0f), (bestDist - 1) & 0xff);
        for (let k = 0; k < bestLen; k++) { const h = key(pos); prev[pos] = head[h]; head[h] = pos; pos++; }
      } else {
        out.push(input[pos]);
        const h = key(pos); prev[pos] = head[h]; head[h] = pos; pos++;
      }
    }
    out[flagIndex] = flags;
  }
  while (out.length % 4) out.push(0);
  return new Uint8Array(out);
}
