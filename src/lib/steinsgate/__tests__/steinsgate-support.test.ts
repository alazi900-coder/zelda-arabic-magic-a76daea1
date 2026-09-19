import { describe, expect, it } from "vitest";
import { categorizeSteinsGateEntry } from "../steinsgate-categories";
import { extractSteinsGateTags, repairSteinsGateTags, validateSteinsGateTags, isSteinsGateTranslatable } from "../steinsgate-tags";
import { analyzeSteinsGateUnsupportedCharacters } from "../steinsgate-format";
import { processArabicText } from "@/lib/arabic-processing";
import { detectIssues } from "@/lib/diagnostic-detect";
import { mergeGuardedTranslations } from "@/lib/risen-write-guard";
import type { EditorState } from "@/components/editor/types";
import { resolveGameParam } from "@/lib/game-param";

const entry = (file: string, original = "Text") => ({
  msbtFile: `steinsgate/${file}`,
  index: 0,
  label: "0",
  original,
  maxBytes: 0,
});

describe("Steins;Gate PSP support", () => {
  it("routes the game to its own AI prompt", () => {
    expect(resolveGameParam("steinsgate/SG00_01.BIN")).toBe("steinsgate");
  });

  it("classifies menus and story dialogue separately", () => {
    expect(categorizeSteinsGateEntry(entry("MAIN.BIN"))).toBe("sg-main-menu");
    expect(categorizeSteinsGateEntry(entry("SG02_11.BIN"))).toBe("sg-dialogue");
  });

  it("recognizes and validates engine commands in order", () => {
    expect(extractSteinsGateTags("Hello%CF8FF8world%K%P")).toEqual(["%CF8FF8", "%K", "%P"]);
    expect(validateSteinsGateTags("Hello%K%P", "مرحبا%K%P").valid).toBe(true);
    expect(validateSteinsGateTags("Hello%K%P", "مرحبا%P%K").valid).toBe(false);
  });

  it("restores an unambiguous command suffix", () => {
    expect(repairSteinsGateTags("Hello%K%P", "مرحبا")).toEqual({ text: "مرحبا%K%P", changed: true });
  });

  it("does not consume prose adjacent to a fixed-length engine command", () => {
    expect(extractSteinsGateTags('%B1SOrganization%B1E%LCYou%t052noun%CF8FF8ABC%CE')).toEqual(['%B1S', '%B1E', '%LC', '%t052', '%CF8FF8', '%CE']);
  });

  it("protects both kinds of source line breaks without guessing inline repairs", () => {
    expect(validateSteinsGateTags('a%Nb\\nc%K%P', 'أ%Nب\\nج%K%P').valid).toBe(true);
    expect(validateSteinsGateTags('a%Nb\\nc%K%P', 'أبج%K%P').valid).toBe(false);
    expect(repairSteinsGateTags('a%Nb%K%P', 'أب').changed).toBe(false);
  });

  it("keeps visible words but excludes commands, phone numbers and filenames", () => {
    for (const text of ['LOAD', 'EXTRA', 'Daru', 'Assistant']) expect(isSteinsGateTranslatable('DATA.BIN', text)).toBe(true);
    for (const text of ['%L1', '%T1　%T2', '080X801X338', 'OBJ_TT.P2T']) expect(isSteinsGateTranslatable('DATA.BIN', text)).toBe(false);
    expect(isSteinsGateTranslatable('DMENU.BIN', 'Debug command')).toBe(false);
  });

  it("reports a missing command in the deep diagnostic", () => {
    expect(detectIssues(entry('SG00_01.BIN', 'Hello%K%P'), 'مرحبا').some(i => i.category === 'tag_mismatch')).toBe(true);
  });

  it("repairs suffixes and rejects broken inline commands on bulk AI writes", () => {
    const e = entry('SG00_01.BIN', 'Hello%K%P');
    const k = `${e.msbtFile}:0`;
    const state = { entries: [e], translations: { [k]: 'قديم%K%P' } } as unknown as EditorState;
    expect(mergeGuardedTranslations(state, { [k]: 'مرحبا' }).translations[k]).toBe('مرحبا%K%P');
    state.entries[0].original = 'Hello%Nworld%K%P';
    expect(mergeGuardedTranslations(state, { [k]: 'مرحبا' }).translations[k]).toBe('قديم%K%P');
  });
});

describe("Steins;Gate unsupported characters", () => {
  // The real map holds Arabic presentation forms, never base letters, so the
  // fixture is built the way buildGlyphMap builds it: whatever shaping emits.
  const glyphMapFor = (...samples: string[]): Record<string, number[]> => {
    const map: Record<string, number[]> = {};
    let slot = 0x40;
    for (const sample of samples) {
      for (const char of processArabicText(sample, { mirrorPunct: true })) {
        if (!map[char]) map[char] = [0x81, slot++];
      }
    }
    return map;
  };

  it("reports nothing when every shaped letter has a glyph", () => {
    const map = glyphMapFor("مرحبا");
    expect(analyzeSteinsGateUnsupportedCharacters("مرحبا", map)).toEqual([]);
  });

  it("does not call a base Arabic letter unsupported just because it is unshaped", () => {
    // Checking the text as typed would flag every letter: the map is keyed by
    // presentation forms. This is the mistake the shared pipeline prevents.
    const map = glyphMapFor("مرحبا");
    expect(Object.keys(map).some((char) => char === "م")).toBe(false);
    expect(analyzeSteinsGateUnsupportedCharacters("مرحبا", map)).toEqual([]);
  });

  it("names a character with no glyph, once, with its count", () => {
    // Persian peh is an Arabic letter the shaper leaves alone: it has no form
    // in U+FE70-U+FEFC, so it is the real shape of this failure.
    const map = glyphMapFor("مرحبا");
    const found = analyzeSteinsGateUnsupportedCharacters("پمرحباپ", map);
    expect(found).toHaveLength(1);
    expect(found[0].unicode).toBe("U+067E");
    expect(found[0].count).toBe(2);
  });

  it("lists every offending character, not just the first", () => {
    // The build stops at the first one; the point of the report is the rest.
    const map = glyphMapFor("مرحبا");
    const found = analyzeSteinsGateUnsupportedCharacters("پمرحبا٠", map);
    expect(found.map((item) => item.unicode).sort()).toEqual(["U+0660", "U+067E"]);
  });

  it("says nothing about tashkeel, which shaping removes before the font sees it", () => {
    const map = glyphMapFor("مرحبا");
    expect(analyzeSteinsGateUnsupportedCharacters("مَرحّبا", map)).toEqual([]);
  });

  it("passes ASCII and the punctuation the encoder special-cases", () => {
    expect(analyzeSteinsGateUnsupportedCharacters("Okabe 2010 […] —", {})).toEqual([]);
  });

  it("leaves engine commands alone — they are not drawn text", () => {
    const map = glyphMapFor("مرحبا");
    expect(analyzeSteinsGateUnsupportedCharacters("%K%Pمرحبا", map)).toEqual([]);
  });

  it("reports the protected arrow, because the build refuses it too", () => {
    // `▼` is written back as a lone CR, and STEINSGATE_TAG_RE only matches a CR
    // that carries a newline (`\r?\n`), so the encoder hands the bare CR to the
    // font and throws. The report says so rather than hiding a build failure.
    const map = glyphMapFor("مرحبا");
    const found = analyzeSteinsGateUnsupportedCharacters("مرحبا▼", map);
    expect(found.map((item) => item.unicode)).toEqual(["U+000D"]);
  });
});
