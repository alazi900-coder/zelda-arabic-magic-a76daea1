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
  findEmeraldFont,
} from "@/lib/gba/emerald-font";

export interface PkmCodec {
  /** For reporting, and for the editor to say which game it opened. */
  game: "ruby-destiny" | "emerald";
  name: string;
  /** Which byte draws which character in this game. */
  tables: PkmCharTables;
  /** The font's own bytes, so a relocated line is never written over them. */
  fontRegion(rom: Uint8Array): { start: number; length: number }[];
  /** Draws the Arabic glyphs into a copy of the ROM. */
  applyFont(rom: Uint8Array): Uint8Array;
  /** True when this ROM already carries them — it came out of a build. */
  hasFont(rom: Uint8Array): boolean;
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
  fontRegion: (rom) => {
    const font = findEmeraldFont(rom);
    if (!font) return [];
    return [
      { start: font.glyphs, length: EMERALD_GLYPH_COUNT * EMERALD_GLYPH_BYTES },
      { start: font.widths, length: EMERALD_GLYPH_COUNT },
    ];
  },
  applyFont: (rom) => applyEmeraldArabicFont(rom).rom,
  hasFont: hasEmeraldArabicFont,
};

export type PkmGame = PkmCodec["game"];

/** The two games, for a page that asks rather than guesses. */
export const PKM_CODECS: readonly PkmCodec[] = [EMERALD, RUBY_DESTINY];

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
  return PKM_CODECS.find((c) => c.game !== chosen.game && c.hasFont(rom)) ?? null;
}
