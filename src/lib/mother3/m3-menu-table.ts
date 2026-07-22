/**
 * Reader/rebuilder for Mother 3's variable-length "menu" text tables (menus1
 * and menus2 confirmed; further tables not yet located).
 *
 * Unlike the fixed-stride name tables (m3-names-table.ts), these use a real
 * pointer table — the exact same shape as the main dialogue script's bank
 * format (m3-script.ts): a uint16 pointer per entry, terminated by 0xFFFF,
 * where entry n's data starts at (addrOfFFFF + pointer[n]). The only
 * difference from the dialogue script is the character codec: menu text is
 * NOT obfuscated (plain u16 codes via m3-names-codec, not the dialogue's
 * per-byte XOR scheme).
 *
 * Verified against menus1.txt: 272/288 entries decode and match exactly.
 * The remaining 16 are the in-game character-naming screen's on-screen
 * keyboard rows (literal symbol grids like "KLMNOklmno*~"@[bullet]") — not
 * meaningful translation targets, and use a handful of decorative glyph
 * codes not worth mapping. Those entries simply don't appear in
 * `parseMenuTable`'s output (decode returns null → skipped), and
 * `rebuildMenuTable` preserves their original bytes verbatim since it only
 * ever re-encodes entries actually present in `editedText`.
 *
 * menus2 sits immediately after menus1 with no gap (same "next table starts
 * where the previous one ends" layout as the name tables) and was confirmed
 * by decoding all 43 entries against a real ROM: real player-facing UI text
 * (Yes/No/Goods/Equip/PSI/Status/Sleep/Lucky/Violet...) mixed with internal
 * debug-menu strings never shown to the player (Collision Detect/OBJ Data
 * ID/Gamma Correction/Encounter BGM...). Both kinds decode/rebuild the same
 * way — translating the debug-only entries is harmless, just unnecessary.
 */

import { decodeNamesString, encodeNamesString, NAMES_END_CODE } from "./m3-names-codec";

export interface MenuTableSpec {
  id: string;
  label: string;
  /** File offset where the pointer table starts. */
  start: number;
  /** File offset one past the table's data region (next table's start). */
  end: number;
}

/** Verified table: main menu + naming-screen text — see module doc comment. */
export const MENUS1_TABLE: MenuTableSpec = {
  id: "menu_menus1",
  label: "القائمة الرئيسية",
  start: 0x00d057d8,
  end: 0x00d07ee8,
};

/** Verified table: mixed player-facing UI + internal debug-menu strings —
 *  see module doc comment. Sits directly after menus1 with no gap. */
export const MENUS2_TABLE: MenuTableSpec = {
  id: "menu_menus2",
  label: "قوائم إضافية",
  start: 0x00d07ee8,
  end: 0x00d082c4,
};

export const MENU_TABLES: MenuTableSpec[] = [MENUS1_TABLE, MENUS2_TABLE];

export interface MenuEntry {
  index: number;
  pointer: number;
  /** file offset where this entry's code data begins */
  offset: number;
  /** decoded text, or null if some code in this entry has no known mapping
   *  (not user-editable — rebuild preserves its original bytes verbatim). */
  text: string | null;
}

export interface MenuTable {
  spec: MenuTableSpec;
  /** file offset of the pointer table's terminating 0xFFFF */
  addrOfFFFF: number;
  entries: MenuEntry[];
}

/** Parse a menu table's pointer table + entries. Returns null if no
 *  terminator is found within the region (malformed). */
export function parseMenuTable(rom: Uint8Array, spec: MenuTableSpec): MenuTable | null {
  const pointers: number[] = [];
  let i = 0;
  while (spec.start + i + 1 < spec.end) {
    const v = rom[spec.start + i] | (rom[spec.start + i + 1] << 8);
    if (v === NAMES_END_CODE) break;
    pointers.push(v);
    i += 2;
  }
  if (spec.start + i + 1 >= spec.end) return null; // no terminator found
  const addrOfFFFF = spec.start + i;

  const entries: MenuEntry[] = [];
  for (let n = 0; n < pointers.length; n++) {
    const offset = addrOfFFFF + pointers[n];
    const res = decodeNamesString(rom, offset, spec.end);
    entries.push({ index: n, pointer: pointers[n], offset, text: res ? res.text : null });
  }
  return { spec, addrOfFFFF, entries };
}

export interface MenuRebuildResult {
  bytes: Uint8Array; // length === spec.end - spec.start
  start: number;
}
export interface MenuRebuildError {
  error: string;
  overflowBy?: number;
}

/**
 * Repack a menu table after edits. `editedText` maps entry index to new text;
 * every other entry (including ones with no decoded text — the naming-screen
 * symbol rows) is copied byte-for-byte from its original position in `rom`,
 * never re-encoded, so undecodable content survives unchanged. Fails
 * (without mutating the ROM) if the repacked result would overflow the
 * table's region.
 */
export function rebuildMenuTable(
  rom: Uint8Array,
  table: MenuTable,
  editedText: Map<number, string>
): MenuRebuildResult | MenuRebuildError {
  const { spec, entries } = table;
  const regionSize = spec.end - spec.start;

  // Each entry's raw byte span in the ORIGINAL rom (for verbatim copy and for
  // measuring gaps below), bounded by its own 0xFFFF terminator — we don't
  // know each entry's exact original length without decoding, so scan for it
  // directly from raw bytes (works even when decodeNamesString returned
  // null, since it stops at the same terminator code before ever hitting an
  // unmapped one — the unmapped code doesn't change where the terminator is).
  function rawSpan(offset: number): { bytes: Uint8Array; end: number } {
    let a = offset;
    while (a + 1 < spec.end) {
      const v = rom[a] | (rom[a + 1] << 8);
      if (v === NAMES_END_CODE) break;
      a += 2;
    }
    return { bytes: rom.slice(offset, a), end: a }; // bytes excludes terminator
  }

  const packedChunks: Uint8Array[] = [];
  // Gap of raw, unaccounted bytes between one entry's terminator and the
  // NEXT entry's data start (index n = gap after entry n). Real tables
  // aren't always packed with zero slack — menus2 has a 60-byte gap between
  // two entries near its end, likely leftover/unused space, not decodable
  // text. For the LAST entry, "next start" is the table's own declared end
  // (spec.end) — menus1's real entries stop ~2.3KB before its declared end,
  // and that trailing space is NOT blank padding, it's unrelated live ROM
  // data (previously silently overwritten with 0xFF fill, corrupting it).
  // Every gap is preserved verbatim (never re-derived, never assumed blank)
  // so a no-op rebuild matches the original exactly and nothing outside the
  // edited entries' own bytes is ever touched.
  const gapsAfter: Uint8Array[] = [];
  for (let n = 0; n < entries.length; n++) {
    const entry = entries[n];
    const origEnd = rawSpan(entry.offset).end; // original content end, regardless of edits
    if (editedText.has(entry.index)) {
      let codes: number[];
      try {
        codes = encodeNamesString(editedText.get(entry.index)!);
      } catch (e) {
        return { error: `عنصر ${entry.index}: ${(e as Error).message}` };
      }
      const bytes = new Uint8Array(codes.length * 2);
      for (let k = 0; k < codes.length; k++) {
        bytes[k * 2] = codes[k] & 0xff;
        bytes[k * 2 + 1] = (codes[k] >>> 8) & 0xff;
      }
      packedChunks.push(bytes);
    } else {
      packedChunks.push(rom.slice(entry.offset, origEnd));
    }
    const nextStart = n + 1 < entries.length ? entries[n + 1].offset : spec.end;
    gapsAfter.push(rom.slice(origEnd + 2, nextStart));
  }

  const ptrTableBytes = entries.length * 2 + 2; // + 0xFFFF terminator
  const addrOfFFFFrel = entries.length * 2;

  // Same kind of gap as above, but before entry 0's data (both menus1 and
  // menus2 have one — 4 and 2 bytes respectively — same small unidentified
  // header m3-names-table.ts's fixed-stride tables have).
  const leadingGap = entries.length > 0 ? rom.slice(table.addrOfFFFF + 2, entries[0].offset) : new Uint8Array(0);

  const dataBytesTotal = packedChunks.reduce((s, c, i) => s + c.length + 2 + gapsAfter[i].length, 0); // + terminator + trailing gap each
  const packedSize = ptrTableBytes + leadingGap.length + dataBytesTotal;
  if (packedSize > regionSize) {
    return {
      error: `جدول ${spec.label} أكبر من مساحته الأصلية بعد التعديل`,
      overflowBy: packedSize - regionSize,
    };
  }

  const out = new Uint8Array(regionSize).fill(0xff);
  out[addrOfFFFFrel] = 0xff;
  out[addrOfFFFFrel + 1] = 0xff;
  out.set(leadingGap, ptrTableBytes);

  let cursor = ptrTableBytes + leadingGap.length;
  for (let n = 0; n < entries.length; n++) {
    const pointer = cursor - addrOfFFFFrel;
    out[n * 2] = pointer & 0xff;
    out[n * 2 + 1] = (pointer >>> 8) & 0xff;
    out.set(packedChunks[n], cursor);
    cursor += packedChunks[n].length;
    out[cursor] = 0xff;
    out[cursor + 1] = 0xff;
    cursor += 2;
    out.set(gapsAfter[n], cursor);
    cursor += gapsAfter[n].length;
  }

  return { bytes: out, start: spec.start };
}

/** Apply a rebuilt table into a copy of the ROM and return the new ROM bytes. */
export function applyMenuRebuild(rom: Uint8Array, result: MenuRebuildResult): Uint8Array {
  const copy = new Uint8Array(rom);
  copy.set(result.bytes, result.start);
  return copy;
}
