import { describe, expect, it } from "vitest";
import { measureEntryBytes } from "@/lib/entry-bytes";
import { buildFireEmblem12Rom, extractFireEmblem12Entries } from "./fe12-editor-bridge";
import { buildSyntheticFont, busyRaster } from "./fe12-font-test-fixtures";
import { buildFe12TextFile, parseFe12TextFile, type Fe12TextFile } from "./fe12-textfile";
import { compressLz11, decompressLz11 } from "./nds-lz";
import { indexNitroFs, readNitroFsFile } from "./nds-rom";
import { buildSyntheticRom } from "./nds-test-fixtures";

const OPEN = String.fromCharCode(0x10);
const CLOSE = String.fromCharCode(0x01, 0x40, 0x01, 0x68);

/** Hand-authors a text-file source (bypassing parseFe12TextFile) and serializes it with the real builder, so the fixture is guaranteed structurally valid without needing to test the format twice. Records with identical text share one input textOffset, exactly as the real game's own asset build would naturally dedupe identical strings — that is what lets the "duplicate record" case be exercised at all. */
function buildTextFileBytes(records: { key: string; text: string }[]): Uint8Array {
  let keyCursor = 0;
  const keyChunks: string[] = [];
  const textOffsetByText = new Map<string, number>();
  const source: Fe12TextFile = {
    totalSize: 0,
    reserved: 0,
    keyBlob: new Uint8Array(0),
    records: records.map((r, i) => {
      const keyOffset = keyCursor;
      keyChunks.push(`${r.key}\0`);
      keyCursor += r.key.length + 1;
      const textOffset = textOffsetByText.get(r.text) ?? i;
      textOffsetByText.set(r.text, textOffset);
      return { index: i, key: r.key, text: r.text, textOffset, keyOffset };
    }),
  };
  const keyBlobString = keyChunks.join("");
  source.keyBlob = Uint8Array.from(Array.from(keyBlobString, (c) => c.charCodeAt(0)));
  return buildFe12TextFile(source);
}

function buildFixtureRom() {
  const systemFileBytes = buildTextFileBytes([
    { key: "MJID_MERCENARY", text: "Mercenary" }, // plain, translatable
    { key: "MSEX_M", text: "Male" }, // plain, translatable
    { key: "MPID_ANNA", text: `${OPEN}Welcome!\nToday, another hero will be born.${CLOSE}` }, // wrapped, translatable
    { key: "MBAD_MULTI", text: `${OPEN}a${OPEN}b${CLOSE}` }, // two opens — excluded
    { key: "MBAD_CTRL", text: "x\x05y" }, // stray control byte — excluded
    { key: "MJID_MERCENARY_DUP", text: "Mercenary" }, // same original text, different key — will share an offset once parsed
  ]);
  const systemCompressed = compressLz11(systemFileBytes);

  const kanjiGlyphs = Array.from({ length: 130 }, (_, i) => ({ code: 0x8940 + i, width: 12, raster: busyRaster(i) }));
  const fontBytes = buildSyntheticFont(kanjiGlyphs, 60);

  return buildSyntheticRom(
    [
      { path: "m/System", data: systemCompressed },
      { path: "fonts/talk", data: fontBytes },
    ],
    { capacityMiB: 1 }
  );
}

describe("fe12-editor-bridge", () => {
  it("extracts translatable records and excludes ones with unrecognized control-code structure", () => {
    const { rom } = buildFixtureRom();
    const imported = extractFireEmblem12Entries(rom);

    const labels = imported.entries.map((e) => e.label);
    expect(labels.some((l) => l.includes("MJID_MERCENARY"))).toBe(true);
    expect(labels.some((l) => l.includes("MSEX_M"))).toBe(true);
    expect(labels.some((l) => l.includes("MPID_ANNA"))).toBe(true);
    expect(labels.some((l) => l.includes("MBAD_MULTI"))).toBe(false);
    expect(labels.some((l) => l.includes("MBAD_CTRL"))).toBe(false);
    // The duplicate-text record shares an offset with MJID_MERCENARY, so it
    // should not appear as a second independent row.
    expect(labels.some((l) => l.includes("MJID_MERCENARY_DUP"))).toBe(false);

    expect(imported.excludedRecordCount).toBeGreaterThanOrEqual(2);

    const wrapped = imported.entries.find((e) => e.label.includes("MPID_ANNA"))!;
    expect(wrapped.original).toBe("Welcome!\nToday, another hero will be born.");
    expect(wrapped.msbtFile).toBe("fe12/m/System");
  });

  it("caps class-name (MJID_) records at their original length, and leaves other records uncapped", () => {
    const { rom } = buildFixtureRom();
    const imported = extractFireEmblem12Entries(rom);

    const mercenaryEntry = imported.entries.find((e) => e.label.includes("MJID_MERCENARY"))!;
    expect(mercenaryEntry.maxBytes).toBe("Mercenary".length);

    const maleEntry = imported.entries.find((e) => e.label.includes("MSEX_M"))!;
    expect(maleEntry.maxBytes).toBe(0);

    const wrapped = imported.entries.find((e) => e.label.includes("MPID_ANNA"))!;
    expect(wrapped.maxBytes).toBe(0);
  });

  it("measures fe12 translation length the way it will actually be written to the ROM, not raw UTF-8", () => {
    // Plain ASCII: one byte per character, same as UTF-8.
    expect(measureEntryBytes("fe12/m/System", "TestArab!")).toBe(9);
    // Every mapped Arabic presentation form costs 2 bytes (its Shift-JIS-style
    // font code), not the 2-3 UTF-8 bytes a raw codepoint would take — and
    // the count matches the shaped+reversed form count, not the input length.
    // "مرتزق" shapes+reverses to 5 presentation forms -> 10 bytes.
    expect(measureEntryBytes("fe12/m/System", "مرتزق")).toBe(10);
    // A character with no slot in the 124-form charmap (e.g. tatweel) is
    // dropped at build time, so it must count as 0 bytes here too.
    expect(measureEntryBytes("fe12/m/System", "ـ")).toBe(0);
  });

  it("builds a ROM with the translated text encoded through the Arabic charmap, preserving the dialogue wrapper", () => {
    const { rom } = buildFixtureRom();
    const imported = extractFireEmblem12Entries(rom);
    const mercenaryEntry = imported.entries.find((e) => e.label.includes("MJID_MERCENARY"))!;
    const annaEntry = imported.entries.find((e) => e.label.includes("MPID_ANNA"))!;

    const translations: Record<string, string> = {
      [`${mercenaryEntry.msbtFile}:${mercenaryEntry.index}`]: "مرتزق",
      [`${annaEntry.msbtFile}:${annaEntry.index}`]: "مرحبا",
    };

    const result = buildFireEmblem12Rom(rom, imported.entries, translations);
    expect(result.translatedLines).toBe(2);
    expect(result.unsupportedCharacters).toEqual([]);

    const newIndex = indexNitroFs(result.buffer);
    const systemRaw = readNitroFsFile(result.buffer, newIndex.byPath.get("m/System")!);
    const systemDecompressed = systemRaw[0] === 0x11 ? decompressLz11(systemRaw) : systemRaw;
    const rebuilt = parseFe12TextFile(systemDecompressed);

    const mercenaryRecord = rebuilt.records.find((r) => r.key === "MJID_MERCENARY")!;
    expect(mercenaryRecord.text).not.toBe("Mercenary");
    // "مرتزق" shapes+reverses to 5 presentation forms -> 5 two-byte codes = 10 chars.
    // (A pair's low byte can legitimately be < 0x80 — e.g. 0x45 — so this checks
    // pair count/lead bytes, not "every char is >= 0x80".)
    expect(mercenaryRecord.text.length).toBe(10);
    for (let i = 0; i < mercenaryRecord.text.length; i += 2) {
      expect(mercenaryRecord.text.charCodeAt(i)).toBeGreaterThanOrEqual(0x80);
    }

    const annaRecord = rebuilt.records.find((r) => r.key === "MPID_ANNA")!;
    expect(annaRecord.text.startsWith(OPEN)).toBe(true);
    expect(annaRecord.text.endsWith(CLOSE)).toBe(true);

    // An untouched record (Male) must survive completely unchanged.
    const maleRecord = rebuilt.records.find((r) => r.key === "MSEX_M")!;
    expect(maleRecord.text).toBe("Male");
  });

  it("always patches the font even when nothing is translated", () => {
    const { rom } = buildFixtureRom();
    const imported = extractFireEmblem12Entries(rom);
    const result = buildFireEmblem12Rom(rom, imported.entries, {});
    expect(result.translatedLines).toBe(0);

    const newIndex = indexNitroFs(result.buffer);
    const fontData = readNitroFsFile(result.buffer, newIndex.byPath.get("fonts/talk")!);
    expect(fontData.length).toBeGreaterThan(0);
    // The untranslated text file must be byte-identical to the source (never rewritten).
    const originalIndex = indexNitroFs(rom);
    const originalSystem = readNitroFsFile(rom, originalIndex.byPath.get("m/System")!);
    const rebuiltSystem = readNitroFsFile(result.buffer, newIndex.byPath.get("m/System")!);
    expect(Array.from(rebuiltSystem)).toEqual(Array.from(originalSystem));
  });

  it("reports an unsupported character instead of throwing, and drops only that character", () => {
    const { rom } = buildFixtureRom();
    const imported = extractFireEmblem12Entries(rom);
    const mercenaryEntry = imported.entries.find((e) => e.label.includes("MJID_MERCENARY"))!;
    // U+0640 (Arabic tatweel) is not in the 124-form charmap.
    const translations: Record<string, string> = { [`${mercenaryEntry.msbtFile}:${mercenaryEntry.index}`]: "ـ" };
    const result = buildFireEmblem12Rom(rom, imported.entries, translations);
    expect(result.unsupportedCharacters.length).toBeGreaterThan(0);
    expect(result.unsupportedCharacters[0].character).toBe("ـ");
  });

  it("ignores blank/whitespace-only translations (leaves the record untranslated)", () => {
    const { rom } = buildFixtureRom();
    const imported = extractFireEmblem12Entries(rom);
    const mercenaryEntry = imported.entries.find((e) => e.label.includes("MJID_MERCENARY"))!;
    const translations: Record<string, string> = { [`${mercenaryEntry.msbtFile}:${mercenaryEntry.index}`]: "   " };
    const result = buildFireEmblem12Rom(rom, imported.entries, translations);
    expect(result.translatedLines).toBe(0);
  });
});
