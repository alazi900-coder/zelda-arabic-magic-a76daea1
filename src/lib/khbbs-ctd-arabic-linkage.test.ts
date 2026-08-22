import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  analyzeKHBBSCTDText,
  encodeKHBBSCTDTextForAudit,
  prepareCTDTextForBuild,
} from "./khbbs-ctd";
import { KHBBS_ARABIC_FONT_CODES } from "./khbbs-arabic-font-map";

const injectionReportPath = "/home/ubuntu/khbbs-font-work/audit-final/real-mesfont-output-audit.json";
const embeddedModelReportPath = "/home/ubuntu/khbbs-font-work/audit-final/font-arabic-v4-raster-d-final-audit.json";
const embeddedFontPath = "/home/ubuntu/zelda-arabic-magic-original/src/assets/Font.arabic.arc";
const outputPath = "/home/ubuntu/khbbs-font-work/audit-final/ctd-arabic-linkage-v4-raster-d.json";
const words = ["سلام", "مرحبا", "العالم", "بداية", "الشمس", "مكتبة"];

function hex(value: number, width: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

describe("KHBBS Arabic CTD linkage audit", () => {
  it("encodes all mapped forms and representative connected Arabic words to injected Font.arc codes", async () => {
    const injection = JSON.parse(await readFile(injectionReportPath, "utf8"));
    const embeddedModel = JSON.parse(await readFile(embeddedModelReportPath, "utf8"));
    const injectedCodes = new Set<number>(
      injection.forms.flatMap((form: { records: { actualCode: number }[] }) => form.records.map((record) => record.actualCode)),
    );
    const embeddedSha256 = createHash("sha256").update(await readFile(embeddedFontPath)).digest("hex");

    const wordResults = words.map((word) => {
      const prepared = prepareCTDTextForBuild(word);
      const shapedGlyphs = [...prepared].filter((character) => KHBBS_ARABIC_FONT_CODES.has(character));
      const bytes = encodeKHBBSCTDTextForAudit(prepared);
      const codes = Array.from({ length: bytes.length / 2 }, (_, index) => (bytes[index * 2] << 8) | bytes[index * 2 + 1]);
      const expectedCodes = shapedGlyphs.map((character) => KHBBS_ARABIC_FONT_CODES.get(character)!);
      const codeSequenceMatches = codes.length === expectedCodes.length && codes.every((code, index) => code === expectedCodes[index]);
      const allCodesInjected = codes.every((code) => injectedCodes.has(code));
      return {
        word,
        prepared,
        shapedGlyphs,
        ctdBytes: Array.from(bytes, (byte) => hex(byte, 2)),
        fontCodes: codes.map((code) => hex(code, 4)),
        codeSequenceMatches,
        allCodesInjected,
        passed: codeSequenceMatches && allCodesInjected,
      };
    });

    const fullMapAudit = [...KHBBS_ARABIC_FONT_CODES.entries()].map(([glyph, expectedCode]) => {
      const bytes = encodeKHBBSCTDTextForAudit(glyph);
      const encodedCode = (bytes[0] << 8) | bytes[1];
      return {
        glyph,
        expectedCode: hex(expectedCode, 4),
        encodedCode: hex(encodedCode, 4),
        isInjected: injectedCodes.has(encodedCode),
        passed: bytes.length === 2 && encodedCode === expectedCode && injectedCodes.has(encodedCode),
      };
    });

    const report = {
      wordCount: wordResults.length,
      mapEntryCount: KHBBS_ARABIC_FONT_CODES.size,
      injectedGlyphCount: injection.arabicFormsPassing,
      embeddedFontSha256: embeddedSha256,
      expectedEmbeddedFontSha256: embeddedModel.targetSha256,
      words: wordResults,
      fullMapAudit,
      passed: embeddedModel.passed === true && embeddedSha256 === embeddedModel.targetSha256 && wordResults.every((result) => result.passed) && fullMapAudit.every((result) => result.passed),
    };
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

    expect(report.passed).toBe(true);
    expect(wordResults).toHaveLength(6);
    expect(fullMapAudit).toHaveLength(126);
  });

  it("replaces Arabic phone punctuation and digits with supported English bytes", () => {
    const prepared = prepareCTDTextForBuild("سؤال؟،؛ ١٢٣٪");
    expect(() => encodeKHBBSCTDTextForAudit(prepared)).not.toThrow();
    const analysis = analyzeKHBBSCTDText("سؤال؟،؛ ١٢٣٪");
    expect(analysis.unsupported).toEqual([]);
    expect(analysis.replacements.map((item) => item.character)).toEqual(expect.arrayContaining(["؟", "،", "؛", "١", "٢", "٣", "٪"]));
  });

  it("transliterates the confirmed stray Hebrew Resh U+05E8 instead of stopping CTD build", () => {
    const prepared = prepareCTDTextForBuild("ר");
    expect(Array.from(encodeKHBBSCTDTextForAudit(prepared))).toEqual([0x72]);
    expect(analyzeKHBBSCTDText("ר").unsupported).toEqual([]);
  });

  it("reports a truly unsupported symbol with its exact Unicode value", () => {
    const analysis = analyzeKHBBSCTDText("ممنوع §");
    expect(analysis.unsupported).toEqual(expect.arrayContaining([{ character: "§", unicode: "U+00A7", count: 1 }]));
  });
});
