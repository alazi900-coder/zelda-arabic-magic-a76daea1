import { describe, expect, it } from "vitest";
import {
  GOLDENSUN2_FILE,
  goldenSun2TechnicalTokens,
  normalizeGoldenSun2EmbeddedControls,
  stripUnexpectedGoldenSun2RawControls,
  stripUnexpectedGoldenSun2InvisibleFormatting,
  prepareGoldenSun2BuildText,
  validateGoldenSun2Translation,
  parseGoldenSun2Catalog,
  goldenSun2ToEditorEntries,
  goldenSun2Translations,
  exportGoldenSun2Catalog,
} from "../goldensun2-editor-bridge";

describe("The Lost Age shared editor protection", () => {
  const original = String.raw`Hello\x03World\x02 {GS2:0011} [Name:Felix]`;

  it("preserves the exact ordered technical tag sequence", () => {
    expect(goldenSun2TechnicalTokens(original)).toEqual([
      String.raw`\x03`, String.raw`\x02`,
      "{GS2:0011}", "[Name:Felix]",
    ]);
    expect(validateGoldenSun2Translation(
      original, String.raw`أهلًا\x03بك\x02 {GS2:0011} [Name:Felix]`
    ).valid).toBe(true);
    expect(validateGoldenSun2Translation(
      original, String.raw`أهلًا\x02بك\x03 {GS2:0011} [Name:Felix]`
    ).valid).toBe(false);
    expect(validateGoldenSun2Translation(original, "أهلًا بلا وسوم").valid).toBe(false);
    expect(validateGoldenSun2Translation(original, String.raw`نص\x03\x02 {GS2:0011} [Name:felix]`).valid).toBe(false);
    expect(validateGoldenSun2Translation(original, String.raw`أهلًا\xGG`).valid).toBe(false);
  });

  it("normalizes a real U+001B ESC to a literal GS2 tag without losing the byte", () => {
    const rawEsc = String.fromCharCode(0x1b);
    expect(normalizeGoldenSun2EmbeddedControls("Hi" + rawEsc + "!")).toBe(String.raw`Hi\x1B!`);
    expect(goldenSun2TechnicalTokens("Hi" + rawEsc + "!")).toEqual([String.raw`\x1B`]);
    expect(validateGoldenSun2Translation(
      String.raw`Hello\x1B\x03`, "أهلا" + rawEsc + String.raw`\x03`
    ).valid).toBe(true);
    // An inserted ESC not present in the source MUST NOT be silently injected.
    expect(validateGoldenSun2Translation(
      String.raw`Hello\x03`, "أهلا" + rawEsc + String.raw`\x03`
    ).valid).toBe(false);
  });

  it("strips an added U+001B but leaves the game's own controls unchanged", () => {
    const esc = String.fromCharCode(0x1b);
    const source = String.raw`Hello\x03`;
    const added = "مرحبا" + esc + String.raw`\x03`;
    const clean = stripUnexpectedGoldenSun2RawControls(source, added);
    expect(clean).toEqual({ text: String.raw`مرحبا\x03`, removed: 1 });
    expect(validateGoldenSun2Translation(source, clean.text).valid).toBe(true);
    expect(added).toContain(esc);

    const originalWithEsc = String.raw`Hello\x1B\x03`;
    expect(stripUnexpectedGoldenSun2RawControls(originalWithEsc, "نص" + esc + String.raw`\x03`))
      .toEqual({ text: "نص" + esc + String.raw`\x03`, removed: 0 });
    expect(stripUnexpectedGoldenSun2RawControls(originalWithEsc,
      "نص" + esc + String.raw`\x1B\x03`))
      .toEqual({ text: "نص" + String.raw`\x1B\x03`, removed: 1 });
  });

  it("removes hidden ESC and RTL Unicode absent from the source using the same build rules", () => {
    const source = String.raw`Hello\x03`;
    const proposed = "Welcome" + String.fromCharCode(0x1b) + "\u200F\u2067\u200B" + String.raw`\x03`;
    const cleaned = prepareGoldenSun2BuildText(source, proposed);
    expect(cleaned).toMatchObject({
      text: String.raw`Welcome\x03`,
      removedHiddenControls: 1,
      removedInvisibleFormatting: 3,
      removedExtraTags: 0,
      valid: true,
    });
    expect(proposed).toContain("\u200F");
    expect(validateGoldenSun2Translation(source, cleaned.text).valid).toBe(true);
  });

  it("preserves an invisible character when it genuinely appears in the source", () => {
    const src = "Alpha\u200F\u200D Omega";
    const result = stripUnexpectedGoldenSun2InvisibleFormatting(src, "X\u200F\u200F\u200D");
    expect(result).toEqual({ text: "X\u200F\u200D", removed: 1 });
  });

  it("never removes missing original technical control tags to hide a real problem", () => {
    const result = prepareGoldenSun2BuildText(String.raw`Hello\x1B\x03`, String.raw`مرحبا\x03`);
    expect(result.valid).toBe(false);
    expect(result.removedHiddenControls).toBe(0);
  });

  it("imports explicit source rows into the same editor namespace", () => {
    const catalog = parseGoldenSun2Catalog({
      entries: [{ index: 7, original, translation: String.raw`مرحبًا\x03هنا\x02 {GS2:0011} [Name:Felix]` }],
    });
    const entries = goldenSun2ToEditorEntries(catalog);
    expect(entries).toHaveLength(1);
    expect(entries[0].msbtFile).toBe(GOLDENSUN2_FILE);
    expect(entries[0].maxBytes).toBe(0);
    const saved = goldenSun2Translations(catalog, {});
    expect(saved[GOLDENSUN2_FILE + ":7"]).toContain("مرحبًا");
    expect(exportGoldenSun2Catalog(entries, saved).entries[0].translation).toContain("مرحبًا");
  });

  it("blocks missing source text, duplicate indexes and changed tokens", () => {
    expect(() => parseGoldenSun2Catalog({ entries: [{ index: 0, source: "" }] })).toThrow();
    expect(() => parseGoldenSun2Catalog({ entries: [
      { index: 2, original: "One" }, { index: 2, original: "Two" },
    ] })).toThrow();
    expect(() => parseGoldenSun2Catalog({ entries: [
      { index: 3, original, translation: "نص دون الوسوم" },
    ] })).toThrow();
    const entries = goldenSun2ToEditorEntries(parseGoldenSun2Catalog([{ index: 5, original }]));
    expect(() => exportGoldenSun2Catalog(entries, {
      [GOLDENSUN2_FILE + ":5"]: String.raw`نص\x02\x03 {GS2:0011} [Name:Felix]`,
    })).toThrow();
  });
});
