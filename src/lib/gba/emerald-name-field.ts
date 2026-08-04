/**
 * Joining the letters in the name field, while the player is still typing.
 *
 * The field is not a line of text. `DrawTextEntry` at 0x080E4D10 walks the name
 * one character at a time, copies each into a two-byte string on the stack and
 * prints that — so the letter the renderer sees has no neighbour, and
 * `emerald-shape.ts`, which reads the neighbours out of the string, has nothing
 * to read. That is why the field went on showing separate letters after the
 * game had learnt to join them everywhere else.
 *
 * The neighbours are still there. They are in the name buffer the loop reads
 * from, and the loop has both the buffer and the index in registers. So this
 * hook sits inside the copy rather than at the drawing, and puts the shaped
 * form into the temporary string:
 *
 *     080E4D5A  adds r0, r0, r4      &buffer[i]
 *     080E4D5C  ldrb r0, [r0]        the character
 *     080E4D5E  strb r0, [r5]        temp[0] = it
 *     080E4D60  mov  r2, r8
 *     080E4D62  strb r2, [r5, #1]    temp[1] = end of string
 *
 * Ten bytes exactly, which is what the jump needs. It goes through r1, which is
 * dead here — the loop writes it again at 0x080E4D6E before reading it.
 *
 * The tables are the drawing patch's own, borrowed rather than copied, so the
 * two cannot come to disagree about a letter; and that patch has to be in the
 * ROM already or there is nothing to borrow.
 *
 * The same loop draws Pokémon nicknames and box names, so those join too.
 *
 * One thing it does not fix: the field puts every letter in a slot of its own,
 * eight pixels apart, and a narrow letter's joining stroke does not always
 * reach the next slot. The shapes are right; a name like «عبدالله» still shows
 * a small gap where «محمد» does not. Closing it means giving up the slots, and
 * with them the underscores each letter sits on.
 */

import { EMERALD_SHAPE_TABLES, hasEmeraldShapePatch } from "./emerald-shape";

/** Where the displaced instructions live, and where the cave is written. */
export const EMERALD_FIELD_HOOK = 0x0e4d5a;
export const EMERALD_FIELD_CAVE = 0xf00900;

/** 92 bytes of THUMB, then the two table addresses and the return address. */
const CODE_B64 =
  "zbQAGRJOE08DePJcACoZ0NIZACFDePNcACsE0JN4F3i7QgDQAiEALAvQQB4DePNcACsG0AdP2xmfeBt4n0IA0EkcU1wrcM28QkZqcAJJCEeYBvAImAfwCGVNDgg=";

/** The hook: `ldr r1,[pc,#4]; bx r1` and the cave's address. */
const HOOK_B64 = "AUkIRwAAAQnwCA==";

/** The ten bytes of the copy, as measured. */
const ORIGINAL = [0x00, 0x19, 0x00, 0x78, 0x28, 0x70, 0x42, 0x46, 0x6a, 0x70];

/** Where the code's literals expect the two tables to be. */
const LETTER_LITERAL = EMERALD_SHAPE_TABLES;
const FORMS_LITERAL = EMERALD_SHAPE_TABLES + 256;
const LITERALS_AT = 80;

function bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The cave, with the two borrowed addresses written into its literals.
 *
 * They are put in here rather than trusted to be what they were when the bytes
 * were assembled: the drawing patch's code can grow, and a stale address would
 * send this one reading an alphabet that is not there.
 */
function cave(): Uint8Array {
  const out = bytes(CODE_B64);
  const word = (at: number, value: number) => {
    out[at] = value & 0xff;
    out[at + 1] = (value >> 8) & 0xff;
    out[at + 2] = (value >> 16) & 0xff;
    out[at + 3] = (value >> 24) & 0xff;
  };
  word(LITERALS_AT, 0x08000000 + LETTER_LITERAL);
  word(LITERALS_AT + 4, 0x08000000 + FORMS_LITERAL);
  return out;
}

/** True when this ROM already carries the patch. */
export function hasEmeraldNameFieldPatch(rom: Uint8Array): boolean {
  const hook = bytes(HOOK_B64);
  for (let i = 0; i < hook.length; i++) {
    if (rom[EMERALD_FIELD_HOOK + i] !== hook[i]) return false;
  }
  return true;
}

/**
 * Writes the patch into a copy of the ROM.
 *
 * It refuses rather than guess: the ten bytes have to be the ones measured, the
 * cave's space has to be empty, and the drawing patch has to be there, because
 * this one reads its tables.
 */
export function applyEmeraldNameFieldPatch(rom: Uint8Array): Uint8Array {
  if (hasEmeraldNameFieldPatch(rom)) return rom;
  if (!hasEmeraldShapePatch(rom)) {
    throw new Error("وصل حقل الاسم يقرأ جداول رقعة الوصل، وهي غير موجودة في هذا الروم");
  }
  for (let i = 0; i < ORIGINAL.length; i++) {
    if (rom[EMERALD_FIELD_HOOK + i] !== ORIGINAL[i]) {
      throw new Error("الشيفرة التي ترسم حقل الاسم ليست التي قيست عليها الرقعة");
    }
  }
  const code = cave();
  for (let i = 0; i < code.length + 32; i++) {
    const b = rom[EMERALD_FIELD_CAVE + i];
    if (b !== 0x00 && b !== 0xff) {
      throw new Error("المساحة التي يحتاجها وصل حقل الاسم ليست فارغة");
    }
  }
  const out = new Uint8Array(rom);
  out.set(code, EMERALD_FIELD_CAVE);
  out.set(bytes(HOOK_B64), EMERALD_FIELD_HOOK);
  return out;
}
