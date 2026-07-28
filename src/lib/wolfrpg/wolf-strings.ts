/**
 * Wolfenstein RPG string table — read and write.
 *
 * No official spec exists; this is what taking the shipped files apart and
 * putting them back together byte-for-byte established:
 *
 *   strings.idx    76 records of 5 bytes, then 2 trailing bytes.
 *                  record = [u16 flags][u8 bank][u16 LE offset]
 *                  `flags` is 0x0044 on the first record and 0 on the rest.
 *                  bank 0x00..0x07 selects a strings<NN>.bin; bank 0xFF closes
 *                  that bank's block and carries the file's total size in
 *                  `offset`. Offsets inside a block are section starts.
 *
 *   strings<NN>.bin
 *                  NUL-terminated strings, back to back, one byte per
 *                  character. `|` is an explicit line break and words arrive
 *                  pre-hyphenated ("Cat-a-combs") because the screen is narrow.
 *
 * Only banks 0 and 1 ship in the iOS build; blocks 2..7 point at files for
 * other languages that are not present and are carried through untouched.
 *
 * Two constraints a translation can break, both enforced here:
 *   - offsets are u16, so a bank may never exceed 65535 bytes;
 *   - every section offset must land on a string start, or the game reads
 *     from the middle of a string.
 *
 * Strings are exposed as JavaScript strings in latin1 (one char per byte).
 * That is lossless for this format and lets the editor treat them as text —
 * the Arabic goes in as byte codes chosen by wolf-charmap.ts, not as Unicode.
 */

const REC_SIZE = 5;
const BANK_TERMINATOR = 0xff;
const MAX_BANK_BYTES = 0xffff;

export interface WolfIdxRecord {
  flags: number;
  bank: number;
  offset: number;
}

export interface WolfStringTable {
  /** The index exactly as read; offsets are recomputed on build. */
  records: WolfIdxRecord[];
  /** Bytes after the last whole record — 2 in the shipped file. */
  tail: Uint8Array;
  /** bank number -> sections -> strings. Only banks whose .bin was supplied. */
  banks: Map<number, string[][]>;
}

function bytesToLatin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function latin1ToBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/** Splits one bank into its NUL-terminated strings. The bank ends with a NUL,
 *  so the trailing empty piece is a terminator, not a string. */
function splitBank(bytes: Uint8Array): { strings: string[]; starts: number[] } {
  const strings: string[] = [];
  const starts: number[] = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) continue;
    starts.push(start);
    strings.push(bytesToLatin1(bytes.subarray(start, i)));
    start = i + 1;
  }
  if (start !== bytes.length) {
    throw new Error(`bank does not end with a NUL (${bytes.length - start} trailing bytes)`);
  }
  return { strings, starts };
}

export function parseWolfStrings(idx: Uint8Array, banks: Map<number, Uint8Array>): WolfStringTable {
  const count = Math.floor(idx.length / REC_SIZE);
  const records: WolfIdxRecord[] = [];
  for (let i = 0; i < count; i++) {
    const o = i * REC_SIZE;
    records.push({
      flags: idx[o] | (idx[o + 1] << 8),
      bank: idx[o + 2],
      offset: idx[o + 3] | (idx[o + 4] << 8),
    });
  }
  const tail = idx.subarray(count * REC_SIZE);

  const parsed = new Map<number, string[][]>();
  for (const [bank, bytes] of banks) {
    const { strings, starts } = splitBank(bytes);
    // Section boundaries come from the index; the declared end-of-bank size
    // must agree with the file or our reading of the index is wrong.
    const offsets = records.filter((r) => r.bank === bank).map((r) => r.offset);
    const end = records.find((r, i) => r.bank === BANK_TERMINATOR && records[i - 1]?.bank === bank);
    if (end && end.offset !== bytes.length) {
      throw new Error(`bank ${bank}: index declares ${end.offset} bytes, file has ${bytes.length}`);
    }
    for (const off of offsets) {
      if (off !== 0 && !starts.includes(off)) {
        throw new Error(`bank ${bank}: section offset ${off} lands mid-string`);
      }
    }
    const sections: string[][] = [];
    for (let s = 0; s < offsets.length; s++) {
      const from = starts.indexOf(offsets[s]);
      const to = s + 1 < offsets.length ? starts.indexOf(offsets[s + 1]) : strings.length;
      sections.push(strings.slice(from, to));
    }
    parsed.set(bank, sections);
  }
  return { records, tail, banks: parsed };
}

export function buildWolfStrings(table: WolfStringTable): { idx: Uint8Array; banks: Map<number, Uint8Array> } {
  const outBanks = new Map<number, Uint8Array>();
  // bank -> the offset each of its sections now starts at
  const newOffsets = new Map<number, number[]>();

  for (const [bank, sections] of table.banks) {
    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let cursor = 0;
    for (const section of sections) {
      offsets.push(cursor);
      for (const s of section) {
        const bytes = latin1ToBytes(s);
        chunks.push(bytes, new Uint8Array([0]));
        cursor += bytes.length + 1;
      }
    }
    if (cursor > MAX_BANK_BYTES) {
      throw new Error(
        `bank ${bank} would be ${cursor} bytes; the index stores offsets as u16, so it cannot exceed ${MAX_BANK_BYTES}`
      );
    }
    const merged = new Uint8Array(cursor);
    let at = 0;
    for (const c of chunks) {
      merged.set(c, at);
      at += c.length;
    }
    outBanks.set(bank, merged);
    newOffsets.set(bank, offsets);
  }

  const idx = new Uint8Array(table.records.length * REC_SIZE + table.tail.length);
  const cursors = new Map<number, number>();
  let lastBank = -1;
  table.records.forEach((r, i) => {
    let offset = r.offset;
    if (r.bank === BANK_TERMINATOR) {
      // Closes the previous bank's block and carries its total size.
      const bytes = outBanks.get(lastBank);
      if (bytes) offset = bytes.length;
    } else if (newOffsets.has(r.bank)) {
      const n = cursors.get(r.bank) ?? 0;
      const list = newOffsets.get(r.bank)!;
      if (n >= list.length) throw new Error(`bank ${r.bank}: more index records than sections`);
      offset = list[n];
      cursors.set(r.bank, n + 1);
      lastBank = r.bank;
    } else {
      lastBank = r.bank;
    }
    const o = i * REC_SIZE;
    idx[o] = r.flags & 0xff;
    idx[o + 1] = (r.flags >> 8) & 0xff;
    idx[o + 2] = r.bank;
    idx[o + 3] = offset & 0xff;
    idx[o + 4] = (offset >> 8) & 0xff;
  });
  idx.set(table.tail, table.records.length * REC_SIZE);
  return { idx, banks: outBanks };
}

/** Flat view for the editor: one entry per string, addressed by bank/section/index. */
export interface WolfEntry {
  bank: number;
  section: number;
  index: number;
  text: string;
}

export function listWolfEntries(table: WolfStringTable): WolfEntry[] {
  const out: WolfEntry[] = [];
  for (const [bank, sections] of table.banks) {
    sections.forEach((section, s) =>
      section.forEach((text, i) => out.push({ bank, section: s, index: i, text }))
    );
  }
  return out;
}

export function applyWolfEntries(table: WolfStringTable, entries: WolfEntry[]): WolfStringTable {
  const banks = new Map<number, string[][]>();
  for (const [bank, sections] of table.banks) banks.set(bank, sections.map((s) => [...s]));
  for (const e of entries) {
    const sections = banks.get(e.bank);
    if (!sections?.[e.section] || e.index >= sections[e.section].length) {
      throw new Error(`no string at bank ${e.bank}, section ${e.section}, index ${e.index}`);
    }
    sections[e.section][e.index] = e.text;
  }
  return { ...table, banks };
}
