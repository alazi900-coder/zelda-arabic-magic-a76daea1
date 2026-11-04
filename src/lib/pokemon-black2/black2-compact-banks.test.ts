import { describe, expect, it } from "vitest";
import { black2CompactBankName, black2CompactBankNameFromEditorPath } from "./black2-compact-banks";
import { BLACK2_CATEGORIES, categorizeBlack2Entry } from "./black2-json";
import { exportBlack2EnglishOnlyJson, parseBlack2EnglishOnlyJson } from "./black2-english-only";

const cases = [
  ["a/0/0/2:0032:0:0001", "TEXT SPEED", "options_menu", "b2-menu"],
  ["a/0/0/2:0054:0:0007", "Professor Juniper", "intro_professor_juniper", "b2-story"],
  ["a/0/0/2:0181:0:0000", "Movie Star", "pkwd_book_movie_00_girl", "b2-pokewood-scripts"],
  ["a/0/0/2:0182:0:0000", "Movie Star", "pkwd_book_movie_00_boy", "b2-pokewood-scripts"],
  ["a/0/0/2:0247:0:0000", "Actor", "pkwd_book_movie_33_boy", "b2-pokewood-scripts"],
  ["a/0/0/2:0248:0:0000", "Actor", "pkwd_book_movie_33_girl", "b2-pokewood-scripts"],
  ["a/0/0/2:0267:0:0000", "Scene", "pkwd_briefing_movie_00", "b2-pokewood-briefings"],
  ["a/0/0/2:0307:0:0000", "Scene", "pkwd_briefing_movie_40", "b2-pokewood-briefings"],
  ["a/0/0/2:0313:0:0000", "Brycen-Man", "pkwd_briefing_common", "b2-pokewood-other"],
  ["a/0/0/2:0354:0:0000", "Movie synopsis", "pokewood_lines", "b2-pokewood-other"],
  ["a/0/0/3:0198:0:0000", "Movies", "pokestar_studios", "b2-pokewood-other"],
  ["a/0/0/2:0083:0:0000", "First Step", "medal_names", "b2-medals"],
  ["a/0/0/3:0066:0:0000", "Medal", "medal_office", "b2-medals"],
  ["a/0/0/2:0098:0:0000", "Peeks", "musical_event", "b2-musical"],
  ["a/0/0/3:0087:0:0000", "Musical Theater", "musical_theater", "b2-musical"],
  ["a/0/0/2:0369:0:0001", "Takao Unno", "title_15", "b2-credits"],
  ["a/0/0/2:0363:0:0007", "BOY", "gender_choice_ui", "b2-menu"],
  ["a/0/0/2:0440:0:0002", "FORGET", "move_learning_prompts", "b2-moves"],
  ["a/0/0/2:0064:0:0000", "TM01", "item_names", "b2-items"],
  ["a/0/0/2:0024:0:0000", "About Infrared", "cg_help", "b2-network"],
  ["a/0/0/3:0169:0:0000", "Welcome", "aspertia_city", "b2-cities"],
  ["a/0/0/3:0310:0:0000", "Ancient words", "abyssal_ruins_5", "b2-routes"],
  ["a/0/0/3:0511:0:0000", "PP", "global_2260", "b2-global"],
  ["a/0/0/3:0203:0:0000", "Join Avenue", "join_avenue", "b2-activities"],
  ["a/0/0/3:0613:0:0000", "BP", "scrcmd_shop", "b2-items"],
  ["a/0/0/2:0069:0:0000", "Phrase", "event_phrase_input", "b2-words"],
] as const;

describe("Black 2 English-only IDs -> bank filters (original ROM mapping)", () => {
  it("matches the reference bank names, including the swapped film 33-40 genders", () => {
    for (const [id, , bankName] of cases) {
      const [archive, bank] = id.split(":");
      expect(black2CompactBankName(archive, Number(bank)), id).toBe(bankName);
    }
    expect(black2CompactBankName("a/0/0/2", 9999)).toBeNull();
    expect(black2CompactBankName("a/0/0/4", 181)).toBeNull();
  });

  it("classifies every case into a real, visible filter and handles old saved labels", () => {
    const document = {
      metadata: { game: "Pokémon Black 2", count: cases.length },
      entries: cases.map(([id, english]) => ({ id, english })),
    };
    const { entries, document: parsed, translations } = parseBlack2EnglishOnlyJson(JSON.stringify(document));
    const visible = new Set(BLACK2_CATEGORIES.map(c => c.id));
    for (let i = 0; i < entries.length; i++) {
      const [id, , bankName, category] = cases[i];
      expect(entries[i].label, id).toBe(bankName + " · " + id);
      expect(categorizeBlack2Entry(entries[i]), id).toBe(category);
      expect(visible.has(category)).toBe(true);
      expect(black2CompactBankNameFromEditorPath(entries[i].msbtFile)).toBe(bankName);
      // Reclassify existing sessions that were imported before the bank-name fix.
      const previous = { ...entries[i], label: id.split(":")[0] + " · " + id };
      expect(categorizeBlack2Entry(previous), "saved " + id).toBe(category);
    }
    const exported = exportBlack2EnglishOnlyJson(parsed, entries, translations);
    expect(exported).toEqual(document); // no category/label metadata leaked into JSON
    const translatedKey = entries[2].msbtFile + ":" + entries[2].index;
    const withArabic = exportBlack2EnglishOnlyJson(parsed, entries, { [translatedKey]: "نجم سينمائي" });
    expect(withArabic.entries[2]).toEqual({ ...document.entries[2], arabic: "نجم سينمائي" });
    expect(withArabic.entries.filter(e => "arabic" in e)).toHaveLength(1);
  });
});
