import { describe, it, expect } from "vitest";
import { pkmCodecByGame, pkmCodecFor, pkmForeignFont, pkmRomTitle } from "@/lib/pokemon/pkm-codec";
import { buildPkmRom, isBuiltPkmRom } from "@/lib/pokemon/pkm-editor-bridge";
import { applyEmeraldArabicFont, EMERALD_BLANK_CODES } from "@/lib/gba/emerald-arabic";
import { EMERALD_GLYPH_COUNT, EMERALD_GLYPH_SIZE, writeEmeraldGlyph } from "@/lib/gba/emerald-font";
import { decodeBytesWithTables, encodeArabicWithTables } from "@/lib/pokemon/pkm-charmap";

/** A ROM that is nothing but its cartridge header. */
function romTitled(title: string): Uint8Array {
  const rom = new Uint8Array(0x1000);
  for (let i = 0; i < title.length; i++) rom[0xa0 + i] = title.charCodeAt(i);
  return rom;
}

describe("Gen 3 — telling the two games apart", () => {
  it("reads the game out of the cartridge header", () => {
    expect(pkmRomTitle(romTitled("POKEMON EMER"))).toBe("POKEMON EMER");
    expect(pkmCodecFor(romTitled("POKEMON EMER")).game).toBe("emerald");
  });

  it("stays on Ruby Destiny for anything else", () => {
    // The default matters more than the special case: everything that works
    // today goes through it, and a header this code does not recognise must
    // not silently change which codes Arabic is written into.
    expect(pkmCodecFor(romTitled("POKEMON RUBY")).game).toBe("ruby-destiny");
    expect(pkmCodecFor(new Uint8Array(0x1000)).game).toBe("ruby-destiny");
  });

  it("gives each game its own codes for the same letter", () => {
    const ruby = pkmCodecFor(romTitled("POKEMON RUBY")).tables;
    const emerald = pkmCodecFor(romTitled("POKEMON EMER")).tables;
    const alef = 0xfe8e; // ا, final form
    expect(ruby.arabicToByte.get(alef)).toBeDefined();
    expect(emerald.arabicToByte.get(alef)).toBeDefined();
    expect(ruby.arabicToByte.get(alef)).not.toBe(emerald.arabicToByte.get(alef));
    // And Emerald's is not a code the game prints — `Lv`, `PK`, `é`.
    for (const kept of [0x34, 0x53, 0x1b]) {
      expect([...emerald.arabicToByte.values()]).not.toContain(kept);
    }
  });
});

describe("Gen 3 — refusing the mix that only shows up in the emulator", () => {
  /** An 8 MB ROM carrying Emerald's font, and Arabic drawn into it. */
  function emeraldRomWithArabic(): Uint8Array {
    const rom = new Uint8Array(0x800000);
    const widths = 0x1000;
    const glyphs = widths + 0x200;
    const font = { glyphs, widths };
    for (let code = 0; code < EMERALD_GLYPH_COUNT; code++) {
      if (EMERALD_BLANK_CODES.includes(code) || code === 0) {
        rom[widths + code] = 3;
        continue;
      }
      const width = 3 + (code % 6);
      rom[widths + code] = width;
      const cell = new Uint8Array(EMERALD_GLYPH_SIZE * EMERALD_GLYPH_SIZE);
      for (let y = 2; y < 13; y++) {
        for (let x = 0; x < width; x++) {
          cell[y * EMERALD_GLYPH_SIZE + x] = x === width - 1 || (y + code + x) % 3 === 0 ? 1 : 3;
        }
      }
      writeEmeraldGlyph(rom, font, code, cell);
    }
    return applyEmeraldArabicFont(rom).rom;
  }

  it("stops a build that would put the wrong letter in every letter's place", () => {
    // This is the one mistake nothing on screen explains: the text goes in as
    // one game's codes and comes out drawn with the other game's font, so the
    // letters are real Arabic and all of them wrong. It reads as a broken font
    // and it is not one — so it is named before a byte is written.
    const rom = emeraldRomWithArabic();
    const result = buildPkmRom(rom, { "pkm_rom:100": "مرحباً" }, { game: "ruby-destiny" });
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("Emerald");
  });

  it("names the other game's font when it finds it", () => {
    const rom = emeraldRomWithArabic();
    expect(pkmForeignFont(rom, pkmCodecByGame("ruby-destiny"))?.game).toBe("emerald");
    expect(pkmForeignFont(rom, pkmCodecByGame("emerald"))).toBeNull();
    // And the opener refuses it for the same reason.
    expect(isBuiltPkmRom(rom, "ruby-destiny")).toBe(true);
  });
});

describe("Gen 3 — the marks Emerald writes with", () => {
  const tables = pkmCodecFor(romTitled("POKEMON EMER")).tables;

  it("names the punctuation the game actually uses", () => {
    // 3703 of this game's lines carry `…` and 2984 carry the `é` between POK
    // and MON. Left unnamed they reach the translator as `{b0}` and `{1b}`,
    // which is a line they cannot read and dare not touch.
    for (const [ch, byte] of [["…", 0xb0], ["-", 0xae], ["é", 0x1b], ["→", 0x7c], ["♀", 0xb6]] as const) {
      expect(tables.latinToByte.get(ch)).toBe(byte);
      expect(tables.byteToLatin.get(byte)).toBe(ch);
    }
  });

  it("leaves the game's money sign as the byte it is", () => {
    // No character stands for it, and giving it a wrong one would put a wrong
    // symbol in the game. It travels as a token instead.
    expect(tables.byteToLatin.get(0xb7)).toBeUndefined();
    expect(decodeBytesWithTables(Uint8Array.from([0xb7]), tables)).toBe("{b7}");
  });

  it("carries the engine's own codes through a round trip untouched", () => {
    // `{FD:01}` is the player's name and `{fb}` clears the box. A translation
    // that loses either prints wrongly somewhere no test can see, so they have
    // to survive being read and written as exactly the bytes they were.
    const bytes = Uint8Array.from([0xfd, 0x01, 0xb0, 0xfb, 0xbb, 0xd5]);
    const text = decodeBytesWithTables(bytes, tables);
    expect(text).toBe("{FD:01}…{fb}\nAa");
    expect(encodeArabicWithTables(text, tables).bytes).toEqual(bytes);
  });
});
