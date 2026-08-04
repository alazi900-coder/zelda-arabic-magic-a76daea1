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

  const out = new Uint8Array(rom);
  out.set(cave, EMERALD_RTL_CAVE);
  out.set(hook, EMERALD_RTL_HOOK);
  return out;
}
