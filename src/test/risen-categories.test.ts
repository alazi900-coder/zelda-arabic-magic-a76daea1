import { describe, it, expect } from "vitest";
import {
  categorizeRisenTable,
  categorizeRisenEntry,
  buildRisenCategories,
  buildOwnerIndex,
  getItemIdPrefix,
  labelForItemPrefix,
  buildItemPrefixIndex,
  getInfoIdPrefix,
  buildInfoPrefixIndex,
  NO_OWNER_LABEL,
} from "@/lib/risen/categories";

/** The 17 real table names from a verified strings.pak. */
const SEVENTEEN_TABLES = [
  "x360.tab", "tutorial_c.tab", "tutorial.tab", "svms.tab", "strings.tab",
  "storyprints.tab", "skills.tab", "quests.tab", "npcinfo.tab", "items.tab",
  "infos.tab", "hud2.tab", "hud.tab", "focus_unique.tab", "focus.tab",
  "documents.tab", "achievements.tab",
];

describe("categorizeRisenTable (Level 1 — deterministic, table-based)", () => {
  it("maps every one of the 17 real tables to a named category, never a generic 'other'", () => {
    for (const table of SEVENTEEN_TABLES) {
      const cat = categorizeRisenTable(table);
      expect(cat.id).not.toBe("other");
      expect(cat.label).not.toBe("");
    }
  });

  it("maps known tables to their documented Level-1 categories", () => {
    expect(categorizeRisenTable("infos.tab").id).toBe("risen-dialogue");
    expect(categorizeRisenTable("items.tab").id).toBe("risen-items");
    expect(categorizeRisenTable("quests.tab").id).toBe("risen-quests");
    expect(categorizeRisenTable("skills.tab").id).toBe("risen-skills");
    expect(categorizeRisenTable("documents.tab").id).toBe("risen-documents");
    expect(categorizeRisenTable("hud.tab").id).toBe("risen-ui");
    expect(categorizeRisenTable("hud2.tab").id).toBe("risen-ui");
    expect(categorizeRisenTable("x360.tab").id).toBe("risen-ui");
    expect(categorizeRisenTable("tutorial.tab").id).toBe("risen-tutorial");
    expect(categorizeRisenTable("tutorial_c.tab").id).toBe("risen-tutorial");
    expect(categorizeRisenTable("svms.tab").id).toBe("risen-combat-comments");
    expect(categorizeRisenTable("strings.tab").id).toBe("risen-general");
    expect(categorizeRisenTable("npcinfo.tab").id).toBe("risen-general");
    expect(categorizeRisenTable("focus.tab").id).toBe("risen-general");
    expect(categorizeRisenTable("focus_unique.tab").id).toBe("risen-general");
    expect(categorizeRisenTable("storyprints.tab").id).toBe("risen-general");
    expect(categorizeRisenTable("achievements.tab").id).toBe("risen-general");
  });

  it("gives an unmapped table its own category labeled with the raw name (no giant 'other' bucket)", () => {
    const cat = categorizeRisenTable("newmod_extra.tab");
    expect(cat.id).toBe("risen-table-newmod_extra.tab");
    expect(cat.label).toBe("newmod_extra.tab");
  });

  it("strips the :stagedir suffix before categorizing an entry", () => {
    expect(categorizeRisenEntry({ msbtFile: "infos.tab:stagedir" })).toBe("risen-dialogue");
  });
});

describe("buildRisenCategories (17-table file)", () => {
  it("produces exactly the Level-1 categories present, with no entry falling into a generic bucket", () => {
    const entries = SEVENTEEN_TABLES.map((t, i) => ({ msbtFile: t, index: i }));
    const categories = buildRisenCategories(entries);
    const ids = categories.map((c) => c.id);

    expect(ids).toContain("risen-dialogue");
    expect(ids).toContain("risen-items");
    expect(ids).toContain("risen-quests");
    expect(ids).toContain("risen-skills");
    expect(ids).toContain("risen-documents");
    expect(ids).toContain("risen-ui");
    expect(ids).toContain("risen-tutorial");
    expect(ids).toContain("risen-combat-comments");
    expect(ids).toContain("risen-general");
    expect(ids).not.toContain("other");

    // 17 tables collapse into exactly these 9 Level-1 categories.
    expect(categories.length).toBe(9);
  });

  it("still works on the old 3-table format without errors", () => {
    const entries = [
      { msbtFile: "quests.tab", index: 0 },
      { msbtFile: "infos.tab", index: 0 },
      { msbtFile: "documents.tab", index: 0 },
    ];
    expect(() => buildRisenCategories(entries)).not.toThrow();
    const categories = buildRisenCategories(entries);
    expect(categories.map((c) => c.id).sort()).toEqual(["risen-dialogue", "risen-documents", "risen-quests"].sort());
  });
});

describe("buildOwnerIndex (Level 2a)", () => {
  it("sorts owners by count descending, with empty Owner bucketed as 'بدون شخصية'", () => {
    const entries = [
      { msbtFile: "infos.tab", risenOwner: "A" },
      { msbtFile: "infos.tab", risenOwner: "A" },
      { msbtFile: "infos.tab", risenOwner: "A" },
      { msbtFile: "infos.tab", risenOwner: "B" },
      { msbtFile: "infos.tab", risenOwner: "" },
    ];
    const index = buildOwnerIndex(entries);
    expect(index).toEqual([
      { owner: "A", count: 3 },
      { owner: "B", count: 1 },
      { owner: NO_OWNER_LABEL, count: 1 },
    ]);
  });

  it("only counts entries whose table categorizes as risen-dialogue", () => {
    const entries = [
      { msbtFile: "infos.tab", risenOwner: "Tucker" },
      { msbtFile: "items.tab", risenOwner: "ShouldBeIgnored" },
    ];
    const index = buildOwnerIndex(entries);
    expect(index).toEqual([{ owner: "Tucker", count: 1 }]);
  });
});

describe("getItemIdPrefix / buildItemPrefixIndex (Level 2b)", () => {
  it("extracts the ID up to the 3rd underscore segment", () => {
    expect(getItemIdPrefix("ITEMDESC_It_1H_Sword")).toBe("ITEMDESC_It_1H");
    expect(getItemIdPrefix("ITEMDESC_It_Armor_Chest")).toBe("ITEMDESC_It_Armor");
  });

  it("groups the 3 example IDs into two prefixes with counts 2 and 1", () => {
    const entries = [
      { msbtFile: "items.tab", label: "ITEMDESC_It_1H_Sword" },
      { msbtFile: "items.tab", label: "ITEMDESC_It_1H_Axe" },
      { msbtFile: "items.tab", label: "ITEMDESC_It_Armor_Chest" },
    ];
    const index = buildItemPrefixIndex(entries);
    expect(index).toEqual([
      { prefix: "ITEMDESC_It_1H", label: labelForItemPrefix("ITEMDESC_It_1H"), count: 2 },
      { prefix: "ITEMDESC_It_Armor", label: labelForItemPrefix("ITEMDESC_It_Armor"), count: 1 },
    ]);
  });

  it("maps known segments to Arabic labels and leaves unrecognized prefixes as-is", () => {
    expect(labelForItemPrefix("ITEMDESC_It_1H")).toBe("أسلحة يد واحدة");
    expect(labelForItemPrefix("ITEMDESC_It_Armor")).toBe("دروع وملابس");
    expect(labelForItemPrefix("ITEMDESC_It_Weird")).toBe("ITEMDESC_It_Weird");
  });
});

describe("getInfoIdPrefix / buildInfoPrefixIndex (Level 2c — infos.tab sections)", () => {
  it("extracts the ID up to the 2nd underscore segment", () => {
    expect(getInfoIdPrefix("INFO_QATEST_00000266")).toBe("INFO_QATEST");
    expect(getInfoIdPrefix("INFO_QAMAIN_00000042")).toBe("INFO_QAMAIN");
  });

  it("groups entries into sections sorted by count descending", () => {
    const entries = [
      { msbtFile: "infos.tab", label: "INFO_QATEST_00000266" },
      { msbtFile: "infos.tab", label: "INFO_QATEST_00000267" },
      { msbtFile: "infos.tab", label: "INFO_QAMAIN_00000001" },
    ];
    const index = buildInfoPrefixIndex(entries);
    expect(index).toEqual([
      { prefix: "INFO_QATEST", count: 2 },
      { prefix: "INFO_QAMAIN", count: 1 },
    ]);
  });

  it("only counts entries whose table categorizes as risen-dialogue", () => {
    const entries = [
      { msbtFile: "infos.tab", label: "INFO_QATEST_00000266" },
      { msbtFile: "items.tab", label: "INFO_SHOULDBEIGNORED_1" },
    ];
    const index = buildInfoPrefixIndex(entries);
    expect(index).toEqual([{ prefix: "INFO_QATEST", count: 1 }]);
  });
});
