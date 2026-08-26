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
  gtaIvArabicPresentationFormInputUnits,
  validateGtaIvDollarAmountSequence,
  validateGtaIvRuntimeTokenSequence,
} from "./gxt-format";
import { buildGtaIvAmericanOutput, extractGtaIvEntries } from "./gtaiv-editor-bridge";

function makeGxt(crc = 0x12345678): ArrayBuffer {
  const bytes = new Uint8Array(72);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 4, true);
  view.setUint16(2, 16, true);
  bytes.set([0x54, 0x41, 0x42, 0x4c], 4); // TABL
  view.setUint32(8, 12, true);
  bytes.set([0x4d, 0x41, 0x49, 0x4e], 12); // MAIN
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

  it("uses the verified consecutive original-English input units for shaped Arabic Presentation Forms", () => {
    const encoded = encodeGtaIvArabicText("", "تؤبسك");
    expect(encoded.processedText).toBe("ﻚﺴﺑﺆﺗ");
    expect(Array.from(encoded.textUnits)).toEqual([202, 164, 129, 118, 135]);

    const alef = encodeGtaIvArabicText("", "ا");
    expect(alef.processedText).toBe("ﺍ");
    expect(Array.from(alef.textUnits)).toEqual([125]);
  });

  it("maps every Arabic Presentation Form to the matching original-English input unit", () => {
    expect(gtaIvArabicPresentationFormInputUnits).toHaveLength(144);
    expect(new Set(gtaIvArabicPresentationFormInputUnits).size).toBe(144);
    expect(gtaIvArabicInputUnitForPresentationForm(0xfe70)).toBe(96);
    expect(gtaIvArabicInputUnitForPresentationForm(0xfe99)).toBe(137);
    expect(gtaIvArabicInputUnitForPresentationForm(0xfee0)).toBe(208);
    expect(gtaIvArabicInputUnitForPresentationForm(0xfef9)).toBe(233);
    expect(gtaIvArabicInputUnitForPresentationForm(0xfeff)).toBe(239);
    for (let index = 0; index < 144; index += 1) {
      expect(gtaIvArabicInputUnitForPresentationForm(0xfe70 + index))
        .toBe(96 + index);
      expect(gtaIvArabicPresentationFormInputUnits[index]).toBe(96 + index);
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

  it("refuses an Arabic character not represented by English v3", () => {
    expect(() => encodeGtaIvArabicText("", "پ")).toThrow("غير مدعوم");
  });

  it("reports each unsupported GTA IV English-font character with its code point and count", () => {
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

  it("builds american.gxt from the shared editor identity and re-parses the encoded row", () => {
    const source = makeGxt(0x00009b22);
    const imported = extractGtaIvEntries(source);
    const row = imported.entries[0];
    const result = buildGtaIvAmericanOutput(source, imported.entries, {
      [`${row.msbtFile}:${row.index}`]: "تؤبسك",
    });
    expect(result).toMatchObject({ filename: "american.gxt", translatedLines: 1 });
    const output = parseGtaIvGxt(result.buffer);
    expect(Array.from(output.tables[0].entries[0].textUnits)).toEqual([202, 164, 129, 118, 135]);
    expect(extractGtaIvEntries(result.buffer).entries[0].original)
      .toBe(gtaIvRawUnitsToString(new Uint16Array([202, 164, 129, 118, 135])));
    expect(decodeGtaIvArabicFontUnits(output.tables[0].entries[0].textUnits, true)).toBe("تؤبسك");
  });

  it("refuses a mixed GXT that would render an untranslated English lowercase letter as Arabic art", () => {
    const source = makeGxt(0x00009b22);
    const sourceBytes = new Uint8Array(source);
    // TDAT contains `ab\0`: both visible units fall inside 96..239.
    sourceBytes.set([0x61, 0x00, 0x62, 0x00, 0x00, 0x00], 48);
    const imported = extractGtaIvEntries(source);
    expect(() => buildGtaIvAmericanOutput(source, imported.entries, {})).toThrow(
      "تستخدم محارف إنجليزية مرئية في نطاق وحدات العربية 96–239",
    );
  });

});
