import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { isTechnicalText } from "@/components/editor/types";

/**
 * "Nothing but tags" used to be decided by a short hand-written list that only
 * knew `{WORD}`. Platinum writes `{STRVAR_1 8, 0, 0}` — spaces and commas — so
 * 413 rows of pure tags were being handed to the translator as if they were
 * sentences, and Gen 3's `{FD:01}` and Risen's `<Exit>` had the same hole.
 * It now uses the one pattern that also draws tags as chips in the editor, so
 * what counts as untranslatable is exactly what the translator sees marked.
 *
 * The risk of a wider pattern is the opposite mistake, so half of this file
 * pins down the sentences that must keep reaching the translator.
 */
describe("tag-only rows are not sent to translation", () => {
  const plat = "platinum/scr_seq";

  it.each([
    "{STRVAR_1 8, 0, 0}",
    "{STRVAR_1 51, 0, 0}{STRVAR_1 6, 1, 0}",
    "{STRVAR_1 52, 0, 0}",
  ])("treats %s as technical", (t) => {
    expect(isTechnicalText(t, plat)).toBe(true);
  });

  it("still lets a sentence through even when it carries tags", () => {
    expect(isTechnicalText("{STRVAR_1 0, 0, 0} used Cut!", plat)).toBe(false);
    expect(isTechnicalText("Hello {STRVAR_1 1, 0, 0}!", plat)).toBe(false);
  });

  it("covers the other games' tag shapes too", () => {
    expect(isTechnicalText("{FD:01}", "pkm_data")).toBe(true);
    expect(isTechnicalText("<Exit>", "world.tab")).toBe(true);
    expect(isTechnicalText("~y~", "gtaiv/american.gxt")).toBe(true);
    // and each of those with real words stays translatable
    expect(isTechnicalText("{FD:01} appeared!", "pkm_data")).toBe(false);
    expect(isTechnicalText("<Exit> Leave the room", "world.tab")).toBe(false);
  });

  it("does not resurrect the words freed in 2.18.0", () => {
    for (const w of ["YES", "NO", "EXIT", "Bed", "USE"]) {
      expect(isTechnicalText(w, "platinum/menu_entries"), w).toBe(false);
    }
  });
});

/**
 * "HP" and "ON" are both two capital letters, so no rule can separate them —
 * the abbreviations are named one by one instead. The list must stay tiny and
 * exact, which is what the second half of this block guards: the words the
 * translator asked to keep translatable, and the longer strings that merely
 * contain an abbreviation.
 */
describe("abbreviations that stay in Latin letters", () => {
  const plat = "platinum/bag";

  it.each(["HP", "PP", "Lv", "Lv."])("keeps %s out of translation", (t) => {
    expect(isTechnicalText(t, plat)).toBe(true);
  });

  it("only matches the whole row, never a word inside a sentence", () => {
    expect(isTechnicalText("Restored 20 HP!", plat)).toBe(false);
    expect(isTechnicalText("Lv. 100", plat)).toBe(false);
    expect(isTechnicalText("Set Lv.1", plat)).toBe(false);
  });

  it("leaves the spelled-out word translatable", () => {
    expect(isTechnicalText("Level", plat)).toBe(false);
    expect(isTechnicalText("LEVEL", plat)).toBe(false);
  });

  it("does not spread to the two-letter words that must be translated", () => {
    for (const w of ["ON", "OFF", "NO", "YES", "OK", "No", "BP", "DEF", "ID"]) {
      expect(isTechnicalText(w, plat), w).toBe(false);
    }
  });
});

describe("uppercase filter", () => {
  const src = (...p: string[]) => readFileSync(resolve(__dirname, "..", ...p), "utf8");

  it("is a filter value, a condition, a label and an option in both layouts", () => {
    expect(src("components/editor/types.tsx")).toContain('| "uppercase"');
    expect(src("hooks/useEditorState.ts")).toContain('filterStatus === "uppercase"');
    expect(src("hooks/useEditorState.ts")).toContain("'uppercase': 'أحرف إنجليزية كبيرة'");
    // desktop and mobile selects are separate lists; missing one hides it there
    const bar = src("components/editor/EditorFiltersBar.tsx");
    expect(bar.match(/value="uppercase"/g)?.length ?? 0).toBe(2);
  });

  it("matches only rows that are all capitals, and never a bare tag", () => {
    // mirrors the condition in useEditorState, tags included
    const shows = (t: string, file = "platinum/menu_entries") =>
      /[A-Z]/.test(t) && !/[a-z]/.test(t) && !isTechnicalText(t, file);
    expect(shows("GUST")).toBe(true);
    expect(shows("PRESS START")).toBe(true);
    expect(shows("Gust")).toBe(false);
    expect(shows("مرحبا")).toBe(false);       // no Latin letters at all
    expect(shows("{STRVAR_1 8, 0, 0}")).toBe(false); // lowercase inside the tag
  });
});
