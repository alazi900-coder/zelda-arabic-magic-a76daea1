import { describe, expect, it } from "vitest";
import { black2EntryKeyFromId } from "./black2-json";
import {
  exportBlack2EnglishOnlyJson, isBlack2EnglishOnlyDocument,
  parseBlack2EnglishOnlyJson, validateBlack2EnglishOnlyTranslation,
} from "./black2-english-only";

const source = {
  metadata: {
    game: "Pokémon Black 2",
    source_rom: "Pokemon - Black Version 2 (USA, Europe) (NDSi Enhanced).nds",
    count: 3,
    description: "English-only messages with original IDs and control tokens",
  },
  entries: [
    { id: "a/0/0/2:0001:0:0000", english: "HP/PP" },
    { id: "a/0/0/2:0007:0:0001", english: "Hello[CTRL:BE00]\n[CTRL:0100:0000] travels.[CTRL:BE01]" },
    { id: "a/0/0/3:0675:0:0017", english: "GTS" },
  ],
};

describe("Pokémon Black 2 compact English-only JSON", () => {
  it("recognizes the attached metadata/entries/id/english schema, not the legacy banks schema", () => {
    expect(isBlack2EnglishOnlyDocument(source)).toBe(true);
    expect(isBlack2EnglishOnlyDocument({ ...source, banks: [] })).toBe(false);
    expect(isBlack2EnglishOnlyDocument({ ...source, entries: [] })).toBe(false);
  });

  it("imports original 4-part IDs into the shared editor without losing source metadata", () => {
    const { document, entries, translations } = parseBlack2EnglishOnlyJson(JSON.stringify(source));
    expect(document.metadata).toEqual(source.metadata);
    expect(entries.map(e => e.original)).toEqual(source.entries.map(e => e.english));
    expect(entries[0].msbtFile).toBe("black2/a/0/0/2/bank_1/section_0");
    expect(entries[1].index).toBe(1);
    expect(translations).toEqual({});
  });

  it("exports in the identical envelope, preserving metadata and untranslated objects", () => {
    const { document, entries } = parseBlack2EnglishOnlyJson(JSON.stringify(source));
    const key = black2EntryKeyFromId(source.entries[1].id)!;
    const arabic = "مرحبًا[CTRL:BE00]\n[CTRL:0100:0000] يسافر.[CTRL:BE01]";
    const exported = exportBlack2EnglishOnlyJson(document, entries, { [key]: arabic });
    expect(Object.keys(exported)).toEqual(Object.keys(source));
    expect(exported.metadata).toEqual(source.metadata);
    expect(exported.entries.map(row => row.id)).toEqual(source.entries.map(row => row.id));
    expect(exported.entries.map(row => row.english)).toEqual(source.entries.map(row => row.english));
    expect(exported.entries[0]).toEqual(source.entries[0]);
    expect(exported.entries[2]).toEqual(source.entries[2]);
    expect(exported.entries[1]).toEqual({ ...source.entries[1], arabic });

    const reimported = parseBlack2EnglishOnlyJson(JSON.stringify(exported));
    expect(reimported.translations[key]).toBe(arabic);
    expect(exportBlack2EnglishOnlyJson(reimported.document, reimported.entries, {}).entries).toEqual(exported.entries);
  });

  it("keeps already translated rows and optional extra fields unchanged", () => {
    const translated = {
      ...source,
      entries: [
        { ...source.entries[0], arabic: "الصحة/نقاط القوة", note: "unchanged field" },
        source.entries[1], source.entries[2],
      ],
    };
    const imported = parseBlack2EnglishOnlyJson(JSON.stringify(translated));
    const result = exportBlack2EnglishOnlyJson(imported.document, imported.entries, imported.translations);
    expect(result.entries[0]).toEqual(translated.entries[0]);
    expect(result.entries[1]).toEqual(translated.entries[1]);
  });

  it("rejects missing or changed tags and changed physical line locations", () => {
    const english = source.entries[1].english;
    expect(validateBlack2EnglishOnlyTranslation(english, "مرحبا\nيسافر")).toBeTruthy();
    expect(validateBlack2EnglishOnlyTranslation(english, "مرحبًا[CTRL:BE00] [CTRL:0100:0000] يسافر.[CTRL:BE01]")).toBeTruthy();
    expect(validateBlack2EnglishOnlyTranslation(english, "مرحبًا[CTRL:0100:0000]\nيسافر.[CTRL:BE00][CTRL:BE01]")).toBeTruthy();
    expect(validateBlack2EnglishOnlyTranslation(english, "مرحبًا[CTRL:BE00]\n[CTRL:0100:0000] يسافر.[CTRL:BE01]")).toBeNull();
  });

  it("rejects incorrect count, duplicate IDs and invalid row types", () => {
    expect(() => parseBlack2EnglishOnlyJson(JSON.stringify({
      ...source, metadata: { ...source.metadata, count: 4 },
    }))).toThrow();
    expect(() => parseBlack2EnglishOnlyJson(JSON.stringify({
      ...source, entries: [source.entries[0], source.entries[0], source.entries[2]],
    }))).toThrow();
    expect(() => parseBlack2EnglishOnlyJson(JSON.stringify({
      ...source, entries: [source.entries[0], { id: "bad-id", english: "hi" }, source.entries[2]],
    }))).toThrow();
    expect(() => parseBlack2EnglishOnlyJson(JSON.stringify({
      ...source, entries: [source.entries[0], { ...source.entries[1], arabic: 12 }, source.entries[2]],
    }))).toThrow();
  });

  it("handles all 8,684 rows in the uploaded-file shape without altering IDs or ordering", () => {
    const sample = {
      metadata: { ...source.metadata, count: 8684 },
      entries: Array.from({ length: 8684 }, (_, i) => ({
        id: `a/0/0/${i % 2 === 0 ? 2 : 3}:${String(Math.floor(i / 100)).padStart(4, "0")}:0:${String(i % 100).padStart(4, "0")}`,
        english: i % 3 ? "Hello" : "Hello[CTRL:BE01]\nWorld",
      })),
    };
    const { document, entries, translations } = parseBlack2EnglishOnlyJson(JSON.stringify(sample));
    const output = exportBlack2EnglishOnlyJson(document, entries, translations);
    expect(output.metadata).toEqual(sample.metadata);
    expect(output.entries).toEqual(sample.entries);
  });
});
