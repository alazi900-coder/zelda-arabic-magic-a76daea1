/**
 * Reader/rebuilder for Mother 3's flat, unobfuscated, fixed-stride text
 * tables (item names, status names, PSI power names confirmed; other tables
 * from the same toolkit — menus, PSI/item/skill descriptions — use a
 * different, variable-length pointer-table format, not this one).
 *
 * Structure (item names, byte-for-byte verified against itemnames.txt — 256/256
 * match, 0 mismatches):
 *   - Region [0x1F8C400, 0x1F8F004) — bounds come from consecutive `org`
 *     addresses in the fan translation's m3hack.asm (each table is
 *     `incbin`'d at a fixed ROM address with the next table immediately
 *     following, no gap), not a runtime table-of-tables.
 *   - 4 bytes of header (unidentified, not entry text) at the region start.
 *   - Then 256 FIXED 44-byte slots, one per item, packed with zero slack
 *     (256 * 44 + 4 == the whole region). 44 bytes = 21 chars * 2 bytes/char
 *     (16-bit code, unobfuscated) + a 2-byte 0xFFFF terminator — matching the
 *     toolkit's own itemnames.txt comment: "Item names must be 21 letters or
 *     less". A name shorter than 21 chars just leaves the rest of its own
 *     44-byte slot as 0xFF padding after the terminator.
 *
 * Because every entry owns a fixed, independent slot, a rebuild only ever
 * overwrites that one entry's own bytes — it never shifts any other entry,
 * so whatever addressing the game itself uses (fixed-stride index, as the
 * layout implies) keeps working after an edit.
 */

import { decodeNamesString, encodeNamesString, NAMES_END_CODE } from "./m3-names-codec";

export interface NamesTableSpec {
  /** Stable id used as the entry's msbtFile-equivalent key prefix. */
  id: string;
  /** Human label for the editor UI. */
  label: string;
  /** File offset where the table (header + slots) starts. */
  start: number;
  /** File offset one past the table's end. */
  end: number;
  /** File offset of slot 0 (start + header length). */
  dataStart: number;
  /** Fixed byte size of one entry's slot (codes + 0xFFFF terminator + any
   *  trailing padding within that same slot). */
  stride: number;
  /** Fixed number of entries/slots. */
  count: number;
}

/** Verified table: item names — see the module doc comment above. */
export const ITEMNAMES_TABLE: NamesTableSpec = {
  id: "names_itemnames",
  label: "أسماء الأغراض",
  start: 0x01f8c400,
  end: 0x01f8f004,
  dataStart: 0x01f8c404,
  stride: 44,
  count: 256,
};

/** Verified table: status ailment names (Poison, Numb, Sleep, ...), 32-byte
 *  slots (15 chars max) — 0 mismatches across all 52 real entries. Region has
 *  zero slack, same as item names. */
export const STATUSES_TABLE: NamesTableSpec = {
  id: "names_statuses",
  label: "أسماء الحالات",
  start: 0x01d06cca,
  end: 0x01d0734e,
  dataStart: 0x01d06cce,
  stride: 32,
  count: 52,
};

/** Verified table: PSI power names (PK Fire α/β/γ/Ω, ...), 40-byte slots
 *  (19 chars max) — 0 mismatches across all 99 real entries. Region has
 *  generous unused space after the 99 documented entries (reserved debug
 *  slots), safely left untouched since each entry owns its own fixed slot. */
export const PSINAMES_TABLE: NamesTableSpec = {
  id: "names_psinames",
  label: "أسماء قوى PSI",
  start: 0x00d29050,
  end: 0x00d2c708,
  dataStart: 0x00d29054,
  stride: 40,
  count: 99,
};

export const NAMES_TABLES: NamesTableSpec[] = [ITEMNAMES_TABLE, STATUSES_TABLE, PSINAMES_TABLE];

export interface NamesEntry {
  index: number;
  /** file offset of this entry's slot (== spec.dataStart + index * spec.stride) */
  offset: number;
  text: string;
}

/**
 * Read all `spec.count` fixed-stride entries. Each slot is independent (fixed
 * offset, not discovered by scanning), so a single undecodable slot (e.g. one
 * that already holds Arabic-encoded bytes because the built ROM was reopened
 * instead of the clean source) is skipped rather than aborting the whole
 * table — otherwise one bad slot would silently hide every entry after it.
 */
export function parseNamesTable(rom: Uint8Array, spec: NamesTableSpec): NamesEntry[] {
  const entries: NamesEntry[] = [];
  for (let index = 0; index < spec.count; index++) {
    const offset = spec.dataStart + index * spec.stride;
    const limit = Math.min(offset + spec.stride, spec.end);
    const res = decodeNamesString(rom, offset, limit);
    if (!res) continue; // malformed/foreign-encoded slot — skip, keep reading the rest
    entries.push({ index, offset, text: res.text });
  }
  return entries;
}

export interface NamesSkippedDetail {
  index: number;
  reason: string;
}

export interface NamesRebuildResult {
  bytes: Uint8Array; // length === spec.end - spec.start
  start: number;
  /** entries skipped (kept original) due to encoding/length issues in force mode */
  skippedEncoding?: number;
  /** per-entry detail for the skipped items above */
  skippedDetails?: NamesSkippedDetail[];
}
export interface NamesRebuildError {
  error: string;
  overflowBy?: number;
}

/**
 * Rewrite a table's entries after edits. `editedText` maps entry index to new
 * text; unspecified entries keep their original text. Each entry is
 * re-encoded and written into its OWN fixed slot only — other entries' bytes
 * (and the header) are copied through unchanged. Fails (without mutating the
 * ROM) if any single entry's new text doesn't fit its slot (codes + 2-byte
 * terminator > stride, i.e. longer than 21 characters).
 */
export function rebuildNamesTable(
  rom: Uint8Array,
  spec: NamesTableSpec,
  entries: NamesEntry[],
  editedText: Map<number, string>,
  opts: { lossy?: boolean } = {}
): NamesRebuildResult | NamesRebuildError {
  const regionSize = spec.end - spec.start;
  const out = new Uint8Array(rom.subarray(spec.start, spec.end)); // start from the original bytes

  const tooLong: number[] = [];
  let skippedEncoding = 0;
  for (const entry of entries) {
    if (!editedText.has(entry.index)) continue;
    const txt = editedText.get(entry.index)!;
    let codes: number[];
    try {
      codes = encodeNamesString(txt, false);
    } catch (e) {
      if (opts.lossy) {
        // force mode: keep original bytes for this entry (don't drop chars)
        skippedEncoding++;
        continue;
      }
      return { error: `عنصر ${entry.index}: ${(e as Error).message}` };
    }
    const neededBytes = codes.length * 2 + 2; // + terminator
    if (neededBytes > spec.stride) {
      if (opts.lossy) {
        // force mode: keep original (don't truncate — user asked to not delete)
        skippedEncoding++;
        continue;
      }
      tooLong.push(entry.index);
      continue;
    }
    const slotStart = entry.offset - spec.start;
    out.fill(0xff, slotStart, slotStart + spec.stride);
    let cursor = slotStart;
    for (const code of codes) {
      out[cursor] = code & 0xff;
      out[cursor + 1] = (code >>> 8) & 0xff;
      cursor += 2;
    }
    out[cursor] = NAMES_END_CODE & 0xff;
    out[cursor + 1] = (NAMES_END_CODE >>> 8) & 0xff;
  }

  if (tooLong.length > 0) {
    const maxChars = (spec.stride - 2) / 2;
    return {
      error: `${tooLong.length} عنصر في جدول ${spec.label} أطول من الحد المسموح (${maxChars} حرفاً) — قصّر النص`,
      overflowBy: tooLong.length,
    };
  }

  return { bytes: out, start: spec.start, skippedEncoding };
}

/** Apply a rebuilt table into a copy of the ROM and return the new ROM bytes. */
export function applyNamesRebuild(rom: Uint8Array, result: NamesRebuildResult): Uint8Array {
  const copy = new Uint8Array(rom);
  copy.set(result.bytes, result.start);
  return copy;
}
