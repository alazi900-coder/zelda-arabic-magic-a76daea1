import { describe, it, expect } from "vitest";
import {
  parseWolfStrings, buildWolfStrings, listWolfEntries, applyWolfEntries,
  type WolfStringTable,
} from "@/lib/wolfrpg/wolf-strings";

/** Builds a miniature table shaped exactly like the shipped one: two banks,
 *  section starts in the index, and a 0xFF record closing each block. */
function fixture() {
  const bank0 = new TextEncoder().encode("Continue\0New Game\0Fists\0Shotgun\0");
  const bank1 = new TextEncoder().encode("Cat-a-combs\0To To-wer\0");
  const rec = (flags: number, bank: number, off: number) => [flags & 0xff, flags >> 8, bank, off & 0xff, off >> 8];
  const idx = new Uint8Array([
    ...rec(0x44, 0, 0),                 // bank 0, section A at 0
    ...rec(0, 0, 18),                   // bank 0, section B at "Fists"
    ...rec(0, 0xff, bank0.length),      // end of bank 0
    ...rec(0, 1, 0),                    // bank 1, one section
    ...rec(0, 0xff, bank1.length),      // end of bank 1
    0x00, 0x00,                         // the two trailing bytes
  ]);
  return { idx, banks: new Map([[0, bank0], [1, bank1]]) };
}

describe("Wolfenstein RPG string table", () => {
  it("round-trips the index and both banks byte for byte", () => {
    const { idx, banks } = fixture();
    const out = buildWolfStrings(parseWolfStrings(idx, banks));
    expect(Buffer.from(out.idx)).toEqual(Buffer.from(idx));
    for (const [b, bytes] of banks) expect(Buffer.from(out.banks.get(b)!)).toEqual(Buffer.from(bytes));
  });

  it("splits each bank into the sections the index describes", () => {
    const { idx, banks } = fixture();
    const table = parseWolfStrings(idx, banks);
    expect(table.banks.get(0)).toEqual([["Continue", "New Game"], ["Fists", "Shotgun"]]);
    expect(table.banks.get(1)).toEqual([["Cat-a-combs", "To To-wer"]]);
  });

  it("moves every later offset when a string changes length", () => {
    // Strings hold bytes, not Unicode — Arabic reaches this layer already
    // encoded to slot bytes by wolf-charmap, so a plain longer ASCII string is
    // the honest stand-in for "the translation is a different length".
    const { idx, banks } = fixture();
    const table = parseWolfStrings(idx, banks);
    const longer = "Continue-much-longer-than-before";
    const entries = listWolfEntries(table).map((e) => (e.text === "Continue" ? { ...e, text: longer } : e));
    const out = buildWolfStrings(applyWolfEntries(table, entries));
    // Reading the result back must find the sections where the new index says.
    const back = parseWolfStrings(out.idx, out.banks);
    expect(back.banks.get(0)![1]).toEqual(["Fists", "Shotgun"]);
    expect(back.banks.get(0)![0][0]).toBe(longer);
  });

  it("keeps the declared bank size in step with the bank", () => {
    const { idx, banks } = fixture();
    const table = parseWolfStrings(idx, banks);
    const entries = listWolfEntries(table).map((e) => (e.text === "Fists" ? { ...e, text: "Fists!!" } : e));
    const out = buildWolfStrings(applyWolfEntries(table, entries));
    // parse re-checks the 0xFF record against the real file length, so a stale
    // size would throw here rather than in the game.
    expect(() => parseWolfStrings(out.idx, out.banks)).not.toThrow();
  });

  it("refuses a bank that outgrew the u16 offsets rather than writing a broken file", () => {
    const { idx, banks } = fixture();
    const table = parseWolfStrings(idx, banks);
    const entries = listWolfEntries(table).map((e) =>
      e.text === "Continue" ? { ...e, text: "x".repeat(70000) } : e
    );
    expect(() => buildWolfStrings(applyWolfEntries(table, entries))).toThrow(/u16|65535/);
  });

  it("rejects an index whose section offset lands mid-string", () => {
    const { idx, banks } = fixture();
    const broken = new Uint8Array(idx);
    broken[8] = 3; // second section now starts inside "Continue"
    expect(() => parseWolfStrings(broken, banks)).toThrow(/mid-string/);
  });

  it("rejects a bank whose declared size disagrees with the file", () => {
    const { idx, banks } = fixture();
    const broken = new Uint8Array(idx);
    broken[13] = 99; // the 0xFF record's size for bank 0
    expect(() => parseWolfStrings(broken, banks)).toThrow(/declares/);
  });

  it("lists and re-applies entries without disturbing their neighbours", () => {
    const { idx, banks } = fixture();
    const table = parseWolfStrings(idx, banks);
    const entries = listWolfEntries(table);
    expect(entries).toHaveLength(6);
    const edited = applyWolfEntries(table, entries.map((e) => (e.index === 0 && e.section === 0 && e.bank === 1 ? { ...e, text: "Cat-a-comb" } : e)));
    expect(edited.banks.get(1)).toEqual([["Cat-a-comb", "To To-wer"]]);
    expect(edited.banks.get(0)).toEqual(table.banks.get(0));
  });
});
