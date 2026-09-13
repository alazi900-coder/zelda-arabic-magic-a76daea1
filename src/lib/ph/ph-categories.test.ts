import { describe, expect, it } from "vitest";
import { categorizePhEntry, PH_CATEGORIES, PH_FILE_PREFIX } from "./ph-categories";
import type { ExtractedEntry } from "@/components/editor/types";

function entry(bmgName: string): ExtractedEntry {
  return { msbtFile: `${PH_FILE_PREFIX}${bmgName}.bmg`, index: 0, label: bmgName, original: "x", maxBytes: 0 };
}

describe("ph-categories", () => {
  it("classifies every one of the game's real 32 BMG files into a known category", () => {
    // Same 32 filenames confirmed present under English/Message/ in the real ROM this session.
    const files = [
      "battle", "battleCommon", "bossLast1", "bossLast3", "brave", "collect", "demo",
      "field", "flame", "frost", "ghost", "hidari", "kaitei", "kaitei_F", "kojima1",
      "kojima2", "kojima3", "kojima5", "main_isl", "mainselect", "myou", "power",
      "regular", "sea", "sennin", "ship", "staff", "system", "torii", "wind", "wisdom",
      "wisdom_dngn",
    ];
    const knownIds = new Set(PH_CATEGORIES.map((c) => c.id));
    for (const file of files) {
      const cat = categorizePhEntry(entry(file));
      expect(knownIds.has(cat), `${file} -> ${cat}`).toBe(true);
    }
  });

  it("routes system/menu, battle, cutscene and credits files to their expected cards", () => {
    expect(categorizePhEntry(entry("system"))).toBe("ph-system");
    expect(categorizePhEntry(entry("mainselect"))).toBe("ph-system");
    expect(categorizePhEntry(entry("battle"))).toBe("ph-battle");
    expect(categorizePhEntry(entry("bossLast1"))).toBe("ph-battle");
    expect(categorizePhEntry(entry("demo"))).toBe("ph-cutscenes");
    expect(categorizePhEntry(entry("staff"))).toBe("ph-credits");
  });

  it("routes island and temple course files by their known area names", () => {
    expect(categorizePhEntry(entry("kojima2"))).toBe("ph-islands");
    expect(categorizePhEntry(entry("torii"))).toBe("ph-islands");
    expect(categorizePhEntry(entry("flame"))).toBe("ph-temples");
    expect(categorizePhEntry(entry("wisdom_dngn"))).toBe("ph-temples");
  });

  it("falls back unmatched files to misc instead of guessing", () => {
    expect(categorizePhEntry(entry("regular"))).toBe("ph-misc");
    expect(categorizePhEntry(entry("someNewFileNeverSeenBefore"))).toBe("ph-misc");
  });
});
