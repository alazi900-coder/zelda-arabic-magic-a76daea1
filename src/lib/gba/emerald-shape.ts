/**
 * Joining Arabic letters inside Pokémon Emerald, at the moment they are drawn.
 *
 * Everything else this tool writes is shaped before it is written: the build
 * knows the whole line, so it can pick the initial, medial, final or isolated
 * form of every letter. The name the player types is different — it is typed
 * after the build, one key at a time, and stored exactly as pressed. Nothing
 * on this side can shape it, so the game has to.
 *
 * The place to do it was found by disassembling the renderer. At 0x08005B90
 * the character about to be drawn is still in r3 and has not yet been turned
 * into a glyph, and the printer's pointer at [r6] is already past it — so both
 * the letter and the one after it are in hand. The cave replaces r3 with:
 *
 *     joinsBackward ? (joinsForward ? medial : final)
 *                   : (joinsForward ? initial : isolated)
 *
 * Two tables carry the alphabet. LETTER turns a byte into the offset of its
 * letter (0 for anything that is not one), and FORMS holds the four shapes of
 * each letter in a row. A letter reaches forward exactly when its initial form
 * differs from its isolated one, so there is no third table to keep in step.
 *
 * Both are built here from `arabicJoiningForms`, the same list the build-time
 * shaper uses, so the game cannot disagree with the tool about a letter.
 *
 * Three things this had to account for, all of them found by running it:
 *
 *   The hook cannot go through r3 the way the direction patch's does — r3 is
 *   the character. It goes through r0, which the next instruction overwrites
 *   anyway. Through r3, the game drew no text at all.
 *
 *   0xFC opens a formatting code and its arguments are plain bytes: a colour
 *   index of 2 is also the code of an Arabic letter, and the first letter of
 *   every coloured line would have joined backwards onto it. So before the
 *   byte in front of a letter is believed, the four places a formatting code
 *   could start are checked, and one is only accepted when its own declared
 *   length ends exactly where the letter begins.
 *
 *   The naming screen's keyboard draws each key as its own string, with the
 *   x-advance written between them — so a key's neighbour is never the next
 *   key, and the grid keeps showing the plain isolated shapes. Which is what a
 *   keyboard should show.
 *
 * And one rule that follows from all of it: only a letter still in its
 * isolated shape is shaped here. A letter that already carries a joined shape
 * was joined by something that knew more than this hook can see — the name
 * field, which draws each letter on its own and so leaves it here with no
 * neighbours at all. Without the rule, this hook read that lack of neighbours
 * as "isolated" and undid the field's work. It costs nothing elsewhere: the
 * text this tool writes is shaped already, and everywhere it holds an isolated
 * shape this hook would compute the same one.
 *
 * The neighbours only mean anything while the text is in logical order, so
 * this goes in together with the direction patch at every window — see
 * `emerald-rtl.ts`. Against text reversed at build time it would read the
 * neighbours the wrong way round.
 */

import { pkmFormatLength } from "@/lib/pokemon/pkm-charmap";
import { arabicJoiningForms } from "@/lib/risen/arabic-shaper";
import { emeraldCharTables } from "./emerald-arabic";

/** Where the displaced instructions live, and where the cave is written. */
export const EMERALD_SHAPE_HOOK = 0x005b90;
export const EMERALD_SHAPE_CAVE = 0xf00600;

/**
 * 152 bytes of THUMB and its literals. The three tables follow it, and the
 * literals already point at where they land.
 */
const CODE_B64 =
  "N7T/KzPYH03oXAAoL9AeTAAZBHicQirRACIxaAt461wAKwTQg3gEeKNCANACIkkeAiVMGyN4/CsI0WN4E0wYKwHY41wA4AMjq0IP0G0cBi3v0QxNSR4LeOtcACsG0ApMGxmceBt4nEIA0FIcg1w3vCBoAAcADwgoAdkFSQhHBUkIRwAAmAbwCJgH8Ag8CPAIEVwACJtbAAg=";

/** The hook: `ldr r0,[pc,#0]; bx r0` and the cave's address. */
const HOOK_B64 = "AEgARwEG8Ag=";

/** `ldr r0,[r4]; lsls r0,#28; lsrs r0,#28; cmp r0,#8` — what the hook covers. */
const ORIGINAL = [0x20, 0x68, 0x00, 0x07, 0x00, 0x0f, 0x08, 0x28];

/** Where the code ends and the alphabet table begins, inside the cave. */
export const EMERALD_SHAPE_TABLES = EMERALD_SHAPE_CAVE + 152;

/** How many bytes of the alphabet table, and of the four-shape table. */
const LETTER_SIZE = 256;
const FORMS_SIZE = 164;
/** Formatting codes 0x00..0x18, each with its total length. */
const FMT_SIZE = 0x19;

function bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The alphabet as the cave reads it.
 *
 * A ligature — لا and its three cousins — behaves like one letter that joins
 * only backwards, so it gets a row of its own with the initial equal to the
 * isolated. Tatweel has no code in this game and is skipped.
 */
function tables(): { letter: Uint8Array; forms: Uint8Array } {
  const byte = emeraldCharTables().arabicToByte;
  const { letters, ligatures } = arabicJoiningForms();
  const quads: number[][] = [];
  for (const [iso, fin, ini, med] of letters) {
    if (!byte.has(iso)) continue; // tatweel, which this game has no code for
    quads.push([iso, fin, ini ?? iso, med ?? fin]);
  }
  for (const [iso, fin] of ligatures) quads.push([iso, fin, iso, fin]);

  const letter = new Uint8Array(LETTER_SIZE);
  const forms = new Uint8Array(4 + 4 * quads.length); // row 0 means "not a letter"
  quads.forEach((quad, i) => {
    const off = 4 * (i + 1);
    quad.forEach((cp, f) => {
      const b = byte.get(cp);
      if (b === undefined) throw new Error(`لا توجد خانة للشكل ${cp.toString(16)}`);
      letter[b] = off;
      forms[off + f] = b;
    });
  });
  if (forms.length !== FORMS_SIZE) {
    throw new Error(`جدول الأشكال ${forms.length} بايت والمنتظر ${FORMS_SIZE}`);
  }
  return { letter, forms };
}

/** The whole cave: the code, then the three tables it reads. */
function cave(): Uint8Array {
  const code = bytes(CODE_B64);
  const { letter, forms } = tables();
  const fmt = Uint8Array.from({ length: FMT_SIZE }, (_, kind) => pkmFormatLength(kind));
  const out = new Uint8Array(code.length + letter.length + forms.length + fmt.length);
  out.set(code, 0);
  out.set(letter, code.length);
  out.set(forms, code.length + letter.length);
  out.set(fmt, code.length + letter.length + forms.length);
  return out;
}

/** True when this ROM already carries the patch. */
export function hasEmeraldShapePatch(rom: Uint8Array): boolean {
  const hook = bytes(HOOK_B64);
  for (let i = 0; i < hook.length; i++) {
    if (rom[EMERALD_SHAPE_HOOK + i] !== hook[i]) return false;
  }
  return true;
}

/**
 * Writes the patch into a copy of the ROM.
 *
 * It refuses rather than guess: the hook site has to still hold the five
 * instructions this was measured on, and the cave's space has to be empty.
 */
export function applyEmeraldShapePatch(rom: Uint8Array): Uint8Array {
  if (hasEmeraldShapePatch(rom)) return rom;
  for (let i = 0; i < ORIGINAL.length; i++) {
    if (rom[EMERALD_SHAPE_HOOK + i] !== ORIGINAL[i]) {
      throw new Error("موضع الخطّاف في هذا الروم ليس الذي قيست عليه رقعة الوصل");
    }
  }
  const code = cave();
  for (let i = 0; i < code.length + 32; i++) {
    const b = rom[EMERALD_SHAPE_CAVE + i];
    if (b !== 0x00 && b !== 0xff) {
      throw new Error("المساحة التي تحتاجها رقعة الوصل ليست فارغة");
    }
  }
  const out = new Uint8Array(rom);
  out.set(code, EMERALD_SHAPE_CAVE);
  out.set(bytes(HOOK_B64), EMERALD_SHAPE_HOOK);
  return out;
}
