import { describe, it, expect } from "vitest";
import { decodeNamesString, encodeNamesString } from "@/lib/mother3/m3-names-codec";
import {
  parseNamesTable,
  rebuildNamesTable,
  applyNamesRebuild,
  type NamesTableSpec,
} from "@/lib/mother3/m3-names-table";

const STRIDE = 44; // matches the real item-names table: 21 chars + terminator

/** Write a fixed-stride table: 4 header bytes (an unrelated, non-charset code
 *  — mirrors the real ROM's item-names table) then one slot per name, each
 *  `stride` bytes, text + 0xFFFF terminator + 0xFF padding to fill the slot. */
function writeFixedStrideTable(rom: Uint8Array, start: number, names: string[], stride = STRIDE): number {
  rom[start] = 0x00;
  rom[start + 1] = 0x01; // header: code 0x0100, not in the names charset
  rom[start + 2] = 0xff;
  rom[start + 3] = 0xff;
  const dataStart = start + 4;
  for (let i = 0; i < names.length; i++) {
    const slot = dataStart + i * stride;
    rom.fill(0xff, slot, slot + stride);
    let cursor = slot;
    for (const code of encodeNamesString(names[i])) {
      rom[cursor] = code & 0xff;
      rom[cursor + 1] = (code >>> 8) & 0xff;
      cursor += 2;
    }
    rom[cursor] = 0xff;
    rom[cursor + 1] = 0xff;
  }
  return dataStart + names.length * stride;
}

describe("mother3 names codec", () => {
  it("round-trips the real item-name charset (letters, digits, space, apostrophe, hyphen)", () => {
    const text = "Easy-Grip Stick's 2nd, Mini.";
    const codes = encodeNamesString(text);
    const rom = new Uint8Array(codes.length * 2 + 2);
    let cursor = 0;
    for (const c of codes) {
      rom[cursor] = c & 0xff;
      rom[cursor + 1] = (c >>> 8) & 0xff;
      cursor += 2;
    }
    rom[cursor] = 0xff;
    rom[cursor + 1] = 0xff;
    const res = decodeNamesString(rom, 0, rom.length);
    expect(res?.text).toBe(text);
  });

  it("rejects un-encodable characters", () => {
    expect(() => encodeNamesString("café")).toThrow();
  });

  it("round-trips comma, parentheses, and PSI Greek-letter suffixes", () => {
    // Verified against real statuses/psinames data: comma is 0x0C (not the
    // dialogue codec's 0x0F, which this table never actually uses).
    for (const text of ["Stopped, Frozen", "Off Down (weak)", "PK Fire α", "PK Fire Ω"]) {
      const codes = encodeNamesString(text);
      const rom = new Uint8Array(codes.length * 2 + 2);
      let cursor = 0;
      for (const c of codes) {
        rom[cursor] = c & 0xff;
        rom[cursor + 1] = (c >>> 8) & 0xff;
        cursor += 2;
      }
      rom[cursor] = 0xff;
      rom[cursor + 1] = 0xff;
      expect(decodeNamesString(rom, 0, rom.length)?.text).toBe(text);
    }
  });
});

describe("mother3 names table parse + rebuild (fixed-stride slots)", () => {
  const names = ["EMPTY", "Lighter's Lumber", "Fresh Lumber", "Easy-Grip Stick"];

  function makeSpec(start: number, end: number): NamesTableSpec {
    return {
      id: "names_itemnames",
      label: "أسماء الأغراض",
      start,
      end,
      dataStart: start + 4,
      stride: STRIDE,
      count: names.length,
    };
  }

  it("parses a synthetic fixed-stride table in slot order", () => {
    const start = 0x1000;
    const rom = new Uint8Array(0x2000).fill(0xff);
    const end = writeFixedStrideTable(rom, start, names);
    const spec = makeSpec(start, end);
    const entries = parseNamesTable(rom, spec);
    expect(entries.map((e) => e.text)).toEqual(names);
  });

  it("rebuilds after editing one entry and re-parses to the edited text, leaving other slots untouched", () => {
    const start = 0x1000;
    const rom = new Uint8Array(0x2000).fill(0xff);
    const end = writeFixedStrideTable(rom, start, names);
    const spec = makeSpec(start, end);
    const entries = parseNamesTable(rom, spec);
    const res = rebuildNamesTable(rom, spec, entries, new Map([[1, "Bye"]]));
    expect("bytes" in res).toBe(true);
    if (!("bytes" in res)) return;
    const rom2 = applyNamesRebuild(rom, res);
    const entries2 = parseNamesTable(rom2, spec);
    expect(entries2.map((e) => e.text)).toEqual(["EMPTY", "Bye", "Fresh Lumber", "Easy-Grip Stick"]);
    // Untouched slots must keep their exact original bytes (no reflow/shift).
    for (const idx of [0, 2, 3]) {
      const slot = spec.dataStart + idx * spec.stride - start;
      expect(rom2.slice(start + slot, start + slot + spec.stride)).toEqual(
        rom.slice(start + slot, start + slot + spec.stride)
      );
    }
    // The table's header bytes must survive a rebuild untouched too.
    expect(rom2[start]).toBe(0x00);
    expect(rom2[start + 1]).toBe(0x01);
  });

  it("refuses an entry longer than its 21-character slot without touching the ROM", () => {
    const start = 0x1000;
    const rom = new Uint8Array(0x2000).fill(0xff);
    const end = writeFixedStrideTable(rom, start, names);
    const spec = makeSpec(start, end);
    const entries = parseNamesTable(rom, spec);
    const tooLong = "x".repeat(22);
    const res = rebuildNamesTable(rom, spec, entries, new Map([[0, tooLong]]));
    expect("error" in res).toBe(true);
  });

  it("skips a single undecodable slot instead of hiding every entry after it", () => {
    // Simulates re-opening an already-built (partly Arabic-encoded) ROM: one
    // slot holds a code with no Latin mapping. Earlier this made the whole
    // scan stop, silently hiding every later entry.
    const start = 0x1000;
    const rom = new Uint8Array(0x2000).fill(0xff);
    writeFixedStrideTable(rom, start, names);
    const spec = makeSpec(start, start + 4 + names.length * STRIDE);
    const badSlot = spec.dataStart + 1 * spec.stride;
    rom[badSlot] = 0x00;
    rom[badSlot + 1] = 0x02; // code 0x0200 has no mapping in this table's charset
    const entries = parseNamesTable(rom, spec);
    expect(entries.map((e) => e.index)).toEqual([0, 2, 3]);
    expect(entries.map((e) => e.text)).toEqual(["EMPTY", "Fresh Lumber", "Easy-Grip Stick"]);
  });

  it("re-encodes an unchanged table losslessly (no-op rebuild)", () => {
    const start = 0x1000;
    const rom = new Uint8Array(0x2000).fill(0xff);
    const end = writeFixedStrideTable(rom, start, names);
    const spec = makeSpec(start, end);
    const entries = parseNamesTable(rom, spec);
    const res = rebuildNamesTable(rom, spec, entries, new Map());
    if (!("bytes" in res)) throw new Error("expected rebuild");
    const rom2 = applyNamesRebuild(rom, res);
    const entries2 = parseNamesTable(rom2, spec);
    expect(entries2.map((e) => e.text)).toEqual(names);
  });
});
