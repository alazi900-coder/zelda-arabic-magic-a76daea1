import { describe, expect, it } from "vitest";
import {
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

  it("rebuilds TDAT offsets while preserving CRC and rejects changed runtime tokens", () => {
    const source = makeGxt(0x00009b22);
    const rebuilt = rebuildGtaIvGxt(source, [{ table: "MAIN", crc: 0x00009b22, textUnits: new Uint16Array([0x41, 0x42, 0x43]) }]);
    const parsed = parseGtaIvGxt(rebuilt);
    expect(parsed.tables[0].entries[0].crc).toBe(0x00009b22);
    expect(Array.from(parsed.tables[0].entries[0].textUnits)).toEqual([0x41, 0x42, 0x43]);

    const protectedSource = makeGxt(0x00009b22);
    const sourceView = new DataView(protectedSource);
    sourceView.setUint32(44, 10, true);
    new Uint8Array(protectedSource).set([0x7e, 0x00, 0x6e, 0x00, 0x7e, 0x00, 0x00, 0x00, 0x00, 0x00], 48);
    expect(() => rebuildGtaIvGxt(protectedSource, [{ table: "MAIN", crc: 0x00009b22, textUnits: new Uint16Array([0x41]) }])).toThrow("رموز وقت التشغيل غير محفوظة");
  });

  it("requires exact ordered GTA IV runtime tokens and rejects a lone tilde", () => {
    expect(validateGtaIvRuntimeTokenSequence("~x~ Hello ~n~~z~", "~x~ نص ~n~~z~")).toMatchObject({ valid: true });
    expect(validateGtaIvRuntimeTokenSequence("~x~ Hello ~n~~z~", "~x~ نص ~z~~n~")).toMatchObject({ valid: false });
    expect(validateGtaIvRuntimeTokenSequence("Hello", "نص ~")).toMatchObject({ valid: false });
  });

  it("repairs only changed complete GTA IV token slots and refuses malformed token layouts", () => {
    expect(repairGtaIvRuntimeTokenSequence("~r~ Hello ~n~", "~g~ مرحبا ~n~"))
      .toMatchObject({ text: "~r~ مرحبا ~n~", changed: true, safe: true });
    expect(repairGtaIvRuntimeTokenSequence("~r~ Hello ~n~", "مرحبا ~n~"))
      .toMatchObject({ text: "مرحبا ~n~", changed: false, safe: false });
    expect(repairGtaIvRuntimeTokenSequence("~r~ Hello", "~r~ مرحبا ~n~"))
      .toMatchObject({ text: "~r~ مرحبا ~n~", changed: false, safe: false });
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

  it("shapes and encodes Arabic Presentation Forms through the audited English font map", () => {
    const encoded = encodeGtaIvArabicText("", "تؤبسك");
    expect(encoded.processedText).toBe("ﻚﺴﺑﺆﺗ");
    expect(Array.from(encoded.textUnits)).toEqual([410, 228, 193, 123, 199]);
  });

  it("keeps GTA IV runtime tokens byte-for-byte while encoding Arabic prose", () => {
    const encoded = encodeGtaIvArabicText("~r~ Hello ~n~", "~r~ مرحبا ~n~");
    expect(encoded.processedText).toContain("~r~");
    expect(encoded.processedText).toContain("~n~");
    expect(gtaIvRawUnitsToString(encoded.textUnits)).toMatch(/^~r~.*~n~$/);
    expect(Array.from(encoded.textUnits.slice(0, 3))).toEqual([0x7e, 0x72, 0x7e]);
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
    expect(Array.from(output.tables[0].entries[0].textUnits)).toEqual([410, 228, 193, 123, 199]);
  });

});
