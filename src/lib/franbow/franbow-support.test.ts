import { describe, expect, it } from "vitest";
import { importFranBowJson, exportFranBowJson, FRANBOW_FORMAT } from "./franbow-editor-bridge";
import { extractFranBowTags, validateFranBowTags, repairFranBowTags } from "./franbow-tags";
import { FRANBOW_CATEGORIES, categorizeFranBowEntry, franBowCategoryId } from "./franbow-categories";

const sampleDoc = {
  format: FRANBOW_FORMAT,
  version: 1,
  game: "Fran Bow v1.0.5 Android",
  source_language: "en",
  target_language: "ar",
  entry_count: 2,
  instructions_ar: "ترجم قيمة translation فقط.",
  entries: [
    { id: "franbow_00001", category: "فحص الأشياء والتفاعل", context: "EternusBookExamine", source: "The mystical book of Eternus!", translation: "", technical_tokens: [], origins: ["speech"] },
    { id: "franbow_00002", category: "الحوارات والسرد", context: "Intro1", source: "Oh! This looks interesting...", translation: "أوه! هذا يبدو مثيراً...", technical_tokens: [], origins: ["speech"] },
  ],
};

describe("franbow-editor-bridge", () => {
  it("imports every row, keying entries by category and preserving an existing translation", () => {
    const { entries, translations } = importFranBowJson(sampleDoc);
    expect(entries).toHaveLength(2);
    expect(entries[0].msbtFile).toBe("franbow/fb-examine/0");
    expect(entries[0].original).toBe("The mystical book of Eternus!");
    expect(translations[`${entries[0].msbtFile}:${entries[0].index}`]).toBe("");
    expect(translations[`${entries[1].msbtFile}:${entries[1].index}`]).toBe("أوه! هذا يبدو مثيراً...");
  });

  it("rejects a document with the wrong format", () => {
    expect(() => importFranBowJson({ ...sampleDoc, format: "something-else" })).toThrow();
  });

  it("round-trips id/context/category/origins on export", () => {
    const { entries, translations } = importFranBowJson(sampleDoc);
    const doc = exportFranBowJson(entries, { ...translations, [`${entries[0].msbtFile}:${entries[0].index}`]: "كتاب إيترنس الغامض!" });
    expect(doc.entries[0]).toMatchObject({ id: "franbow_00001", category: "فحص الأشياء والتفاعل", context: "EternusBookExamine", translation: "كتاب إيترنس الغامض!" });
    expect(doc.entries[1]).toMatchObject({ id: "franbow_00002", translation: "أوه! هذا يبدو مثيراً..." });
  });
});

describe("franbow-categories", () => {
  it("maps every category label the export uses to one of the tool's own ids", () => {
    for (const cat of ["الحوارات والسرد", "فحص الأشياء والتفاعل", "النظام والحفظ", "الواجهات والأزرار", "الإعدادات", "القائمة الرئيسية"]) {
      expect(FRANBOW_CATEGORIES.some((c) => c.id === franBowCategoryId(cat))).toBe(true);
    }
  });
  it("reads the category back from an entry's msbtFile", () => {
    expect(categorizeFranBowEntry({ msbtFile: "franbow/fb-menu/12" })).toBe("fb-menu");
  });
});

describe("franbow-tags", () => {
  it("finds no tokens in plain prose", () => {
    expect(extractFranBowTags("Argh, I wish I could understand!")).toEqual([]);
  });
  it("flags a translation that drops a placeholder the original has", () => {
    expect(validateFranBowTags("You have {0} coins left.", "لديك عملات متبقية.").valid).toBe(false);
    expect(validateFranBowTags("You have {0} coins left.", "لديك {0} عملات متبقية.").valid).toBe(true);
  });
  it("repairs a clean trailing token the translation dropped", () => {
    const { text, changed } = repairFranBowTags("Press {0} to continue.", "اضغط للمتابعة.");
    expect(changed).toBe(false); // {0} isn't trailing in the original here, so nothing safe to reattach
    const trailing = repairFranBowTags("Press to continue {0}", "اضغط للمتابعة");
    expect(trailing.changed).toBe(true);
    expect(trailing.text.endsWith("{0}")).toBe(true);
  });
});
