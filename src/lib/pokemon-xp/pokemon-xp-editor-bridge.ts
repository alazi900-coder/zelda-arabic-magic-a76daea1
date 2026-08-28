/**
 * Pokémon Unbreakable Ties import design: inspect `english.dat` locally only.
 * It never evaluates Ruby, never writes the source file, and deliberately does
 * not expose a builder until a byte-for-byte-safe Marshal writer is verified.
 */
import type { ExtractedEntry } from "@/components/editor/types";
import {
  isRubyMarshalHash,
  isRubyMarshalUserData,
  parseRubyMarshal,
  type RubyMarshalValue,
} from "./ruby-marshal";

export const POKEMON_XP_SOURCE_GAME = "pokemon-xp";
export const POKEMON_XP_BUFFER_KEY = "pokemonXpEnglishDatBuffer";
export const POKEMON_XP_SOURCE_NAME_KEY = "pokemonXpEnglishDatSourceName";

export interface PokemonXpImportSummary {
  entries: number;
  sections: number;
  orderedTables: number;
}

export interface PokemonXpExtraction {
  entries: ExtractedEntry[];
  summary: PokemonXpImportSummary;
}

function valueLabel(value: RubyMarshalValue, fallback: string): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 90) || fallback;
  if (typeof value === "number") return String(value);
  return fallback;
}

function isText(value: string): boolean {
  return value.trim().length > 0 && value.length <= 100_000;
}

function decodeOrderedHash(value: RubyMarshalValue): Array<[RubyMarshalValue, RubyMarshalValue]> | null {
  if (!isRubyMarshalUserData(value) || value.className !== "OrderedHash") return null;
  const payload = parseRubyMarshal(value.bytes);
  if (!Array.isArray(payload) || payload.length !== 2 || !Array.isArray(payload[0]) || !Array.isArray(payload[1])) return null;
  const keys = payload[0];
  const values = payload[1];
  return keys.map((key, index) => [key, values[index] ?? null]);
}

/** Extracts message *values*, retaining stable table/path IDs for the editor. */
export function extractPokemonXpEntries(buffer: ArrayBuffer): PokemonXpExtraction {
  const root = parseRubyMarshal(buffer);
  if (!Array.isArray(root)) throw new Error("ملف اللغة لا يحتوي جدول رسائل Pokémon Essentials المتوقع.");

  const entries: ExtractedEntry[] = [];
  let orderedTables = 0;
  const seen = new Set<RubyMarshalValue>();

  const addText = (value: string, section: number, path: string[], label: string) => {
    if (!isText(value)) return;
    entries.push({
      msbtFile: `pokemon-xp/section-${section}`,
      index: entries.length,
      label: `قسم ${section} · ${label}`,
      original: value,
      // This importer is read/edit/export only. A generous display budget keeps
      // unrelated console limits from rejecting valid RPG Maker XP dialogue.
      maxBytes: 65_535,
    });
  };

  const visit = (value: RubyMarshalValue, section: number, path: string[], label: string, allowSeen = true): void => {
    if (typeof value === "string") {
      addText(value, section, path, label);
      return;
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) return;
    if (allowSeen) {
      if (seen.has(value)) return;
      seen.add(value);
    }
    const orderedPairs = decodeOrderedHash(value);
    if (orderedPairs) {
      orderedTables++;
      orderedPairs.forEach(([key, item], index) => visit(item, section, [...path, `ordered-${index}`], valueLabel(key, `رسالة ${index + 1}`)));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, section, [...path, String(index)], `${label} · ${index + 1}`));
      return;
    }
    if (isRubyMarshalHash(value)) {
      value.pairs.forEach(([key, item], index) => visit(item, section, [...path, `hash-${index}`], valueLabel(key, `رسالة ${index + 1}`)));
    }
  };

  root.forEach((section, index) => visit(section, index, [String(index)], `رسالة ${index + 1}`));
  if (!entries.length) throw new Error("قُرئ ملف اللغة لكن لم يُعثر على سلاسل نصية قابلة للتحرير.");
  return { entries, summary: { entries: entries.length, sections: root.length, orderedTables } };
}
