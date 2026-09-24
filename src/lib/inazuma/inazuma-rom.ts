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
 *   movie/txt/en/*.dat     the cutscene videos' subtitles, 21 files
 *   logic/en/games.STR     the mini-games' instructions, 32-byte-aligned slots
 *   FIELD_TABLES           names and short texts, each in one fixed field of
 *                          a fixed-size record: players, items and moves, the
 *                          in-game blog, titles, schools, places, shouts
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
import { findNdsFile, ndsFileIdByPath, writeNdsFile, type NdsFile } from "@/lib/nds/nds-rom";
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
const GAMES: OverflowTable = { source: "games", path: "data_iz/logic/en/games.STR", slot: 32 };
const OVERFLOW_TABLES = [ITEM, COMMAND, GAMES];

/**
 * Text kept in one fixed field of every record of a fixed-size table; the
 * rest of the record is the game's data and is never touched. A translation
 * is written into its field, NUL-padded, or refused when it does not fit.
 *
 * Each field's size was measured on the cartridge, not guessed: past the
 * text, every record's field is zero up to where its data starts, apart from
 * a stray byte after the NUL in a few names (left over from the Japanese
 * ones, never read). Where that was not clear-cut the smaller size is used:
 * schinfo's names get 32 of the 39 bytes before its data, livetalk's shouts
 * 12 of 16.
 */
interface FieldTable {
  source: string;
  path: string;
  /** Bytes per record. */
  record: number;
  /** Where the text field starts in its record, and its size including the NUL. */
  field: number;
  size: number;
}
const FIELD_TABLES: FieldTable[] = [
  // 2,400 players, 96 bytes each: full name, short name (the one over the dialogue box), stats
  { source: "pname", path: "data_iz/logic/en/unitbase.dat", record: 96, field: 0, size: 32 },
  { source: "pshort", path: "data_iz/logic/en/unitbase.dat", record: 96, field: 32, size: 32 },
  // the same players in the scouting search, 56 bytes each: surname, full name, data
  { source: "skey", path: "data_iz/logic/en/usearch.dat", record: 56, field: 0, size: 16 },
  { source: "sname", path: "data_iz/logic/en/usearch.dat", record: 56, field: 16, size: 24 },
  // 1,024 items and special moves, 48 bytes each: name, data
  { source: "iname", path: "data_iz/logic/en/item.dat", record: 48, field: 0, size: 32 },
  // the blog: 108 posts of 584 bytes (id, title, body, order) and 94 replies of 264 (id, text)
  { source: "blogt", path: "data_iz/script/en/blogpost.dat", record: 584, field: 2, size: 64 },
  { source: "blogp", path: "data_iz/script/en/blogpost.dat", record: 584, field: 68, size: 514 },
  { source: "blogr", path: "data_iz/script/en/blogres.dat", record: 264, field: 4, size: 260 },
  { source: "rpgtitle", path: "data_iz/logic/en/rpgtitle.STR", record: 32, field: 0, size: 32 },
  { source: "teamtitle", path: "data_iz/logic/en/teamtitle.dat", record: 32, field: 0, size: 26 },
  { source: "school", path: "data_iz/logic/en/schinfo.dat", record: 48, field: 0, size: 32 },
  { source: "mapname", path: "data_iz/logic/en/gmapbase.dat", record: 32, field: 0, size: 32 },
  { source: "shout", path: "data_iz/logic/en/livetalk.dat", record: 16, field: 0, size: 12 },
];

/**
 * How a line break is stored: the two characters `\` `n` in the script
 * archives and the subtitles, the single byte 0x0A everywhere else -- the
 * descriptions, the blog and the mini-games are all laid out with it.
 */
export function inazumaNewline(source: string): string {
  return source === "evet" || source === "mcht" || source === "movie" ? "\\n" : "\n";
}

/**
 * The cutscene videos' subtitles are not in the video: each movie has a
 * small file of its own under movie/txt/en/, a run of records
 * {start frame u32, end frame u32, byte length u32, text} closed by
 * 0xFFFFFFFF. The length covers the text, its NUL and padding. Read back and
 * rebuilt unchanged, all 21 files come out byte for byte the same.
 */
const MOVIE_DIR = "data_iz/movie/txt/en/";

interface MovieRecord {
  /** The record exactly as stored, for writing an untranslated one back unchanged. */
  raw: Uint8Array;
  start: number;
  end: number;
  text: string;
}

function moviePaths(rom: Uint8Array): string[] {
  return [...ndsFileIdByPath(rom).keys()].filter((p) => p.startsWith(MOVIE_DIR) && p.endsWith(".dat")).sort();
}

function readMovieRecords(data: Uint8Array): { records: MovieRecord[]; tail: Uint8Array } {
  const view = new DataView(data.buffer, data.byteOffset, data.length);
  const records: MovieRecord[] = [];
  let at = 0;
  while (at + 12 <= data.length && view.getUint32(at, true) !== 0xffffffff) {
    const length = view.getUint32(at + 8, true);
    if (at + 12 + length > data.length) break;
    let text = "";
    for (let i = at + 12; i < at + 12 + length && data[i] !== 0; i++) text += String.fromCharCode(data[i]);
    records.push({ raw: data.subarray(at, at + 12 + length), start: view.getUint32(at, true), end: view.getUint32(at + 4, true), text });
    at += 12 + length;
  }
  return { records, tail: data.subarray(at) };
}

function movieRecordBytes(record: MovieRecord, text: string): Uint8Array {
  const length = Math.ceil((text.length + 1) / 4) * 4;
  const out = new Uint8Array(12 + length);
  const view = new DataView(out.buffer);
  view.setUint32(0, record.start, true);
  view.setUint32(4, record.end, true);
  view.setUint32(8, length, true);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff) throw new Error(`الحرف "${text[i]}" خارج نطاق بايت واحد — النصّ العربي يحتاج جدول ترميز اللعبة.`);
    out[12 + i] = code;
  }
  return out;
}

export interface InazumaTextRow {
  /** Which file it came from: "evet", "mcht", "unitbase", "item", "command", "games", "movie", or a FIELD_TABLES source. */
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

function fieldText(data: Uint8Array, at: number, size: number): string {
  let text = "";
  for (let i = at; i < at + size && data[i] !== 0; i++) text += String.fromCharCode(data[i]);
  return text;
}

function readFieldTable(rom: Uint8Array, table: FieldTable, rows: InazumaTextRow[]): void {
  const data = bytesOf(rom, requireFile(rom, table.path));
  for (let record = 0; (record + 1) * table.record <= data.length; record++) {
    const text = fieldText(data, record * table.record + table.field, table.size);
    // An empty field, or the question marks the search list shows for a player it has no name for.
    if (text === "" || /^\?+$/.test(text)) continue;
    rows.push({ source: table.source, entry: record, key: -1, text, limit: table.size });
  }
}

/** Writes each table's wanted fields into one copy of its file, shared by the tables that live in it. */
function writeFieldTables(
  rom: Uint8Array,
  wanted: Map<string, string>,
  seen: Set<string>,
  warnings: string[],
): { rom: Uint8Array; changed: number } {
  let out = rom;
  let changed = 0;
  for (const path of new Set(FIELD_TABLES.map((t) => t.path))) {
    const file = requireFile(out, path);
    const data = bytesOf(out, file).slice();
    let touched = false;
    for (const table of FIELD_TABLES.filter((t) => t.path === path)) {
      for (let record = 0; (record + 1) * table.record <= data.length; record++) {
        const id = rowId({ source: table.source, entry: record, key: -1 });
        const text = wanted.get(id);
        if (text === undefined) continue;
        seen.add(id);
        const at = record * table.record + table.field;
        if (text === fieldText(data, at, table.size)) continue;
        if (text.length + 1 > table.size) {
          warnings.push(`النصّ في ${table.source}:${record} يتّسع لـ ${table.size - 1} بايت والترجمة ${text.length} — تُركت كما هي.`);
          continue;
        }
        data.fill(0, at, at + table.size);
        for (let i = 0; i < text.length; i++) {
          const code = text.charCodeAt(i);
          if (code > 0xff) throw new Error(`الحرف "${text[i]}" خارج نطاق بايت واحد — النصّ العربي يحتاج جدول ترميز اللعبة.`);
          data[at + i] = code;
        }
        touched = true;
        changed++;
      }
    }
    if (touched) out = writeNdsFile(out, file, data);
  }
  return { rom: out, changed };
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
  for (const table of FIELD_TABLES) readFieldTable(rom, table, rows);
  moviePaths(rom).forEach((path, fileIndex) => {
    const { records } = readMovieRecords(bytesOf(rom, requireFile(rom, path)));
    records.forEach((record, key) => rows.push({ source: "movie", entry: fileIndex, key, text: record.text }));
  });
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

  const fields = writeFieldTables(out, wanted, seen, warnings);
  out = fields.rom;
  changed += fields.changed;

  for (const [fileIndex, path] of moviePaths(out).entries()) {
    const file = requireFile(out, path);
    const { records, tail } = readMovieRecords(bytesOf(out, file));
    let touched = false;
    const parts = records.map((record, key) => {
      const id = rowId({ source: "movie", entry: fileIndex, key });
      seen.add(id);
      const text = wanted.get(id);
      if (text === undefined || text === record.text) return record.raw;
      touched = true;
      changed++;
      return movieRecordBytes(record, text);
    });
    if (!touched) continue;
    const size = parts.reduce((n, p) => n + p.length, 0) + tail.length;
    const data = new Uint8Array(size);
    let at = 0;
    for (const part of [...parts, tail]) { data.set(part, at); at += part.length; }
    out = writeNdsFile(out, file, data);
  }

  for (const row of rows) {
    if (!seen.has(rowId(row))) warnings.push(`لا يوجد نصّ بهذا المعرّف في الروم: ${rowId(row)}`);
  }
  return { rom: out, changed, warnings };
}
