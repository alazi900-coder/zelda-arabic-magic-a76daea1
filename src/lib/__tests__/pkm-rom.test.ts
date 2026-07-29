import { describe, it, expect } from "vitest";
import { scanPkmStrings, applyPkmTranslations } from "@/lib/pokemon/pkm-rom";
import { encodeArabicForPkm, decodePkmBytes, PKM_TERMINATOR } from "@/lib/pokemon/pkm-charmap";
import { categorizePkmText, buildPkmCategories } from "@/lib/pokemon/pkm-categories";
import { extractPkmEntries } from "@/lib/pokemon/pkm-editor-bridge";
import { processArabicText } from "@/lib/arabic-processing";

/** English text in the game's own character set, the way the ROM stores it. */
function gameBytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    if (ch === " ") out.push(0x00);
    else if (ch === "\n") out.push(0xfe);
    else if (ch >= "A" && ch <= "Z") out.push(0xbb + (ch.charCodeAt(0) - 65));
    else if (ch >= "a" && ch <= "z") out.push(0xd5 + (ch.charCodeAt(0) - 97));
    else if (ch === ".") out.push(0xad);
    else if (ch === "?") out.push(0xac);
    else throw new Error(`no code for ${ch}`);
  }
  return out;
}

describe("Pokémon Ruby Destiny string scanning", () => {
  it("finds a line and reports the space the game gave it", () => {
    const rom = Uint8Array.from([
      0x12, 0x34, // not text
      ...gameBytes("Hello there"),
      PKM_TERMINATOR,
      0x99,
    ]);
    expect(scanPkmStrings(rom)).toEqual([
      { offset: 2, capacity: 12, text: "Hello there" },
    ]);
  });

  it("skips a run that never reaches a terminator", () => {
    // Text bytes trailing off into other data are not a line the game prints.
    const rom = Uint8Array.from([...gameBytes("Hello there"), 0x12, 0x34]);
    expect(scanPkmStrings(rom)).toEqual([]);
  });

  it("starts at the first real character, not at the padding before it", () => {
    // 0x00 is the space, so a run swallows the zero padding in front of a
    // line. The game's pointer is at the first character; writing from the
    // padding instead would put the start of the translation where the game
    // never looks, and the line would print from its own middle.
    const rom = Uint8Array.from([0x00, 0x00, 0x00, ...gameBytes("Hello there"), PKM_TERMINATOR]);
    const found = scanPkmStrings(rom);
    expect(found).toHaveLength(1);
    expect(found[0].offset).toBe(3);
    expect(found[0].capacity).toBe(12);
  });

  it("ignores a run that is mostly not letters", () => {
    const rom = Uint8Array.from([...gameBytes("a    b     c"), PKM_TERMINATOR]);
    expect(scanPkmStrings(rom)).toEqual([]);
  });

  it("keeps a variable out of the text and shows it as itself", () => {
    const rom = Uint8Array.from([
      ...gameBytes("Hi "),
      0xfd, 0x01,
      ...gameBytes(" there"),
      PKM_TERMINATOR,
    ]);
    expect(scanPkmStrings(rom)[0].text).toBe("Hi {FD:01} there");
  });
});

describe("Pokémon Ruby Destiny writing", () => {
  const rom = Uint8Array.from([...gameBytes("Hello there friend"), PKM_TERMINATOR]);

  it("writes Arabic back where the line was found and stops the old text", () => {
    const strings = scanPkmStrings(rom);
    const result = applyPkmTranslations(rom, strings, { "0": "مرحبا" });
    expect(result.written).toBe(1);
    const encoded = encodeArabicForPkm("مرحبا").bytes;
    expect(result.rom.slice(0, encoded.length)).toEqual(encoded);
    // Everything the shorter translation left behind is terminator, so the
    // tail of the English line can never be drawn.
    expect([...result.rom.slice(encoded.length, rom.length)].every((b) => b === PKM_TERMINATOR)).toBe(true);
  });

  it("refuses a translation longer than its place, and says by how much", () => {
    const strings = scanPkmStrings(rom);
    const long = "مرحبا بك يا صديقي العزيز في هذه المدينة";
    const result = applyPkmTranslations(rom, strings, { "0": long });
    expect(result.written).toBe(0);
    expect(result.tooLong).toHaveLength(1);
    expect(result.tooLong[0].capacity).toBe(19);
    expect(result.tooLong[0].needed).toBeGreaterThan(19);
  });

  it("leaves every byte alone when nothing is translated", () => {
    const result = applyPkmTranslations(rom, scanPkmStrings(rom), {});
    expect(result.rom).toEqual(rom);
  });
});

describe("Pokémon Ruby Destiny encoding", () => {
  it("stores Arabic shaped and reversed, so it reads back the same way", () => {
    const { bytes } = encodeArabicForPkm("مرحبا");
    expect([...decodePkmBytes(bytes)].reverse().join("")).toBe("ﻣﺮﺣﺒﺎ");
  });

  it("would reverse the line if the editor had already shaped it", () => {
    // The build shapes and reverses on its own, so text put through the
    // editor's Arabic processing first comes out backwards — measured, not
    // assumed. This is why that button is disabled for Pokémon; the day
    // someone re-enables it, this test says what it costs.
    const direct = encodeArabicForPkm("مرحبا").bytes;
    const preShaped = encodeArabicForPkm(processArabicText("مرحبا")).bytes;
    expect([...preShaped].reverse()).toEqual([...direct]);
    expect(preShaped).not.toEqual(direct);
  });

  it("carries a substituted value through as its own two bytes", () => {
    // The token is one thing, not seven characters. Shaping reverses the line
    // and would come back with the braces swapped, so writing it out as text
    // put `{FD:01}` into the game literally and the character lost their name.
    const { bytes, unmapped } = encodeArabicForPkm("مرحبا {FD:01}");
    expect(unmapped).toEqual([]);
    const at = bytes.indexOf(0xfd);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(bytes[at + 1]).toBe(0x01);
  });

  it("puts a line with a value back exactly as it was read", () => {
    const original = Uint8Array.from([...gameBytes("Hi "), 0xfd, 0x01, ...gameBytes(" there")]);
    const text = decodePkmBytes(original);
    expect(text).toBe("Hi {FD:01} there");
    expect(encodeArabicForPkm(text).bytes).toEqual(original);
  });

  it("reports characters the 129 slots have no room for", () => {
    const { unmapped } = encodeArabicForPkm("مرحبا ♥");
    expect(unmapped).toContain("♥");
  });

  it("carries a line break through as the engine's own", () => {
    const { bytes } = encodeArabicForPkm("سطر\nثان");
    expect(bytes).toContain(0xfe);
  });
});

describe("Pokémon Ruby Destiny categories", () => {
  it("calls a line with a substituted value dialogue", () => {
    expect(categorizePkmText("Hi {FD:01}").id).toBe("pkm-dialogue");
  });

  it("calls a short single word a name", () => {
    expect(categorizePkmText("POTION").id).toBe("pkm-names");
  });

  it("lists only the categories actually present", () => {
    const cats = buildPkmCategories([{ original: "POTION" }, { original: "Wait." }]);
    expect(cats.map((c) => c.id)).toEqual(["pkm-dialogue", "pkm-names"]);
  });
});

describe("Pokémon Ruby Destiny editor bridge", () => {
  it("keys each entry by its offset and caps it at its own space", () => {
    const rom = Uint8Array.from([0x00, ...gameBytes("Hello there"), PKM_TERMINATOR]);
    const { entries } = extractPkmEntries(rom);
    expect(entries).toHaveLength(1);
    expect(entries[0].msbtFile).toBe("pkm_rom");
    expect(entries[0].index).toBe(1);
    // 11 characters plus the terminator, and the terminator is not writable.
    expect(entries[0].maxBytes).toBe(11);
  });
});
