/**
 * Making Pokémon Emerald lay its dialogue out right to left.
 *
 * Two ways exist to get Arabic reading correctly in a game that draws left to
 * right. The cheap one is to reverse the text when the ROM is built, so naive
 * drawing happens to come out right — that is what this tool does everywhere
 * else. It reads correctly but it is a trick: the line still starts at the
 * left edge of the box, and the bytes sitting in the ROM are backwards, so
 * anything that later reads them back sees nonsense.
 *
 * This is the other way. The engine itself is patched, and the text stays in
 * the order a person would write it.
 *
 * The engine's own bookkeeping is untouched — the pen advance, the line
 * breaks, the page waits, the `{FD:xx}` substitutions all run exactly as they
 * did. Only the x each glyph is drawn at is mirrored inside its window:
 *
 *     x' = windowWidthPx - currentX - glyphWidth
 *
 * so the first letter lands against the right edge and the line grows
 * leftward. The glyph drawings are not mirrored, so no letter comes out
 * backwards — which is the mistake the tilemap-flipping approach makes if you
 * forget to pre-flip the font.
 *
 * ADDRESSES, AND HOW EACH WAS FOUND
 *
 *   0x08005C12  the `bl CopyGlyphToWindow` inside RenderText. Found by
 *               disassembling around gCurGlyph, then proved by changing the
 *               pen advance four bytes later and watching the menu collapse
 *               into a single letter in an emulator.
 *   0x08004DA0  CopyGlyphToWindow, the call that instruction makes.
 *   0x02020004  gWindows[]: 12 bytes an entry, width in tiles at +3 and
 *               height at +4. Read out of CopyGlyphToWindow's own prologue,
 *               which computes id*12 and then `windowWidth*8 - currentX`.
 *   0x03003010  gCurGlyph.width — gCurGlyph is 0x03002F90 and the width sits
 *               at +0x80, where DecompressGlyph stores it.
 *   0x08F00000  free space. Not a guess either: the Portuguese translation of
 *               this same game puts its own 996-byte cave here.
 *
 * WHY THE HOOK IS TEN BYTES AND NOT FOUR
 *
 * A THUMB `bl` reaches ±4 MB and the cave is 15 MB away, so the hook cannot be
 * a call. It is `ldr r3,[pc,#4]; bx r3` over an address — the same shape the
 * Portuguese patch uses at 0x42E — which takes ten bytes and so displaces the
 * three instructions after the call. The cave re-runs those three before
 * returning, which is why it ends by rebuilding `r2` and `r0` and jumping to
 * 0x08005C1C rather than simply returning.
 *
 * HOW MUCH OF THE GAME IT TOUCHES
 *
 * Two caves, alike but for one test. `dialogue` mirrors only the message box,
 * which it recognises by size — 27 tiles wide and 4 tall, measured in the
 * emulator while Birch was talking, against the 26 every window the main menu
 * opens turns out to be. `all` drops that test and mirrors every window that
 * has a width at all.
 *
 * `dialogue` is the safe one and stays the default: a window it does not
 * recognise is drawn exactly as it always was, so menus, the name-entry
 * keyboard and the HUD cannot be affected by it. `all` was checked on the main
 * menu, the dialogue and the naming screen and is right on all three — the
 * keyboard there is left alone on purpose, see `CAVE_ALL_B64`. The bag and the
 * battle screens go through the same printer and will mirror too, and those
 * were not checked. Which is why the choice is the translator's.
 *
 * The assembly source these bytes came from lives in the session notes; the
 * bytes are kept here rather than an assembler in the browser, and the two
 * tests beside this file check the hook lands where it should and that the
 * cave only ever goes into free space.
 */

import {
  EMERALD_GLYPH_SIZE,
  findEmeraldFonts,
  readEmeraldGlyph,
  writeEmeraldGlyph,
} from "./emerald-font";

/** Where the displaced instructions live, and where the cave is written. */
export const EMERALD_RTL_HOOK = 0x005c12;
export const EMERALD_RTL_CAVE = 0xf00000;

/**
 * The cave: 92 bytes of THUMB, then four literals (gWindows, &gCurGlyph.width,
 * CopyGlyphToWindow|1, and the return address 0x08005C1C|1).
 */
const CAVE_B64 =
  "8LQERiF5ygCLANIYD0vSGNN4FXkbKw7RBC0M0dsAJXoLShJ4WxubGiNyIEYJTwDwDPglcgPgIEYGTwDwBvgyHCAyEHjwvARLGEc4RwQAAgIQMAADoU0ACB1cAAg=";

/**
 * The same, minus the window test: every window is mirrored — except the
 * naming screen's keyboard, which is a grid and not a line of text. Its cursor
 * is a sprite that counts columns from the left, so mirroring the letters
 * leaves it pointing at the wrong key. That window measured 19x8 in the
 * emulator and is the only one on the screen with those numbers.
 */
const CAVE_ALL_B64 =
  "8LQERiF5ygCLANIYEEvSGNN4FXkTKwHRCC0O0AArDNDbACV6C0oSeFsbmxojciBGCU8A8Az4JXID4CBGBk8A8Ab4MhwgMhB48LwESxhHOEcEAAICEDAAA6FNAAgdXAAI";

/** How much of the game the patch reverses. */
export type EmeraldRtlScope = "dialogue" | "all";

/** The hook: `ldr r3,[pc,#4]; bx r3` and the cave's address. Both caves share it. */
const HOOK_B64 = "AUsYRwAAAQDwCA==";

function bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** True when this ROM already carries the patch. */
export function hasEmeraldRtlPatch(rom: Uint8Array): boolean {
  const hook = bytes(HOOK_B64);
  for (let i = 0; i < hook.length; i++) {
    if (rom[EMERALD_RTL_HOOK + i] !== hook[i]) return false;
  }
  return true;
}


/**
 * The message prompt — the little arrow the game blinks at the end of a line —
 * and why it needs three more hooks.
 *
 * It never goes through `CopyGlyphToWindow`. It is blitted straight into the
 * window at the printer's own `currentX`, so while the line grows leftward
 * from the right edge the arrow stays where the line *would* have ended if it
 * had been drawn left to right — which lands it in the middle of the sentence,
 * on top of a letter. «creatures known as POKéMON.» came out with the arrow
 * over the `n` of `known`.
 *
 * Three places read that x, all of them an 8x16 rectangle at (currentX,
 * currentY), and all three are patched:
 *
 *   0x0800556C  the fill that clears the box before the arrow is drawn
 *   0x080055AC  the blit that draws it
 *   0x08005612  the fill that clears it once the player presses a button
 *
 * Mirroring only the drawing would leave the two fills scrubbing the wrong
 * box, and the arrow would stay on screen as a ghost over the next message.
 *
 * The cave applies the same window test as the direction cave, so the arrow
 * moves exactly where the text moves and nowhere else. Each hook goes through
 * a register the very next instruction overwrites: r2 at the two fills, r1 at
 * the blit.
 */
export const EMERALD_RTL_ARROW_CAVE = 0xf00b00;

/** The three sites, their entry offsets in the cave, and the ten bytes each is. */
const ARROW_SITES = [
  {
    at: 0x00556c,
    hook: "AEoQRwEL8Ag=",
    original: [0x2a, 0x7a, 0x6b, 0x7a, 0x08, 0x24, 0x00, 0x94, 0x10, 0x24],
  },
  {
    at: 0x0055ac,
    hook: "AEkIRyEL8Ag=",
    original: [0x29, 0x7a, 0x02, 0x91, 0x69, 0x7a, 0x03, 0x91, 0x04, 0x94],
  },
  {
    at: 0x005612,
    hook: "AUoQRwAAQQvwCA==",
    original: [0x2a, 0x7a, 0x6b, 0x7a, 0x08, 0x24, 0x00, 0x94, 0x10, 0x24],
  },
] as const;

/** 164 bytes: three entries of 32, then the shared mirror and its literals. */
const ARROW_CAVE_B64 =
  "A7QoRgDwLPiERgO8YkZreggkAJQQJAG0H0iERgG8YEcNtChGAPAc+IRGDbxhRgKRaXoDkQSUAbQYSIRGAbxgRwO0KEYA8Az4hEYDvGJGa3oIJACUECQBtBFIhEYBvGBHDrQBecoAiwDSGApL0hjTeBF5GysL0QQpCdECetsAmxoIOwArANoAIxhGDrxwRwB6DrxwRwQAAgJ3VQAIt1UACB1WAAg=";

/** The same, with the all-windows test. Four bytes longer, same entry offsets. */
const ARROW_CAVE_ALL_B64 =
  "A7QoRgDwLPiERgO8YkZreggkAJQQJAG0IEiERgG8YEcNtChGAPAc+IRGDbxhRgKRaXoDkQSUAbQZSIRGAbxgRwO0KEYA8Az4hEYDvGJGa3oIJACUECQBtBJIhEYBvGBHDrQBecoAiwDSGAtL0hjTeBF5EysB0QgpC9AAKwnQAnrbAJsaCDsAKwDaACMYRg68cEcAeg68cEcEAAICd1UACLdVAAgdVgAI";


/**
 * The menu cursor, and the ghosts it left behind.
 *
 * `Menu_MoveCursor` at 0x08198448 erases the old cursor with a rectangle fill
 * and then redraws it on the new row through the text printer. The redraw goes
 * through the cave above and lands mirrored; the erase does not, so it scrubs
 * an empty column on the other side and the old arrow stays. Pressing down
 * three times left three arrows on screen.
 *
 * The site was measured, not read: a cave at `FillWindowPixelRect` recording
 * the caller of every fill narrower than 17 pixels, then one press of DOWN on
 * the boy/girl menu. It gave 0x0819849F — the return address of the call at
 * 0x0819849A — and that is the only one. It serves the classic menus: yes/no,
 * boy/girl, the START menu, the multichoice boxes.
 *
 * The hook covers ten bytes from 0x08198496 and goes through r0, which the
 * next instruction overwrites. r6 is the scratch: the function saves it and
 * does not touch it again until 0x081984A8.
 *
 * Only the all-windows patch carries this, and the flipped arrow below. Under
 * `dialogue` the menus are not mirrored at all, so there is nothing to move.
 *
 * NOT covered: the bag and the party use `ListMenu`, which has a cursor of its
 * own. That was not measured and is not patched here.
 */
export const EMERALD_RTL_MENU_CAVE = 0xf00d00;
const MENU_HOOK = 0x198496;
const MENU_CAVE_B64 =
  "SEbBAIYAiRkNTokZzngIeRMuAdEIKAnQAC4H0PYAthoAmXYaAC4A2gAmMkZIRhEhBE4A8AP4aHkDTjBHMEcAAAQAAgJlOwAIoYQZCA==";
const MENU_HOOK_B64 = "AUgARwAAAQ3wCA==";
const MENU_ORIGINAL = [0x48, 0x46, 0x11, 0x21, 0x6b, 0xf6, 0x63, 0xfb, 0x68, 0x79];

/**
 * The cursor is one character — the string at 0x085EE498 is just `EF FF` — and
 * 0xEF is a solid triangle pointing right. In a right-to-left menu it sits to
 * the right of the word and points away from it, so the glyph is mirrored
 * inside its own advance width, in every font this ROM carries. No code
 * changes: the game keeps printing the same character.
 */
const MENU_CURSOR_CODE = 0xef;

function flipMenuCursor(rom: Uint8Array): void {
  for (const font of findEmeraldFonts(rom)) {
    const width = rom[font.widths + MENU_CURSOR_CODE];
    if (width === 0 || width > EMERALD_GLYPH_SIZE) continue;
    const px = readEmeraldGlyph(rom, font, MENU_CURSOR_CODE);
    const out = new Uint8Array(px);
    for (let y = 0; y < EMERALD_GLYPH_SIZE; y++) {
      for (let x = 0; x < width; x++) {
        out[y * EMERALD_GLYPH_SIZE + x] = px[y * EMERALD_GLYPH_SIZE + (width - 1 - x)];
      }
    }
    writeEmeraldGlyph(rom, font, MENU_CURSOR_CODE, out);
  }
}

/**
 * Writes the patch into a copy of the ROM.
 *
 * It refuses rather than guess. The hook site has to still hold the call this
 * was written against, and the cave's space has to still be empty — a ROM
 * where either has changed is one this patch was not measured on, and writing
 * into it would break the game somewhere far from here.
 */
export function applyEmeraldRtlPatch(
  rom: Uint8Array,
  scope: EmeraldRtlScope = "dialogue"
): Uint8Array {
  const cave = bytes(scope === "all" ? CAVE_ALL_B64 : CAVE_B64);
  const hook = bytes(HOOK_B64);
  if (hasEmeraldRtlPatch(rom)) return new Uint8Array(rom);

  // `bl 0x08004DA0` as it stands at 0x08005C12 in the shipped game.
  const expected = [0xff, 0xf7, 0xc5, 0xf8];
  for (let i = 0; i < expected.length; i++) {
    if (rom[EMERALD_RTL_HOOK + i] !== expected[i]) {
      throw new Error("موضع الخطّاف ليس كما في اللعبة الأصلية — لا أكتب في روم لم أقِسه");
    }
  }
  for (let i = 0; i < cave.length + 32; i++) {
    const b = rom[EMERALD_RTL_CAVE + i];
    if (b !== 0x00 && b !== 0xff) {
      throw new Error(`المساحة عند 0x${EMERALD_RTL_CAVE.toString(16).toUpperCase()} ليست فارغة`);
    }
  }

  // The prompt arrow is blitted straight into the window and never reaches the
  // hook above, so it needs its own three — see EMERALD_RTL_ARROW_CAVE.
  const arrow = bytes(scope === "all" ? ARROW_CAVE_ALL_B64 : ARROW_CAVE_B64);
  for (const site of ARROW_SITES) {
    for (let i = 0; i < site.original.length; i++) {
      if (rom[site.at + i] !== site.original[i]) {
        throw new Error("موضع سهم الرسالة ليس كما في اللعبة الأصلية — لا أكتب في روم لم أقِسه");
      }
    }
  }
  for (let i = 0; i < arrow.length + 32; i++) {
    const b = rom[EMERALD_RTL_ARROW_CAVE + i];
    if (b !== 0x00 && b !== 0xff) {
      throw new Error(`المساحة عند 0x${EMERALD_RTL_ARROW_CAVE.toString(16).toUpperCase()} ليست فارغة`);
    }
  }

  // The menu cursor is only a problem where menus are mirrored at all.
  const menu = bytes(MENU_CAVE_B64);
  if (scope === "all") {
    for (let i = 0; i < MENU_ORIGINAL.length; i++) {
      if (rom[MENU_HOOK + i] !== MENU_ORIGINAL[i]) {
        throw new Error("موضع مؤشّر القوائم ليس كما في اللعبة الأصلية — لا أكتب في روم لم أقِسه");
      }
    }
    for (let i = 0; i < menu.length + 32; i++) {
      const b = rom[EMERALD_RTL_MENU_CAVE + i];
      if (b !== 0x00 && b !== 0xff) {
        throw new Error(`المساحة عند 0x${EMERALD_RTL_MENU_CAVE.toString(16).toUpperCase()} ليست فارغة`);
      }
    }
  }

  const out = new Uint8Array(rom);
  out.set(cave, EMERALD_RTL_CAVE);
  out.set(hook, EMERALD_RTL_HOOK);
  out.set(arrow, EMERALD_RTL_ARROW_CAVE);
  for (const site of ARROW_SITES) out.set(bytes(site.hook), site.at);
  if (scope === "all") {
    out.set(menu, EMERALD_RTL_MENU_CAVE);
    out.set(bytes(MENU_HOOK_B64), MENU_HOOK);
    flipMenuCursor(out);
  }
  return out;
}
