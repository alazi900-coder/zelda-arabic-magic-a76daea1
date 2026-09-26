import { describe, it, expect } from "vitest";
import { goldensunTextToBytes, analyzeGoldenSunUnsupportedCharacters } from "../goldensun-rom";

describe("Golden Sun character substitution", () => {
  it("writes the Persian yeh exactly like the Arabic one", () => {
    expect(goldensunTextToBytes("ی")).toEqual(goldensunTextToBytes("ي"));
    expect(goldensunTextToBytes("میم")).toEqual(goldensunTextToBytes("ميم"));
  });
  it("writes the keheh exactly like the Arabic kaf", () => {
    expect(goldensunTextToBytes("کتاب")).toEqual(goldensunTextToBytes("كتاب"));
  });
  it("turns every long dash into -", () => {
    for (const dash of ["‐", "‑", "‒", "–", "—", "―", "−"]) {
      expect(goldensunTextToBytes(`a${dash}b`)).toEqual([0x61, 0x2d, 0x62]);
    }
  });
  it("turns Arabic digits and punctuation into the ones the font draws", () => {
    expect(goldensunTextToBytes("٢٥٪")).toEqual([0x32, 0x35, 0x25]);
    expect(goldensunTextToBytes("۳")).toEqual([0x33]);
    expect(goldensunTextToBytes("،؟؛…")).toEqual([0x2c, 0x3f, 0x3b, 0x2e, 0x2e, 0x2e]);
  });
  it("reports nothing for a substituted line", () => {
    expect(analyzeGoldenSunUnsupportedCharacters("کتاب ی — ٢")).toEqual([]);
  });
});

describe("Golden Sun unsupported characters", () => {
  it("leaves a character with no cell out instead of stopping", () => {
    // گ (gaf) has no Arabic equivalent and no cell
    expect(() => goldensunTextToBytes("گل")).not.toThrow();
    expect(goldensunTextToBytes("aگb")).toEqual([0x61, 0x62]);
  });
  it("counts each unsupported character with its code point", () => {
    expect(analyzeGoldenSunUnsupportedCharacters("گ گ پ")).toEqual([
      { character: "گ", unicode: "U+06AF", count: 2 },
      { character: "پ", unicode: "U+067E", count: 1 },
    ]);
  });
  it("reports a font slot the Arabic took over (such as <) as unsupported", () => {
    expect(analyzeGoldenSunUnsupportedCharacters("a<b")).toEqual([{ character: "<", unicode: "U+003C", count: 1 }]);
  });
  it("never counts what sits inside a \\xNN code", () => {
    expect(analyzeGoldenSunUnsupportedCharacters("\\x11\\x01 مرحبا\\x02")).toEqual([]);
  });
});
