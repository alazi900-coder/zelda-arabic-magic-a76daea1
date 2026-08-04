/**
 * An Arabic keyboard on Pokémon Emerald's naming screen.
 *
 * What the player presses and what the player sees are two different pieces of
 * data, and both had to be found:
 *
 *   0x58BE40  twelve rows of eight bytes — three pages of four rows — is what
 *             a key press turns into. One pointer names it, at 0xE4A5C.
 *   0x62B911  the grid the player looks at, four strings of eight keys, each
 *             key written as «FC 11 <advance> <character>». Patching only the
 *             first table gave a screen that typed Arabic and showed English.
 *
 * The screen opens on the capitals page, so that is the page Arabic takes:
 * the 28 letters, then ى ة أ ء, which is what a name is likeliest to need.
 * The small letters are left where they are, one press of SELECT away, so an
 * English name is still typeable.
 *
 * The keys carry the isolated shapes and the name is stored exactly as
 * pressed; the letters are joined when they are drawn — see `emerald-shape.ts`.
 */

import { emeraldCharTables } from "./emerald-arabic";

/** What a key press becomes: the capitals page of the twelve-row table. */
export const EMERALD_KEYBOARD_TABLE = 0x58be60;
/** What the player sees: four rows of eight «FC 11 x c» groups. */
export const EMERALD_KEYBOARD_GRID = 0x62b911;
const GRID_ROW = 33; // eight groups of four bytes, then the terminator

/** The English page this replaces, checked before anything is written. */
const ENGLISH_PAGE = [
  0xbb, 0xbc, 0xbd, 0xbe, 0xbf, 0xc0, 0x00, 0xad,
  0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0x00, 0xb8,
  0xc7, 0xc8, 0xc9, 0xca, 0xcb, 0xcc, 0xcd, 0x00,
  0xce, 0xcf, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0x00,
];

/** The page, row by row, in the order the keys sit on screen. */
const PAGE = "ابتثجحخد" + "ذرزسشصضط" + "ظعغفقكلم" + "نهويىةأء";

/** The isolated shape of each of those letters. */
const ISOLATED: Record<string, number> = {
  "ء": 0xfe80, "أ": 0xfe83, "ا": 0xfe8d, "ب": 0xfe8f, "ة": 0xfe93, "ت": 0xfe95,
  "ث": 0xfe99, "ج": 0xfe9d, "ح": 0xfea1, "خ": 0xfea5, "د": 0xfea9, "ذ": 0xfeab,
  "ر": 0xfead, "ز": 0xfeaf, "س": 0xfeb1, "ش": 0xfeb5, "ص": 0xfeb9, "ض": 0xfebd,
  "ط": 0xfec1, "ظ": 0xfec5, "ع": 0xfec9, "غ": 0xfecd, "ف": 0xfed1, "ق": 0xfed5,
  "ك": 0xfed9, "ل": 0xfedd, "م": 0xfee1, "ن": 0xfee5, "ه": 0xfee9, "و": 0xfeed,
  "ى": 0xfeef, "ي": 0xfef1,
};

/** Where in the grid's strings each key's character byte sits. */
function gridSlots(): number[] {
  const out: number[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      out.push(EMERALD_KEYBOARD_GRID + GRID_ROW * row + 3 + 4 * col);
    }
  }
  return out;
}

/** The Arabic page, in this game's codes. */
export function emeraldArabicKeys(): Uint8Array {
  const byte = emeraldCharTables().arabicToByte;
  const keys = [...PAGE];
  if (keys.length !== ENGLISH_PAGE.length) {
    throw new Error(`الصفحة ${keys.length} مفتاحاً والمنتظر ${ENGLISH_PAGE.length}`);
  }
  return Uint8Array.from(keys, (ch) => {
    const code = byte.get(ISOLATED[ch]);
    if (code === undefined) throw new Error(`لا توجد خانة للحرف ${ch}`);
    return code;
  });
}

/** True when this ROM already carries the Arabic keyboard. */
export function hasEmeraldArabicKeyboard(rom: Uint8Array): boolean {
  const keys = emeraldArabicKeys();
  for (let i = 0; i < keys.length; i++) {
    if (rom[EMERALD_KEYBOARD_TABLE + i] !== keys[i]) return false;
  }
  return true;
}

/**
 * Writes the keyboard into a copy of the ROM.
 *
 * It refuses rather than guess: both the table and the grid have to still hold
 * the English page this was measured against.
 */
export function applyEmeraldArabicKeyboard(rom: Uint8Array): Uint8Array {
  if (hasEmeraldArabicKeyboard(rom)) return rom;
  const slots = gridSlots();
  for (let i = 0; i < ENGLISH_PAGE.length; i++) {
    if (rom[EMERALD_KEYBOARD_TABLE + i] !== ENGLISH_PAGE[i] || rom[slots[i]] !== ENGLISH_PAGE[i]) {
      throw new Error("لوحة إدخال الاسم في هذا الروم ليست التي قيست عليها الرقعة");
    }
  }
  const keys = emeraldArabicKeys();
  const out = new Uint8Array(rom);
  out.set(keys, EMERALD_KEYBOARD_TABLE);
  slots.forEach((slot, i) => (out[slot] = keys[i]));
  return out;
}
