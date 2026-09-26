import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exportCrashlandsJson, importCrashlandsJson } from "./crashlands-editor-bridge";
import type { ExtractedEntry } from "@/components/editor/types";
import { editorTagPattern } from "@/lib/editor-tag-pattern";
import { resolveGameParam } from "@/lib/game-param";
import { BUILTIN_RULES } from "@/lib/enhance-rules";
import { CRASHLANDS_CATEGORIES, categorizeCrashlandsEntry } from "./crashlands-categories";
import { CRASHLANDS_TAG_RE, extractCrashlandsTags, isChineseSource, repairCrashlandsTags, validateCrashlandsTags } from "./crashlands-tags";

describe("Crashlands technical token guard", () => {
  it("preserves ordered placeholders and hash breaks", () => {
    expect(validateCrashlandsTags("Find %r#Now", "اعثر على %r#الآن").valid).toBe(true);
    expect(validateCrashlandsTags("Find %r#Now", "اعثر على #الآن").valid).toBe(false);
  });
  it("repairs only a missing terminal placeholder", () => {
    expect(repairCrashlandsTags("Hello %r", "مرحباً")).toEqual({ text: "مرحباً%r", changed: true });
    expect(repairCrashlandsTags("Hello %r world", "مرحباً بالعالم").changed).toBe(false);
  });
  it("round-trips the editable JSON identity", () => {
    const loaded = importCrashlandsJson({ format: "crashlands-arabic-editable-v1", entries: [{ id: "assets/ui:tags/UI/text/PLAY", section: "UI", source: "Play %r", translation: "العب %r" }] });
    const out = exportCrashlandsJson(loaded.entries, loaded.translations);
    expect(out.entries[0]).toMatchObject({ id: "assets/ui:tags/UI/text/PLAY", translation: "العب %r" });
  });
});

describe("Crashlands prose that only looks technical", () => {
  it("leaves a bare percentage alone", () => {
    // "-25% physical resistance" is a sentence. Treating its `%` as a token
    // would make every stat line fail the guard for no reason.
    expect(extractCrashlandsTags("-25% physical resistance")).toEqual([]);
    expect(validateCrashlandsTags("-25% physical resistance", "‎-25% مقاومة جسدية").valid).toBe(true);
  });
  it("reads the percent sign after %r as prose", () => {
    expect(extractCrashlandsTags("deals %r% bonus damage")).toEqual(["%r"]);
  });
});

describe("Crashlands highlighting", () => {
  it("marks %r and # in a Crashlands row", () => {
    const pattern = editorTagPattern("crashlands/campaign/12");
    expect("press %r to join#now".match(pattern)).toEqual(["%r", "#"]);
  });
  it("keeps the Xenoblade colour codes on Xenoblade rows", () => {
    // `#0`-`#5` colour Xenoblade text; dropping the rule for Crashlands must
    // not drop it everywhere.
    expect("go #1red".match(editorTagPattern("bf1.msbt"))).toEqual(["#1"]);
  });
});

describe("Crashlands section list", () => {
  it("has a category for every bucket the categoriser can return", () => {
    // The sections stayed invisible because the progress card fell back to the
    // Xenoblade list, where none of these ids exist.
    const ids = new Set(CRASHLANDS_CATEGORIES.map((c) => c.id));
    const rows: ExtractedEntry[] = [
      { msbtFile: "crashlands/UI/0", index: 0, label: "assets/ui:tags/UI/text/PLAY", original: "Play", maxBytes: 99, crashlandsId: "assets/ui:tags/UI/text/PLAY", crashlandsSection: "UI" },
      { msbtFile: "crashlands/campaign/1", index: 1, label: "assets/story:17/line", original: "Go to the Lognest.", maxBytes: 99, crashlandsId: "assets/story:17/line", crashlandsSection: "campaign" },
      { msbtFile: "crashlands/campaign/2", index: 2, label: "assets/story:4/line", original: "Hey there.", maxBytes: 99, crashlandsId: "assets/story:4/line", crashlandsSection: "campaign" },
      { msbtFile: "crashlands/IN/3", index: 3, label: "assets/in:tags/IN/name", original: "Juicebox", maxBytes: 99, crashlandsId: "assets/in:tags/IN/name", crashlandsSection: "IN" },
      { msbtFile: "crashlands/CN/4", index: 4, label: "assets/cn:tags/CN/name", original: "Bawg", maxBytes: 99, crashlandsId: "assets/cn:tags/CN/name", crashlandsSection: "CN" },
      { msbtFile: "crashlands/account_cloud/5", index: 5, label: "assets/acct:login", original: "Sign in", maxBytes: 99, crashlandsId: "assets/acct:login", crashlandsSection: "account_cloud" },
    ];
    for (const row of rows) expect(ids).toContain(categorizeCrashlandsEntry(row));
  });
});

describe("Crashlands Chinese-source filter", () => {
  it("picks out the rows with no English to work from", () => {
    // 5,711 rows come from `campaign_story_zh-cn.json`; only a few hundred are
    // actually Chinese, and those are the ones a translator has to find.
    expect(isChineseSource("我们得离开这里。")).toBe(true);
    expect(isChineseSource("We have to get out of here.")).toBe(false);
    expect(isChineseSource("لنخرج من هنا.")).toBe(false);
  });
});

describe("Crashlands game routing", () => {
  it("sends Crashlands rows to the Crashlands prompt", () => {
    // Without this the enhance function fell through to Xenoblade and offered
    // Shulk and Monado as this game's proper nouns.
    expect(resolveGameParam("crashlands/campaign/12")).toBe("crashlands");
  });
  it("ships rules that name the game's own tokens", () => {
    const ids = BUILTIN_RULES.map((r) => r.id);
    expect(ids).toContain("detect_crashlands_tags");
    expect(ids).toContain("detect_crashlands_invented_names");
    const tags = BUILTIN_RULES.find((r) => r.id === "detect_crashlands_tags")!;
    expect(tags.prompt).toContain("%r");
    expect(tags.prompt).toContain("-25%");
  });
});

describe("Crashlands suggestions that cannot be saved", () => {
  /**
   * The save path repairs a terminal token, then refuses anything still
   * invalid (useEditorState.ts). "تطبيق الكل" filters on its own check and
   * then reports how many it applied, so if the two disagree the toast counts
   * suggestions the save dropped on the floor. This is that shared condition.
   */
  const wouldSave = (original: string, suggestion: string) =>
    validateCrashlandsTags(original, repairCrashlandsTags(original, suggestion).text).valid;

  it("refuses a suggestion that drops the line break", () => {
    expect(wouldSave("Grab the Bawg#Then run.", "خذ الباوغ ثم اهرب.")).toBe(false);
  });
  it("refuses a suggestion that drops the runtime value", () => {
    expect(wouldSave("Deals %r% bonus damage", "يسبب ضررا إضافيا")).toBe(false);
  });
  it("accepts a suggestion that keeps both in order", () => {
    expect(wouldSave("Deals %r% bonus damage#Nice.", "يسبب %r% ضررا إضافيا#جميل.")).toBe(true);
  });
  it("accepts a suggestion the editor repairs by itself", () => {
    // A trailing token the model moved is put back on save, so the panel must
    // not refuse it — that would hide a suggestion the editor can take.
    expect(wouldSave("Press %r", "اضغط")).toBe(true);
  });
  it("leaves a percentage-only line alone", () => {
    expect(wouldSave("-25% physical resistance", "‎-25% مقاومة جسدية")).toBe(true);
  });
});

describe("the suggestion gate runs on both sides", () => {
  const EDGE_SOURCE = readFileSync(
    resolve(__dirname, "../../../supabase/functions/enhance-translations/index.ts"),
    "utf8"
  );

  it("rejects the suggestion in the edge function before it is returned", () => {
    expect(EDGE_SOURCE).toContain("preservesCrashlandsTokenSequence");
    expect(EDGE_SOURCE).toContain("(!isCrashlands || preservesCrashlandsTokenSequence(original, suggested))");
    // Every caller has to pass the flag, or the gate is dead code. 9th Dawn
    // Remake's own flag rides on the same call sites, appended after
    // isCrashlands, so the trailing shape now ends there instead.
    expect(EDGE_SOURCE.match(/isSafeSuggestion\(/g)?.length).toBe(
      (EDGE_SOURCE.match(/isPokemonXp, isCrashlands, isNinthDawn, isInazuma, isFranBow\)/g)?.length ?? 0) + 1
    );
  });

  it("uses the same two tokens as the editor", () => {
    const edge = /const CRASHLANDS_TOKEN_REGEX = (\/.+?\/g);/.exec(EDGE_SOURCE);
    expect(edge).not.toBeNull();
    expect(edge![1]).toBe(CRASHLANDS_TAG_RE.source.replace(/^/, "/") + "/g");
  });

  it("checks the panel before counting a suggestion as applied", () => {
    const PANEL = readFileSync(
      resolve(__dirname, "../../components/editor/TranslationAIEnhancePanel.tsx"),
      "utf8"
    );
    expect(PANEL).toContain('const isCrashlands = gameParam === "crashlands"');
    expect(PANEL).toContain("if (isCrashlands) return validateCrashlandsTags(original, repairCrashlandsTags(original, suggestion).text).reason ?? null;");
  });
});
