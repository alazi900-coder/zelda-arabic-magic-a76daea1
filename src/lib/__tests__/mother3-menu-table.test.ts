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

// Real menu tables (menus1/menus2) aren't always packed with zero slack —
// unmapped leftover bytes can sit between the terminator and entry 0, between
// two entries, or after the last entry before the table's declared end. That
// trailing space in particular can be unrelated LIVE ROM data (not blank
// padding), so it must be preserved byte-for-byte on rebuild rather than
// assumed to be 0xFF fill — a real bug caught by testing against an actual
// ROM (menus1's declared end sits ~2.3KB past its last real entry).
describe("mother3 menu table gap preservation (non-zero-slack real-world layouts)", () => {
  function makeSpec(start: number, end: number): MenuTableSpec {
    return { id: "menu_menus1", label: "القائمة الرئيسية", start, end };
  }

  it("preserves a leading gap before entry 0 (e.g. a small unidentified header)", () => {
    const start = 0x1000;
    const rom = new Uint8Array(0x2000).fill(0xff);
    const texts = ["Yes", "No"];
    const addrOfFFFF = start + texts.length * 2;
    rom[addrOfFFFF] = 0xff;
    rom[addrOfFFFF + 1] = 0xff;
    // 4-byte leading gap of non-0xFF "unidentified header" bytes
    const gap = [0x2a, 0x00, 0x99, 0x11];
    rom.set(gap, addrOfFFFF + 2);
    let cursor = addrOfFFFF + 2 + gap.length;
    texts.forEach((text, n) => {
      const pointer = cursor - addrOfFFFF;
      rom[start + n * 2] = pointer & 0xff;
      rom[start + n * 2 + 1] = (pointer >>> 8) & 0xff;
      for (const code of encodeNamesString(text)) {
        rom[cursor] = code & 0xff;
        rom[cursor + 1] = (code >>> 8) & 0xff;
        cursor += 2;
      }
      rom[cursor] = 0xff;
      rom[cursor + 1] = 0xff;
      cursor += 2;
    });
    const spec = makeSpec(start, cursor);
    const table = parseMenuTable(rom, spec)!;
    const res = rebuildMenuTable(rom, table, new Map([[0, "Bye"]]));
    if (!("bytes" in res)) throw new Error("expected rebuild");
    const rom2 = applyMenuRebuild(rom, res);
    expect([...rom2.slice(addrOfFFFF + 2, addrOfFFFF + 2 + gap.length)]).toEqual(gap);
    const table2 = parseMenuTable(rom2, spec)!;
    expect(table2.entries[0].text).toBe("Bye");
    expect(table2.entries[1].text).toBe("No");
  });

  it("preserves live, non-blank data after the last entry up to the table's declared end", () => {
    const start = 0x1000;
    const rom = new Uint8Array(0x2000).fill(0xff);
    const end = writeMenuTable(rom, start, ["Yes", "No"]);
    // Simulate unrelated live ROM data (NOT 0xFF blank fill) sitting between
    // the last entry's terminator and the table's declared end.
    const trailing = [0x0a, 0x80, 0x6a, 0x80, 0x16, 0xc0, 0x02, 0x80];
    rom.set(trailing, end);
    const declaredEnd = end + trailing.length;
    const spec = makeSpec(start, declaredEnd);
    const table = parseMenuTable(rom, spec)!;
    const res = rebuildMenuTable(rom, table, new Map([[0, "Bye"]]));
    if (!("bytes" in res)) throw new Error("expected rebuild");
    const rom2 = applyMenuRebuild(rom, res);
    // trailing data must survive, wherever it now lands after the edit shifted things
    const rom2Bytes = [...rom2.slice(spec.start, spec.end)];
    const trailingStr = trailing.map((b) => String.fromCharCode(b)).join("");
    const rom2Str = rom2Bytes.map((b) => String.fromCharCode(b)).join("");
    expect(rom2Str).toContain(trailingStr);
    const table2 = parseMenuTable(rom2, spec)!;
    expect(table2.entries[0].text).toBe("Bye");
    expect(table2.entries[1].text).toBe("No");
  });

  it("preserves an unaccounted gap between two entries (leftover/unused space)", () => {
    const start = 0x1000;
    const rom = new Uint8Array(0x2000).fill(0xff);
    const texts = ["Yes", "No", "End"];
    const addrOfFFFF = start + texts.length * 2;
    rom[addrOfFFFF] = 0xff;
    rom[addrOfFFFF + 1] = 0xff;
    let cursor = addrOfFFFF + 2;
    const pointers: number[] = [];
    for (let n = 0; n < texts.length; n++) {
      pointers.push(cursor - addrOfFFFF);
      for (const code of encodeNamesString(texts[n])) {
        rom[cursor] = code & 0xff;
        rom[cursor + 1] = (code >>> 8) & 0xff;
        cursor += 2;
      }
      rom[cursor] = 0xff;
      rom[cursor + 1] = 0xff;
      cursor += 2;
      if (n === 0) {
        // inject a 6-byte gap of unrelated leftover bytes after "Yes"
        const gap = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66];
        rom.set(gap, cursor);
        cursor += gap.length;
      }
    }
    for (let n = 0; n < texts.length; n++) {
      rom[start + n * 2] = pointers[n] & 0xff;
      rom[start + n * 2 + 1] = (pointers[n] >>> 8) & 0xff;
    }
    const spec = makeSpec(start, cursor);
    const table = parseMenuTable(rom, spec)!;
    const res = rebuildMenuTable(rom, table, new Map([[2, "Bye"]]));
    if (!("bytes" in res)) throw new Error("expected rebuild");
    const rom2 = applyMenuRebuild(rom, res);
    const rom2Bytes = [...rom2.slice(spec.start, spec.end)];
    const gapStr = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66].map((b) => String.fromCharCode(b)).join("");
    const rom2Str = rom2Bytes.map((b) => String.fromCharCode(b)).join("");
    expect(rom2Str).toContain(gapStr);
    const table2 = parseMenuTable(rom2, spec)!;
    expect(table2.entries.map((e) => e.text)).toEqual(["Yes", "No", "Bye"]);
  });
});
