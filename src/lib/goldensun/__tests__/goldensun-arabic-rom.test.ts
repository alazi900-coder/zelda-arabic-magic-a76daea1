import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGoldenSunRom, detectGoldenSunLayout, extractGoldenSunEditorEntries } from "../goldensun-editor-bridge";
import { hasArabicPresentationForms } from "@/lib/arabic-processing";

// GOLDENSUN_ARABIC_ROM=/path/to/an-already-translated.gba -- a ROM the tool built.
const romPath = process.env.GOLDENSUN_ARABIC_ROM;
describe.skipIf(!romPath || !existsSync(romPath))("re-opening a ROM the tool already translated", () => {
  const rom = () => new Uint8Array(readFileSync(romPath!));

  it("shows its Arabic as plain letters, so the editor never flips it as 'built' text", () => {
    const entries = extractGoldenSunEditorEntries(rom(), detectGoldenSunLayout(rom())!);
    expect(entries.some((e) => /[ء-ي]/.test(e.original))).toBe(true);
    expect(entries.filter((e) => hasArabicPresentationForms(e.original))).toEqual([]);
  });

  it("builds back to the same ROM when every line is kept as the editor shows it", () => {
    const source = rom();
    const entries = extractGoldenSunEditorEntries(source, detectGoldenSunLayout(source)!);
    // What the editor does on load: Arabic already in the ROM becomes the translation.
    const translations = Object.fromEntries(
      entries.filter((e) => /[ء-ي]/.test(e.original)).map((e) => [`${e.msbtFile}:${e.index}`, e.original]),
    );
    const out = buildGoldenSunRom(source, translations).rom;
    expect(out.length).toBe(source.length);
    expect(Buffer.from(out).equals(Buffer.from(source))).toBe(true);
  });
});
