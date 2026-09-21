/**
 * Reading Inazuma Eleven's text out of the cartridge, and putting it back.
 *
 * The European ROM (`YEEP`) ships one language, so there is no other build to
 * keep in step: everything under `en/` is the text the player sees.
 *
 * Five sources are handled, and they are the ones whose layout is proven
 * rather than inferred:
 *
 *   script/en/evet   PackNum archive, 1,737 entries -- the dialogue
 *   script/en/mcht   PackNum archive, 269 entries -- match commentary
 *   logic/en/unitbase.STR   2,400 slots of exactly 128 bytes, 2,063 used,
 *                           every one NUL-terminated with nothing after it
 *   logic/en/item.STR      item descriptions, 32-byte-aligned slots
 *   logic/en/command.STR   special-move names, 32-byte-aligned slots
 *
 * item.STR and command.STR looked pointer-addressed at first -- a same-named
 * `.dat` sits beside each -- but no byte-offset field in either `.dat`
 * matches a real string start, at any record size or stride tried. What
 * both files actually hold, confirmed by scanning every non-NUL run: every
 * string starts on a 32-byte boundary, and a description longer than one
 * slot spills into the following empty slot(s) rather than being cut off,
 * the same shape `unitbase.STR`'s fixed 128-byte slots take at a smaller
 * grain. That is a plain sequential table, not a pointer table, so nothing
 * about `.dat` needs to be reversed to read or write it correctly.
 *
 * A slot is only ever written in place, never moved or resized -- for
 * unitbase.STR because its capacity (128 bytes) never changes, and for
 * item.STR/command.STR because a translation is capped at the exact gap to
 * the next real entry and refused rather than allowed to spill further.
 * Nothing here ever needs to know what a byte offset means to the game's own
 * code, only that it never moves.
 */
import { findNdsFile, writeNdsFile, type NdsFile } from "@/lib/nds/nds-rom";
import { INAZUMA_TEXT_KIND, readPack, writePack, type InazumaPack } from "./inazuma-pack";

const PACKS = [
  { source: "evet", pkh: "data_iz/script/en/evet.pkh", pkb: "data_iz/script/en/evet.pkb" },
  { source: "mcht", pkh: "data_iz/script/en/mcht.pkh", pkb: "data_iz/script/en/mcht.pkb" },
] as const;

const UNITBASE = { source: "unitbase", path: "data_iz/logic/en/unitbase.STR", slot: 128 } as const;

/** A 32-byte-aligned sequential table: see the module doc for why this is safe without the companion `.dat`. */
interface OverflowTable {
  source: string;
  path: string;
  slot: number;
}
const ITEM: OverflowTable = { source: "item", path: "data_iz/logic/en/item.STR", slot: 32 };
const COMMAND: OverflowTable = { source: "command", path: "data_iz/logic/en/command.STR", slot: 32 };
const OVERFLOW_TABLES = [ITEM, COMMAND];

export interface InazumaTextRow {
  /** Which file it came from: "evet", "mcht" or "unitbase". */
  source: string;
  /** The pack entry's id, or the slot number in a fixed table. */
  entry: number;
  /** The record's key inside the entry; -1 for a fixed slot, which has none. */
  key: number;
  text: string;
  /** For a fixed slot, the bytes available including the NUL that ends it. */
  limit?: number;
}

function rowId(row: { source: string; entry: number; key: number }): string {
  return `${row.source}:${row.entry}:${row.key}`;
}

function bytesOf(rom: Uint8Array, file: NdsFile): Uint8Array {
  return rom.subarray(file.start, file.end);
}

function requireFile(rom: Uint8Array, path: string): NdsFile {
  const file = findNdsFile(rom, path);
  if (!file) throw new Error(`الروم لا يحتوي على ${path} — هل هذه نسخة Inazuma Eleven الأوروبية؟`);
  return file;
}

function readSlots(rom: Uint8Array, rows: InazumaTextRow[]): void {
  const file = requireFile(rom, UNITBASE.path);
  const data = bytesOf(rom, file);
  for (let slot = 0; slot * UNITBASE.slot < data.length; slot++) {
    const at = slot * UNITBASE.slot;
    let stop = at;
    while (stop < at + UNITBASE.slot && data[stop] !== 0) stop++;
    if (stop === at) continue;
    let text = "";
    for (let i = at; i < stop; i++) text += String.fromCharCode(data[i]);
    rows.push({ source: UNITBASE.source, entry: slot, key: -1, text, limit: UNITBASE.slot });
  }
}

/**
 * Every real entry in an overflow table, keyed by its own byte offset --
 * which doubles as its stable row id, since an entry is never moved.
 *
 * A slot that starts with NUL is empty and skipped one slot at a time,
 * matching how `unitbase.STR` treats an empty 128-byte slot; a slot that
 * doesn't is read to its own NUL, however far past one slot width that
 * reaches, and the entry after it starts at the next slot boundary at or
 * past that NUL -- never inside the text just read.
 */
function overflowEntries(data: Uint8Array, slot: number): Map<number, string> {
  const entries = new Map<number, string>();
  let pos = 0;
  while (pos < data.length) {
    if (data[pos] === 0) {
      pos += slot;
      continue;
    }
    let stop = pos;
    while (stop < data.length && data[stop] !== 0) stop++;
    let text = "";
    for (let i = pos; i < stop; i++) text += String.fromCharCode(data[i]);
    entries.set(pos, text);
    const next = Math.ceil(stop / slot) * slot;
    pos = next > pos ? next : pos + slot;
  }
  return entries;
}

function readOverflowTable(rom: Uint8Array, table: OverflowTable, rows: InazumaTextRow[]): void {
  const data = bytesOf(rom, requireFile(rom, table.path));
  const capacities = overflowCapacities(data, table.slot);
  for (const [offset, text] of overflowEntries(data, table.slot)) {
    rows.push({ source: table.source, entry: offset, key: -1, text, limit: capacities.get(offset) });
  }
}

/** Every entry's own capacity: the gap to the next real entry, or to the file's end for the last one. */
function overflowCapacities(data: Uint8Array, slot: number): Map<number, number> {
  const offsets = [...overflowEntries(data, slot).keys()].sort((a, b) => a - b);
  const capacities = new Map<number, number>();
  for (let i = 0; i < offsets.length; i++) {
    const end = i + 1 < offsets.length ? offsets[i + 1] : data.length;
    capacities.set(offsets[i], end - offsets[i]);
  }
  return capacities;
}

function writeOverflowTable(
  rom: Uint8Array,
  table: OverflowTable,
  wanted: Map<string, string>,
  seen: Set<string>,
  warnings: string[],
): { rom: Uint8Array; changed: number } {
  const file = requireFile(rom, table.path);
  const data = bytesOf(rom, file).slice();
  const current = overflowEntries(data, table.slot);
  const capacities = overflowCapacities(data, table.slot);
  let changed = 0;
  for (const [offset, capacity] of capacities) {
    const id = rowId({ source: table.source, entry: offset, key: -1 });
    const text = wanted.get(id);
    if (text === undefined) continue;
    seen.add(id);
    if (text === current.get(offset)) continue;
    if (text.length + 1 > capacity) {
      warnings.push(`النصّ في ${table.source}:${offset} يتّسع لـ ${capacity - 1} بايت والترجمة ${text.length} — تُركت كما هي.`);
      continue;
    }
    data.fill(0, offset, offset + capacity);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code > 0xff) throw new Error(`الحرف "${text[i]}" خارج نطاق بايت واحد — النصّ العربي يحتاج جدول ترميز اللعبة.`);
      data[offset + i] = code;
    }
    changed++;
  }
  return { rom: changed > 0 ? writeNdsFile(rom, file, data) : rom, changed };
}

/** Every translatable line in the ROM, in the order the files lay them out. */
export function readInazumaText(rom: Uint8Array): InazumaTextRow[] {
  const rows: InazumaTextRow[] = [];
  for (const pack of PACKS) {
    const parsed = readPack(bytesOf(rom, requireFile(rom, pack.pkh)), bytesOf(rom, requireFile(rom, pack.pkb)));
    for (const entry of parsed.entries) {
      for (const string of entry.strings) {
        // Kind 2 and above are sound and script names like "J10.SAD"; they are
        // read by the engine, not by the player, and translating one breaks the
        // lookup it feeds.
        if (string.kind !== INAZUMA_TEXT_KIND) continue;
        rows.push({ source: pack.source, entry: entry.id, key: string.key, text: string.text });
      }
    }
  }
  readSlots(rom, rows);
  for (const table of OVERFLOW_TABLES) readOverflowTable(rom, table, rows);
  return rows;
}

/**
 * A copy of the ROM carrying `rows` in place of the text it had.
 *
 * Rows the ROM does not know are reported rather than silently dropped, and a
 * fixed-slot line that no longer fits is left as it was -- the alternative is a
 * description that runs into the next one.
 */
export function writeInazumaText(
  rom: Uint8Array,
  rows: InazumaTextRow[],
): { rom: Uint8Array; changed: number; warnings: string[] } {
  const wanted = new Map(rows.map((row) => [rowId(row), row.text]));
  const seen = new Set<string>();
  const warnings: string[] = [];
  let changed = 0;
  let out = rom;

  for (const pack of PACKS) {
    const pkhFile = requireFile(out, pack.pkh);
    const pkbFile = requireFile(out, pack.pkb);
    const parsed: InazumaPack = readPack(bytesOf(out, pkhFile), bytesOf(out, pkbFile));
    let touched = false;
    for (const entry of parsed.entries) {
      for (const string of entry.strings) {
        if (string.kind !== INAZUMA_TEXT_KIND) continue;
        const id = rowId({ source: pack.source, entry: entry.id, key: string.key });
        seen.add(id);
        const text = wanted.get(id);
        if (text === undefined || text === string.text) continue;
        string.text = text;
        touched = true;
        changed++;
      }
    }
    if (!touched) continue;
    const built = writePack(parsed);
    if (built.grew) {
      warnings.push(`نمت أكبر كتلة مضغوطة في ${pack.source} عن حجمها الأصلي — راقب ثبات اللعبة عند فتح هذه النصوص.`);
    }
    // The .pkb moves first: writing the .pkh afterwards reads a ROM whose file
    // table already describes the body that goes with it.
    out = writeNdsFile(out, pkbFile, built.pkb);
    out = writeNdsFile(out, requireFile(out, pack.pkh), built.pkh);
  }

  const slotFile = requireFile(out, UNITBASE.path);
  const slots = bytesOf(out, slotFile).slice();
  let slotsTouched = false;
  for (let slot = 0; slot * UNITBASE.slot < slots.length; slot++) {
    const id = rowId({ source: UNITBASE.source, entry: slot, key: -1 });
    const text = wanted.get(id);
    if (text === undefined) continue;
    seen.add(id);
    const at = slot * UNITBASE.slot;
    let stop = at;
    while (stop < at + UNITBASE.slot && slots[stop] !== 0) stop++;
    let current = "";
    for (let i = at; i < stop; i++) current += String.fromCharCode(slots[i]);
    if (current === text) continue;
    if (text.length + 1 > UNITBASE.slot) {
      warnings.push(`الخانة ${slot} في unitbase.STR تتّسع لـ ${UNITBASE.slot - 1} بايت والنصّ ${text.length} — تُركت كما هي.`);
      continue;
    }
    slots.fill(0, at, at + UNITBASE.slot);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code > 0xff) throw new Error(`الحرف "${text[i]}" خارج نطاق بايت واحد — النصّ العربي يحتاج جدول ترميز اللعبة.`);
      slots[at + i] = code;
    }
    slotsTouched = true;
    changed++;
  }
  if (slotsTouched) out = writeNdsFile(out, slotFile, slots);

  for (const table of OVERFLOW_TABLES) {
    const result = writeOverflowTable(out, table, wanted, seen, warnings);
    out = result.rom;
    changed += result.changed;
  }

  for (const row of rows) {
    if (!seen.has(rowId(row))) warnings.push(`لا يوجد نصّ بهذا المعرّف في الروم: ${rowId(row)}`);
  }
  return { rom: out, changed, warnings };
}
