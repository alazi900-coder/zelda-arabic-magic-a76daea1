import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  encodeKHBBSCTDTextForAudit,
  prepareCTDTextForBuild,
} from "./khbbs-ctd";
import { KHBBS_ARABIC_FONT_CODES } from "./khbbs-arabic-font-map";

const injectionReportPath = "/home/ubuntu/khbbs-font-work/output/Font.arabic.report.json";
const outputPath = "/home/ubuntu/khbbs-font-work/audit-final/ctd-arabic-linkage-v2.json";
const words = ["سلام", "مرحبا", "العالم", "بداية", "الشمس", "مكتبة"];

function hex(value: number, width: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

describe("KHBBS Arabic CTD linkage audit", () => {
  it("encodes all mapped forms and representative connected Arabic words to injected Font.arc codes", async () => {
    const injection = JSON.parse(await readFile(injectionReportPath, "utf8"));
    const injectedCodes = new Set<number>(injection.glyphs.map((glyph: { fontCode: string }) => Number.parseInt(glyph.fontCode, 16)));

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
      injectedGlyphCount: injection.glyphCount,
      words: wordResults,
      fullMapAudit,
      passed: wordResults.every((result) => result.passed) && fullMapAudit.every((result) => result.passed),
    };
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

    expect(report.passed).toBe(true);
    expect(wordResults).toHaveLength(6);
    expect(fullMapAudit).toHaveLength(126);
  });

  it("identifies an unsupported Arabic-range code point with its exact Unicode value", () => {
    const prepared = prepareCTDTextForBuild("٪");
    expect(() => encodeKHBBSCTDTextForAudit(prepared)).toThrow("الرمز العربي «٪» (U+066A)");
  });
});
