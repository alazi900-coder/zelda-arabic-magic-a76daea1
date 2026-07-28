import { describe, it, expect } from "vitest";
import {
  wolfFontSlots, wolfByteForCodepoint, wolfCodepointForByte,
  encodeArabicForWolf, decodeWolfBytes,
  WOLF_FIRST_CODE, WOLF_LAST_CODE, WOLF_SLOT_COUNT, WOLF_RESERVED_CODES,
} from "@/lib/wolfrpg/wolf-charmap";

describe("Wolfenstein RPG character map", () => {
  it("fills the grid the engine actually has and no more", () => {
    // Measured in-game: filling one row of cells blanked exactly A..P, so the
    // first cell is `!` (0x21) and the last drawable byte is 0xB0.
    expect(WOLF_FIRST_CODE).toBe(0x21);
    expect(WOLF_LAST_CODE).toBe(0xb0);
    expect(WOLF_SLOT_COUNT).toBe(16 * 9);
    expect(wolfFontSlots()).toHaveLength(WOLF_SLOT_COUNT);
  });

  it("leaves the codes game text still needs as Latin", () => {
    const slots = wolfFontSlots();
    for (const code of WOLF_RESERVED_CODES) {
      expect(slots[code - WOLF_FIRST_CODE]).toBeNull();
      expect(wolfCodepointForByte(code)).toBeNull();
    }
    // The line break in particular: reusing 0x7C would turn every break into a
    // letter and reflow every dialogue in the game.
    expect(wolfCodepointForByte(0x7c)).toBeNull();
  });

  it("gives every Arabic form a slot, with no collisions", () => {
    const slots = wolfFontSlots();
    const arabic = slots.filter((s): s is number => s !== null);
    expect(new Set(arabic).size).toBe(arabic.length);
    for (let cp = 0xfe80; cp <= 0xfefc; cp++) expect(wolfByteForCodepoint(cp)).not.toBeNull();
    for (const cp of [0x0621, 0x060c, 0x061f, 0x061b]) expect(wolfByteForCodepoint(cp)).not.toBeNull();
  });

  it("every slot byte is drawable and maps back to its codepoint", () => {
    wolfFontSlots().forEach((cp, slot) => {
      if (cp === null) return;
      const byte = slot + WOLF_FIRST_CODE;
      expect(byte).toBeGreaterThanOrEqual(WOLF_FIRST_CODE);
      expect(byte).toBeLessThanOrEqual(WOLF_LAST_CODE);
      expect(wolfByteForCodepoint(cp)).toBe(byte);
      expect(wolfCodepointForByte(byte)).toBe(cp);
    });
  });

  it("shapes, reverses and encodes Arabic with nothing left over", () => {
    const r = encodeArabicForWolf("مرحبا بك");
    expect(r.unmapped).toEqual([]);
    // Every byte must be one the font can draw.
    for (const ch of r.text) {
      const b = ch.charCodeAt(0);
      expect(b === 0x20 || (b >= WOLF_FIRST_CODE && b <= WOLF_LAST_CODE)).toBe(true);
    }
    // Decoding shows joined presentation forms in visual order — the last
    // written glyph is the first letter of the first word.
    const back = decodeWolfBytes(r.text);
    expect(back.endsWith("ﻣ")).toBe(true);
  });

  it("drops tashkeel instead of drawing it as a separate blob", () => {
    const plain = encodeArabicForWolf("مرحبا");
    const vocalised = encodeArabicForWolf("مَرْحَبًا");
    expect(vocalised.text).toBe(plain.text);
    expect(vocalised.unmapped).toEqual([]);
  });

  it("uses the ASCII digits the font keeps, not the Arabic-Indic ones", () => {
    const r = encodeArabicForWolf("٠١٢٣٤٥٦٧٨٩");
    expect(r.text).toBe("0123456789");
    expect(r.unmapped).toEqual([]);
  });

  it("passes the reserved punctuation straight through", () => {
    const r = encodeArabicForWolf("100% : 42.5!");
    expect(r.text).toBe("100% : 42.5!");
  });

  it("keeps the line break byte intact through an Arabic line", () => {
    const r = encodeArabicForWolf("مرحبا|بك");
    expect(r.text.includes("|")).toBe(true);
  });
});
