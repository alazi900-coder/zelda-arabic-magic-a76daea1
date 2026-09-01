import { describe, expect, it } from "vitest";
import {
  decodeGtaIvArabicFontUnits,
  gtaIvHashKey,
  gtaIvRawUnitsToString,
  encodeGtaIvArabicText,
  inspectGtaIvGxt,
  inspectGtaIvOxt,
  parseGtaIvGxt,
  parseGtaIvOxt,
  rebuildGtaIvGxt,
  reconcileGtaIvOxtWithGxt,
  repairGtaIvDollarAmountSequence,
  repairGtaIvRuntimeTokenSequence,
  analyzeGtaIvUnsupportedCharacters,
  gtaIvArabicInputUnitForPresentationForm,
  validateGtaIvDollarAmountSequence,
  validateGtaIvRuntimeTokenSequence,
} from "./gxt-format";
import { buildGtaIvRuOutput, extractGtaIvEntries } from "./gtaiv-editor-bridge";
import { GTAIV_RU_CODEPOINT_TO_UNIT, GTAIV_RU_CUSTOM_UNITS, GTAIV_RU_UNIT_TO_CODEPOINT } from "./gtaiv-ru-charmap";

/** Looks up the unit for a logical Arabic char the same way the encoder does: shape it, then map. */
function ruUnitsFor(logicalArabic: string): number[] {
  return Array.from(encodeGtaIvArabicText("", logicalArabic).textUnits);
}

function makeGxt(crc = 0x12345678, tableName = "MAIN"): ArrayBuffer {
  const bytes = new Uint8Array(72);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 4, true);
  view.setUint16(2, 16, true);
  bytes.set([0x54, 0x41, 0x42, 0x4c], 4); // TABL
  view.setUint32(8, 12, true);
  bytes.set(new TextEncoder().encode(tableName.slice(0, 8)), 12); // table name, zero-padded
  view.setUint32(20, 24, true);
  bytes.set([0x54, 0x4b, 0x45, 0x59], 24); // TKEY
  view.setUint32(28, 8, true);
  view.setUint32(32, 0, true);
  view.setUint32(36, crc, true);
  bytes.set([0x54, 0x44, 0x41, 0x54], 40); // TDAT
  view.setUint32(44, 6, true);
  bytes.set([0x48, 0x00, 0x69, 0x00, 0x00, 0x00], 48);
  return bytes.buffer;
}

describe("GTA IV GXT/OXT structural reader", () => {
  it("reads a Version 4, CharSize 16 GXT table and retains raw text units", () => {
    const summary = inspectGtaIvGxt(makeGxt());
    const parsed = parseGtaIvGxt(makeGxt());
    expect(summary).toMatchObject({ version: 4, charSize: 16, entries: 1 });
    expect(summary.tables[0]).toMatchObject({ name: "MAIN", entries: 1, textBytes: 6 });
    expect(Array.from(parsed.tables[0].entries[0].textUnits)).toEqual([0x48, 0x69]);
    expect(parsed.tables[0].entries[0].crc).toBe(0x12345678);
    expect(gtaIvRawUnitsToString(parsed.tables[0].entries[0].textUnits)).toBe("Hi");
  });

  it("rejects a malformed GXT header before reading any table", () => {
    const malformed = makeGxt().slice(0);
    new DataView(malformed).setUint16(2, 8, true);
    expect(() => inspectGtaIvGxt(malformed)).toThrow("CharSize 8");
  });

  it("uses the documented GTA IV key identity algorithm for known OXT keys", () => {
    expect(gtaIvHashKey("T182_645")).toBe(0x00009b22);
    expect(gtaIvHashKey('"T182_645"')).toBe(0x00009b22);
    expect(gtaIvHashKey("SOME\\KEY")).toBe(gtaIvHashKey("some/key"));
  });

  it("parses named and numeric OXT keys while preserving values after the first equals sign", () => {
    const oxt = "Version 4\nCharSize 16\nNeedDecode False\nSingleFileTable False\nMAIN\n{\n\tT182_645 =Hi=a\n\t0x12345678 =\u01EA\u01A4\n}\n";
    const parsed = parseGtaIvOxt(oxt);
    expect(inspectGtaIvOxt(oxt)).toMatchObject({ version: 4, charSize: 16, tables: 1, entries: 2 });
    expect(parsed.tables[0].entries[0]).toMatchObject({ key: "T182_645", keyKind: "named", crc: 0x00009b22, value: "Hi=a" });
    expect(Array.from(parsed.tables[0].entries[1].textUnits)).toEqual([0x01ea, 0x01a4]);
  });

  it("reconciles OXT rows by table and CRC, not by duplicate text content", () => {
    const gxt = parseGtaIvGxt(makeGxt(0x00009b22));
    const oxt = parseGtaIvOxt("Version 4\nCharSize 16\nNeedDecode False\nSingleFileTable False\nMAIN\n{\n\tT182_645 =Hi\n}\n");
    const identities = reconcileGtaIvOxtWithGxt(gxt, oxt);
    expect(identities).toHaveLength(1);
    expect(identities[0]).toMatchObject({ table: "MAIN", key: "T182_645", crc: 0x00009b22 });
    expect(identities[0].gxtEntry).not.toBeNull();
  });

  it("returns a byte-identical GXT when no replacement is requested", () => {
    const source = makeGxt(0x00009b22);
    expect(Array.from(new Uint8Array(rebuildGtaIvGxt(source)))).toEqual(Array.from(new Uint8Array(source)));
  });

  it("rebuilds TDAT offsets while preserving CRC even when runtime tokens change", () => {
    const source = makeGxt(0x00009b22);
    const rebuilt = rebuildGtaIvGxt(source, [{ table: "MAIN", crc: 0x00009b22, textUnits: new Uint16Array([0x41, 0x42, 0x43]) }]);
    const parsed = parseGtaIvGxt(rebuilt);
    expect(parsed.tables[0].entries[0].crc).toBe(0x00009b22);
    expect(Array.from(parsed.tables[0].entries[0].textUnits)).toEqual([0x41, 0x42, 0x43]);

    // A binary GXT unit of 126 must never be decoded as ASCII tilde while
    // rebuilding and therefore must not trigger token validation.
    const encodedUnit126 = parseGtaIvGxt(rebuildGtaIvGxt(source, [{
      table: "MAIN",
      crc: 0x00009b22,
      textUnits: new Uint16Array([126]),
    }]));
    expect(Array.from(encodedUnit126.tables[0].entries[0].textUnits)).toEqual([126]);

    const protectedSource = makeGxt(0x00009b22);
    const sourceView = new DataView(protectedSource);
    sourceView.setUint32(44, 10, true);
    new Uint8Array(protectedSource).set([0x7e, 0x00, 0x6e, 0x00, 0x7e, 0x00, 0x00, 0x00, 0x00, 0x00], 48);
    const tokenChanged = parseGtaIvGxt(rebuildGtaIvGxt(protectedSource, [{ table: "MAIN", crc: 0x00009b22, textUnits: new Uint16Array([0x41]) }]));
    expect(Array.from(tokenChanged.tables[0].entries[0].textUnits)).toEqual([0x41]);
  });

  it("keeps source GTA IV runtime tokens ordered, permits added ~n~, and rejects a lone tilde", () => {
    expect(validateGtaIvRuntimeTokenSequence("~x~ Hello ~n~~z~", "~x~ نص ~n~~z~")).toMatchObject({ valid: true });
    expect(validateGtaIvRuntimeTokenSequence("~x~ Hello ~n~~z~", "~x~ نص ~z~~n~")).toMatchObject({ valid: false });
    expect(validateGtaIvRuntimeTokenSequence("~r~ Hello ~z~", "~r~ مرحبا ~n~ بالعالم ~z~")).toMatchObject({ valid: true });
    expect(validateGtaIvRuntimeTokenSequence("~r~ Hello ~z~", "~r~ مرحبا ~g~ بالعالم ~z~")).toMatchObject({ valid: false });
    expect(validateGtaIvRuntimeTokenSequence("Hello", "نص ~")).toMatchObject({ valid: false });
  });

  it("repairs only changed complete GTA IV token slots and refuses malformed token layouts", () => {
    expect(repairGtaIvRuntimeTokenSequence("~r~ Hello ~n~", "~g~ مرحبا ~n~"))
      .toMatchObject({ text: "~r~ مرحبا ~n~", changed: true, safe: true });
    expect(repairGtaIvRuntimeTokenSequence("~r~ Hello ~n~", "مرحبا ~n~"))
      .toMatchObject({ text: "مرحبا ~n~", changed: false, safe: false });
    expect(repairGtaIvRuntimeTokenSequence("~r~ Hello", "~r~ مرحبا ~n~"))
      .toMatchObject({ text: "~r~ مرحبا ~n~", changed: false, safe: true });
    expect(repairGtaIvRuntimeTokenSequence("Hello", "مرحبا ~"))
      .toMatchObject({ text: "مرحبا ~", changed: false, safe: false });
  });

  it("requires ordered GTA IV dollar values and repairs only matching amount slots", () => {
    expect(validateGtaIvDollarAmountSequence("Pay $100 then $20m", "ادفع $100 ثم $20m"))
      .toMatchObject({ valid: true });
    expect(validateGtaIvDollarAmountSequence("Pay $100 then $20m", "ادفع $20m ثم $100"))
      .toMatchObject({ valid: false });
    expect(validateGtaIvDollarAmountSequence("Pay $100", "ادفع $200"))
      .toMatchObject({ valid: false });
    expect(repairGtaIvDollarAmountSequence("Pay $100 then $20m", "ادفع $200 ثم $20m"))
      .toMatchObject({ text: "ادفع $200 ثم $20m", changed: false, safe: false });
    expect(repairGtaIvDollarAmountSequence("Pay $100", "ادفع الآن"))
      .toMatchObject({ text: "ادفع الآن", changed: false, safe: false });
    expect(repairGtaIvDollarAmountSequence("Pay $100", "ادفع $100 و$20"))
      .toMatchObject({ text: "ادفع $100 و$20", changed: false, safe: false });
  });

  it("normalizes equivalent Arabic and reversed dollar spellings back to the English source literal", () => {
    const source = "Pay $700 then $20m";
    for (const candidate of [
      "ادفع 700$ ثم 20m$",
      "ادفع ٧٠٠$ ثم 20m$",
      "ادفع 700 دولار ثم 20m$",
      "ادفع ٧٠٠ دولار ثم 20m$",
    ]) {
      expect(validateGtaIvDollarAmountSequence(source, candidate)).toMatchObject({ valid: true });
      expect(repairGtaIvDollarAmountSequence(source, candidate))
        .toMatchObject({ text: "ادفع $700 ثم $20m", changed: true, safe: true });
    }
  });

  it("restores a localized decimal dollar price to the exact English source literal", () => {
    const source = "Now under $100 by a nickel: $99.95.";
    const candidate = "الآن بأقل من 100 دولار بخمسة سنتات: 99,95 دولار.";
    expect(validateGtaIvDollarAmountSequence(source, candidate)).toMatchObject({ valid: true });
    expect(repairGtaIvDollarAmountSequence(source, candidate))
      .toMatchObject({ text: "الآن بأقل من $100 بخمسة سنتات: $99.95.", changed: true, safe: true });
    expect(repairGtaIvDollarAmountSequence(source, "الآن بأقل من 100 دولار: 99,94 دولار."))
      .toMatchObject({ changed: false, safe: false });
  });

  it("normalizes explicit Arabic million wordings only when they equal the GTA IV m value", () => {
    const source = "Prize: $10m then $2m";
    for (const candidate of [
      "الجائزة: 10 ملايين دولار ثم 2 مليون دولار",
      "الجائزة: ١٠ ملايين دولار ثم ٢ مليون دولار",
      "الجائزة: 10,000,000 دولار ثم 2,000,000 دولار",
    ]) {
      expect(validateGtaIvDollarAmountSequence(source, candidate)).toMatchObject({ valid: true });
      expect(repairGtaIvDollarAmountSequence(source, candidate))
        .toMatchObject({ text: "الجائزة: $10m ثم $2m", changed: true, safe: true });
    }

    expect(repairGtaIvDollarAmountSequence("Prize: $10m", "الجائزة: 11 ملايين دولار"))
      .toMatchObject({ text: "الجائزة: 11 ملايين دولار", changed: false, safe: false });
    expect(repairGtaIvDollarAmountSequence("Prize: $10m", "الجائزة: 10 ملايين دولار و1 مليون دولار"))
      .toMatchObject({ text: "الجائزة: 10 ملايين دولار و1 مليون دولار", changed: false, safe: false });
    expect(repairGtaIvDollarAmountSequence("Prize: $10m", "الجائزة: 10 ملايين"))
      .toMatchObject({ text: "الجائزة: 10 ملايين", changed: false, safe: false });
  });

  it("never guesses missing, extra, or different GTA IV dollar values", () => {
    expect(repairGtaIvDollarAmountSequence("Pay $700", "ادفع 701$"))
      .toMatchObject({ text: "ادفع 701$", changed: false, safe: false });
    expect(repairGtaIvDollarAmountSequence("Pay $700", "ادفع ٧٠١ دولار"))
      .toMatchObject({ text: "ادفع ٧٠١ دولار", changed: false, safe: false });
    expect(repairGtaIvDollarAmountSequence("Pay $700", "ادفع الآن"))
      .toMatchObject({ text: "ادفع الآن", changed: false, safe: false });
    expect(repairGtaIvDollarAmountSequence("Pay $700", "ادفع 700$ و$20"))
      .toMatchObject({ text: "ادفع 700$ و$20", changed: false, safe: false });
  });

  it("uses the Russian-slot mod's own measured glyph units for shaped Arabic Presentation Forms", () => {
    const encoded = encodeGtaIvArabicText("", "تؤبسك");
    expect(encoded.processedText).toBe("ﻚﺴﺑﺆﺗ");
    expect(Array.from(encoded.textUnits)).toEqual(
      [...encoded.processedText].map((char) => GTAIV_RU_CODEPOINT_TO_UNIT.get(char.charCodeAt(0))),
    );

    const alef = encodeGtaIvArabicText("", "ا");
    expect(alef.processedText).toBe("ﺍ");
    expect(gtaIvArabicInputUnitForPresentationForm(alef.processedText.charCodeAt(0))).toBe(alef.textUnits[0]);
  });

  it("supports a standalone hamza — the shaping pipeline always emits its 0xFE80 presentation form, not the bare 0x0621 letter", () => {
    const hamza = encodeGtaIvArabicText("", "ء");
    expect(hamza.processedText).toBe("ﺀ");
    expect(hamza.processedText.charCodeAt(0)).toBe(0xfe80);
    expect(gtaIvArabicInputUnitForPresentationForm(0xfe80)).toBeDefined();
    expect(decodeGtaIvArabicFontUnits(hamza.textUnits, true)).toBe("ء");
    expect(() => encodeGtaIvArabicText("", "دعاء")).not.toThrow();
    expect(decodeGtaIvArabicFontUnits(encodeGtaIvArabicText("", "دعاء").textUnits, true)).toBe("دعاء");
  });

  it("maps every one of the mod's 124 measured glyph units to a distinct Arabic Presentation Form", () => {
    expect(GTAIV_RU_UNIT_TO_CODEPOINT.size).toBe(124);
    expect(new Set(GTAIV_RU_UNIT_TO_CODEPOINT.values()).size).toBe(124);
    expect(GTAIV_RU_CUSTOM_UNITS.size).toBe(124);
    // The map and its inverse must agree perfectly both ways — a round trip
    // through every unit and every code point returns to where it started.
    for (const [unit, codePoint] of GTAIV_RU_UNIT_TO_CODEPOINT) {
      expect(GTAIV_RU_CODEPOINT_TO_UNIT.get(codePoint)).toBe(unit);
      expect(gtaIvArabicInputUnitForPresentationForm(codePoint)).toBe(unit);
      expect(GTAIV_RU_CUSTOM_UNITS.has(unit)).toBe(true);
    }
  });

  it("decodes an explicitly identified Arabic GXT row without decoding English source ASCII", () => {
    const encoded = encodeGtaIvArabicText("", "تؤبسك");
    expect(decodeGtaIvArabicFontUnits(encoded.textUnits, true)).toBe("تؤبسك");
    expect(decodeGtaIvArabicFontUnits(new Uint16Array([0x48, 0x65, 0x6c, 0x70]))).toBe("Help");
    expect(decodeGtaIvArabicFontUnits(new Uint16Array([126]))).toBe("~");
  });

  it("keeps GTA IV runtime tokens byte-for-byte while encoding Arabic prose", () => {
    const encoded = encodeGtaIvArabicText("~r~ Hello ~n~", "~r~ مرحبا ~n~");
    expect(encoded.processedText).toContain("~r~");
    expect(encoded.processedText).toContain("~n~");
    expect(gtaIvRawUnitsToString(encoded.textUnits)).toMatch(/^~r~.*~n~$/);
    expect(Array.from(encoded.textUnits.slice(0, 3))).toEqual([0x7e, 0x72, 0x7e]);
  });

  it("encodes a lone tilde without blocking the GTA IV build path", () => {
    const encoded = encodeGtaIvArabicText("Original", "ترجمة ~ غير مكتملة");
    expect(encoded.processedText).toContain("~");
    expect(Array.from(encoded.textUnits)).toContain(0x7e);
  });

  it("encodes an editor-added GTA IV ~n~ marker while retaining source tokens", () => {
    const encoded = encodeGtaIvArabicText("~r~ Hello ~z~", "~r~ مرحبا ~n~ بالعالم ~z~");
    expect(encoded.processedText).toContain("~r~");
    expect(encoded.processedText).toContain("~n~");
    expect(encoded.processedText).toContain("~z~");
  });

  it("keeps a protected dollar amount readable as $100 while encoding Arabic prose", () => {
    const encoded = encodeGtaIvArabicText("Pay $100", "ادفع $100");
    expect(encoded.processedText).toContain("$100");
    expect(encoded.processedText).not.toContain("001$");
  });

  it("encodes an equivalent Arabic dollar spelling only after restoring the source literal", () => {
    const encoded = encodeGtaIvArabicText("Pay $700", "ادفع ٧٠٠ دولار");
    expect(encoded.processedText).toContain("$700");
    expect(encoded.processedText).not.toContain("دولار");
  });

  it("does not block GTA IV encoding when a dollar value differs", () => {
    const encoded = encodeGtaIvArabicText("Pay $700", "ادفع 701 دولار");
    expect(encoded.processedText).toContain("701");
  });

  it("encodes the rejected MAIN price sequence after normalizing its decimal comma", () => {
    const encoded = encodeGtaIvArabicText(
      "~z~Now you get the entire set, under a $100 by a nickel. $99.95. You are an idiot if you don't order.",
      "~z~الآن تحصل على المجموعة كاملة بأقل من 100 دولار بخمسة سنتات. 99,95 دولار. أنت أحمق إذا لم تطلبها.",
    );
    expect(encoded.processedText).toContain("$100");
    expect(encoded.processedText).toContain("$99.95");
  });

  it("encodes an explicit Arabic million wording only after restoring the source literal", () => {
    const encoded = encodeGtaIvArabicText("Prize: $10m", "الجائزة: 10 ملايين دولار");
    expect(encoded.processedText).toContain("$10m");
    expect(encoded.processedText).not.toContain("ملايين");
  });

  it("refuses an Arabic character not represented by the Russian-slot mod's font", () => {
    expect(() => encodeGtaIvArabicText("", "پ")).toThrow("غير مدعوم");
  });

  it("reports each unsupported character with its code point and count", () => {
    const report = analyzeGtaIvUnsupportedCharacters("قال «نعم» ثم «لا» ☃");
    expect(report.unsupported).toEqual([
      { character: "«", unicode: "U+00AB", count: 2 },
      { character: "»", unicode: "U+00BB", count: 2 },
      { character: "☃", unicode: "U+2603", count: 1 },
    ]);
  });

  it("preserves a verified Latin-1 glyph from the same English source row but refuses a new one", () => {
    expect(analyzeGtaIvUnsupportedCharacters("حقوق ©", "Copyright ©").unsupported).toEqual([]);
    expect(analyzeGtaIvUnsupportedCharacters("حقوق ©", "Copyright").unsupported).toEqual([
      { character: "©", unicode: "U+00A9", count: 1 },
    ]);
    const encoded = encodeGtaIvArabicText("Copyright ©", "حقوق ©");
    expect(Array.from(encoded.textUnits)).toContain(0x00a9);
    expect(() => encodeGtaIvArabicText("Copyright", "حقوق ©")).toThrow("U+00A9");
  });

  it("flags a line as needing mod translation only when its container row has none of the mod's Arabic glyph units", () => {
    const englishSource = makeGxt(0x00009b22);

    // no container given yet — flag stays undefined
    expect(extractGtaIvEntries(englishSource).entries[0].gtaivNeedsModTranslation).toBeUndefined();

    // container row still holds raw "Hi" — the mod never translated it
    const untranslatedContainer = makeGxt(0x00009b22);
    expect(extractGtaIvEntries(englishSource, untranslatedContainer).entries[0].gtaivNeedsModTranslation).toBe(true);

    // container row already uses one of the mod's Arabic units (194 = alef isolated)
    const translatedContainer = makeGxt(0x00009b22);
    new Uint8Array(translatedContainer).set([0xc2, 0x00, 0x00, 0x00], 48);
    expect(GTAIV_RU_CUSTOM_UNITS.has(194)).toBe(true);
    expect(extractGtaIvEntries(englishSource, translatedContainer).entries[0].gtaivNeedsModTranslation).toBe(false);

    // identity with no match in the container at all — never flagged (can't be built either way)
    const mismatchedContainer = makeGxt(0xdeadbeef);
    expect(extractGtaIvEntries(englishSource, mismatchedContainer).entries[0].gtaivNeedsModTranslation).toBe(false);
  });

  it("builds russian.gxt from an English source into a Russian container, matching table names case-insensitively", () => {
    const englishSource = makeGxt(0x00009b22, "MAIN");
    // The mod's own container spells its table name lowercase — a real,
    // measured difference between american.gxt and russian.gxt.
    const russianContainer = makeGxt(0x00009b22, "main");
    const imported = extractGtaIvEntries(englishSource);
    const row = imported.entries[0];
    expect(row.original).toBe("Hi");
    const result = buildGtaIvRuOutput(englishSource, russianContainer, imported.entries, {
      [`${row.msbtFile}:${row.index}`]: "تؤبسك",
    });
    expect(result).toMatchObject({ filename: "russian.gxt", translatedLines: 1, skippedNoContainerMatch: 0 });
    const output = parseGtaIvGxt(result.buffer);
    const expectedUnits = ruUnitsFor("تؤبسك");
    expect(Array.from(output.tables[0].entries[0].textUnits)).toEqual(expectedUnits);
    expect(decodeGtaIvArabicFontUnits(output.tables[0].entries[0].textUnits, true)).toBe("تؤبسك");
  });

  it("leaves an untranslated line exactly as the Russian container already had it", () => {
    const englishSource = makeGxt(0x00009b22);
    const russianContainer = makeGxt(0x00009b22);
    const imported = extractGtaIvEntries(englishSource);
    const result = buildGtaIvRuOutput(englishSource, russianContainer, imported.entries, {});
    expect(result.translatedLines).toBe(0);
    const output = parseGtaIvGxt(result.buffer);
    expect(Array.from(output.tables[0].entries[0].textUnits)).toEqual([0x48, 0x69]); // unchanged "Hi"
  });

  it("skips a translated line with no matching identity in the Russian container instead of failing the build", () => {
    const englishSource = makeGxt(0x00009b22);
    const russianContainer = makeGxt(0xdeadbeef); // different CRC — no match
    const imported = extractGtaIvEntries(englishSource);
    const row = imported.entries[0];
    const result = buildGtaIvRuOutput(englishSource, russianContainer, imported.entries, {
      [`${row.msbtFile}:${row.index}`]: "تؤبسك",
    });
    expect(result).toMatchObject({ translatedLines: 0, skippedNoContainerMatch: 1 });
  });

  it("leaves the Russian container's own untranslated content untouched, even if it already collides with an Arabic unit", () => {
    // The community mod's container is only partially translated; some
    // untouched rows still hold raw Latin-1 text that happens to collide
    // with a repainted Arabic unit. That is a pre-existing condition of the
    // container, not something this build introduces — it must not block.
    const englishSource = makeGxt(0x00009b22);
    const russianContainer = makeGxt(0x00009b22);
    const containerBytes = new Uint8Array(russianContainer);
    containerBytes.set([0x7b, 0x00, 0x7d, 0x00, 0x00, 0x00], 48); // `{}` — unit 123/125
    const imported = extractGtaIvEntries(englishSource);
    expect(GTAIV_RU_CUSTOM_UNITS.has(0x7b)).toBe(true);
    const result = buildGtaIvRuOutput(englishSource, russianContainer, imported.entries, {});
    expect(result.translatedLines).toBe(0);
    const output = parseGtaIvGxt(result.buffer);
    expect(Array.from(output.tables[0].entries[0].textUnits)).toEqual([0x7b, 0x7d]);
  });

  it("refuses a translation whose own processed text would land a literal character on one of the mod's Arabic units", () => {
    const englishSource = makeGxt(0x00009b22);
    const russianContainer = makeGxt(0x00009b22);
    const imported = extractGtaIvEntries(englishSource);
    const row = imported.entries[0];
    expect(GTAIV_RU_CUSTOM_UNITS.has(0x7b)).toBe(true);
    expect(() => buildGtaIvRuOutput(englishSource, russianContainer, imported.entries, {
      [`${row.msbtFile}:${row.index}`]: "مرحبا {",
    })).toThrow("تستخدم محارف مرئية تقع على إحدى خانات الخطّ العربي");
  });

});
