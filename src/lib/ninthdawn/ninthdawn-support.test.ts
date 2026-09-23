import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtractedEntry } from "@/components/editor/types";
import { editorTagPattern } from "@/lib/editor-tag-pattern";
import { resolveGameParam } from "@/lib/game-param";
import { BUILTIN_RULES } from "@/lib/enhance-rules";
import { NINTHDAWN_CATEGORIES, categorizeNinthDawnEntry } from "./ninthdawn-categories";
import { NINTHDAWN_TAG_RE, extractNinthDawnTags, repairNinthDawnTags, validateNinthDawnTags } from "./ninthdawn-tags";
import { exportNinthDawnJson, importNinthDawnJson, NINTHDAWN_FORMAT } from "./ninthdawn-editor-bridge";

describe("9th Dawn Remake technical token guard", () => {
  it("preserves ordered placeholders in the middle of a sentence", () => {
    expect(validateNinthDawnTags("Buy [0] x[1]?", "شراء [0] x[1]؟").valid).toBe(true);
    expect(validateNinthDawnTags("Buy [0] x[1]?", "شراء [1] x[0]؟").valid).toBe(false);
  });
  it("preserves named placeholders and formatting tags", () => {
    expect(validateNinthDawnTags("<b>[playername]</b>, hello.", "<b>[playername]</b>، مرحباً.").valid).toBe(true);
    expect(validateNinthDawnTags("<b>[playername]</b>, hello.", "[playername] مرحباً.").valid).toBe(false);
  });
  it("preserves colour/param/item codes", () => {
    expect(validateNinthDawnTags("To [p=0] <br> STAY AWAY!", "إلى [p=0] <br> ابتعد!").valid).toBe(true);
  });
  it("repairs only a missing terminal placeholder", () => {
    expect(repairNinthDawnTags("Press [0]", "اضغط")).toEqual({ text: "اضغط[0]", changed: true });
    expect(repairNinthDawnTags("Evolve [0] into [1]", "طوّر إلى").changed).toBe(false);
  });
  it("round-trips the editable JSON identity", () => {
    const loaded = importNinthDawnJson({
      format: NINTHDAWN_FORMAT,
      entries: [{ id: "1:0", sheet_id: 1, section: "Generic", index: 0, source: "Yes", translation: "نعم", technical_tokens: [] }],
    });
    const out = exportNinthDawnJson(loaded.entries, loaded.translations);
    expect(out.entries[0]).toMatchObject({ id: "1:0", sheet_id: 1, section: "Generic", index: 0, source: "Yes", translation: "نعم" });
  });
});

describe("9th Dawn Remake already-Arabic rows go to the translation field, not the original", () => {
  it("shows the English source and pre-filled Arabic separately", () => {
    const loaded = importNinthDawnJson({
      format: NINTHDAWN_FORMAT,
      entries: [{ id: "1:2", sheet_id: 1, section: "Generic", index: 2, source: "Okay", translation: "حسنًا", technical_tokens: [] }],
    });
    expect(loaded.entries[0].original).toBe("Okay");
    expect(loaded.translations[`${loaded.entries[0].msbtFile}:${loaded.entries[0].index}`]).toBe("حسنًا");
  });
});

describe("9th Dawn Remake highlighting", () => {
  it("marks all four token shapes in a 9th Dawn Remake row", () => {
    const pattern = editorTagPattern("ninthdawn/Dialogue/12");
    expect("<b>[0]</b> to [playername] <br>".match(pattern)).toEqual(["<b>", "[0]", "</b>", "[playername]", "<br>"]);
  });
});

describe("9th Dawn Remake section list", () => {
  it("has a category for every real section the export contains", () => {
    // Measured against the 3,704-entry export: these 35 section names are
    // every value `section` takes. A row whose category is missing falls
    // back to the Xenoblade list, where the progress card returns null.
    const REAL_SECTIONS = [
      "Dialogue", "DB_Item_Names", "Generic", "DB_Character", "DB_Entity", "Quest", "PlayerMenu",
      "DB_Places", "CardGame", "CardGame_Actions", "DB_Ability", "DB_Rewards", "Network", "DB_CG_Relic",
      "MainMenu", "DB_VS_Item", "Crafting", "DB_CG_Status", "Survivor", "DB_Skills", "DB_StatusEffect",
      "Errors", "Actions", "DB_EquipSlots", "Literature", "Buffs", "DB_Attribute", "Interact",
      "DB_CG_Entity", "DB_CG_Map", "DB_Item_Types", "Crafting_RecipeType", "Death", "DB_VS_Entity", "DB_Element",
    ];
    const ids = new Set(NINTHDAWN_CATEGORIES.map((c) => c.id));
    for (const section of REAL_SECTIONS) {
      const row: ExtractedEntry = { msbtFile: `ninthdawn/${section}/0`, index: 0, label: "1:0", original: "x", maxBytes: 99, ninthDawnId: "1:0", ninthDawnSection: section };
      expect(ids, `section ${section}`).toContain(categorizeNinthDawnEntry(row));
      expect(categorizeNinthDawnEntry(row), `section ${section}`).not.toBe("nd-other");
    }
  });
});

describe("9th Dawn Remake game routing", () => {
  it("sends 9th Dawn Remake rows to its own prompt", () => {
    expect(resolveGameParam("ninthdawn/Dialogue/12")).toBe("ninthdawn");
  });
  it("ships a rule that names the game's own tokens", () => {
    const ids = BUILTIN_RULES.map((r) => r.id);
    expect(ids).toContain("detect_ninthdawn_tags");
    const tags = BUILTIN_RULES.find((r) => r.id === "detect_ninthdawn_tags")!;
    expect(tags.prompt).toContain("[0]");
    expect(tags.prompt).toContain("[playername]");
    expect(tags.prompt).toContain("[c=0]");
    expect(tags.prompt).toContain("<br>");
  });
});

describe("9th Dawn Remake suggestions that cannot be saved", () => {
  const wouldSave = (original: string, suggestion: string) =>
    validateNinthDawnTags(original, repairNinthDawnTags(original, suggestion).text).valid;

  it("refuses a suggestion that drops an inline placeholder", () => {
    expect(wouldSave("Buy [0] x[1]?", "شراء x؟")).toBe(false);
  });
  it("refuses a suggestion that reorders placeholders", () => {
    expect(wouldSave("Buy [0] x[1]?", "شراء [1] x[0]؟")).toBe(false);
  });
  it("accepts a suggestion that keeps them in order", () => {
    expect(wouldSave("Buy [0] x[1]?", "شراء [0] x[1]؟")).toBe(true);
  });
  it("accepts a suggestion the editor repairs by itself", () => {
    expect(wouldSave("Press [0]", "اضغط")).toBe(true);
  });
});

describe("the suggestion gate runs on both sides", () => {
  const EDGE_SOURCE = readFileSync(
    resolve(__dirname, "../../../supabase/functions/enhance-translations/index.ts"),
    "utf8"
  );

  it("rejects the suggestion in the edge function before it is returned", () => {
    expect(EDGE_SOURCE).toContain("preservesNinthDawnTokenSequence");
    expect(EDGE_SOURCE).toContain("(!isNinthDawn || preservesNinthDawnTokenSequence(original, suggested))");
    expect(EDGE_SOURCE.match(/isSafeSuggestion\(/g)?.length).toBe(
      (EDGE_SOURCE.match(/isPokemonXp, isCrashlands, isNinthDawn, isInazuma\)/g)?.length ?? 0) + 1
    );
  });

  it("uses the same four token shapes as the editor", () => {
    const edge = /const NINTHDAWN_TOKEN_REGEX = (\/.+?\/g);/.exec(EDGE_SOURCE);
    expect(edge).not.toBeNull();
    expect(edge![1]).toBe(NINTHDAWN_TAG_RE.source.replace(/^/, "/") + "/g");
  });

  it("checks the panel before counting a suggestion as applied", () => {
    const PANEL = readFileSync(
      resolve(__dirname, "../../components/editor/TranslationAIEnhancePanel.tsx"),
      "utf8"
    );
    expect(PANEL).toContain('const isNinthDawn = gameParam === "ninthdawn"');
    expect(PANEL).toContain("if (isNinthDawn) return validateNinthDawnTags(original, repairNinthDawnTags(original, suggestion).text).reason ?? null;");
  });

  it("names the game and its rule id only for 9th Dawn Remake requests", () => {
    expect(EDGE_SOURCE).toContain("const isNinthDawn = game === 'ninthdawn'");
    expect(EDGE_SOURCE).toContain("const NINTHDAWN_ONLY_RULE_IDS = new Set(['detect_ninthdawn_tags']);");
  });
});

// Optional local fixture: no game data is committed or uploaded. Run with
// NINTHDAWN_TEST_JSON=/path/to/9th-Dawn-Remake.json to check the tag pattern
// against every entry of a real export, not just the samples above.
const fixturePath = process.env.NINTHDAWN_TEST_JSON;
describe.skipIf(!fixturePath)("the real export", () => {
  it("has technical_tokens fully explained by NINTHDAWN_TAG_RE for every entry", () => {
    const doc = JSON.parse(readFileSync(fixturePath!, "utf8")) as {
      entries: { source: string; technical_tokens: string[] }[];
    };
    let mismatches = 0;
    for (const row of doc.entries) {
      const found = extractNinthDawnTags(row.source);
      if (JSON.stringify(found) !== JSON.stringify(row.technical_tokens)) mismatches++;
    }
    expect(mismatches).toBe(0);
  });
});
