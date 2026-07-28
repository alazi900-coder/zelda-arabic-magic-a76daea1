import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  extractWolfEntries,
  buildWolfIpa,
  isTranslatable,
  wolfEntryFile,
  parseWolfEntryFile,
} from "@/lib/wolfrpg/wolf-editor-bridge";
import { WOLF_PACKAGES_PREFIX, openIpa, readPackagesFile } from "@/lib/wolfrpg/wolf-ipa";
import { decodeWolfBytes, encodeArabicForWolf } from "@/lib/wolfrpg/wolf-charmap";
import { processArabicText } from "@/lib/arabic-processing";

const rec = (flags: number, bank: number, off: number) => [flags & 0xff, flags >> 8, bank, off & 0xff, off >> 8];

/** An archive shaped like the shipped one: two banks, sections named only by
 *  their offsets in the index, and a 0xFF record closing each block. */
async function makeIpa(): Promise<Uint8Array> {
  const bank0 = new TextEncoder().encode("Continue\0New Game\0%01\0Fists\0Shot-gun\0");
  const bank1 = new TextEncoder().encode("Cat-a-combs\0|\0To To-wer\0");
  const idx = new Uint8Array([
    ...rec(0x44, 0, 0),
    ...rec(0, 0, 22), // section B starts at "Fists"
    ...rec(0, 0xff, bank0.length),
    ...rec(0, 1, 0),
    ...rec(0, 0xff, bank1.length),
    0x00, 0x00,
  ]);
  const zip = new JSZip();
  // Copy into a plain array first: a Uint8Array minted in another realm fails
  // JSZip's type check, the same trap replaceIpaEntries documents.
  zip.file(WOLF_PACKAGES_PREFIX + "strings.idx", new Uint8Array(idx));
  zip.file(WOLF_PACKAGES_PREFIX + "strings00.bin", new Uint8Array(bank0));
  zip.file(WOLF_PACKAGES_PREFIX + "strings01.bin", new Uint8Array(bank1));
  zip.file("Payload/other", "untouched");
  return zip.generateAsync({ type: "uint8array" });
}

describe("Wolfenstein RPG editor bridge", () => {
  it("keys entries by bank and section, both readable back", () => {
    expect(wolfEntryFile(1, 4)).toBe("wolf_b1_s4");
    expect(parseWolfEntryFile("wolf_b1_s4")).toEqual({ bank: 1, section: 4 });
    expect(parseWolfEntryFile("TEXT_Subtitles")).toBeNull();
  });

  it("skips strings that are only engine markup", () => {
    // `|` is the line break and `%01` a runtime value; a row holding nothing
    // else is a row a translator would have to skip by hand.
    expect(isTranslatable("Continue")).toBe(true);
    expect(isTranslatable("%01")).toBe(false);
    expect(isTranslatable("|")).toBe(false);
    expect(isTranslatable("%01 keys")).toBe(true);
  });

  it("extracts every translatable string with its section key", async () => {
    const { entries, totalStrings, sectionCount } = await extractWolfEntries(await makeIpa());
    expect(totalStrings).toBe(8);
    expect(sectionCount).toBe(3);
    expect(entries.map((e) => `${e.msbtFile}:${e.index} ${e.original}`)).toEqual([
      "wolf_b0_s0:0 Continue",
      "wolf_b0_s0:1 New Game",
      "wolf_b0_s1:0 Fists",
      "wolf_b0_s1:1 Shot-gun",
      "wolf_b1_s0:0 Cat-a-combs",
      "wolf_b1_s0:2 To To-wer",
    ]);
  });

  it("builds an .ipa whose strings decode back to the Arabic that went in", async () => {
    const src = await makeIpa();
    const result = await buildWolfIpa(src, { "wolf_b0_s0:0": "متابعة" });
    if ("error" in result) throw new Error(result.error);
    expect(result.translatedLines).toBe(1);

    const ipa = await openIpa(result.ipa);
    const bank0 = await readPackagesFile(ipa, "strings00.bin");
    // One char per byte, by hand: TextDecoder's "latin1" is windows-1252, which
    // rewrites 0x80-0x9f — and those are slot bytes carrying Arabic here.
    const first = Array.from(bank0.subarray(0, bank0.indexOf(0)), (b) => String.fromCharCode(b)).join("");
    // Stored shaped and reversed, so reading it back needs the same reversal.
    expect([...decodeWolfBytes(first)].reverse().join("")).toBe("ﻣﺘﺎﺑﻌﺔ");
    expect(new TextDecoder().decode(await ipa.zip.file("Payload/other")!.async("uint8array"))).toBe("untouched");
  });

  it("moves the section offsets that a shorter translation shifts", async () => {
    const src = await makeIpa();
    const result = await buildWolfIpa(src, { "wolf_b0_s0:0": "ا" });
    if ("error" in result) throw new Error(result.error);
    const idx = await readPackagesFile(await openIpa(result.ipa), "strings.idx");
    // "Continue" (8 bytes) became one byte, so section B and the declared bank
    // size both move down by 7.
    expect(idx[8] | (idx[9] << 8)).toBe(22 - 7);
    expect(idx[13] | (idx[14] << 8)).toBe(37 - 7);
  });

  it("reports characters the 144-cell font has no slot for", async () => {
    const result = await buildWolfIpa(await makeIpa(), { "wolf_b0_s0:0": "متابعة ♥" });
    if ("error" in result) throw new Error(result.error);
    expect(result.unmapped).toContain("♥");
  });

  it("refuses to build when nothing is translated", async () => {
    const result = await buildWolfIpa(await makeIpa(), {});
    expect("error" in result && result.error).toMatch(/لا توجد ترجمات/);
  });

  it("carries the Arabic fonts into the archive when they exist", async () => {
    const font = new Uint8Array([1, 2, 3, 4]);
    const src = await makeIpa();
    // The archive has no font entries, so replaceIpaEntries must say so rather
    // than quietly dropping them — a build that claims a font it did not ship
    // is the worst outcome here.
    const result = await buildWolfIpa(src, { "wolf_b0_s0:0": "متابعة" }, { "Font.bmp": font });
    expect("error" in result && result.error).toMatch(/Font\.bmp/);
  });

  it("would reverse the line if the editor had already shaped it", async () => {
    // The build shapes and reverses on its own, so text put through the
    // editor's Arabic processing first comes out backwards — measured, not
    // assumed. This is why the processing button is hidden for Wolfenstein;
    // the day someone re-enables it, this test says what it costs.
    const plain = "متابعة";
    const direct = encodeArabicForWolf(plain).text;
    const preShaped = encodeArabicForWolf(processArabicText(plain)).text;
    expect([...preShaped].reverse().join("")).toBe(direct);
    expect(preShaped).not.toBe(direct);
  });
});
