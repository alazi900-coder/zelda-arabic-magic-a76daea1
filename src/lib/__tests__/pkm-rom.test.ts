import { describe, it, expect } from "vitest";
import { scanPkmStrings, applyPkmTranslations, pkmLineLimit, PKM_SHORT_LINE_LIMIT } from "@/lib/pokemon/pkm-rom";
import { pkmLooksNonLinguistic } from "@/lib/pokemon/pkm-junk";
import { encodeArabicForPkm, decodePkmBytes, pkmArabicSlots, pkmCodepointForByte, PKM_TERMINATOR } from "@/lib/pokemon/pkm-charmap";
import { categorizePkmLine, buildPkmCategories } from "@/lib/pokemon/pkm-categories";
import { maskPkmTags, unmaskPkmTags, diffPkmTags } from "@/lib/pokemon/pkm-tag-mask";
import { extractPkmEntries, restorePkmTranslations, buildPkmRom } from "@/lib/pokemon/pkm-editor-bridge";
import { processArabicText } from "@/lib/arabic-processing";
import { measureEntryBytes } from "@/lib/entry-bytes";

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
    expect(categorizePkmLine("Hi {FD:01}", null).id).toBe("pkm-dialogue");
  });

  it("files a line by the list it was measured into, not by how it reads", () => {
    // The text alone cannot do this — "POTION" and "TACKLE" read the same.
    // What separates them is which array the line sits in, recognised while
    // scanning the ROM and carried here.
    expect(categorizePkmLine("POTION", "items").id).toBe("pkm-items");
    expect(categorizePkmLine("TACKLE", "moves").id).toBe("pkm-moves");
    expect(categorizePkmLine("BULBASAUR", "species").id).toBe("pkm-species");
    expect(categorizePkmLine("Youngster", "people").id).toBe("pkm-places");
  });

  it("keeps an item in its list even when it ends like a sentence", () => {
    // "Exp. Share" is an item name; the sentence test would call it speech.
    expect(categorizePkmLine("Exp. Share", "items").id).toBe("pkm-items");
  });

  it("calls a short free-standing name a place", () => {
    expect(categorizePkmLine("PETALBURG", null).id).toBe("pkm-places");
  });

  it("reads an unnamed list entry the only way left — by its text", () => {
    expect(categorizePkmLine("ALVIN", "list").id).toBe("pkm-places");
    expect(categorizePkmLine("1st round", "list").id).toBe("pkm-ui");
  });

  it("lists the categories present in a fixed order", () => {
    const cats = buildPkmCategories([
      { msbtFile: "pkm_items", original: "POTION" },
      { msbtFile: "pkm_rom", original: "Wait." },
      { msbtFile: "pkm_species", original: "BULBASAUR" },
    ]);
    expect(cats.map((c) => c.id)).toEqual(["pkm-dialogue", "pkm-species", "pkm-items"]);
  });
});

describe("the one code the English text still needs", () => {
  it("keeps é out of the Arabic slots", () => {
    // The byte between "POK" and "MON" is 0x1B in 2017 places in this ROM.
    // Taking it for Arabic put an Arabic letter inside every POKéMON the
    // translator had not reached yet.
    expect(pkmArabicSlots()).not.toContain(0x1b);
    expect(pkmArabicSlots()).toHaveLength(129);
    expect(pkmCodepointForByte(0x1b)).toBeNull();
  });

  it("reads a line straight through é instead of cutting it there", () => {
    const rom = Uint8Array.from([...gameBytes("Six "), 0xca, 0xc9, 0xc5, 0x1b, 0xc7, 0xc9, 0xc8, PKM_TERMINATOR]);
    const found = scanPkmStrings(rom);
    expect(found).toHaveLength(1);
    expect(found[0].text).toBe("Six POKéMON");
  });

  it("writes é back as the byte the game draws it with", () => {
    expect([...encodeArabicForPkm("é").bytes]).toEqual([0x1b]);
  });
});

describe("how long a Pokémon translation is", () => {
  it("counts the bytes the ROM stores, not UTF-8", () => {
    // «بلباصور» is seven glyphs and seven bytes in the game. Measured in UTF-8
    // it reads fourteen, which is how a name that fits with room to spare came
    // to be reported as five bytes over its limit.
    expect(measureEntryBytes("pkm_species", "بلباصور")).toBe(7);
    expect(measureEntryBytes("pkm_species", "إيفي")).toBe(4);
  });

  it("counts a substituted value as the two bytes it is", () => {
    expect(measureEntryBytes("pkm_rom", "{FD:01}")).toBe(2);
  });

  it("leaves every other game on UTF-8", () => {
    expect(measureEntryBytes("common.msbt", "بلباصور")).toBe(14);
    expect(measureEntryBytes(undefined, "abc")).toBe(3);
  });
});

describe("how much room a Pokémon line has", () => {
  it("gives a list entry the whole slot it sits in", () => {
    // The name is measured from the word — "NAMEA" plus a terminator — but the
    // slot is what the entry owns, and the next entry starts exactly a stride
    // later. Anything less costs the translator bytes that are already theirs.
    const stride = 12;
    const rom = new Uint8Array(stride * 10).fill(PKM_TERMINATOR);
    for (let i = 0; i < 10; i++) {
      rom.set(gameBytes("NAME" + String.fromCharCode(65 + i)), i * stride);
    }
    const found = scanPkmStrings(rom);
    expect(found[0].capacity).toBe(stride);
    // The last entry has nothing after it to measure against, so it keeps what
    // its own text proves.
    expect(found[9].capacity).toBe("NAMEJ".length + 1);
  });

  it("still refuses a line that will not fit its slot", () => {
    const stride = 12;
    const rom = new Uint8Array(stride * 10).fill(PKM_TERMINATOR);
    for (let i = 0; i < 10; i++) {
      rom.set(gameBytes("NAME" + String.fromCharCode(65 + i)), i * stride);
    }
    const strings = scanPkmStrings(rom);
    const result = applyPkmTranslations(rom, strings, { "0": "اثنا عشر حرفا" });
    expect(result.written).toBe(0);
    expect(result.tooLong[0].capacity).toBe(stride);
  });
});

describe("Pokémon Ruby Destiny saved work", () => {
  it("finds a translation saved before the lists were renamed", () => {
    // `pkm_t11` was what a species line was called in the first version. The
    // line has not moved — its offset is the same — so its translation has to
    // come back with it, or renaming the lists costs the translator the work.
    const entries = [
      { msbtFile: "pkm_species", index: 100, label: "", original: "Bulbasaur", maxBytes: 10 },
      { msbtFile: "pkm_items", index: 200, label: "", original: "Potion", maxBytes: 10 },
    ];
    const restored = restorePkmTranslations(entries, {
      "pkm_t11:100": "بولباصور",
      "pkm_rom:200": "دواء",
      "pkm_rom:999": "سطر لم يعد موجوداً",
    });
    expect(restored).toEqual({ "pkm_species:100": "بولباصور", "pkm_items:200": "دواء" });
  });

  it("builds a ROM from translations keyed the old way", () => {
    // buildPkmRom checks the file is a GBA image before it writes anything.
    const rom = new Uint8Array(0x1000000);
    rom.set([...gameBytes("Hello there"), PKM_TERMINATOR], 0);
    const out = buildPkmRom(rom, { "pkm_t13:0": "مرحبا" });
    expect("error" in out).toBe(false);
    if (!("error" in out)) expect(out.translatedLines).toBe(1);
  });
});

describe("Pokémon Ruby Destiny technical codes", () => {
  it("hides a substituted value from the model and puts it back", () => {
    const { text, tags } = maskPkmTags("Hi {FD:01}, welcome");
    expect(text).not.toContain("FD");
    expect(unmaskPkmTags(text, tags)).toBe("Hi {FD:01}, welcome");
  });

  it("restores a code the model spaced out inside its placeholder", () => {
    const { tags } = maskPkmTags("Hi {FD:01}");
    expect(unmaskPkmTags("مرحبا 〖 0 〗", tags)).toBe("مرحبا {FD:01}");
  });

  it("reports a code the translation lost, and one it invented", () => {
    expect(diffPkmTags("Hi {FD:01}", "مرحبا").missing).toEqual(["{FD:01}"]);
    expect(diffPkmTags("Hi", "مرحبا {FD:02}").extra).toEqual(["{FD:02}"]);
  });

  it("reports two codes that came back swapped", () => {
    const d = diffPkmTags("{FD:01} and {FD:02}", "{FD:02} و {FD:01}");
    expect(d.missing).toEqual([]);
    expect(d.extra).toEqual([]);
    expect(d.sameOrder).toBe(false);
  });

  it("refuses to write a line whose substituted value went missing", () => {
    // The name would simply not be there, in a place no test can see. The
    // build says which line and what it lost instead of shipping it.
    const rom = Uint8Array.from([...gameBytes("Hi "), 0xfd, 0x01, ...gameBytes(" there now"), PKM_TERMINATOR]);
    const strings = scanPkmStrings(rom);
    const result = applyPkmTranslations(rom, strings, { "0": "مرحبا" });
    expect(result.written).toBe(0);
    expect(result.brokenTags).toHaveLength(1);
    expect(result.brokenTags[0].missing).toEqual(["{FD:01}"]);
    expect(result.rom).toEqual(rom);
  });
});

describe("Pokémon Ruby Destiny name lists", () => {
  it("marks lines that sit an equal distance apart as one list", () => {
    // Gen 3 pads each name into a slot of its own size, so consecutive
    // entries are an exact stride apart; dialogue never is.
    const stride = 12;
    const rom = new Uint8Array(stride * 10).fill(PKM_TERMINATOR);
    for (let i = 0; i < 10; i++) {
      rom.set(gameBytes("NAME" + String.fromCharCode(65 + i)), i * stride);
    }
    const found = scanPkmStrings(rom);
    expect(found).toHaveLength(10);
    expect(found.every((s) => s.table?.stride === stride)).toBe(true);
    expect(found[0].table?.count).toBe(10);
    // Nothing in it is recognisable, so it stays a list and nothing more.
    expect(found[0].table?.kind).toBe("list");
  });

  it("names a list by entries this engine cannot have renamed", () => {
    // A hack rewrites most of the dex, but the first few species keep their
    // names and their order — so the list can be recognised without reading
    // any single line as if its wording proved something.
    const names = ["Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Squirtle", "Caterpie", "Weedle", "Pidgey"];
    const stride = 11;
    const rom = new Uint8Array(stride * names.length).fill(PKM_TERMINATOR);
    names.forEach((n, i) => rom.set(gameBytes(n), i * stride));
    const found = scanPkmStrings(rom);
    expect(found).toHaveLength(names.length);
    expect(found.every((s) => s.table?.kind === "species")).toBe(true);
  });

  it("does not rename a list because one entry happens to match", () => {
    // Two hits are required, so a move called "Potion" cannot turn the move
    // list into the item list.
    const names = ["Potion", "Ember", "Splash", "Growth", "Rest", "Wish", "Roar", "Bite"];
    const stride = 13;
    const rom = new Uint8Array(stride * names.length).fill(PKM_TERMINATOR);
    names.forEach((n, i) => rom.set(gameBytes(n), i * stride));
    expect(scanPkmStrings(rom)[0].table?.kind).toBe("list");
  });

  it("leaves unevenly spaced lines out of any list", () => {
    const rom = Uint8Array.from([
      ...gameBytes("Hello there"), PKM_TERMINATOR,
      ...gameBytes("A much longer line here"), PKM_TERMINATOR,
    ]);
    expect(scanPkmStrings(rom).every((s) => s.table === undefined)).toBe(true);
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

describe("lines that may not be text at all", () => {
  it("flags a run of bytes that only looks like letters", () => {
    // Straight out of the ROM: graphics data whose bytes fall in the letter
    // range and happen to end at a terminator.
    expect(pkmLooksNonLinguistic("lzz lzz")).toBe(true);
    expect(pkmLooksNonLinguistic("zzjTzzjT")).toBe(true);
    expect(pkmLooksNonLinguistic("jjzj")).toBe(true);
  });

  it("misses the ones with a y in them, and that is the price", () => {
    // `y` counts as a vowel so «Gyaaaah!» and «Kyuuu...» survive, and «STVYZ»
    // slips through with them. Catching it would cost real lines, which is the
    // trade this whole check is built around.
    expect(pkmLooksNonLinguistic("STVYZ")).toBe(false);
  });

  it("leaves the game's own odd noises alone", () => {
    // These are printed on screen, and the letter-frequency test that would
    // have caught the data above threw all of them away.
    for (const cry of ["Pika pika!", "Gau gau!", "Oops!", "Fffnyaaaah...", "Guguu?"]) {
      expect(pkmLooksNonLinguistic(cry)).toBe(false);
    }
  });

  it("says nothing about a line with no words in it", () => {
    expect(pkmLooksNonLinguistic("123 456")).toBe(false);
    expect(pkmLooksNonLinguistic("{FD:01}")).toBe(false);
  });
});

describe("how much room a short Pokémon line really has", () => {
  it("lets a short line reach the floor measured in the emulator", () => {
    // «Sun Ford Town» sits in fourteen bytes and ran at twenty, wherever the
    // bytes were stored; it crashed at twenty-one. So twenty is what a short
    // line may ask for, and its own slot is no longer the ceiling.
    const rom = new Uint8Array(0x1000);
    rom.set([...gameBytes("Sun Ford"), PKM_TERMINATOR], 0x20);
    const s = scanPkmStrings(rom)[0];
    expect(s.capacity).toBe(9);
    expect(pkmLineLimit(s)).toBe(PKM_SHORT_LINE_LIMIT);
  });

  it("keeps a bigger slot's own room", () => {
    const rom = new Uint8Array(0x1000);
    rom.set([...gameBytes("PROF BIRCHS POKEMON LAB"), PKM_TERMINATOR], 0x20);
    const s = scanPkmStrings(rom)[0];
    expect(pkmLineLimit(s)).toBe(s.capacity - 1);
    expect(pkmLineLimit(s)).toBeGreaterThan(PKM_SHORT_LINE_LIMIT);
  });
});
