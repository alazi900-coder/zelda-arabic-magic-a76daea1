import { describe, expect, it } from "vitest";
import { BLACK2_CATEGORIES, black2EntryKeyFromId, categorizeBlack2Entry, exportBlack2Json, parseBlack2Json, validateBlack2Translation } from "./black2-json";

const row = {
  id: "a/0/0/2:0001:0:0009", archive: "a/0/0/2", file_id: 349,
  bank_id: 1, bank_name: "b_bag_main", section_id: 0, index: 9,
  category: "system" as const, source: "Welcome\n[CTRL:0109:0000] [CHAR:FFFF]",
  arabic: "", compressed: false, already_contains_arabic: false,
  control_tokens: ["[CTRL:0109:0000]", "[CHAR:FFFF]"], attribute: 0,
};
const fixture = {
  metadata: { game: "Pokémon Black 2", rom_game_code: "IREO", format_version: 1 },
  banks: [{ bank_name: "b_bag_main" }],
  entries: [row],
};

describe("Pokémon Black 2 JSON safety", () => {
  it("keys entries by original archive, bank, section and index", () => {
    expect(black2EntryKeyFromId(row.id)).toBe("black2/a/0/0/2/bank_1/section_0:9");
  });
  it("roundtrips only the Arabic field without touching metadata or tokens", () => {
    const { document, entries } = parseBlack2Json(JSON.stringify(fixture));
    const key = black2EntryKeyFromId(row.id)!;
    const result = exportBlack2Json(document, entries, { [key]: "مرحبًا\n[CTRL:0109:0000] [CHAR:FFFF]" });
    expect(result.entries[0].arabic).toBe("مرحبًا\n[CTRL:0109:0000] [CHAR:FFFF]");
    expect(result.entries[0].control_tokens).toEqual(row.control_tokens);
    expect(result.banks).toEqual(fixture.banks);
    expect(result.metadata).toEqual(fixture.metadata);
    expect(exportBlack2Json(document, entries, {}).entries[0].arabic).toBe("");
  });
  it("rejects missing, reordered, mutated or added controls and missing line breaks", () => {
    expect(validateBlack2Translation(row.source, "نص\n[CHAR:FFFF] [CTRL:0109:0000]")).toBeTruthy();
    expect(validateBlack2Translation(row.source, "نص\n[CTRL:0109:0001] [CHAR:FFFF]")).toBeTruthy();
    expect(validateBlack2Translation(row.source, "نص [CTRL:0109:0000] [CHAR:FFFF]")).toBeTruthy();
    expect(validateBlack2Translation("plain", "نص [CHAR:FFFF]")).toBeTruthy();
    expect(validateBlack2Translation(row.source, "نص\n[CTRL:0109:0000] [CHAR:FFFF]")).toBeNull();
  });
  it("rejects duplicate IDs and mismatched token lists at import", () => {
    expect(() => parseBlack2Json(JSON.stringify({ ...fixture, entries: [row, row] }))).toThrow();
    expect(() => parseBlack2Json(JSON.stringify({ ...fixture, entries: [{ ...row, control_tokens: [] }] }))).toThrow();
  });
  it("accepts the supplied 52,636-row file schema and keeps source attributes", () => {
    const { document, entries, translations } = parseBlack2Json(JSON.stringify({
      metadata: {
        game: "Pokémon Black 2", rom_game_code: "IREO", format_version: 1,
        statistics: { selected_entries: 52636, selected_banks: 918 },
        source_rom_sha256: "example-checksum",
      },
      banks: [{ ...fixture.banks[0], sha256: "bank-checksum" }],
      entries: [row, {
        ...row, id: "a/0/0/3:0001:0:0000", archive: "a/0/0/3", file_id: 350,
        bank_id: 1, bank_name: "global_10480", index: 0, category: "script",
        source: "Hi![CTRL:BE01]\nHello!", control_tokens: ["[CTRL:BE01]"],
        compressed: true, attribute: 2, arabic: "",
      }],
    }));
    expect(entries).toHaveLength(2);
    expect(entries[1].msbtFile).toBe("black2/a/0/0/3/bank_1/section_0");
    expect(translations).toEqual({});
    const result = exportBlack2Json(document, entries, {});
    expect(result.entries[1].compressed).toBe(true);
    expect(result.entries[1].attribute).toBe(2);
    expect(result.metadata.source_rom_sha256).toBe("example-checksum");
  });

  it("assigns every original bank to exactly one visible filter card", () => {
    const samples = [
      ["a/0/0/2", "item_names", "b2-items"],
      ["a/0/0/2", "battle_subway_trainer_messages", "b2-trainers"],
      ["a/0/0/2", "pokedex_entries_en", "b2-pokemon"],
      ["a/0/0/2", "move_names_upper", "b2-moves"],
      ["a/0/0/2", "pkwd_book_movie_00_girl", "b2-activities"],
      ["a/0/0/2", "0060", "b2-system-other"],
      ["a/0/0/3", "global_10480", "b2-global"],
      ["a/0/0/3", "castelia_city_13", "b2-cities"],
      ["a/0/0/3", "route_5", "b2-routes"],
      ["a/0/0/3", "plasma_frigate", "b2-story"],
      ["a/0/0/3", "unusual_script_area", "b2-script-other"],
      ["a/1/1/2", "bank_0001", "b2-additional"],
    ] as const;
    const categoryIds = new Set(BLACK2_CATEGORIES.map(cat => cat.id));
    for (const [archive, name, expected] of samples) {
      const entry = {
        ...parseBlack2Json(JSON.stringify(fixture)).entries[0],
        msbtFile: "black2/" + archive + "/bank_1/section_0",
        label: name + " · " + row.id,
      };
      const actual = categorizeBlack2Entry(entry);
      expect(actual, name).toBe(expected);
      expect(categoryIds.has(actual), name).toBe(true);
    }
  });

});
