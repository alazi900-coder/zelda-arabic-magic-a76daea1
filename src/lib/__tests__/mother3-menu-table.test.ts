import { describe, it, expect } from "vitest";
import { encodeNamesString } from "@/lib/mother3/m3-names-codec";
import {
  parseMenuTable,
  rebuildMenuTable,
  applyMenuRebuild,
  type MenuTableSpec,
} from "@/lib/mother3/m3-menu-table";

/** Write a pointer-table-based menu region: u16 pointer per entry (relative
 *  to the table's own 0xFFFF terminator), then 0xFFFF, then each entry's
 *  codes + its own 0xFFFF terminator, packed back-to-back — mirrors the real
 *  menus1 table (and the main dialogue script's bank format). */
function writeMenuTable(rom: Uint8Array, start: number, texts: (string | null)[], rawCodes?: Map<number, number[]>): number {
  const addrOfFFFF = start + texts.length * 2;
  rom[addrOfFFFF] = 0xff;
  rom[addrOfFFFF + 1] = 0xff;
  let cursor = addrOfFFFF + 2;
  texts.forEach((text, n) => {
    const pointer = cursor - addrOfFFFF;
    rom[start + n * 2] = pointer & 0xff;
    rom[start + n * 2 + 1] = (pointer >>> 8) & 0xff;
    const codes = text !== null ? encodeNamesString(text) : rawCodes!.get(n)!;
    for (const code of codes) {
      rom[cursor] = code & 0xff;
      rom[cursor + 1] = (code >>> 8) & 0xff;
      cursor += 2;
    }
    rom[cursor] = 0xff;
    rom[cursor + 1] = 0xff;
    cursor += 2;
  });
  return cursor;
}

describe("mother3 menu table parse + rebuild (pointer table)", () => {
  const texts = ["", "Yes", "No", "End"];

  function makeSpec(start: number, end: number): MenuTableSpec {
    return { id: "menu_menus1", label: "القائمة الرئيسية", start, end };
  }

  it("parses a synthetic pointer-table menu region in order", () => {
    const start = 0x1000;
    const rom = new Uint8Array(0x2000).fill(0xff);
    const end = writeMenuTable(rom, start, texts);
    const table = parseMenuTable(rom, makeSpec(start, end));
    expect(table?.entries.map((e) => e.text)).toEqual(texts);
  });

  it("skips (returns null for) an entry containing an unmapped code, without disturbing the others", () => {
    const start = 0x1000;
    const rom = new Uint8Array(0x2000).fill(0xff);
    // entry 2 ("No") replaced with a code that has no mapping in the names charset
    const end = writeMenuTable(rom, start, ["", "Yes", null, "End"], new Map([[2, [0x0002]]]));
    const table = parseMenuTable(rom, makeSpec(start, end));
    expect(table?.entries.map((e) => e.text)).toEqual(["", "Yes", null, "End"]);
  });

  it("rebuilds after editing one entry, leaving others (including an undecodable one) byte-identical", () => {
    const start = 0x1000;
    const rom = new Uint8Array(0x2000).fill(0xff);
    const end = writeMenuTable(rom, start, ["", "Yes", null, "End"], new Map([[2, [0x0002]]]));
    const spec = makeSpec(start, end);
    const table = parseMenuTable(rom, spec)!;
    const res = rebuildMenuTable(rom, table, new Map([[1, "Bye"]]));
    expect("bytes" in res).toBe(true);
    if (!("bytes" in res)) return;
    const rom2 = applyMenuRebuild(rom, res);
    const table2 = parseMenuTable(rom2, spec)!;
    expect(table2.entries[1].text).toBe("Bye");
    expect(table2.entries[0].text).toBe("");
    expect(table2.entries[2].text).toBe(null); // still undecodable — never touched
    expect(table2.entries[3].text).toBe("End");
  });

  it("refuses to overflow the table's region without mutating anything", () => {
    const start = 0x1000;
    const rom = new Uint8Array(0x2000).fill(0xff);
    const end = writeMenuTable(rom, start, texts);
    const spec = makeSpec(start, end); // exact fit, no slack
    const table = parseMenuTable(rom, spec)!;
    const huge = "x".repeat(500);
    const res = rebuildMenuTable(rom, table, new Map([[0, huge]]));
    expect("error" in res).toBe(true);
  });

  it("re-encodes an unchanged table losslessly (no-op rebuild)", () => {
    const start = 0x1000;
    const rom = new Uint8Array(0x2000).fill(0xff);
    const end = writeMenuTable(rom, start, texts);
    const spec = makeSpec(start, end);
    const table = parseMenuTable(rom, spec)!;
    const res = rebuildMenuTable(rom, table, new Map());
    if (!("bytes" in res)) throw new Error("expected rebuild");
    const rom2 = applyMenuRebuild(rom, res);
    const table2 = parseMenuTable(rom2, spec)!;
    expect(table2.entries.map((e) => e.text)).toEqual(texts);
  });
});
