import { describe, it, expect } from "vitest";
import { pkmCodecFor, pkmRomTitle } from "@/lib/pokemon/pkm-codec";
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
