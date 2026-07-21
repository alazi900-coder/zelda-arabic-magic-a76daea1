import { describe, it, expect } from "vitest";
import { extractMother3Entries, buildMother3Rom } from "@/lib/mother3/m3-editor-bridge";
import { parseBank } from "@/lib/mother3/m3-script";
import { encodeByte, textToCodes, END_BYTE, ROM_BASE } from "@/lib/mother3/m3-codec";
import { BANK_TABLE_OFFSET } from "@/lib/mother3/m3-script";

// Minimal synthetic ROM with one bank of a few lines (same helper style as
// mother3-script.test.ts) so the bridge can be exercised without the real ROM.
const KEY1_OFF = 0x13c5d8;
const KEY1_MOD = 0x126;
const KEY2_OFF = 0x1fac000;
const KEY2_MOD = 0x3a20;

function makeRom(): Uint8Array {
  const rom = new Uint8Array(0x2000000);
  for (let i = 0; i < KEY1_MOD; i++) rom[KEY1_OFF + i] = (i * 37 + 11) & 0xff;
  for (let i = 0; i < KEY2_MOD; i++) rom[KEY2_OFF + i] = (i * 53 + 7) & 0xff;
  return rom;
}
function writeBankData(rom: Uint8Array, regionStart: number, lines: number[][]): number {
  const count = lines.length;
  const addrOfFFFF = regionStart + count * 2;
  rom[addrOfFFFF] = 0xff;
  rom[addrOfFFFF + 1] = 0xff;
  const dataBase = addrOfFFFF;
  let cursor = dataBase + 2;
  lines.forEach((codes, n) => {
    const pointer = cursor - dataBase;
    rom[regionStart + n * 2] = pointer & 0xff;
    rom[regionStart + n * 2 + 1] = (pointer >>> 8) & 0xff;
    for (const c of [...codes, END_BYTE]) {
      rom[cursor] = encodeByte(rom, c, ROM_BASE + cursor);
      cursor++;
    }
  });
  return cursor;
}
function placeOneBank(rom: Uint8Array, regionStart: number, lines: number[][]) {
  const dataEnd = writeBankData(rom, regionStart, lines);
  const nextStart = dataEnd + 200;
  writeBankData(rom, nextStart, [textToCodes("z")]);
  const dv = new DataView(rom.buffer);
  dv.setUint32(BANK_TABLE_OFFSET + 0, regionStart - BANK_TABLE_OFFSET + 4, true);
  dv.setUint32(BANK_TABLE_OFFSET + 4, dataEnd - BANK_TABLE_OFFSET + 4, true);
  dv.setUint32(BANK_TABLE_OFFSET + 8, nextStart - BANK_TABLE_OFFSET + 4, true);
  dv.setUint32(BANK_TABLE_OFFSET + 12, nextStart + 32 - BANK_TABLE_OFFSET + 4, true);
  dv.setUint32(BANK_TABLE_OFFSET + 16, 0xffffffff, true);
}

describe("mother3 editor bridge", () => {
  it("extracts only translatable lines as bank_N entries and skips control-only lines", () => {
    const rom = makeRom();
    placeOneBank(rom, 0x1370100, [
      textToCodes("Hello world"),
      textToCodes("[F103]{01}"), // control-only (code + raw byte) -> skipped
      textToCodes("Aahh"),
    ]);
    const { entries } = extractMother3Entries(rom);
    // bank_1:0 is the bounding bank's single "z" line (also translatable).
    expect(entries.map((e) => `${e.msbtFile}:${e.index}`)).toEqual(["bank_0:0", "bank_0:2", "bank_1:0"]);
    expect(entries[0].original).toBe("Hello world");
  });

  it("builds a patched ROM from editor translations and re-decodes to the new text", () => {
    const rom = makeRom();
    placeOneBank(rom, 0x1370100, [textToCodes("Hello world"), textToCodes("Aahh")]);
    const built = buildMother3Rom(rom, { "bank_0:0": "Bye now" });
    expect("rom" in built).toBe(true);
    if (!("rom" in built)) return;
    expect(built.translatedLines).toBe(1);
    const bank = parseBank(built.rom, 0)!;
    expect(bank.lines[0].text).toBe("Bye now");
    expect(bank.lines[1].text).toBe("Aahh"); // untouched line preserved
  });

  it("reports per-bank overflow instead of corrupting", () => {
    const rom = makeRom();
    placeOneBank(rom, 0x1370100, [textToCodes("Hi")]);
    const built = buildMother3Rom(rom, { "bank_0:0": "x".repeat(400) });
    expect("error" in built).toBe(true);
    if ("error" in built) {
      expect(built.overflows[0].bank).toBe(0);
      expect(built.overflows[0].overflowBy).toBeGreaterThan(0);
    }
  });
});
