import { describe, it, expect } from "vitest";
import { computeEntryResult } from "@/hooks/useEditorQuality";
import type { ExtractedEntry } from "@/components/editor/types";

/**
 * "Mixed language" is meant to catch a word the translator left in English.
 *
 * The check discounted only `[...]` tags, which is Xenoblade's shape, so every
 * other game's tag text stayed in the string and its letters were counted as
 * that untranslated word: Platinum's `{STRVAR_1 1, 0, 0}` read as "STRVAR" and
 * put the warning on all 6,513 of its lines at once — the count that made the
 * fault obvious, since a warning that fires on everything says nothing.
 *
 * These pin both directions: a line that is only Arabic plus tags is clean, and
 * a line with real English in it is still caught.
 */
function entry(msbtFile: string, original: string): ExtractedEntry {
  return { msbtFile, index: 0, label: "", original, maxBytes: 0 };
}

describe("computeEntryResult — mixed language ignores technical tags", () => {
  it("does not flag a Platinum line whose only Latin text is its {STRVAR} tag", () => {
    const e = entry("platinum/moves_used_in_battle", "{STRVAR_1 1, 0, 0} used Pound!");
    expect(computeEntryResult(e, "{STRVAR_1 1, 0, 0} استخدم الصفعة!", "plat").niMixed).toBe(false);
  });

  it("does not flag a Gen 3 line whose only Latin text is its {FD:01} tag", () => {
    const e = entry("pkm_rom", "{FD:01} used it.");
    expect(computeEntryResult(e, "{FD:01} استخدمها.", "pkm").niMixed).toBe(false);
  });

  it("does not flag a GTA IV line whose only Latin text is its ~y~ colour tag", () => {
    const e = entry("gtaiv/x.gxt", "~y~Go~s~ north.");
    expect(computeEntryResult(e, "~y~اذهب~s~ شمالاً.", "gtaiv").niMixed).toBe(false);
  });

  it("still flags a Platinum line with a genuinely untranslated word", () => {
    const e = entry("platinum/moves_used_in_battle", "{STRVAR_1 1, 0, 0} used Pound!");
    expect(computeEntryResult(e, "{STRVAR_1 1, 0, 0} استخدم Pound!", "plat").niMixed).toBe(true);
  });

  it("keeps the whitelist working — HP beside Arabic is not a mixed line", () => {
    const e = entry("platinum/x", "HP restored.");
    expect(computeEntryResult(e, "استُعيدت HP.", "plat").niMixed).toBe(false);
  });
});
