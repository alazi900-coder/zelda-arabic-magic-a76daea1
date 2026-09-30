import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtractedEntry } from "@/components/editor/types";
import { editorTagPattern } from "@/lib/editor-tag-pattern";
import { resolveGameParam } from "@/lib/game-param";
import { BUILTIN_RULES } from "@/lib/enhance-rules";
import { detectIssues } from "@/lib/diagnostic-detect";
import { GTASA_CATEGORIES, categorizeGtaSaEntry } from "./gtasa-categories";
import { GTASA_TAG_RE, extractGtaSaTags, repairGtaSaTags, validateGtaSaTags } from "./gtasa-tags";
import { exportGtaSaJson, importGtaSaJson } from "./gtasa-editor-bridge";

describe("GTA San Andreas technical token guard", () => {
  it("keeps colour, line-break, number and button tokens in order", () => {
    const src = "~s~Go get the ~b~SWAT Tank~s~.";
    expect(validateGtaSaTags(src, "~s~اذهب إلى ~b~دبابة سوات~s~.").valid).toBe(true);
    expect(validateGtaSaTags(src, "~s~اذهب إلى ~s~دبابة سوات~b~.").valid).toBe(false);
    expect(validateGtaSaTags(src, "اذهب إلى دبابة سوات.").valid).toBe(false);
  });
  it("treats capital and lower-case tokens as different", () => {
    expect(validateGtaSaTags("~S~Hi", "~s~مرحبا").valid).toBe(false);
  });
  it("reads d-pad arrows as adjacent tokens, as the export does", () => {
    expect(extractGtaSaTags("~u~~d~~<~~>~ Adjust")).toEqual(["~u~", "~d~", "~<~", "~>~"]);
  });
  it("leaves a dollar sign outside the number token", () => {
    expect(extractGtaSaTags("It costs $~1~, interested?")).toEqual(["~1~"]);
  });
  it("repairs only a dropped terminal run", () => {
    expect(repairGtaSaTags("Money: ~1~", "المال:")).toEqual({ text: "المال:~1~", changed: true });
    expect(repairGtaSaTags("Press ~m~~widget_brake~ to stop", "اضغط للتوقف").changed).toBe(false);
  });

  it("restores a tilde a token lost, and nothing it cannot place for certain", () => {
    expect(repairGtaSaTags("~r~Wasted~s~", "~rخسرت~s~").text).toBe("~r~خسرت~s~");
    expect(repairGtaSaTags("Press ~widget_brake~ now", "اضغط widget_brake~ الآن").text).toBe("اضغط ~widget_brake~ الآن");
    expect(repairGtaSaTags("~r~A~n~B", "~rأ~nب").text).toBe("~r~أ~n~ب");
    expect(repairGtaSaTags("~r~Wasted~s~", "~s~خسرت~r~").changed).toBe(false);
  });
});

describe("GTA San Andreas filters", () => {
  const cat = (msbtFile: string, original: string) => categorizeGtaSaEntry({ msbtFile, original });
  it("has a bucket for every id it can return", () => {
    const ids = new Set(GTASA_CATEGORIES.map((c) => c.id));
    for (const [f, t] of [
      ["gtasa/MAIN", "STEAL_4"], ["gtasa/CASINO2", "Bet now"], ["gtasa/RIOT4", "~s~Go."],
      ["gtasa/RIOT4", "Hello"], ["gtasa/MAIN", "Press ~m~~widget_brake~"], ["gtasa/MAIN", "Save The Game"],
      ["gtasa/MAIN", "Yo, man, it's Jethro, dude!"],
    ]) expect(ids.has(cat(f, t))).toBe(true);
  });
  it("splits mission tables from MAIN", () => {
    expect(cat("gtasa/RIOT4", "~s~Get the ~b~Tank~s~.")).toBe("sa-missions");
    expect(cat("gtasa/RIOT4", "What were you thinking?")).toBe("sa-dialogue");
    expect(cat("gtasa/MAIN", "Las Barrancas")).toBe("sa-names");
    expect(cat("gtasa/MAIN", "Yo, man, it's Jethro, dude!")).toBe("sa-messages");
    expect(cat("gtasa/MAIN", "To pedal hold down ~m~~widget_accelerate~.")).toBe("sa-help");
  });
  it("puts keys and bare values apart, and gambling together", () => {
    expect(cat("gtasa/MAIN", "HEIST3a")).toBe("sa-internal");
    expect(cat("gtasa/SHTR", "3")).toBe("sa-internal");
    expect(cat("gtasa/DS", "~<~~>~")).toBe("sa-internal");
    expect(cat("gtasa/MAIN", "Total Wager")).toBe("sa-gambling");
    expect(cat("gtasa/CASINO6", "Hello there")).toBe("sa-gambling");
  });
});

describe("GTA San Andreas JSON bridge", () => {
  const rows = [
    { table: "MAIN", hash: "0056529D", source: "Stats", arabic: "الاحصائيات" },
    { table: "MAIN", hash: "005B0706", source: "STEAL_4", arabic: "STEAL_4" },
    { table: "RIOT4", hash: "00ABCDEF", source: "~s~Go.", arabic: "~s~اذهب." },
  ];
  it("shows English as the original and Arabic as the translation", () => {
    const { entries, translations } = importGtaSaJson(rows);
    expect(entries[0]).toMatchObject({ msbtFile: "gtasa/MAIN", index: 0x0056529d, original: "Stats" });
    expect(translations[`gtasa/MAIN:${0x0056529d}`]).toBe("الاحصائيات");
  });
  it("leaves a line whose Arabic equals its English untranslated", () => {
    const { translations } = importGtaSaJson(rows);
    expect(translations[`gtasa/MAIN:${0x005b0706}`]).toBe("");
  });
  it("round-trips the file exactly, untranslated lines included", () => {
    const { entries, translations } = importGtaSaJson(rows);
    expect(exportGtaSaJson(entries, translations)).toEqual(rows);
  });
  it("refuses to export a line that lost its tokens", () => {
    const { entries, translations } = importGtaSaJson(rows);
    translations[`gtasa/RIOT4:${0x00abcdef}`] = "اذهب.";
    expect(() => exportGtaSaJson(entries, translations)).toThrow(/RIOT4/);
  });
  it("rejects a malformed or duplicated row", () => {
    expect(() => importGtaSaJson({})).toThrow();
    expect(() => importGtaSaJson([{ table: "MAIN", hash: "XYZ", source: "a", arabic: "b" }])).toThrow(/غير صالح/);
    expect(() => importGtaSaJson([rows[0], rows[0]])).toThrow(/مكرر/);
  });
});

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
const EDGE_SOURCE = read("../../../supabase/functions/enhance-translations/index.ts");
const TRANSLATE_SOURCE = read("../../../supabase/functions/translate-entries/index.ts");

describe("GTA San Andreas in the shared editor tools", () => {
  it("is recognised from its file prefix", () => {
    expect(resolveGameParam("gtasa/MAIN")).toBe("gtasa");
    expect(resolveGameParam("gtaiv/MAIN")).toBe("gtaiv");
  });
  it("highlights ~...~ tokens, and leaves #2 alone", () => {
    const re = editorTagPattern("gtasa/MAIN");
    expect("~s~Go ~b~now~s~ on port #2".match(re)).toEqual(["~s~", "~b~", "~s~"]);
  });
  it("reports a lost token in the deep scan as critical", () => {
    const issues = detectIssues({ msbtFile: "gtasa/RIOT4", index: 1, label: "RIOT4 · 00000001", original: "~s~Go.", maxBytes: 0 } as ExtractedEntry, "اذهب.");
    expect(issues.some((i) => i.category === "tag_mismatch" && i.severity === "critical")).toBe(true);
    expect(detectIssues({ msbtFile: "gtasa/RIOT4", index: 1, label: "x", original: "~s~Go.", maxBytes: 0 } as ExtractedEntry, "~s~اذهب.").some((i) => i.category === "tag_mismatch")).toBe(false);
  });
});

describe("GTA San Andreas rules in the AI enhancement tool", () => {
  const ids = ["detect_gtasa_tags", "detect_gtasa_names"];
  it("offers both rules as toggles", () => {
    for (const id of ids) expect(BUILTIN_RULES.some((r) => r.id === id)).toBe(true);
  });
  it("declares the same prompt text on both sides", () => {
    for (const id of ids) {
      const rule = BUILTIN_RULES.find((r) => r.id === id)!;
      expect(EDGE_SOURCE).toContain(rule.prompt.replace(/\\/g, "\\\\"));
    }
  });
  it("injects them only for GTA San Andreas requests", () => {
    expect(EDGE_SOURCE).toContain("const GTASA_ONLY_RULE_IDS = new Set(['detect_gtasa_tags', 'detect_gtasa_names']);");
    expect(EDGE_SOURCE).toContain("(!GTASA_ONLY_RULE_IDS.has(r.id) || isGtaSa)");
    expect(EDGE_SOURCE).toContain("const isGtaSa = game === 'gtasa'");
  });
  it("uses the same token pattern as the editor", () => {
    const edge = /const GTASA_TOKEN_REGEX = (\/.+?\/g);/.exec(EDGE_SOURCE);
    expect(edge).not.toBeNull();
    expect(edge![1]).toBe(`/${GTASA_TAG_RE.source}/g`);
  });
  it("refuses a suggestion that loses a token, before it is returned", () => {
    expect(EDGE_SOURCE).toContain("(!isGtaSa || preservesGtaSaTokenSequence(original, suggested))");
    expect(EDGE_SOURCE.match(/isSafeSuggestion\(/g)?.length).toBe(
      (EDGE_SOURCE.match(/isPokemonXp, isCrashlands, isNinthDawn, isInazuma, isFranBow, isTwom, isGtaSa\)/g)?.length ?? 0) + 1
    );
  });
  it("checks the panel before counting a suggestion as applied", () => {
    const PANEL = read("../../components/editor/TranslationAIEnhancePanel.tsx");
    expect(PANEL).toContain('const isGtaSa = gameParam === "gtasa"');
    expect(PANEL).toContain("if (isGtaSa) return validateGtaSaTags(original, repairGtaSaTags(original, suggestion).text).reason ?? null;");
  });
  it("masks ~...~ before the auto-translate model ever sees it", () => {
    expect(TRANSLATE_SOURCE).toContain("if (_game === 'gtasa')");
    expect(TRANSLATE_SOURCE).toContain("if (_game === 'gtasa') return GTASA_SYSTEM_PROMPT;");
    expect(TRANSLATE_SOURCE).toContain("game === 'gtasa' ? 'gtasa'");
  });
});

// Optional local fixture: no game data is committed. Run with
// GTASA_TEST_JSON=/path/to/GTA-SA-Arabic-FINAL-17165.json to check the
// guard, the bridge and the filters against every line of the real export.
const fixturePath = process.env.GTASA_TEST_JSON;
describe.skipIf(!fixturePath)("the real export", () => {
  const rows = () => JSON.parse(readFileSync(fixturePath!, "utf8")) as { table: string; hash: string; source: string; arabic: string }[];
  it("keeps every token of every line in its finished Arabic", () => {
    let bad = 0;
    for (const r of rows()) if (!validateGtaSaTags(r.source, r.arabic).valid) bad++;
    expect(bad).toBe(0);
  });
  it("imports 17,165 lines and exports the same file byte for byte", () => {
    const input = rows();
    const { entries, translations } = importGtaSaJson(input);
    expect(entries.length).toBe(input.length);
    expect(exportGtaSaJson(entries, translations)).toEqual(input);
  });
  it("puts every line in a known filter", () => {
    const ids = new Set(GTASA_CATEGORIES.map((c) => c.id));
    const { entries } = importGtaSaJson(rows());
    const counts: Record<string, number> = {};
    for (const e of entries as ExtractedEntry[]) {
      const id = categorizeGtaSaEntry(e);
      expect(ids.has(id)).toBe(true);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    console.log("GTA SA filter counts", counts);
  });
});
