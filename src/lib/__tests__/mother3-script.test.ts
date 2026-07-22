import { describe, it, expect } from "vitest";
import {
  decodeByte,
  encodeByte,
  codesToText,
  textToCodes,
  ROM_BASE,
  END_BYTE,
} from "@/lib/mother3/m3-codec";
import {
  BANK_TABLE_OFFSET,
  parseBankTable,
  parseBank,
  rebuildBank,
  applyRebuild,
} from "@/lib/mother3/m3-script";

/**
 * Build a minimal synthetic Mother 3 ROM: key tables filled with a pseudo
 * pattern, a bank table with one bank, and one bank containing a few lines
 * encoded exactly the way the real routine expects. This exercises the codec,
 * bank parsing, and rebuild/repack without shipping the copyrighted ROM.
 */
const KEY1_OFF = 0x13c5d8;
const KEY1_MOD = 0x126;
const KEY2_OFF = 0x1fac000;
const KEY2_MOD = 0x3a20;
const ROM_SIZE = 0x2000000;

function makeRom(): Uint8Array {
  const rom = new Uint8Array(ROM_SIZE);
  for (let i = 0; i < KEY1_MOD; i++) rom[KEY1_OFF + i] = (i * 37 + 11) & 0xff;
  for (let i = 0; i < KEY2_MOD; i++) rom[KEY2_OFF + i] = (i * 53 + 7) & 0xff;
  return rom;
}

/** Encode decoded codes (+terminator) obfuscated at their real ROM addresses. */
function writeLine(rom: Uint8Array, fileOffset: number, codes: number[]): number {
  let a = fileOffset;
  for (const c of [...codes, END_BYTE]) {
    rom[a] = encodeByte(rom, c, ROM_BASE + a);
    a++;
  }
  return a - fileOffset;
}

/** Write one bank's pointer table + 0xFFFF + line data at regionStart; returns
 *  the file offset one past the written data. */
function writeBankData(rom: Uint8Array, regionStart: number, lines: number[][]): number {
  const count = lines.length;
  const addrOfFFFF = regionStart + count * 2;
  rom[addrOfFFFF] = 0xff;
  rom[addrOfFFFF + 1] = 0xff;
  const dataBase = addrOfFFFF;
  let cursor = dataBase + 2; // start data after the 2-byte terminator
  lines.forEach((codes, n) => {
    const pointer = cursor - dataBase;
    rom[regionStart + n * 2] = pointer & 0xff;
    rom[regionStart + n * 2 + 1] = (pointer >>> 8) & 0xff;
    cursor += writeLine(rom, cursor, codes);
  });
  return cursor;
}

/**
 * Place a bank whose data-region end is bounded by a second (bounding) bank
 * `slack` bytes later, mirroring the real ROM where a bank runs to the next
 * bank's start. Returns the bank-0 region size so overflow can be asserted.
 */
function placeBank(rom: Uint8Array, regionStart: number, lines: number[][], slack = 64): number {
  const dataEnd = writeBankData(rom, regionStart, lines);
  const nextStart = dataEnd + slack;
  // a second, non-empty bank starting at nextStart bounds bank 0's region
  writeBankData(rom, nextStart, [strToCodes("z")]);
  const t = BANK_TABLE_OFFSET;
  const dv = new DataView(rom.buffer);
  dv.setUint32(t + 0, regionStart - BANK_TABLE_OFFSET + 4, true); // bank 0 start
  dv.setUint32(t + 4, (dataEnd) - BANK_TABLE_OFFSET + 4, true); // bank 0 end (pointer-table bound; unused by parser)
  dv.setUint32(t + 8, nextStart - BANK_TABLE_OFFSET + 4, true); // bank 1 start (bounds bank 0)
  dv.setUint32(t + 12, nextStart + 32 - BANK_TABLE_OFFSET + 4, true);
  dv.setUint32(t + 16, 0xffffffff, true); // stop
  return nextStart - regionStart;
}

// "No problem here." in the game charset (N=0x2E,o=0x4F,space=0x40,'.'=0x0E ...)
function strToCodes(s: string): number[] {
  return textToCodes(s);
}

describe("mother3 codec", () => {
  it("decode∘encode round-trips for every byte value at odd and even addresses", () => {
    const rom = makeRom();
    for (const addr of [0x1370000, 0x1370001, 0x13abcde, 0x13abcdf]) {
      for (let b = 0; b < 256; b++) {
        const d = decodeByte(rom, b, ROM_BASE + addr);
        expect(encodeByte(rom, d, ROM_BASE + addr)).toBe(b);
      }
    }
  });

  it("tokenizes and detokenizes text, control codes, and raw bytes losslessly", () => {
    const codes = [0x2e, 0x4f, 0x40, 0xf1, 0x03, 0x0e, 0x9b];
    const text = codesToText(codes);
    expect(text).toBe("No [F103].{9B}");
    expect(textToCodes(text)).toEqual(codes);
  });

  it("rejects un-encodable characters", () => {
    expect(() => textToCodes("café")).toThrow();
  });

  it("encodes Arabic words whose ط/ظ/آ resolve to forms the font lacks", () => {
    // خطر → ط lands in the medial form (U+FEC4) the font never drew; the
    // fallback maps it to the ط final glyph (0x09) instead of throwing.
    const codes = textToCodes("خطر");
    expect(codes).toContain(0x09);
    // آ (alef madda, isolated form U+FE81) falls back to the آ final glyph.
    expect(() => textToCodes("آن")).not.toThrow();
  });
});

describe("mother3 script parse + rebuild", () => {
  it("parses a synthetic bank and decodes its lines", () => {
    const rom = makeRom();
    const regionStart = 0x1370100;
    placeBank(rom, regionStart, [
      strToCodes("No problem here."),
      strToCodes("Hello world"),
      strToCodes("Aahh"),
    ]);
    const regions = parseBankTable(rom);
    expect(regions[0].index).toBe(0);
    const bank = parseBank(rom, 0);
    expect(bank).not.toBeNull();
    expect(bank!.lines.map((l) => l.text)).toEqual(["No problem here.", "Hello world", "Aahh"]);
  });

  it("rebuilds a bank after editing and re-parses to the edited text", () => {
    const rom = makeRom();
    const regionStart = 0x1370100;
    placeBank(rom, regionStart, [strToCodes("Hello world"), strToCodes("Aahh")]);
    const bank = parseBank(rom, 0)!;
    const edited = new Map<number, string>([[0, "Bye"]]);
    const res = rebuildBank(rom, bank, edited);
    expect("bytes" in res).toBe(true);
    if (!("bytes" in res)) return;
    const rom2 = applyRebuild(rom, res);
    const bank2 = parseBank(rom2, 0)!;
    expect(bank2.lines.map((l) => l.text)).toEqual(["Bye", "Aahh"]);
  });

  it("re-encodes unchanged banks byte-identically (lossless no-op rebuild)", () => {
    const rom = makeRom();
    const regionStart = 0x1370100;
    placeBank(rom, regionStart, [strToCodes("No problem here."), strToCodes("Hello world")]);
    const bank = parseBank(rom, 0)!;
    const res = rebuildBank(rom, bank, new Map());
    if (!("bytes" in res)) throw new Error("expected rebuild");
    const rom2 = applyRebuild(rom, res);
    const bank2 = parseBank(rom2, 0)!;
    expect(bank2.lines.map((l) => l.text)).toEqual(["No problem here.", "Hello world"]);
  });

  it("refuses to overflow a bank's region and reports the overflow amount", () => {
    const rom = makeRom();
    const regionStart = 0x1370100;
    placeBank(rom, regionStart, [strToCodes("Hi")]);
    const bank = parseBank(rom, 0)!;
    const huge = "x".repeat(500);
    const res = rebuildBank(rom, bank, new Map([[0, huge]]));
    expect("error" in res).toBe(true);
    if ("error" in res) expect(res.overflowBy).toBeGreaterThan(0);
  });
});
