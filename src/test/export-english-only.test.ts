import { describe, it, expect } from "vitest";

// Test the core logic of English-only export (extracted from useEditorFileIO)
describe("Export English Only Logic", () => {
  const entries = [
    { msbtFile: "UI/MainMenu.msbt", index: 0, original: "Start Game", label: "start", maxBytes: 50 },
    { msbtFile: "UI/MainMenu.msbt", index: 1, original: "Settings", label: "settings", maxBytes: 50 },
    { msbtFile: "UI/MainMenu.msbt", index: 2, original: "Quit", label: "quit", maxBytes: 50 },
    { msbtFile: "Dialog/NPC.msbt", index: 0, original: "Hello traveler!", label: "greeting", maxBytes: 100 },
    { msbtFile: "Dialog/NPC.msbt", index: 1, original: "Good luck!", label: "farewell", maxBytes: 80 },
  ];

  const translations: Record<string, string> = {
    "UI/MainMenu.msbt:0": "ابدأ اللعبة",
    "UI/MainMenu.msbt:1": "",           // empty = untranslated
    "UI/MainMenu.msbt:2": "Quit",       // same as original = untranslated
    "Dialog/NPC.msbt:0": "",            // empty = untranslated
    "Dialog/NPC.msbt:1": "حظاً موفقاً!", // translated
  };

  function getEnglishOnly(
    entriesToExport: typeof entries,
    trans: Record<string, string>
  ): Record<string, string> {
    const englishOnly: Record<string, string> = {};
    for (const entry of entriesToExport) {
      if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(entry.original)) continue;
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = trans[key]?.trim();
      if (!translation || translation === entry.original || translation === entry.original.trim()) {
        englishOnly[key] = entry.original;
      }
    }
    return englishOnly;
  }

  it("should export only untranslated entries", () => {
    const result = getEnglishOnly(entries, translations);

    // Should include: Settings (empty), Quit (same as original), Hello traveler! (empty)
    expect(Object.keys(result)).toHaveLength(3);
    expect(result["UI/MainMenu.msbt:1"]).toBe("Settings");
    expect(result["UI/MainMenu.msbt:2"]).toBe("Quit");
    expect(result["Dialog/NPC.msbt:0"]).toBe("Hello traveler!");

    // Should NOT include translated entries
    expect(result["UI/MainMenu.msbt:0"]).toBeUndefined();
    expect(result["Dialog/NPC.msbt:1"]).toBeUndefined();
  });

  it("should return empty object when all entries are translated", () => {
    const allTranslated: Record<string, string> = {
      "UI/MainMenu.msbt:0": "ابدأ اللعبة",
      "UI/MainMenu.msbt:1": "الإعدادات",
      "UI/MainMenu.msbt:2": "خروج",
      "Dialog/NPC.msbt:0": "مرحباً أيها المسافر!",
      "Dialog/NPC.msbt:1": "حظاً موفقاً!",
    };
    const result = getEnglishOnly(entries, allTranslated);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("should return all entries when nothing is translated", () => {
    const noTranslations: Record<string, string> = {};
    const result = getEnglishOnly(entries, noTranslations);
    expect(Object.keys(result)).toHaveLength(5);
  });

  it("re-imported translations should merge correctly", () => {
    // Simulate: export english only → translate → re-import
    const exported = getEnglishOnly(entries, translations);
    
    // User translates them
    const userTranslated: Record<string, string> = {};
    for (const [key, _original] of Object.entries(exported)) {
      userTranslated[key] = "ترجمة_" + key; // simulate translation
    }

    // Merge back (like handleImportTranslations does)
    const merged = { ...translations, ...userTranslated };

    // All entries should now have non-empty, non-original translations
    for (const entry of entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const val = merged[key]?.trim();
      expect(val).toBeTruthy();
      expect(val).not.toBe(entry.original);
    }
  });

  it("should respect filter when provided", () => {
    // Only export from UI entries
    const uiEntries = entries.filter(e => e.msbtFile.startsWith("UI/"));
    const result = getEnglishOnly(uiEntries, translations);

    // Settings (empty) and Quit (same as original)
    expect(Object.keys(result)).toHaveLength(2);
    expect(result["Dialog/NPC.msbt:0"]).toBeUndefined(); // filtered out
  });

  it("should skip untranslated entries whose original text already contains Arabic", () => {
    const mixedEntries = [
      ...entries,
      { msbtFile: "Dialog/Mixed.msbt", index: 0, original: "مرحبا", label: "arabic-source", maxBytes: 50 },
      { msbtFile: "Dialog/Mixed.msbt", index: 1, original: "Hello مرحبا", label: "mixed-source", maxBytes: 50 },
    ];

    const mixedTranslations: Record<string, string> = {
      ...translations,
      "Dialog/Mixed.msbt:0": "",
      "Dialog/Mixed.msbt:1": "",
    };

    const result = getEnglishOnly(mixedEntries, mixedTranslations);

    expect(result["Dialog/Mixed.msbt:0"]).toBeUndefined();
    expect(result["Dialog/Mixed.msbt:1"]).toBeUndefined();
  });
});
