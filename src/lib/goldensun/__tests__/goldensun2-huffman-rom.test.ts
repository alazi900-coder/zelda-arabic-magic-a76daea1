import { describe, expect, it } from "vitest";
import { buildTrees, compressString } from "../goldensun-huffman";
import {
  GS2_CHUNK_COUNT, GS2_CHUNK_SIZE, GS2_TEXT_FILE, GS2_TREE_POINTERS,
  GS2_STRING_POINTERS, GS2_ORIGINAL_ROM_SIZE, GS2_STRING_COUNT,
  hasGoldenSun2TextTables, extractGoldenSun2Strings,
  goldenSun2TextToBytes, goldenSun2BytesToText, buildGoldenSun2StringTable, isGoldenSun2ArabicFontRom,
  removeLegacyGoldenSun2SourceCopies,
} from "../goldensun2-huffman-rom";

function write32(data: Uint8Array, at: number, number: number) {
  data[at] = number & 255;
  data[at + 1] = number >>> 8 & 255;
  data[at + 2] = number >>> 16 & 255;
  data[at + 3] = number >>> 24 & 255;
}
function ptr(at: number) { return (0x08000000 + at) >>> 0; }
function makeFixture(overrides: Record<number, number[]> = {}): Uint8Array {
  const rom = new Uint8Array(GS2_ORIGINAL_ROM_SIZE);
  rom.set([65, 71, 70, 69], 0xac); // AGFE
  // Include the large-font table even though the ROM builder no longer
  // examines dialogue widths. Other font-specific tests use this fixture.
  for (let code = 0x21; code <= 0xff; code++) {
    rom[0x5a4e0 + (code - 0x20) * 32] = 5;
  }
  const texts = Array.from({ length: GS2_STRING_COUNT }, (_, i) =>
    overrides[i] ?? [i % 2 ? 66 : 65, 3]);
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
  it("removes only source byte-dump copies, preserving genuine old Arabic translations", () => {
    const entries = [
      { index: 5471, msbtFile: GS2_TEXT_FILE, original: "アイテム！", legacyOriginal: "\\x83A\\x83C" },
      { index: 5472, msbtFile: GS2_TEXT_FILE, original: "まほう", legacyOriginal: "\\x82\\xDC" },
      { index: 0, msbtFile: GS2_TEXT_FILE, original: "(No saved data)" },
    ];
    const base = GS2_TEXT_FILE + ":";
    const input = {
      [base + 5471]: "\\x83A\\x83C",
      [base + 5472]: "سحر",
      [base + 0]: "لا توجد بيانات محفوظة",
    };
    const after = removeLegacyGoldenSun2SourceCopies(entries, input);
    expect(after[base + 5471]).toBeUndefined();
    expect(after[base + 5472]).toBe("سحر");
    expect(after[base + 0]).toBe("لا توجد بيانات محفوظة");
    expect(input[base + 5471]).toBe("\\x83A\\x83C");
  });

  it("decodes the exact Japanese item dialogue from the real AGFE ROM", () => {
    // Actual line #5471 of the stock US/Europe cartridge, formerly displayed
    // in the editor as \x83A\x83C\x83e..., including real control bytes.
    const bytes = [
      0x83, 0x41, 0x83, 0x43, 0x83, 0x65, 0x83, 0x80, 0x81, 0x49,
      0x03, 0x14, 0x01, 0x03,
      0x83, 0x51, 0x83, 0x62, 0x83, 0x67, 0x81, 0x5b, 0x02,
    ];
    const text = "アイテム！\\x03\\x14\\x01\\x03ゲットー\\x02";
    expect(goldenSun2BytesToText(bytes, false)).toBe(text);
    expect(goldenSun2BytesToText(bytes, true)).toBe(text);
  });

  it("decodes other original Japanese lines, including 0x96DA kanji", () => {
    expect(goldenSun2BytesToText([0x82, 0xb1])).toBe("こ");
    expect(goldenSun2BytesToText([
      0x82, 0x6d, 0x82, 0xce, 0x82, 0xf1, 0x96, 0xda,
    ], true)).toBe("Ｎばん目");
  });

  it("does not mistake isolated 0xB0 punctuation in English for Arabic", () => {
    expect(goldenSun2BytesToText([0x59, 0x65, 0x73, 0xb0, 0x4e, 0x6f], true))
      .toBe("Yes\\xB0No");
  });

  it("displays contiguous verified Arabic font glyph codes as normal Arabic", () => {
    expect(goldenSun2BytesToText([0xf0, 0xd3, 0xeb], true)).toBe("نعم");
    // Do not invent Arabic characters on an unpatched cartridge.
    expect(goldenSun2BytesToText([0xf0, 0xd3, 0xeb], false))
      .toBe("\\xF0\\xD3\\xEB");
  });
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

  it("builds dialogue beyond two lines without inserting breaks or refusing its width", () => {
    const rom = makeFixture();
    const key = GS2_TEXT_FILE + ":9";
    const sentence = "This sentence intentionally runs far beyond the old GBA dialogue window. ";
    const longText = sentence.repeat(3).trim() + "\\x03";
    // Previous builder rejected this as needing more than two physical rows,
    // despite the translation preserving the exact original 0x03 token.
    const result = buildGoldenSun2StringTable(rom, { [key]: longText });
    expect(result.translatedLines).toBe(1);
    const entries = extractGoldenSun2Strings(result.rom);
    expect(entries[9].original).toBe(longText);
    expect(entries[9].original.match(/\\x03/g)).toHaveLength(1);
    expect(entries[8].original).toBe("A\\x03");
    expect(entries[10].original).toBe("A\\x03");
  }, 60000);

  it("encodes a real pasted U+001B into an unchanged original ESC command", () => {
    const rom = makeFixture({ 9: [0x41, 0x1b, 0x03] });
    const esc = String.fromCharCode(0x1b);
    const key = GS2_TEXT_FILE + ":9";
    // No Arabic font needed: this proves the control byte remains intact.
    const changed = "Welcome" + esc + String.raw`\x03`;
    expect(goldenSun2TextToBytes("A" + esc)).toEqual([0x41, 0x1b]);
    const built = buildGoldenSun2StringTable(rom, { [key]: changed });
    expect(built.translatedLines).toBe(1);
    expect(extractGoldenSun2Strings(built.rom)[9].original).toBe(String.raw`Welcome\x1B\x03`);
  }, 60000);

  it("drops a stray raw ESC absent from the original and still produces a valid ROM", () => {
    const rom = makeFixture();
    const extraEsc = String.fromCharCode(0x1b);
    const key = GS2_TEXT_FILE + ":9";
    const translation = "Welcome" + extraEsc + String.raw`\x03`;
    const built = buildGoldenSun2StringTable(rom, { [key]: translation });
    expect(built.translatedLines).toBe(1);
    expect(built.removedHiddenControls).toBe(1);
    expect(extractGoldenSun2Strings(built.rom)[9].original).toBe(String.raw`Welcome\x03`);
    // Editor text stays immutable: cleanup happens on ROM output.
    expect(translation).toContain(extraEsc);
    expect(extractGoldenSun2Strings(built.rom)[8].original).toBe(String.raw`A\x03`);
  }, 60000);

  it("removes duplicates but retains an actual original ESC command", () => {
    const rom = makeFixture({ 9: [0x41, 0x1b, 0x03] });
    const esc = String.fromCharCode(0x1b);
    const built = buildGoldenSun2StringTable(rom, {
      [GS2_TEXT_FILE + ":9"]: "Hi" + esc + esc + String.raw`\x03`,
    });
    expect(built.removedHiddenControls).toBe(1);
    expect(extractGoldenSun2Strings(built.rom)[9].original).toBe(String.raw`Hi\x1B\x03`);
  }, 60000);

  it("still refuses explicit extra technical tags, never deletes written tags", () => {
    const rom = makeFixture();
    expect(() => buildGoldenSun2StringTable(rom, {
      [GS2_TEXT_FILE + ":9"]: String.raw`Hello\x1B\x03`,
    })).toThrow(/technical control codes differ/);
  }, 30000);

  it("forced build strips an extra explicit ESC, while strict build refuses it", () => {
    const rom = makeFixture();
    const key = GS2_TEXT_FILE + ":9";
    const translation = String.raw`Welcome\x1B\x03`;
    expect(() => buildGoldenSun2StringTable(rom, { [key]: translation }))
      .toThrow(/technical control codes differ/);
    const result = buildGoldenSun2StringTable(rom, { [key]: translation }, { forceBuild: true });
    expect(result.translatedLines).toBe(1);
    expect(result.removedExtraControlTags).toBe(1);
    expect(result.skippedUnsafeTranslations).toBe(0);
    expect(extractGoldenSun2Strings(result.rom)[9].original).toBe(String.raw`Welcome\x03`);
    expect(translation).toContain(String.raw`\x1B`);
  }, 60000);

  it("forced build omits unsupported glyphs, reports deletions, and leaves saved edits untouched", () => {
    const rom = makeFixture();
    const key = GS2_TEXT_FILE + ":9";
    const translation = "Welcome🙂!" + String.raw`\x03`;
    expect(() => buildGoldenSun2StringTable(rom, { [key]: translation }))
      .toThrow(/unsupported character/);
    const result = buildGoldenSun2StringTable(rom, { [key]: translation }, { forceBuild: true });
    expect(result.omittedUnsupportedCharacters).toBe(1);
    expect(result.translatedLines).toBe(1);
    expect(extractGoldenSun2Strings(result.rom)[9].original).toBe(String.raw`Welcome!\x03`);
    expect(translation).toContain("🙂");
  }, 60000);

  it("forced build keeps original text if an essential command was removed", () => {
    const rom = makeFixture();
    const original = String.raw`B\x03`;
    const missing = "Broken";
    const good = String.raw`Working\x03`;
    const edits = { [GS2_TEXT_FILE + ":9"]: missing, [GS2_TEXT_FILE + ":10"]: good };
    const result = buildGoldenSun2StringTable(rom, edits, { forceBuild: true });
    expect(result.skippedUnsafeTranslations).toBe(1);
    expect(result.skippedIndexes).toEqual([9]);
    expect(result.translatedLines).toBe(1);
    const entries = extractGoldenSun2Strings(result.rom);
    expect(entries[9].original).toBe(original);
    expect(entries[10].original).toBe(good);
    expect(edits[GS2_TEXT_FILE + ":9"]).toBe(missing);
  }, 60000);

  it("forced build skips Arabic without the required font patch rather than destroying text", () => {
    const rom = makeFixture();
    const result = buildGoldenSun2StringTable(rom, {
      [GS2_TEXT_FILE + ":2"]: String.raw`مرحبًا\x03`,
    }, { forceBuild: true });
    expect(result.skippedUnsafeTranslations).toBe(1);
    expect(result.translatedLines).toBe(0);
    expect(result.rom.length).toBe(rom.length);
    expect(result.skippedIndexes).toEqual([2]);
  }, 30000);

  it("forced build skips only a ROM-format overlong compressed record and repacks other edits", () => {
    const rom = makeFixture();
    const key9 = GS2_TEXT_FILE + ":9";
    const key10 = GS2_TEXT_FILE + ":10";
    const veryLong = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ".repeat(100) + "\\x03";
    expect(() => buildGoldenSun2StringTable(rom, { [key9]: veryLong }))
      .toThrow(/حجمه بعد الضغط/);
    const built = buildGoldenSun2StringTable(rom, {
      [key9]: veryLong, [key10]: "Working\\x03",
    }, { forceBuild: true });
    expect(built.skippedIndexes).toEqual([9]);
    expect(built.skippedUnsafeTranslations).toBe(1);
    expect(built.translatedLines).toBe(1);
    const extracted = extractGoldenSun2Strings(built.rom);
    expect(extracted[9].original).toBe(String.raw`B\x03`);
    expect(extracted[10].original).toBe(String.raw`Working\x03`);
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
    rom.set([0xd2, 0xf0, 0x18, 0xfa], 0x3accc);
    rom.set([0xcb, 0xf0, 0x31, 0xf8], 0x4209a);
    rom.set([0xca, 0xf0, 0xc4, 0xff], 0x42174);
    rom.set([0xca, 0xf0, 0xff, 0xfe], 0x422fe);
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
