/**
 * Which Gen 3 game this ROM is, and the few things that differ because of it.
 *
 * Ruby Destiny and Emerald are the same engine. Measured on Emerald with the
 * machinery written for Ruby Destiny and not one line changed: 95,484 pointers,
 * 18,828 lines, 59% of them reachable through a pointer, 1.76 MB of free space
 * — and the dialogue came out readable on the first run. The pointer rules, the
 * scanner, the fixed-stride lists, the free-space allocator and the engine's
 * own codes are shared because they really are the same.
 *
 * Three things are not, and they are all this file holds: which codes Arabic
 * may take, where the font is, and how a glyph is stored there. Ruby Destiny
 * keeps its Arabic in the kana codes and its font at a fixed address; Emerald
 * has no kana to spare and moves its font when a hack rebuilds it.
 *
 * The game is told apart by the cartridge header, which every GBA ROM carries
 * at 0xA0. Emerald is the special case and Ruby Destiny the default, so nothing
 * that works today changes.
 */

import { pkmCharTables, type PkmCharTables } from "./pkm-charmap";
import { PKM_FONT_OFFSET, PKM_GLYPH_BYTES, applyPkmArabicFont, hasPkmArabicFont } from "./pkm-font";
import {
  applyEmeraldArabicFont,
  emeraldCharTables,
  hasEmeraldArabicFont,
} from "@/lib/gba/emerald-arabic";
import {
  EMERALD_GLYPH_BYTES,
  EMERALD_GLYPH_COUNT,
  findEmeraldFonts,
} from "@/lib/gba/emerald-font";
import {
  emeraldSourceCharTables,
  isEmeraldSourceRom,
  readEmeraldSourceReference,
} from "@/lib/gba/emerald-source-arabic";

export interface PkmCodec {
  /** For reporting, and for the editor to say which game it opened. */
  game: "ruby-destiny" | "emerald" | "emerald-source";
  name: string;
  /** Which byte draws which character in this game. */
  tables: PkmCharTables;
  /** The font's own bytes, so a relocated line is never written over them. */
  fontRegion(rom: Uint8Array): { start: number; length: number }[];
  /** Draws the Arabic glyphs into a copy of the ROM. */
  applyFont(rom: Uint8Array): Uint8Array;
  /** True when this ROM already carries them — it came out of a build. */
  hasFont(rom: Uint8Array): boolean;
  /**
   * True when a ROM already carrying Arabic is the right file to open.
   *
   * For the patched games it never is: their scanner reads text by the English
   * character set, Arabic is invisible to it, and opening one drops every
   * translated line. The source build is the opposite case — its Arabic is in
   * the tables above, so the scanner reads it, and it is the only file there
   * is to open.
   */
  readsOwnArabic?: boolean;
  /** No glyphs to inject: the build compiled the font in. */
  skipFontInjection?: boolean;
  /** This engine mirrors as it draws, so a line is stored in reading order. */
  noReverse?: boolean;
}

/** Where the cartridge header keeps the game's name. */
const HEADER_TITLE = 0xa0;
const HEADER_TITLE_LENGTH = 12;

/** The twelve characters at 0xA0 — «POKEMON EMER» in this game's case. */
export function pkmRomTitle(rom: Uint8Array): string {
  let out = "";
  for (let i = 0; i < HEADER_TITLE_LENGTH; i++) {
    const b = rom[HEADER_TITLE + i];
    if (b === undefined || b < 0x20 || b > 0x7e) break;
    out += String.fromCharCode(b);
  }
  return out.trim();
}

const RUBY_DESTINY: PkmCodec = {
  game: "ruby-destiny",
  name: "Pokémon Ruby Destiny",
  tables: pkmCharTables(),
  fontRegion: () => [{ start: PKM_FONT_OFFSET, length: 0x83 * PKM_GLYPH_BYTES }],
  applyFont: applyPkmArabicFont,
  hasFont: hasPkmArabicFont,
};

const EMERALD: PkmCodec = {
  game: "emerald",
  name: "Pokémon Emerald",
  tables: emeraldCharTables(),
  // Every font, not the first: this game has several and Arabic goes into all
  // of them, so a relocated line must stay clear of all of them.
  fontRegion: (rom) =>
    findEmeraldFonts(rom).flatMap((font) => [
      { start: font.glyphs, length: EMERALD_GLYPH_COUNT * EMERALD_GLYPH_BYTES },
      { start: font.widths, length: EMERALD_GLYPH_COUNT },
    ]),
  applyFont: (rom) => applyEmeraldArabicFont(rom).rom,
  hasFont: hasEmeraldArabicFont,
};

/**
 * The build made from the pokeemerald source.
 *
 * Nothing is injected into it and nothing is reversed: it carries its own font
 * and mirrors its own drawing. The region kept clear of relocated lines is the
 * table of English originals the build wrote into its padding, not a font.
 */
const EMERALD_SOURCE: PkmCodec = {
  game: "emerald-source",
  name: "Pokémon Emerald (بناء من الكود المصدري)",
  tables: emeraldSourceCharTables(),
  fontRegion: (rom) => {
    const ref = readEmeraldSourceReference(rom);
    return ref ? [ref.region] : [];
  },
  applyFont: (rom) => rom,
  hasFont: isEmeraldSourceRom,
  readsOwnArabic: true,
  skipFontInjection: true,
  noReverse: true,
};

export type PkmGame = PkmCodec["game"];

/** The games, for a page that asks rather than guesses. */
export const PKM_CODECS: readonly PkmCodec[] = [EMERALD_SOURCE, EMERALD, RUBY_DESTINY];

/** The codec for a game the translator named. */
export function pkmCodecByGame(game: PkmGame): PkmCodec {
  const found = PKM_CODECS.find((c) => c.game === game);
  if (!found) throw new Error(`لا أعرف لعبةً باسم ${game}`);
  return found;
}

/**
 * The codec this ROM needs, read from its header.
 *
 * Kept for the ROM that arrives without anyone saying which game it is. It is
 * a guess, though — a hack or a trimmed dump can carry any header — and a
 * wrong guess writes the text in one game's codes under the other game's font,
 * which puts real Arabic letters on screen in the wrong order and looks like
 * the font is broken. So the page asks, and this is only the fallback.
 */
export function pkmCodecFor(rom: Uint8Array): PkmCodec {
  // The source build is the one case the header cannot tell apart from retail
  // Emerald, and the one case that can be recognised for certain: it carries
  // the table of English originals its own build wrote.
  if (isEmeraldSourceRom(rom)) return EMERALD_SOURCE;
  return pkmRomTitle(rom).startsWith("POKEMON EMER") ? EMERALD : RUBY_DESTINY;
}

/**
 * The other game's Arabic font, if this ROM is carrying it.
 *
 * This is the one mistake that cannot be seen until the game runs: the letters
 * appear, they are Arabic, and every one of them is wrong. Naming it before a
 * byte is written costs nothing and saves a build.
 */
export function pkmForeignFont(rom: Uint8Array, chosen: PkmCodec): PkmCodec | null {
  if (chosen.readsOwnArabic) return null;
  return PKM_CODECS.find((c) => c.game !== chosen.game && !c.readsOwnArabic && c.hasFont(rom)) ?? null;
}
