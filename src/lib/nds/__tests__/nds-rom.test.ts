import { describe, expect, it } from "vitest";
import { findNdsFile, ndsFileIdByPath, writeNdsFile } from "../nds-rom";

const FNT_OFFSET = 0x40;
const FAT_OFFSET = 0x48;
const FAT_SIZE = 0x4c;
const USED_SIZE = 0x80;
const ALIGN = 512;
/** Fixed offsets for the synthetic fixtures below, chosen clear of the header and each other. */
const FNT_AT = 0x140;
const FAT_AT = 0x1000;

function u32le(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

/**
 * A minimal single-directory NDS image holding `files` back to back, in FAT
 * order, with no gaps -- just enough structure for `ndsFileIdByPath` and the
 * FAT reader to agree with a real cartridge's layout.
 *
 * `declaredUsedSize` defaults to the true end of the last file; passing a
 * smaller value reproduces the real bug this module fixes: a header whose
 * used-size field understates where FAT-referenced data actually ends.
 */
function buildRom(files: { name: string; data: Uint8Array }[], declaredUsedSize?: number): Uint8Array {
  const fnt: number[] = [...u32le(8), 0, 0, 1, 0]; // root: {subtable offset=8, first file id=0 (u16), dir count=1 (u16)}
  for (const f of files) {
    fnt.push(f.name.length);
    for (let i = 0; i < f.name.length; i++) fnt.push(f.name.charCodeAt(i));
  }
  fnt.push(0); // end of subtable

  const bodyOffset = FAT_AT + files.length * 8;
  let cursor = bodyOffset;
  const fat: number[] = [];
  const body: number[] = [];
  for (const f of files) {
    const start = cursor;
    const end = start + f.data.length;
    fat.push(...u32le(start), ...u32le(end));
    body.push(...f.data);
    cursor = end;
  }

  const rom = new Uint8Array(Math.max(cursor, 0x200));
  rom.set(fnt, FNT_AT);
  rom.set(u32le(FNT_AT), FNT_OFFSET);
  rom.set(u32le(FAT_AT), FAT_OFFSET);
  rom.set(u32le(fat.length), FAT_SIZE);
  rom.set(u32le(declaredUsedSize ?? cursor), USED_SIZE);
  rom.set(fat, FAT_AT);
  rom.set(body, bodyOffset);
  return rom;
}

describe("nds-rom findNdsFile / writeNdsFile", () => {
  it("finds a file by its name-table path", () => {
    const rom = buildRom([
      { name: "a.bin", data: new Uint8Array([1, 2, 3]) },
      { name: "b.bin", data: new Uint8Array([4, 5]) },
    ]);
    expect(ndsFileIdByPath(rom).get("b.bin")).toBe(1);
    const file = findNdsFile(rom, "b.bin")!;
    expect(Array.from(rom.subarray(file.start, file.end))).toEqual([4, 5]);
  });

  it("writes a same-size-or-smaller file in place", () => {
    const rom = buildRom([{ name: "a.bin", data: new Uint8Array([1, 2, 3, 4]) }]);
    const file = findNdsFile(rom, "a.bin")!;
    const out = writeNdsFile(rom, file, new Uint8Array([9, 9]));
    const moved = findNdsFile(out, "a.bin")!;
    expect(moved.start).toBe(file.start);
    expect(Array.from(out.subarray(moved.start, moved.end))).toEqual([9, 9]);
  });

  /**
   * The bug found on an Inazuma Eleven (Europe) cartridge: its header
   * declares a used-size 222,447 bytes short of where its own FAT entries
   * actually end -- several files, including a player-sprite archive, sit
   * past what the header claims is the end of real data. Relocating a grown
   * file to just past the DECLARED used size landed it inside that archive
   * and overwrote live sprite data, turning every character on screen solid
   * black.
   *
   * `sprites` here stands in for that archive: its true FAT end sits past the
   * header's own used-size field, which is set to land inside it.
   */
  it("does not overwrite a file that already extends past the declared used size", () => {
    const sprites = new Uint8Array(3000).fill(0xaa);
    const text = new Uint8Array(50).fill(0x42);
    const spritesStart = FAT_AT + 2 * 8; // first file, right after the two FAT entries
    const rom = buildRom(
      [
        { name: "sprites.bin", data: sprites },
        { name: "text.bin", data: text },
      ],
      spritesStart + 500, // lands inside sprites.bin's own real range
    );

    const spritesBefore = findNdsFile(rom, "sprites.bin")!;
    const textFile = findNdsFile(rom, "text.bin")!;
    const grown = new Uint8Array(200).fill(0x99); // bigger than the 50 bytes it fits in
    const out = writeNdsFile(rom, textFile, grown);

    // sprites.bin's bytes must be untouched, at their original location.
    expect(Array.from(out.subarray(spritesBefore.start, spritesBefore.end))).toEqual(Array.from(sprites));

    // and text.bin must have been relocated past sprites.bin's TRUE end, not
    // past the header's understated used-size field.
    const textAfter = findNdsFile(out, "text.bin")!;
    expect(textAfter.start).toBeGreaterThanOrEqual(spritesBefore.end);
    expect(Array.from(out.subarray(textAfter.start, textAfter.end))).toEqual(Array.from(grown));
  });

  it("grows the image when the relocated file runs past its current length", () => {
    const rom = buildRom([{ name: "a.bin", data: new Uint8Array(10) }]);
    const file = findNdsFile(rom, "a.bin")!;
    const big = new Uint8Array(rom.length + 5000).fill(7);
    const out = writeNdsFile(rom, file, big);
    expect(out.length).toBeGreaterThan(rom.length);
    expect(out.length % ALIGN).toBe(0);
    const moved = findNdsFile(out, "a.bin")!;
    expect(Array.from(out.subarray(moved.start, moved.end))).toEqual(Array.from(big));
  });
});
