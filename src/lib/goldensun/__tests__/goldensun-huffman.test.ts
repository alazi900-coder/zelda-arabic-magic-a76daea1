import { describe, it, expect } from "vitest";
import { buildTrees, compressString, decompressString } from "../goldensun-huffman";

function corpusOf(strings: number[][]): Uint8Array {
  const bytes: number[] = [];
  for (const s of strings) bytes.push(...s, 0);
  return new Uint8Array(bytes);
}

describe("goldensun-huffman", () => {
  it("round-trips a small corpus of English strings", () => {
    const strings = [
      [..."Come on, Isaac.".split("").map((c) => c.charCodeAt(0))],
      [..."We have to go now!".split("").map((c) => c.charCodeAt(0))],
      [..."Isaac! You forgot something!".split("").map((c) => c.charCodeAt(0))],
      [..."Repair".split("").map((c) => c.charCodeAt(0))],
    ];
    const built = buildTrees(corpusOf(strings));
    // Lay the tree blob down, then each compressed string right after, so
    // decompressString can be run against one shared buffer like the ROM.
    let addr = built.treesBlob.length;
    const offsetsAddr = 0; // unused directly; decompressChar reads via the tables passed in
    const parts: Uint8Array[] = [built.treesBlob];
    const starts: number[] = [];
    for (const s of strings) {
      const c = compressString(built, s);
      starts.push(addr);
      parts.push(c);
      addr += c.length;
    }
    const total = new Uint8Array(addr);
    let p = 0;
    for (const part of parts) { total.set(part, p); p += part.length; }

    // decompressChar reads the offsets table as raw bytes at `offsetsAddr`,
    // but buildTrees returns a Uint16Array in JS land -- write it into the
    // buffer too so the real code path (byte reads) is exercised.
    const offsetsBytes = new Uint8Array(256 * 2);
    for (let i = 0; i < 256; i++) {
      offsetsBytes[i * 2] = built.offsets[i] & 0xff;
      offsetsBytes[i * 2 + 1] = (built.offsets[i] >> 8) & 0xff;
    }
    const full = new Uint8Array(offsetsBytes.length + total.length);
    full.set(offsetsBytes, 0);
    full.set(total, offsetsBytes.length);
    const treesAddr = offsetsBytes.length; // treesBlob starts right after offsets
    const offsetsAddrReal = 0;

    strings.forEach((s, i) => {
      const decoded = decompressString(full, treesAddr + starts[i], treesAddr, offsetsAddrReal);
      expect(decoded).toEqual(s);
    });
  });

  it("round-trips bytes in the Arabic range (0x90-0xff)", () => {
    const strings = [
      [0x11, 0x01, 0x2c, 0x20, 0x91, 0xb6, 0xa8, 0xf7, 0xe2, 0x02],
      [0x98, 0xbc, 0xa3, 0xfd, 0xe1, 0x7c, 0x21, 0x02],
      [..."25".split("").map((c) => c.charCodeAt(0))],
    ];
    const built = buildTrees(corpusOf(strings));
    const offsetsBytes = new Uint8Array(256 * 2);
    for (let i = 0; i < 256; i++) {
      offsetsBytes[i * 2] = built.offsets[i] & 0xff;
      offsetsBytes[i * 2 + 1] = (built.offsets[i] >> 8) & 0xff;
    }
    const treesAddr = offsetsBytes.length;
    let addr = treesAddr + built.treesBlob.length;
    const starts: number[] = [];
    const chunks: Uint8Array[] = [offsetsBytes, built.treesBlob];
    for (const s of strings) {
      const c = compressString(built, s);
      starts.push(addr);
      chunks.push(c);
      addr += c.length;
    }
    const full = new Uint8Array(addr);
    let p = 0;
    for (const c of chunks) { full.set(c, p); p += c.length; }

    strings.forEach((s, i) => {
      const decoded = decompressString(full, starts[i], treesAddr, 0);
      expect(decoded).toEqual(s);
    });
  });
});
