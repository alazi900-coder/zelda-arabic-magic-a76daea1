import { describe, expect, it } from "vitest";
import { compressGrezzoLzs, decompressGrezzoLzs } from "./grezzo-lz";

describe("grezzo-lz", () => {
  it("rejects a buffer without the LzS\\x01 header", () => {
    expect(() => decompressGrezzoLzs(new Uint8Array([0x10, 1, 0, 0]))).toThrow();
  });

  it("round-trips compress -> decompress for repetitive data (exercises RLE-style overlap)", () => {
    const original = new Uint8Array(3000).fill(0x41);
    const compressed = compressGrezzoLzs(original);
    expect(String.fromCharCode(...compressed.slice(0, 4))).toBe("LzS\x01");
    const decoded = decompressGrezzoLzs(compressed);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("round-trips compress -> decompress for varied data spanning multiple ring-buffer wraps", () => {
    const original = new Uint8Array(20000);
    for (let i = 0; i < original.length; i++) original[i] = (i * 7 + (i % 13)) & 0xff;
    const compressed = compressGrezzoLzs(original);
    const decoded = decompressGrezzoLzs(compressed);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("round-trips compress -> decompress for random-ish data (worst case for compression)", () => {
    const original = new Uint8Array(2000);
    let seed = 54321;
    for (let i = 0; i < original.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      original[i] = seed & 0xff;
    }
    const compressed = compressGrezzoLzs(original);
    const decoded = decompressGrezzoLzs(compressed);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("decompresses a hand-built block using the documented absolute-position token", () => {
    // "AAAAAAAAAA" (10 bytes): a literal 'A' (flag bit0=1), then a 9-byte
    // back-reference to ring position 0xFEE (the write cursor's start
    // value, i.e. "the byte just written") — token bytes: low byte 0xEE,
    // high nibble of the next byte 0xF (0xFEE's top 4 bits), low nibble
    // (length-3) = 6.
    const fixedBody = new Uint8Array([0b00000001, 0x41, 0xee, (0xf << 4) | 6]);
    const header = new Uint8Array(16);
    const hv = new DataView(header.buffer);
    header.set([0x4c, 0x7a, 0x53, 0x01]);
    hv.setUint32(8, 10, true);
    hv.setUint32(12, fixedBody.length, true);
    const block = new Uint8Array(16 + fixedBody.length);
    block.set(header, 0);
    block.set(fixedBody, 16);

    const decoded = decompressGrezzoLzs(block);
    expect(Array.from(decoded)).toEqual(Array(10).fill(0x41));
  });
});
