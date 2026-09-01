import { describe, expect, it } from "vitest";
import { compressLz11, decompressLz10, decompressLz11 } from "./nds-lz";

describe("nds-lz", () => {
  it("round-trips LZ11 compress -> decompress for repetitive data", () => {
    const original = new Uint8Array(2000);
    for (let i = 0; i < original.length; i++) original[i] = (i % 37) + (i % 5);
    const compressed = compressLz11(original);
    expect(compressed[0]).toBe(0x11);
    const decoded = decompressLz11(compressed);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("round-trips LZ11 compress -> decompress for random-ish data (worst case for compression)", () => {
    const original = new Uint8Array(500);
    let seed = 12345;
    for (let i = 0; i < original.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      original[i] = seed & 0xff;
    }
    const compressed = compressLz11(original);
    const decoded = decompressLz11(compressed);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("compresses real repetitive data smaller than trivial storage would be", () => {
    const original = new Uint8Array(1000).fill(0x41);
    const compressed = compressLz11(original);
    // Trivial "store as literals" would need 1000 + ceil(1000/8) + 4 header bytes.
    expect(compressed.length).toBeLessThan(200);
  });

  it("decompresses a hand-built LZ10 block", () => {
    // "AAAAAAAAAA" (10 bytes): literal 'A' (flag bit7=0), then a back-reference
    // of length 9, disp 1 (flag bit6=1) reproducing it nine more times.
    const block = new Uint8Array([0x10, 10, 0, 0, 0b01000000, 0x41, (9 - 3) << 4 | 0, 0]);
    const decoded = decompressLz10(block);
    expect(Array.from(decoded)).toEqual(Array(10).fill(0x41));
  });

  it("rejects a buffer with the wrong LZ11 header byte", () => {
    expect(() => decompressLz11(new Uint8Array([0x10, 1, 0, 0]))).toThrow();
  });
});
