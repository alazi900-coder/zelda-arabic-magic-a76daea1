import { describe, expect, it } from "vitest";
import { auditGoldenSun2Rom, buildGoldenSun2Rom, looksLikeGoldenSun2Rom } from "../goldensun2-rom";

const mockRom = (code: string, size = 0x1000000): Uint8Array => {
  const rom = new Uint8Array(size);
  rom.set([...code].map((c) => c.charCodeAt(0)), 0xac);
  rom.set([...("GOLDEN_SUN_B")].map((c) => c.charCodeAt(0)), 0xa0);
  return rom;
};

describe("Golden Sun: The Lost Age (AGFE) safety", () => {
  it("recognizes AGFE without misrecognizing Golden Sun 1", () => {
    expect(looksLikeGoldenSun2Rom(mockRom("AGFE"))).toBe(true);
    expect(looksLikeGoldenSun2Rom(mockRom("AGSE"))).toBe(false);
    expect(looksLikeGoldenSun2Rom(new Uint8Array(4))).toBe(false);
  });

  it("audits without changing the ROM", () => {
    const rom = mockRom("AGFE");
    const example = "Trans Data B: Hello world.";
    rom.set([...example].map((c) => c.charCodeAt(0)), 0x17d3c);
    const before = rom.slice();
    const report = auditGoldenSun2Rom(rom);
    expect(report.code).toBe("AGFE");
    expect(report.sizeMatches).toBe(true);
    expect(report.status).toBe("inspection-only");
    expect(report.samplePlainStrings.some((e) => e.text === example)).toBe(true);
    expect(rom).toEqual(before);
  });

  it("refuses to build using unverified GS1 tables", () => {
    expect(() => buildGoldenSun2Rom()).toThrow(/غير مفعّل/);
  });
});
