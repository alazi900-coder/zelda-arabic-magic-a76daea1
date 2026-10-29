import { describe, expect, it } from "vitest";
import { black2EntryKeyFromId, exportBlack2Json, parseBlack2Json, validateBlack2Translation } from "./black2-json";

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
});
