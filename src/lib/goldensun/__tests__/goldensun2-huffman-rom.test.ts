import { describe, expect, it } from "vitest";
import { buildTrees, compressString } from "../goldensun-huffman";
import {
  GS2_CHUNK_COUNT, GS2_CHUNK_SIZE, GS2_TEXT_FILE, GS2_TREE_POINTERS,
  GS2_STRING_POINTERS, GS2_ORIGINAL_ROM_SIZE, GS2_STRING_COUNT,
  hasGoldenSun2TextTables, extractGoldenSun2Strings,
  goldenSun2TextToBytes, goldenSun2BytesToText, buildGoldenSun2StringTable, isGoldenSun2ArabicFontRom,
} from "../goldensun2-huffman-rom";

function write32(data: Uint8Array, at: number, number: number) {
  data[at] = number & 255;
  data[at + 1] = number >>> 8 & 255;
  data[at + 2] = number >>> 16 & 255;
  data[at + 3] = number >>> 24 & 255;
}
function ptr(at: number) { return (0x08000000 + at) >>> 0; }
function makeFixture(): Uint8Array {
  const rom = new Uint8Array(GS2_ORIGINAL_ROM_SIZE);
  rom.set([65, 71, 70, 69], 0xac); // AGFE
  const texts = Array.from({ length: GS2_STRING_COUNT }, (_, i) =>
    [i % 2 ? 66 : 65, 3]);
  const corpus = new Uint8Array(texts.length * 3);
  texts.forEach((b, i) => corpus.set(b, i * 3));
  const built = buildTrees(corpus);
  const treesOff = 0x1a0000;
  const offsetsOff = 0x1a1000;
  rom.set(built.treesBlob, treesOff);
  built.offsets.forEach((v, i) => {
    rom[offsetsOff + 2 * i] = v & 255;
    rom[offsetsOff + 2 * i + 1] = v >>> 8;
  });
  write32(rom, GS2_TREE_POINTERS, ptr(treesOff));
  write32(rom, GS2_TREE_POINTERS + 4, ptr(offsetsOff));
  let at = 0x1a2000;
  for (let chunk = 0; chunk < GS2_CHUNK_COUNT; chunk++) {
    const start = at;
    const bytes: Uint8Array[] = [];
    for (let j = 0; j < GS2_CHUNK_SIZE; j++) {
      const c = compressString(built, texts[chunk * GS2_CHUNK_SIZE + j]);
      if (!c.length) throw new Error("fixture generated empty compressed text");
      bytes.push(c);
      rom.set(c, at);
      at += c.length;
    }
    const lengths = at;
    bytes.forEach((c, j) => { rom[lengths + j] = c.length; });
    at += GS2_CHUNK_SIZE;
    const p = GS2_STRING_POINTERS + chunk * 8;
    write32(rom, p, ptr(start));
    write32(rom, p + 4, ptr(lengths));
  }
  return rom;
}

describe("The Lost Age complete extraction and rebuild", () => {
  it("retains argument bytes as immutable technical tags even when ASCII", () => {
    expect(goldenSun2BytesToText([0x11, 0x41, 0x03, 0x42]))
      .toBe(String.raw`\x11\x41\x03B`);
  });

  it("extracts 12,288 actual Huffman text records and round-trips an English edit", () => {
    const rom = makeFixture();
    expect(hasGoldenSun2TextTables(rom)).toBe(true);
    const entries = extractGoldenSun2Strings(rom);
    expect(entries).toHaveLength(GS2_STRING_COUNT);
    expect(entries[0].original).toBe("A\\x03");
    expect(entries[1].original).toBe("B\\x03");
    expect(entries[GS2_STRING_COUNT - 1].original).toBe("B\\x03");

    const { rom: unchanged, translatedLines: none } = buildGoldenSun2StringTable(rom, {});
    expect(none).toBe(0);
    // Never ask Vitest's deep comparator to enumerate 16 million typed-array
    // indices: it can allocate gigabytes and OOM the test worker.
    expect(unchanged.length).toBe(rom.length);
    expect(unchanged.every((v, i) => v === rom[i])).toBe(true);
    const key = GS2_TEXT_FILE + ":45";
    const built = buildGoldenSun2StringTable(rom, { [key]: "Welcome!\\x03" });
    expect(built.translatedLines).toBe(1);
    expect(built.rom.length).toBeGreaterThan(rom.length);
    expect(hasGoldenSun2TextTables(built.rom)).toBe(true);
    const after = extractGoldenSun2Strings(built.rom);
    expect(after[45].original).toBe("Welcome!\\x03");
    expect(after[46].original).toBe("A\\x03");
  }, 60000);

  it("refuses broken control tags and Arabic without the game's patched font", () => {
    const rom = makeFixture();
    expect(() => buildGoldenSun2StringTable(rom, {
      [GS2_TEXT_FILE + ":2"]: "Lost line break",
    })).toThrow(/technical control/);
    expect(() => buildGoldenSun2StringTable(rom, {
      [GS2_TEXT_FILE + ":2"]: "مرحبًا\\x03",
    })).toThrow(/الخط العربي/);
  }, 30000);

  it("encodes Arabic using precisely the same glyph codes as the user-provided Golden Sun I font", () => {
    const bytes = goldenSun2TextToBytes("مرحبا");
    expect(bytes).toHaveLength(5);
    expect(bytes.every(v => v >= 0x80 && v <= 0xff)).toBe(true);
    const rom = makeFixture();
    rom.set([0xf0, 0xb5, 0x04, 0x1c], 0x10d000);
    rom.set([0xf0, 0xb5, 0xff, 0xb0], 0x10d100);
    rom[0x39e00] = 0xd3;
    rom[0x682010 + 0xf0 * 32] = 0x44;
    rom[0x5a4e0 + (0xf0 - 0x20) * 32] = 4;
    expect(isGoldenSun2ArabicFontRom(rom)).toBe(true);
    expect(goldenSun2TextToBytes("نعم")).toEqual([0xf0, 0xd3, 0xeb]);
    expect(goldenSun2TextToBytes("لا")).toEqual([0xfe]);
    const output = buildGoldenSun2StringTable(rom, {
      [GS2_TEXT_FILE + ":1"]: "مرحبا\\x03",
    });
    expect(output.fontReady).toBe(true);
    expect(output.translatedLines).toBe(1);
    expect(extractGoldenSun2Strings(output.rom)[1].original).toContain("\\x03");
  }, 60000);
});
