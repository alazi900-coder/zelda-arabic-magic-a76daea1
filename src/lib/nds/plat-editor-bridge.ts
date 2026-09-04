/**
 * Bridge between a Pokémon Platinum ROM and the shared translation editor.
 *
 * Unlike the Gen 3 games, nothing here is bounded by where a line sits: the
 * message archive is rebuilt from scratch and put back into the ROM's trailing
 * padding, so a translation is free to be longer than the English it replaces.
 *
 * What does bound it is the buffer the game copies a message into.
 * String_CopyNumChars asserts when a message is longer than its destination,
 * and those destinations are fixed sizes scattered across the code. Rather
 * than guess at them, each archive's limit is taken to be the longest original
 * message *in that archive* -- one archive is read by one code path into one
 * buffer, and that buffer demonstrably holds its own longest line. It is an
 * observed bound rather than an assumed one, and it is why a list of species
 * names allows ten characters while a dialogue archive allows hundreds.
 *
 * The editor holds normal logical Arabic. Shaping into the presentation forms
 * the font actually carries happens here, at build time, as in the other games
 * -- though this engine reshapes at draw time too, so what is written is only
 * a starting point it is free to correct.
 */

import type { ExtractedEntry } from "@/components/editor/types";
import { reshapeArabic } from "@/lib/arabic-processing";
import { findNdsFile, writeNdsFile, type NdsFile } from "./nds-rom";
import { parseNarc, buildNarc } from "./narc";
import { decodePlatArchive, encodePlatArchive } from "./plat-msg";
import {
  decodePlatMessage,
  encodePlatMessage,
  isPackedMessage,
  platArchiveName,
  PlatEncodeError,
} from "./plat-charmap";

export const PLAT_BUFFER_KEY = "platinumSourceBuffer";
export const PLAT_SOURCE_GAME = "pokeplatinum";
export const PLAT_FILE_PREFIX = "platinum/";
export const PLAT_NARC_PATH = "msgdata/pl_msg.narc";
export const PLAT_FILE_RE = /^platinum\//;

export function looksLikePlatRom(rom: Uint8Array): boolean {
  return findNdsFile(rom, PLAT_NARC_PATH) !== null;
}

function preview(text: string): string {
  const t = text.replace(/[\n\r\f]/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

/**
 * Charcodes a line costs, which is the unit the game's buffers are measured in.
 *
 * A `{TAG …}` is not its own length in characters: it encodes to the format
 * marker, the command, an argument count and the arguments, and a string
 * variable spends its first number on the command rather than as an argument.
 */
export function measurePlatChars(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") {
      n++;
      continue;
    }
    const close = text.indexOf("}", i);
    if (close < 0) {
      n++;
      continue;
    }
    const body = text.slice(i + 1, close).trim();
    const space = body.indexOf(" ");
    const numbers = space < 0 ? 0 : body.slice(space + 1).split(",").length;
    n += 3 + (body.startsWith("STRVAR_") ? Math.max(0, numbers - 1) : numbers);
    i = close;
  }
  return n;
}

export interface PlatExtractResult {
  entries: ExtractedEntry[];
  /** Messages left out because they use the packed trainer-name encoding. */
  packed: number;
  archives: number;
}

function readArchives(rom: Uint8Array): { file: NdsFile; archives: ReturnType<typeof decodePlatArchive>[] } {
  const file = findNdsFile(rom, PLAT_NARC_PATH);
  if (!file) throw new Error("لم يُعثر على أرشيف النصوص داخل الروم — هل هذا روم Pokémon Platinum؟");
  const narc = parseNarc(rom.subarray(file.start, file.end));
  return { file, archives: narc.files.map(decodePlatArchive) };
}

export function extractPlatEntries(rom: Uint8Array): PlatExtractResult {
  const { archives } = readArchives(rom);
  const entries: ExtractedEntry[] = [];
  let packed = 0;

  archives.forEach((archive, index) => {
    const texts = archive.messages.map((codes) =>
      isPackedMessage(codes) ? null : decodePlatMessage(codes)
    );
    const limit = archive.messages.reduce(
      (n, codes, i) => (texts[i] === null ? n : Math.max(n, codes.length)),
      0
    );
    const file = PLAT_FILE_PREFIX + platArchiveName(index);
    texts.forEach((text, i) => {
      if (text === null) {
        packed++;
        return;
      }
      if (text === "") return; // an empty slot has nothing to translate
      entries.push({
        msbtFile: file,
        index: i,
        label: preview(text),
        original: text,
        maxBytes: limit,
      });
    });
  });

  return { entries, packed, archives: archives.length };
}

/**
 * Carries saved translations onto a freshly read set of entries.
 *
 * A line's identity is its archive and its position in it, and neither moves
 * between reads of the same ROM, so the key matches directly. Kept as its own
 * function so re-opening a ROM never silently drops work.
 */
export function restorePlatTranslations(
  entries: ExtractedEntry[],
  saved: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) {
    const key = `${e.msbtFile}:${e.index}`;
    if (saved[key] !== undefined) out[key] = saved[key];
  }
  return out;
}

export interface PlatBuildResult {
  rom: Uint8Array;
  translatedLines: number;
  /** Lines refused because a `{TAG}` the game fills in went missing. */
  brokenTags: string[];
  /** Lines refused because they exceed what their archive's buffer holds. */
  tooLong: string[];
  /** Characters with no slot in the font, named once each. */
  unmapped: string[];
}

const TAG_RE = /\{[^}]*\}/g;

function tagsOf(text: string): string[] {
  return (text.match(TAG_RE) || []).map((t) => t.replace(/\s+/g, " ").trim());
}

export function buildPlatRom(
  rom: Uint8Array,
  translations: Record<string, string>
): PlatBuildResult {
  const file = findNdsFile(rom, PLAT_NARC_PATH);
  if (!file) throw new Error("لم يُعثر على أرشيف النصوص داخل الروم");
  const narc = parseNarc(rom.subarray(file.start, file.end));
  const archives = narc.files.map(decodePlatArchive);

  const brokenTags: string[] = [];
  const tooLong: string[] = [];
  const unmapped = new Set<string>();
  let translatedLines = 0;

  archives.forEach((archive, index) => {
    const name = platArchiveName(index);
    const prefix = PLAT_FILE_PREFIX + name;
    const originals = archive.messages.map((codes) =>
      isPackedMessage(codes) ? null : decodePlatMessage(codes)
    );
    const limit = archive.messages.reduce(
      (n, codes, i) => (originals[i] === null ? n : Math.max(n, codes.length)),
      0
    );

    archive.messages.forEach((codes, i) => {
      const original = originals[i];
      if (original === null) return; // packed trainer names pass through
      const translation = translations[`${prefix}:${i}`];
      if (!translation || !translation.trim()) return;

      // A tag is where the game drops a name or a number at runtime. One that
      // goes missing leaves a blank in the sentence with nothing on screen to
      // explain it, so the line is refused rather than written half-right.
      const want = tagsOf(original).sort();
      const got = tagsOf(translation).sort();
      if (want.length !== got.length || want.some((t, k) => t !== got[k])) {
        brokenTags.push(`${name}:${i}`);
        return;
      }

      let encoded: number[];
      try {
        encoded = encodePlatMessage(reshapeArabic(translation));
      } catch (err) {
        if (err instanceof PlatEncodeError) {
          const ch = /«(.+)»/.exec(err.message)?.[1];
          if (ch) unmapped.add(ch);
          else brokenTags.push(`${name}:${i}`);
          return;
        }
        throw err;
      }

      if (encoded.length > limit) {
        tooLong.push(`${name}:${i}`);
        return;
      }

      archive.messages[i] = encoded;
      translatedLines++;
    });
  });

  narc.files = archives.map(encodePlatArchive);
  return {
    rom: writeNdsFile(rom, file, buildNarc(narc)),
    translatedLines,
    brokenTags,
    tooLong,
    unmapped: [...unmapped],
  };
}
