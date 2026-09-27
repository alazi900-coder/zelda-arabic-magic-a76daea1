import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveGameParam } from "@/lib/game-param";
import { BUILTIN_RULES } from "@/lib/enhance-rules";
import { detectIssues } from "@/lib/diagnostic-detect";
import { editorTagPattern } from "@/lib/editor-tag-pattern";
import { TWOM_CATEGORIES, categorizeTwomEntry, twomCategoryId } from "./twom-categories";
import { extractTwomTags, repairTwomTags, validateTwomTags } from "./twom-tags";
import { exportTwomJson, importTwomJson, TWOM_FORMAT } from "./twom-editor-bridge";

const row = (i: number, category: string, key: string, source: string, translation = "", technical_tokens: string[] = []) => ({
  id: `twom-stories/${key}`, key, index: i, category, source, translation, technical_tokens, status: translation ? "translated" : "untranslated",
});
const sampleDoc = {
  format: TWOM_FORMAT,
  game: "This War of Mine: Stories",
  version: "1.0.7",
  instructions: "عدّل translation فقط.",
  entry_count: 3,
  entries: [
    row(0, "Items", "Items/Groups/Tools", "Tools", "أدوات"),
    row(1, "SpeechesTemporaryBlockade", "SpeechesTemporaryBlockade/Door/Kids/01", "This door can't stop me, I'm {ms|superman}{fs|wonder woman}!", "", ["{ms|superman}", "{fs|wonder woman}"]),
    row(2, "UI", "UI/Menu/Ok", "OK|XPadA|", "", ["|XPadA|"]),
  ],
};

describe("twom-tags", () => {
  it("lists tokens the same way the export's technical_tokens does", () => {
    expect(extractTwomTags("^CharacterName^ says {mr|he}{fr||she} is tired.<BR>|XPadA|")).toEqual(["^CharacterName^", "{mr|he}", "{fr||she}", "<BR>", "|XPadA|"]);
  });
  it("accepts a translated word inside a gender tag, and a whole verb moved inside", () => {
    const src = "I told {mr|him}{fr|her} to leave.";
    expect(validateTwomTags(src, "أخبرت{mr|ه}{fr|ها} أن يرحل.").valid).toBe(true);
    expect(validateTwomTags("{mr|He}{fr|She} left.", "{mr|رحل}{fr|رحلت}.").valid).toBe(true);
    // an extra tag of a kind the line already uses is allowed
    expect(validateTwomTags("{mr|He}{fr|She} is tired.", "{mr|هو}{fr|هي} {mr|متعب}{fr|متعبة}.").valid).toBe(true);
    // English left inside is not the tag guard's business
    expect(validateTwomTags("{mr|He}{fr|She} left.", "{mr|He}{fr|She} رحل.").valid).toBe(true);
  });
  it("refuses a missing kind, a new kind, a broken frame, and a lost fixed token", () => {
    const src = "{mr|He}{fr|She} left.";
    expect(validateTwomTags(src, "{mr|رحل}.").valid).toBe(false);
    expect(validateTwomTags(src, "{mr|رحل}{fr|رحلت}{ms|أنا}.").valid).toBe(false);
    expect(validateTwomTags(src, "{mr|رحل}{fr|رحلت.").valid).toBe(false);
    expect(validateTwomTags("^CharacterName^ died.", "مات.").valid).toBe(false);
    expect(validateTwomTags("^CharacterName^ died.", "مات ^CharacterName^.").valid).toBe(true);
  });
  it("repairs only the frame, never the word inside", () => {
    expect(repairTwomTags("{mr|He}{fr|She} left.", "{ MR | رحل }{fr|رحلت}.").text).toBe("{mr|رحل }{fr|رحلت}.");
    expect(repairTwomTags("{mr|He}{fr|She} left.", "{mr|رحل{fr|رحلت}.").text).toBe("{mr|رحل}{fr|رحلت}.");
    expect(repairTwomTags("I saw {mr|him}{fr|her}", "رأيت{mr|ه}{fr|ها").text).toBe("رأيت{mr|ه}{fr|ها}");
    expect(repairTwomTags("{mr|He}{fr|She} left.", "{mr|رحل}fr|رحلت}.").text).toBe("{mr|رحل}{fr|رحلت}.");
    expect(repairTwomTags("^CharacterName^ died.", "مات ^ charactername ^.").text).toBe("مات ^CharacterName^.");
    expect(repairTwomTags("OK|XPadA|", "موافق").text).toBe("موافق|XPadA|");
    expect(repairTwomTags("<HEADER>Day 1", "اليوم 1").text).toBe("<HEADER>اليوم 1");
    for (const [src, tr] of [["{mr|He}{fr|She} left.", "{ MR | رحل }{fr|رحلت}."], ["OK|XPadA|", "موافق"]]) {
      expect(validateTwomTags(src, repairTwomTags(src, tr).text).valid).toBe(true);
    }
  });
  it("leaves an already valid line untouched", () => {
    const r = repairTwomTags("{mr|He}{fr|She} left.", "{mr|Hello world}{fr|رحلت}.");
    expect(r.changed).toBe(false);
  });
});

describe("twom deep scan", () => {
  const entry = { msbtFile: "twom/tw-speech/1", index: 1, label: "k", original: "This door can't stop me, I'm {ms|superman}{fs|wonder woman}!", maxBytes: Number.MAX_SAFE_INTEGER };
  it("does not call a correctly translated gender tag a translated/damaged tag", () => {
    const issues = detectIssues(entry, "هذا الباب لن يوقفني، أنا {ms|الرجل الخارق}{fs|المرأة الخارقة}!");
    expect(issues.filter((i) => /tag|technical/.test(i.category))).toEqual([]);
  });
  it("reports a broken frame under its own fixable category", () => {
    const issues = detectIssues(entry, "هذا الباب لن يوقفني، أنا {ms|الرجل الخارق{fs|المرأة الخارقة}!");
    expect(issues.map((i) => i.category)).toContain("twom_tag_mismatch");
    expect(issues.every((i) => i.key === "twom/tw-speech/1:1")).toBe(true);
  });
});

describe("twom-categories", () => {
  it("groups the export's categories into the seven filters", () => {
    expect(TWOM_CATEGORIES.map((c) => c.id)).toEqual(["tw-dialogue", "tw-speech", "tw-characters", "tw-logs", "tw-places", "tw-items", "tw-ui"]);
    expect(twomCategoryId("Dialogues")).toBe("tw-dialogue");
    expect(twomCategoryId("StateSpeeches")).toBe("tw-speech");
    expect(twomCategoryId("CharacterBios")).toBe("tw-characters");
    expect(twomCategoryId("Radio")).toBe("tw-logs");
    expect(twomCategoryId("VisitDescriptions")).toBe("tw-places");
    expect(twomCategoryId("Items")).toBe("tw-items");
    expect(twomCategoryId("SomethingNew")).toBe("tw-ui");
    expect(categorizeTwomEntry({ msbtFile: "twom/tw-logs/9" })).toBe("tw-logs");
  });
});

describe("twom-editor-bridge", () => {
  it("imports the source as the original and keeps existing translations", () => {
    const { entries, translations } = importTwomJson(sampleDoc);
    expect(entries.map((e) => e.msbtFile)).toEqual(["twom/tw-items/0", "twom/tw-speech/1", "twom/tw-ui/2"]);
    expect(entries[0].original).toBe("Tools");
    expect(translations["twom/tw-items/0:0"]).toBe("أدوات");
    expect(resolveGameParam(entries[1].msbtFile)).toBe("twom");
    expect(() => importTwomJson({ ...sampleDoc, format: "other" })).toThrow();
  });
  it("exports the same file shape with only translation and status changed", () => {
    const { entries, translations } = importTwomJson(sampleDoc);
    const doc = exportTwomJson(entries, { ...translations, "twom/tw-ui/2:2": "موافق|XPadA|" });
    expect(Object.keys(doc)).toEqual(Object.keys(sampleDoc));
    expect((doc as Record<string, unknown>).version).toBe("1.0.7");
    expect(doc.entries[2]).toEqual({ ...sampleDoc.entries[2], translation: "موافق|XPadA|", status: "translated" });
    expect(doc.entries[1]).toEqual(sampleDoc.entries[1]);
  });
  it("refuses to export a line whose tokens are broken", () => {
    const { entries, translations } = importTwomJson(sampleDoc);
    expect(() => exportTwomJson(entries, { ...translations, "twom/tw-ui/2:2": "موافق" })).toThrow();
  });
});

describe("twom editor and AI wiring", () => {
  it("marks the tag frame but not the word inside it", () => {
    const parts = "أنا {ms|الرجل الخارق}".split(editorTagPattern("twom/tw-speech/1")).filter(Boolean);
    expect(parts).toEqual(["أنا ", "{ms|", "الرجل الخارق", "}"]);
  });
  it("has its own review rule, used only for this game", () => {
    expect(BUILTIN_RULES.map((r) => r.id)).toContain("detect_twom_tags");
    const EDGE = readFileSync(resolve(__dirname, "../../../supabase/functions/enhance-translations/index.ts"), "utf8");
    expect(EDGE).toContain("const TWOM_ONLY_RULE_IDS = new Set(['detect_twom_tags']);");
    expect(EDGE).toContain("const isTwom = game === 'twom';");
    expect(EDGE).toContain("(!isTwom || preservesTwomTokens(original, suggested))");
    const edgePrompt = /\{ id: 'detect_twom_tags', kind: 'detect', prompt: '(.*?)' \},/.exec(EDGE)?.[1];
    expect(edgePrompt).toBe(BUILTIN_RULES.find((r) => r.id === "detect_twom_tags")!.prompt);
  });
});
