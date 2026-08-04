import { describe, it, expect } from "vitest";
import {
  EMERALD_KEYBOARD_GRID,
  EMERALD_KEYBOARD_TABLE,
  applyEmeraldArabicKeyboard,
  emeraldArabicKeys,
  hasEmeraldArabicKeyboard,
} from "@/lib/gba/emerald-keyboard";
import {
  EMERALD_SHAPE_CAVE,
  EMERALD_SHAPE_HOOK,
  applyEmeraldShapePatch,
  hasEmeraldShapePatch,
} from "@/lib/gba/emerald-shape";
import { EMERALD_CARRIER_CODES } from "@/lib/gba/emerald-arabic";
import { encodeArabicForEmerald } from "@/lib/gba/emerald-arabic";

const ENGLISH_PAGE = [
  0xbb, 0xbc, 0xbd, 0xbe, 0xbf, 0xc0, 0x00, 0xad,
  0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0x00, 0xb8,
  0xc7, 0xc8, 0xc9, 0xca, 0xcb, 0xcc, 0xcd, 0x00,
  0xce, 0xcf, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0x00,
];

/** A 16 MB ROM carrying the two places the naming screen reads. */
function emeraldish(): Uint8Array {
  const rom = new Uint8Array(0x1000000).fill(0xff);
  rom.set(ENGLISH_PAGE, EMERALD_KEYBOARD_TABLE);
  ENGLISH_PAGE.forEach((b, i) => {
    const row = Math.floor(i / 8);
    const col = i % 8;
    rom[EMERALD_KEYBOARD_GRID + 33 * row + 3 + 4 * col] = b;
  });
  // and the five instructions the joining patch hooks
  rom.set([0x20, 0x68, 0x00, 0x07, 0x00, 0x0f, 0x08, 0x28], EMERALD_SHAPE_HOOK);
  rom.fill(0x00, EMERALD_SHAPE_CAVE, EMERALD_SHAPE_CAVE + 0x400);
  return rom;
}

describe("Emerald — an Arabic keyboard on the naming screen", () => {
  it("writes the keys the player presses and the grid the player sees", () => {
    const rom = emeraldish();
    const out = applyEmeraldArabicKeyboard(rom);
    expect(hasEmeraldArabicKeyboard(rom)).toBe(false);
    expect(hasEmeraldArabicKeyboard(out)).toBe(true);

    // Patching only the first of the two gave a screen that typed Arabic and
    // went on showing English, so both are checked.
    const keys = emeraldArabicKeys();
    for (let i = 0; i < keys.length; i++) {
      const row = Math.floor(i / 8);
      const col = i % 8;
      expect(out[EMERALD_KEYBOARD_TABLE + i]).toBe(keys[i]);
      expect(out[EMERALD_KEYBOARD_GRID + 33 * row + 3 + 4 * col]).toBe(keys[i]);
    }
  });

  it("gives 32 different letters, all of them codes Arabic actually owns", () => {
    const keys = [...emeraldArabicKeys()];
    expect(keys).toHaveLength(32);
    expect(new Set(keys).size).toBe(32);
    for (const k of keys) expect(EMERALD_CARRIER_CODES).toContain(k);
  });

  it("refuses a ROM whose keyboard is not the one it was measured on", () => {
    const moved = emeraldish();
    moved[EMERALD_KEYBOARD_TABLE + 3] = 0x00;
    expect(() => applyEmeraldArabicKeyboard(moved)).toThrow("لوحة إدخال");

    // The grid alone being wrong is refused too — writing half of it is what
    // produced a screen that disagreed with itself.
    const grid = emeraldish();
    grid[EMERALD_KEYBOARD_GRID + 3] = 0x00;
    expect(() => applyEmeraldArabicKeyboard(grid)).toThrow("لوحة إدخال");
  });

  it("applies once and stays applied", () => {
    const once = applyEmeraldArabicKeyboard(emeraldish());
    const twice = applyEmeraldArabicKeyboard(once);
    let differing = 0;
    for (let i = 0; i < once.length; i++) if (once[i] !== twice[i]) differing++;
    expect(differing).toBe(0);
  });
});

/**
 * The cave's own algorithm, read out of the ROM it was written into.
 *
 * The point is not to re-implement the patch but to run the exact tables the
 * game will run, over the exact bytes this tool writes.
 */
function shapeLikeTheGame(rom: Uint8Array, bytes: number[]): number[] {
  const code = 144;
  const letterAt = EMERALD_SHAPE_CAVE + code;
  const formsAt = letterAt + 256;
  const fmtAt = formsAt + 164;
  const letter = (b: number) => rom[letterAt + b];
  const form = (off: number, f: number) => rom[formsAt + off + f];
  const fmtLen = (kind: number) => (kind > 0x18 ? 3 : rom[fmtAt + kind]);

  return bytes.map((b, i) => {
    const cur = letter(b);
    if (!cur) return b;
    let index = 0;
    const next = i + 1 < bytes.length ? letter(bytes[i + 1]) : 0;
    if (next && form(cur, 2) !== form(cur, 0)) index |= 2;
    let formatted = false;
    for (let len = 2; len <= 5; len++) {
      const start = i - len;
      if (start >= 0 && bytes[start] === 0xfc && fmtLen(bytes[start + 1]) === len) formatted = true;
    }
    if (!formatted && i > 0) {
      const prev = letter(bytes[i - 1]);
      if (prev && form(prev, 2) !== form(prev, 0)) index |= 1;
    }
    return form(cur, index);
  });
}

describe("Emerald — joining the letters as they are drawn", () => {
  it("writes the hook where the dispatch was, and the cave into empty space", () => {
    const rom = emeraldish();
    const out = applyEmeraldShapePatch(rom);
    expect(hasEmeraldShapePatch(rom)).toBe(false);
    expect(hasEmeraldShapePatch(out)).toBe(true);
    for (let i = 0; i < rom.length; i++) {
      if (rom[i] === out[i]) continue;
      const inHook = i >= EMERALD_SHAPE_HOOK && i < EMERALD_SHAPE_HOOK + 8;
      const inCave = i >= EMERALD_SHAPE_CAVE && i < EMERALD_SHAPE_CAVE + 0x400;
      expect(inHook || inCave).toBe(true);
    }
  });

  it("refuses a ROM whose dispatch is not the one it was measured on", () => {
    const rom = emeraldish();
    rom[EMERALD_SHAPE_HOOK + 1] = 0x00;
    expect(() => applyEmeraldShapePatch(rom)).toThrow("الخطّاف");
  });

  it("refuses to put the cave over anything that is not free", () => {
    const rom = emeraldish();
    rom[EMERALD_SHAPE_CAVE + 8] = 0x42;
    expect(() => applyEmeraldShapePatch(rom)).toThrow("فارغة");
  });

  it("applies once and stays applied", () => {
    const once = applyEmeraldShapePatch(emeraldish());
    const twice = applyEmeraldShapePatch(once);
    let differing = 0;
    for (let i = 0; i < once.length; i++) if (once[i] !== twice[i]) differing++;
    expect(differing).toBe(0);
  });

  it("leaves the lines this tool writes exactly as they were", () => {
    // The cave shapes every Arabic byte it draws, not only a typed name, so it
    // has to agree with the build-time shaper on all of them. Anywhere the two
    // disagreed, the patch would rewrite text that was already correct.
    const rom = applyEmeraldShapePatch(emeraldish());
    const lines = [
      "اسمي بيرش",
      "مرحباً! هذا عالم البوكيمون.",
      "لا أدري كيف",
      "دار الرجل إلى البيت",
      "أهلاً يا صديقي، كيف حالك؟",
      "الأشجار والماء",
    ];
    for (const line of lines) {
      const bytes = [...encodeArabicForEmerald(line, { reverse: false }).bytes];
      expect(shapeLikeTheGame(rom, bytes)).toEqual(bytes);
    }
  });

  it("does not read a formatting code's argument as the letter before", () => {
    // «FC 01 xx» sets the colour, and a colour index of 2 is also the code of
    // an Arabic letter. Without the check, the first letter of every coloured
    // line joined backwards onto it.
    const rom = applyEmeraldShapePatch(emeraldish());
    const line = [...encodeArabicForEmerald("مرحباً", { reverse: false }).bytes];
    const coloured = [0xfc, 0x01, 0x02, ...line];
    expect(shapeLikeTheGame(rom, coloured).slice(3)).toEqual(line);
  });

  it("joins a name that was typed one isolated letter at a time", () => {
    // What the keyboard stores: four isolated shapes, no shaper involved.
    const rom = applyEmeraldShapePatch(applyEmeraldArabicKeyboard(emeraldish()));
    const keys = emeraldArabicKeys();
    const key = (ch: string) => keys[[..."ابتثجحخدذرزسشصضطظعغفقكلمنهويىةأء"].indexOf(ch)];
    const typed = [key("م"), key("ح"), key("م"), key("د")];
    const drawn = shapeLikeTheGame(rom, typed);
    expect(drawn).not.toEqual(typed);
    // The same four letters the build-time shaper would have produced.
    expect(drawn).toEqual([...encodeArabicForEmerald("محمد", { reverse: false }).bytes]);
  });
});
