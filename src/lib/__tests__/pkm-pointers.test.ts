import { describe, it, expect } from "vitest";
import {
  GBA_ROM_BASE,
  indexPkmPointers,
  isTrustedPointerSite,
  findPkmFreeRuns,
  PkmFreeSpace,
  writePkmPointer,
} from "@/lib/pokemon/pkm-pointers";
import { scanPkmStrings, applyPkmTranslations } from "@/lib/pokemon/pkm-rom";
import { PKM_TERMINATOR } from "@/lib/pokemon/pkm-charmap";

/** English text in the game's own character set. */
function gameBytes(text: string): number[] {
  return [...text].map((ch) => {
    if (ch === " ") return 0x00;
    if (ch === "\n") return 0xfe;
    if (ch >= "A" && ch <= "Z") return 0xbb + (ch.charCodeAt(0) - 65);
    if (ch >= "a" && ch <= "z") return 0xd5 + (ch.charCodeAt(0) - 97);
    if (ch === ".") return 0xad;
    throw new Error(`no code for ${ch}`);
  });
}

function pointerBytes(target: number): number[] {
  const v = GBA_ROM_BASE + target;
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

describe("which four-byte matches are believed to be pointers", () => {
  it("believes a word-aligned one", () => {
    const rom = new Uint8Array(64);
    expect(isTrustedPointerSite(rom, 8)).toBe(true);
  });

  it("believes an unaligned one the script engine is about to read", () => {
    // `0F <bank>` is loadpointer, and `67` is preparemsg. Counted over this
    // ROM, 2222 unaligned matches follow the first and about a hundred the
    // second; they are the script reading a line.
    const rom = new Uint8Array(64);
    rom[5] = 0x0f;
    rom[6] = 0x00;
    expect(isTrustedPointerSite(rom, 7)).toBe(true);
    rom[10] = 0x67;
    expect(isTrustedPointerSite(rom, 11)).toBe(true);
  });

  it("refuses an unaligned one sitting in the middle of code", () => {
    // This is the case that broke the ROM: four bytes inside THUMB
    // instructions at 0x1DDB5F happened to equal a line's address, and
    // rewriting them booted the game to a black screen.
    const rom = Uint8Array.from([0x79, 0x40, 0x20, 0x10, 0x42, 0x03, 0xd0, 0xe9, 0x6a, 0xc9, 0x18, 0x08]);
    expect(isTrustedPointerSite(rom, 9)).toBe(false);
  });

  it("indexes only what it believes", () => {
    const rom = new Uint8Array(64);
    rom.set(pointerBytes(0x20), 8); // aligned — kept
    rom.set([0x79, 0x40], 20);
    rom.set(pointerBytes(0x20), 22); // unaligned, inside code — dropped
    expect(indexPkmPointers(rom).to(0x20)).toEqual([8]);
  });
});

describe("free space in the ROM", () => {
  it("counts only runs long enough to be padding", () => {
    const rom = new Uint8Array(1024);
    rom.fill(0x11);
    rom.fill(0xff, 100, 110); // a gap inside data, not free space
    rom.fill(0xff, 400, 900);
    expect(findPkmFreeRuns(rom).map((r) => r.start)).toEqual([400]);
  });

  it("hands out aligned blocks and stops when the room is gone", () => {
    const rom = new Uint8Array(2048);
    rom.fill(0x11);
    rom.fill(0xff, 512, 1024);
    const free = new PkmFreeSpace(rom);
    const a = free.take(100)!;
    const b = free.take(100)!;
    expect(a % 4).toBe(0);
    expect(b).toBeGreaterThanOrEqual(a + 100);
    expect(free.take(10_000)).toBeNull();
  });

  it("leaves out a run the caller has claimed", () => {
    const rom = new Uint8Array(2048);
    rom.fill(0x11);
    rom.fill(0xff, 512, 1024);
    const free = new PkmFreeSpace(rom, [{ start: 500, length: 600 }]);
    expect(free.take(8)).toBeNull();
  });
});

describe("moving a line that outgrew its slot", () => {
  /**
   * A line, a pointer to it in an aligned table, and a field of free space.
   *
   * The line carries a break in it, which is what marks it as speech rather
   * than a label — a label is copied into a small buffer in RAM and free ROM
   * space would not save it.
   */
  function romWithPointedLine() {
    const rom = new Uint8Array(0x1000);
    rom.set([...gameBytes("Hello there\nhow are you today"), PKM_TERMINATOR], 0x20);
    rom.set(pointerBytes(0x20), 0x100);
    rom.fill(0xff, 0x400, 0x1000);
    return rom;
  }

  it("writes it into free space and sends the pointer after it", () => {
    const rom = romWithPointedLine();
    const strings = scanPkmStrings(rom);
    const long = "مرحبا بك في هذه المدينة الجميلة جدا يا صديقي العزيز";
    const result = applyPkmTranslations(rom, strings, { "32": long }, { relocate: true });

    expect(result.relocated).toHaveLength(1);
    expect(result.tooLong).toHaveLength(0);
    const to = result.relocated[0].to;
    expect(to).toBeGreaterThanOrEqual(0x400);
    const moved = new DataView(result.rom.buffer).getUint32(0x100, true);
    expect(moved).toBe(GBA_ROM_BASE + to);
    // The line really is there, terminated.
    expect(result.rom[to]).not.toBe(0xff);
    expect(result.rom.indexOf(PKM_TERMINATOR, to)).toBeGreaterThan(to);
  });

  it("refuses instead of moving when nothing points at the line", () => {
    const rom = romWithPointedLine();
    rom.fill(0, 0x100, 0x104); // take the pointer away
    const strings = scanPkmStrings(rom);
    const result = applyPkmTranslations(rom, strings, { "32": "مرحبا بك في هذه المدينة الجميلة" }, { relocate: true });
    expect(result.relocated).toHaveLength(0);
    expect(result.tooLong).toHaveLength(1);
  });

  it("does not move a short line, whatever points at it", () => {
    // A name is copied into a small buffer in RAM, and free ROM space does
    // nothing about that: "Sun Ford Town" took a 16-byte translation and
    // crashed the game on a 21-byte one, wherever the bytes were stored.
    const rom = new Uint8Array(0x1000);
    rom.set([...gameBytes("Sun Ford"), PKM_TERMINATOR], 0x20);
    rom.set(pointerBytes(0x20), 0x100);
    rom.fill(0xff, 0x400, 0x1000);
    const strings = scanPkmStrings(rom);
    const result = applyPkmTranslations(rom, strings, { "32": "مدينة صن فورد الكبيرة" }, { relocate: true });
    expect(result.relocated).toHaveLength(0);
    expect(result.tooLong).toHaveLength(1);
  });

  it("leaves the ROM alone when relocation is not asked for", () => {
    const rom = romWithPointedLine();
    const strings = scanPkmStrings(rom);
    const result = applyPkmTranslations(rom, strings, { "32": "مرحبا بك في هذه المدينة الجميلة" });
    expect(result.relocated).toHaveLength(0);
    expect(result.tooLong).toHaveLength(1);
    expect(result.rom).toEqual(rom);
  });
});

describe("writing a pointer", () => {
  it("stores the address little-endian in the cartridge's range", () => {
    const rom = new Uint8Array(8);
    writePkmPointer(rom, 0, 0x123456);
    expect([...rom.slice(0, 4)]).toEqual([0x56, 0x34, 0x12, 0x08]);
  });
});
