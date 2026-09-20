/**
 * Reading Inazuma Eleven's text out of the cartridge, and putting it back.
 *
 * The European ROM (`YEEP`) ships one language, so there is no other build to
 * keep in step: everything under `en/` is the text the player sees.
 *
 * Three sources are handled, and they are the ones whose layout is proven
 * rather than inferred:
 *
 *   script/en/evet   PackNum archive, 1,737 entries -- the dialogue
 *   script/en/mcht   PackNum archive, 269 entries -- menus and system lines
 *   logic/en/unitbase.STR   2,400 slots of exactly 128 bytes, 2,063 used,
 *                           every one NUL-terminated with nothing after it
 *
 * Deliberately not handled yet: `item.STR`, `command.STR`, `games.STR` and the
 * `.dat` name tables. Those strings sit at offsets a companion `.dat` points
 * at, and that pointer layout is not reversed -- writing into them on a guess
 * would shuffle the item list rather than translate it.
 *
 * A fixed slot is only ever written in place, never moved or resized. That
 * keeps the file valid whether the game addresses a description by slot number
 * or by byte offset, which is the question this module does not have to answer.
 */
import { findNdsFile, writeNdsFile, type NdsFile } from "@/lib/nds/nds-rom";
import { INAZUMA_TEXT_KIND, readPack, writePack, type InazumaPack } from "./inazuma-pack";

const PACKS = [
  { source: "evet", pkh: "data_iz/script/en/evet.pkh", pkb: "data_iz/script/en/evet.pkb" },
  { source: "mcht", pkh: "data_iz/script/en/mcht.pkh", pkb: "data_iz/script/en/mcht.pkb" },
] as const;

const UNITBASE = { source: "unitbase", path: "data_iz/logic/en/unitbase.STR", slot: 128 } as const;

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

  for (const row of rows) {
    if (!seen.has(rowId(row))) warnings.push(`لا يوجد نصّ بهذا المعرّف في الروم: ${rowId(row)}`);
  }
  return { rom: out, changed, warnings };
}
