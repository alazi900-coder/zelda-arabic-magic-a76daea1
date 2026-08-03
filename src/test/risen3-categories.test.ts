import { describe, it, expect } from "vitest";
import {
  parseRisen3KeyMap,
  categorizeRisen3Prefix,
  buildRisen3Categories,
  RISEN3_UNKNOWN_CATEGORY,
} from "@/lib/risen3/categories";
import { categorizeRisenEntry, buildRisenCategories } from "@/lib/risen/categories";

const SAMPLE = `\uFEFFinfo:Info_Test_001|deadbeef|pc
item:It_1H_Sword|00ff00ff|pc
hud3:HUD_Options|12345678|pc
NoPrefixKey|abcdef01|pc
`;

describe("risen3 key map", () => {
  it("parses hash -> prefix/id lines", () => {
    const map = parseRisen3KeyMap(SAMPLE);
    expect(map.size).toBe(4);
    expect(map.get("deadbeef")).toEqual({ prefix: "info", id: "Info_Test_001" });
    expect(map.get("abcdef01")).toEqual({ prefix: "default", id: "NoPrefixKey" });
  });

  it("maps prefixes to editor categories", () => {
    expect(categorizeRisen3Prefix("info").id).toBe("risen3-dialogue");
    expect(categorizeRisen3Prefix("item").id).toBe("risen3-items");
    expect(categorizeRisen3Prefix("hud3").id).toBe("risen3-ui");
    expect(categorizeRisen3Prefix("gui_prototype").id).toBe("risen3-ui");
    expect(categorizeRisen3Prefix("svm").id).toBe("risen3-svm");
    expect(categorizeRisen3Prefix("nope").id).toBe(RISEN3_UNKNOWN_CATEGORY.id);
  });
});

describe("risen3 categories in the editor", () => {
  const entries = [
    { msbtFile: "English_Text.gar3", label: "Info_Test_001", risen3Cat: "risen3-dialogue" },
    { msbtFile: "English_Text.gar3", label: "It_1H_Sword", risen3Cat: "risen3-items" },
    { msbtFile: "English_Text.gar3", label: "HUD_Options", risen3Cat: "risen3-ui" },
  ];

  it("categorizes entries by their baked-in category", () => {
    expect(categorizeRisenEntry(entries[0])).toBe("risen3-dialogue");
    expect(categorizeRisenEntry(entries[2])).toBe("risen3-ui");
  });

  it("builds only the present categories", () => {
    const cats = buildRisen3Categories(entries).map((c) => c.id);
    expect(cats).toEqual(["risen3-dialogue", "risen3-items", "risen3-ui"]);
    expect(buildRisenCategories(entries).map((c) => c.id)).toEqual(cats);
  });

  it("keeps Risen 1 table-based categories untouched", () => {
    expect(categorizeRisenEntry({ msbtFile: "items.tab" })).toBe("risen-items");
    expect(buildRisenCategories([{ msbtFile: "infos.tab" }]).map((c) => c.id)).toEqual(["risen-dialogue"]);
  });
});
