import { describe, it, expect } from "vitest";
import { findGbaFonts, renderGbaFontCandidate } from "@/lib/gba/gba-font-finder";

/**
 * A ROM with one font in it: glyphs that differ from one another, share a
 * writing line, and keep a margin at the top, the bottom and the right — the
 * shape of a font, drawn with whatever colour numbers the game happened to use.
 */
function romWithFont(at: number, colour: number, glyphs = 64): Uint8Array {
  const rom = new Uint8Array(0x40000);
  // حشوٌ متنوّع الألوان، فلا يُخلط بالخطّ.
  for (let i = 0; i < rom.length; i++) rom[i] = (i * 37) & 0xff;
  let seed = 1;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
  for (let g = 0; g < glyphs; g++) {
    const cell = new Uint8Array(8 * 16);
    // كل حرف يختلف عن غيره، ويقف على السطر نفسه، ولا يلمس أعلى الخليّة ولا
    // أسفلها ولا عمودها الأخير.
    for (let y = 4; y < 13; y++) {
      for (let x = 0; x < 6; x++) {
        if (y === 12 || x === 0 || next() % 3 === 0) cell[y * 8 + x] = colour;
      }
    }
    for (let i = 0; i < cell.length; i += 2) {
      rom[at + g * 64 + i / 2] = cell[i] | (cell[i + 1] << 4);
    }
  }
  return rom;
}

describe("GBA — finding a font without being told its shape", () => {
  it("finds it whatever colour numbers the game draws with", () => {
    // The hand search failed on Emerald because it assumed colours 14 and 15,
    // which is what one hack used; that game draws with 4 and 5. So the test
    // asks for both and expects the same answer.
    for (const colour of [15, 5, 1]) {
      const rom = romWithFont(0x10000, colour);
      const found = findGbaFonts(rom, { limit: 5 });
      expect(found.length).toBeGreaterThan(0);
      expect(found[0].offset).toBe(0x10000);
      // التخطيط الدقيق يُحسم بالنظر إلى المعاينة: قراءتان مختلفتان لنفس
      // البايتات قد تجتازان الفحص معاً. الأداة تدلّ على الموضع، والعين تختار —
      // فيكفي أن تكون القراءة الصحيحة (أربعة بتات) بين ما عُرض.
      expect(found.some((c) => c.offset === 0x10000 && c.layout.bpp === 4)).toBe(true);

    }
  });

  it("says nothing when the ROM holds no font", () => {
    // A tool that always answers is a tool that cannot be trusted when it does.
    const rom = new Uint8Array(0x40000);
    for (let i = 0; i < rom.length; i++) rom[i] = (i * 37) & 0xff;
    expect(findGbaFonts(rom, { limit: 5 }).length).toBe(0);
  });

  it("draws the candidate so the answer can be judged by eye", () => {
    const rom = romWithFont(0x10000, 15);
    const found = findGbaFonts(rom, { limit: 1 });
    expect(found.length).toBe(1);
    const sheet = renderGbaFontCandidate(rom, found[0], 16);
    expect(sheet.width).toBe(16 * (found[0].layout.width + 1));
    expect(sheet.rgba.length).toBe(sheet.width * sheet.height * 4);
    expect([...sheet.rgba].some((v) => v > 200)).toBe(true);
  });
});

describe("GBA — finding a font the game keeps compressed", () => {
  it("unpacks LZ77 blocks and judges what comes out", async () => {
    // Emerald keeps its graphics compressed, and the hand search failed for
    // eight attempts because there is nothing to read in the raw bytes.
    const { compressGbaLz77Store } = await import("./gba-lz77-helper");
    const font = new Uint8Array(64 * 40);
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    for (let g = 0; g < 40; g++) {
      const cell = new Uint8Array(8 * 16);
      for (let y = 4; y < 13; y++) for (let x = 0; x < 6; x++) if (x === 0 || next() % 3 === 0) cell[y * 8 + x] = 5;
      for (let i = 0; i < cell.length; i += 2) font[g * 64 + i / 2] = cell[i] | (cell[i + 1] << 4);
    }
    const packed = compressGbaLz77Store(font);
    const rom = new Uint8Array(0x20000);
    for (let i = 0; i < rom.length; i++) rom[i] = (i * 37) & 0xff;
    rom.set(packed, 0x8000);

    const found = findGbaFonts(rom, { limit: 5, minGlyphs: 32 });
    const hit = found.find((c) => c.compressedAt === 0x8000);
    expect(hit).toBeDefined();
    // ويُرسم من الكتلة المفكوكة لا من بايتات الروم.
    expect(renderGbaFontCandidate(rom, hit!, 8).rgba.some((v) => v > 200)).toBe(true);
  });
});
