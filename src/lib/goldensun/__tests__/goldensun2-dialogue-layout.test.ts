import { describe, expect, it } from "vitest";
import {
  GS2_DIALOGUE_LINE_MAX_PX, layoutGoldenSun2Dialogue,
} from "../goldensun2-dialogue-layout";

const font = () => {
  // Small synthetic ROM fixture, enough for the real AGFE large-font table.
  const rom = new Uint8Array(0x5c500);
  for (let b = 0x20; b <= 0xff; b++) {
    const at = 0x5a4e0 + (b - 0x20) * 32;
    rom[at] = 5;
  }
  rom[0x5a4e0 + (0xf0 - 0x20) * 32] = 4;
  rom[0x5a4e0 + (0xd3 - 0x20) * 32] = 7;
  rom[0x5a4e0 + (0xeb - 0x20) * 32] = 6;
  return rom;
};
const word = [0xf0, 0xd3, 0xeb];
const words = (n: number): number[] =>
  Array.from({ length: n }, () => [...word, 0x20]).flat();

describe("AGFE pixel-safe dialogue wrapping", () => {
  it("breaks overlong Arabic dialogue on a space before overflowing the window", () => {
    const input = [...words(12), 0x1e];
    const result = layoutGoldenSun2Dialogue(font(), [0x41, 0x1e], input);
    expect(result.eligible).toBe(true);
    expect(result.insertedLineBreaks).toBe(1);
    expect(result.lineWidths).toHaveLength(2);
    expect(result.lineWidths.every(v => v <= GS2_DIALOGUE_LINE_MAX_PX)).toBe(true);
    expect(result.bytes.filter(b => b === 0x03)).toHaveLength(1);
    expect(result.bytes.filter(b => b === 0x1e)).toHaveLength(1);
    expect(result.bytes.filter(b => b === 0xf0)).toHaveLength(12);
  });

  it("preserves existing dialogue line breaks and both lines at safe widths", () => {
    const orig = [0x41, 0x03, 0x42, 0x1e];
    const bytes = [...words(8), 0x03, ...words(8), 0x1e];
    const result = layoutGoldenSun2Dialogue(font(), orig, bytes);
    expect(result.insertedLineBreaks).toBe(0);
    expect(result.bytes).toEqual(bytes.filter((b, i) => b !== 0x20 ||
      (i + 1 < bytes.length && bytes[i + 1] !== 0x03 && bytes[i + 1] !== 0x1e)));
  });

  it("blocks an overlong two-line string instead of painting beyond GBA video", () => {
    expect(() => layoutGoldenSun2Dialogue(font(), [0x41, 0x1e],
      [...words(20), 0x1e])).toThrow(/أكثر من سطرين/);
  });

  it("blocks an indivisible oversized word rather than deleting letters", () => {
    expect(() => layoutGoldenSun2Dialogue(font(), [0x41, 0x1e],
      [...Array.from({ length: 50 }, () => 0xf0), 0x1e])).toThrow(/كلمة واحدة/);
  });

  it("does not guess layout or insert controls in an unknown menu string", () => {
    const bytes = words(20);
    const r = layoutGoldenSun2Dialogue(font(), [0x41, 0x42], bytes);
    expect(r.eligible).toBe(false);
    expect(r.insertedLineBreaks).toBe(0);
    expect(r.bytes).toEqual(bytes);
  });

  it("retains opaque argument bytes after a control code", () => {
    const bytes = [...word, 0x11, 0x41, ...word, 0x1e];
    const r = layoutGoldenSun2Dialogue(font(), [0x41, 0x1e], bytes);
    expect(r.bytes).toEqual(bytes);
    expect(r.insertedLineBreaks).toBe(0);
  });
});
