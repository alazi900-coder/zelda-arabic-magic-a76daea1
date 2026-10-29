import { describe, expect, it } from "vitest";
import { expandExactEnhanceItems, groupExactEnhanceEntries } from "@/lib/enhance-exact-dedup";

const e = (path: string, n: number, original: string, translation: string, category?: string) =>
  ({ key: `${path}:${n}`, original, translation, category });

describe("AI proofreading deduplication", () => {
  it("reviews exact duplicates within one MSBT section once", () => {
    const rows = [
      e("black2/bank_100/section_0", 1, "Pokémon Center", "مركز بوكيمون"),
      e("black2/bank_100/section_0", 2, "Pokémon Center", "مركز بوكيمون"),
      e("black2/bank_100/section_0", 3, "Yes", "نعم"),
    ];
    const groups = groupExactEnhanceEntries(rows);
    expect(groups.unique.map(x => x.key)).toEqual([rows[0].key, rows[2].key]);
    expect(groups.members.get(rows[0].key)).toHaveLength(2);
    expect(expandExactEnhanceItems([{ key: rows[0].key, issue: "غير دقيق" }], groups.members))
      .toEqual([{ key: rows[0].key, issue: "غير دقيق" }, { key: rows[1].key, issue: "غير دقيق" }]);
  });
  it("never merges different source, Arabic, bank, or section contexts", () => {
    const base = e("black2/bank_100/section_0", 1, "Yes", "نعم", "menu");
    const rows = [
      base,
      e("black2/bank_101/section_0", 2, "Yes", "نعم", "menu"),
      e("black2/bank_100/section_1", 3, "Yes", "نعم", "menu"),
      e("black2/bank_100/section_0", 4, "No", "نعم", "menu"),
      e("black2/bank_100/section_0", 5, "Yes", "أجل", "menu"),
      e("black2/bank_100/section_0", 6, "Yes", "نعم", "dialogue"),
    ];
    expect(groupExactEnhanceEntries(rows).unique).toEqual(rows);
  });
  it("does not invent issues when the provider finds none", () => {
    const rows = [e("b", 0, "Hi", "مرحبًا"), e("b", 1, "Hi", "مرحبًا")];
    const groups = groupExactEnhanceEntries(rows);
    expect(expandExactEnhanceItems([], groups.members)).toEqual([]);
    expect(expandExactEnhanceItems(undefined, groups.members)).toBeUndefined();
  });
});
