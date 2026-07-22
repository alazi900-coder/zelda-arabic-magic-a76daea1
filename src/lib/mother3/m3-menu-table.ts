/**
 * Reader/rebuilder for Mother 3's variable-length "menu" text tables (menus1
 * confirmed; menus2/menus3 not yet verified but structurally identical per
 * the toolkit's own m3hack.asm layout, so likely share this format).
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

export const MENU_TABLES: MenuTableSpec[] = [MENUS1_TABLE];

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

  // Each entry's raw byte span in the ORIGINAL rom (for verbatim copy),
  // bounded by the next entry's start or addrOfFFFF+overall data end — we
  // don't know each entry's exact original length without decoding, so scan
  // for its own 0xFFFF terminator directly from raw bytes (works even when
  // decodeNamesString returned null, since it stops at the same terminator
  // code before ever hitting an unmapped one — the unmapped code doesn't
  // change where the terminator is).
  function rawSpan(offset: number): { bytes: Uint8Array } {
    let a = offset;
    while (a + 1 < spec.end) {
      const v = rom[a] | (rom[a + 1] << 8);
      if (v === NAMES_END_CODE) break;
      a += 2;
    }
    return { bytes: rom.slice(offset, a) }; // excludes terminator
  }

  const packedChunks: Uint8Array[] = [];
  for (const entry of entries) {
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
      packedChunks.push(rawSpan(entry.offset).bytes);
    }
  }

  const ptrTableBytes = entries.length * 2 + 2; // + 0xFFFF terminator
  const dataBytesTotal = packedChunks.reduce((s, c) => s + c.length + 2, 0); // + terminator each
  const packedSize = ptrTableBytes + dataBytesTotal;
  if (packedSize > regionSize) {
    return {
      error: `جدول ${spec.label} أكبر من مساحته الأصلية بعد التعديل`,
      overflowBy: packedSize - regionSize,
    };
  }

  const out = new Uint8Array(regionSize).fill(0xff);
  const addrOfFFFFrel = entries.length * 2;
  out[addrOfFFFFrel] = 0xff;
  out[addrOfFFFFrel + 1] = 0xff;

  let cursor = ptrTableBytes;
  for (let n = 0; n < entries.length; n++) {
    const pointer = cursor - addrOfFFFFrel;
    out[n * 2] = pointer & 0xff;
    out[n * 2 + 1] = (pointer >>> 8) & 0xff;
    out.set(packedChunks[n], cursor);
    cursor += packedChunks[n].length;
    out[cursor] = 0xff;
    out[cursor + 1] = 0xff;
    cursor += 2;
  }

  return { bytes: out, start: spec.start };
}

/** Apply a rebuilt table into a copy of the ROM and return the new ROM bytes. */
export function applyMenuRebuild(rom: Uint8Array, result: MenuRebuildResult): Uint8Array {
  const copy = new Uint8Array(rom);
  copy.set(result.bytes, result.start);
  return copy;
}
