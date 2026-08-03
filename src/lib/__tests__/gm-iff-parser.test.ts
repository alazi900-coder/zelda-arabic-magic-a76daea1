import { describe, it, expect } from "vitest";
import { parseGameMakerIFF, extractGameMakerEntries } from "@/lib/gamemaker/gm-iff-parser";

/**
 * A GameMaker file with two chunks: the strings, and one function that pushes
 * some of them.
 *
 * `pushed` names the strings the bytecode uses as constants — which is the
 * whole question the extractor answers. Everything else in STRG is a name of
 * something: a variable, a function, a sprite. A real game keeps thousands of
 * those and a few hundred lines of speech in the same table.
 */
function gameFile(strings: string[], pushed: number[]): ArrayBuffer {
  const encoded = strings.map((s) => new TextEncoder().encode(s));
  const bytecodeSize = pushed.length * 8;

  const codeData = 16;
  const entry = codeData + 8;
  const bytecode = entry + 20;
  const codeEnd = bytecode + bytecodeSize;
  const strgHeader = codeEnd;
  const strgData = strgHeader + 8;
  const strgEntries = strgData + 4 + 4 * strings.length;

  const offsets: number[] = [];
  let p = strgEntries;
  for (const bytes of encoded) {
    offsets.push(p);
    p += 4 + bytes.length + 1;
  }
  const total = p;

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);
  const put = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i);
  };

  put(0, "FORM");
  view.setUint32(4, total - 8, true);

  put(8, "CODE");
  view.setUint32(12, codeEnd - codeData, true);
  view.setUint32(codeData, 1, true);
  view.setUint32(codeData + 4, entry, true);
  view.setUint32(entry, 0, true); // the function's name, unused here
  view.setUint32(entry + 4, bytecodeSize, true);
  view.setUint32(entry + 8, 0, true);
  // The address is stored relative to the field that holds it.
  view.setInt32(entry + 12, bytecode - (entry + 12), true);
  view.setUint32(entry + 16, 0, true);
  pushed.forEach((index, i) => {
    // push, operand type 6: a string, whose index follows.
    view.setUint32(bytecode + i * 8, (0xc0 << 24) | (6 << 16), true);
    view.setUint32(bytecode + i * 8 + 4, index, true);
  });

  put(strgHeader, "STRG");
  view.setUint32(strgHeader + 4, total - strgData, true);
  view.setUint32(strgData, strings.length, true);
  offsets.forEach((at, i) => view.setUint32(strgData + 4 + 4 * i, at, true));
  encoded.forEach((bytes, i) => {
    view.setUint32(offsets[i], bytes.length, true);
    out.set(bytes, offsets[i] + 4);
  });

  return buffer;
}

describe("GameMaker — which strings are the player's", () => {
  const strings = [
    "Hello! How are you, friend?",
    "spr_hud_font",
    "settings.dat",
    "global_score",
    "THANKS FOR PLAYING!",
  ];

  it("takes what the bytecode pushes and leaves the rest of the table", () => {
    // `global_score` is in STRG like everything else, and no line of speech is
    // more common than a variable name — telling them apart by how they read is
    // what made the old extractor pick strings at random.
    const doc = parseGameMakerIFF(gameFile(strings, [0, 4]));
    expect(doc.strings.length).toBe(5);
    expect([...doc.constantIndices].sort()).toEqual([0, 4]);
    expect(doc.codeStats).toEqual({ functions: 1, misaligned: 0 });

    const result = extractGameMakerEntries(doc);
    expect(result.entries.map((e) => e.original)).toEqual([
      "Hello! How are you, friend?",
      "THANKS FOR PLAYING!",
    ]);
    expect(result.stats.totalStrings).toBe(5);
  });

  it("drops a pushed string that names a file or a resource", () => {
    // The code does push these — at a save file and at a sprite — and
    // translating either breaks the game rather than the text.
    const doc = parseGameMakerIFF(gameFile(strings, [0, 1, 2]));
    expect(doc.constantIndices.size).toBe(3);
    expect(extractGameMakerEntries(doc).entries.map((e) => e.original)).toEqual([
      "Hello! How are you, friend?",
    ]);
  });

  it("keeps each string's own index, so a translation lands where it belongs", () => {
    const doc = parseGameMakerIFF(gameFile(strings, [4]));
    expect(extractGameMakerEntries(doc).entries[0].index).toBe(4);
  });

  it("refuses rather than guess when the code cannot be read", () => {
    // Silence here is what produced random-looking output before: with no way
    // to tell speech from names, anything printed is a guess.
    const doc = parseGameMakerIFF(gameFile(strings, []));
    expect(() => extractGameMakerEntries(doc)).toThrow("CODE");
  });
});
