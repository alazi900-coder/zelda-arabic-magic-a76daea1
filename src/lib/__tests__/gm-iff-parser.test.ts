import { describe, it, expect } from "vitest";
import { parseGameMakerIFF, extractGameMakerEntries, buildGameMakerIFF } from "@/lib/gamemaker/gm-iff-parser";

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
  // A texture page after the strings, because that is what makes growing the
  // string table dangerous: its data is reached by an absolute offset.
  const texture = new TextEncoder().encode("PNG-ish page data");
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
  const strgEnd = p;

  const txtrHeader = strgEnd;
  const txtrData = txtrHeader + 8;
  const txtrEntry = txtrData + 8;
  const texturePixels = txtrEntry + 8;
  const total = texturePixels + texture.length;

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
  view.setUint32(strgHeader + 4, strgEnd - strgData, true);
  view.setUint32(strgData, strings.length, true);
  offsets.forEach((at, i) => view.setUint32(strgData + 4 + 4 * i, at, true));
  encoded.forEach((bytes, i) => {
    view.setUint32(offsets[i], bytes.length, true);
    out.set(bytes, offsets[i] + 4);
  });

  put(txtrHeader, "TXTR");
  view.setUint32(txtrHeader + 4, total - txtrData, true);
  view.setUint32(txtrData, 1, true);
  view.setUint32(txtrData + 4, txtrEntry, true);
  view.setUint32(txtrEntry, 0, true);
  view.setUint32(txtrEntry + 4, texturePixels, true);
  out.set(texture, texturePixels);

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

describe("GameMaker — writing a translation that does not fit", () => {
  const strings = [
    "Hello! How are you, friend?",
    "spr_hud_font",
    "settings.dat",
    "global_score",
    "THANKS FOR PLAYING!",
  ];
  const original = () => gameFile(strings, [0, 4]);

  /** Where the one texture page's pixels are, and what they read. */
  function texture(buffer: ArrayBuffer): { at: number; text: string } {
    const view = new DataView(buffer);
    const doc = parseGameMakerIFF(buffer);
    const txtr = doc.chunkLayout.find((c) => c.id === "TXTR")!;
    const entry = view.getUint32(txtr.start + 4, true);
    const at = view.getUint32(entry + 4, true);
    return { at, text: new TextDecoder().decode(new Uint8Array(buffer, at, 17)) };
  }

  it("gives back the same bytes when nothing was translated", () => {
    // The standard that catches a broken writer before the game does: a rebuild
    // that changes nothing must change no byte.
    const source = original();
    const built = buildGameMakerIFF(parseGameMakerIFF(source), {});
    expect(built.buffer.byteLength).toBe(source.byteLength);
    expect(new Uint8Array(built.buffer)).toEqual(new Uint8Array(source));
    expect(built.grewBy).toBe(0);
  });

  it("writes a shorter translation where the old one was", () => {
    const built = buildGameMakerIFF(parseGameMakerIFF(original()), { "STRG:0": "Hi" });
    expect(built.grewBy).toBe(0);
    expect(built.movedCount).toBe(0);
    expect(parseGameMakerIFF(built.buffer).strings[0].value).toBe("Hi");
  });

  it("moves a longer translation to the end and keeps the rest readable", () => {
    // Arabic is two bytes a letter against one for English, so nearly every
    // translation is longer than its original. This is the case the old writer
    // dropped without a word.
    const arabic = "مرحباً يا صديقي، كيف حالك اليوم؟ هذه ترجمة أطول من أصلها";
    const source = original();
    const before = texture(source);
    const built = buildGameMakerIFF(parseGameMakerIFF(source), { "STRG:0": arabic });

    expect(built.movedCount).toBe(1);
    expect(built.grewBy).toBeGreaterThan(0);
    expect(built.buffer.byteLength).toBe(source.byteLength + built.grewBy);

    const doc = parseGameMakerIFF(built.buffer);
    expect(doc.strings[0].value).toBe(arabic);
    // Everything else keeps its place and its meaning.
    expect(doc.strings.map((s) => s.value).slice(1)).toEqual(strings.slice(1));
    expect([...doc.constantIndices].sort()).toEqual([0, 4]);
    expect(doc.codeStats).toEqual({ functions: 1, misaligned: 0 });

    // The texture moved by exactly the growth, and its data still reads.
    const after = texture(built.buffer);
    expect(after.at).toBe(before.at + built.grewBy);
    expect(after.text).toBe(before.text);
  });

  it("grows by a multiple of the alignment the textures already keep", () => {
    const built = buildGameMakerIFF(parseGameMakerIFF(original()), {
      "STRG:0": "a translation that is a good deal longer than the original line",
    });
    const view = new DataView(original());
    const doc = parseGameMakerIFF(original());
    const txtr = doc.chunkLayout.find((c) => c.id === "TXTR")!;
    const at = view.getUint32(view.getUint32(txtr.start + 4, true) + 4, true);
    const alignment = at & -at;
    expect(built.grewBy % alignment).toBe(0);
  });

  it("refuses to move a string that something else points at", () => {
    // A resource's name is reached by its address, not by its index. Moving one
    // would leave that address pointing at whatever followed it.
    const source = original();
    const view = new DataView(source);
    const doc = parseGameMakerIFF(source);
    // Put the address of string 0's text where the function's name is read.
    view.setUint32(24, doc.strings[0].offset + 4, true);
    expect(() =>
      buildGameMakerIFF(parseGameMakerIFF(source), { "STRG:0": "a much longer line than before" })
    ).toThrow(/جدول المواضع/);
  });
});
